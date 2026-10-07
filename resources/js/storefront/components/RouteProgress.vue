<script>
import { onBusy } from '../../lib/smooth.js';

/**
 * A thin gold line across the top while a page or a set of results is on its
 * way — the quiet promise that a tap was heard. It creeps forward while work is
 * pending and finishes in one sweep; it never appears for anything quicker than
 * ~150ms, so a fast answer doesn't flicker a bar for nothing.
 */
export default {
    name: 'RouteProgress',
    data() {
        return { width: 0, visible: false, timer: null, creep: null, off: null };
    },
    mounted() {
        this.off = onBusy((on) => (on ? this.start() : this.finish()));
    },
    beforeUnmount() {
        this.off?.();
        clearTimeout(this.timer);
        clearInterval(this.creep);
    },
    methods: {
        start() {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                this.visible = true;
                this.width = 12;
                clearInterval(this.creep);
                // Slower the further it goes: it's a promise, not a measurement.
                this.creep = setInterval(() => { this.width = Math.min(90, this.width + (90 - this.width) * 0.08); }, 120);
            }, 150);
        },
        finish() {
            clearTimeout(this.timer);
            clearInterval(this.creep);
            if (!this.visible) return;
            this.width = 100;
            this.timer = setTimeout(() => { this.visible = false; this.width = 0; }, 350);
        },
    },
};
</script>

<template>
    <div class="fixed top-0 inset-x-0 h-[2px] z-[100] pointer-events-none" aria-hidden="true">
        <div
            class="h-full bg-gold shadow-[0_0_8px_var(--color-gold)] transition-[width,opacity] ease-out"
            :class="visible ? 'opacity-100 duration-300' : 'opacity-0 duration-300'"
            :style="{ width: width + '%' }"
        ></div>
    </div>
</template>
