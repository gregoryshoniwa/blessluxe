<script>
import { api } from '../../lib/api.js';
import { toast } from '../../lib/dialog.js';
import { MessageCircle, Send, Trash2, Check, Sparkles, Loader2, ArrowDown, Plus } from 'lucide-vue-next';

/**
 * The group chat inside a series — on the page everyone was sent to, so the
 * conversation and the sizes are never in two places.
 *
 * Laid out the way people already read a chat: who's in along the top, the
 * day down the middle, one person's run of messages under one name, and the
 * things that *happened* (sizes taken, the series filling) as quiet lines
 * between the talk rather than entries that look like talk.
 *
 * It polls rather than opening a socket (the shop's standing choice): every
 * 8 seconds while the tab is visible, nothing while it's hidden, only for what
 * is new since the server's own clock said.
 */
export default {
    name: 'SeriesTalk',
    components: { MessageCircle, Send, Trash2, Check, Sparkles, Loader2, ArrowDown, Plus },
    props: {
        code: { type: String, required: true },
        campaign: { type: Object, default: null },
        customer: { type: Object, default: null },
        iAmIn: { type: Boolean, default: false },
    },
    data() {
        return {
            items: [],
            members: [],
            starters: [],
            max: 500,
            since: null,
            loading: true,
            sending: false,
            draft: '',
            poll: null,
            busyId: null,
            unseen: 0,               // messages that arrived while scrolled up
            now: Date.now(),
            tick: null,
        };
    },
    computed: {
        posts() { return this.items.filter((i) => i.kind === 'post'); },
        voices() { return new Set(this.posts.map((p) => p.author?.name)).size; },
        showStarters() { return !!this.customer && this.posts.length < 3 && !this.posts.some((p) => p.author?.mine); },
        canPost() { return this.campaign?.status !== 'cancelled'; },
        open() { return this.campaign?.status === 'open'; },

        /**
         * The stream, read the way a chat is read: day markers, runs of one
         * person's messages, and events folded together so four people taking
         * sizes is one line, not four.
         */
        blocks() {
            const out = [];
            let day = null;
            for (const item of this.items) {
                const d = this.dayKey(item.created_at);
                if (d !== day) { out.push({ kind: 'day', key: `day-${d}`, label: this.dayLabel(item.created_at) }); day = d; }
                const last = out[out.length - 1];

                if (item.kind === 'joined') {
                    if (last?.kind === 'joins') last.items.push(item);
                    else out.push({ kind: 'joins', key: item.id, items: [item] });
                } else if (item.kind === 'post') {
                    const same = last?.kind === 'posts' && last.author === item.author?.name && last.mine === !!item.author?.mine
                        && new Date(item.created_at) - new Date(last.items[last.items.length - 1].created_at) < 5 * 60000;
                    if (same) last.items.push(item);
                    else out.push({ kind: 'posts', key: item.id, author: item.author?.name, initials: item.author?.initials, inSeries: !!item.author?.in_series, mine: !!item.author?.mine, items: [item] });
                } else {
                    out.push({ kind: item.kind, key: item.id, item });
                }
            }

            return out;
        },
    },
    watch: {
        code() { this.items = []; this.members = []; this.since = null; this.load(); },
    },
    mounted() {
        this.load();
        this.poll = setInterval(() => { if (document.visibilityState === 'visible') this.load(true); }, 8000);
        this.tick = setInterval(() => { this.now = Date.now(); }, 30000);
        document.addEventListener('visibilitychange', this.onVisible);
    },
    beforeUnmount() {
        clearInterval(this.poll);
        clearInterval(this.tick);
        document.removeEventListener('visibilitychange', this.onVisible);
    },
    methods: {
        onVisible() { if (document.visibilityState === 'visible') this.load(true); },
        async load(quiet = false) {
            if (!quiet) this.loading = true;
            try {
                const qs = this.since ? `?since=${encodeURIComponent(this.since)}` : '';
                const d = await api.get(`/api/store/series/${encodeURIComponent(this.code)}/talk${qs}`);
                this.merge(d.items || []);
                if (d.members) this.members = d.members;
                this.starters = d.starters || [];
                this.max = d.max || 500;
                this.since = d.now || this.since;
                if (!quiet) this.$nextTick(this.toBottom);
            } catch { /* the next poll will try again */ }
            finally { this.loading = false; }
        },
        /** New items join the stream once each, in time order. Scrolled up? They wait, counted. */
        merge(fresh) {
            if (!fresh.length) return;
            const seen = new Set(this.items.map((i) => i.id));
            const add = fresh.filter((i) => !seen.has(i.id));
            if (!add.length) return;
            const near = this.nearBottom();
            this.items = this.items.concat(add).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
            if (near) this.$nextTick(this.toBottom);
            else this.unseen += add.filter((i) => i.kind === 'post' && !i.author?.mine).length;
        },
        nearBottom() {
            const el = this.$refs.stream;

            return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        },
        toBottom() {
            const el = this.$refs.stream;
            if (el) el.scrollTop = el.scrollHeight;
            this.unseen = 0;
        },
        onScroll() { if (this.nearBottom()) this.unseen = 0; },
        toLogin() {
            this.$router.push({ path: '/account/login', query: { next: `/shop/series/${this.code}` } });
        },
        toSizes() {
            document.getElementById('sizes')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        async send(text) {
            const body = (text ?? this.draft).trim();
            if (!body || this.sending) return;
            if (!this.customer) return this.toLogin();
            this.sending = true;
            try {
                const d = await api.post(`/api/account/series/${encodeURIComponent(this.code)}/talk`, { body });
                this.merge([d.post]);
                this.draft = '';
                this.$nextTick(this.toBottom);
            } catch (e) {
                if (e?.status === 401) return this.toLogin();
                toast(e.payload?.error || 'Could not send that.', { tone: 'error' });
            } finally { this.sending = false; }
        },
        onKey(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
        },
        async remove(item) {
            this.busyId = item.id;
            try {
                await api.del(`/api/account/series-posts/${encodeURIComponent(item.id)}`);
                this.items = this.items.filter((i) => i.id !== item.id);
            } catch { toast('Could not remove that.', { tone: 'error' }); }
            finally { this.busyId = null; }
        },

        // ── Words for time ────────────────────────────────────────────────
        dayKey(iso) { return new Date(iso).toDateString(); },
        dayLabel(iso) {
            const d = new Date(iso), today = new Date(), y = new Date(); y.setDate(today.getDate() - 1);
            if (d.toDateString() === today.toDateString()) return 'Today';
            if (d.toDateString() === y.toDateString()) return 'Yesterday';

            return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
        },
        clock(iso) { return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); },
        full(iso) { return new Date(iso).toLocaleString(); },
        /** "GS took M, S · P took L" — one line for a run of joins, however many. */
        joinsLine(items) {
            const by = new Map();
            for (const i of items) {
                const k = i.author?.mine ? 'You' : (i.author?.initials || '—');
                const size = (i.body || '').replace(/^took size\s*/i, '');
                if (!by.has(k)) by.set(k, []);
                if (size) by.get(k).push(size);
            }
            const parts = [...by.entries()].map(([who, sizes]) => `${who} took ${sizes.join(', ')}`);
            if (parts.length <= 3) return parts.join(' · ');

            return `${[...by.keys()].slice(0, 2).join(', ')} and ${by.size - 2} others took sizes`;
        },
        joinsFaces(items) {
            const seen = new Set(); const out = [];
            for (const i of items) { const k = i.author?.initials; if (k && !seen.has(k)) { seen.add(k); out.push(k); } }

            return out.slice(0, 4);
        },
    },
};
</script>

