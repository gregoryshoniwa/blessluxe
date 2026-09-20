<script>
import { api } from '../../../lib/api.js';
import { BadgeCheck, Star, UserRound, Ruler } from 'lucide-vue-next';

const FIT = { small: 'Runs small', true: 'True to size', large: 'Runs large' };

/**
 * "How it fits" on a product page — real buyers, from Bless Hive. Signed-in
 * shoppers see people built like them first. Renders nothing until there is at
 * least one try-on, so a new product's page isn't decorated with an empty box.
 */
export default {
    name: 'ProductTryOns',
    components: { BadgeCheck, Star, UserRound, Ruler },
    props: { product: { type: String, required: true } },   // id or handle
    data() { return { d: null, FIT }; },
    watch: { product: { immediate: true, handler() { this.load(); } } },
    methods: {
        async load() {
            this.d = null;
            try { this.d = await api.get(`/api/store/hive/products/${encodeURIComponent(this.product)}/tryons`); } catch { /* optional section */ }
        },
        verdict() {
            const s = this.d.summary;
            const top = Object.keys(s).sort((a, b) => s[b] - s[a])[0];
            return top === 'true' ? 'Most buyers say it’s true to size' : top === 'small' ? 'Most buyers say it runs small — consider sizing up' : 'Most buyers say it runs large — consider sizing down';
        },
    },
};
</script>

<template>
    <section v-if="d && d.tryons.length" class="mt-14">
        <div class="flex flex-wrap items-end justify-between gap-3 mb-5">
            <div>
                <p class="font-script text-2xl text-gold leading-none">Real people</p>
                <h2 class="font-display text-2xl tracking-widest uppercase">How it fits</h2>
            </div>
            <p v-if="d.rating" class="inline-flex items-center gap-1.5 text-sm"><Star class="w-4 h-4 text-gold fill-gold" /> {{ d.rating }} <span class="text-black/45">from {{ d.total }} {{ d.total === 1 ? 'buyer' : 'buyers' }}</span></p>
        </div>

        <div v-if="d.summary" class="bg-white border border-black/8 rounded-2xl p-4 mb-5">
            <p class="text-sm font-medium mb-3">{{ verdict() }}</p>
            <div class="grid grid-cols-3 gap-3 text-center">
                <div v-for="k in ['small', 'true', 'large']" :key="k">
                    <div class="h-1.5 rounded-full bg-black/8 overflow-hidden"><div class="h-full bg-gold rounded-full" :style="{ width: d.summary[k] + '%' }"></div></div>
                    <p class="text-xs mt-1.5">{{ FIT[k] }}</p>
                    <p class="text-[11px] text-black/45">{{ d.summary[k] }}%</p>
                </div>
            </div>
        </div>

        <div class="scroll-strip flex gap-3 overflow-x-auto [scrollbar-width:none] -mx-[5%] px-[5%] sm:mx-0 sm:px-0">
            <router-link v-for="l in d.tryons" :key="l.id" :to="`/@${l.author.handle}?look=${l.id}`" class="w-44 sm:w-52 flex-shrink-0 bg-white border border-black/8 rounded-2xl overflow-hidden hover:border-gold transition-colors">
                <div class="relative aspect-[4/5] bg-cream-dark">
                    <img :src="l.images[0]" alt="" loading="lazy" decoding="async" class="w-full h-full object-cover" />
                    <span v-if="l.twin_match" class="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/95 text-[10px] text-gold-dark shadow"><Ruler class="w-3 h-3" /> {{ l.twin_match }}% like you</span>
                </div>
                <div class="p-3">
                    <p class="flex items-center gap-1 text-[11px] text-green-700"><BadgeCheck class="w-3.5 h-3.5" /> Bought it</p>
                    <p class="text-sm font-medium mt-0.5">{{ FIT[l.try_on?.fit] }}</p>
                    <p class="text-xs text-black/50 truncate">{{ l.try_on?.size_worn ? `Wore ${l.try_on.size_worn}` : '' }}</p>
                    <p class="flex items-center gap-1.5 text-xs text-black/60 mt-2 truncate"><UserRound class="w-3.5 h-3.5 flex-shrink-0" /> {{ l.author.display_name }}</p>
                </div>
            </router-link>
        </div>
        <p class="text-xs text-black/45 mt-4">Bought this? <router-link to="/hive" class="text-gold-dark underline underline-offset-4">Show how it fits on Bless Hive</router-link> and earn {{ d.reward }} Bees.</p>
    </section>
</template>
