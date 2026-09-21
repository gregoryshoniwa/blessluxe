<script>
import { api } from '../../../lib/api.js';
import { hiveStore } from '../../hive-store.js';
import { Shirt, ImageOff, BadgeCheck, Camera, Lock } from 'lucide-vue-next';

/** My closet: everything I've bought. Private — only ever loaded for the owner. */
export default {
    name: 'ClosetPanel',
    components: { Shirt, ImageOff, BadgeCheck, Camera, Lock },
    data() { return { items: [], reward: 0, loading: true }; },
    async mounted() {
        window.addEventListener('blessluxe:hive-posted', this.load);
        await this.load();
    },
    beforeUnmount() { window.removeEventListener('blessluxe:hive-posted', this.load); },
    methods: {
        async load() {
            try { const d = await api.get('/api/account/hive/closet'); this.items = d.items; this.reward = d.reward; } catch { /* empty state */ }
            finally { this.loading = false; }
        },
        tryOn(i) { hiveStore.compose(this.$router, this.$route, { lineItemId: i.line_item_id }); },
        when(iso) { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); },
    },
};
</script>

<template>
    <p v-if="loading" class="text-sm text-black/40 py-10 text-center">Loading…</p>
    <div v-else>
        <p class="flex items-center gap-1.5 text-xs text-black/45 mb-4"><Lock class="w-3.5 h-3.5" /> Only you can see your closet.</p>

        <div v-if="!items.length" class="text-center py-14">
            <Shirt class="w-8 h-8 text-gold mx-auto mb-3" />
            <p class="text-sm text-black/55 mb-6 max-w-xs mx-auto">Everything you buy from BLESSLUXE lands here, ready to show off.</p>
            <router-link to="/shop" class="inline-block bg-gold text-white px-8 py-3.5 text-xs font-semibold tracking-[0.25em] uppercase hover:bg-gold-dark">Browse the shop</router-link>
        </div>

        <ul v-else class="space-y-2">
            <li v-for="i in items" :key="i.line_item_id" class="flex items-center gap-3 bg-white border border-black/8 p-2.5">
                <component :is="i.product_handle ? 'router-link' : 'span'" :to="i.product_handle ? `/shop/${i.product_handle}` : null" class="w-14 h-[4.5rem] g overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0">
                    <img v-if="i.thumbnail" :src="i.thumbnail" alt="" loading="lazy" class="w-full h-full object-cover" />
                    <ImageOff v-else class="w-4 h-4 text-black/25" />
                </component>
                <div class="min-w-0 flex-1">
                    <p class="text-sm truncate">{{ i.title }}</p>
                    <p class="text-[11px] text-black/45 truncate">{{ i.variant ? i.variant + ' · ' : '' }}{{ when(i.bought_at) }}</p>
                </div>
                <router-link v-if="i.look_id" :to="{ query: { look: i.look_id } }" class="inline-flex items-center gap-1 text-[11px] text-green-700 flex-shrink-0 px-2 py-2"><BadgeCheck class="w-4 h-4" /> Try-on posted</router-link>
                <button v-else @click="tryOn(i)" class="inline-flex items-center gap-1.5 h-10 px-3.5 border border-gold/50 text-gold-dark text-xs flex-shrink-0 hover:bg-cream">
                    <Camera class="w-3.5 h-3.5" /> Try-on<template v-if="i.earns"> · +{{ i.earns }}</template>
                </button>
            </li>
        </ul>
    </div>
</template>
