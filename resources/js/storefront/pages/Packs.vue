<script>
import { api } from '../../lib/api.js';
import { affiliateStore } from '../affiliate-store.js';
import { smoothSwap, busy } from '../../lib/smooth.js';
import { Sparkles, Users, Star, Heart, MapPin, Plane, Search, X, Clock, Play, MessageCircle, ArrowRight, Loader2 } from 'lucide-vue-next';

// Scrolling brings in this many pages by itself; after that the button has
// to be pressed, so the foot of the page can always be reached. A module
// const: Vue only exposes custom options on `this.$options`.
const AUTO_PAGES = 3;

/**
 * Every open series, as a feed. Built on what the research is clear about:
 * genuine deadlines lift conversion and fake ones destroy it, so every timer
 * here is a real `expires_at` from the server that survives a refresh; and the
 * strongest signal for joining a group buy is seeing that other people already
 * have — so each card shows who's in, and how close it is to shipping.
 *
 * The server filters, sorts and pages (`/api/store/series?q=&heading=&…`), so
 * the list and the filters can never disagree. The address holds the choice,
 * so a filtered list is a link someone can send.
 */
export default {
    name: 'PacksPage',
    components: { Sparkles, Users, Star, Heart, MapPin, Plane, Search, X, Clock, Play, MessageCircle, ArrowRight, Loader2 },
    data() {
        return {
            packs: [],
            categories: [],          // [{ handle, name, count, catalogues: [{ handle, name, count }] }]
            pagination: null,
            stats: null,             // { open, people, closing_today }
            activity: [],            // the ticker: who took what, where, when
            loading: true,            // first load: skeletons
            refreshing: false,        // a re-filter: dim what's there, then cross-fade
            slow: false,
            slowTimer: null,
            loadingMore: false,
            hiddenByShop: false,
            search: this.$route.query.q || '',
            searchTimer: null,
            now: Date.now(),
            tick: null,
            hoverCode: null,         // the card whose video is playing
            revealed: {},            // code → true once the card has scrolled into view
            revealer: null,
            tail: null,              // the observer on the "load more" sentinel
            autoLoads: 0,
            headerH: 80,             // the shop header's live height; the bar sticks right under it
            headerObs: null,
        };
    },
    computed: {
        shopName() { return affiliateStore.state.affiliate?.name || affiliateStore.state.affiliate?.code || 'this shop'; },
        heading() { return this.$route.query.heading || ''; },
        catalogue() { return this.$route.query.catalogue || ''; },
        where() { return this.$route.query.where || 'all'; },
        sort() { return this.$route.query.sort || 'closest'; },
        activeHeading() { return this.categories.find((h) => h.handle === this.heading) || null; },
        filtering() { return !!(this.$route.query.q || this.heading || this.catalogue || this.where !== 'all'); },
        /** The one nearest to shipping gets the top of the page — when nothing is filtered. */
        featured() {
            if (this.filtering || this.sort !== 'closest') return null;
            const first = this.packs[0];

            return first && first.needs > 0 ? first : null;
        },
        grid() { return this.featured ? this.packs.slice(1) : this.packs; },
        /** The rail along the top: every open series on this page, as a ring. */
        rail() { return this.packs.filter((p) => p.needs > 0).slice(0, 12); },
        /** The ticker needs to loop seamlessly, so it is drawn twice. */
        ticker() { return this.activity.length ? this.activity.concat(this.activity) : []; },
    },
    watch: {
        '$route.query': {
            handler() {
                const q = this.$route.query.q || '';
                if (q !== this.search.trim()) this.search = q;
                this.load(1);
            },
            deep: true,
        },
    },
    mounted() {
        // The header shrinks once you scroll and grows when an affiliate's strip
        // shows, so a fixed offset leaves a gap the rail shows through. Measure it.
        const header = document.querySelector('header.sticky');
        if (header) {
            this.headerH = Math.round(header.getBoundingClientRect().height);
            if (typeof ResizeObserver !== 'undefined') {
                this.headerObs = new ResizeObserver(() => { this.headerH = Math.round(header.getBoundingClientRect().height); });
                this.headerObs.observe(header);
            }
        }
        this.load(1);
        window.addEventListener('blessluxe:affiliate-changed', this.reload);
        // Timers tick once a second; they are real deadlines, so they must move.
        this.tick = setInterval(() => { this.now = Date.now(); }, 1000);
        if (typeof IntersectionObserver !== 'undefined') {
            this.revealer = new IntersectionObserver((entries) => {
                for (const e of entries) {
                    if (!e.isIntersecting) continue;
                    this.revealed[e.target.dataset.code] = true;
                    this.revealer.unobserve(e.target);
                }
            }, { rootMargin: '60px' });
        }
    },
    beforeUnmount() {
        window.removeEventListener('blessluxe:affiliate-changed', this.reload);
        clearInterval(this.tick);
        clearTimeout(this.searchTimer);
        clearTimeout(this.slowTimer);
        this.revealer?.disconnect();
        this.tail?.disconnect();
        this.headerObs?.disconnect();
    },
    methods: {
        reload() { this.load(1); },
        query(page) {
            const p = new URLSearchParams({ page: String(page), limit: '12', sort: this.sort });
            if (this.$route.query.q) p.set('q', this.$route.query.q);
            if (this.heading) p.set('heading', this.heading);
            if (this.catalogue) p.set('catalogue', this.catalogue);
            if (this.where !== 'all') p.set('where', this.where);

            return p.toString();
        },
        /** Skeletons on the first load only; a re-filter dims, then cross-fades (see Shop.vue). */
        async load(page) {
            const append = page > 1;
            const first = !append && !this.packs.length;
            if (append) this.loadingMore = true;
            else {
                this.autoLoads = 0;
                if (first) this.loading = true;
                else {
                    this.refreshing = true;
                    clearTimeout(this.slowTimer);
                    this.slowTimer = setTimeout(() => { this.slow = true; }, 700);
                }
            }
            const done = append ? () => {} : busy();
            try {
                const data = await api.get(`/api/store/series?${this.query(page)}`);
                const fresh = data.packs || [];
                const apply = () => {
                    this.packs = append ? this.packs.concat(fresh) : fresh;
                    this.categories = data.categories || [];
                    this.pagination = data.pagination || null;
                    if (data.stats) this.stats = data.stats;
                    if (data.activity) this.activity = data.activity;
                    // The SERVER says why it's empty — a curated affiliate shop lists
                    // no series — so this page can say so rather than claim there are none.
                    this.hiddenByShop = Boolean(data.hidden_by_storefront);
                    if (!append) for (const p of fresh) this.revealed[p.public_code] = true;
                    this.refreshing = false;
                    this.slow = false;
                };
                if (append || first) apply(); else await smoothSwap(apply);
            } finally {
                clearTimeout(this.slowTimer);
                done();
                this.loading = false;
                this.loadingMore = false;
                this.refreshing = false;
                this.slow = false;
                this.$nextTick(this.watchCards);
            }
        },
        loadMore(auto = false) {
            if (!this.pagination?.has_more || this.loadingMore) return;
            if (auto) this.autoLoads += 1;
            this.load(this.pagination.page + 1);
        },
        /** Cards fade up as they arrive, and the next page comes in before the end is reached. */
        watchCards() {
            for (const el of this.$el.querySelectorAll('[data-code]')) {
                if (!this.revealed[el.dataset.code]) this.revealer?.observe(el);
            }
            this.tail?.disconnect();
            const end = this.$refs.end;
            if (!end || typeof IntersectionObserver === 'undefined') return;
            this.tail = new IntersectionObserver((entries) => {
                if (entries[0]?.isIntersecting && this.autoLoads < AUTO_PAGES) this.loadMore(true);
            }, { rootMargin: '400px' });
            this.tail.observe(end);
        },
        /** `replace`, not `push`: browsing filters shouldn't fill the back button. */
        setQuery(patch) {
            const query = { ...this.$route.query, ...patch };
            for (const k of Object.keys(query)) if (!query[k] || query[k] === 'all') delete query[k];
            this.$router.replace({ query });
        },
        onSearch() {
            clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => this.setQuery({ q: this.search.trim() }), 300);
        },
        pick(heading, catalogue = '') {
            if (heading === this.heading && catalogue === this.catalogue) { heading = catalogue ? heading : ''; catalogue = ''; }
            this.setQuery({ heading, catalogue });
        },
        clearFilters() {
            this.search = '';
            this.$router.replace({ query: {} });
        },
        leaveShop() { affiliateStore.clear(); },

        // ── Per card ────────────────────────────────────────────────────
        fillPct(p) { return p.slots_total ? Math.round((p.slots_paid / p.slots_total) * 100) : 0; },
        isFull(p) { return p.slots_total > 0 && p.needs === 0; },
        closesIn(p) {
            if (!p.expires_at) return null;
            const ms = new Date(p.expires_at).getTime() - this.now;
            if (ms <= 0) return 'Closed';
            const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
            if (d >= 2) return `${d} days`;
            if (d === 1) return `1 day ${h}h`;
            if (h >= 1) return `${h}h ${String(m).padStart(2, '0')}m`;

            return `${m}:${String(s).padStart(2, '0')}`;
        },
        /** Under an hour is where a real deadline earns a little heat. */
        urgent(p) {
            if (!p.expires_at) return false;
            const ms = new Date(p.expires_at).getTime() - this.now;

            return ms > 0 && ms < 3600000;
        },
        youtubeHover(video) {
            if (!video?.embed_url) return null;
            const id = video.embed_url.split('/').pop();

            return `${video.embed_url}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&playsinline=1&rel=0&modestbranding=1`;
        },
        ago(iso) {
            const mins = Math.floor((this.now - new Date(iso).getTime()) / 60000);
            if (mins < 1) return 'just now';
            if (mins < 60) return `${mins}m ago`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h ago`;

            return `${Math.floor(hrs / 24)}d ago`;
        },
        /** The ring: how full, as a conic sweep of gold. */
        ring(p) {
            const pct = this.fillPct(p);

            return { background: `conic-gradient(var(--color-gold) ${pct}%, rgba(0,0,0,.08) 0)` };
        },
        /** The WhatsApp message, written for them — the same words the series page uses. */
        whatsapp(p) {
            const url = `${window.location.origin}/shop/series/${p.public_code}`;
            const price = p.reputation?.price_label ? ` ${p.reputation.price_label} each.` : '';
            const text = `${p.title} — a BLESSLUXE series. ${p.slots_paid} of ${p.slots_total} sizes claimed, ${p.needs} more needed.${price} Claim yours: ${url}`;

            return `https://wa.me/?text=${encodeURIComponent(text)}`;
        },
    },
};
</script>

