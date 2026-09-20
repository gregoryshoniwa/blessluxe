<script>
import { api } from '../../lib/api.js';
import { toast, confirmDialog } from '../../lib/dialog.js';
import { Send, ArrowLeft, Package, Check, X, LoaderCircle } from 'lucide-vue-next';

/**
 * The admin half of the affiliate conversation.
 *
 * Stock requests appear inside the thread rather than in a separate queue, so a
 * decision is made and explained in the same place the question was asked.
 */
export default {
    name: 'AdminAffiliateInbox',
    components: { Send, ArrowLeft, Package, Check, X, LoaderCircle },
    data() {
        return {
            threads: [],
            pendingRequests: 0,
            loading: true,
            open: null,          // { affiliate, messages, requests }
            body: '',
            sending: false,
            resolving: null,
            adminNote: '',
        };
    },
    mounted() {
        this.fetchThreads();
        if (this.$route.params.id) this.openThread({ id: this.$route.params.id });
    },
    methods: {
        async fetchThreads() {
            this.loading = true;
            try {
                const d = await api.get('/api/admin/affiliate-inbox');
                this.threads = d.threads;
                this.pendingRequests = d.pending_requests;
            } catch (e) {
                toast(e.payload?.error || 'Could not load the inbox.', { tone: 'error' });
            } finally { this.loading = false; }
        },

        async openThread(t) {
            try {
                this.open = await api.get(`/api/admin/affiliates/${t.id}/messages`);
                this.$nextTick(this.scrollToEnd);
                // Opening clears this thread's unread badge in the list.
                await this.fetchThreads();
            } catch (e) {
                toast(e.payload?.error || 'Could not open that thread.', { tone: 'error' });
            }
        },
        scrollToEnd() {
            const el = this.$refs.thread;
            if (el) el.scrollTop = el.scrollHeight;
        },

        async reply() {
            if (!this.body.trim()) return;
            this.sending = true;
            try {
                const d = await api.post(`/api/admin/affiliates/${this.open.affiliate.id}/messages`, { body: this.body });
                this.open.messages = d.messages;
                this.body = '';
                this.$nextTick(this.scrollToEnd);
            } catch (e) {
                toast(e.payload?.error || 'Could not send that.', { tone: 'error' });
            } finally { this.sending = false; }
        },

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
                this.adminNote = '';
                await this.openThread({ id: this.open.affiliate.id });
                toast(`Request ${status}.`);
            } catch (e) {
                toast(e.payload?.error || 'Could not save that.', { tone: 'error' });
            } finally { this.resolving = null; }
        },

        fmt(iso) {
            return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
        },
    },
};
</script>

