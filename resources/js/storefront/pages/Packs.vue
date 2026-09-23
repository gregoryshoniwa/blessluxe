<script>
import { api } from '../../lib/api.js';
import { affiliateStore } from '../affiliate-store.js';
import { Sparkles, Users, Star, Heart, MapPin, Plane, Search, X } from 'lucide-vue-next';

export default {
    name: 'PacksPage',
    components: { Sparkles, Users, Star, Heart, MapPin, Plane, Search, X },
    data() {
        return {
            packs: [],
            loading: true,
            hiddenByShop: false,
            search: '',
            where: 'all',            // all | local | import
            sort: 'closest',
        };
    },
    computed: {
        shopName() { return affiliateStore.state.affiliate?.name || affiliateStore.state.affiliate?.code || 'this shop'; },
        /**
         * Filtered here rather than at the server: every open series is already
         * in hand (there is no paging — there are rarely more than a page of
         * them), so searching is instant and costs no request. If this ever
         * needs paging, the filter moves to the API with it.
         */
        shown() {
            const term = this.search.trim().toLowerCase();
            let out = this.packs.filter((p) => {
                if (this.where !== 'all' && (p.reputation?.sourcing?.kind || 'local') !== this.where) return false;
                if (!term) return true;

                return `${p.title || ''} ${p.description || ''} ${p.public_code || ''}`.toLowerCase().includes(term);
            });

            const left = (p) => (p.slots_total || 0) - (p.slots_paid || 0);
            out = [...out].sort((a, b) => {
                if (this.sort === 'closest') return left(a) - left(b);          // nearly there first
                if (this.sort === 'ending') {
                    // Series with a deadline first, soonest at the top.
                    if (!a.expires_at) return b.expires_at ? 1 : 0;
                    if (!b.expires_at) return -1;

                    return new Date(a.expires_at) - new Date(b.expires_at);
                }

                return 0;                                                       // 'newest' — the server's own order
            });

            return out;
        },
        filtering() { return !!this.search.trim() || this.where !== 'all'; },
    },
    mounted() {
        this.load();
        window.addEventListener('blessluxe:affiliate-changed', this.load);
    },
    beforeUnmount() {
        window.removeEventListener('blessluxe:affiliate-changed', this.load);
    },
    methods: {
        async load() {
            this.loading = true;
            try {
                const data = await api.get('/api/store/series');
                this.packs = data.packs || [];
                // The SERVER says why it is empty — a curated affiliate shop
                // lists no packs — so this page can say so, rather than claiming
                // there are none open anywhere.
                this.hiddenByShop = Boolean(data.hidden_by_storefront);
            } finally { this.loading = false; }
        },
        leaveShop() { affiliateStore.clear(); },
        clearFilters() { this.search = ''; this.where = 'all'; },
        fillPct(p) {
            if (!p.slots_total) return 0;
            return Math.round((p.slots_paid / p.slots_total) * 100);
        },
        fmtExpires(iso) {
            if (!iso) return null;
            const d = new Date(iso);
            return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        },
    },
};
</script>

