<script>
export default {
    name: 'PacksPage',
    data() {
        return {
            campaigns: [],
        };
    },
};
</script>

<template>
    <div class="max-w-[1400px] mx-auto px-[5%] py-12">
        <div class="text-center mb-12">
            <p class="font-script text-3xl text-gold mb-2">Group Buy</p>
            <h1 class="font-display text-4xl md:text-5xl tracking-widest uppercase">Packs</h1>
            <p class="text-sm text-black/65 mt-4 max-w-xl mx-auto">
                Claim a slot in a limited drop. When the pack fills, the price drops for everyone in it.
            </p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div v-for="n in 6" :key="n" class="border border-gold/15 bg-white p-6">
                <div class="aspect-[4/5] bg-gradient-to-br from-cream-dark to-blush mb-4" />
                <p class="font-display text-lg tracking-widest uppercase">Sample Pack {{ n }}</p>
                <p class="text-sm text-black/65">8 of 10 slots claimed</p>
            </div>
        </div>
        <p class="text-center text-xs text-black/50 mt-12 tracking-widest uppercase">
            Pack campaigns wire up after the catalogue port
        </p>
    </div>
</template>
