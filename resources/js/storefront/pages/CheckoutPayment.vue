<script>
import { api } from '../../lib/api.js';
import { toast } from '../../lib/dialog.js';
import { checkoutStore } from '../checkout-store.js';
import { Lock, ArrowRight, Smartphone, ShieldCheck, Sparkles, CreditCard, Wallet, Landmark, Shield } from 'lucide-vue-next';

// Acceptance marks, by the method they stand for. A method with no entry falls
// back to its line icon, so a missing file is never a broken image. Files and
// provenance: public/payments/README.md
const LOGOS = {
    ecocash: [{ src: '/payments/ecocash.svg', alt: 'EcoCash' }],
    card:    [{ src: '/payments/visa.svg', alt: 'Visa' }, { src: '/payments/mastercard.svg', alt: 'Mastercard' }],
};

export default {
    name: 'CheckoutPayment',
    components: { Lock, ArrowRight, Smartphone, ShieldCheck, Sparkles, CreditCard, Wallet, Landmark, Shield },
    data() {
        return {
            cart: null,
            loading: true,
            submitting: false,
            error: '',
            // Ways to pay, as staff have routed them (see /admin/payments). The
            // chosen one may need a phone number before it can start.
            options: [],
            option: null,
            tax: null,          // VAT disclosure settings (Zimbabwe: prices are tax-INCLUSIVE)
            phone: '',
            phoneError: '',
            phoneRevealed: false, // the gateway rejected the number we sent quietly — let them fix it
            // Bees redemption state.
            bees: null,         // { balance, recent } when signed-in customer has bees; null otherwise
            beesSettings: null, // { enabled, per_usd, max_discount_percent, earn_per_usd }
            beesToUse: 0,       // slider value
            beesPreview: null,  // server-confirmed { bees, discount_cents, reason }
            previewing: false,
        };
    },
    computed: {
        draft() { return checkoutStore.draft; },
        subtotalCents() { return this.cart?.subtotal || 0; },
        subtotal() { return (this.subtotalCents / 100).toFixed(2); },
        discountCents() { return this.beesPreview?.discount_cents || 0; },
        discount() { return (this.discountCents / 100).toFixed(2); },
        totalCents() { return Math.max(0, this.subtotalCents - this.discountCents); },
        total() { return (this.totalCents / 100).toFixed(2); },
        itemCount() { return this.cart?.item_count || 0; },
        /**
         * What the chosen gateway ADDS for paying this way. Velocity debits the
         * order total plus its charge, so the customer must see that before
         * they approve it. Mirrors Payments::quote() on the server.
         */
        surchargeLines() {
            const r = this.chosen?.surcharge;
            if (!r?.percent) return [];
            const charge = Math.round(this.totalCents * r.percent / 100);
            if (charge <= 0) return [];
            const out = [{ label: `${r.label} (${this.pct(r.percent)}%)`, cents: charge }];
            const tax = r.tax_percent > 0 ? Math.round(charge * r.tax_percent / 100) : 0;
            if (tax > 0) out.push({ label: `${r.tax_label} (${this.pct(r.tax_percent)}%)`, cents: tax });

            return out;
        },
        feesCents() { return this.surchargeLines.reduce((n, l) => n + l.cents, 0); },
        payTotalCents() { return this.totalCents + this.feesCents; },
        payTotal() { return (this.payTotalCents / 100).toFixed(2); },
        /** VAT already inside the price, not added to it — what Zimbabwe requires us to show. */
        taxIncludedCents() {
            if (!this.tax?.enabled || !this.tax.rate) return 0;

            return Math.round(this.totalCents * this.tax.rate / (100 + this.tax.rate));
        },
        chosen() { return this.options.find((o) => o.id === this.option) || null; },
        needsPhone() { return !!this.chosen?.needs?.includes('phone'); },
        // A wallet prompt lands on a phone, so the shopper must confirm WHICH one.
        // A card is paid on the gateway's page — the number is only for their
        // records, so the one from the details step is used without asking,
        // and the field appears only when we don't have one.
        promptsPhone() { return this.needsPhone && this.chosen?.method !== 'card'; },
        askPhone() { return this.needsPhone && (this.promptsPhone || this.phoneRevealed || !this.phoneLooksValid(this.draft.phone)); },
        payLabel() {
            if (this.submitting) return this.promptsPhone ? 'Sending the prompt…' : `Redirecting to ${this.chosen?.label || 'payment'}…`;
            return `Pay $${this.payTotal}`;
        },
        readyToPay() {
            const d = this.draft;
            return d.email && d.shipping_address?.address1 && d.shipping_address?.city;
        },
        canUseBees() {
            return this.bees && this.beesSettings?.enabled && this.bees.balance > 0 && this.subtotalCents > 0;
        },
        maxRedeemableBees() {
            // Capped by the max-discount-percent * subtotal, then by balance.
            if (!this.beesSettings) return 0;
            const maxDiscountCents = Math.floor(this.subtotalCents * this.beesSettings.max_discount_percent / 100);
            const maxByPolicy = Math.floor(maxDiscountCents * this.beesSettings.per_usd / 100);
            return Math.min(this.bees.balance, maxByPolicy);
        },
    },
    async mounted() {
        try {
            const [cartRes, beesRes, optRes] = await Promise.all([
                api.get('/api/store/cart'),
                api.get('/api/account/bees').catch(() => ({ bees: null, settings: null })),
                api.get('/api/store/payments/options').catch(() => ({ options: [] })),
            ]);
            this.cart = cartRes.cart;
            this.options = optRes.options || [];
            this.tax = optRes.tax || null;
            this.option = this.options[0]?.id || null;
            this.phone = this.draft.phone || '';
            if (!this.options.length) this.error = "Payments aren't available right now. Please try again shortly.";
            this.bees = beesRes.bees;
            this.beesSettings = beesRes.settings;
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
            if (!this.canUseBees || this.beesToUse <= 0) {
                this.beesPreview = null;
                return;
            }
            this.previewing = true;
            try {
                const data = await api.post('/api/account/bees/preview', {
                    bees: this.beesToUse,
                    subtotal_cents: this.subtotalCents,
                });
                this.beesPreview = data.preview;
            } catch { /* keep previous preview */ }
            finally { this.previewing = false; }
        },
        phoneLooksValid(v) { return /\d{9,}/.test(String(v || '').replace(/\D/g, '')); },
        icon(o) { return { smartphone: 'Smartphone', wallet: 'Wallet', landmark: 'Landmark', 'credit-card': 'CreditCard' }[o.icon] || 'Shield'; },
        logos(o) { return LOGOS[o.method] || []; },
        pct(n) { return String(Number(n)).replace(/\.0+$/, ''); },
        async pay() {
            if (!this.chosen) return;
            this.phoneError = '';
            if (this.needsPhone && !this.askPhone) this.phone = this.draft.phone;
            if (this.needsPhone && !this.phoneLooksValid(this.phone)) {
                this.phoneRevealed = true;
                this.phoneError = this.promptsPhone ? 'Enter the phone number that will pay, e.g. 077 123 4567.' : 'Enter a mobile number for your receipt, e.g. 077 123 4567.';
                return;
            }
            this.submitting = true;
            this.error = '';
            try {
                const payload = {
                    option: this.option,
                    phone: this.needsPhone ? this.phone : undefined,
                    email: this.draft.email,
                    auth_name: [this.draft.first_name, this.draft.last_name].filter(Boolean).join(' '),
                    auth_phone: this.draft.phone,
                    shipping_address: this.draft.shipping_address,
                    bees_to_use: this.canUseBees ? this.beesToUse : 0,
                };
                const data = await api.post('/api/store/payments/initiate', payload);
                if (data.redirect_url) { window.location.href = data.redirect_url; return; }
                // No redirect: they approve on their phone while we wait and poll.
                if (data.return_path) { this.$router.push(data.return_path); return; }
                toast('Could not start the payment.', { tone: 'error' });
            } catch (e) {
                // A field problem sits under the field; anything the gateway said is a notification.
                this.phoneError = e.payload?.errors?.phone?.[0] || '';
                if (this.phoneError) this.phoneRevealed = true;
                if (!this.phoneError) toast(e.payload?.error || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0]) || 'Payment could not be started.', { tone: 'error' });
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
                        <!-- Bees redemption panel -->
                        <section v-if="canUseBees" class="bg-cream-dark/30 border border-gold/20 p-4">
                            <header class="flex items-center justify-between mb-3">
                                <p class="font-display text-base tracking-widest uppercase flex items-center gap-2">
                                    <Sparkles class="w-4 h-4 text-gold" />
                                    Use Bees
                                </p>
                                <p class="text-xs text-black/55">
                                    Balance: <strong>{{ bees.balance }} Bees</strong>
                                </p>
                            </header>
                            <p class="text-xs text-black/60 mb-3">
                                1 USD = {{ beesSettings.per_usd }} Bees · up to {{ beesSettings.max_discount_percent }}% of an order
                            </p>
                            <div class="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="0"
                                    :max="maxRedeemableBees"
                                    step="10"
                                    v-model.number="beesToUse"
                                    @change="refreshPreview"
                                    @input="refreshPreview"
                                    class="flex-1 accent-gold"
                                />
                                <input
                                    type="number"
                                    min="0"
                                    :max="maxRedeemableBees"
                                    v-model.number="beesToUse"
                                    @blur="refreshPreview"
                                    class="w-24 border border-black/15 px-2 py-1 text-sm text-right"
                                />
                            </div>
                            <div class="flex justify-between items-center mt-3 text-sm">
                                <span class="text-black/60">
                                    <span v-if="previewing" class="animate-pulse">Calculating…</span>
                                    <span v-else-if="beesPreview?.discount_cents">
                                        {{ beesPreview.bees }} Bees → <strong class="text-emerald-600">${{ discount }} off</strong>
                                    </span>
                                    <span v-else>Drag to apply Bees</span>
                                </span>
                                <button
                                    v-if="beesToUse > 0"
                                    @click="beesToUse = 0; beesPreview = null"
                                    class="text-[10px] tracking-widest uppercase text-black/55 hover:text-red-600"
                                >
                                    Clear
                                </button>
                            </div>
                        </section>

                        <!-- One button per way to pay, all the same size, each wearing its own mark. -->
                        <div class="grid gap-3 sm:grid-cols-2">
                            <label
                                v-for="o in options"
                                :key="o.id"
                                :class="['relative flex flex-col items-center text-center gap-3 border-2 px-4 pt-10 pb-5 cursor-pointer transition-colors', option === o.id ? 'border-gold bg-cream-dark/40' : 'border-black/10 hover:border-black/25']"
                            >
                                <input type="radio" v-model="option" :value="o.id" class="absolute top-4 left-4 accent-gold" />
                                <ShieldCheck class="absolute top-4 right-4 w-5 h-5 text-emerald-500" />

                                <span class="flex items-center justify-center gap-4 h-9">
                                    <img v-for="l in logos(o)" :key="l.src" :src="l.src" :alt="l.alt" class="h-6 sm:h-7 w-auto max-w-[6.5rem] object-contain" />
                                    <component :is="icon(o)" v-if="!logos(o).length" class="w-7 h-7 text-gold" />
                                </span>

                                <span class="block">
                                    <span class="block font-display text-base">{{ o.label }}</span>
                                    <span class="block text-xs text-black/60 mt-1">{{ o.hint }}</span>
                                </span>
                            </label>
                        </div>

                        <!-- Asked once, under the buttons, so choosing one never resizes them. -->
                        <div v-if="askPhone" class="border border-black/15 px-4 py-4">
                            <label class="block text-xs text-black/60 mb-1">{{ promptsPhone ? 'Phone number that will pay' : 'Mobile number for your receipt' }}</label>
                            <input v-model.trim="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="077 123 4567" class="w-full sm:w-72 border border-black/15 px-3 py-2.5 text-sm focus:outline-none focus:border-gold" />
                            <p v-if="phoneError" class="text-xs text-red-600 mt-1">{{ phoneError }}</p>
                        </div>
                    </div>

                    <p v-if="error" class="text-sm text-red-600 mt-4">{{ error }}</p>
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
                                <span>Bees ({{ beesPreview.bees }})</span>
                                <span>-${{ discount }}</span>
                            </div>
                            <div v-for="l in surchargeLines" :key="l.label" class="flex justify-between">
                                <span class="text-black/60">{{ l.label }}</span>
                                <span>{{ money(l.cents) }}</span>
                            </div>
                            <div class="flex justify-between pt-2 border-t border-gold/20 text-base font-semibold">
                                <span>Total</span>
                                <span>${{ payTotal }}</span>
                            </div>
                            <p v-if="feesCents > 0" class="text-xs text-black/50">
                                {{ chosen?.label }} charges {{ money(feesCents) }} to take this payment. It's added by them, not by us.
                            </p>
                            <p v-if="taxIncludedCents > 0" class="text-xs text-black/50">
                                Price includes {{ tax.label }} at {{ pct(tax.rate) }}% · {{ money(taxIncludedCents) }}
                            </p>
                        </div>

                        <!-- Pay sits under the total it charges, and rides the sticky panel. -->
                        <button
                            @click="pay"
                            :disabled="submitting || loading || !chosen"
                            class="flex items-center justify-center gap-2 w-full bg-gold text-white py-4 mt-6 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-50"
                        >
                            {{ payLabel }}
                            <ArrowRight class="w-4 h-4" />
                        </button>
                        <p class="flex items-center justify-center gap-2 text-xs text-black/55 mt-3">
                            <Lock class="w-3 h-3" />
                            All transactions are encrypted end-to-end.
                        </p>
                    </div>
                </aside>
            </div>
        </div>
    </div>
</template>
