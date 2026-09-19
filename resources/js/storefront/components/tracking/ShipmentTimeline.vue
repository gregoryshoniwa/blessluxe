<script>
import { iconKey } from '../../../lib/shipping.js';
import { Package, Truck, CheckCircle2, XCircle, MapPin, Clock } from 'lucide-vue-next';

// No <script setup> anywhere in this codebase, so icons are imported AND
// registered, then resolved by name through <component :is>.
const ICONS = { package: 'Package', truck: 'Truck', check: 'CheckCircle2', x: 'XCircle' };

export default {
    name: 'ShipmentTimeline',
    components: { Package, Truck, CheckCircle2, XCircle, MapPin, Clock },
    props: {
        events: { type: Array, default: () => [] },
        // Newest first reads better on a long history; oldest first tells a story.
        newestFirst: { type: Boolean, default: false },
    },
    computed: {
        ordered() {
            const e = [...(this.events || [])];
            return this.newestFirst ? e.reverse() : e;
        },
    },
    methods: {
        eventIcon(status) { return ICONS[iconKey(status)] || 'Package'; },
        fmtDateTime(iso) {
            return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
        },
    },
};
</script>

<template>
    <ol v-if="ordered.length" class="relative border-l-2 border-gold/20 pl-6 space-y-6">
        <li v-for="(e, idx) in ordered" :key="idx" class="relative">
            <span class="absolute -left-[31px] top-0 w-6 h-6 rounded-full bg-cream border-2 border-gold flex items-center justify-center">
                <component :is="eventIcon(e.status)" class="w-3 h-3 text-gold-dark" />
            </span>
            <p class="font-display text-base">{{ e.status_label || e.status }}</p>
            <p v-if="e.location" class="text-xs text-black/55 inline-flex items-center gap-1 mt-1">
                <MapPin class="w-3 h-3" /> {{ e.location }}
            </p>
            <p v-if="e.notes" class="text-sm text-black/70 mt-1">{{ e.notes }}</p>
            <p class="text-[10px] tracking-widest uppercase text-black/40 mt-1 inline-flex items-center gap-1">
                <Clock class="w-3 h-3" /> {{ fmtDateTime(e.created_at) }}
            </p>
        </li>
    </ol>
    <p v-else class="text-sm text-black/55">No activity recorded yet.</p>
</template>
