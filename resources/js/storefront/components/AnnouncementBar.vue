<script>
import { affiliateStore } from '../affiliate-store.js';

export default {
    name: 'AnnouncementBar',
    data() {
        return {
            shop: affiliateStore.state,
            house: [
                'NEW ARRIVALS EVERY WEEK',
                'EASY 30-DAY RETURNS',
                'EXCLUSIVE MEMBER REWARDS',
                'FREE SHIPPING ON ORDERS OVER $100',
            ],
        };
    },
    computed: {
        // Inside an affiliate's shop that wrote its own lines, show theirs.
        messages() { return affiliateStore.topBar() || this.house; },
        // Repeat until the strip is comfortably wider than any screen: one
        // short line on its own would leave the marquee mostly empty.
        strip() {
            const out = [];
            while (out.length < 8) out.push(...this.messages);
            return [...out, ...out];
        },
    },
};
</script>

<template>
    <div class="bg-gold text-white text-[10px] sm:text-xs tracking-[0.32em] uppercase overflow-hidden">
        <div class="flex animate-marquee whitespace-nowrap py-2">
            <span v-for="(m, i) in strip" :key="i" class="px-8 flex items-center gap-3">
                <span>{{ m }}</span>
                <span class="text-gold-dark">◆</span>
            </span>
        </div>
    </div>
</template>

<style scoped>
@keyframes marquee {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
}
.animate-marquee {
    animation: marquee 35s linear infinite;
}
</style>
