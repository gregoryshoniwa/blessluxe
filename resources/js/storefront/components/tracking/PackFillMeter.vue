<script>
export default {
    name: 'PackFillMeter',
    props: {
        // COUNTS ONLY. This component must never receive or render other buyers'
        // names, emails or items — a buyer needs to know what their order is
        // waiting on, not who else is in the drop.
        pack: { type: Object, required: true },
    },
    computed: {
        total() { return Number(this.pack.slots_total || 0); },
        paid() { return Number(this.pack.slots_paid || 0); },
        remaining() { return Math.max(0, this.total - this.paid); },
        isFull() { return this.total > 0 && this.paid >= this.total; },
        percent() { return this.total ? (this.paid / this.total) * 100 : 0; },
    },
};
</script>

<template>
    <section class="bg-cream-dark/40 border border-gold/15 p-5">
        <div class="flex items-baseline justify-between gap-3 flex-wrap mb-3">
            <p class="text-[10px] tracking-widest uppercase text-black/55">
                Pack
                <span v-if="pack.public_code" class="font-mono text-gold-dark ml-1">{{ pack.public_code }}</span>
            </p>
            <p class="text-[10px] tracking-widest uppercase" :class="isFull ? 'text-emerald-700' : 'text-gold-dark'">
                {{ paid }} of {{ total }} slots filled
            </p>
        </div>

        <div class="h-1 bg-white/70 relative overflow-hidden">
            <div
                class="absolute inset-y-0 left-0 transition-all duration-500"
                :class="isFull ? 'bg-emerald-500' : 'bg-gold'"
                :style="{ width: percent + '%' }"
            ></div>
        </div>

        <p class="text-sm text-black/70 mt-3">
            <template v-if="isFull">This series is full and is being prepared to ship.</template>
            <template v-else-if="pack.ships_when_full">
                Ships once the pack is full — {{ remaining }} slot<template v-if="remaining !== 1">s</template> still open.
            </template>
            <template v-else>This series is {{ pack.status }}.</template>
        </p>

        <ul v-if="pack.your_items?.length" class="mt-3 flex flex-wrap gap-2">
            <li
                v-for="(it, i) in pack.your_items"
                :key="i"
                class="text-[10px] tracking-widest uppercase bg-gold/20 text-gold-dark px-2 py-0.5"
            >
                Yours · {{ it.size_label }}
            </li>
        </ul>
    </section>
</template>
