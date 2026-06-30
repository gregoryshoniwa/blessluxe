<script>
export default {
    name: 'ShopPage',
    data() {
        return {
            filters: { category: '', size: '', priceMax: null },
            sort: 'featured',
        };
    },
    computed: {
        activeCategory() {
            return this.$route.query.category || 'All';
        },
    },
};
</script>

<template>
    <div class="max-w-[1600px] mx-auto px-[5%] py-12">
        <div class="text-center mb-10">
            <p class="font-script text-3xl text-gold mb-2">Curated</p>
            <h1 class="font-display text-4xl md:text-5xl tracking-widest uppercase capitalize">
                {{ activeCategory }}
            </h1>
        </div>

        <div class="grid grid-cols-12 gap-8">
            <!-- Filter rail -->
            <aside class="hidden lg:block lg:col-span-3 border-r border-gold/10 pr-6">
                <h3 class="font-display text-sm tracking-widest uppercase text-gold mb-4">Filters</h3>
                <div class="space-y-6 text-sm">
                    <div>
                        <p class="font-medium mb-2">Category</p>
                        <ul class="space-y-1 text-black/70">
                            <li v-for="c in ['Women', 'Men', 'Children', 'Sale']" :key="c">
                                <button class="hover:text-gold transition-colors">{{ c }}</button>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <p class="font-medium mb-2">Size</p>
                        <div class="flex flex-wrap gap-2">
                            <button v-for="s in ['XS','S','M','L','XL']" :key="s" class="border border-black/15 px-3 py-1 text-xs hover:border-gold transition-colors">{{ s }}</button>
                        </div>
                    </div>
                </div>
            </aside>

            <!-- Product grid placeholder -->
            <div class="col-span-12 lg:col-span-9">
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <router-link
                        v-for="n in 12"
                        :key="n"
                        :to="`/shop/sample-product-${n}`"
                        class="block group"
                    >
                        <div class="aspect-[3/4] bg-gradient-to-br from-cream-dark to-blush mb-2 group-hover:opacity-90 transition-opacity" />
                        <p class="font-display text-sm leading-tight">Sample Product {{ n }}</p>
                        <p class="text-xs text-black/70">$249.00</p>
                    </router-link>
                </div>
                <p class="text-center text-xs text-black/50 mt-12 tracking-widest uppercase">
                    Catalogue + filters wire up in Milestone 3
                </p>
            </div>
        </div>
    </div>
</template>
