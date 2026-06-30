<script>
export default {
    name: 'HomePage',
    data() {
        return {
            heroSlide: {
                heading: 'Embrace Your Luxe',
                subheading: 'Discover the art of effortless elegance',
                ctaLabel: 'Shop Collection',
                ctaHref: '/shop',
            },
            categories: [
                { label: 'Women', href: '/shop?category=women', accent: 'from-amber-200/40 to-rose-200/30' },
                { label: 'Men',   href: '/shop?category=men',   accent: 'from-zinc-200/50 to-zinc-300/30' },
                { label: 'Children', href: '/shop?category=children', accent: 'from-pink-200/40 to-amber-100/40' },
                { label: 'Packs',    href: '/shop/packs',         accent: 'from-amber-300/40 to-amber-100/30' },
            ],
        };
    },
};
</script>

<template>
    <div>
        <!-- Hero -->
        <section class="relative h-[80vh] min-h-[560px] overflow-hidden bg-gradient-to-br from-cream via-blush to-cream-dark">
            <div class="relative z-10 h-full flex items-center justify-center text-center px-6">
                <div class="max-w-3xl">
                    <p class="font-script text-4xl md:text-5xl text-gold mb-3">Welcome to BlessLuxe</p>
                    <h1 class="font-display text-5xl md:text-7xl tracking-tight text-black mb-4">
                        {{ heroSlide.heading }}
                    </h1>
                    <p class="font-body text-base md:text-lg text-black/70 mb-8 tracking-wide">
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

        <!-- Shop By Category -->
        <section class="py-20 max-w-[1400px] mx-auto px-[5%]">
            <div class="text-center mb-12">
                <p class="font-script text-3xl text-gold mb-2">Discover</p>
                <h2 class="font-display text-3xl md:text-4xl tracking-widest uppercase">Shop By Category</h2>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <a
                    v-for="c in categories"
                    :key="c.label"
                    :href="c.href"
                    :class="['group relative aspect-[3/4] bg-gradient-to-br overflow-hidden cursor-pointer', c.accent]"
                >
                    <div class="absolute inset-0 flex items-end justify-center pb-10">
                        <span class="font-display text-2xl tracking-widest uppercase text-black group-hover:text-gold transition-colors">
                            {{ c.label }}
                        </span>
                    </div>
                </a>
            </div>
        </section>

        <!-- Featured Products placeholder (Milestone 3 will populate from MySQL) -->
        <section class="py-20 max-w-[1400px] mx-auto px-[5%] border-t border-gold/10">
            <div class="text-center mb-12">
                <p class="font-script text-3xl text-gold mb-2">Featured</p>
                <h2 class="font-display text-3xl md:text-4xl tracking-widest uppercase">New Arrivals</h2>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <div v-for="n in 8" :key="n" class="aspect-[3/4] bg-gradient-to-br from-cream-dark to-blush" />
            </div>
            <p class="text-center text-xs text-black/50 mt-8 tracking-widest uppercase">
                Product grid wires up in Milestone 3 (MySQL catalogue)
            </p>
        </section>
    </div>
</template>
