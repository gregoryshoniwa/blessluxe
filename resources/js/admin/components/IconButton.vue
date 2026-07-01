<script>
/**
 * Small icon-only action button with a tooltip hint and a danger/normal tone.
 * Used across every admin table so the row stays compact and the action
 * intent reads visually instead of via verbose labels.
 *
 * Props:
 *   tone    'normal' | 'danger' | 'positive' | 'warning'  (default 'normal')
 *   label   the tooltip text (also the aria-label for screen readers)
 */
export default {
    name: 'IconButton',
    props: {
        tone:    { type: String, default: 'normal' },
        label:   { type: String, required: true },
        disabled: { type: Boolean, default: false },
    },
    computed: {
        toneClasses() {
            const tones = {
                normal:   'text-zinc-500 hover:text-gold hover:bg-gold/10',
                danger:   'text-zinc-500 hover:text-red-600 hover:bg-red-50',
                positive: 'text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50',
                warning:  'text-zinc-500 hover:text-amber-600 hover:bg-amber-50',
            };
            return tones[this.tone] || tones.normal;
        },
    },
};
</script>

<template>
    <button
        type="button"
        :disabled="disabled"
        :aria-label="label"
        :title="label"
        :class="[
            'inline-flex items-center justify-center w-8 h-8 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
            toneClasses,
        ]"
    >
        <slot />
    </button>
</template>
