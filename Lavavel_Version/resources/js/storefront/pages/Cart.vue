<script>
import { api } from '../../lib/api.js';
import { Minus, Plus, Trash2, ArrowRight, Tag, Lock, Truck, RotateCw, Heart } from 'lucide-vue-next';

export default {
    name: 'CartPage',
    components: { Minus, Plus, Trash2, ArrowRight, Tag, Lock, Truck, RotateCw, Heart },
    data() {
        return {
            cart: null,
            loading: true,
            hasCustomer: null,           // null = checking, true/false = result
            updating: {},
            promoCode: '',
            promoApplied: false,
            promoError: '',
        };
    },
    computed: {
        items()    { return this.cart?.items || []; },
        isEmpty()  { return this.items.length === 0; },
        itemCount(){ return this.cart?.item_count || 0; },
        subtotal() { return (this.cart?.subtotal || 0) / 100; },
        discount() { return this.promoApplied ? this.subtotal * 0.1 : 0; },
        total()    { return Math.max(0, this.subtotal - this.discount); },
        money()    { return (n) => `$${Number(n).toFixed(2)}`; },
    },
    mounted() {
        this.fetchCart();
        // Auth state drives the CTA — "Sign in to checkout" vs "Proceed".
        api.get('/api/account/me').then((d) => { this.hasCustomer = !!d.customer; }).catch(() => { this.hasCustomer = false; });
    },
    methods: {
        async fetchCart() {
            this.loading = true;
            try {
                const data = await api.get('/api/store/cart');
                this.cart = data.cart;
            } finally {
                this.loading = false;
            }
        },
        async setQuantity(line, qty) {
            if (qty < 1) return;
            this.updating[line.id] = true;
            try {
                const data = await api.put(`/api/store/cart/line-items/${line.id}`, { quantity: qty });
                this.cart = data.cart;
                window.dispatchEvent(new CustomEvent('blessluxe:cart-updated'));
            } catch (e) {
                alert(e.payload?.error || 'Could not update quantity.');
            } finally {
                this.updating[line.id] = false;
            }
        },
        async remove(line) {
            this.updating[line.id] = true;
            try {
                const data = await api.del(`/api/store/cart/line-items/${line.id}`);
                this.cart = data.cart;
                window.dispatchEvent(new CustomEvent('blessluxe:cart-updated'));
            } finally {
                this.updating[line.id] = false;
            }
        },
        applyPromo() {
            this.promoError = '';
            if (this.promoCode.trim().toUpperCase() === 'WELCOME10') {
                this.promoApplied = true;
            } else {
                this.promoError = 'That code isn’t valid.';
            }
        },
    },
};
</script>

