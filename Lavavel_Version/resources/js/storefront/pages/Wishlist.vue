<script>
import ProductCard from '../components/ProductCard.vue';
import { wishlist } from '../wishlist-store.js';
import { Heart } from 'lucide-vue-next';

export default {
    name: 'WishlistPage',
    components: { ProductCard, Heart },
    data() {
        return { items: [], loading: true };
    },
    async mounted() {
        await this.refresh();
        window.addEventListener('blessluxe:wishlist-updated', this.refresh);
    },
    beforeUnmount() {
        window.removeEventListener('blessluxe:wishlist-updated', this.refresh);
    },
    methods: {
        async refresh() {
            this.loading = true;
            try { this.items = await wishlist.list(); }
            finally { this.loading = false; }
        },
    },
};
</script>

<template>
    <div class="max-w-[1400px] mx-auto px-[5%] py-12 min-h-[60vh]">
        <header class="text-center mb-12">
            <p class="font-script text-3xl text-gold">Saved</p>
            <h1 class="font-display text-3xl md:text-4xl tracking-widest uppercase flex items-center justify-center gap-2">
                <Heart class="w-5 h-5 text-gold fill-gold" />
                Wishlist
            </h1>
        </header>

        <div v-if="loading" class="text-center py-16 text-[10px] tracking-widest uppercase text-black/55 animate-pulse">Loading your saves…</div>

        <div v-else-if="!items.length" class="text-center py-16">
            <p class="text-black/65 mb-6">Nothing saved yet — tap the heart on any product to keep it here.</p>
            <router-link to="/shop" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Browse Products
            </router-link>
        </div>

        <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <ProductCard v-for="p in items" :key="p.id" :product="p" />
        </div>
    </div>
</template>
