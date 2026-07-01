<script>
import { api } from '../../lib/api.js';
import ProductStrip from '../components/ProductStrip.vue';
import { recentlyViewed } from '../recently-viewed.js';

export default {
    name: 'ProductDetailPage',
    components: { ProductStrip },
    data() {
        return {
            product: null,
            loading: true,
            notFound: false,
            selectedVariantId: null,
            quantity: 1,
            adding: false,
            justAdded: false,
            addError: '',
            // Expose the module so the template can read `recentlyViewed.ids(...)`.
            recentlyViewed,
        };
    },
    computed: {
        handle() {
            return this.$route.params.handle;
        },
        selectedVariant() {
            if (!this.product) return null;
            return this.product.variants.find((v) => v.id === this.selectedVariantId) || this.product.variants[0] || null;
        },
        priceLabel() {
            const cents = this.selectedVariant?.price;
            return cents != null ? '$' + (cents / 100).toFixed(2) : '—';
        },
        heroImage() {
            if (!this.product) return null;
            const primary = (this.product.media || []).find((m) => m.is_primary && m.media_type === 'image');
            return primary?.media_url || this.product.images?.[0]?.url || this.product.thumbnail || null;
        },
        breadcrumb() {
            if (!this.product?.catalogues?.length) return null;
            const c = this.product.catalogues[0];
            return c.heading
                ? `${c.heading.name} · ${c.name}`
                : c.name;
        },
        inStock() {
            const v = this.selectedVariant;
            if (!v) return false;
            if (!v.manage_inventory) return true;
            return (v.inventory_quantity || 0) > 0;
        },
    },
    watch: {
        handle: {
            immediate: true,
            handler() { this.fetchProduct(); },
        },
    },
    methods: {
        async fetchProduct() {
            this.loading = true;
            this.notFound = false;
            try {
                const res = await fetch(`/api/store/products/${encodeURIComponent(this.handle)}`);
                if (res.status === 404) {
                    this.notFound = true;
                    return;
                }
                if (!res.ok) return;
                const data = await res.json();
                this.product = data.product;
                this.selectedVariantId = this.product.variants?.[0]?.id || null;
                // Stamp this view onto the recently-viewed list.
                recentlyViewed.record(this.product.id);
            } finally {
                this.loading = false;
            }
        },
        async addToCart() {
            if (!this.selectedVariant) return;
            this.adding = true;
            this.addError = '';
            this.justAdded = false;
            try {
                await api.post('/api/store/cart/line-items', {
                    variant_id: this.selectedVariant.id,
                    quantity:   this.quantity,
                });
                this.justAdded = true;
                // Let the header refresh its cart-count badge.
                window.dispatchEvent(new CustomEvent('blessluxe:cart-updated'));
                setTimeout(() => { this.justAdded = false; }, 1800);
            } catch (e) {
                this.addError = e.payload?.error || 'Could not add to bag.';
            } finally {
                this.adding = false;
            }
        },
    },
};
</script>

<template>
    <div class="max-w-[1400px] mx-auto px-[5%] py-12 min-h-[60vh]">
        <div v-if="loading" class="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-pulse">
            <div class="aspect-[3/4] bg-cream-dark" />
            <div class="space-y-4">
                <div class="h-3 w-1/4 bg-cream-dark" />
                <div class="h-8 w-3/4 bg-cream-dark" />
                <div class="h-4 w-1/3 bg-cream-dark" />
                <div class="h-7 w-1/4 bg-cream-dark mt-4" />
                <div class="h-16 w-full bg-cream-dark mt-6" />
                <div class="grid grid-cols-5 gap-2 mt-8">
                    <div v-for="n in 5" :key="n" class="h-10 bg-cream-dark" />
                </div>
                <div class="h-12 w-full bg-cream-dark mt-8" />
            </div>
        </div>

        <div v-else-if="notFound" class="text-center py-24">
            <p class="font-script text-3xl text-gold">404</p>
            <h1 class="font-display text-3xl tracking-widest uppercase mb-2">Product not found</h1>
            <p class="text-sm text-black/65 mb-6">We couldn't find a product with that handle.</p>
            <router-link to="/shop" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Back to Shop
            </router-link>
        </div>

        <div v-else-if="product" class="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div class="aspect-[3/4] bg-cream-dark overflow-hidden">
                <img
                    v-if="heroImage"
                    :src="heroImage"
                    :alt="product.title"
                    class="w-full h-full object-cover object-top"
                />
            </div>
            <div>
                <p v-if="breadcrumb" class="text-[10px] tracking-widest uppercase text-black/55 mb-2">{{ breadcrumb }}</p>
                <h1 class="font-display text-3xl md:text-4xl mb-2">{{ product.title }}</h1>
                <p v-if="product.subtitle" class="text-sm text-black/55 mb-3">{{ product.subtitle }}</p>
                <p class="text-2xl text-gold-dark mb-6">{{ priceLabel }}</p>

                <p v-if="product.description" class="text-sm text-black/70 leading-relaxed mb-8">
                    {{ product.description }}
                </p>

                <div v-if="product.variants.length" class="mb-6">
                    <p class="text-xs tracking-widest uppercase text-black/55 mb-2">
                        Size · {{ selectedVariant?.title || '—' }}
                    </p>
                    <div class="flex flex-wrap gap-2">
                        <button
                            v-for="v in product.variants"
                            :key="v.id"
                            @click="selectedVariantId = v.id"
                            :class="[
                                'border px-4 py-2 text-sm transition-colors',
                                selectedVariantId === v.id ? 'border-gold text-gold' : 'border-black/15 hover:border-gold',
                            ]"
                        >
                            {{ v.title }}
                        </button>
                    </div>
                </div>

                <div class="flex items-center gap-3 mb-8">
                    <div class="flex border border-black/15">
                        <button @click="quantity = Math.max(1, quantity - 1)" class="px-3 py-2 hover:bg-cream-dark">−</button>
                        <span class="px-4 py-2 min-w-[40px] text-center">{{ quantity }}</span>
                        <button @click="quantity++" class="px-3 py-2 hover:bg-cream-dark">+</button>
                    </div>
                    <p v-if="!inStock" class="text-sm text-red-600">Out of stock</p>
                </div>

                <button
                    @click="addToCart"
                    :disabled="!inStock || adding"
                    class="w-full bg-gold text-white py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {{ adding ? 'Adding…' : justAdded ? 'Added to Bag ✓' : inStock ? 'Add to Bag' : 'Unavailable' }}
                </button>
                <p v-if="addError" class="text-sm text-red-600 mt-3">{{ addError }}</p>
                <router-link v-if="justAdded" to="/cart" class="block text-center text-xs tracking-widest uppercase text-gold-dark hover:text-gold mt-3 underline">
                    View cart →
                </router-link>
            </div>
        </div>

        <!-- Related products: same catalogue with fallback to heading. -->
        <ProductStrip
            v-if="product && !notFound"
            title="You may also love"
            script="Curated"
            :endpoint="`/api/store/products/${encodeURIComponent(product.handle)}/related`"
            :limit="6"
        />

        <!-- Recently viewed strip — excludes the current product so the
             customer doesn't see what they're already looking at. -->
        <ProductStrip
            v-if="product"
            title="Recently viewed"
            script="Your edit"
            :ids="recentlyViewed.ids(product.id)"
            :limit="6"
        />
    </div>
</template>
