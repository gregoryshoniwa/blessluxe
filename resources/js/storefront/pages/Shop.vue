<script>
import ProductCard from '../components/ProductCard.vue';
import { affiliateStore } from '../affiliate-store.js';
import { smoothSwap, busy } from '../../lib/smooth.js';
import { Search, X, Sparkles, MapPin, Plane, Star, Play, Tag, ShoppingBag, Loader2, SlidersHorizontal } from 'lucide-vue-next';

// How many pages scrolling may bring in before the button takes over. A module
// const, not a component option: Vue only exposes custom options on
// `this.$options`, so `this.AUTO_PAGES` would be undefined and the comparison
// would quietly disable auto-loading altogether.
const AUTO_PAGES = 3;

/**
 * Women, Men, Children, Sale — every catalogue page. The same shape as the
 * Series feed, so the shop reads as one place:
 *
 *   - one row that sticks under the header, with the pulse of where you are
 *     (pieces · new this fortnight · here now · sold this week) and the search;
 *   - the department's catalogues as chips ACROSS the page — a sidebar of four
 *     links was costing a quarter of the width. The departments themselves are
 *     the header's menu and are not repeated here;
 *   - quick filters as one tap each (Baymard: a horizontal toolbar works when
 *     the filter types are few, and ours are), shown as applied, cleared in one;
 *   - a strip of what just sold here: the piece, never the person;
 *   - the grid, which takes the whole width.
 *
 * Every filter, sort and page is the server's (`/api/store/products?…`), and
 * the address holds the choice so a filtered page is a link someone can send.
 */
