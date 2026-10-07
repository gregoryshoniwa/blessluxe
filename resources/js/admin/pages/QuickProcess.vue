<script>
import { Layers, Shirt, ShoppingBag } from 'lucide-vue-next';
import QuickSeriesForm from '../components/QuickSeriesForm.vue';

/**
 * Quick process — the jobs staff do every day, one tap from the top of the
 * sidebar. The tab lives in the address (`?tab=`), so a tab can be bookmarked
 * and the back button goes back to it.
 */
const TABS = [
    { key: 'series',   label: 'Series',   icon: 'Layers',      full: '/admin/series' },
    { key: 'products', label: 'Products', icon: 'Shirt',       full: '/admin/products' },
    { key: 'orders',   label: 'Orders',   icon: 'ShoppingBag', full: '/admin/orders' },
];

export default {
    name: 'AdminQuickProcess',
    components: { Layers, Shirt, ShoppingBag, QuickSeriesForm },
    data() { return { tabs: TABS }; },
    computed: {
        tab() { return TABS.find((t) => t.key === this.$route.query.tab) || TABS[0]; },
    },
    methods: {
        go(t) { this.$router.replace({ query: { ...this.$route.query, tab: t.key } }); },
    },
};
</script>

<template>
    <div>
        <header class="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">Everyday work</p>
                <h1 class="text-2xl font-semibold">Quick process</h1>
            </div>
            <router-link :to="tab.full" class="text-xs tracking-widest uppercase text-zinc-500 hover:text-gold">Open full {{ tab.label }} page →</router-link>
        </header>

        <div class="scroll-strip flex border-b border-zinc-200 mb-6 text-xs tracking-widest uppercase" role="tablist">
            <button
                v-for="t in tabs"
                :key="t.key"
                role="tab"
                :aria-selected="tab.key === t.key"
                @click="go(t)"
                :class="['px-4 py-2 min-h-11 inline-flex items-center gap-2 whitespace-nowrap', tab.key === t.key ? 'border-b-2 border-gold text-gold' : 'text-zinc-500 hover:text-black']"
            >
                <component :is="t.icon" class="w-4 h-4" /> {{ t.label }}
            </button>
        </div>

        <!-- Each tab's quick tools go here, one section per tab. -->
        <section v-if="tab.key === 'series'" role="tabpanel">
            <QuickSeriesForm />
        </section>
        <section v-else-if="tab.key === 'products'" role="tabpanel" class="bg-white border border-zinc-200 p-8 text-sm text-zinc-500 text-center">
            Products quick tools — coming next.
        </section>
        <section v-else role="tabpanel" class="bg-white border border-zinc-200 p-8 text-sm text-zinc-500 text-center">
            Orders quick tools — coming next.
        </section>
    </div>
</template>
