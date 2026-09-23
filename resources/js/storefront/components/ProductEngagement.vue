<script>
import { api } from '../../lib/api.js';
import { toast } from '../../lib/dialog.js';
import { authStore } from '../auth-store.js';
import { Star, Heart, MessageCircle, Trash2, Sparkles, Loader2 } from 'lucide-vue-next';

/**
 * What shoppers say about a piece: stars, hearts, a few words — and the Bees
 * each of those earns, once per piece, for ever.
 *
 * Reading needs no account. Acting is attempted and a 401 sends them to sign in
 * and straight back — the server is the only thing that knows for certain.
 * Every number on screen comes from the server's summary after each action, so
 * the count and the balance can't drift from what was actually recorded.
 */
export default {
    name: 'ProductEngagement',
    components: { Star, Heart, MessageCircle, Trash2, Sparkles, Loader2 },
    props: {
        handle: { type: String, required: true },
    },
    data() {
        return {
            summary: null,
            comments: [],
            next: null,
            remainingToday: null,
            draft: '',
            hoverStars: 0,
            loading: true,
            busy: '',              // 'rate' | 'like' | 'comment' | a comment id
            auth: authStore.state,
        };
    },
    computed: {
        signedIn() { return this.auth.signedIn; },
        stars() { return this.summary?.mine?.stars || 0; },
        liked() { return !!this.summary?.mine?.liked; },
        rewards() { return this.summary?.rewards || {}; },
        /** What each action is still worth to THIS person on THIS piece. */
        earned() { return this.summary?.mine?.earned || []; },
        canEarn() {
            return this.rewards.enabled && this.signedIn && this.remainingToday !== 0;
        },
        minLength() { return this.rewards.min_length || 15; },
        commentLeft() { return this.minLength - this.draft.trim().length; },
    },
    watch: {
        handle: 'load',
    },
    mounted() { this.load(); },
    methods: {
        async load() {
            this.loading = true;
            try {
                const d = await api.get(`/api/store/products/${encodeURIComponent(this.handle)}/engagement`);
                this.apply(d);
                this.comments = d.comments || [];
                this.next = d.next;
            } catch { /* the section simply stays quiet */ }
            finally { this.loading = false; }
        },
        apply(d) {
            if (d.summary) this.summary = d.summary;
            if (d.remaining_today !== undefined) this.remainingToday = d.remaining_today;
            if (d.bees) {
                toast(`+${d.bees} Bees — thank you`, { tone: 'success' });
                window.dispatchEvent(new CustomEvent('blessluxe:bees-updated', { detail: { balance: d.balance } }));
            }
        },
        /**
         * The SERVER decides whether we're signed in, not this page. Checking a
         * local flag first raced the auth store's own fetch and bounced people
         * who were perfectly signed in — and it can't know a session has just
         * expired. So we try, and only a 401 sends them to sign in and back.
         */
        toLogin() {
            this.$router.push({ path: '/account/login', query: { next: this.$route.fullPath } });
        },
        /** True when the failure was "you're not signed in", which we handle rather than shout about. */
        handledAuth(e) {
            if (e?.status !== 401) return false;
            this.toLogin();

            return true;
        },
        async rate(n) {
            if (this.busy) return;
            this.busy = 'rate';
            try {
                this.apply(await api.post(`/api/account/products/${encodeURIComponent(this.handle)}/rating`, { stars: n }));
            } catch (e) { if (!this.handledAuth(e)) toast(e.payload?.error || 'Could not save that rating.', { tone: 'error' }); }
            finally { this.busy = ''; }
        },
        async like() {
            if (this.busy) return;
            this.busy = 'like';
            try {
                this.apply(await api.post(`/api/account/products/${encodeURIComponent(this.handle)}/like`));
            } catch (e) { if (!this.handledAuth(e)) toast(e.payload?.error || 'Could not save that.', { tone: 'error' }); }
            finally { this.busy = ''; }
        },
        async send() {
            if (this.busy) return;
            const body = this.draft.trim();
            if (body.length < this.minLength) return;
            this.busy = 'comment';
            try {
                const d = await api.post(`/api/account/products/${encodeURIComponent(this.handle)}/comments`, { body });
                this.apply(d);
                if (d.comment) this.comments.unshift(d.comment);
                this.draft = '';
            } catch (e) { if (!this.handledAuth(e)) toast(e.payload?.error || 'Could not post that.', { tone: 'error' }); }
            finally { this.busy = ''; }
        },
        async remove(c) {
            if (this.busy) return;
            this.busy = c.id;
            try {
                await api.del(`/api/account/product-comments/${encodeURIComponent(c.id)}`);
                this.comments = this.comments.filter((x) => x.id !== c.id);
                if (this.summary) this.summary.comments_count = Math.max(0, this.summary.comments_count - 1);
            } catch { toast('Could not remove that.', { tone: 'error' }); }
            finally { this.busy = ''; }
        },
        async more() {
            if (!this.next) return;
            try {
                const d = await api.get(`/api/store/products/${encodeURIComponent(this.handle)}/engagement?before=${encodeURIComponent(this.next)}`);
                this.comments = this.comments.concat(d.comments || []);
                this.next = d.next;
            } catch { /* leave the button for another try */ }
        },
        when(iso) {
            const d = new Date(iso);
            const days = Math.floor((Date.now() - d.getTime()) / 86400000);
            if (days < 1) return 'Today';
            if (days === 1) return 'Yesterday';
            if (days < 30) return `${days} days ago`;

            return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        },
        barWidth(n) {
            const total = this.summary?.rating_count || 0;

            return total ? `${Math.round((n / total) * 100)}%` : '0%';
        },
    },
};
</script>

