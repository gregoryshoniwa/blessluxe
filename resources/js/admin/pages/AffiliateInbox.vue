<script>
import { markRaw } from 'vue';
import { api } from '../../lib/api.js';
import { toast, confirmDialog } from '../../lib/dialog.js';
import { createConversation } from '../../lib/conversation.js';
import { subscribe, realtimeEnabled } from '../../lib/realtime.js';
import ChatThread from '../../components/ChatThread.vue';
import ChatShell from '../../components/ChatShell.vue';
import CallPanel from '../../components/CallPanel.vue';
import { Search, Package, Check, X, LoaderCircle, ExternalLink, MessageSquare } from 'lucide-vue-next';

/**
 * The admin half of the affiliate conversation.
 *
 * Stock requests appear inside the thread rather than in a separate queue, so a
 * decision is made and explained in the same place the question was asked.
 *
 * Laid out as a messenger (list beside conversation, full-screen on demand)
 * because this is a surface someone sits in to work through a queue, not a
 * report they glance at.
 *
 * Built for a long list:
 *   - the list is PAGED, and search/filter run on the server — the browser only
 *     ever holds what is on screen, so it can't search what it hasn't loaded
 *   - it stays current from ONE private feed (`admin.inbox`) carrying every
 *     thread's traffic, rather than a subscription per affiliate or a fast poll.
 *     An incoming message patches its row in place and floats it to the top;
 *     nothing is refetched.
 */
