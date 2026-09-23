<script>
import { api } from '../../lib/api.js';
import { toast } from '../../lib/dialog.js';
import { authStore } from '../auth-store.js';
import { Star, MessageCircle, Trash2, Sparkles, Loader2, X } from 'lucide-vue-next';

/**
 * A product's reviews, full width, built to the shape people actually read at:
 * the distribution first, then the words.
 *
 * Baymard's five requirements for the distribution summary are the spine of
 * this: it's a bar chart, the bars ARE the star filters, it's open by default,
 * the filters behave like radio buttons rather than checkboxes, and it hides
 * itself below `show_breakdown` reviews, where a chart of three ratings
 * misleads more than it tells.
 *
 * At a hundred reviews nothing here grows without bound: ten at a time, sorted
 * and filtered by the SERVER, with the page's own count always in view.
 */
export default {
    name: 'ProductReviews',
    components: { Star, MessageCircle, Trash2, Sparkles, Loader2, X },
    props: {
        handle: { type: String, required: true },
    },
    data() {
        return {
            summary: null,
            comments: [],
            total: 0,
            page: 1,
            hasMore: false,
            remainingToday: null,
            stars: null,             // the star filter, or null for all
            sort: 'recent',
            draft: '',
            hoverStars: 0,
            expanded: [],            // review ids opened past the fold
            loading: true,
            listLoading: false,
            busy: '',
            auth: authStore.state,
        };
    },
    computed: {
        signedIn() { return this.auth.signedIn; },
        mine() { return this.summary?.mine || {}; },
        rewards() { return this.summary?.rewards || {}; },
        earned() { return this.mine.earned || []; },
        canEarn() { return this.rewards.enabled && this.signedIn && this.remainingToday !== 0; },
        minLength() { return this.rewards.min_length || 15; },
        commentLeft() { return this.minLength - this.draft.trim().length; },
        showBreakdown() { return !!this.summary?.show_breakdown; },
        sortLabels() {
            return { recent: 'Most recent', highest: 'Highest rated', lowest: 'Lowest rated' };
        },
    },
    watch: {
        handle: 'reload',
    },
    mounted() {
        this.reload();
        window.addEventListener('blessluxe:product-engagement', this.absorb);
    },
    beforeUnmount() {
        window.removeEventListener('blessluxe:product-engagement', this.absorb);
    },
    methods: {
        absorb(e) {
            if (e.detail?.handle === this.handle) this.summary = e.detail.summary;
        },
        publish(summary) {
            this.summary = summary;
            window.dispatchEvent(new CustomEvent('blessluxe:product-engagement', { detail: { handle: this.handle, summary } }));
        },
        query(page) {
            const p = new URLSearchParams({ sort: this.sort, page: String(page) });
            if (this.stars) p.set('stars', String(this.stars));

            return p.toString();
        },
        async reload() {
            this.loading = true;
            await this.fetch(1, false);
            this.loading = false;
        },
        /** `append` keeps what's on screen and adds the next page under it. */
        async fetch(page, append) {
            this.listLoading = true;
            try {
                const d = await api.get(`/api/store/products/${encodeURIComponent(this.handle)}/engagement?${this.query(page)}`);
                if (d.summary) this.summary = d.summary;
                if (d.remaining_today !== undefined) this.remainingToday = d.remaining_today;
                this.comments = append ? this.comments.concat(d.comments || []) : (d.comments || []);
                this.total = d.total || 0;
                this.page = d.page || page;
                this.hasMore = !!d.has_more;
            } catch { /* leave what's on screen rather than blanking it */ }
            finally { this.listLoading = false; }
        },
        /** Radio-like, per Baymard: picking a level replaces the last, and picking it again clears. */
        filterBy(n) {
            this.stars = this.stars === n ? null : n;
            this.fetch(1, false);
        },
        setSort(e) {
            this.sort = e.target.value;
            this.fetch(1, false);
        },
        barWidth(n) {
            const top = Math.max(...Object.values(this.summary?.breakdown || { 1: 0 }));

            return top > 0 ? `${Math.round((n / top) * 100)}%` : '0%';
        },
        toLogin() {
            this.$router.push({ path: '/account/login', query: { next: this.$route.fullPath } });
        },
        handledAuth(e) {
            if (e?.status !== 401) return false;
            this.toLogin();

            return true;
        },
        after(d) {
            this.publish(d.summary);
            if (d.remaining_today !== undefined) this.remainingToday = d.remaining_today;
            if (d.bees) toast(`+${d.bees} Bees — thank you`, { tone: 'success' });
        },
        async rate(n) {
            if (this.busy) return;
            this.busy = 'rate';
            try {
                this.after(await api.post(`/api/account/products/${encodeURIComponent(this.handle)}/rating`, { stars: n }));
            } catch (e) { if (!this.handledAuth(e)) toast(e.payload?.error || 'Could not save that rating.', { tone: 'error' }); }
            finally { this.busy = ''; }
        },
        async send() {
            if (this.busy) return;
            const body = this.draft.trim();
            if (body.length < this.minLength) return;
            this.busy = 'comment';
            try {
                const d = await api.post(`/api/account/products/${encodeURIComponent(this.handle)}/comments`, { body });
                this.after(d);
                this.draft = '';
                // Straight back to the top of the list, unfiltered, so they see it.
                this.stars = null;
                this.sort = 'recent';
                await this.fetch(1, false);
            } catch (e) { if (!this.handledAuth(e)) toast(e.payload?.error || 'Could not post that.', { tone: 'error' }); }
            finally { this.busy = ''; }
        },
        async remove(c) {
            if (this.busy) return;
            this.busy = c.id;
            try {
                await api.del(`/api/account/product-comments/${encodeURIComponent(c.id)}`);
                await this.fetch(1, false);
            } catch { toast('Could not remove that.', { tone: 'error' }); }
            finally { this.busy = ''; }
        },
        toggle(id) {
            this.expanded = this.expanded.includes(id) ? this.expanded.filter((x) => x !== id) : this.expanded.concat(id);
        },
        long(c) { return c.body.length > 260; },
        when(iso) {
            const d = new Date(iso);
            const days = Math.floor((Date.now() - d.getTime()) / 86400000);
            if (days < 1) return 'Today';
            if (days === 1) return 'Yesterday';
            if (days < 30) return `${days} days ago`;

            return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        },
    },
};
</script>

