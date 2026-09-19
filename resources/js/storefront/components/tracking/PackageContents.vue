<script>
export default {
    name: 'PackageContents',
    props: {
        items: { type: Array, default: () => [] },
    },
};
</script>

<template>
    <!-- Thumbnails matter: with several orders in flight, images are how a
         customer tells one tracking page from another at a glance. -->
    <ul v-if="items.length" class="divide-y divide-gold/5">
        <li v-for="(i, idx) in items" :key="idx" class="py-3 flex items-center gap-3">
            <div class="w-16 h-20 bg-cream-dark flex-shrink-0 overflow-hidden">
                <img
                    v-if="i.thumbnail"
                    :src="i.thumbnail"
                    :alt="i.product_title"
                    class="w-full h-full object-cover object-top"
                />
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-display text-sm leading-tight">{{ i.product_title }}</p>
                <p v-if="i.variant_title" class="text-xs text-black/55">{{ i.variant_title }}</p>
                <p v-if="i.sub_code" class="text-[10px] tracking-widest uppercase text-gold-dark font-mono mt-1">
                    {{ i.sub_code }}
                </p>
            </div>
            <span class="text-xs text-black/55 flex-shrink-0">×{{ i.quantity }}</span>
        </li>
    </ul>
    <p v-else class="text-sm text-black/55">No items listed for this shipment.</p>
</template>
