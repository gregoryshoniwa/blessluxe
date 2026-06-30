<script>
export default {
    name: 'CheckoutShipping',
    data() {
        return {
            address1: '', city: '', country: 'Zimbabwe',
            method: 'standard',
        };
    },
    methods: {
        next() {
            this.$router.push('/checkout/payment');
        },
    },
};
</script>

<template>
    <div class="max-w-[800px] mx-auto px-[5%] py-12">
        <ol class="flex gap-2 text-[10px] tracking-widest uppercase mb-8 text-black/55">
            <li>1 · Information</li>
            <li>→</li>
            <li class="text-gold">2 · Shipping</li>
            <li>→</li>
            <li>3 · Payment</li>
        </ol>
        <h1 class="font-display text-3xl tracking-widest uppercase mb-6">Shipping</h1>
        <form @submit.prevent="next" class="space-y-4">
            <input v-model="address1" type="text" placeholder="Street address" required class="w-full border border-black/15 px-4 py-3" />
            <div class="grid grid-cols-2 gap-3">
                <input v-model="city" type="text" placeholder="City" required class="border border-black/15 px-4 py-3" />
                <input v-model="country" type="text" placeholder="Country" required class="border border-black/15 px-4 py-3" />
            </div>
            <label class="flex items-center gap-3 border border-black/15 px-4 py-3">
                <input type="radio" v-model="method" value="standard" />
                <span class="flex-1">Standard delivery</span>
                <span class="text-gold">Free</span>
            </label>
            <button type="submit" class="w-full bg-gold text-white py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Continue to Payment
            </button>
        </form>
    </div>
</template>