<template>
    <div class="min-h-screen bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <!-- Branded header -->
            <div class="text-center mb-12">
                <p class="font-script text-2xl text-gold mb-3">Your Cart</p>
                <h1 class="font-display text-2xl md:text-3xl tracking-widest uppercase">
                    Shopping Cart
                </h1>
            </div>

            <!-- Loading -->
            <div v-if="loading" class="flex justify-center py-16">
                <p class="text-[10px] tracking-widest uppercase text-black/55 animate-pulse">Preparing your bag</p>
            </div>

            <!-- Empty -->
            <div v-else-if="isEmpty" class="text-center py-20 max-w-md mx-auto">
                <p class="font-script text-3xl text-gold mb-4">Your Cart</p>
                <h2 class="font-display text-2xl tracking-widest uppercase mb-4">No Items Yet</h2>
                <p class="text-black/60 mb-8">Your shopping cart is empty. Start adding pieces you love.</p>
                <router-link
                    to="/shop"
                    class="inline-flex items-center gap-2 bg-gold text-white px-8 py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors"
                >
                    Continue Shopping
                    <ArrowRight class="w-4 h-4" />
                </router-link>
            </div>

            <!-- Cart + summary -->
            <div v-else class="lg:grid lg:grid-cols-12 lg:gap-12">
                <!-- Items -->
                <div class="lg:col-span-7">
                    <div class="border-b border-gold/20 pb-4 mb-4">
                        <span class="text-sm text-black/60">
                            {{ itemCount }} item{{ itemCount === 1 ? '' : 's' }} in your cart
                        </span>
                    </div>

                    <ul class="space-y-6">
                        <li
                            v-for="line in items"
                            :key="line.id"
                            class="flex gap-4 pb-6 border-b border-gold/10 animate-row-in"
                        >
                            <router-link :to="`/shop/${line.product_handle}`" class="flex-shrink-0">
                                <div class="relative w-24 h-32 bg-cream-dark rounded overflow-hidden">
                                    <img
                                        v-if="line.thumbnail"
                                        :src="line.thumbnail"
                                        :alt="line.title"
                                        class="absolute inset-0 w-full h-full object-cover"
                                    />
                                </div>
                            </router-link>

                            <div class="flex-1 flex flex-col">
                                <router-link
                                    :to="`/shop/${line.product_handle}`"
                                    class="font-display text-base hover:text-gold transition-colors"
                                >
                                    {{ line.title }}
                                </router-link>
                                <p v-if="line.variant_title" class="text-sm text-black/60 mt-1">
                                    {{ line.variant_title }}
                                </p>

                                <div class="flex-1" />

                                <div class="flex items-center justify-between mt-4">
                                    <!-- Qty stepper -->
                                    <div class="flex items-center border border-black/20 rounded">
                                        <button
                                            @click="setQuantity(line, line.quantity - 1)"
                                            :disabled="updating[line.id] || line.quantity <= 1"
                                            class="p-2 hover:bg-cream-dark transition-colors disabled:opacity-50"
                                            aria-label="Decrease quantity"
                                            :title="line.quantity <= 1 ? 'Use the trash icon to remove' : 'Decrease'"
                                        >
                                            <Minus class="w-4 h-4" />
                                        </button>
                                        <span class="w-10 text-center font-medium">{{ line.quantity }}</span>
                                        <button
                                            @click="setQuantity(line, line.quantity + 1)"
                                            :disabled="updating[line.id]"
                                            class="p-2 hover:bg-cream-dark transition-colors disabled:opacity-50"
                                            aria-label="Increase quantity"
                                            title="Increase"
                                        >
                                            <Plus class="w-4 h-4" />
                                        </button>
                                    </div>

                                    <!-- Price + remove -->
                                    <div class="flex items-center gap-4">
                                        <span class="font-semibold">{{ money(line.line_total / 100) }}</span>
                                        <button
                                            @click="remove(line)"
                                            :disabled="updating[line.id]"
                                            class="p-2 text-black/40 hover:text-red-500 transition-colors disabled:opacity-50"
                                            aria-label="Remove item"
                                            title="Remove from cart"
                                        >
                                            <Trash2 class="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </li>
                    </ul>

                    <!-- Continue shopping -->
                    <div class="mt-8">
                        <router-link
                            to="/shop"
                            class="inline-flex items-center gap-2 text-sm font-medium text-gold hover:text-gold-dark transition-colors"
                        >
                            <ArrowRight class="w-4 h-4 rotate-180" />
                            Continue Shopping
                        </router-link>
                    </div>
                </div>

                <!-- Summary rail -->
                <aside class="lg:col-span-5 mt-12 lg:mt-0">
                    <div class="bg-cream-dark/50 p-6 sticky top-24">
                        <h2 class="font-display text-lg tracking-widest uppercase mb-6">Order Summary</h2>

                        <!-- Promo -->
                        <div class="mb-6">
                            <label class="text-sm font-medium mb-2 block">Promo Code</label>
                            <div class="flex gap-2">
                                <div class="relative flex-1">
                                    <Tag class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                                    <input
                                        v-model="promoCode"
                                        type="text"
                                        placeholder="Enter code"
                                        :disabled="promoApplied"
                                        :class="[
                                            'w-full pl-10 pr-4 py-2.5 border border-black/20 bg-white text-sm focus:outline-none focus:border-gold',
                                            promoApplied && 'bg-emerald-50 border-emerald-500',
                                        ]"
                                    />
                                </div>
                                <button
                                    @click="applyPromo"
                                    :disabled="promoApplied || !promoCode"
                                    :class="[
                                        'px-4 py-2 text-sm font-semibold transition-colors',
                                        promoApplied
                                            ? 'bg-emerald-500 text-white'
                                            : 'bg-black text-white hover:bg-black/80 disabled:opacity-50',
                                    ]"
                                >
                                    {{ promoApplied ? '✓ Applied' : 'Apply' }}
                                </button>
                            </div>
                            <p v-if="promoApplied" class="text-xs text-emerald-600 mt-1">10% discount applied!</p>
                            <p v-else-if="promoError" class="text-xs text-red-600 mt-1">{{ promoError }}</p>
                            <p v-else class="text-[10px] tracking-widest uppercase text-black/40 mt-1">
                                Try <span class="font-mono">WELCOME10</span>
                            </p>
                        </div>

                        <!-- Totals -->
                        <div class="space-y-3 text-sm border-t border-gold/20 pt-4">
                            <div class="flex justify-between">
                                <span class="text-black/60">Subtotal</span>
                                <span>{{ money(subtotal) }}</span>
                            </div>
                            <div v-if="promoApplied" class="flex justify-between text-emerald-600">
                                <span>Discount (10%)</span>
                                <span>-{{ money(discount) }}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-black/60">Shipping</span>
                                <span class="text-emerald-600">Free</span>
                            </div>
                            <div class="flex justify-between pt-3 border-t border-gold/20 text-base font-semibold">
                                <span>Total</span>
                                <span>{{ money(total) }}</span>
                            </div>
                        </div>

                        <!-- Checkout CTA — gated on auth -->
                        <template v-if="hasCustomer === false">
                            <router-link
                                to="/account/login?next=/checkout"
                                class="flex items-center justify-center gap-2 w-full mt-6 bg-gold text-white py-4 text-sm font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
                            >
                                Sign in to Checkout
                                <ArrowRight class="w-4 h-4" />
                            </router-link>
                            <p class="mt-3 text-center text-xs text-black/55">
                                New here?
                                <router-link to="/account/signup?next=/checkout" class="underline text-gold-dark hover:text-gold">
                                    Create an account
                                </router-link>
                                — you'll be back at checkout in seconds.
                            </p>
                        </template>
                        <router-link
                            v-else
                            to="/checkout"
                            :class="[
                                'flex items-center justify-center gap-2 w-full mt-6 bg-gold text-white py-4 text-sm font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors',
                                hasCustomer === null && 'opacity-60 pointer-events-none',
                            ]"
                        >
                            Proceed to Checkout
                            <ArrowRight class="w-4 h-4" />
                        </router-link>

                        <!-- Trust line -->
                        <div class="mt-6 pt-6 border-t border-gold/20">
                            <div class="flex flex-wrap items-center justify-center gap-4 text-[10px] tracking-widest uppercase text-black/55">
                                <span class="inline-flex items-center gap-1"><Lock class="w-3 h-3" /> Secure</span>
                                <span class="inline-flex items-center gap-1"><Truck class="w-3 h-3" /> Free Shipping</span>
                                <span class="inline-flex items-center gap-1"><RotateCw class="w-3 h-3" /> Easy Returns</span>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    </div>
</template>

<style scoped>
.animate-row-in {
    animation: row-in 0.35s ease both;
}
@keyframes row-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
}
</style>
