<script>
import ProductCard from '../components/ProductCard.vue';
import { affiliateStore } from '../affiliate-store.js';
import { Search, X } from 'lucide-vue-next';

export default {
    name: 'ShopPage',
    components: { ProductCard, Search, X },
    data() {
        return {
            products: [],
            pagination: null,
            headings: [],
            loading: true,
            page: 1,
            sort: 'newest',
            search: this.$route.query.q || '',
            searchTimer: null,
        };
    },
    computed: {
        curated() { return affiliateStore.isCurated(); },
        shopName() { return affiliateStore.state.affiliate?.name || affiliateStore.state.affiliate?.code || 'This shop'; },
        // "Nothing matches your filters" and "there is nothing here at all" are
        // different problems with different ways out.
        filtering() { return Object.keys(this.$route.query).length > 0; },
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
                const q = this.$route.query.q || '';
                if (q !== this.search.trim()) this.search = q;
                this.page = 1;
                this.fetchProducts();
            },
            deep: true,
        },
    },
    beforeUnmount() {
        window.removeEventListener('blessluxe:affiliate-changed', this.reloadForShop);
        clearTimeout(this.searchTimer);
    },
    mounted() {
        affiliateStore.refresh();
        window.addEventListener('blessluxe:affiliate-changed', this.reloadForShop);
        this.fetchHeadings();
        this.fetchProducts();
    },
    methods: {
        titleCase(s) { return s.replace(/\b\w/g, (m) => m.toUpperCase()); },
        /**
         * Search as they type. `replace`, not `push`: typing "dress" would
         * otherwise stack five history entries to reverse out of. The route is
         * still the truth, so a search survives a refresh and can be shared.
         */
        onSearch() {
            clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => {
                const q = this.search.trim();
                if ((this.$route.query.q || '') === q) return;
                const query = { ...this.$route.query };
                if (q) query.q = q; else delete query.q;
                this.$router.replace({ query });
            }, 300);
        },
        clearSearch() {
            this.search = '';
            this.onSearch();
        },
        // Leaving (or entering) an affiliate's shop changes the catalogue
        // without changing the route, so nothing else would trigger a reload.
        reloadForShop() {
            this.page = 1;
            this.fetchHeadings();
            this.fetchProducts();
        },
        leaveShop() { affiliateStore.clear(); },
        async fetchHeadings() {
            const res = await fetch('/api/store/headings', { credentials: 'include', cache: 'no-store' });
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

        <div class="grid grid-cols-12 gap-y-8 gap-x-0 lg:gap-x-8">
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
                <!-- Searches this collection as you type; the address keeps up so it's shareable. -->
                <div class="relative mb-6">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35 pointer-events-none" />
                    <input
                        v-model="search"
                        @input="onSearch"
                        type="search"
                        enterkeyhint="search"
                        :placeholder="`Search ${title === 'All' ? 'the collection' : title}`"
                        aria-label="Search this collection"
                        class="w-full border border-black/15 bg-white pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-gold"
                    />
                    <button
                        v-if="search"
                        @click="clearSearch"
                        class="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center text-black/40 hover:text-gold transition-colors"
                        title="Clear the search"
                        aria-label="Clear the search"
                    >
                        <X class="w-4 h-4" />
                    </button>
                </div>

                <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                    <div v-for="n in 12" :key="n" class="aspect-[3/4] bg-gradient-to-br from-cream-dark to-blush animate-pulse" />
                </div>
                <div v-else-if="!products.length" class="text-center py-16 max-w-md mx-auto">
                    <!-- Filters came up empty: the way out is to clear them. -->
                    <template v-if="filtering">
                        <p class="text-sm text-black/55">Nothing matches these filters.</p>
                        <button @click="clearFilters" class="mt-4 text-[11px] tracking-widest uppercase text-gold-dark underline underline-offset-4 hover:text-gold">Clear filters</button>
                    </template>
                    <!-- No filters and still nothing, inside an affiliate's
                         hand-picked shop: they haven't added anything yet.
                         "Clear filters" here was a button that did nothing. -->
                    <template v-else-if="curated">
                        <p class="font-display text-lg tracking-wide mb-2">{{ shopName }} is still choosing their pieces</p>
                        <p class="text-sm text-black/55 leading-relaxed">Nothing has been added to this shop yet. Check back soon — or browse everything BLESSLUXE has to offer.</p>
                        <button @click="leaveShop" class="mt-6 text-[11px] tracking-widest uppercase text-gold-dark underline underline-offset-4 hover:text-gold">Browse the full collection</button>
                    </template>
                    <template v-else>
                        <p class="font-display text-lg tracking-wide mb-2">New pieces are on their way</p>
                        <p class="text-sm text-black/55">Our next arrivals are being prepared. Please check back soon.</p>
                    </template>
                </div>
                <div v-else>
                    <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
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
