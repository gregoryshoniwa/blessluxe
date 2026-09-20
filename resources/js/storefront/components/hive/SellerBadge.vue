<script>
import { BadgeCheck } from 'lucide-vue-next';

/** "Seller" — an approved BLESSLUXE affiliate. Shown only when the server says so. */
export default {
    name: 'SellerBadge',
    components: { BadgeCheck },
    props: { label: { type: Boolean, default: false } },
};
</script>

<template>
    <span class="inline-flex items-center gap-0.5 align-middle text-gold-dark flex-shrink-0" title="Verified BLESSLUXE seller">
        <BadgeCheck class="w-4 h-4" aria-hidden="true" />
        <span v-if="label" class="text-[10px] tracking-widest uppercase font-medium">Seller</span>
        <span v-else class="sr-only">Verified seller</span>
    </span>
</template>
