<script>
import ProductCard from '../components/ProductCard.vue';
import { affiliateStore } from '../affiliate-store.js';
import HeroSlideshow from '../components/HeroSlideshow.vue';
import ProductStrip from '../components/ProductStrip.vue';
import { recentlyViewed } from '../recently-viewed.js';

export default {
    name: 'HomePage',
    components: { ProductCard, ProductStrip, HeroSlideshow },
    computed: {
        // Inside an affiliate's hand-picked shop: no packs, only their pieces.
        curated() { return affiliateStore.isCurated(); },
        // Packs takes one of the four slots — unless this shop has no packs.
        headings() { return this.allHeadings.slice(0, this.curated ? 4 : 3); },
        shopName() { return this.shop.affiliate?.name || this.shop.affiliate?.code || 'This shop'; },
        recentlyViewedIds() { return recentlyViewed.ids(); },
    },
    data() {
        return {
            // Default slide — used when no active hero announcement exists.
            // The first row coming back from /api/store/announcements wins.
            heroSlide: {
                heading: 'Embrace Your Luxe',
                subheading: 'Discover the art of effortless elegance',
                ctaLabel: 'Shop Collection',
                ctaHref: '/shop',
                media_url: null,
                media_type: 'image',
            },
            featured: [],
            loadingFeatured: true,
            // Cover image for the "Packs" category card — the newest open
            // pack campaign's thumbnail (falls back to a gradient).
            packThumb: null,
            // Every active slide; the slideshow falls back to `heroSlide`'s copy
            // for any field a slide leaves blank, and when there are none.
            heroSlides: [],
            allHeadings: [],
            shop: affiliateStore.state,
        };
    },
    beforeUnmount() {
        window.removeEventListener('blessluxe:affiliate-changed', this.reloadForShop);
    },
    mounted() {
        affiliateStore.refresh();
        // × on the banner (or opening another affiliate's link) changes what
        // this page may show, without changing the route.
        window.addEventListener('blessluxe:affiliate-changed', this.reloadForShop);
        this.fetchHeadings();
        this.fetchFeatured();
        this.fetchHero();
        this.fetchPackThumb();
    },
    methods: {
        reloadForShop() {
            this.fetchHeadings();
            this.fetchFeatured();
            this.fetchPackThumb();
            this.fetchHero();          // their hero, or back to ours
        },
        leaveShop() { affiliateStore.clear(); },
        async fetchHeadings() {
            const res = await fetch('/api/store/headings', { credentials: 'include', cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            // Up to four tiles. The server already narrows these to a curated
            // shop's own categories; the Packs card takes one slot when shown.
            this.allHeadings = (data.headings || []).filter((h) => !h.is_sale);
        },
        async fetchPackThumb() {
            try {
                const res = await fetch('/api/store/packs');
                if (!res.ok) return;
                const data = await res.json();
                this.packThumb = (data.packs || []).find((p) => p.thumbnail)?.thumbnail || null;
            } catch { /* gradient fallback stays */ }
        },
        async fetchFeatured() {
            this.loadingFeatured = true;
            try {
                const res = await fetch('/api/store/products?limit=8&sort=newest');
                if (!res.ok) return;
                const data = await res.json();
                this.featured = data.products || [];
            } finally {
                this.loadingFeatured = false;
            }
        },
        async fetchHero() {
            try {
                const res = await fetch('/api/store/announcements?position=hero', { credentials: 'include', cache: 'no-store' });
                if (!res.ok) return;
                this.heroSlides = (await res.json()).announcements || [];
            } catch { /* the default slide stays */ }
        },
    },
};
</script>

<template>
    <div>
        <!-- Hero — BLESSLUXE's slides, or the affiliate's own inside their
             shop (the server decides which; see ContentController). -->
        <HeroSlideshow :slides="heroSlides" :fallback="heroSlide" />

        <!-- Shop By Category (driven by /api/store/headings) -->
        <section v-if="headings.length" class="py-20 max-w-[1400px] mx-auto px-[5%]">
            <div class="text-center mb-12">
                <p class="font-script text-3xl text-gold mb-2">Discover</p>
                <h2 class="font-display text-3xl md:text-4xl tracking-widest uppercase">Shop By Category</h2>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <!-- Packs — group-buy drops at /shop/packs. Leads the grid,
                     except inside a curated affiliate shop: packs are
                     BLESSLUXE's own, never part of someone's chosen line. -->
                <router-link
                    v-if="!curated"
                    to="/shop/packs"
                    class="group relative aspect-[3/4] overflow-hidden cursor-pointer bg-gradient-to-br from-amber-200/40 to-rose-200/30"
                >
                    <template v-if="packThumb">
                        <img :src="packThumb" alt="Packs" class="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105" />
                        <div class="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent"></div>
                    </template>
                    <div class="absolute inset-0 flex items-end justify-center pb-10">
                        <span :class="['font-display text-2xl tracking-widest uppercase transition-colors group-hover:text-gold', packThumb ? 'text-white' : 'text-black']">
                            Packs
                        </span>
                    </div>
                </router-link>

                <router-link
                    v-for="(h, i) in headings"
                    :key="h.handle"
                    :to="`/shop?heading=${h.handle}`"
                    :class="[
                        'group relative aspect-[3/4] overflow-hidden cursor-pointer bg-gradient-to-br',
                        i % 2 === 0 ? 'from-pink-200/40 to-amber-100/40' : 'from-amber-200/40 to-rose-200/30',
                    ]"
                >
                    <template v-if="h.image_url">
                        <img :src="h.image_url" :alt="h.name" class="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105" />
                        <div class="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent"></div>
                    </template>
                    <div class="absolute inset-0 flex items-end justify-center pb-10">
                        <span :class="['font-display text-2xl tracking-widest uppercase transition-colors group-hover:text-gold', h.image_url ? 'text-white' : 'text-black']">
                            {{ h.name }}
                        </span>
                    </div>
                </router-link>
            </div>
        </section>

        <!-- Featured products (driven by /api/store/products) -->
        <section class="py-20 max-w-[1400px] mx-auto px-[5%] border-t border-gold/10">
            <div class="text-center mb-12">
                <p class="font-script text-3xl text-gold mb-2">Featured</p>
                <h2 class="font-display text-3xl md:text-4xl tracking-widest uppercase">New Arrivals</h2>
            </div>
            <div v-if="loadingFeatured" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <div v-for="n in 8" :key="n" class="aspect-[3/4] bg-gradient-to-br from-cream-dark to-blush animate-pulse" />
            </div>
            <!-- Empty. Written for a SHOPPER — this used to be a developer's
                 note about seeding the database, shown to customers. An empty
                 curated shop also says whose choice that is, and gives a way
                 out, so it never reads as a broken site. -->
            <div v-else-if="!featured.length" class="text-center max-w-md mx-auto">
                <template v-if="curated">
                    <p class="font-display text-lg tracking-wide mb-2">{{ shopName }} is still choosing their pieces</p>
                    <p class="text-sm text-black/55 leading-relaxed">
                        Nothing has been added to this shop yet. Check back soon — or browse everything BLESSLUXE has to offer.
                    </p>
                    <button
                        @click="leaveShop"
                        class="mt-6 text-[11px] tracking-widest uppercase text-gold-dark underline underline-offset-4 hover:text-gold"
                    >
                        Browse the full collection
                    </button>
                </template>
                <template v-else>
                    <p class="font-display text-lg tracking-wide mb-2">New pieces are on their way</p>
                    <p class="text-sm text-black/55">Our next arrivals are being prepared. Please check back soon.</p>
                </template>
            </div>
            <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <ProductCard v-for="p in featured" :key="p.id" :product="p" />
            </div>
            <div v-if="featured.length" class="text-center mt-12">
                <router-link
                    to="/shop"
                    class="inline-block border border-gold text-gold px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold hover:text-white transition-colors"
                >
                    View All
                </router-link>
            </div>
        </section>

        <!-- Recently viewed strip — only renders if there's at least one. -->
        <section v-if="recentlyViewedIds.length" class="max-w-[1400px] mx-auto px-[5%]">
            <ProductStrip
                title="Pick up where you left off"
                script="Just for you"
                :ids="recentlyViewedIds"
                :limit="6"
            />
        </section>
    </div>
</template>
