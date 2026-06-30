<script>
export default {
    name: 'CheckoutConfirmation',
    computed: {
        orderNumber() {
            return this.$route.query.order || 'BL-DEMO';
        },
    },
};
</script>

<template>
    <div class="min-h-[60vh] flex items-center justify-center px-[5%]">
        <div class="text-center max-w-md">
            <p class="font-script text-3xl text-gold">Thank you</p>
            <h1 class="font-display text-3xl md:text-4xl tracking-widest uppercase mb-2">Order Confirmed</h1>
            <p class="text-sm text-black/65 mb-2">Your order number is</p>
            <p class="font-mono text-lg mb-8">{{ orderNumber }}</p>
            <router-link to="/account" class="inline-block border border-gold text-gold px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold hover:text-white transition-colors">
                View My Orders
            </router-link>
        </div>
    </div>
</template>