<template>
    <div class="max-w-[1400px] mx-auto px-[5%] pt-4 pb-10 min-h-[60vh]">

        <!-- Reached by a saved link while shopping a curated affiliate shop. -->
        <div v-if="!loading && hiddenByShop" class="text-center py-20 max-w-md mx-auto">
            <p class="font-display text-lg tracking-wide mb-2">Series aren't part of {{ shopName }}'s shop</p>
            <p class="text-sm text-black/55 leading-relaxed mb-6">You're browsing a hand-picked collection. Series are BLESSLUXE group-buys, available from the main shop.</p>
            <button @click="leaveShop" class="text-[11px] tracking-widest uppercase text-gold-dark underline underline-offset-4 hover:text-gold">Browse the full collection</button>
        </div>

        <template v-else>
            <!-- ─── One row: what this is, how alive it is, and the controls. Sticks. ── -->
            <!-- Sticks exactly under the shop header, whatever height that is right now,
                 and is solid so nothing scrolls through behind it. -->
            <div class="sticky z-30 -mx-[5%] px-[5%] py-3 bg-cream border-b border-gold/10 flex flex-wrap items-center gap-3" :style="{ top: headerH + 'px' }">
                <h1 class="font-display text-lg tracking-widest uppercase leading-none flex items-baseline gap-3 mr-auto">
                    Series
                    <span v-if="stats" class="text-[11px] tracking-[0.15em] text-black/50 font-body normal-case">
                        <span class="text-gold-dark font-semibold">{{ stats.open }}</span> open ·
                        <span class="text-gold-dark font-semibold">{{ stats.people }}</span> in
                        <template v-if="stats.closing_today"> · <span class="text-red-600 font-semibold">{{ stats.closing_today }}</span> closing today</template>
                    </span>
                </h1>
                <div class="relative w-full sm:w-64">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35 pointer-events-none" />
                    <input v-model="search" @input="onSearch" type="search" enterkeyhint="search" placeholder="Search the series" aria-label="Search the series"
                        class="w-full border border-black/15 bg-white pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-gold" />
                    <button v-if="search" @click="search = ''; onSearch()" class="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center text-black/40 hover:text-gold transition-colors" title="Clear the search" aria-label="Clear the search"><X class="w-4 h-4" /></button>
                </div>
                <div class="flex items-center border border-black/15 bg-white">
                    <button v-for="w in [{ id: 'all', label: 'All' }, { id: 'local', label: 'In Zimbabwe' }, { id: 'import', label: 'Imported' }]" :key="w.id" @click="setQuery({ where: w.id })"
                        :class="['min-h-11 px-4 text-[10px] font-semibold tracking-[0.15em] uppercase transition-colors', where === w.id ? 'bg-gold text-white' : 'text-black/60 hover:text-gold']">{{ w.label }}</button>
                </div>
                <select :value="sort" @change="setQuery({ sort: $event.target.value })" aria-label="Sort the series" class="border border-black/15 bg-white px-3 py-3 text-sm min-h-11 focus:outline-none focus:border-gold">
                    <option value="closest">Closest to filling</option>
                    <option value="ending">Ending soonest</option>
                    <option value="newest">Newest</option>
                </select>
            </div>

            <!-- ─── The rail: every open series as a ring that shows how full it is ── -->
            <div v-if="!loading && rail.length" class="scroll-strip flex gap-4 py-5 -mx-[5%] px-[5%] scroll-px-[5%]">
                <router-link
                    v-for="p in rail"
                    :key="'ring-' + p.public_code"
                    :to="`/shop/series/${p.public_code}`"
                    class="flex-shrink-0 w-[4.75rem] text-center group"
                    :title="`${p.title} — ${p.slots_paid} of ${p.slots_total} claimed`"
                >
                    <span class="block w-[4.75rem] h-[4.75rem] rounded-full p-[3px] transition-transform group-hover:scale-105" :style="ring(p)">
                        <span class="block w-full h-full rounded-full bg-cream p-[2px]">
                            <img v-if="p.thumbnail" :src="p.thumbnail" :alt="''" loading="lazy" class="w-full h-full rounded-full object-cover object-top" />
                            <span v-else class="block w-full h-full rounded-full bg-cream-dark"></span>
                        </span>
                    </span>
                    <span :class="['block mt-1.5 text-[9px] font-semibold tracking-[0.12em] uppercase tabular-nums truncate', urgent(p) ? 'text-red-600' : p.needs === 1 ? 'text-gold-dark' : 'text-black/55']">
                        <template v-if="urgent(p)">{{ closesIn(p) }}</template>
                        <template v-else-if="p.needs === 1">One more</template>
                        <template v-else>Needs {{ p.needs }}</template>
                    </span>
                </router-link>
            </div>

            <!-- ─── The ticker: what just happened, across every series ─────── -->
            <div v-if="ticker.length" class="ticker relative overflow-hidden border-y border-gold/15 mb-6 bg-white/60" aria-label="Recent activity">
                <div class="ticker-track flex items-center gap-8 py-2.5 whitespace-nowrap">
                    <router-link
                        v-for="(a, i) in ticker"
                        :key="i"
                        :to="`/shop/series/${a.code}`"
                        class="inline-flex items-center gap-2 text-xs text-black/70 hover:text-gold transition-colors"
                    >
                        <template v-if="a.kind === 'filled'">
                            <Sparkles class="w-3.5 h-3.5 text-emerald-600" />
                            <span class="font-semibold text-emerald-700">{{ a.series }}</span> filled <span class="text-black/40">· {{ ago(a.at) }}</span>
                        </template>
                        <template v-else>
                            <span class="w-5 h-5 rounded-full bg-gold text-white text-[8px] font-semibold inline-flex items-center justify-center">{{ a.initials }}</span>
                            <span><strong class="font-medium text-black/85">{{ a.initials }}</strong> took size {{ a.size }} in <span class="font-medium">{{ a.series }}</span></span>
                            <span class="text-black/40">· {{ ago(a.at) }}</span>
                        </template>
                    </router-link>
                </div>
            </div>

            <!-- Women · Men · Children, built only from series that are open. -->
            <nav v-if="categories.length" class="mb-8" aria-label="Series by category">
                <div class="scroll-strip flex items-center gap-1 border-b border-black/10">
                    <button @click="pick('', '')" :class="['min-h-11 px-4 text-[11px] font-semibold tracking-[0.2em] uppercase border-b-2 -mb-px transition-colors whitespace-nowrap', !heading ? 'border-gold text-gold' : 'border-transparent text-black/55 hover:text-black']">All</button>
                    <button v-for="h in categories" :key="h.handle" @click="pick(h.handle)" :aria-pressed="heading === h.handle"
                        :class="['min-h-11 px-4 text-[11px] font-semibold tracking-[0.2em] uppercase border-b-2 -mb-px transition-colors whitespace-nowrap', heading === h.handle ? 'border-gold text-gold' : 'border-transparent text-black/55 hover:text-black']">
                        {{ h.name }} <span class="text-black/35 font-normal">{{ h.count }}</span>
                    </button>
                </div>
                <div v-if="activeHeading && activeHeading.catalogues.length" class="flex flex-wrap gap-2 mt-4">
                    <button v-for="c in activeHeading.catalogues" :key="c.handle" @click="pick(activeHeading.handle, c.handle)" :aria-pressed="catalogue === c.handle"
                        :class="['min-h-11 px-4 border text-xs transition-colors', catalogue === c.handle ? 'border-gold bg-gold text-white' : 'border-black/15 text-black/70 hover:border-gold hover:text-gold']">
                        {{ c.name }} <span :class="catalogue === c.handle ? 'text-white/70' : 'text-black/35'">{{ c.count }}</span>
                    </button>
                </div>
            </nav>

            <!-- ─── Loading ─────────────────────────────────────────────── -->
            <div v-if="loading || slow" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" aria-busy="true">
                <div v-for="n in 10" :key="n" class="border border-black/10">
                    <div class="aspect-[3/4] bg-cream-dark animate-pulse" />
                    <div class="p-3 space-y-2"><div class="h-3 bg-cream-dark animate-pulse w-2/3" /><div class="h-2 bg-cream-dark animate-pulse w-full" /></div>
                </div>
            </div>

            <div v-else-if="!packs.length" class="text-center py-20 max-w-md mx-auto">
                <template v-if="filtering">
                    <p class="text-sm text-black/55">No series match that.</p>
                    <button @click="clearFilters" class="mt-4 text-[11px] tracking-widest uppercase text-gold-dark underline underline-offset-4 hover:text-gold">Clear filters</button>
                </template>
                <template v-else>
                    <p class="text-sm text-black/55 mb-6">No open series right now. Check back soon, or follow your favourite affiliate for hosted drops.</p>
                    <router-link to="/shop" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">Continue Shopping</router-link>
                </template>
            </div>

            <div v-else :class="refreshing ? 'is-refreshing' : 'is-settled'" :aria-busy="refreshing">
                <!-- ─── Featured: the one nearest to shipping ──────────── -->
                <router-link
                    v-if="featured"
                    :to="`/shop/series/${featured.public_code}`"
                    :data-code="featured.public_code"
                    :class="['series-card block border border-gold/30 bg-cream-dark/30 mb-10 lg:grid lg:grid-cols-12 overflow-hidden', revealed[featured.public_code] && 'is-in']"
                >
                    <div class="relative aspect-[4/5] sm:aspect-[16/9] lg:aspect-auto lg:col-span-5 bg-cream-dark overflow-hidden">
                        <img v-if="featured.thumbnail" :src="featured.thumbnail" :alt="featured.title" class="absolute inset-0 w-full h-full object-cover object-top" />
                        <span class="absolute top-4 left-4 bg-gold text-white text-[10px] font-semibold tracking-[0.2em] uppercase px-3 py-1.5">
                            {{ featured.needs === 1 ? 'One more and it ships' : `Needs ${featured.needs} more` }}
                        </span>
                    </div>
                    <div class="lg:col-span-7 p-6 lg:p-10 flex flex-col justify-center">
                        <p class="font-script text-2xl text-gold">Closest to filling</p>
                        <h2 class="font-display text-2xl md:text-3xl tracking-widest uppercase leading-tight">{{ featured.title }}</h2>
                        <p v-if="featured.reputation?.price_label" class="mt-2 text-lg"><span class="font-semibold">{{ featured.reputation.price_label }}</span> <span class="text-sm text-black/55">per piece</span></p>

                        <div class="mt-5">
                            <div class="flex items-end justify-between gap-3 mb-2">
                                <p><span class="font-display text-4xl leading-none">{{ featured.slots_paid }}</span><span class="text-sm text-black/55"> of {{ featured.slots_total }} sizes claimed</span></p>
                                <p v-if="closesIn(featured)" :class="['inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.2em] uppercase tabular-nums', urgent(featured) ? 'text-red-600' : 'text-black/55']">
                                    <Clock class="w-3.5 h-3.5" /> {{ closesIn(featured) }} left
                                </p>
                            </div>
                            <div class="h-2 bg-black/10 overflow-hidden"><div class="bar h-full bg-gold" :style="{ width: (revealed[featured.public_code] ? fillPct(featured) : 0) + '%' }"></div></div>
                            <div class="flex items-center gap-3 mt-3">
                                <div class="flex -space-x-2">
                                    <span v-for="(p, i) in featured.people.slice(0, 5)" :key="i" class="w-8 h-8 rounded-full bg-gold text-white text-[10px] font-semibold inline-flex items-center justify-center ring-2 ring-cream">{{ p }}</span>
                                    <span class="w-8 h-8 rounded-full border-2 border-dashed border-gold text-gold text-sm inline-flex items-center justify-center ring-2 ring-cream">+</span>
                                </div>
                                <p class="text-sm text-black/65">
                                    <template v-if="featured.people.length">{{ featured.people.length }} {{ featured.people.length === 1 ? 'person is' : 'people are' }} in — and you?</template>
                                    <template v-else>Be the first in.</template>
                                </p>
                            </div>
                        </div>

                        <p class="text-xs text-black/50 mt-4">Pay BLESSLUXE for your size; it ships when every size is taken — and if it never fills, everyone is refunded.</p>
                        <div class="flex flex-wrap items-center gap-3 mt-5">
                            <span class="inline-flex items-center gap-2 bg-gold text-white px-6 py-3 text-[10px] font-semibold tracking-[0.3em] uppercase">Take a size <ArrowRight class="w-4 h-4" /></span>
                            <a :href="whatsapp(featured)" target="_blank" rel="noopener" @click.stop class="inline-flex items-center gap-2 min-h-11 border border-emerald-600 text-emerald-700 px-5 py-3 text-[10px] font-semibold tracking-[0.2em] uppercase hover:bg-emerald-600 hover:text-white transition-colors">
                                <MessageCircle class="w-4 h-4" /> Share on WhatsApp
                            </a>
                        </div>
                    </div>
                </router-link>

                <!-- ─── The feed ─────────────────────────────────────────── -->
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    <router-link
                        v-for="p in grid"
                        :key="p.public_code"
                        :to="`/shop/series/${p.public_code}`"
                        :data-code="p.public_code"
                        :class="['series-card block group relative border border-black/10 hover:border-gold/40', revealed[p.public_code] && 'is-in']"
                        @mouseenter="hoverCode = p.public_code"
                        @mouseleave="hoverCode = null"
                    >
                        <!-- Picture, with the clip under the cursor if there is one -->
                        <div class="relative aspect-[3/4] bg-cream-dark overflow-hidden">
                            <img v-if="p.thumbnail" :src="p.thumbnail" :alt="p.title" loading="lazy" decoding="async" class="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105" />
                            <template v-if="p.video && hoverCode === p.public_code">
                                <video v-if="p.video.kind === 'upload'" :src="p.video.url" autoplay muted loop playsinline class="absolute inset-0 w-full h-full object-cover object-top" />
                                <iframe v-else-if="youtubeHover(p.video)" :src="youtubeHover(p.video)" class="absolute inset-0 w-full h-full pointer-events-none" frameborder="0" allow="autoplay; encrypted-media" title="Video" />
                            </template>

                            <!-- Same square as a product card: icon only, words on hover. -->
                            <span v-if="p.reputation?.sourcing" :class="['absolute top-0 left-0 z-10 inline-flex items-center h-7 px-2 text-[9px] font-semibold tracking-[0.12em] uppercase text-white', p.reputation.sourcing.kind === 'local' ? 'bg-emerald-600/95' : 'bg-black/70 backdrop-blur-sm']" :title="p.reputation.sourcing.note">
                                <component :is="p.reputation.sourcing.kind === 'local' ? 'MapPin' : 'Plane'" class="w-3 h-3 flex-shrink-0" />
                                <span class="max-w-0 opacity-0 overflow-hidden whitespace-nowrap pl-1 transition-all duration-300 group-hover:max-w-[8rem] group-hover:opacity-100">{{ p.reputation.sourcing.eta }}</span>
                            </span>

                            <!-- A real deadline, ticking. Red only inside the last hour. -->
                            <span v-if="closesIn(p)" :class="['absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-1 text-[9px] font-semibold tracking-[0.12em] uppercase tabular-nums', urgent(p) ? 'bg-red-600 text-white' : 'bg-white/90 backdrop-blur text-black/75']">
                                <Clock class="w-3 h-3" /> {{ closesIn(p) }}
                            </span>

                            <span v-if="p.video" class="absolute bottom-2 right-2 z-10 w-6 h-6 rounded-full bg-black/55 backdrop-blur flex items-center justify-center" title="This piece has a video"><Play class="w-3 h-3 text-white fill-white" /></span>

                            <!-- How close it is, on the picture: the thing a feed is scanned for. -->
                            <span v-if="isFull(p)" class="absolute bottom-2 left-2 z-10 bg-emerald-600 text-white text-[9px] font-semibold tracking-[0.15em] uppercase px-2 py-1">Full</span>
                            <span v-else :class="['absolute bottom-2 left-2 z-10 text-white text-[9px] font-semibold tracking-[0.15em] uppercase px-2 py-1', p.needs === 1 ? 'bg-gold needs-one' : 'bg-black/70 backdrop-blur-sm']">
                                {{ p.needs === 1 ? 'One more' : `Needs ${p.needs}` }}
                            </span>
                        </div>

                        <div class="p-3">
                            <p class="font-display text-sm leading-tight line-clamp-1 group-hover:text-gold transition-colors">{{ p.title }}</p>
                            <div class="flex items-baseline justify-between gap-2 mt-0.5">
                                <p class="text-xs text-black truncate">{{ p.reputation?.price_label || `${p.needs} left` }}</p>
                                <p class="flex items-center gap-2 text-[11px] text-black/55 flex-shrink-0">
                                    <span v-if="p.reputation?.rating" class="inline-flex items-center gap-1" :title="`Rated ${p.reputation.rating.average_label} out of 5`"><Star class="w-3 h-3 text-gold fill-gold" /><span class="font-medium text-black/75">{{ p.reputation.rating.average_label }}</span></span>
                                    <span v-if="p.reputation?.likes" class="inline-flex items-center gap-1" :title="`Loved by ${p.reputation.likes}`"><Heart class="w-3 h-3 text-gold fill-gold" /> {{ p.reputation.likes }}</span>
                                </p>
                            </div>

                            <!-- Who's in, and how far along -->
                            <div class="flex items-center justify-between gap-2 mt-2">
                                <div class="flex -space-x-1.5">
                                    <span v-for="(ini, i) in p.people.slice(0, 3)" :key="i" class="w-6 h-6 rounded-full bg-gold text-white text-[9px] font-semibold inline-flex items-center justify-center ring-2 ring-white">{{ ini }}</span>
                                    <span v-if="p.people.length > 3" class="w-6 h-6 rounded-full bg-black/10 text-black/60 text-[9px] font-semibold inline-flex items-center justify-center ring-2 ring-white">+{{ p.people.length - 3 }}</span>
                                    <span v-if="!p.people.length" class="text-[11px] text-black/45 pl-0.5">Be the first in</span>
                                </div>
                                <span class="text-[11px] text-black/55 inline-flex items-center gap-1 tabular-nums" :title="`${p.slots_paid} of ${p.slots_total} sizes claimed`"><Users class="w-3 h-3 text-gold" /> {{ p.slots_paid }}/{{ p.slots_total }}</span>
                            </div>
                            <div class="bg-cream-dark/60 h-1 overflow-hidden mt-2">
                                <div class="bar h-full bg-gold" :style="{ width: (revealed[p.public_code] ? fillPct(p) : 0) + '%' }"></div>
                            </div>
                        </div>
                    </router-link>
                </div>

                <!-- Next page: by itself up to AUTO_PAGES, then by hand. -->
                <div v-if="pagination?.has_more" ref="end" class="text-center mt-12">
                    <button @click="loadMore(false)" :disabled="loadingMore" class="inline-flex items-center gap-2 border border-gold text-gold px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold hover:text-white transition-colors disabled:opacity-50">
                        <Loader2 v-if="loadingMore" class="w-3.5 h-3.5 animate-spin" /> {{ loadingMore ? 'Loading…' : 'Load more' }}
                    </button>
                    <p class="text-[10px] tracking-widest uppercase text-black/40 mt-3">{{ packs.length }} of {{ pagination.total }}</p>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
/* Cards rise into place as they scroll in; bars grow to their level once seen. */
.series-card { opacity: 0; transform: translateY(12px); transition: opacity .5s ease, transform .5s ease, border-color .2s ease; }
.series-card.is-in { opacity: 1; transform: none; }
.bar { transition: width .9s cubic-bezier(.22, 1, .36, 1); }
/* The ticker drifts left for ever; the content is drawn twice so the loop never shows a seam. Hovering holds it. */
.ticker-track { animation: ticker 40s linear infinite; width: max-content; }
.ticker:hover .ticker-track { animation-play-state: paused; }
@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
/* "One more" breathes, gently: it's the series worth joining right now. */
.needs-one { animation: breathe 2.4s ease-in-out infinite; }
@keyframes breathe { 0%, 100% { opacity: 1; } 50% { opacity: .72; } }
@media (prefers-reduced-motion: reduce) {
    .ticker-track { animation: none; flex-wrap: wrap; white-space: normal; width: auto; gap: 1rem; }
    .series-card { opacity: 1; transform: none; transition: border-color .2s ease; }
    .bar { transition: none; }
    .needs-one { animation: none; }
}
</style>
