<script>
import { Check, ChevronDown } from 'lucide-vue-next';

/**
 * One step of checkout as a card: collapsed it states what we'll use, open it
 * holds the controls that change it. Used for Contact, Shipping address and
 * Delivery method so all three read the same way.
 *
 * <CheckoutSection title="Contact" :summary="…" :complete="…" v-model:open="open.contact">
 *   <template #icon><Mail class="w-4 h-4 text-gold flex-shrink-0" /></template>
 *   …controls…
 * </CheckoutSection>
 */
export default {
    name: 'CheckoutSection',
    components: { Check, ChevronDown },
    props: {
        title: { type: String, required: true },
        summary: { type: String, default: '' },
        hint: { type: String, default: '' },        // a second, quieter line while collapsed
        complete: { type: Boolean, default: false },
        open: { type: Boolean, default: false },
    },
    emits: ['update:open'],
};
</script>

<template>
    <section :class="['border transition-colors', open ? 'border-black/15' : 'border-gold/30 bg-cream-dark/40']">
        <button
            type="button"
            @click="$emit('update:open', !open)"
            :aria-expanded="open"
            class="w-full flex items-center gap-3 px-4 py-4 min-h-11 text-left"
        >
            <slot name="icon" />
            <div class="flex-1 min-w-0">
                <p class="font-display text-sm tracking-widest uppercase flex items-center gap-2">
                    {{ title }}
                    <Check v-if="complete && !open" class="w-3.5 h-3.5 text-emerald-600" />
                </p>
                <p v-if="!open" class="text-sm text-black/65 mt-0.5 truncate">{{ summary }}</p>
                <p v-if="!open && hint" class="text-xs text-black/45 mt-0.5">{{ hint }}</p>
            </div>
            <span class="text-[10px] tracking-widest uppercase text-gold-dark flex items-center gap-1 flex-shrink-0">
                {{ open ? 'Close' : 'Change' }}
                <ChevronDown :class="['w-3.5 h-3.5 transition-transform', open && 'rotate-180']" />
            </span>
        </button>
        <div v-if="open" class="px-4 pb-4">
            <slot />
        </div>
    </section>
</template>
