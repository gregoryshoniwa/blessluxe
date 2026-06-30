<script>
import ProductCard from '../components/ProductCard.vue';

export default {
    name: 'HomePage',
    components: { ProductCard },
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
            headings: [],
            featured: [],
            loadingFeatured: true,
        };
    },
    mounted() {
        this.fetchHeadings();
        this.fetchFeatured();
        this.fetchHero();
    },
    methods: {
        async fetchHeadings() {
            const res = await fetch('/api/store/headings');
            if (!res.ok) return;
            const data = await res.json();
            // Keep first 4 non-sale headings as the "Shop By Category" cards.
            this.headings = (data.headings || []).filter((h) => !h.is_sale).slice(0, 4);
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
                const res = await fetch('/api/store/announcements?position=hero');
                if (!res.ok) return;
                const data = await res.json();
                const first = (data.announcements || [])[0];
                if (!first) return;
                this.heroSlide = {
                    heading:    first.heading    || this.heroSlide.heading,
                    subheading: first.subheading || this.heroSlide.subheading,
                    ctaLabel:   first.cta_label  || this.heroSlide.ctaLabel,
                    ctaHref:    first.cta_href   || this.heroSlide.ctaHref,
                    media_url:  first.media_url  || null,
                    media_type: first.media_type || 'image',
                };
            } catch { /* default copy stays */ }
        },
    },
};
</script>

<template>
    <div>
        <!-- Hero -->
        <section class="relative h-[80vh] min-h-[560px] overflow-hidden bg-gradient-to-br from-cream via-blush to-cream-dark">
            <!-- Background media (from /api/store/announcements?position=hero) -->
            <template v-if="heroSlide.media_url">
                <video v-if="heroSlide.media_type === 'video'" :src="heroSlide.media_url" class="absolute inset-0 w-full h-full object-cover" autoplay muted loop playsinline />
                <img  v-else :src="heroSlide.media_url" :alt="heroSlide.heading" class="absolute inset-0 w-full h-full object-cover object-top" />
                <div class="absolute inset-0 bg-black/30"></div>
            </template>

            <div class="relative z-10 h-full flex items-center justify-center text-center px-6">
                <div :class="['max-w-3xl', heroSlide.media_url && 'text-white']">
                    <p :class="['font-script text-4xl md:text-5xl mb-3', heroSlide.media_url ? 'text-white' : 'text-gold']">Welcome to BlessLuxe</p>
                    <h1 :class="['font-display text-5xl md:text-7xl tracking-tight mb-4', heroSlide.media_url ? 'text-white' : 'text-black']">
                        {{ heroSlide.heading }}
                    </h1>
                    <p :class="['font-body text-base md:text-lg mb-8 tracking-wide', heroSlide.media_url ? 'text-white/85' : 'text-black/70']">
                        {{ heroSlide.subheading }}
                    </p>
                    <router-link
                        :to="heroSlide.ctaHref"
                        class="inline-block bg-gold text-white px-10 py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors"
                    >
                        {{ heroSlide.ctaLabel }}
                    </router-link>
                </div>
            </div>
        </section>

        <!-- Shop By Category (driven by /api/store/headings) -->
        <section v-if="headings.length" class="py-20 max-w-[1400px] mx-auto px-[5%]">
            <div class="text-center mb-12">
                <p class="font-script text-3xl text-gold mb-2">Discover</p>
                <h2 class="font-display text-3xl md:text-4xl tracking-widest uppercase">Shop By Category</h2>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <router-link
                    v-for="(h, i) in headings"
                    :key="h.handle"
                    :to="`/shop?heading=${h.handle}`"
                    :class="[
                        'group relative aspect-[3/4] overflow-hidden cursor-pointer bg-gradient-to-br',
                        i % 2 === 0 ? 'from-amber-200/40 to-rose-200/30' : 'from-pink-200/40 to-amber-100/40',
                    ]"
                >
                    <div class="absolute inset-0 flex items-end justify-center pb-10">
                        <span class="font-display text-2xl tracking-widest uppercase text-black group-hover:text-gold transition-colors">
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
            <div v-else-if="!featured.length" class="text-center text-sm text-black/55">
                No products yet — run <code>php artisan db:seed</code> in <code>Lavavel_Version/</code>.
            </div>
            <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <ProductCard v-for="p in featured" :key="p.id" :product="p" />
            </div>
            <div class="text-center mt-12">
                <router-link
                    to="/shop"
                    class="inline-block border border-gold text-gold px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold hover:text-white transition-colors"
                >
                    View All
                </router-link>
            </div>
        </section>
    </div>
</template>
