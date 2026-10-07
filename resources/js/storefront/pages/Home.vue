<script>
import ProductCard from '../components/ProductCard.vue';
import { affiliateStore } from '../affiliate-store.js';
import HeroSlideshow from '../components/HeroSlideshow.vue';
import ProductStrip from '../components/ProductStrip.vue';
import { recentlyViewed } from '../recently-viewed.js';
import { siteLinks } from '../site-links.js';
import { Sparkles, ArrowRight, ShoppingBag, Clock } from 'lucide-vue-next';

/**
 * The front door. The hero is the brand's moment; everything under it is there
 * to show a shop that's alive, then put the doors to it within reach:
 *
 *   - a pulse under the hero — what's selling, what's filling, what closes
 *     today — and a ticker of what just happened, so the first scroll lands on
 *     movement rather than a heading;
 *   - "Filling now": the series closest to shipping, as rings that show how
 *     full they are — buying together is what nobody else here offers;
 *   - the departments, tighter, each saying what's inside;
 *   - new in, then trending, then what you looked at last.
 *
 * Every number is real and from the server; nothing on this page is staged.
 */
export default {
    name: 'HomePage',
    components: { ProductCard, ProductStrip, HeroSlideshow, Sparkles, ArrowRight, ShoppingBag, Clock },
    computed: {
        // Inside an affiliate's hand-picked shop: no series, only their pieces.
        curated() { return affiliateStore.isCurated(); },
        /**
         * Four tiles: the departments, and a fourth that isn't a department.
         * The Hive takes it once staff have launched the Hive (the same switch as
         * the menu — one decision, everywhere); until then, Series does. A
         * curated affiliate shop has neither, so it gets four departments.
         */
        headings() { return this.allHeadings.slice(0, this.curated ? 4 : 3); },
        extraTile() {
            if (this.curated) return null;
            if (this.nav.header.some((l) => l.key === 'hive')) {
                const own = this.tileImages.hive || (this.hiveThumb ? [this.hiveThumb] : []);
                return { key: 'hive', to: '/hive', name: 'The Hive', sub: 'Looks · Ask · Lives', images: own.length ? own : ['/hive-mark.png'], contain: !own.length, badge: 'Community' };
            }

            const thumb = this.series.find((p) => p.thumbnail)?.thumbnail;
            return { key: 'series', to: '/shop/series', name: 'Series', sub: 'Buy it together', images: this.tileImages.series || (thumb ? [thumb] : []), badge: this.seriesStats?.open ? `${this.seriesStats.open} filling` : null };
        },
        shopName() { return this.shop.affiliate?.name || this.shop.affiliate?.code || 'This shop'; },
        recentlyViewedIds() { return recentlyViewed.ids(); },
        filling() { return this.series.filter((p) => p.needs > 0).slice(0, 10); },
        tiles() {
            const out = this.headings.map((h) => ({
                key: `heading:${h.id}`, to: `/shop?heading=${h.handle}`, name: h.name,
                images: this.tileImages[`heading:${h.id}`] || (h.image_url ? [h.image_url] : []),
                sub: h.catalogues?.length ? h.catalogues.map((c) => c.name).join(' · ') : null,
            }));
            // It leads: buying together (or the community) is what nobody else here offers.
            if (this.extraTile) out.unshift(this.extraTile);
            // Light text only where there's a dark photo behind it.
            return out.map((t) => ({ ...t, dark: !!t.images.length && !t.contain }));
        },
        /** One ticker: pieces that sold and sizes taken in series, newest first. */
        ticker() {
            const sold = this.sold.map((a) => ({ kind: 'sold', key: `s-${a.handle}-${a.at}`, ...a }));
            const joined = this.seriesActivity.filter((a) => a.kind === 'joined').map((a) => ({ key: `j-${a.code}-${a.at}-${a.size}`, ...a }));
            const filled = this.seriesActivity.filter((a) => a.kind === 'filled').map((a) => ({ key: `f-${a.code}`, ...a }));
            const all = [...sold, ...joined, ...filled].sort((x, y) => new Date(y.at) - new Date(x.at)).slice(0, 16);

            return all.length >= 3 ? all.concat(all) : [];       // drawn twice for a seamless loop
        },
        /** The pulse: only the parts that are true right now. */
        pulse() {
            const out = [];
            if (this.shopStats?.sold_week) out.push({ n: this.shopStats.sold_week, label: 'sold this week', live: true });
            if (this.seriesStats?.open && !this.curated) out.push({ n: this.seriesStats.open, label: 'series filling', to: '/shop/series' });
            if (this.seriesStats?.closing_today && !this.curated) out.push({ n: this.seriesStats.closing_today, label: 'closing today', hot: true, to: '/shop/series?sort=ending' });
            if (this.shopStats?.new) out.push({ n: this.shopStats.new, label: 'new in', to: '/shop?new=1' });
            if (this.shopStats?.available) out.push({ n: this.shopStats.available, label: 'here now', to: '/shop?where=local' });

            return out;
        },
    },
    data() {
        return {
            // Default slide — used when no active hero announcement exists.
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
            heroSlides: [],
            allHeadings: [],
            series: [],
            hiveThumb: null,          // the newest look's photo, for the Hive tile
            tileImages: {},           // staff-set tile pictures: { key: [url…] }
            tileFrame: {},            // which picture each tile is showing
            tileTurn: 0,              // tiles take turns to change, never all at once
            tileTimer: null,
            nav: siteLinks.state,
            seriesStats: null,
            seriesActivity: [],
            shopStats: null,
            sold: [],
            shop: affiliateStore.state,
            now: Date.now(),
            tick: null,
            revealed: {},
            revealer: null,
        };
    },
    beforeUnmount() {
        window.removeEventListener('blessluxe:affiliate-changed', this.reloadForShop);
        clearInterval(this.tick);
        clearInterval(this.tileTimer);
        this.revealer?.disconnect();
    },
    mounted() {
        affiliateStore.refresh();
        // × on the banner (or opening another affiliate's link) changes what
        // this page may show, without changing the route.
        window.addEventListener('blessluxe:affiliate-changed', this.reloadForShop);
        this.tick = setInterval(() => { this.now = Date.now(); }, 1000);
        // A tile with several pictures cross-fades; one tile changes every 1.6s,
        // so each of four comes round about every six seconds. Still for anyone
        // who asked for less motion, and paused while the tab is hidden.
        if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            this.tileTimer = setInterval(this.nextTileFrame, 1600);
        }
        if (typeof IntersectionObserver !== 'undefined') {
            this.revealer = new IntersectionObserver((entries) => {
                for (const e of entries) {
                    if (!e.isIntersecting) continue;
                    this.revealed[e.target.dataset.reveal] = true;
                    this.revealer.unobserve(e.target);
                }
            }, { rootMargin: '40px' });
        }
        this.reloadForShop();
    },
    methods: {
        reloadForShop() {
            siteLinks.load();
            this.fetchTileImages();
            this.fetchHiveThumb();
            this.fetchHeadings();
            this.fetchFeatured();
            this.fetchSeries();
            this.fetchHero();          // their hero, or back to ours
        },
        leaveShop() { affiliateStore.clear(); },
        watchReveals() {
            this.$nextTick(() => {
                for (const el of this.$el.querySelectorAll('[data-reveal]')) {
                    if (!this.revealed[el.dataset.reveal]) this.revealer?.observe(el);
                }
            });
        },
        async fetchHeadings() {
            try {
                const res = await fetch('/api/store/headings', { credentials: 'include', cache: 'no-store' });
                if (!res.ok) return;
                // The server already narrows these to a curated shop's own categories.
                this.allHeadings = ((await res.json()).headings || []).filter((h) => !h.is_sale);
                this.watchReveals();
            } catch { /* tiles simply don't show */ }
        },
        async fetchTileImages() {
            try {
                const res = await fetch('/api/store/home-tiles', { credentials: 'include' });
                if (res.ok) this.tileImages = (await res.json()).tiles || {};
            } catch { /* the tiles fall back to the heading's, a series' or a look's own photo */ }
        },
        nextTileFrame() {
            if (document.hidden || !this.tiles.length) return;
            const t = this.tiles[this.tileTurn++ % this.tiles.length];
            if (t.images.length > 1) this.tileFrame[t.key] = ((this.tileFrame[t.key] || 0) + 1) % t.images.length;
        },
        /** Only the picture showing and the next one exist — the rest load when their turn comes. */
        tileShows(t, k) {
            const cur = (this.tileFrame[t.key] || 0) % t.images.length;
            return k === cur || k === (cur + 1) % t.images.length;
        },
        async fetchHiveThumb() {
            try {
                const res = await fetch('/api/store/hive/feed?limit=6', { credentials: 'include' });
                if (!res.ok) return;
                this.hiveThumb = ((await res.json()).looks || []).find((l) => l.images?.length)?.images[0] || null;
            } catch { /* the Hive mark stands in */ }
        },
        async fetchSeries() {
            try {
                const res = await fetch('/api/store/series?limit=10&sort=closest', { credentials: 'include' });
                if (!res.ok) return;
                const d = await res.json();
                this.series = d.packs || [];
                this.seriesStats = d.stats || null;
                this.seriesActivity = d.activity || [];
            } catch { /* the rail and its pulse simply don't show */ }
        },
        async fetchFeatured() {
            this.loadingFeatured = true;
            try {
                const res = await fetch('/api/store/products?limit=10&sort=newest', { credentials: 'include' });
                if (!res.ok) return;
                const d = await res.json();
                this.featured = d.products || [];
                this.shopStats = d.stats || null;
                this.sold = d.activity || [];
            } finally {
                this.loadingFeatured = false;
                this.watchReveals();
            }
        },
        async fetchHero() {
            try {
                const res = await fetch('/api/store/announcements?position=hero', { credentials: 'include', cache: 'no-store' });
                if (!res.ok) return;
                this.heroSlides = (await res.json()).announcements || [];
            } catch { /* the default slide stays */ }
        },

        // ── Small words ─────────────────────────────────────────────────
        ago(iso) {
            const mins = Math.floor((this.now - new Date(iso).getTime()) / 60000);
            if (mins < 60) return mins < 1 ? 'just now' : `${mins}m ago`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h ago`;

            return `${Math.floor(hrs / 24)}d ago`;
        },
        fillPct(p) { return p.slots_total ? Math.round((p.slots_paid / p.slots_total) * 100) : 0; },
        ring(p) { return { background: `conic-gradient(var(--color-gold) ${this.fillPct(p)}%, rgba(0,0,0,.08) 0)` }; },
        closesIn(p) {
            if (!p.expires_at) return null;
            const ms = new Date(p.expires_at).getTime() - this.now;
            if (ms <= 0) return null;
            const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
            if (h >= 24) return null;
            return h >= 1 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s).padStart(2, '0')}`;
        },
    },
};
</script>

