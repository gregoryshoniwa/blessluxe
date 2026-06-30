<script>
export default {
    name: 'CheckoutPayment',
    data() {
        return {
            method: 'paynow',
        };
    },
    methods: {
        pay() {
            // Milestone 5 wires the Paynow PHP SDK + IPN + return flow.
            this.$router.push('/checkout/confirmation');
        },
    },
};
</script>

<template>
    <div class="max-w-[800px] mx-auto px-[5%] py-12">
        <ol class="flex gap-2 text-[10px] tracking-widest uppercase mb-8 text-black/55">
            <li>1 · Information</li>
            <li>→</li>
            <li>2 · Shipping</li>
            <li>→</li>
            <li class="text-gold">3 · Payment</li>
        </ol>
        <h1 class="font-display text-3xl tracking-widest uppercase mb-6">Payment</h1>
        <div class="space-y-3">
            <label class="flex items-center gap-3 border border-black/15 px-4 py-3 cursor-pointer">
                <input type="radio" v-model="method" value="paynow" />
                <div class="flex-1">
                    <p class="font-medium">Paynow</p>
                    <p class="text-xs text-black/60">EcoCash, OneMoney, ZIPIT or card via Paynow</p>
                </div>
            </label>
        </div>
        <button @click="pay" class="w-full bg-gold text-white py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors mt-6">
            Continue to Paynow
        </button>
    </div>
</template>
