<script>
import { api } from '../../../lib/api.js';
import { toastError } from '../../../lib/dialog.js';
import { hiveStore, timeAgo } from '../../hive-store.js';
import { SendHorizontal, LoaderCircle, UserRound, Trash2, Flag } from 'lucide-vue-next';

/**
 * The conversation under a look. Opens in place (no navigation, so the feed
 * keeps its scroll position), loads the newest 20 and pages backwards.
 */
export default {
    name: 'LookComments',
    components: { SendHorizontal, LoaderCircle, UserRound, Trash2, Flag },
    props: { lookId: { type: String, required: true } },
    emits: ['count', 'report'],
    data() {
        return { comments: [], next: null, loading: true, loadingMore: false, draft: '', sending: false };
    },
    mounted() { this.load(true); },
    methods: {
        timeAgo,
        async load(reset) {
            reset ? (this.loading = true) : (this.loadingMore = true);
            try {
                const qs = !reset && this.next ? `?before=${encodeURIComponent(this.next)}` : '';
                const d = await api.get(`/api/store/hive/looks/${this.lookId}/comments${qs}`);
                this.comments = reset ? d.comments : [...d.comments, ...this.comments];
                this.next = d.next;
            } catch { /* an empty thread is an acceptable failure */ }
            finally { this.loading = false; this.loadingMore = false; }
        },
        async send() {
            const body = this.draft.trim();
            if (!body || this.sending) return;
            if (!(await hiveStore.ready(this.$router, this.$route))) return;
            this.sending = true;
            try {
                const d = await api.post(`/api/account/hive/looks/${this.lookId}/comments`, { body });
                this.comments.push(d.comment);
                this.draft = '';
                this.$emit('count', 1);
            } catch (e) {
                toastError(e, e.payload?.errors?.body?.[0] || "That didn't post — try again.");
            } finally { this.sending = false; }
        },
        async remove(c) {
            try {
                await api.del(`/api/account/hive/comments/${c.id}`);
                this.comments = this.comments.filter((x) => x.id !== c.id);
                this.$emit('count', -1);
            } catch (e) { toastError(e); }
        },
    },
};
</script>

<template>
    <div class="border-t border-black/6 px-3.5 pt-3 pb-2">
        <button v-if="next" @click="load(false)" :disabled="loadingMore" class="text-xs text-black/50 hover:text-black mb-3 inline-flex items-center gap-1.5">
            <LoaderCircle v-if="loadingMore" class="w-3 h-3 animate-spin" /> View earlier comments
        </button>

        <p v-if="loading" class="text-xs text-black/40 py-2">Loading…</p>
        <p v-else-if="!comments.length" class="text-xs text-black/45 py-1">No comments yet. Say something kind.</p>

        <ul v-else class="space-y-3 mb-1">
            <li v-for="c in comments" :key="c.id" class="group flex gap-2.5">
                <router-link :to="`/@${c.author.handle}`" class="rounded-full w-7 h-7 overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0 mt-0.5">
                    <img v-if="c.author.avatar_url" :src="c.author.avatar_url" alt="" loading="lazy" class="w-full h-full object-cover" />
                    <UserRound v-else class="w-3.5 h-3.5 text-black/30" />
                </router-link>
                <div class="min-w-0 flex-1">
                    <p class="text-sm leading-snug break-words">
                        <router-link :to="`/@${c.author.handle}`" class="font-medium hover:text-gold-dark">{{ c.author.display_name }}</router-link>
                        <span class="text-black/80 ml-1.5">{{ c.body }}</span>
                    </p>
                    <p class="text-[11px] text-black/40 mt-0.5 flex items-center gap-3">
                        {{ timeAgo(c.created_at) }}
                        <button v-if="c.can_delete" @click="remove(c)" class="hover:text-red-600 inline-flex items-center gap-1 py-1"><Trash2 class="w-3 h-3" /> Remove</button>
                        <button v-if="!c.is_mine" @click="$emit('report', { type: 'comment', id: c.id })" class="hover:text-black inline-flex items-center gap-1 py-1"><Flag class="w-3 h-3" /> Report</button>
                    </p>
                </div>
            </li>
        </ul>

        <form @submit.prevent="send" class="flex items-center gap-2 mt-2">
            <input v-model="draft" maxlength="500" placeholder="Add a comment…" class="flex-1 min-w-0 bg-cream/70 px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
            <button type="submit" :disabled="!draft.trim() || sending" class="w-11 h-11 inline-flex items-center justify-center text-gold-dark disabled:text-black/20" aria-label="Post comment">
                <LoaderCircle v-if="sending" class="w-5 h-5 animate-spin" /><SendHorizontal v-else class="w-5 h-5" />
            </button>
        </form>
    </div>
</template>
