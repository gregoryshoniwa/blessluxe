<script>
import { api } from '../../lib/api.js';
import { toast } from '../../lib/dialog.js';
import { MessageCircle, Send, Trash2, Check, Sparkles, Loader2 } from 'lucide-vue-next';

/**
 * The group chat inside a series — on the page everyone was sent to, so the
 * conversation and the sizes are never in two places.
 *
 * It polls rather than opening a socket (the shop's standing choice): every
 * 8 seconds while the tab is visible, nothing while it's hidden, and only for
 * what's new since the server's own clock said. Someone taking a size, and the
 * series filling, arrive as events in the same stream, so a stranger reading
 * it sees a group that's moving rather than a wall of questions.
 */
export default {
    name: 'SeriesTalk',
    components: { MessageCircle, Send, Trash2, Check, Sparkles, Loader2 },
    props: {
        code: { type: String, required: true },
        campaign: { type: Object, default: null },
        customer: { type: Object, default: null },
        iAmIn: { type: Boolean, default: false },
    },
    data() {
        return {
            items: [],
            starters: [],
            max: 500,
            since: null,             // the server's "now" from the last read
            loading: true,
            sending: false,
            draft: '',
            poll: null,
            busyId: null,
        };
    },
    computed: {
        posts() { return this.items.filter((i) => i.kind === 'post'); },
        voices() { return new Set(this.posts.map((p) => p.author?.name)).size; },
        /** Openers only while it's quiet and this person hasn't spoken yet. */
        showStarters() { return !!this.customer && this.posts.length < 3 && !this.posts.some((p) => p.author?.mine); },
        canPost() { return this.campaign?.status !== 'cancelled'; },
    },
    watch: {
        code() { this.items = []; this.since = null; this.load(); },
    },
    mounted() {
        this.load();
        this.poll = setInterval(() => { if (document.visibilityState === 'visible') this.load(true); }, 8000);
        document.addEventListener('visibilitychange', this.onVisible);
    },
    beforeUnmount() {
        clearInterval(this.poll);
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
                this.starters = d.starters || [];
                this.max = d.max || 500;
                this.since = d.now || this.since;
            } catch { /* the next poll will try again */ }
            finally { this.loading = false; }
        },
        /** New items join the stream once each, in time order, without a flicker. */
        merge(fresh) {
            if (!fresh.length) return;
            const el = this.$refs.stream;
            const nearBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            const seen = new Set(this.items.map((i) => i.id));
            const add = fresh.filter((i) => !seen.has(i.id));
            if (!add.length) return;
            this.items = this.items.concat(add).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
            if (nearBottom) this.$nextTick(() => { if (this.$refs.stream) this.$refs.stream.scrollTop = this.$refs.stream.scrollHeight; });
        },
        toLogin() {
            this.$router.push({ path: '/account/login', query: { next: `/shop/series/${this.code}` } });
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
                this.$nextTick(() => { if (this.$refs.stream) this.$refs.stream.scrollTop = this.$refs.stream.scrollHeight; });
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
        when(iso) {
            const d = new Date(iso);
            const mins = Math.floor((Date.now() - d.getTime()) / 60000);
            if (mins < 1) return 'just now';
            if (mins < 60) return `${mins} min ago`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h ago`;

            return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Live
            </p>
        </div>

        <div class="border border-gold/20 bg-white">
            <!-- The stream -->
            <div ref="stream" class="max-h-[26rem] overflow-y-auto px-4 py-4 space-y-3">
                <p v-if="loading && !items.length" class="text-xs tracking-widest uppercase text-black/40 text-center py-8 animate-pulse">Loading</p>
                <p v-else-if="!items.length" class="text-sm text-black/50 text-center py-8">Nothing yet. Be the one who starts it.</p>

                <template v-for="item in items" :key="item.id">
                    <!-- Someone joined, or it filled: a quiet line down the middle -->
                    <p v-if="item.kind === 'joined'" class="flex items-center justify-center gap-2 text-[11px] text-black/50">
                        <span class="w-5 h-5 rounded-full bg-gold/15 text-gold-dark text-[9px] font-semibold inline-flex items-center justify-center">{{ item.author?.initials }}</span>
                        <span><strong class="font-medium text-black/70">{{ item.author?.mine ? 'You' : item.author?.initials }}</strong> {{ item.body }}</span>
                        <span class="text-black/35">· {{ when(item.created_at) }}</span>
                    </p>
                    <p v-else-if="item.kind === 'filled'" class="flex items-center justify-center gap-2 text-[11px] font-semibold tracking-widest uppercase text-emerald-700 py-1">
                        <Sparkles class="w-3.5 h-3.5" /> {{ item.body }}
                    </p>

                    <!-- A message -->
                    <div v-else :class="['flex gap-3', item.author?.mine && 'flex-row-reverse']">
                        <span class="w-8 h-8 rounded-full bg-gold text-white text-[10px] font-semibold inline-flex items-center justify-center flex-shrink-0 mt-0.5">{{ item.author?.initials }}</span>
                        <div :class="['max-w-[80%] min-w-0', item.author?.mine && 'text-right']">
                            <p class="flex items-center gap-2 text-[11px] text-black/55 mb-0.5" :class="item.author?.mine && 'justify-end'">
                                <span class="font-medium text-black/75">{{ item.author?.mine ? 'You' : item.author?.name }}</span>
                                <span v-if="item.author?.in_series" class="inline-flex items-center gap-0.5 text-[9px] tracking-widest uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5"><Check class="w-2.5 h-2.5" /> In</span>
                                <span class="text-black/35">{{ when(item.created_at) }}</span>
                                <button v-if="item.author?.mine" @click="remove(item)" :disabled="busyId === item.id" class="w-7 h-7 -my-1 inline-flex items-center justify-center text-black/30 hover:text-red-600 transition-colors" title="Remove your message" aria-label="Remove your message"><Trash2 class="w-3 h-3" /></button>
                            </p>
                            <p :class="['inline-block text-sm leading-relaxed px-3 py-2 whitespace-pre-line break-words text-left', item.author?.mine ? 'bg-gold/15' : 'bg-cream-dark/50']">{{ item.body }}</p>
                        </div>
                    </div>
                </template>
            </div>

            <!-- Say something -->
            <div class="border-t border-gold/15 px-4 py-3">
                <template v-if="!canPost">
                    <p class="text-xs text-black/50 text-center py-2">This series was cancelled, so the conversation is closed.</p>
                </template>
                <template v-else-if="!customer">
                    <button @click="toLogin" class="w-full min-h-11 inline-flex items-center justify-center gap-2 border border-black/20 px-4 py-3 text-[10px] font-semibold tracking-[0.2em] uppercase hover:border-black/50 transition-colors">
                        <MessageCircle class="w-4 h-4" /> Sign in to join the conversation
                    </button>
                </template>
                <template v-else>
                    <div v-if="showStarters" class="flex flex-wrap gap-2 mb-3">
                        <button v-for="s in starters" :key="s" @click="send(s)" :disabled="sending" class="min-h-9 border border-black/15 px-3 py-1.5 text-xs text-black/70 hover:border-gold hover:text-gold transition-colors disabled:opacity-50">{{ s }}</button>
                    </div>
                    <div class="flex items-end gap-2">
                        <textarea
                            v-model="draft"
                            @keydown="onKey"
                            rows="1"
                            :maxlength="max"
                            :placeholder="iAmIn ? 'Say something to the group…' : 'Ask the group anything…'"
                            class="flex-1 border border-black/15 px-3 py-2.5 text-sm focus:outline-none focus:border-gold resize-none min-h-11"
                        ></textarea>
                        <button @click="send()" :disabled="!draft.trim() || sending" class="w-11 h-11 inline-flex items-center justify-center bg-gold text-white hover:bg-gold-dark transition-colors disabled:opacity-40" title="Send" aria-label="Send">
                            <Loader2 v-if="sending" class="w-4 h-4 animate-spin" />
                            <Send v-else class="w-4 h-4" />
                        </button>
                    </div>
                    <p class="text-[11px] text-black/40 mt-2">Everyone on this page can read it. Enter sends; Shift+Enter for a new line.</p>
                </template>
            </div>
        </div>
    </section>
</template>
