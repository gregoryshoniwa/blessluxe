<script>
import { api } from '../../lib/api.js';
import { checkoutStore } from '../checkout-store.js';
import { Lock, ArrowRight, Mail, MapPin, User, Phone, Truck } from 'lucide-vue-next';

export default {
    name: 'CheckoutInfo',
    components: { Lock, ArrowRight, Mail, MapPin, User, Phone, Truck },
    data() {
        const draft = checkoutStore.draft;
        return {
            email: draft.email,
            first_name: draft.first_name,
            last_name: draft.last_name,
            phone: draft.phone,
            address1: draft.shipping_address.address1,
            address2: draft.shipping_address.address2,
            city: draft.shipping_address.city,
            province: draft.shipping_address.province,
            postal_code: draft.shipping_address.postal_code,
            country: draft.shipping_address.country || 'Zimbabwe',
            shipping_method: draft.shipping_method || 'standard',
            cart: null,
            loading: true,
            saving: false,
            error: '',
        };
    },
    computed: {
        subtotal() {
            return ((this.cart?.subtotal || 0) / 100).toFixed(2);
        },
        itemCount() {
            return this.cart?.item_count || 0;
        },
    },
    async mounted() {
        const [meRes, cartRes] = await Promise.all([
            api.get('/api/account/me').catch(() => ({ customer: null })),
            api.get('/api/store/cart').catch(() => ({ cart: null })),
        ]);
        const c = meRes.customer;
        if (c) {
            this.email = this.email || c.email || '';
            this.first_name = this.first_name || c.first_name || '';
            this.last_name = this.last_name || c.last_name || '';
            this.phone = this.phone || c.phone || '';
        }
        this.cart = cartRes.cart;
        if (!this.cart?.items?.length) {
            this.$router.replace('/cart');
        }
        this.loading = false;
    },
    methods: {
        async next() {
            if (!this.email || !this.first_name || !this.last_name || !this.address1 || !this.city) {
                this.error = 'Please fill in your email, name, address and city.';
                return;
            }
            this.saving = true;
            this.error = '';
            checkoutStore.mutate({
                email: this.email.trim(),
                first_name: this.first_name.trim(),
                last_name: this.last_name.trim(),
                phone: this.phone.trim(),
                shipping_address: {
                    address1: this.address1.trim(),
                    address2: this.address2.trim(),
                    city: this.city.trim(),
                    province: this.province.trim(),
                    postal_code: this.postal_code.trim(),
                    country: this.country.trim(),
                },
                shipping_method: this.shipping_method,
            });
            // Skip the standalone /checkout/shipping step entirely — it's now
            // part of this page. Go straight to payment for a 2-step flow.
            this.$router.push('/checkout/payment');
        },
        money(cents) { return `$${(cents / 100).toFixed(2)}`; },
    },
};
</script>

