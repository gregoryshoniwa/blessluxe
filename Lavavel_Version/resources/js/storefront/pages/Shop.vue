<script>
import ProductCard from '../components/ProductCard.vue';

export default {
    name: 'ShopPage',
    components: { ProductCard },
    data() {
        return {
            products: [],
            pagination: null,
            headings: [],
            loading: true,
            page: 1,
            sort: 'newest',
        };
    },
    computed: {
        catalogue() { return this.$route.query.catalogue || ''; },
        heading()   { return this.$route.query.heading   || ''; },
        sale()      { return this.$route.query.sale === 'true'; },
        query()     { return this.$route.query.q || ''; },
        title() {
            if (this.sale) return 'Sale';
            if (this.catalogue) return this.titleCase(this.catalogue.replace(/-/g, ' '));
            if (this.heading)   return this.titleCase(this.heading);
            if (this.query)     return `Results for "${this.query}"`;
            return 'All';
        },
        activeCatalogues() {
            // Catalogues to render in the filter rail. If a heading is active,
            // show its children; otherwise show every catalogue grouped.
            if (this.heading) {
                const h = this.headings.find((x) => x.handle === this.heading);
                return h ? h.catalogues : [];
            }
            return this.headings.flatMap((h) => h.catalogues);
        },
    },
    watch: {
        '$route.query': {
            handler() {
                this.page = 1;
                this.fetchProducts();
            },
            deep: true,
        },
    },
    mounted() {
        this.fetchHeadings();
        this.fetchProducts();
    },
    methods: {
        titleCase(s) { return s.replace(/\b\w/g, (m) => m.toUpperCase()); },
        async fetchHeadings() {
            const res = await fetch('/api/store/headings');
            if (!res.ok) return;
            const data = await res.json();
            this.headings = data.headings || [];
        },
        async fetchProducts() {
            this.loading = true;
            try {
                const params = new URLSearchParams();
                params.set('limit', 24);
                params.set('page', this.page);
                params.set('sort', this.sort);
                if (this.catalogue) params.set('catalogue', this.catalogue);
                if (this.heading)   params.set('heading',   this.heading);
                if (this.sale)      params.set('sale',      'true');
                if (this.query)     params.set('q',         this.query);
                const res = await fetch(`/api/store/products?${params.toString()}`);
                if (!res.ok) {
                    this.products = [];
                    return;
                }
                const data = await res.json();
                const fresh = data.products || [];
                this.products = this.page === 1 ? fresh : [...this.products, ...fresh];
                this.pagination = data.pagination || null;
            } finally {
                this.loading = false;
            }
        },
        applyCatalogueFilter(handle) {
            const next = { ...this.$route.query };
            delete next.heading;
            delete next.sale;
            next.catalogue = handle;
            this.$router.push({ path: '/shop', query: next });
        },
        clearFilters() {
            this.$router.push({ path: '/shop' });
        },
        loadMore() {
            if (!this.pagination?.has_more) return;
            this.page += 1;
            this.fetchProducts();
        },
    },
};
</script>

<template>
    <div class="max-w-[1600px] mx-auto px-[5%] py-12">
        <div class="text-center mb-10">
            <p class="font-script text-3xl text-gold mb-2">Curated</p>
            <h1 class="font-display text-4xl md:text-5xl tracking-widest uppercase capitalize">
                {{ title }}
            </h1>
            <p v-if="pagination" class="text-xs text-black/55 mt-2 tracking-widest uppercase">
                {{ pagination.total }} item{{ pagination.total === 1 ? '' : 's' }}
            </p>
        </div>

        <div class="grid grid-cols-12 gap-8">
            <aside class="hidden lg:block lg:col-span-3 border-r border-gold/10 pr-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-display text-sm tracking-widest uppercase text-gold">Filters</h3>
                    <button @click="clearFilters" class="text-[10px] tracking-widest uppercase text-black/55 hover:text-gold transition-colors">
                        Clear
                    </button>
                </div>
                <div class="space-y-6 text-sm">
                    <div v-if="activeCatalogues.length">
                        <p class="font-medium mb-2 text-[10px] tracking-widest uppercase text-black/55">Catalogue</p>
                        <ul class="space-y-1">
                            <li v-for="c in activeCatalogues" :key="c.handle">
                                <button
                                    @click="applyCatalogueFilter(c.handle)"
                                    :class="[
                                        'hover:text-gold transition-colors',
                                        catalogue === c.handle ? 'text-gold' : 'text-black/70',
                                    ]"
                                >
                                    {{ c.name }}
                                </button>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <p class="font-medium mb-2 text-[10px] tracking-widest uppercase text-black/55">Sort</p>
                        <select v-model="sort" @change="fetchProducts" class="w-full border border-black/15 px-3 py-2 text-sm bg-white">
                            <option value="newest">Newest</option>
                            <option value="price-asc">Price · low → high</option>
                            <option value="price-desc">Price · high → low</option>
                        </select>
                    </div>
                </div>
            </aside>

            <div class="col-span-12 lg:col-span-9">
                <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div v-for="n in 9" :key="n" class="aspect-[3/4] bg-gradient-to-br from-cream-dark to-blush animate-pulse" />
                </div>
                <div v-else-if="!products.length" class="text-center text-sm text-black/55 py-16">
                    No products match these filters.
                    <button @click="clearFilters" class="block mx-auto mt-4 underline hover:text-gold">Clear filters</button>
                </div>
                <div v-else>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <ProductCard v-for="p in products" :key="p.id" :product="p" />
                    </div>
                    <div v-if="pagination?.has_more" class="text-center mt-12">
                        <button
                            @click="loadMore"
                            class="inline-block border border-gold text-gold px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold hover:text-white transition-colors"
                        >
                            Load More
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
