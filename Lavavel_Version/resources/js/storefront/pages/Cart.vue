<script>
export default {
    name: 'CartPage',
    data() {
        return {
            items: [],
        };
    },
    computed: {
        subtotal() {
            return this.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
        },
        isEmpty() {
            return this.items.length === 0;
        },
    },
};
</script>

<template>
    <div class="max-w-[1200px] mx-auto px-[5%] py-12">
        <div class="text-center mb-12">
            <p class="font-script text-3xl text-gold">Your Cart</p>
            <h1 class="font-display text-3xl md:text-4xl tracking-widest uppercase">Shopping Cart</h1>
        </div>

        <div v-if="isEmpty" class="text-center py-16">
            <p class="text-black/65 mb-8">Your cart is empty.</p>
            <router-link to="/shop" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Continue Shopping
            </router-link>
        </div>

        <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-2 space-y-4">
                <div v-for="item in items" :key="item.id" class="flex gap-4 border-b border-gold/10 pb-4">
                    <div class="w-20 h-24 bg-cream-dark" />
                    <div class="flex-1">
                        <p class="font-display text-base">{{ item.title }}</p>
                        <p class="text-xs text-black/60">{{ item.variant }}</p>
                        <p class="text-sm mt-2">${{ (item.unitPrice * item.quantity).toFixed(2) }}</p>
                    </div>
                </div>
            </div>
            <div class="bg-cream-dark/50 p-6 h-fit">
                <h3 class="font-display text-lg tracking-widest uppercase mb-4">Order Summary</h3>
                <div class="flex justify-between text-sm mb-2">
                    <span>Subtotal</span>
                    <span>${{ subtotal.toFixed(2) }}</span>
                </div>
                <router-link to="/checkout" class="block w-full text-center bg-gold text-white py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors mt-4">
                    Proceed to Checkout
                </router-link>
            </div>
        </div>
    </div>
</template>
