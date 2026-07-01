<script>
export default {
    name: 'AnnouncementBar',
    data() {
        return {
            messages: [
                'NEW ARRIVALS EVERY WEEK',
                'EASY 30-DAY RETURNS',
                'EXCLUSIVE MEMBER REWARDS',
                'FREE SHIPPING ON ORDERS OVER $100',
            ],
        };
    },
};
</script>

<template>
    <div class="bg-gold text-white text-[10px] sm:text-xs tracking-[0.32em] uppercase overflow-hidden">
        <div class="flex animate-marquee whitespace-nowrap py-2">
            <span v-for="(m, i) in [...messages, ...messages]" :key="i" class="px-8 flex items-center gap-3">
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
