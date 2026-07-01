<script>
import ProductCard from './ProductCard.vue';
import { api } from '../../lib/api.js';

/**
 * Generic horizontal strip of product cards. Accepts either:
 *   - `ids` array (uses batch endpoint to resolve)  → Recently Viewed
 *   - `endpoint` + `params`  (catalogue / heading fetch)  → Related Products
 *
 * Title + script line render only if we end up with at least one product
 * — keeps the page tidy on cold visits.
 */
export default {
    name: 'ProductStrip',
    components: { ProductCard },
    props: {
        title:   { type: String, required: true },
        script:  { type: String, default: '' },
        ids:     { type: Array,  default: null },
        endpoint:{ type: String, default: null },
        params:  { type: Object, default: () => ({}) },
        limit:   { type: Number, default: 8 },
    },
    data() {
        return { items: [], loading: true };
    },
    watch: {
        ids:    { handler() { this.refresh(); }, deep: true },
        params: { handler() { this.refresh(); }, deep: true },
    },
    mounted() { this.refresh(); },
    methods: {
        async refresh() {
            this.loading = true;
            try {
                if (this.ids) {
                    if (!this.ids.length) { this.items = []; return; }
                    const d = await api.post('/api/store/products/batch', { ids: this.ids.slice(0, this.limit) });
                    this.items = d.products || [];
                } else if (this.endpoint) {
                    const qs = new URLSearchParams({ limit: this.limit, ...this.params });
                    const d = await api.get(`${this.endpoint}?${qs}`);
                    this.items = d.products || [];
                }
            } finally { this.loading = false; }
        },
    },
};
</script>

<template>
    <section v-if="loading || items.length" class="py-12 border-t border-gold/10">
        <div class="text-center mb-6">
            <p v-if="script" class="font-script text-2xl text-gold">{{ script }}</p>
            <h2 class="font-display text-2xl md:text-3xl tracking-widest uppercase">{{ title }}</h2>
        </div>

        <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <div v-for="n in 4" :key="n" class="animate-pulse">
                <div class="aspect-[3/4] bg-cream-dark mb-2"></div>
                <div class="h-3 bg-cream-dark w-2/3 mb-1"></div>
                <div class="h-3 bg-cream-dark w-1/3"></div>
            </div>
        </div>

        <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <ProductCard v-for="p in items" :key="p.id" :product="p" />
        </div>
    </section>
</template>
