<script>
import { Heart, Play, Star, ShoppingBag } from 'lucide-vue-next';
import { wishlist } from '../wishlist-store.js';

export default {
    name: 'ProductCard',
    components: { Heart, Play, Star, ShoppingBag },
    props: {
        product: { type: Object, required: true },
    },
    data() {
        return { liked: false, hovering: false };
    },
    computed: {
        /** Which pieces of social proof this product actually has. */
        signals() {
            return [this.product.rating, this.product.likes, this.product.purchases].filter(Boolean);
        },
        video() { return this.product.video || null; },
        // Autoplaying, muted, looping, chrome-less YouTube embed for hover.
        youtubeHoverSrc() {
            if (!this.video?.embed_url) return null;
            const id = this.video.embed_url.split('/').pop();
            return `${this.video.embed_url}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&playsinline=1&rel=0&modestbranding=1`;
        },
    },
    mounted() {
        this.liked = wishlist.has(this.product.id);
        window.addEventListener('blessluxe:wishlist-updated', this.sync);
    },
    beforeUnmount() {
        window.removeEventListener('blessluxe:wishlist-updated', this.sync);
    },
    methods: {
        sync() { this.liked = wishlist.has(this.product.id); },
        async toggle(e) {
            e.preventDefault();
            e.stopPropagation();
            this.liked = await wishlist.toggle(this.product.id);
        },
    },
};
</script>

<template>
    <router-link
        :to="`/shop/${product.handle}`"
        class="block group relative border border-black/10 hover:border-gold/40 transition-colors"
        @mouseenter="hovering = true"
        @mouseleave="hovering = false"
    >
        <button
            @click="toggle"
            class="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-white/85 backdrop-blur flex items-center justify-center shadow-sm hover:bg-white transition-colors"
            :aria-label="liked ? 'Remove from wishlist' : 'Add to wishlist'"
            :title="liked ? 'Remove from wishlist' : 'Save to wishlist'"
        >
            <Heart :class="['w-4 h-4 transition-colors', liked ? 'fill-gold text-gold' : 'text-black/55 hover:text-gold']" />
        </button>
        <div class="relative aspect-[3/4] bg-cream-dark overflow-hidden group-hover:opacity-90 transition-opacity">
            <img
                v-if="product.thumbnail"
                :src="product.thumbnail"
                :alt="product.title"
                class="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            />

            <!-- Hover playback: uploaded file plays inline; YouTube embeds a
                 muted looping iframe (pointer-events off so the card still
                 clicks through to the product). -->
            <template v-if="video && hovering">
                <video
                    v-if="video.kind === 'upload'"
                    :src="video.url"
                    autoplay
                    muted
                    loop
                    playsinline
                    class="absolute inset-0 w-full h-full object-cover object-top"
                />
                <iframe
                    v-else-if="youtubeHoverSrc"
                    :src="youtubeHoverSrc"
                    class="absolute inset-0 w-full h-full pointer-events-none"
                    frameborder="0"
                    allow="autoplay; encrypted-media"
                    title="Product video"
                />
            </template>

            <!-- Video badge -->
            <span
                v-if="video"
                class="absolute bottom-2 left-2 z-10 w-6 h-6 rounded-full bg-black/55 backdrop-blur flex items-center justify-center"
                title="This piece has a video"
            >
                <Play class="w-3 h-3 text-white fill-white" />
            </span>
        </div>
        <div class="p-3">
            <p class="font-display text-sm leading-tight line-clamp-1 group-hover:text-gold transition-colors">
                {{ product.title }}
            </p>
            <p v-if="product.subtitle" class="text-[10px] text-black/55 line-clamp-1">{{ product.subtitle }}</p>
            <p class="text-xs text-black mt-0.5">{{ product.price_label || '—' }}</p>

            <!-- What other people made of it. Each part appears only once it's
                 true, so a new piece shows a clean card rather than three zeros. -->
            <p v-if="signals.length" class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-black/55 mt-1.5">
                <span v-if="product.rating" class="inline-flex items-center gap-1" :title="`${product.rating.average_label} out of 5 from ${product.rating.count} rating${product.rating.count === 1 ? '' : 's'}`">
                    <Star class="w-3 h-3 text-gold fill-gold" />
                    <span class="font-medium text-black/75">{{ product.rating.average_label }}</span>
                    <span>({{ product.rating.count }})</span>
                </span>
                <span v-if="product.likes" class="inline-flex items-center gap-1" :title="`Loved by ${product.likes}`">
                    <Heart class="w-3 h-3 text-gold fill-gold" />
                    {{ product.likes }}
                </span>
                <span v-if="product.purchases" class="inline-flex items-center gap-1" :title="`${product.purchases} bought`">
                    <ShoppingBag class="w-3 h-3 text-gold" />
                    {{ product.purchases }} bought
                </span>
            </p>
        </div>
    </router-link>
</template>