<template>
    <section v-if="!loading && summary" id="reviews" class="max-w-[1400px] mx-auto px-[5%] py-12 border-t border-gold/10 scroll-mt-24">
        <header class="text-center mb-10">
            <p class="font-script text-2xl text-gold">What people say</p>
            <h2 class="font-display text-2xl tracking-widest uppercase">Reviews</h2>
        </header>

        <div class="lg:grid lg:grid-cols-12 lg:gap-12">
            <!-- ─── The verdict, and the way to add to it ─────────────── -->
            <div class="lg:col-span-4 mb-10 lg:mb-0">
                <div v-if="summary.rating_count" class="flex items-end gap-3 mb-4">
                    <p class="font-display text-5xl leading-none">{{ summary.average_label }}</p>
                    <div class="pb-1">
                        <span class="flex items-center">
                            <Star v-for="n in 5" :key="n" class="w-4 h-4" :class="n <= Math.round(summary.average) ? 'text-gold fill-gold' : 'text-black/15'" />
                        </span>
                        <p class="text-xs text-black/55 mt-1">{{ summary.rating_count }} rating{{ summary.rating_count === 1 ? '' : 's' }}</p>
                    </div>
                </div>
                <p v-else class="text-sm text-black/55 mb-4">Nobody has rated this piece yet.</p>

                <!-- The bars ARE the filters. Hidden while too few to read into. -->
                <div v-if="showBreakdown" class="space-y-1 mb-6">
                    <button
                        v-for="n in [5, 4, 3, 2, 1]"
                        :key="n"
                        @click="filterBy(n)"
                        :class="['w-full flex items-center gap-3 px-2 py-1.5 -mx-2 text-left transition-colors', stars === n ? 'bg-cream-dark' : 'hover:bg-cream-dark/50']"
                        :aria-pressed="stars === n"
                        :title="`Only reviews that rated it ${n}`"
                    >
                        <span class="w-9 text-xs text-black/60 flex items-center gap-1">{{ n }} <Star class="w-3 h-3 text-gold fill-gold" /></span>
                        <span class="flex-1 h-1.5 bg-black/8">
                            <span class="block h-full bg-gold transition-all" :style="{ width: barWidth(summary.breakdown[n]) }"></span>
                        </span>
                        <span class="w-8 text-right text-xs tabular-nums text-black/55">{{ summary.breakdown[n] }}</span>
                    </button>
                    <button v-if="stars" @click="filterBy(stars)" class="text-[10px] tracking-widest uppercase text-gold-dark hover:text-gold underline underline-offset-4 min-h-11">
                        Show all ratings
                    </button>
                </div>

                <!-- Rate it, then say why -->
                <div class="border border-gold/20 bg-cream-dark/30 p-4">
                    <p class="text-[10px] tracking-widest uppercase text-black/55 mb-3">
                        {{ mine.stars ? 'Your rating' : 'Rate this piece' }}
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
                            <Star class="w-6 h-6 transition-colors" :class="n <= (hoverStars || mine.stars) ? 'text-gold fill-gold' : 'text-black/20'" />
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
            </div>

            <!-- ─── What everyone said ───────────────────────────────── -->
            <div class="lg:col-span-8">
                <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-black/10">
                    <p class="text-xs text-black/55 flex items-center gap-2">
                        <MessageCircle class="w-3.5 h-3.5 text-gold" />
                        <span v-if="total">Showing {{ comments.length }} of {{ total }}</span>
                        <span v-else>No reviews yet</span>
                        <button v-if="stars" @click="filterBy(stars)" class="inline-flex items-center gap-1 bg-cream-dark px-2 py-1 text-[10px] tracking-widest uppercase hover:text-gold transition-colors">
                            {{ stars }} star only <X class="w-3 h-3" />
                        </button>
                    </p>
                    <label v-if="total > 1" class="flex items-center gap-2 text-xs text-black/55">
                        Sort
                        <select :value="sort" @change="setSort" class="border border-black/15 bg-white px-3 py-2 text-sm focus:outline-none focus:border-gold">
                            <option v-for="(label, key) in sortLabels" :key="key" :value="key">{{ label }}</option>
                        </select>
                    </label>
                </div>

                <p v-if="!comments.length && !listLoading" class="text-sm text-black/55 py-10 text-center">
                    <template v-if="stars">Nobody who gave {{ stars }} star{{ stars === 1 ? '' : 's' }} has written anything yet.</template>
                    <template v-else>No reviews yet — yours would be the first.</template>
                </p>

                <ul class="divide-y divide-black/10">
                    <li v-for="c in comments" :key="c.id" :class="['py-5', busy === c.id && 'opacity-50']">
                        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5">
                            <span v-if="c.stars" class="flex items-center">
                                <Star v-for="n in 5" :key="n" class="w-3.5 h-3.5" :class="n <= c.stars ? 'text-gold fill-gold' : 'text-black/15'" />
                            </span>
                            <span class="text-sm font-medium">{{ c.author }}</span>
                            <span v-if="c.verified" class="text-[9px] tracking-widest uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5">Bought it</span>
                            <span class="text-xs text-black/40">{{ when(c.created_at) }}</span>
                            <button
                                v-if="c.mine"
                                @click="remove(c)"
                                class="ml-auto w-8 h-8 inline-flex items-center justify-center text-black/30 hover:text-red-600 transition-colors"
                                title="Remove your review"
                                aria-label="Remove your review"
                            >
                                <Trash2 class="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <p :class="['text-sm text-black/75 leading-relaxed whitespace-pre-line', long(c) && !expanded.includes(c.id) && 'line-clamp-4']">{{ c.body }}</p>
                        <button v-if="long(c)" @click="toggle(c.id)" class="text-[10px] tracking-widest uppercase text-gold-dark hover:text-gold underline underline-offset-4 mt-1.5">
                            {{ expanded.includes(c.id) ? 'Show less' : 'Read more' }}
                        </button>
                    </li>
                </ul>

                <div v-if="hasMore" class="pt-6 text-center">
                    <button
                        @click="fetch(page + 1, true)"
                        :disabled="listLoading"
                        class="inline-flex items-center gap-2 border border-black/20 px-6 py-3 text-[10px] font-semibold tracking-[0.2em] uppercase hover:border-black/50 transition-colors disabled:opacity-50"
                    >
                        <Loader2 v-if="listLoading" class="w-3.5 h-3.5 animate-spin" />
                        Show more reviews
                    </button>
                </div>
            </div>
        </div>
    </section>
</template>
