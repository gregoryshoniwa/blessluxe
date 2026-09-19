<script>
import { PROGRESS_STEPS } from '../../../lib/shipping.js';

export default {
    name: 'ShipmentProgress',
    props: {
        // progressIndex is null for a failed parcel — see lib/shipping.js
        progressIndex: { type: Number, default: 0 },
        isFailure: { type: Boolean, default: false },
        statusLabel: { type: String, default: '' },
        // Lets a pack buyer's two-leg journey use its own milestones.
        steps: { type: Array, default: () => PROGRESS_STEPS },
        // A pack that hasn't filled yet cannot progress; say so rather than
        // showing a stalled bar with no explanation.
        awaitingPack: { type: Boolean, default: false },
    },
    computed: {
        percent() {
            // A failure fills the bar in red: the journey ended, just not well.
            if (this.isFailure) return 100;
            if (this.progressIndex === null || this.progressIndex === undefined) return 0;
            return (this.progressIndex / Math.max(1, this.steps.length - 1)) * 100;
        },
    },
};
</script>

<template>
    <div>
        <div v-if="!isFailure" class="flex justify-between gap-1 text-[10px] tracking-widest uppercase text-black/55 mb-2">
            <span
                v-for="(step, i) in steps"
                :key="step"
                :class="progressIndex >= i ? 'text-gold-dark' : ''"
                class="text-center first:text-left last:text-right"
            >{{ step }}</span>
        </div>
        <p v-else class="text-[10px] tracking-widest uppercase text-red-600 mb-2">
            {{ statusLabel }} — this parcel did not complete its journey
        </p>

        <div class="h-1 bg-cream-dark relative overflow-hidden">
            <div
                class="absolute inset-y-0 left-0 transition-all duration-500"
                :class="isFailure ? 'bg-red-500' : 'bg-gold'"
                :style="{ width: percent + '%' }"
            ></div>
        </div>

        <p v-if="awaitingPack && !isFailure" class="text-[10px] tracking-widest uppercase text-black/45 mt-2">
            Waiting for the pack to fill before it ships
        </p>
    </div>
</template>