<template>
    <div>
        <header class="flex items-start justify-between mb-6 flex-wrap gap-3">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">Partners</p>
                <h1 class="text-2xl font-semibold">Affiliate inbox</h1>
            </div>
            <span v-if="pendingRequests" class="text-xs tracking-widest uppercase bg-amber-100 text-amber-700 px-3 py-1.5">
                {{ pendingRequests }} request{{ pendingRequests === 1 ? '' : 's' }} waiting
            </span>
        </header>

        <div v-if="loading" class="text-zinc-400 text-sm">Loading…</div>

        <div v-else class="grid grid-cols-12 gap-6">
            <!-- Threads -->
            <aside class="col-span-12 md:col-span-4 bg-white border border-zinc-200 max-h-[70vh] overflow-y-auto">
                <p v-if="!threads.length" class="p-8 text-center text-zinc-400 text-sm">
                    No conversations yet.
                </p>
                <button
                    v-for="t in threads"
                    :key="t.id"
                    @click="openThread(t)"
                    :class="[
                        'w-full text-left px-4 py-3 border-b border-zinc-100 transition-colors',
                        open?.affiliate?.id === t.id ? 'bg-zinc-50' : 'hover:bg-zinc-50',
                    ]"
                >
                    <span class="flex items-center gap-2">
                        <span class="font-mono text-xs text-gold-dark flex-1 min-w-0 truncate">{{ t.code || t.email }}</span>
                        <span v-if="t.unread" class="text-[10px] bg-gold text-white px-1.5 py-0.5 rounded-full">{{ t.unread }}</span>
                    </span>
                    <span class="block text-xs text-zinc-500 truncate mt-0.5">{{ t.preview }}</span>
                    <span class="block text-[10px] tracking-widest uppercase text-zinc-400 mt-1">{{ fmt(t.last_at) }}</span>
                </button>
            </aside>

            <!-- Conversation -->
            <section class="col-span-12 md:col-span-8">
                <p v-if="!open" class="bg-white border border-zinc-200 p-12 text-center text-zinc-400 text-sm">
                    Pick a conversation.
                </p>

                <template v-else>
                    <!-- Open stock requests, actionable right here. -->
                    <div
                        v-for="r in open.requests.filter((x) => x.status === 'pending')"
                        :key="r.id"
                        class="bg-amber-50 border border-amber-300 p-4 mb-4"
                    >
                        <p class="text-xs tracking-widest uppercase text-amber-700 mb-1 inline-flex items-center gap-1">
                            <Package class="w-3 h-3" /> Stock request
                        </p>
                        <p class="font-semibold">{{ r.title }}</p>
                        <p v-if="r.note" class="text-sm text-zinc-700 mt-1 whitespace-pre-line">{{ r.note }}</p>
                        <div v-if="r.images?.length" class="flex flex-wrap gap-2 mt-3">
                            <a v-for="(src, i) in r.images" :key="i" :href="src" target="_blank" rel="noopener">
                                <img :src="src" class="w-20 h-24 object-cover border border-amber-200" alt="" />
                            </a>
                        </div>
                        <input
                            v-model="adminNote"
                            placeholder="A note back (optional)"
                            class="w-full border border-amber-300 px-3 py-2 text-sm mt-3"
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
                                class="border border-zinc-300 px-4 py-2 text-[10px] tracking-widest uppercase hover:bg-zinc-100 disabled:opacity-50 inline-flex items-center gap-1"
                            >
                                <X class="w-3 h-3" /> Decline
                            </button>
                        </div>
                    </div>

                    <div class="bg-white border border-zinc-200">
                        <header class="px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
                            <div>
                                <p class="font-mono text-sm text-gold-dark">{{ open.affiliate.code }}</p>
                                <p class="text-xs text-zinc-500">{{ open.affiliate.email }}</p>
                            </div>
                            <router-link :to="`/admin/affiliates/${open.affiliate.id}`" class="text-xs tracking-widest uppercase text-zinc-500 hover:text-gold">
                                Open record →
                            </router-link>
                        </header>

                        <div ref="thread" class="p-5 space-y-4 max-h-[45vh] overflow-y-auto">
                            <div
                                v-for="m in open.messages"
                                :key="m.id"
                                :class="['flex', m.sender === 'admin' ? 'justify-end' : 'justify-start']"
                            >
                                <div
                                    class="max-w-[80%] px-4 py-2.5"
                                    :class="m.sender === 'admin' ? 'bg-zinc-900 text-white' : 'bg-zinc-100'"
                                >
                                    <p class="text-[10px] tracking-widest uppercase mb-1" :class="m.sender === 'admin' ? 'text-white/50' : 'text-zinc-500'">
                                        {{ m.sender === 'admin' ? 'You' : open.affiliate.code }} · {{ fmt(m.created_at) }}
                                    </p>
                                    <p class="text-sm whitespace-pre-line leading-relaxed">{{ m.body }}</p>
                                    <div v-if="m.attachments?.length" class="flex flex-wrap gap-2 mt-2">
                                        <a v-for="(src, i) in m.attachments" :key="i" :href="src" target="_blank" rel="noopener">
                                            <img :src="src" class="w-16 h-20 object-cover border border-white/20" alt="" />
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="border-t border-zinc-200 p-4 flex items-end gap-2">
                            <textarea
                                v-model="body"
                                rows="2"
                                placeholder="Write a reply…"
                                class="flex-1 border border-zinc-300 px-3 py-2 text-sm"
                            ></textarea>
                            <button
                                @click="reply"
                                :disabled="sending || !body.trim()"
                                class="bg-gold text-white px-4 py-2.5 hover:bg-gold-dark disabled:opacity-40"
                            >
                                <LoaderCircle v-if="sending" class="w-4 h-4 animate-spin" />
                                <Send v-else class="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </template>
            </section>
        </div>
    </div>
</template>
