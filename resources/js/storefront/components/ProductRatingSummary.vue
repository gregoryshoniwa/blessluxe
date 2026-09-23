<script>
import { api } from '../../lib/api.js';
import { toast } from '../../lib/dialog.js';
import { Star, Heart } from 'lucide-vue-next';

/**
 * The one-line verdict beside the buy button: how it's rated, how many love
 * it, and a way down to the reviews. Deliberately small — the decision this
 * column exists for is "add to bag", and a wall of reviews here pushes it off
 * the screen. The reviews themselves live full-width below, in ProductReviews.
 *
 * Both components read one summary and keep in step through the
 * `blessluxe:product-engagement` event, so a heart tapped here moves the count
 * down there without either re-fetching.
 */
export default {
    name: 'ProductRatingSummary',
    components: { Star, Heart },
    props: {
        handle: { type: String, required: true },
        product: { type: Object, required: true },
    },
    data() {
        return {
            summary: null,
            busy: false,
        };
    },
    computed: {
        // Until the summary lands, the product payload already carries the numbers.
        average() { return this.summary ? this.summary.average : (this.product.rating?.average ?? null); },
        averageLabel() { return this.summary ? this.summary.average_label : (this.product.rating?.average_label ?? null); },
        count() { return this.summary ? this.summary.rating_count : (this.product.rating?.count ?? 0); },
        likes() { return this.summary ? this.summary.likes_count : (this.product.likes_count ?? 0); },
        reviews() { return this.summary ? this.summary.comments_count : 0; },
        liked() { return !!this.summary?.mine?.liked; },
    },
    mounted() {
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
        async like() {
            if (this.busy) return;
            this.busy = true;
            try {
                const d = await api.post(`/api/account/products/${encodeURIComponent(this.handle)}/like`);
                this.publish(d.summary);
                if (d.bees) toast(`+${d.bees} Bees — thank you`, { tone: 'success' });
            } catch (e) {
                // The server is the only thing that knows for certain whether
                // this session is still signed in.
                if (e?.status === 401) this.$router.push({ path: '/account/login', query: { next: this.$route.fullPath } });
                else toast(e.payload?.error || 'Could not save that.', { tone: 'error' });
            } finally { this.busy = false; }
        },
        toReviews() {
            document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
    },
};
</script>

<template>
    <div class="flex flex-wrap items-center gap-x-5 gap-y-2 mb-6">
        <button v-if="count" @click="toReviews" class="inline-flex items-center gap-2 min-h-11 hover:text-gold transition-colors" title="Read the reviews">
            <span class="flex items-center">
                <Star v-for="n in 5" :key="n" class="w-4 h-4" :class="n <= Math.round(average) ? 'text-gold fill-gold' : 'text-black/15'" />
            </span>
            <span class="text-sm font-medium">{{ averageLabel }}</span>
            <span class="text-xs text-black/50 underline underline-offset-4 decoration-black/20">
                {{ count }} rating{{ count === 1 ? '' : 's' }}<template v-if="reviews"> · {{ reviews }} review{{ reviews === 1 ? '' : 's' }}</template>
            </span>
        </button>
        <button v-else @click="toReviews" class="text-xs text-black/50 min-h-11 underline underline-offset-4 decoration-black/20 hover:text-gold transition-colors">
            Be the first to rate this piece
        </button>

        <button
            @click="like"
            :disabled="busy"
            :class="['inline-flex items-center gap-2 min-h-11 text-sm transition-colors disabled:opacity-50', liked ? 'text-gold' : 'text-black/60 hover:text-gold']"
            :title="liked ? 'Take back your heart' : 'Love this piece'"
        >
            <Heart class="w-4 h-4" :class="liked && 'fill-gold'" />
            <span>{{ likes }}</span>
        </button>
    </div>
</template>
