<script>
export default {
    name: 'WishlistPage',
    data() {
        return {
            items: [],
        };
    },
};
</script>

<template>
    <div class="max-w-[1200px] mx-auto px-[5%] py-12 min-h-[60vh]">
        <div class="text-center mb-12">
            <p class="font-script text-3xl text-gold">Saved</p>
            <h1 class="font-display text-3xl md:text-4xl tracking-widest uppercase">Wishlist</h1>
        </div>
        <div v-if="items.length === 0" class="text-center py-16">
            <p class="text-black/65 mb-6">Nothing saved yet — tap the heart on any product to save it here.</p>
            <router-link to="/shop" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Browse Products
            </router-link>
        </div>
    </div>
</template>
