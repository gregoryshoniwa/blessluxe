<script>
export default {
    name: 'ProductCard',
    props: {
        product: { type: Object, required: true },
    },
};
</script>

<template>
    <router-link :to="`/shop/${product.handle}`" class="block group">
        <div class="aspect-[3/4] bg-cream-dark mb-2 overflow-hidden group-hover:opacity-90 transition-opacity">
            <img
                v-if="product.thumbnail"
                :src="product.thumbnail"
                :alt="product.title"
                class="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            />
        </div>
        <p class="font-display text-sm leading-tight line-clamp-1 group-hover:text-gold transition-colors">
            {{ product.title }}
        </p>
        <p v-if="product.subtitle" class="text-[10px] text-black/55 line-clamp-1">{{ product.subtitle }}</p>
        <p class="text-xs text-black mt-0.5">{{ product.price_label || '—' }}</p>
    </router-link>
</template>