<template>
    <div>
        <!-- Hero — BLESSLUXE's slides, or the affiliate's own inside their
             shop (the server decides which; see ContentController). -->
        <HeroSlideshow :slides="heroSlides" :fallback="heroSlide" />

        <!-- ─── The pulse: what's moving, right now ──────────────────────── -->
        <section v-if="pulse.length || ticker.length" class="border-b border-gold/15 bg-white/70">
            <div v-if="pulse.length" class="max-w-[1400px] mx-auto px-[5%] py-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                <component
                    :is="p.to ? 'router-link' : 'span'"
                    v-for="p in pulse"
                    :key="p.label"
                    :to="p.to"
                    class="inline-flex items-baseline gap-1.5 text-[11px] tracking-[0.15em] uppercase text-black/60 hover:text-gold transition-colors"
                >
                    <span v-if="p.live" class="w-1.5 h-1.5 rounded-full bg-red-500 live-dot self-center"></span>
                    <strong :class="['font-display text-lg leading-none tracking-normal', p.hot ? 'text-red-600' : 'text-gold-dark']">{{ p.n }}</strong>
                    {{ p.label }}
                </component>
            </div>
            <div v-if="ticker.length" class="ticker relative overflow-hidden border-t border-gold/10" aria-label="What's happening">
                <div class="ticker-track flex items-center gap-10 py-2.5 whitespace-nowrap">
                    <router-link
                        v-for="(a, i) in ticker"
                        :key="a.key + '-' + i"
                        :to="a.kind === 'sold' ? `/shop/${a.handle}` : `/shop/series/${a.code}`"
                        class="inline-flex items-center gap-2.5 text-xs text-black/70 hover:text-gold transition-colors"
                    >
                        <template v-if="a.kind === 'sold'">
                            <img v-if="a.thumbnail" :src="a.thumbnail" :alt="''" loading="lazy" class="w-7 h-7 rounded-full object-cover object-top ring-1 ring-gold/30" />
                            <ShoppingBag v-else class="w-3.5 h-3.5 text-gold" />
                            <span><strong class="font-medium text-black/85">{{ a.title }}</strong><template v-if="a.size"> · size {{ a.size }}</template> sold</span>
                        </template>
                        <template v-else-if="a.kind === 'filled'">
                            <Sparkles class="w-3.5 h-3.5 text-emerald-600" />
                            <span><strong class="font-medium text-emerald-700">{{ a.series }}</strong> filled — it ships</span>
                        </template>
                        <template v-else>
                            <span class="w-6 h-6 rounded-full bg-gold text-white text-[9px] font-semibold inline-flex items-center justify-center">{{ a.initials }}</span>
                            <span><strong class="font-medium text-black/85">{{ a.initials }}</strong> took size {{ a.size }} in <strong class="font-medium text-black/85">{{ a.series }}</strong></span>
                        </template>
                        <span class="text-black/40">{{ ago(a.at) }}</span>
                    </router-link>
                </div>
            </div>
        </section>

        <!-- ─── Filling now: buying together, the thing nobody else offers ── -->
        <section v-if="!curated && filling.length" class="max-w-[1400px] mx-auto px-[5%] pt-14">
            <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
                <div>
                    <p class="font-script text-3xl text-gold leading-none">Buy it together</p>
                    <h2 class="font-display text-2xl md:text-3xl tracking-widest uppercase mt-1">Filling now</h2>
                    <p class="text-sm text-black/55 mt-2 max-w-md">Claim your size in a limited run. When every size is taken it ships — if it never fills, you're refunded.</p>
                </div>
                <router-link to="/shop/series" class="inline-flex items-center gap-2 border border-gold text-gold-dark px-6 py-3 text-[10px] font-semibold tracking-[0.25em] uppercase hover:bg-gold hover:text-white transition-colors press">
                    All series <ArrowRight class="w-3.5 h-3.5" />
                </router-link>
            </div>
            <div class="scroll-strip flex gap-6 -mx-[5%] px-[5%] scroll-px-[5%] pb-2">
                <router-link
                    v-for="p in filling"
                    :key="p.public_code"
                    :to="`/shop/series/${p.public_code}`"
                    class="flex-shrink-0 w-28 sm:w-32 text-center group"
                    :title="`${p.title} — ${p.slots_paid} of ${p.slots_total} claimed`"
                >
                    <span :class="['block w-28 h-28 sm:w-32 sm:h-32 rounded-full p-[3px] transition-transform duration-300 group-hover:scale-105', p.needs === 1 && 'glow-gold']" :style="ring(p)">
                        <span class="block w-full h-full rounded-full bg-cream p-[3px]">
                            <img v-if="p.thumbnail" :src="p.thumbnail" :alt="''" loading="lazy" class="w-full h-full rounded-full object-cover object-top" />
                            <span v-else class="block w-full h-full rounded-full bg-cream-dark"></span>
                        </span>
                    </span>
                    <span class="block mt-2.5 text-xs font-medium leading-tight line-clamp-2 group-hover:text-gold transition-colors">{{ p.title }}</span>
                    <span :class="['block mt-1 text-[10px] font-semibold tracking-[0.12em] uppercase tabular-nums', closesIn(p) ? 'text-red-600' : p.needs === 1 ? 'text-gold-dark' : 'text-black/50']">
                        <template v-if="closesIn(p)"><Clock class="w-3 h-3 inline -mt-0.5" /> {{ closesIn(p) }}</template>
                        <template v-else-if="p.needs === 1">One more</template>
                        <template v-else>Needs {{ p.needs }}</template>
                    </span>
                </router-link>
            </div>
        </section>

        <!-- ─── The departments, each saying what's inside ──────────────── -->
        <section v-if="tiles.length" class="max-w-[1400px] mx-auto px-[5%] pt-14">
            <div class="flex items-end justify-between gap-4 mb-6">
                <div>
                    <p class="font-script text-3xl text-gold leading-none">Discover</p>
                    <h2 class="font-display text-2xl md:text-3xl tracking-widest uppercase mt-1">Shop by department</h2>
                </div>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <router-link
                    v-for="(t, i) in tiles"
                    :key="t.key"
                    :to="t.to"
                    :data-reveal="'t-' + t.to"
                    :class="['reveal img-shine group relative aspect-[3/4] overflow-hidden bg-gradient-to-br', i % 2 === 0 ? 'from-pink-200/40 to-amber-100/40' : 'from-amber-200/40 to-rose-200/30', revealed['t-' + t.to] && 'is-in']"
                    :style="{ transitionDelay: i * 70 + 'ms' }"
                >
                    <template v-if="t.images.length">
                        <template v-for="(src, k) in t.images" :key="src">
                            <img
                                v-if="tileShows(t, k)"
                                :src="src"
                                :alt="k === (tileFrame[t.key] || 0) % t.images.length ? t.name : ''"
                                loading="lazy"
                                :class="['absolute inset-0 w-full h-full transition-[opacity,transform] duration-[1200ms,700ms] ease-in-out group-hover:scale-105', t.contain ? 'object-contain p-10' : 'object-cover object-top', k === (tileFrame[t.key] || 0) % t.images.length ? (t.contain ? 'opacity-90' : 'opacity-100') : 'opacity-0']"
                            />
                        </template>
                        <div v-if="!t.contain" class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"></div>
                    </template>

                    <!-- A small label up top for the tile that isn't a department. -->
                    <span v-if="t.badge" class="absolute top-3 left-3 z-10 bg-gold text-white text-[9px] font-semibold tracking-[0.18em] uppercase px-2 py-1">{{ t.badge }}</span>

                    <!-- The way in, pinned to the corner: a long name can never push it off the tile. -->
                    <span :class="['absolute top-3 right-3 z-10 w-10 h-10 rounded-full inline-flex items-center justify-center transition-all duration-300 group-hover:bg-gold group-hover:text-white group-hover:rotate-[-45deg]', t.dark ? 'bg-white/90 text-black' : 'bg-black text-white']">
                        <ArrowRight class="w-4 h-4" />
                    </span>

                    <div class="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                        <p :class="['font-display text-lg sm:text-2xl tracking-widest uppercase leading-tight break-words', t.dark ? 'text-white' : 'text-black']">{{ t.name }}</p>
                        <p v-if="t.sub" :class="['text-[11px] mt-1.5 line-clamp-1', t.dark ? 'text-white/75' : 'text-black/55']">{{ t.sub }}</p>
                    </div>
                </router-link>
            </div>
        </section>

        <!-- ─── New in ────────────────────────────────────────────────────── -->
        <section class="max-w-[1400px] mx-auto px-[5%] pt-14 pb-6">
            <div class="flex items-end justify-between gap-4 mb-6">
                <div>
                    <p class="font-script text-3xl text-gold leading-none">Featured</p>
                    <h2 class="font-display text-2xl md:text-3xl tracking-widest uppercase mt-1">New in</h2>
                </div>
                <router-link v-if="featured.length" to="/shop" class="inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.25em] uppercase text-gold-dark hover:text-gold min-h-11">
                    View all <ArrowRight class="w-3.5 h-3.5" />
                </router-link>
            </div>
            <div v-if="loadingFeatured" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                <div v-for="n in 10" :key="n" class="border border-black/10">
                    <div class="aspect-[3/4] bg-cream-dark animate-pulse" />
                    <div class="p-3 space-y-2"><div class="h-3 bg-cream-dark animate-pulse w-2/3" /><div class="h-3 bg-cream-dark animate-pulse w-1/3" /></div>
                </div>
            </div>
            <!-- Empty. Written for a SHOPPER — an empty curated shop also says
                 whose choice that is, and gives a way out. -->
            <div v-else-if="!featured.length" class="text-center max-w-md mx-auto py-10">
                <template v-if="curated">
                    <p class="font-display text-lg tracking-wide mb-2">{{ shopName }} is still choosing their pieces</p>
                    <p class="text-sm text-black/55 leading-relaxed">Nothing has been added to this shop yet. Check back soon — or browse everything BLESSLUXE has to offer.</p>
                    <button @click="leaveShop" class="mt-6 text-[11px] tracking-widest uppercase text-gold-dark underline underline-offset-4 hover:text-gold">Browse the full collection</button>
                </template>
                <template v-else>
                    <p class="font-display text-lg tracking-wide mb-2">New pieces are on their way</p>
                    <p class="text-sm text-black/55">Our next arrivals are being prepared. Please check back soon.</p>
                </template>
            </div>
            <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                <div v-for="(p, i) in featured" :key="p.id" :data-reveal="'p-' + p.id" :class="['reveal', revealed['p-' + p.id] && 'is-in']" :style="{ transitionDelay: (i % 5) * 60 + 'ms' }">
                    <ProductCard :product="p" />
                </div>
            </div>
        </section>

        <!-- What people are reacting to lately. Renders nothing until they are. -->
        <section class="max-w-[1400px] mx-auto px-[5%]">
            <ProductStrip title="Trending now" script="Loved this month" endpoint="/api/store/products/trending" :limit="8" />
        </section>

        <!-- Recently viewed strip — only renders if there's at least one. -->
        <section v-if="recentlyViewedIds.length" class="max-w-[1400px] mx-auto px-[5%]">
            <ProductStrip title="Pick up where you left off" script="Just for you" :ids="recentlyViewedIds" :limit="6" />
        </section>
    </div>
</template>

<style scoped>
/* Things rise into place as they scroll in, a beat apart. */
.reveal { opacity: 0; transform: translateY(14px); transition: opacity .55s ease, transform .55s ease; }
.reveal.is-in { opacity: 1; transform: none; }
.ticker-track { animation: ticker 55s linear infinite; width: max-content; }
.ticker:hover .ticker-track { animation-play-state: paused; }
@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.live-dot { animation: live 2s ease-in-out infinite; }
@keyframes live { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
@media (prefers-reduced-motion: reduce) {
    .reveal { opacity: 1; transform: none; transition: none; }
    .ticker-track { animation: none; flex-wrap: wrap; white-space: normal; width: auto; justify-content: center; gap: 1rem; }
    .live-dot { animation: none; }
}
</style>