export default {
    name: 'AdminAffiliateInbox',
    components: { ChatThread, ChatShell, CallPanel, Search, Package, Check, X, LoaderCircle, ExternalLink, MessageSquare },
    data() {
        return {
            threads: [],
            page: 1,
            hasMoreThreads: false,
            loadingThreads: false,
            unreadTotal: 0,
            pendingRequests: 0,
            loading: true,
            search: '',
            filter: 'all',        // 'all' | 'unread'
            searchTimer: null,
            listPoller: null,
            quietListPolls: 0,
            feedOff: null,
            feedLive: false,

            chat: null,           // conversation controller for the open thread
            c: null,              // its reactive state
            affiliate: null,
            requests: [],
            opening: false,
            resolving: null,
            adminNote: '',
            // A scrolling chat nested inside a scrolling page is the worst of
            // both on a phone, so there it opens as its own screen — the way
            // every phone messenger does. Minimise is one tap away.
            fullscreen: window.matchMedia('(max-width: 639px)').matches,
        };
    },
    computed: {
        openRequests() { return this.requests.filter((x) => x.status === 'pending'); },
        status() {
            if (this.c?.typing) return 'typing…';
            if (this.c?.peerOnline) return 'online';
            return this.affiliate?.email || '';
        },
    },
    watch: {
        search() {
            // Debounced: this is a server query now, not an array filter.
            clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => this.fetchThreads(), 250);
        },
        filter() { this.fetchThreads(); },
        unreadTotal(n) {
            window.dispatchEvent(new CustomEvent('blessluxe:inbox-unread', { detail: n }));
        },
        // Deep links and the browser's back button both arrive here.
        '$route.params.id'(id) {
            if (id && id !== this.affiliate?.id) this.openThread({ id });
            if (!id && this.affiliate) this.closeThread(false);
        },
    },
    async mounted() {
        await this.fetchThreads();
        this.loading = false;
        if (this.$route.params.id) this.openThread({ id: this.$route.params.id });
        this.connectFeed();
        this.scheduleListPoll();
        document.addEventListener('visibilitychange', this.onAttention);
        // Two windows side by side never fire visibilitychange — focus does.
        window.addEventListener('focus', this.onAttention);
    },
    beforeUnmount() {
        this.chat?.destroy();
        this.feedOff?.();
        clearTimeout(this.searchTimer);
        clearTimeout(this.listPoller);
        document.removeEventListener('visibilitychange', this.onAttention);
        window.removeEventListener('focus', this.onAttention);
    },
    methods: {
        // ─── The list ──────────────────────────────────────────────────────

        listUrl(page) {
            const q = new URLSearchParams({ page: String(page) });
            if (this.search.trim()) q.set('q', this.search.trim());
            if (this.filter === 'unread') q.set('filter', 'unread');
            return `/api/admin/affiliate-inbox?${q}`;
        },

        /** Page one, replacing the list. `quiet` = a background refresh. */
        async fetchThreads(quiet = false) {
            if (!quiet) this.loadingThreads = true;
            try {
                const d = await api.get(this.listUrl(1));
                this.threads = d.threads;
                this.page = 1;
                this.hasMoreThreads = d.has_more;
                this.unreadTotal = d.unread_total;
                this.pendingRequests = d.pending_requests;
            } catch (e) {
                if (!quiet) toast(e.payload?.error || 'Could not load the inbox.', { tone: 'error' });
            } finally { this.loadingThreads = false; }
        },

        async moreThreads() {
            if (!this.hasMoreThreads || this.loadingThreads) return;
            this.loadingThreads = true;
            try {
                const d = await api.get(this.listUrl(this.page + 1));
                const known = new Set(this.threads.map((t) => t.id));
                this.threads = [...this.threads, ...d.threads.filter((t) => !known.has(t.id))];
                this.page += 1;
                this.hasMoreThreads = d.has_more;
            } catch { /* scrolling again retries */ }
            finally { this.loadingThreads = false; }
        },

        onListScroll(e) {
            const el = e.target;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) this.moreThreads();
        },

        /**
         * One subscription for the whole inbox. Every affiliate message is also
         * published here, so the list is live however many affiliates exist.
         */
        connectFeed() {
            if (!realtimeEnabled()) return;
            this.feedOff = subscribe('admin.inbox', {
                'message.sent': ({ message }) => {
                    this.feedLive = true;
                    this.patchThread(message);
                },
            }, { type: 'private' });
        },

        /** Apply one message to the list without refetching it. */
        patchThread(message) {
            const isOpen = this.affiliate?.id === message.affiliate_id;
            const row = this.threads.find((t) => t.id === message.affiliate_id);

            if (!row) {
                // A thread that isn't on this page — a first-ever message, or
                // one below the fold. Only page one of the unfiltered list can
                // be patched blind, so refetch (quietly) instead of guessing.
                if (message.sender === 'affiliate') this.unreadTotal += isOpen ? 0 : 1;
                if (!this.search.trim()) this.fetchThreads(true);
                return;
            }

            // Same fallbacks as the server's Messages::preview — a photo or a
            // product with no text must not read as an empty row.
            row.preview = (message.body || '').slice(0, 90)
                || (message.refs?.length ? `🏷 ${message.refs[0].title}` : '')
                || (message.attachments?.length ? (message.attachments.length > 1 ? `📷 ${message.attachments.length} photos` : '📷 Photo') : '');
            row.last_sender = message.sender;
            row.last_at = message.created_at;
            // The open thread is being read as it arrives, so it never badges.
            if (message.sender === 'affiliate' && !isOpen) {
                row.unread += 1;
                this.unreadTotal += 1;
            }
            // Most recent first.
            this.threads = [row, ...this.threads.filter((t) => t !== row)];
        },

        /**
         * Keeping the list current WITHOUT a socket — which is how this app runs
         * (polling-only), so this is the main path, not a safety net.
         *
         *   - watching the page:  every 8s, easing out to 30s while nothing changes
         *   - tab in background:  every 60s (badges still move, cheaply)
         *   - coming back to it:  refresh NOW. People switch to this tab precisely
         *     to see whether something arrived; making them wait out a timer is
         *     what made a new message look like it had no badge.
         *   - live feed connected: 2 min, it is only a backstop then.
         *
         * One refresh is 3 indexed queries, and only staff ever run it.
         */
        scheduleListPoll() {
            clearTimeout(this.listPoller);
            let wait;
            if (document.hidden) wait = 60000;
            else if (this.feedLive) wait = 120000;
            else wait = Math.min(30000, 8000 * 1.4 ** this.quietListPolls);
            this.listPoller = setTimeout(() => this.refreshList(), wait);
        },

        async refreshList() {
            clearTimeout(this.listPoller);
            try {
                const d = await api.get(this.listUrl(1));
                const before = this.listSignature();
                // On page one the server's answer IS the list, which also keeps
                // a search or the Unread filter honest (a thread that stopped
                // matching disappears). Deeper in, merge so the pages the admin
                // scrolled into aren't thrown away.
                if (this.page === 1) {
                    this.mergeThreads(d.threads, true);
                    this.hasMoreThreads = d.has_more;
                } else {
                    this.mergeThreads(d.threads);
                }
                this.unreadTotal = d.unread_total;
                this.pendingRequests = d.pending_requests;
                this.quietListPolls = this.listSignature() === before ? this.quietListPolls + 1 : 0;
            } catch { this.quietListPolls += 1; }
            this.scheduleListPoll();
        },

        onAttention() {
            if (document.hidden) { this.scheduleListPoll(); return; }
            this.quietListPolls = 0;
            this.refreshList();
        },

        /** Cheap "did anything change?" so the poll knows when to ease off. */
        listSignature() {
            return this.threads.slice(0, 30).map((t) => `${t.id}:${t.last_at}:${t.unread}`).join('|');
        },

        /**
         * Fold a fresh page one into whatever is loaded, rather than replacing
         * it — replacing would throw away pages the admin has scrolled into.
         */
        mergeThreads(fresh, replace = false) {
            const openId = this.affiliate?.id;
            const byId = new Map(replace ? [] : this.threads.map((t) => [t.id, t]));
            for (const t of fresh) {
                // The open thread is being read as it arrives; the server may
                // not have been told yet, so never flash a badge on it.
                if (t.id === openId && !document.hidden) t.unread = 0;
                byId.set(t.id, { ...(byId.get(t.id) || {}), ...t });
            }
            this.threads = [...byId.values()].sort((a, b) => new Date(b.last_at) - new Date(a.last_at));
        },

        // ─── The conversation ──────────────────────────────────────────────

        async openThread(t) {
            if (this.opening) return;
            this.opening = true;
            this.chat?.destroy();

            const chat = markRaw(createConversation({
                me: 'admin',
                url: `/api/admin/affiliates/${t.id}/messages`,
                readUrl: `/api/admin/affiliates/${t.id}/messages/read`,
            }));

            try {
                const d = await chat.open();
                this.chat = chat;
                this.c = chat.state;
                this.affiliate = d.affiliate;
                this.requests = d.requests || [];
                this.adminNote = '';
                chat.connect(`affiliate.${d.affiliate.id}`);
                // Whatever the open conversation hears — by poll or socket —
                // its row in the list hears too, so the preview never lags the
                // thread sitting right beside it.
                chat.onIncoming((m) => this.patchThread(m));

                // Opening read it — clear the badge locally rather than refetch.
                const row = this.threads.find((x) => x.id === d.affiliate.id);
                if (row) {
                    this.unreadTotal = Math.max(0, this.unreadTotal - row.unread);
                    row.unread = 0;
                }
                if (this.$route.params.id !== d.affiliate.id) {
                    this.$router.replace({ name: 'admin-affiliate-inbox', params: { id: d.affiliate.id } });
                }
            } catch (e) {
                chat.destroy();
                toast(e.payload?.error || 'Could not open that thread.', { tone: 'error' });
            } finally { this.opening = false; }
        },

        /** Mobile back: drop the selection so the list takes the screen again. */
        closeThread(navigate = true) {
            this.chat?.destroy();
            this.chat = null;
            this.c = null;
            this.affiliate = null;
            this.requests = [];
            if (navigate && this.$route.params.id) {
                this.$router.replace({ name: 'admin-affiliate-inbox', params: {} });
            }
        },

        /**
         * Where a referenced item opens for staff: the thing they can act on —
         * the product's editor, or the packs screen.
         */
        refUrl(ref) {
            return ref.type === 'pack' ? '/admin/packs' : `/admin/products/${ref.id}`;
        },

        async reply(payload) {
            try {
                const message = await this.chat.send(payload);
                this.patchThread(message);
            } catch (e) {
                toast(e.payload?.error || e.payload?.message || 'Could not send that.', { tone: 'error' });
            }
        },

        toastError(message) { toast(message, { tone: 'error' }); },

        async resolve(req, status) {
            const verb = status === 'accepted' ? 'Accept' : 'Decline';
            if (!await confirmDialog({
                title: `${verb} "${req.title}"?`,
                body: 'The affiliate is told in the thread, and gets a notification.',
                confirmLabel: verb,
                tone: status === 'declined' ? 'danger' : 'default',
            })) return;

            this.resolving = req.id;
            try {
                await api.put(`/api/admin/affiliate-requests/${req.id}`, {
                    status,
                    admin_note: this.adminNote || null,
                });
                await this.openThread({ id: this.affiliate.id });
                this.pendingRequests = Math.max(0, this.pendingRequests - 1);
                toast(`Request ${status}.`);
            } catch (e) {
                toast(e.payload?.error || 'Could not save that.', { tone: 'error' });
            } finally { this.resolving = null; }
        },

        initial(t) { return (t?.code || t?.email || '?').charAt(0).toUpperCase(); },

        fmt(iso) {
            if (!iso) return '';
            const d = new Date(iso);
            const today = new Date();
            // A list of timestamps is easier to scan when today shows a clock
            // and everything older shows a date.
            if (d.toDateString() === today.toDateString()) {
                return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            }
            return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        },
    },
};
</script>

