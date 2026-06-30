<script>
import { api } from '../../lib/api.js';
import { checkoutStore } from '../checkout-store.js';
import { Lock, ArrowRight, Smartphone, ShieldCheck, Sparkles } from 'lucide-vue-next';

export default {
    name: 'CheckoutPayment',
    components: { Lock, ArrowRight, Smartphone, ShieldCheck, Sparkles },
    data() {
        return {
            cart: null,
            loading: true,
            submitting: false,
            error: '',
            method: 'paynow',
            // Blits redemption state.
            blits: null,         // { balance, recent } when signed-in customer has blits; null otherwise
            blitsSettings: null, // { enabled, per_usd, max_discount_percent, earn_per_usd }
            blitsToUse: 0,       // slider value
            blitsPreview: null,  // server-confirmed { blits, discount_cents, reason }
            previewing: false,
        };
    },
    computed: {
        draft() { return checkoutStore.draft; },
        subtotalCents() { return this.cart?.subtotal || 0; },
        subtotal() { return (this.subtotalCents / 100).toFixed(2); },
        discountCents() { return this.blitsPreview?.discount_cents || 0; },
        discount() { return (this.discountCents / 100).toFixed(2); },
        totalCents() { return Math.max(0, this.subtotalCents - this.discountCents); },
        total() { return (this.totalCents / 100).toFixed(2); },
        itemCount() { return this.cart?.item_count || 0; },
        readyToPay() {
            const d = this.draft;
            return d.email && d.shipping_address?.address1 && d.shipping_address?.city;
        },
        canUseBlits() {
            return this.blits && this.blitsSettings?.enabled && this.blits.balance > 0 && this.subtotalCents > 0;
        },
        maxRedeemableBlits() {
            // Capped by the max-discount-percent * subtotal, then by balance.
            if (!this.blitsSettings) return 0;
            const maxDiscountCents = Math.floor(this.subtotalCents * this.blitsSettings.max_discount_percent / 100);
            const maxByPolicy = Math.floor(maxDiscountCents * this.blitsSettings.per_usd / 100);
            return Math.min(this.blits.balance, maxByPolicy);
        },
    },
    async mounted() {
        try {
            const [cartRes, blitsRes] = await Promise.all([
                api.get('/api/store/cart'),
                api.get('/api/account/blits').catch(() => ({ blits: null, settings: null })),
            ]);
            this.cart = cartRes.cart;
            this.blits = blitsRes.blits;
            this.blitsSettings = blitsRes.settings;
            if (!this.cart?.items?.length) {
                this.$router.replace('/cart');
                return;
            }
            if (!this.readyToPay) {
                this.$router.replace('/checkout');
            }
        } finally {
            this.loading = false;
        }
    },
    methods: {
        async refreshPreview() {
            if (!this.canUseBlits || this.blitsToUse <= 0) {
                this.blitsPreview = null;
                return;
            }
            this.previewing = true;
            try {
                const data = await api.post('/api/account/blits/preview', {
                    blits: this.blitsToUse,
                    subtotal_cents: this.subtotalCents,
                });
                this.blitsPreview = data.preview;
            } catch { /* keep previous preview */ }
            finally { this.previewing = false; }
        },
        async pay() {
            this.submitting = true;
            this.error = '';
            try {
                const payload = {
                    email: this.draft.email,
                    auth_name: [this.draft.first_name, this.draft.last_name].filter(Boolean).join(' '),
                    auth_phone: this.draft.phone,
                    shipping_address: this.draft.shipping_address,
                    blits_to_use: this.canUseBlits ? this.blitsToUse : 0,
                };
                const data = await api.post('/api/store/payments/paynow/initiate', payload);
                if (data.browser_url) {
                    window.location.href = data.browser_url;
                    return;
                }
                this.error = 'Could not start Paynow checkout.';
            } catch (e) {
                this.error = e.payload?.error || 'Payment could not be started.';
            } finally {
                this.submitting = false;
            }
        },
        money(cents) { return `$${(cents / 100).toFixed(2)}`; },
    },
};
</script>