<template>
    <section id="talk" class="scroll-mt-28">
        <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
                <h2 class="font-display text-lg tracking-widest uppercase">The group</h2>
                <p class="text-xs text-black/55 mt-1">
                    <template v-if="posts.length">{{ posts.length }} message{{ posts.length === 1 ? '' : 's' }} from {{ voices }} {{ voices === 1 ? 'person' : 'people' }}</template>
                    <template v-else>Ask about the fit, the fabric, where to collect — or just say you're in.</template>
                </p>
            </div>
            <p class="text-[10px] tracking-widest uppercase text-black/40 inline-flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 live-dot"></span> Live
            </p>
        </div>

        <div class="border border-gold/20 bg-white">
            <!-- ─── Who's in: one face per person, what they took underneath ─── -->
            <div v-if="members.length || open" class="border-b border-gold/15 px-4 py-3">
                <p class="text-[10px] tracking-widest uppercase text-black/45 mb-2.5">
                    In this series<template v-if="members.length"> · {{ members.length }}</template>
                </p>
                <div class="scroll-strip flex items-start gap-4 scroll-px-0">
                    <div v-for="(m, i) in members" :key="i" class="flex-shrink-0 w-12 text-center" :title="`Took ${m.sizes.join(', ')}`">
                        <span :class="['block w-10 h-10 mx-auto rounded-full text-[11px] font-semibold inline-flex items-center justify-center', m.mine ? 'bg-gold text-white ring-2 ring-gold ring-offset-2 ring-offset-white' : 'bg-gold/15 text-gold-dark']">{{ m.initials }}</span>
                        <span class="block mt-1.5 text-[10px] text-black/60 leading-tight truncate">{{ m.mine ? 'You' : m.sizes.join(' · ') }}</span>
                    </div>
                    <button v-if="open && !iAmIn" @click="toSizes" class="flex-shrink-0 w-12 text-center group" title="Take a size">
                        <span class="block w-10 h-10 mx-auto rounded-full border-2 border-dashed border-gold text-gold inline-flex items-center justify-center group-hover:bg-gold group-hover:text-white transition-colors"><Plus class="w-4 h-4" /></span>
                        <span class="block mt-1.5 text-[10px] text-gold-dark leading-tight">You?</span>
                    </button>
                </div>
            </div>

            <!-- ─── The stream ───────────────────────────────────────────── -->
            <div class="relative">
                <div ref="stream" @scroll.passive="onScroll" class="max-h-[28rem] overflow-y-auto px-4 py-4 space-y-4 scroll-smooth">
                    <p v-if="loading && !items.length" class="text-xs tracking-widest uppercase text-black/40 text-center py-10 animate-pulse">Loading</p>
                    <div v-else-if="!items.length" class="text-center py-10">
                        <MessageCircle class="w-6 h-6 text-gold/50 mx-auto mb-2" />
                        <p class="text-sm text-black/55">Nothing yet. Be the one who starts it.</p>
                    </div>

                    <transition-group name="msg" tag="div" class="space-y-4">
                        <template v-for="b in blocks" :key="b.key">
                            <!-- The day, down the middle -->
                            <div v-if="b.kind === 'day'" class="flex items-center gap-3 text-[9px] tracking-[0.2em] uppercase text-black/35">
                                <span class="flex-1 h-px bg-black/8"></span>{{ b.label }}<span class="flex-1 h-px bg-black/8"></span>
                            </div>

                            <!-- Sizes taken: one quiet line however many -->
                            <div v-else-if="b.kind === 'joins'" class="flex items-center justify-center gap-2 text-[11px] text-black/55">
                                <span class="flex -space-x-1.5">
                                    <span v-for="f in joinsFaces(b.items)" :key="f" class="w-5 h-5 rounded-full bg-gold/15 text-gold-dark text-[8px] font-semibold inline-flex items-center justify-center ring-1 ring-white">{{ f }}</span>
                                </span>
                                <span :title="full(b.items[b.items.length - 1].created_at)">{{ joinsLine(b.items) }}</span>
                            </div>

                            <!-- It filled -->
                            <p v-else-if="b.kind === 'filled'" class="flex items-center justify-center gap-2 text-[11px] font-semibold tracking-widest uppercase text-emerald-700">
                                <Sparkles class="w-3.5 h-3.5" /> {{ b.item.body }}
                            </p>

                            <!-- One person's run of messages -->
                            <div v-else :class="['flex gap-2.5', b.mine && 'flex-row-reverse']">
                                <span v-if="!b.mine" class="w-8 h-8 rounded-full bg-gold text-white text-[10px] font-semibold inline-flex items-center justify-center flex-shrink-0 self-end">{{ b.initials }}</span>
                                <div :class="['max-w-[78%] min-w-0 flex flex-col gap-0.5', b.mine ? 'items-end' : 'items-start']">
                                    <p v-if="!b.mine" class="flex items-center gap-2 text-[11px] text-black/55 mb-1 px-1">
                                        <span class="font-medium text-black/80">{{ b.author }}</span>
                                        <span v-if="b.inSeries" class="inline-flex items-center gap-0.5 text-[9px] tracking-widest uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5"><Check class="w-2.5 h-2.5" /> In</span>
                                    </p>
                                    <div v-for="(m, i) in b.items" :key="m.id" :class="['group/msg relative flex items-center gap-1', b.mine && 'flex-row-reverse']">
                                        <p
                                            :class="['text-sm leading-relaxed px-3.5 py-2 whitespace-pre-line break-words text-left', b.mine ? 'bg-gold text-white' : 'bg-cream-dark/60 text-black/85']"
                                            :title="full(m.created_at)"
                                        >{{ m.body }}</p>
                                        <button v-if="b.mine" @click="remove(m)" :disabled="busyId === m.id" class="w-7 h-7 inline-flex items-center justify-center text-black/25 hover:text-red-600 opacity-0 group-hover/msg:opacity-100 focus:opacity-100 transition-opacity" title="Remove" aria-label="Remove your message"><Trash2 class="w-3 h-3" /></button>
                                        <span v-if="i === b.items.length - 1" class="text-[10px] text-black/35 tabular-nums self-end px-1">{{ clock(m.created_at) }}</span>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </transition-group>
                </div>

                <!-- Arrived while you were reading higher up -->
                <button v-if="unseen" @click="toBottom" class="absolute left-1/2 -translate-x-1/2 bottom-3 inline-flex items-center gap-1.5 bg-black text-white text-[10px] font-semibold tracking-widest uppercase px-3 py-2 shadow-lg hover:bg-gold transition-colors">
                    <ArrowDown class="w-3 h-3" /> {{ unseen }} new
                </button>
            </div>

            <!-- ─── Say something ────────────────────────────────────────── -->
            <div class="border-t border-gold/15 px-4 py-3 bg-cream/40">
                <template v-if="!canPost">
                    <p class="text-xs text-black/50 text-center py-2">This series was cancelled, so the conversation is closed.</p>
                </template>
                <template v-else-if="!customer">
                    <button @click="toLogin" class="w-full min-h-11 inline-flex items-center justify-center gap-2 border border-black/20 bg-white px-4 py-3 text-[10px] font-semibold tracking-[0.2em] uppercase hover:border-black/50 transition-colors">
                        <MessageCircle class="w-4 h-4" /> Sign in to join the conversation
                    </button>
                </template>
                <template v-else>
                    <div v-if="showStarters" class="scroll-strip flex gap-2 mb-3 scroll-px-0">
                        <button v-for="s in starters" :key="s" @click="send(s)" :disabled="sending" class="flex-shrink-0 min-h-9 border border-black/15 bg-white px-3 py-1.5 text-xs text-black/70 hover:border-gold hover:text-gold transition-colors disabled:opacity-50">{{ s }}</button>
                    </div>
                    <div class="flex items-end gap-2">
                        <textarea
                            v-model="draft"
                            @keydown="onKey"
                            rows="1"
                            :maxlength="max"
                            :placeholder="iAmIn ? 'Say something to the group…' : 'Ask the group anything…'"
                            class="flex-1 border border-black/15 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:border-gold resize-none min-h-11"
                        ></textarea>
                        <button @click="send()" :disabled="!draft.trim() || sending" class="w-11 h-11 inline-flex items-center justify-center bg-gold text-white hover:bg-gold-dark transition-colors disabled:opacity-40" title="Send" aria-label="Send">
                            <Loader2 v-if="sending" class="w-4 h-4 animate-spin" />
                            <Send v-else class="w-4 h-4" />
                        </button>
                    </div>
                    <p class="text-[11px] text-black/40 mt-2">Everyone on this page can read it · Enter sends, Shift+Enter for a new line</p>
                </template>
            </div>
        </div>
    </section>
</template>

<style scoped>
/* A message slides into place; the live dot breathes. */
.msg-enter-active { transition: opacity .25s ease, transform .25s ease; }
.msg-enter-from { opacity: 0; transform: translateY(6px); }
.live-dot { animation: live 2s ease-in-out infinite; }
@keyframes live { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) {
    .msg-enter-active { transition: none; }
    .live-dot { animation: none; }
}
</style>