<template>
    <div class="min-h-screen bg-white">
        <!-- Slim secure header -->
        <header class="border-b border-gold/15">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                <router-link to="/" class="font-display text-lg tracking-widest">BLESSLUXE</router-link>
                <div class="flex items-center gap-2 text-xs text-black/55">
                    <Lock class="w-4 h-4" /> Secure Checkout
                </div>
            </div>
        </header>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <!-- Progress -->
            <ol class="flex items-center justify-center gap-3 text-[10px] tracking-[0.3em] uppercase mb-10 text-black/40">
                <li class="text-gold flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-gold text-white flex items-center justify-center">1</span>
                    Information
                </li>
                <li class="w-12 h-px bg-gold/30"></li>
                <li class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center">2</span>
                    Payment
                </li>
                <li class="w-12 h-px bg-black/10"></li>
                <li class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center">3</span>
                    Confirm
                </li>
            </ol>

            <div class="lg:grid lg:grid-cols-12 lg:gap-12">
                <!-- Form column -->
                <form @submit.prevent="next" class="lg:col-span-7 space-y-8">
                    <section>
                        <h2 class="font-display text-xl tracking-widest uppercase mb-4 flex items-center gap-2">
                            <Mail class="w-4 h-4 text-gold" /> Contact
                        </h2>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input v-model="email" type="email" placeholder="Email address" required autocomplete="email"
                                class="sm:col-span-2 border border-black/15 px-4 py-3 focus:outline-none focus:border-gold" />
                            <input v-model="first_name" type="text" placeholder="First name" required autocomplete="given-name"
                                class="border border-black/15 px-4 py-3 focus:outline-none focus:border-gold" />
                            <input v-model="last_name" type="text" placeholder="Last name" required autocomplete="family-name"
                                class="border border-black/15 px-4 py-3 focus:outline-none focus:border-gold" />
                            <input v-model="phone" type="tel" placeholder="Phone (delivery updates)" autocomplete="tel"
                                class="sm:col-span-2 border border-black/15 px-4 py-3 focus:outline-none focus:border-gold" />
                        </div>
                    </section>

                    <section>
                        <h2 class="font-display text-xl tracking-widest uppercase mb-4 flex items-center gap-2">
                            <MapPin class="w-4 h-4 text-gold" /> Shipping address
                        </h2>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input v-model="address1" type="text" placeholder="Street address" required autocomplete="address-line1"
                                class="sm:col-span-2 border border-black/15 px-4 py-3 focus:outline-none focus:border-gold" />
                            <input v-model="address2" type="text" placeholder="Apartment, suite (optional)" autocomplete="address-line2"
                                class="sm:col-span-2 border border-black/15 px-4 py-3 focus:outline-none focus:border-gold" />
                            <input v-model="city" type="text" placeholder="City" required autocomplete="address-level2"
                                class="border border-black/15 px-4 py-3 focus:outline-none focus:border-gold" />
                            <input v-model="province" type="text" placeholder="Province" autocomplete="address-level1"
                                class="border border-black/15 px-4 py-3 focus:outline-none focus:border-gold" />
                            <input v-model="postal_code" type="text" placeholder="Postal code" autocomplete="postal-code"
                                class="border border-black/15 px-4 py-3 focus:outline-none focus:border-gold" />
                            <input v-model="country" type="text" placeholder="Country" required autocomplete="country-name"
                                class="border border-black/15 px-4 py-3 focus:outline-none focus:border-gold" />
                        </div>
                    </section>

                    <section>
                        <h2 class="font-display text-xl tracking-widest uppercase mb-4 flex items-center gap-2">
                            <Truck class="w-4 h-4 text-gold" /> Delivery method
                        </h2>
                        <label class="flex items-center gap-3 border border-gold/30 bg-cream-dark/40 px-4 py-3 cursor-pointer">
                            <input type="radio" v-model="shipping_method" value="standard" class="accent-gold" />
                            <div class="flex-1">
                                <p class="font-medium">Standard delivery</p>
                                <p class="text-xs text-black/60">3–5 business days</p>
                            </div>
                            <span class="text-gold font-semibold">Free</span>
                        </label>
                    </section>

                    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

                    <button
                        type="submit"
                        :disabled="saving"
                        class="flex items-center justify-center gap-2 w-full bg-gold text-white py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-50"
                    >
                        {{ saving ? 'One moment…' : 'Continue to Payment' }}
                        <ArrowRight class="w-4 h-4" />
                    </button>
                </form>

                <!-- Sticky summary -->
                <aside class="lg:col-span-5 mt-10 lg:mt-0">
                    <div class="bg-cream-dark/50 p-6 sticky top-24">
                        <h3 class="font-display text-lg tracking-widest uppercase mb-4">Order Summary</h3>
                        <div v-if="loading" class="text-xs text-black/55">Loading cart…</div>
                        <div v-else>
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
                                <div class="flex justify-between pt-2 border-t border-gold/20 text-base font-semibold">
                                    <span>Total</span>
                                    <span>${{ subtotal }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    </div>
</template>