<template>
    <div>
        <header class="flex items-start justify-between mb-6 flex-wrap gap-3">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">Partners</p>
                <h1 class="text-2xl font-semibold">
                    Affiliate inbox
                    <span v-if="unreadTotal" class="align-middle ml-2 text-xs bg-gold text-white px-2 py-0.5 rounded-full tabular-nums">
                        {{ unreadTotal }}
                    </span>
                </h1>
            </div>
            <span v-if="pendingRequests" class="text-xs tracking-widest uppercase bg-amber-100 text-amber-700 px-3 py-1.5">
                {{ pendingRequests }} request{{ pendingRequests === 1 ? '' : 's' }} waiting
            </span>
        </header>

        <div v-if="loading" class="text-zinc-400 text-sm">Loading…</div>

        <ChatShell
            v-else
            v-model:fullscreen="fullscreen"
            title="Conversations"
            tone="admin"
            has-sidebar
            :has-selection="Boolean(affiliate)"
            height="calc(100vh - 13rem)"
            @back="closeThread()"
        >
            <!-- ─── Conversation list ──────────────────────────────── -->
            <template #sidebar>
                <div class="p-2.5 border-b border-zinc-200 flex-shrink-0 space-y-2">
                    <div class="relative">
                        <Search class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                        <input
                            v-model="search"
                            placeholder="Search by code, name or email"
                            class="w-full border border-zinc-200 rounded-full pl-9 pr-8 py-2 text-sm focus:outline-none focus:border-gold transition-colors"
                        />
                        <button v-if="search" @click="search = ''" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700" aria-label="Clear search">
                            <X class="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div class="flex gap-1.5">
                        <button
                            v-for="f in [{ key: 'all', label: 'All' }, { key: 'unread', label: 'Unread' }]"
                            :key="f.key"
                            @click="filter = f.key"
                            :class="[
                                'px-3 py-1 rounded-full text-[11px] transition-colors',
                                filter === f.key ? 'bg-gold text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
                            ]"
                        >
                            {{ f.label }}
                            <span v-if="f.key === 'unread' && unreadTotal" class="tabular-nums">· {{ unreadTotal }}</span>
                        </button>
                    </div>
                </div>

                <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain" @scroll.passive="onListScroll">
                    <p v-if="!threads.length && !loadingThreads" class="p-8 text-center text-zinc-400 text-sm">
                        {{ search || filter === 'unread' ? 'Nothing matches that.' : 'No conversations yet.' }}
                    </p>

                    <button
                        v-for="t in threads"
                        :key="t.id"
                        @click="openThread(t)"
                        :class="[
                            'w-full text-left px-3 py-3 border-b border-zinc-100 transition-colors flex items-center gap-3',
                            affiliate?.id === t.id ? 'bg-gold/10' : 'hover:bg-zinc-50',
                        ]"
                    >
                        <span class="w-10 h-10 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center text-sm font-medium flex-shrink-0">
                            {{ initial(t) }}
                        </span>
                        <span class="min-w-0 flex-1">
                            <span class="flex items-center gap-2">
                                <span :class="['font-mono text-xs flex-1 min-w-0 truncate', t.unread ? 'text-zinc-900 font-semibold' : 'text-gold-dark']">{{ t.code || t.email }}</span>
                                <span :class="['text-[10px] tracking-wider uppercase flex-shrink-0', t.unread ? 'text-gold-dark' : 'text-zinc-400']">{{ fmt(t.last_at) }}</span>
                            </span>
                            <span class="flex items-center gap-2 mt-0.5">
                                <span :class="['text-xs truncate flex-1 min-w-0', t.unread ? 'text-zinc-800' : 'text-zinc-500']">
                                    <span v-if="t.last_sender === 'admin'" class="text-zinc-400">You: </span>{{ t.preview }}
                                </span>
                                <span
                                    v-if="t.unread"
                                    class="text-[10px] bg-gold text-white min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center flex-shrink-0 tabular-nums"
                                >{{ t.unread > 99 ? '99+' : t.unread }}</span>
                            </span>
                        </span>
                    </button>

                    <p v-if="loadingThreads" class="p-4 text-center text-zinc-400 text-xs inline-flex items-center justify-center gap-2 w-full">
                        <LoaderCircle class="w-3 h-3 animate-spin" /> Loading
                    </p>
                </div>
            </template>

            <!-- ─── Conversation header ────────────────────────────── -->
            <template #thread-header>
                <template v-if="affiliate">
                    <span class="w-9 h-9 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center text-sm font-medium flex-shrink-0 relative">
                        {{ initial(affiliate) }}
                        <span v-if="c?.peerOnline" class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white"></span>
                    </span>
                    <div class="min-w-0">
                        <p class="font-mono text-sm text-gold-dark truncate">{{ affiliate.code }}</p>
                        <p :class="['text-[11px] truncate', c?.typing || c?.peerOnline ? 'text-emerald-600' : 'text-zinc-500']">{{ status }}</p>
                    </div>
                </template>
            </template>

            <template #actions>
                <template v-if="affiliate">
                    <!-- Keyed by thread: a call belongs to one conversation and
                         must not survive a switch to another. -->
                    <CallPanel
                        :key="affiliate.id"
                        :channel="`affiliate.${affiliate.id}`"
                        ice-url="/api/admin/rtc/ice"
                        :peer-name="affiliate.code"
                        @call-error="toastError"
                    />
                    <router-link
                        :to="`/admin/affiliates/${affiliate.id}`"
                        class="w-8 h-8 inline-flex items-center justify-center rounded-full text-zinc-400 hover:text-gold hover:bg-gold/10 transition-colors"
                        title="Open affiliate record"
                    >
                        <ExternalLink class="w-4 h-4" />
                    </router-link>
                </template>
            </template>

            <!-- ─── Conversation ───────────────────────────────────── -->
            <div v-if="!affiliate" class="h-full flex flex-col items-center justify-center text-zinc-400 text-sm gap-3">
                <MessageSquare class="w-8 h-8 text-zinc-300" />
                {{ opening ? 'Opening…' : 'Pick a conversation.' }}
            </div>

            <div v-else class="h-full flex flex-col min-h-0">
                <!-- Open stock requests, actionable right here. Scrolls in its
                     own area so a long request can't push the composer off. -->
                <div v-if="openRequests.length" class="flex-shrink-0 max-h-[45%] overflow-y-auto border-b border-amber-200">
                    <div
                        v-for="r in openRequests"
                        :key="r.id"
                        class="bg-amber-50 border-b border-amber-200 p-4"
                    >
                        <div class="max-w-3xl mx-auto">
                            <p class="text-xs tracking-widest uppercase text-amber-700 mb-1 inline-flex items-center gap-1">
                                <Package class="w-3 h-3" /> Stock request
                            </p>
                            <p class="font-semibold">{{ r.title }}</p>
                            <p v-if="r.note" class="text-sm text-zinc-700 mt-1 whitespace-pre-line">{{ r.note }}</p>
                            <div v-if="r.images?.length" class="flex flex-wrap gap-2 mt-3">
                                <a v-for="(src, i) in r.images" :key="i" :href="src" target="_blank" rel="noopener">
                                    <img :src="src" loading="lazy" class="w-20 h-24 object-cover border border-amber-200" alt="" />
                                </a>
                            </div>
                            <input
                                v-model="adminNote"
                                placeholder="A note back (optional)"
                                class="w-full border border-amber-300 bg-white px-3 py-2 text-sm mt-3"
                            />
                            <div class="flex gap-2 mt-2">
                                <button
                                    @click="resolve(r, 'accepted')"
                                    :disabled="resolving === r.id"
                                    class="bg-emerald-600 text-white px-4 py-2 text-[10px] tracking-widest uppercase hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                    <LoaderCircle v-if="resolving === r.id" class="w-3 h-3 animate-spin" />
                                    <Check v-else class="w-3 h-3" /> Accept
                                </button>
                                <button
                                    @click="resolve(r, 'declined')"
                                    :disabled="resolving === r.id"
                                    class="border border-zinc-300 bg-white px-4 py-2 text-[10px] tracking-widest uppercase hover:bg-zinc-100 disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                    <X class="w-3 h-3" /> Decline
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex-1 min-h-0">
                    <!-- Keyed by thread so scroll position, the draft and the
                         unread line never leak from one conversation to the next. -->
                    <ChatThread
                        :key="affiliate.id"
                        :messages="c.messages"
                        me="admin"
                        :their-name="affiliate.code"
                        :sending="c.sending"
                        :typing="c.typing"
                        :first-unread-id="c.firstUnreadId"
                        :has-more="c.hasMore"
                        :loading-earlier="c.loadingEarlier"
                        mentions-url="/api/admin/affiliate-inbox/mentions"
                        :ref-url="refUrl"
                        placeholder="Write a reply…"
                        @send="reply"
                        @typing="chat.notifyTyping()"
                        @load-earlier="chat.loadEarlier()"
                    />
                </div>
            </div>
        </ChatShell>
    </div>
</template>
