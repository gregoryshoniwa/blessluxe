<script>
import { api } from '../../../lib/api.js';
import { hiveStore } from '../../hive-store.js';
import { Star, BadgeCheck, ImageOff, LoaderCircle, ShoppingBag } from 'lucide-vue-next';

const FIT = { small: 'Runs small', true: 'True to size', large: 'Runs large' };

/**
 * A seller's shop on their Hive page: their line at their prices, and what
 * their buyers posted. Tapping a piece enters their shop first (shopVia), so
 * the price you saw here is the price on the product page, and the sale is theirs.
 */
export default {
    name: 'SellerShop',
    components: { Star, BadgeCheck, ImageOff, LoaderCircle, ShoppingBag },
    props: { handle: { type: String, required: true }, name: { type: String, default: '' }, mine: { type: Boolean, default: false } },
    data() { return { d: null, loading: true, going: null, FIT }; },
    watch: { handle: { immediate: true, handler() { this.load(); } } },
    methods: {
        async load() {
            this.loading = true;
            try { this.d = await api.get(`/api/store/hive/pages/${encodeURIComponent(this.handle)}/shop`); } catch { this.d = null; }
            finally { this.loading = false; }
        },
        async open(p) {
            if (this.going) return;
            this.going = p.id;
            await hiveStore.shopVia(this.$router, { handle: this.handle }, `/shop/${p.handle}`);
        },
        async fullShop() { await hiveStore.shopVia(this.$router, { handle: this.handle }, `/affiliate/shop/${this.d.code}`); },
    },
};
</script>

<template>
    <p v-if="loading" class="text-sm text-black/40 py-10 text-center">Loading…</p>
    <div v-else-if="d">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
            <h2 class="font-display text-xl tracking-wide">{{ d.title || (mine ? 'Your shop' : `${name}'s shop`) }}</h2>
            <span class="inline-flex items-center gap-1 text-xs text-green-700"><BadgeCheck class="w-4 h-4" /> Verified seller</span>
            <span v-if="d.reputation.rating" class="inline-flex items-center gap-1 text-xs"><Star class="w-3.5 h-3.5 text-gold fill-gold" /> {{ d.reputation.rating }} <span class="text-black/45">· {{ d.reputation.reviews }} buyer {{ d.reputation.reviews === 1 ? 'review' : 'reviews' }}</span></span>
            <span class="text-xs text-black/45">{{ d.reputation.sales_label }}</span>
        </div>
        <p v-if="d.intro" class="text-sm text-black/65 leading-relaxed mb-5 whitespace-pre-line">{{ d.intro }}</p>

        <p v-if="!d.products.length" class="text-sm text-black/50 py-10 text-center">{{ mine ? "You haven't picked any pieces for your shop yet." : 'Nothing in the shop just now.' }}</p>
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <button v-for="p in d.products" :key="p.id" @click="open(p)" class="text-left bg-white border border-black/8 overflow-hidden hover:border-gold transition-colors">
                <span class="relative block aspect-[4/5] bg-cream-dark">
                    <img v-if="p.thumbnail" :src="p.thumbnail" :alt="p.title" loading="lazy" decoding="async" class="w-full h-full object-cover" />
                    <ImageOff v-else class="absolute inset-0 m-auto w-5 h-5 text-black/20" />
                    <LoaderCircle v-if="going === p.id" class="absolute inset-0 m-auto w-6 h-6 animate-spin text-white drop-shadow" />
                </span>
                <span class="block p-3">
                    <span class="block text-sm truncate">{{ p.title }}</span>
                    <span class="block text-xs text-black/55 mt-0.5">{{ p.price_label }}</span>
                </span>
            </button>
        </div>

        <button @click="fullShop" class="mt-5 w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gold text-white px-8 py-3.5 text-xs font-semibold tracking-[0.2em] uppercase hover:bg-gold-dark">
            <ShoppingBag class="w-4 h-4" /> {{ d.curated ? 'Visit the full shop' : 'Shop everything with ' + (mine ? 'you' : name) }}
        </button>
        <router-link v-if="mine" :to="`/affiliate/${d.code}/dashboard`" class="block sm:inline-block sm:ml-4 mt-3 sm:mt-0 text-center text-xs text-gold-dark underline underline-offset-4">Manage your shop</router-link>

        <section v-if="d.buyer_tryons.length" class="mt-10">
            <h3 class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-3">From {{ mine ? 'your' : 'their' }} buyers</h3>
            <div class="scroll-strip scroll-px-4 sm:scroll-px-0 flex gap-3 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 sm:mx-0 sm:px-0">
                <router-link v-for="l in d.buyer_tryons" :key="l.id" :to="`/@${l.author.handle}?look=${l.id}`" class="w-40 flex-shrink-0 bg-white border border-black/8 overflow-hidden hover:border-gold">
                    <span class="block aspect-[4/5] bg-cream-dark"><img v-if="l.images[0]" :src="l.images[0]" alt="" loading="lazy" class="w-full h-full object-cover" /></span>
                    <span class="block p-2.5">
                        <span class="flex items-center gap-1 text-[11px] text-green-700"><BadgeCheck class="w-3.5 h-3.5" /> Bought it</span>
                        <span class="block text-xs font-medium mt-0.5">{{ FIT[l.try_on?.fit] }}</span>
                        <span v-if="l.try_on?.rating" class="flex items-center gap-0.5 text-[11px] text-black/55"><Star class="w-3 h-3 text-gold fill-gold" /> {{ l.try_on.rating }}/5 · {{ l.author.display_name }}</span>
                    </span>
                </router-link>
            </div>
        </section>
    </div>
</template>