<template>
    <div class="max-w-[1400px] mx-auto px-[5%] py-12 min-h-[60vh]">
        <header class="text-center mb-12">
            <p class="font-script text-3xl text-gold mb-2 flex items-center justify-center gap-2">
                <Sparkles class="w-5 h-5" /> Group buy
            </p>
            <h1 class="font-display text-4xl md:text-5xl tracking-widest uppercase">Series</h1>
            <p class="text-sm text-black/65 mt-4 max-w-xl mx-auto">
                Claim your size in a limited run. Once every size is taken, the series is ordered and shipped together.
            </p>
        </header>

        <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <div v-for="n in 8" :key="n">
                <div class="aspect-[3/4] bg-cream-dark animate-pulse mb-2" />
                <div class="h-3 bg-cream-dark animate-pulse w-2/3 mb-1" />
                <div class="h-3 bg-cream-dark animate-pulse w-1/2" />
            </div>
        </div>

        <!-- Reached by a saved link while shopping a curated affiliate shop. -->
        <div v-else-if="hiddenByShop" class="text-center py-20 max-w-md mx-auto">
            <p class="font-display text-lg tracking-wide mb-2">Series aren't part of {{ shopName }}'s shop</p>
            <p class="text-sm text-black/55 leading-relaxed mb-6">You're browsing a hand-picked collection. Series are BLESSLUXE group-buys, available from the main shop.</p>
            <button @click="leaveShop" class="text-[11px] tracking-widest uppercase text-gold-dark underline underline-offset-4 hover:text-gold">Browse the full collection</button>
        </div>

        <template v-else>
        <!-- Search and filters. Only worth showing once there's a choice to make. -->
        <div v-if="packs.length" class="flex flex-wrap items-center gap-3 mb-8">
            <div class="relative flex-1 min-w-[12rem]">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35 pointer-events-none" />
                <input
                    v-model="search"
                    type="search"
                    enterkeyhint="search"
                    placeholder="Search the series"
                    aria-label="Search the series"
                    class="w-full border border-black/15 bg-white pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-gold"
                />
                <button
                    v-if="search"
                    @click="search = ''"
                    class="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center text-black/40 hover:text-gold transition-colors"
                    title="Clear the search"
                    aria-label="Clear the search"
                >
                    <X class="w-4 h-4" />
                </button>
            </div>

            <div class="flex items-center border border-black/15 bg-white">
                <button
                    v-for="w in [{ id: 'all', label: 'All' }, { id: 'local', label: 'In Zimbabwe' }, { id: 'import', label: 'Imported' }]"
                    :key="w.id"
                    @click="where = w.id"
                    :class="['min-h-11 px-4 text-[10px] font-semibold tracking-[0.15em] uppercase transition-colors', where === w.id ? 'bg-gold text-white' : 'text-black/60 hover:text-gold']"
                >
                    {{ w.label }}
                </button>
            </div>

            <select v-model="sort" aria-label="Sort the series" class="border border-black/15 bg-white px-3 py-3 text-sm min-h-11 focus:outline-none focus:border-gold">
                <option value="closest">Closest to filling</option>
                <option value="ending">Ending soonest</option>
                <option value="newest">Newest</option>
            </select>
        </div>

        <div v-if="!packs.length" class="text-center py-20 max-w-md mx-auto">
            <p class="text-sm text-black/55 mb-6">No open series right now. Check back soon, or follow your favourite affiliate for hosted drops.</p>
            <router-link to="/shop" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Continue Shopping
            </router-link>
        </div>

        <div v-else-if="filtering && !shown.length" class="text-center py-16 max-w-md mx-auto">
            <p class="text-sm text-black/55">No series match that.</p>
            <button @click="clearFilters" class="mt-4 text-[11px] tracking-widest uppercase text-gold-dark underline underline-offset-4 hover:text-gold">Clear filters</button>
        </div>

        <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <router-link
                v-for="p in shown"
                :key="p.public_code"
                :to="`/shop/series/${p.public_code}`"
                class="block group relative border border-black/10 hover:border-gold/40 transition-colors"
            >
                <span v-if="p.expires_at" class="absolute top-2 right-2 z-10 text-[9px] tracking-widest uppercase bg-amber-100 text-amber-700 px-2 py-0.5">
                    ends {{ fmtExpires(p.expires_at) }}
                </span>
                <!-- Same square as a product card: icon only, words on hover. -->
                <span
                    v-if="p.reputation?.sourcing"
                    :class="['absolute top-0 left-0 z-10 inline-flex items-center h-7 px-2 text-[9px] font-semibold tracking-[0.12em] uppercase text-white',
                             p.reputation.sourcing.kind === 'local' ? 'bg-emerald-600/95' : 'bg-black/70 backdrop-blur-sm']"
                    :title="p.reputation.sourcing.note"
                >
                    <component :is="p.reputation.sourcing.kind === 'local' ? 'MapPin' : 'Plane'" class="w-3 h-3 flex-shrink-0" />
                    <span class="max-w-0 opacity-0 overflow-hidden whitespace-nowrap pl-1 transition-all duration-300 group-hover:max-w-[8rem] group-hover:opacity-100">
                        {{ p.reputation.sourcing.eta }}
                    </span>
                </span>
                <div class="aspect-[3/4] bg-cream-dark overflow-hidden group-hover:opacity-90 transition-opacity">
                    <img
                        v-if="p.thumbnail"
                        :src="p.thumbnail"
                        :alt="p.title"
                        class="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                    />
                </div>
                <div class="p-3">
                    <p class="font-display text-sm leading-tight line-clamp-1 group-hover:text-gold transition-colors">
                        {{ p.title }}
                    </p>
                    <!-- How full it is, read the same way as a product's price row. -->
                    <div class="flex items-baseline justify-between gap-2 mt-0.5">
                        <p class="text-xs text-black truncate">{{ p.slots_total - p.slots_paid }} left</p>
                        <!-- The piece's own reputation, alongside how full the series is. -->
                        <p class="flex items-center gap-2 text-[11px] text-black/55 flex-shrink-0">
                            <span v-if="p.reputation?.rating" class="inline-flex items-center gap-1" :title="`Rated ${p.reputation.rating.average_label} out of 5 by ${p.reputation.rating.count} ${p.reputation.rating.count === 1 ? 'person' : 'people'}`">
                                <Star class="w-3 h-3 text-gold fill-gold" />
                                <span class="font-medium text-black/75">{{ p.reputation.rating.average_label }}</span>
                            </span>
                            <span v-if="p.reputation?.likes" class="inline-flex items-center gap-1" :title="`Loved by ${p.reputation.likes}`">
                                <Heart class="w-3 h-3 text-gold fill-gold" />
                                {{ p.reputation.likes }}
                            </span>
                            <span class="inline-flex items-center gap-1" :title="`${p.slots_paid} of ${p.slots_total} sizes claimed`">
                                <Users class="w-3 h-3 text-gold" /> {{ p.slots_paid }}/{{ p.slots_total }}
                            </span>
                        </p>
                    </div>
                    <div class="bg-cream-dark/60 h-1 overflow-hidden mt-2">
                        <div class="bg-gold h-full transition-all" :style="{ width: fillPct(p) + '%' }"></div>
                    </div>
                </div>
            </router-link>
        </div>
        </template>
    </div>
</template>
