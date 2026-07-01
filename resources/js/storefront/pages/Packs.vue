<script>
import { api } from '../../lib/api.js';
import { Sparkles, Users } from 'lucide-vue-next';

export default {
    name: 'PacksPage',
    components: { Sparkles, Users },
    data() {
        return { packs: [], loading: true };
    },
    async mounted() {
        try {
            const data = await api.get('/api/store/packs');
            this.packs = data.packs || [];
        } finally { this.loading = false; }
    },
    methods: {
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
            <h1 class="font-display text-4xl md:text-5xl tracking-widest uppercase">Packs</h1>
            <p class="text-sm text-black/65 mt-4 max-w-xl mx-auto">
                Claim a slot in a limited drop. Each pack is a curated bundle; once every slot is locked in, the pack ships.
            </p>
        </header>

        <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div v-for="n in 8" :key="n">
                <div class="aspect-[3/4] bg-cream-dark animate-pulse mb-2" />
                <div class="h-3 bg-cream-dark animate-pulse w-2/3 mb-1" />
                <div class="h-3 bg-cream-dark animate-pulse w-1/2" />
            </div>
        </div>

        <div v-else-if="!packs.length" class="text-center py-20 max-w-md mx-auto">
            <p class="text-sm text-black/55 mb-6">No open packs right now. Check back soon, or follow your favourite affiliate for hosted drops.</p>
            <router-link to="/shop" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Continue Shopping
            </router-link>
        </div>

        <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <router-link
                v-for="p in packs"
                :key="p.public_code"
                :to="`/shop/packs/${p.public_code}`"
                class="block group relative"
            >
                <span v-if="p.expires_at" class="absolute top-2 right-2 z-10 text-[9px] tracking-widest uppercase bg-amber-100 text-amber-700 px-2 py-0.5">
                    ends {{ fmtExpires(p.expires_at) }}
                </span>
                <div class="aspect-[3/4] bg-cream-dark mb-2 overflow-hidden group-hover:opacity-90 transition-opacity">
                    <img
                        v-if="p.thumbnail"
                        :src="p.thumbnail"
                        :alt="p.title"
                        class="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                    />
                </div>
                <p class="font-display text-sm leading-tight line-clamp-1 group-hover:text-gold transition-colors">
                    {{ p.title }}
                </p>
                <p class="text-[10px] text-black/55 line-clamp-1 inline-flex items-center gap-1">
                    <Users class="w-3 h-3" /> {{ p.slots_paid }}/{{ p.slots_total }} claimed
                </p>
                <div class="bg-cream-dark/40 h-1 overflow-hidden mt-1">
                    <div class="bg-gold h-full" :style="{ width: fillPct(p) + '%' }"></div>
                </div>
            </router-link>
        </div>
    </div>
</template>