export default {
    name: 'ShopPage',
    components: { ProductCard, Search, X, Sparkles, MapPin, Plane, Star, Play, Tag, ShoppingBag, Loader2, SlidersHorizontal },
    data() {
        return {
            products: [],
            pagination: null,
            stats: null,              // { pieces, new, available, sold_week } for where the shopper is
            activity: [],             // what just sold here
            headings: [],
            loading: true,            // the FIRST load: nothing to show yet, so skeletons
            refreshing: false,        // a new question with old answers on screen: dim them
            slow: false,              // a refresh that's taking long enough to want skeletons
            slowTimer: null,
            loadingMore: false,
            page: 1,
            search: this.$route.query.q || '',
            searchTimer: null,
            autoLoads: 0,
            observer: null,
            revealer: null,
            revealed: {},
            headerH: 80,
            headerObs: null,
            now: Date.now(),
        };
    },
    computed: {
        curated() { return affiliateStore.isCurated(); },
        shopName() { return affiliateStore.state.affiliate?.name || affiliateStore.state.affiliate?.code || 'This shop'; },
        q()         { return this.$route.query; },
        catalogue() { return this.q.catalogue || ''; },
        sale()      { return this.q.sale === 'true'; },
        sort()      { return this.q.sort || 'newest'; },
        /** The heading in play — named in the address, or the one the catalogue belongs to. */
        heading() {
            if (this.q.heading) return this.q.heading;
            if (this.catalogue) return this.headings.find((h) => h.catalogues?.some((c) => c.handle === this.catalogue))?.handle || '';
            if (this.sale) return this.headings.find((h) => h.is_sale)?.handle || '';

            return '';
        },
        activeHeading() { return this.headings.find((h) => h.handle === this.heading) || null; },
        title() {
            if (this.q.q && !this.heading && !this.catalogue) return `“${this.q.q}”`;
            if (this.catalogue) return this.activeHeading?.catalogues?.find((c) => c.handle === this.catalogue)?.name || this.catalogue.replace(/-/g, ' ');
            if (this.activeHeading) return this.activeHeading.name;

            return 'The collection';
        },
        /** One tap each. The address carries them, so they survive a refresh and a share. */
        quick() {
            return [
                { key: 'new',       label: 'New in',        icon: 'Sparkles', on: this.q.new === '1',            set: { new: '1' } },
                { key: 'local',     label: 'Available now', icon: 'MapPin',   on: this.q.where === 'local',      set: { where: 'local' } },
                { key: 'import',    label: 'Imported',      icon: 'Plane',    on: this.q.where === 'import',     set: { where: 'import' } },
                { key: 'top',       label: 'Top rated',     icon: 'Star',     on: this.q.top === '1',            set: { top: '1' } },
                { key: 'video',     label: 'With video',    icon: 'Play',     on: this.q.video === '1',          set: { video: '1' } },
                { key: 'under300',  label: 'Under $300',    icon: 'Tag',      on: this.q.max_price === '30000',  set: { max_price: '30000' } },
            ];
        },
        quickOn() { return this.quick.filter((f) => f.on); },
        filtering() { return !!(this.q.q || this.quickOn.length); },
    },
    watch: {
        '$route.query': {
            handler() {
                const q = this.q.q || '';
                if (q !== this.search.trim()) this.search = q;
                this.page = 1;
                this.fetchProducts();
            },
            deep: true,
        },
    },
    mounted() {
        // The bar sticks exactly under the shop header, whatever height that is now.
        const header = document.querySelector('header.sticky');
        if (header) {
            this.headerH = Math.round(header.getBoundingClientRect().height);
            if (typeof ResizeObserver !== 'undefined') {
                this.headerObs = new ResizeObserver(() => { this.headerH = Math.round(header.getBoundingClientRect().height); });
                this.headerObs.observe(header);
            }
        }
        if (typeof IntersectionObserver !== 'undefined') {
            this.revealer = new IntersectionObserver((entries) => {
                for (const e of entries) {
                    if (!e.isIntersecting) continue;
                    this.revealed[e.target.dataset.id] = true;
                    this.revealer.unobserve(e.target);
                }
            }, { rootMargin: '60px' });
        }
        affiliateStore.refresh();
        window.addEventListener('blessluxe:affiliate-changed', this.reloadForShop);
        this.tick = setInterval(() => { this.now = Date.now(); }, 60000);
        this.fetchHeadings();
        this.fetchProducts();
    },
    beforeUnmount() {
        window.removeEventListener('blessluxe:affiliate-changed', this.reloadForShop);
        clearTimeout(this.searchTimer);
        clearInterval(this.tick);
        clearTimeout(this.slowTimer);
        this.observer?.disconnect();
        this.revealer?.disconnect();
        this.headerObs?.disconnect();
    },
    methods: {
        // Leaving (or entering) an affiliate's shop changes the catalogue
        // without changing the route, so nothing else would trigger a reload.
        reloadForShop() {
            this.page = 1;
            this.fetchHeadings();
            this.fetchProducts();
        },
        leaveShop() { affiliateStore.clear(); },
        async fetchHeadings() {
            try {
                const res = await fetch('/api/store/headings', { credentials: 'include', cache: 'no-store' });
                if (res.ok) this.headings = (await res.json()).headings || [];
            } catch { /* the tabs simply don't show */ }
        },
        /**
         * The research is consistent: keep what's on screen, dim it as one area,
         * cross-fade to the new set. Skeletons only on the very first load — or
         * if a refresh drags past 700ms, when dimmed results start to look like
         * the answer. Filtering then never blanks the page.
         */
        async fetchProducts() {
            const append = this.page > 1;
            const first = !append && !this.products.length;
            if (append) this.loadingMore = true;
            else if (first) this.loading = true;
            else {
                this.refreshing = true;
                clearTimeout(this.slowTimer);
                this.slowTimer = setTimeout(() => { this.slow = true; }, 700);
            }
            const done = append ? () => {} : busy();
            try {
                const params = new URLSearchParams({ limit: '24', page: String(this.page), sort: this.sort });
                for (const k of ['catalogue', 'heading', 'q', 'where', 'new', 'top', 'video', 'max_price']) {
                    if (this.q[k]) params.set(k, this.q[k]);
                }
                if (this.sale) params.set('sale', 'true');
                const res = await fetch(`/api/store/products?${params.toString()}`, { credentials: 'include' });
                if (!res.ok) { if (!append) this.products = []; return; }
                const data = await res.json();
                const fresh = data.products || [];
                const apply = () => {
                    this.products = append ? [...this.products, ...fresh] : fresh;
                    this.pagination = data.pagination || null;
                    if (data.stats) this.stats = data.stats;
                    if (data.activity) this.activity = data.activity;
                    // Cards already seen don't fade in again after a re-filter.
                    if (!append) for (const p of fresh) this.revealed[p.id] = true;
                    this.refreshing = false;
                    this.slow = false;
                };
                if (append || first) apply(); else await smoothSwap(apply);
                if (!append) this.autoLoads = 0;          // a new search earns a fresh allowance
                this.$nextTick(this.watchCards);
            } finally {
                clearTimeout(this.slowTimer);
                done();
                this.loading = false;
                this.loadingMore = false;
                this.refreshing = false;
                this.slow = false;
            }
        },
        /** `replace`, not `push`: browsing filters shouldn't fill the back button. */
        setQuery(patch, { push = false } = {}) {
            const query = { ...this.q, ...patch };
            for (const k of Object.keys(query)) if (query[k] === '' || query[k] == null) delete query[k];
            this.$router[push ? 'push' : 'replace']({ path: '/shop', query });
        },
        onSearch() {
            clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => {
                const q = this.search.trim();
                if ((this.q.q || '') !== q) this.setQuery({ q });
            }, 300);
        },
        goCatalogue(c) {
            if (this.catalogue === c.handle) return this.setQuery({ catalogue: '', heading: this.heading });
            this.setQuery({ catalogue: c.handle, heading: '', sale: '' });
        },
        toggleQuick(f) {
            if (f.on) {
                const off = {};
                for (const k of Object.keys(f.set)) off[k] = '';
                return this.setQuery(off);
            }
            // "Available now" and "Imported" are two answers to one question.
            this.setQuery(f.set);
        },
        clearAll() {
            this.search = '';
            const keep = {};
            for (const k of ['heading', 'catalogue', 'sale', 'sort']) if (this.q[k]) keep[k] = this.q[k];
            this.$router.replace({ path: '/shop', query: keep });
        },
        loadMore(auto = false) {
            if (!this.pagination?.has_more || this.loadingMore) return;
            if (auto) this.autoLoads += 1;
            this.page += 1;
            this.fetchProducts();
        },
        /**
         * Cards rise in as they arrive; the next page is fetched before the end
         * is reached — but only AUTO_PAGES times, so the foot of the page (the
         * returns policy, how to reach us) can always be reached.
         */
        watchCards() {
            for (const el of this.$el.querySelectorAll('[data-id]')) {
                if (!this.revealed[el.dataset.id]) this.revealer?.observe(el);
            }
            this.observer?.disconnect();
            const end = this.$refs.tail;
            if (!end || typeof IntersectionObserver === 'undefined') return;
            this.observer = new IntersectionObserver((entries) => {
                if (entries[0]?.isIntersecting && this.autoLoads < AUTO_PAGES) this.loadMore(true);
            }, { rootMargin: '400px' });
            this.observer.observe(end);
        },
        fresh(iso) { return this.now - new Date(iso).getTime() < 86400000; },
        ago(iso) {
            const mins = Math.floor((this.now - new Date(iso).getTime()) / 60000);
            if (mins < 60) return mins < 1 ? 'just now' : `${mins}m ago`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h ago`;

            return `${Math.floor(hrs / 24)}d ago`;
        },
    },
};
</script>

<template>
    <div class="max-w-[1600px] mx-auto px-[5%] pb-14">
        <!-- ─── One row: where you are, how alive it is, search and sort. Sticks. ── -->
        <div class="sticky z-30 -mx-[5%] px-[5%] py-3 bg-cream border-b border-gold/10 flex flex-wrap items-center gap-x-4 gap-y-3" :style="{ top: headerH + 'px' }">
            <h1 class="mr-auto min-w-0">
                <span class="block font-display text-xl md:text-2xl tracking-widest uppercase leading-none truncate">{{ title }}</span>
                <span v-if="stats" class="flex flex-wrap items-center gap-x-2 mt-1.5 text-[11px] tracking-[0.12em] text-black/55">
                    <span><strong class="text-gold-dark font-semibold">{{ stats.pieces }}</strong> pieces</span>
                    <template v-if="stats.new"><span class="text-black/25">·</span><span><strong class="text-gold-dark font-semibold">{{ stats.new }}</strong> new</span></template>
                    <template v-if="stats.available"><span class="text-black/25">·</span><span><strong class="text-emerald-700 font-semibold">{{ stats.available }}</strong> here now</span></template>
                    <template v-if="stats.sold_week"><span class="text-black/25">·</span><span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-red-500 live-dot"></span><strong class="text-black/80 font-semibold">{{ stats.sold_week }}</strong> sold this week</span></template>
                </span>
            </h1>
            <div class="relative w-full sm:w-72">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35 pointer-events-none" />
                <input v-model="search" @input="onSearch" type="search" enterkeyhint="search" :placeholder="`Search ${activeHeading ? activeHeading.name : 'the collection'}`" aria-label="Search"
                    class="w-full border border-black/15 bg-white pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-gold" />
                <button v-if="search" @click="search = ''; onSearch()" class="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center text-black/40 hover:text-gold" title="Clear the search" aria-label="Clear the search"><X class="w-4 h-4" /></button>
            </div>
            <select :value="sort" @change="setQuery({ sort: $event.target.value === 'newest' ? '' : $event.target.value })" aria-label="Sort" class="border border-black/15 bg-white px-3 py-3 text-sm min-h-11 focus:outline-none focus:border-gold">
                <option value="newest">Newest</option>
                <option value="popular">Most loved</option>
                <option value="price-asc">Price · low → high</option>
                <option value="price-desc">Price · high → low</option>
            </select>
        </div>

        <!-- ─── The department's catalogues. The departments themselves are the
             header's menu — repeating them here was the same row twice. ───── -->
        <nav v-if="activeHeading?.catalogues?.length && !curated" class="scroll-strip flex gap-2 pt-5 scroll-px-0" :aria-label="`${activeHeading.name} by category`">
            <button @click="setQuery({ catalogue: '', heading: activeHeading.is_sale ? '' : activeHeading.handle, sale: activeHeading.is_sale ? 'true' : '' })" :aria-pressed="!catalogue"
                :class="['flex-shrink-0 min-h-11 px-4 border text-xs transition-all press', !catalogue ? 'border-gold bg-gold text-white' : 'border-black/15 bg-white text-black/70 hover:border-gold hover:text-gold']">
                All {{ activeHeading.name }}
            </button>
            <button v-for="c in activeHeading.catalogues" :key="c.handle" @click="goCatalogue(c)" :aria-pressed="catalogue === c.handle"
                :class="['flex-shrink-0 min-h-11 px-4 border text-xs transition-all press', catalogue === c.handle ? 'border-gold bg-gold text-white' : 'border-black/15 bg-white text-black/70 hover:border-gold hover:text-gold']">
                {{ c.name }}
            </button>
        </nav>

        <!-- ─── Quick filters: one tap each, applied ones gold, cleared in one ── -->
        <div class="scroll-strip flex items-center gap-2 pt-4 scroll-px-0">
            <SlidersHorizontal class="w-4 h-4 text-black/35 flex-shrink-0" />
            <button v-for="f in quick" :key="f.key" @click="toggleQuick(f)" :aria-pressed="f.on"
                :class="['flex-shrink-0 inline-flex items-center gap-1.5 min-h-9 px-3 border text-xs transition-all press', f.on ? 'border-gold bg-gold/10 text-gold-dark' : 'border-black/12 text-black/65 hover:border-gold/60 hover:text-gold-dark']">
                <component :is="f.icon" :class="['w-3.5 h-3.5', f.on && 'fill-current']" />
                {{ f.label }}
                <X v-if="f.on" class="w-3 h-3 -mr-0.5" />
            </button>
            <button v-if="filtering" @click="clearAll" class="flex-shrink-0 min-h-9 px-2 text-[10px] tracking-widest uppercase text-black/50 hover:text-red-600 underline underline-offset-4">Clear all</button>
        </div>

        <!-- ─── Just sold here: the piece, never the person ─────────────────── -->
        <div v-if="!loading && activity.length >= 2" :class="refreshing && 'is-refreshing'" class="ticker relative overflow-hidden border-y border-gold/15 mt-5 bg-white/60" aria-label="Recently sold">
            <div class="ticker-track flex items-center gap-8 py-2.5 whitespace-nowrap">
                <router-link v-for="(a, i) in activity.concat(activity)" :key="i" :to="`/shop/${a.handle}`" class="inline-flex items-center gap-2.5 text-xs text-black/70 hover:text-gold transition-colors">
                    <img v-if="a.thumbnail" :src="a.thumbnail" :alt="''" loading="lazy" class="w-7 h-7 rounded-full object-cover object-top ring-1 ring-gold/30" />
                    <ShoppingBag v-else class="w-3.5 h-3.5 text-gold" />
                    <span><strong class="font-medium text-black/85">{{ a.title }}</strong><template v-if="a.size"> · size {{ a.size }}</template> {{ fresh(a.at) ? 'just sold' : 'sold' }}</span>
                    <span class="text-black/40">{{ ago(a.at) }}</span>
                </router-link>
            </div>
        </div>

        <!-- ─── The grid: the whole width ──────────────────────────────────── -->
        <div class="mt-6">
            <div v-if="loading || slow" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3" aria-busy="true">
                <div v-for="n in 10" :key="n" class="border border-black/10">
                    <div class="aspect-[3/4] bg-cream-dark animate-pulse" />
                    <div class="p-3 space-y-2"><div class="h-3 bg-cream-dark animate-pulse w-2/3" /><div class="h-3 bg-cream-dark animate-pulse w-1/3" /></div>
                </div>
            </div>
            <div v-else-if="!products.length" class="text-center py-20 max-w-md mx-auto">
                <!-- Filters came up empty: the way out is to clear them. -->
                <template v-if="filtering">
                    <p class="text-sm text-black/55">Nothing matches these filters.</p>
                    <button @click="clearAll" class="mt-4 text-[11px] tracking-widest uppercase text-gold-dark underline underline-offset-4 hover:text-gold">Clear filters</button>
                </template>
                <!-- No filters and still nothing, inside an affiliate's hand-picked
                     shop: they haven't added anything yet. -->
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
            <template v-else>
                <div :class="['grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3', refreshing ? 'is-refreshing' : 'is-settled']" :aria-busy="refreshing">
                    <div v-for="(p, i) in products" :key="p.id" :data-id="p.id" :class="['shop-card', revealed[p.id] && 'is-in']" :style="{ transitionDelay: (i % 24 % 5) * 50 + 'ms' }">
                        <ProductCard :product="p" />
                    </div>
                </div>
                <div v-if="pagination?.has_more" ref="tail" class="text-center mt-12">
                    <button @click="loadMore(false)" :disabled="loadingMore" class="inline-flex items-center gap-2 border border-gold text-gold px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold hover:text-white transition-colors disabled:opacity-50 press">
                        <Loader2 v-if="loadingMore" class="w-3.5 h-3.5 animate-spin" /> {{ loadingMore ? 'Loading…' : 'Load more' }}
                    </button>
                    <p class="text-[10px] tracking-widest uppercase text-black/40 mt-3">{{ products.length }} of {{ pagination.total }}</p>
                </div>
            </template>
        </div>
    </div>
</template>

<style scoped>
/* Cards rise into place as they scroll in, a beat apart across the row. */
.shop-card { opacity: 0; transform: translateY(14px); transition: opacity .5s ease, transform .5s ease; }
.shop-card.is-in { opacity: 1; transform: none; }
/* The sold strip drifts left for ever, drawn twice so the loop has no seam; hovering holds it. */
.ticker-track { animation: ticker 45s linear infinite; width: max-content; }
.ticker:hover .ticker-track { animation-play-state: paused; }
@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.live-dot { animation: live 2s ease-in-out infinite; }
@keyframes live { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
@media (prefers-reduced-motion: reduce) {
    .shop-card { opacity: 1; transform: none; transition: none; }
    .ticker-track { animation: none; flex-wrap: wrap; white-space: normal; width: auto; gap: 1rem; }
    .live-dot { animation: none; }
}
</style>
