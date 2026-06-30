<script>
export default {
    name: 'CheckoutInfo',
    data() {
        return {
            email: '',
            firstName: '',
            lastName: '',
        };
    },
    methods: {
        next() {
            this.$router.push('/checkout/shipping');
        },
    },
};
</script>

<template>
    <div class="max-w-[800px] mx-auto px-[5%] py-12">
        <ol class="flex gap-2 text-[10px] tracking-widest uppercase mb-8 text-black/55">
            <li class="text-gold">1 · Information</li>
            <li>→</li>
            <li>2 · Shipping</li>
            <li>→</li>
            <li>3 · Payment</li>
        </ol>
        <h1 class="font-display text-3xl tracking-widest uppercase mb-6">Contact</h1>

        <form @submit.prevent="next" class="space-y-4">
            <input v-model="email" type="email" placeholder="Email" required class="w-full border border-black/15 px-4 py-3" />
            <div class="grid grid-cols-2 gap-3">
                <input v-model="firstName" type="text" placeholder="First name" required class="border border-black/15 px-4 py-3" />
                <input v-model="lastName"  type="text" placeholder="Last name"  required class="border border-black/15 px-4 py-3" />
            </div>
            <button type="submit" class="w-full bg-gold text-white py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Continue to Shipping
            </button>
        </form>
    </div>
</template>
