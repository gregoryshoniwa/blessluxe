<script>
import { Heart, Play, Star, ShoppingBag, Plane, MapPin } from 'lucide-vue-next';
import { wishlist } from '../wishlist-store.js';

export default {
    name: 'ProductCard',
    components: { Heart, Play, Star, ShoppingBag, Plane, MapPin },
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
            <!-- How soon it can be here: the other half of the price decision. -->
            <span
                v-if="product.sourcing"
                :class="['absolute top-0 left-0 z-10 inline-flex items-center gap-1 px-2 py-1 text-[9px] font-semibold tracking-[0.12em] uppercase text-white',
                         product.sourcing.kind === 'local' ? 'bg-emerald-600/95' : 'bg-black/70 backdrop-blur-sm']"
                :title="product.sourcing.note"
            >
                <component :is="product.sourcing.kind === 'local' ? 'MapPin' : 'Plane'" class="w-2.5 h-2.5" />
                {{ product.sourcing.eta }}
            </span>

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
            <!-- Price leads; what other people made of it answers from the right.
                 Each signal appears only once it's true, so a new piece shows a
                 clean card rather than three zeros. The numbers stand alone —
                 the words that explained them are in the hover hints. -->
            <div class="flex items-baseline justify-between gap-2 mt-0.5">
                <p class="text-xs text-black truncate">{{ product.price_label || '—' }}</p>
                <p v-if="signals.length" class="flex items-center gap-2 text-[11px] text-black/55 flex-shrink-0">
                    <span v-if="product.rating" class="inline-flex items-center gap-1" :title="`Rated ${product.rating.average_label} out of 5 by ${product.rating.count} ${product.rating.count === 1 ? 'person' : 'people'}`">
                        <Star class="w-3 h-3 text-gold fill-gold" />
                        <span class="font-medium text-black/75">{{ product.rating.average_label }}</span>
                    </span>
                    <span v-if="product.likes" class="inline-flex items-center gap-1" :title="`Loved by ${product.likes}`">
                        <Heart class="w-3 h-3 text-gold fill-gold" />
                        {{ product.likes }}
                    </span>
                    <span v-if="product.purchases" class="inline-flex items-center gap-1" :title="`${product.purchases} bought`">
                        <ShoppingBag class="w-3 h-3 text-gold" />
                        {{ product.purchases }}
                    </span>
                </p>
            </div>
        </div>
    </router-link>
</template>
