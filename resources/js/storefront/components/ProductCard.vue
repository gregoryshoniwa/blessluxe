<script>
import { Heart } from 'lucide-vue-next';
import { wishlist } from '../wishlist-store.js';

export default {
    name: 'ProductCard',
    components: { Heart },
    props: {
        product: { type: Object, required: true },
    },
    data() {
        return { liked: false };
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
    <router-link :to="`/shop/${product.handle}`" class="block group relative">
        <button
            @click="toggle"
            class="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-white/85 backdrop-blur flex items-center justify-center shadow-sm hover:bg-white transition-colors"
            :aria-label="liked ? 'Remove from wishlist' : 'Add to wishlist'"
            :title="liked ? 'Remove from wishlist' : 'Save to wishlist'"
        >
            <Heart :class="['w-4 h-4 transition-colors', liked ? 'fill-gold text-gold' : 'text-black/55 hover:text-gold']" />
        </button>
        <div class="aspect-[3/4] bg-cream-dark mb-2 overflow-hidden group-hover:opacity-90 transition-opacity">
            <img
                v-if="product.thumbnail"
                :src="product.thumbnail"
                :alt="product.title"
                class="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            />
        </div>
        <p class="font-display text-sm leading-tight line-clamp-1 group-hover:text-gold transition-colors">
            {{ product.title }}
        </p>
        <p v-if="product.subtitle" class="text-[10px] text-black/55 line-clamp-1">{{ product.subtitle }}</p>
        <p class="text-xs text-black mt-0.5">{{ product.price_label || '—' }}</p>
    </router-link>
</template>
