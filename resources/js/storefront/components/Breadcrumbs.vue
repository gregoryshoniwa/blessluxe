<script>
import { ChevronLeft } from 'lucide-vue-next';
import { crumbs } from '../crumbs.js';

/**
 * Where you are, and the way back. "Back" returns to the page you actually
 * came from when it was inside the shop (so a filtered list comes back with
 * its filters and scroll); arriving from outside — a WhatsApp link — it goes
 * one level up instead. On a phone only the back link shows; the full trail
 * from `sm` up (Baymard: on small screens the parent is what matters).
 */
export default {
    name: 'Breadcrumbs',
    components: { ChevronLeft },
    data() { return { crumbs }; },
    computed: {
        trail() { return this.crumbs.items ? [{ label: 'Home', to: '/' }, ...this.crumbs.items] : null; },
        parent() { return this.trail ? [...this.trail].slice(0, -1).reverse().find((c) => c.to) : null; },
        /** Vue Router remembers the previous in-app address on the history entry. */
        cameFromShop() { return typeof window !== 'undefined' && typeof window.history.state?.back === 'string'; },
        backLabel() { return this.cameFromShop ? 'Back' : `Back to ${this.parent?.label || 'Home'}`; },
    },
    methods: {
        back() {
            if (this.cameFromShop) this.$router.back();
            else this.$router.push(this.parent?.to || '/');
        },
    },
};
</script>

<template>
    <nav v-if="trail" aria-label="Breadcrumb" class="max-w-[1400px] mx-auto px-[5%] pt-4 -mb-1 flex items-center gap-3 text-[11px] tracking-[0.15em] uppercase text-black/50 min-w-0">
        <button @click="back" class="inline-flex items-center gap-1 min-h-11 -my-3 pr-1 text-black/70 hover:text-gold transition-colors flex-shrink-0" :title="backLabel">
            <ChevronLeft class="w-4 h-4" /> <span>{{ backLabel }}</span>
        </button>
        <span class="hidden sm:block w-px h-3 bg-black/15 flex-shrink-0" aria-hidden="true"></span>
        <ol class="hidden sm:flex items-center gap-1.5 min-w-0">
            <li v-for="(c, i) in trail" :key="i" class="flex items-center gap-1.5 min-w-0">
                <span v-if="i" class="text-black/25" aria-hidden="true">›</span>
                <router-link v-if="c.to && i < trail.length - 1" :to="c.to" class="hover:text-gold transition-colors whitespace-nowrap">{{ c.label }}</router-link>
                <span v-else class="text-black/75 truncate max-w-[22rem]" aria-current="page" :title="c.label">{{ c.label }}</span>
            </li>
        </ol>
    </nav>
</template>