<template>
    <div class="min-h-screen bg-white">
        <header class="border-b border-gold/15">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                <router-link to="/" class="font-display text-lg tracking-widest">BLESSLUXE</router-link>
                <div class="flex items-center gap-2 text-xs text-black/55">
                    <Lock class="w-4 h-4" /> Secure Checkout
                </div>
            </div>
        </header>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <ol class="flex items-center justify-center gap-3 text-[10px] tracking-[0.3em] uppercase mb-10 text-black/40">
                <li class="flex items-center gap-2 text-emerald-600">
                    <span class="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center">✓</span>
                    Information
                </li>
                <li class="w-12 h-px bg-gold/30"></li>
                <li class="text-gold flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-gold text-white flex items-center justify-center">2</span>
                    Payment
                </li>
                <li class="w-12 h-px bg-black/10"></li>
                <li class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center">3</span>
                    Confirm
                </li>
            </ol>

            <div class="lg:grid lg:grid-cols-12 lg:gap-12">
                <section class="lg:col-span-7">
                    <button @click="$router.push('/checkout')" class="text-xs tracking-widest uppercase text-black/55 hover:text-gold mb-4 inline-flex items-center gap-1">
                        <ArrowRight class="w-3 h-3 rotate-180" /> Back to information
                    </button>
                    <h1 class="font-display text-2xl tracking-widest uppercase mb-6">Payment</h1>

                    <div v-if="loading" class="text-xs tracking-widest uppercase text-black/55 animate-pulse">Loading…</div>

                    <div v-else class="space-y-6">
                        <!-- Blits redemption panel -->
                        <section v-if="canUseBlits" class="bg-cream-dark/30 border border-gold/20 p-4">
                            <header class="flex items-center justify-between mb-3">
                                <p class="font-display text-base tracking-widest uppercase flex items-center gap-2">
                                    <Sparkles class="w-4 h-4 text-gold" />
                                    Use Blits
                                </p>
                                <p class="text-xs text-black/55">
                                    Balance: <strong>{{ blits.balance }} Blits</strong>
                                </p>
                            </header>
                            <p class="text-xs text-black/60 mb-3">
                                1 USD = {{ blitsSettings.per_usd }} Blits · up to {{ blitsSettings.max_discount_percent }}% of an order
                            </p>
                            <div class="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="0"
                                    :max="maxRedeemableBlits"
                                    step="10"
                                    v-model.number="blitsToUse"
                                    @change="refreshPreview"
                                    @input="refreshPreview"
                                    class="flex-1 accent-gold"
                                />
                                <input
                                    type="number"
                                    min="0"
                                    :max="maxRedeemableBlits"
                                    v-model.number="blitsToUse"
                                    @blur="refreshPreview"
                                    class="w-24 border border-black/15 px-2 py-1 text-sm text-right"
                                />
                            </div>
                            <div class="flex justify-between items-center mt-3 text-sm">
                                <span class="text-black/60">
                                    <span v-if="previewing" class="animate-pulse">Calculating…</span>
                                    <span v-else-if="blitsPreview?.discount_cents">
                                        {{ blitsPreview.blits }} Blits → <strong class="text-emerald-600">${{ discount }} off</strong>
                                    </span>
                                    <span v-else>Drag to apply Blits</span>
                                </span>
                                <button
                                    v-if="blitsToUse > 0"
                                    @click="blitsToUse = 0; blitsPreview = null"
                                    class="text-[10px] tracking-widest uppercase text-black/55 hover:text-red-600"
                                >
                                    Clear
                                </button>
                            </div>
                        </section>

                        <label class="flex items-start gap-3 border-2 border-gold bg-cream-dark/40 px-4 py-4 cursor-pointer">
                            <input type="radio" v-model="method" value="paynow" class="mt-1 accent-gold" />
                            <Smartphone class="w-5 h-5 text-gold mt-0.5" />
                            <div class="flex-1">
                                <p class="font-display text-base">Paynow</p>
                                <p class="text-xs text-black/60 mt-1">
                                    EcoCash, OneMoney, ZIPIT or Visa/Mastercard. You'll be redirected to Paynow's
                                    secure page to complete payment.
                                </p>
                            </div>
                            <ShieldCheck class="w-5 h-5 text-emerald-500" />
                        </label>

                        <p class="flex items-center gap-2 text-xs text-black/55 mt-3">
                            <Lock class="w-3 h-3" />
                            All transactions are encrypted end-to-end.
                        </p>
                    </div>

                    <p v-if="error" class="text-sm text-red-600 mt-4">{{ error }}</p>

                    <button
                        @click="pay"
                        :disabled="submitting || loading"
                        class="flex items-center justify-center gap-2 w-full bg-gold text-white py-4 mt-6 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-50"
                    >
                        {{ submitting ? 'Redirecting to Paynow…' : `Pay $${total}` }}
                        <ArrowRight class="w-4 h-4" />
                    </button>
                </section>

                <aside class="lg:col-span-5 mt-10 lg:mt-0">
                    <div class="bg-cream-dark/50 p-6 sticky top-24">
                        <h3 class="font-display text-lg tracking-widest uppercase mb-4">Order Summary</h3>
                        <ul class="space-y-3 max-h-72 overflow-y-auto mb-4">
                            <li v-for="line in cart?.items || []" :key="line.id" class="flex gap-3">
                                <div class="relative w-14 h-16 bg-cream-dark flex-shrink-0 overflow-hidden">
                                    <img v-if="line.thumbnail" :src="line.thumbnail" :alt="line.title" class="absolute inset-0 w-full h-full object-cover" />
                                    <span class="absolute -top-1 -right-1 bg-gold text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
                                        {{ line.quantity }}
                                    </span>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-medium line-clamp-1">{{ line.title }}</p>
                                    <p class="text-xs text-black/60">{{ line.variant_title || '' }}</p>
                                </div>
                                <p class="text-sm">{{ money(line.line_total) }}</p>
                            </li>
                        </ul>
                        <div class="border-t border-gold/20 pt-3 space-y-2 text-sm">
                            <div class="flex justify-between">
                                <span class="text-black/60">Subtotal · {{ itemCount }} item{{ itemCount === 1 ? '' : 's' }}</span>
                                <span>${{ subtotal }}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-black/60">Shipping</span>
                                <span class="text-emerald-600">Free</span>
                            </div>
                            <div v-if="discountCents > 0" class="flex justify-between text-emerald-600">
                                <span>Blits ({{ blitsPreview.blits }})</span>
                                <span>-${{ discount }}</span>
                            </div>
                            <div class="flex justify-between pt-2 border-t border-gold/20 text-base font-semibold">
                                <span>Total</span>
                                <span>${{ total }}</span>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    </div>
</template>