<template>
    <section v-if="!loading && summary" class="border-t border-gold/15 pt-6 mt-8">
        <!-- The verdict -->
        <div class="flex flex-wrap items-center gap-x-6 gap-y-3 mb-5">
            <div v-if="summary.rating_count" class="flex items-center gap-2">
                <span class="flex items-center">
                    <Star
                        v-for="n in 5"
                        :key="`avg-${n}`"
                        class="w-4 h-4"
                        :class="n <= Math.round(summary.average) ? 'text-gold fill-gold' : 'text-black/15'"
                    />
                </span>
                <span class="text-sm font-medium">{{ summary.average_label }}</span>
                <span class="text-xs text-black/50">{{ summary.rating_count }} rating{{ summary.rating_count === 1 ? '' : 's' }}</span>
            </div>
            <p v-else class="text-xs text-black/50">No ratings yet — yours would be the first.</p>

            <button
                @click="like"
                :disabled="busy === 'like'"
                :class="['inline-flex items-center gap-2 min-h-11 px-3 -ml-3 text-sm transition-colors', liked ? 'text-gold' : 'text-black/60 hover:text-gold']"
                :title="liked ? 'Take back your heart' : 'Love this piece'"
            >
                <Heart class="w-4 h-4" :class="liked && 'fill-gold'" />
                <span>{{ summary.likes_count || 0 }}</span>
            </button>
        </div>

        <!-- Say something. The Bees on offer are stated plainly, and only while true. -->
        <div class="border border-gold/20 bg-cream-dark/30 p-4 mb-6">
            <p class="text-[10px] tracking-widest uppercase text-black/55 mb-3">
                {{ stars ? 'Your rating' : 'Rate this piece' }}
                <span v-if="canEarn && !earned.includes('rate')" class="text-gold-dark ml-1">· earns {{ rewards.rate }} Bees</span>
            </p>
            <div class="flex items-center gap-1 mb-4" @mouseleave="hoverStars = 0">
                <button
                    v-for="n in 5"
                    :key="`set-${n}`"
                    @click="rate(n)"
                    @mouseenter="hoverStars = n"
                    :disabled="busy === 'rate'"
                    class="w-11 h-11 -ml-1 first:ml-0 inline-flex items-center justify-center disabled:opacity-50"
                    :title="`${n} star${n === 1 ? '' : 's'}`"
                    :aria-label="`${n} star${n === 1 ? '' : 's'}`"
                >
                    <Star class="w-6 h-6 transition-colors" :class="n <= (hoverStars || stars) ? 'text-gold fill-gold' : 'text-black/20'" />
                </button>
                <Loader2 v-if="busy === 'rate'" class="w-4 h-4 animate-spin text-gold ml-2" />
            </div>

            <label class="block text-[10px] tracking-widest uppercase text-black/55 mb-2">
                Say something
                <span v-if="canEarn && !earned.includes('comment')" class="text-gold-dark ml-1">· earns {{ rewards.comment }} Bees</span>
            </label>
            <textarea
                v-model="draft"
                rows="3"
                maxlength="1000"
                placeholder="How does it fit? What did you wear it to?"
                class="w-full border border-black/15 px-3 py-2.5 text-sm focus:outline-none focus:border-gold resize-none"
            ></textarea>
            <div class="flex items-center justify-between gap-3 mt-2">
                <p class="text-xs text-black/45">
                    <span v-if="draft.trim().length && commentLeft > 0">{{ commentLeft }} more character{{ commentLeft === 1 ? '' : 's' }}</span>
                </p>
                <button
                    @click="send"
                    :disabled="draft.trim().length < minLength || busy === 'comment'"
                    class="inline-flex items-center gap-2 bg-gold text-white px-5 py-2.5 text-[10px] font-semibold tracking-[0.2em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-40"
                >
                    <Loader2 v-if="busy === 'comment'" class="w-3.5 h-3.5 animate-spin" />
                    Post
                </button>
            </div>

            <p v-if="rewards.enabled && signedIn && remainingToday === 0" class="text-xs text-black/45 mt-3">
                That's today's Bees earned — say what you like, it just won't add more until tomorrow.
            </p>
            <p v-else-if="rewards.enabled && auth.loaded && !signedIn" class="flex items-center gap-1.5 text-xs text-black/50 mt-3">
                <Sparkles class="w-3.5 h-3.5 text-gold" />
                Sign in to earn Bees for rating and reviewing.
            </p>
        </div>

        <!-- What everyone said -->
        <div v-if="comments.length">
            <p class="text-[10px] tracking-widest uppercase text-black/55 mb-4 flex items-center gap-2">
                <MessageCircle class="w-3.5 h-3.5 text-gold" />
                {{ summary.comments_count }} review{{ summary.comments_count === 1 ? '' : 's' }}
            </p>
            <ul class="space-y-5">
                <li v-for="c in comments" :key="c.id" :class="busy === c.id && 'opacity-50'">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-sm font-medium">{{ c.author }}</span>
                        <span v-if="c.verified" class="text-[9px] tracking-widest uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5">Bought it</span>
                        <span class="text-xs text-black/40">{{ when(c.created_at) }}</span>
                        <button
                            v-if="c.mine"
                            @click="remove(c)"
                            class="ml-auto w-8 h-8 -mr-1 inline-flex items-center justify-center text-black/30 hover:text-red-600 transition-colors"
                            title="Remove your review"
                            aria-label="Remove your review"
                        >
                            <Trash2 class="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <p class="text-sm text-black/75 leading-relaxed whitespace-pre-line">{{ c.body }}</p>
                </li>
            </ul>
            <button v-if="next" @click="more" class="mt-5 text-[10px] tracking-widest uppercase text-gold-dark hover:text-gold underline underline-offset-4 min-h-11">
                Read more reviews
            </button>
        </div>
    </section>
</template>
