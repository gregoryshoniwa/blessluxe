<script>
import { api } from '../../lib/api.js';
import { Sparkles, ArrowRight, Users } from 'lucide-vue-next';

export default {
    name: 'PacksPage',
    components: { Sparkles, ArrowRight, Users },
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

        <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div v-for="n in 3" :key="n" class="border border-gold/15 bg-white p-6">
                <div class="aspect-[4/5] bg-cream-dark animate-pulse mb-4" />
                <div class="h-4 bg-cream-dark animate-pulse w-2/3 mb-2" />
                <div class="h-3 bg-cream-dark animate-pulse w-1/2" />
            </div>
        </div>

        <div v-else-if="!packs.length" class="text-center py-20 max-w-md mx-auto">
            <p class="text-sm text-black/55 mb-6">No open packs right now. Check back soon, or follow your favourite affiliate for hosted drops.</p>
            <router-link to="/shop" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Continue Shopping
            </router-link>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <router-link
                v-for="p in packs"
                :key="p.public_code"
                :to="`/shop/packs/${p.public_code}`"
                class="group border border-gold/15 bg-white overflow-hidden hover:border-gold transition-colors"
            >
                <div class="aspect-[4/5] bg-cream-dark overflow-hidden">
                    <img
                        v-if="p.thumbnail"
                        :src="p.thumbnail"
                        :alt="p.title"
                        class="w-full h-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-500"
                    />
                </div>
                <div class="p-5">
                    <div class="flex items-center justify-between mb-2">
                        <p class="font-display text-lg tracking-wider uppercase line-clamp-1">{{ p.title }}</p>
                        <span v-if="p.expires_at" class="text-[10px] tracking-widest uppercase bg-amber-100 text-amber-700 px-2 py-0.5">
                            ends {{ fmtExpires(p.expires_at) }}
                        </span>
                    </div>
                    <p v-if="p.description" class="text-xs text-black/65 line-clamp-2 mb-3">{{ p.description }}</p>

                    <!-- Fill bar -->
                    <div class="bg-cream-dark/40 h-1 overflow-hidden mb-2">
                        <div class="bg-gold h-full" :style="{ width: fillPct(p) + '%' }"></div>
                    </div>
                    <div class="flex items-center justify-between text-xs">
                        <span class="text-black/60 inline-flex items-center gap-1">
                            <Users class="w-3 h-3" /> {{ p.slots_paid }} of {{ p.slots_total }} claimed
                        </span>
                        <span class="text-gold-dark font-mono">{{ p.public_code }}</span>
                    </div>
                    <p class="mt-4 text-xs tracking-widest uppercase text-gold-dark group-hover:text-gold inline-flex items-center gap-1">
                        View pack <ArrowRight class="w-3 h-3" />
                    </p>
                </div>
            </router-link>
        </div>
    </div>
</template>
