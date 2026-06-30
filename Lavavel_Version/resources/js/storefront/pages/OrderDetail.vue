<script>
import { api } from '../../lib/api.js';

export default {
    name: 'OrderDetailPage',
    data() { return { order: null, loading: true, error: '' }; },
    async mounted() { await this.load(); },
    watch: {
        '$route.params.number'() { this.load(); },
    },
    methods: {
        async load() {
            this.loading = true;
            this.error = '';
            try {
                const data = await api.get(`/api/account/orders/${encodeURIComponent(this.$route.params.number)}`);
                this.order = data.order;
            } catch (e) {
                if (e.status === 401) {
                    this.$router.replace(`/account/login?next=${encodeURIComponent(this.$route.fullPath)}`);
                    return;
                }
                this.error = e.payload?.error || 'Could not load this order.';
            } finally {
                this.loading = false;
            }
        },
        fmtDate(iso) { return iso ? new Date(iso).toLocaleString() : '—'; },
        addressLines(a) {
            if (!a) return [];
            return [
                [a.first_name, a.last_name].filter(Boolean).join(' '),
                a.line1,
                a.line2,
                [a.city, a.region, a.postal_code].filter(Boolean).join(', '),
                a.country,
            ].filter(Boolean);
        },
    },
};
</script>

<template>
    <div class="max-w-[1100px] mx-auto px-[5%] py-12 min-h-[60vh]">
        <p class="text-[10px] tracking-widest uppercase text-black/55 mb-4">
            <router-link to="/account" class="hover:text-gold transition-colors">← Account</router-link>
        </p>

        <div v-if="loading" class="animate-pulse space-y-3">
            <div class="h-8 w-1/3 bg-cream-dark" />
            <div class="h-4 w-1/2 bg-cream-dark" />
            <div class="h-32 bg-cream-dark/40 mt-6" />
        </div>

        <p v-else-if="error" class="bg-red-50 border border-red-200 text-sm text-red-700 p-4">{{ error }}</p>

        <div v-else-if="order">
            <header class="flex items-end justify-between mb-8 gap-6 flex-wrap">
                <div>
                    <p class="font-script text-3xl text-gold mb-1">Order</p>
                    <h1 class="font-display text-3xl tracking-widest uppercase font-mono">{{ order.order_number }}</h1>
                    <p class="text-sm text-black/55 mt-1">Placed {{ fmtDate(order.created_at) }}</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] tracking-widest uppercase px-3 py-1 bg-cream-dark/60">{{ order.status }}</span>
                    <span v-if="order.payment_status === 'paid'" class="text-[10px] tracking-widest uppercase px-3 py-1 bg-emerald-100 text-emerald-700">Paid</span>
                    <router-link v-if="order.tracking_code" :to="`/track/${order.tracking_code}`" class="text-[10px] tracking-widest uppercase px-3 py-1 bg-gold text-white hover:bg-gold-dark transition-colors">
                        Track →
                    </router-link>
                </div>
            </header>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <section class="lg:col-span-2 bg-white border border-gold/10 p-6">
                    <h2 class="font-display text-sm tracking-widest uppercase mb-4">Items</h2>
                    <ul class="divide-y divide-gold/5">
                        <li v-for="(it, idx) in order.items" :key="idx" class="py-3 flex gap-3 items-start">
                            <div class="w-16 h-20 bg-cream-dark flex-shrink-0 overflow-hidden">
                                <img v-if="it.thumbnail" :src="it.thumbnail" :alt="it.title" class="w-full h-full object-cover object-top" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="font-display text-sm leading-tight line-clamp-1">{{ it.title }}</p>
                                <p v-if="it.variant_title" class="text-xs text-black/55">{{ it.variant_title }}</p>
                                <p class="text-xs text-black/55 mt-1">Qty {{ it.quantity }} · {{ it.unit_label }} each</p>
                            </div>
                            <p class="text-sm font-medium whitespace-nowrap">{{ it.total_label }}</p>
                        </li>
                    </ul>
                </section>

                <aside class="bg-white border border-gold/10 p-6 space-y-5">
                    <div>
                        <h2 class="font-display text-sm tracking-widest uppercase mb-3">Summary</h2>
                        <dl class="text-sm space-y-1">
                            <div class="flex justify-between"><dt class="text-black/55">Subtotal</dt><dd>{{ order.subtotal_label }}</dd></div>
                            <div class="flex justify-between"><dt class="text-black/55">Shipping</dt><dd>{{ order.shipping_label }}</dd></div>
                            <div v-if="order.discount_label !== '$0.00'" class="flex justify-between"><dt class="text-black/55">Discount</dt><dd class="text-emerald-700">-{{ order.discount_label }}</dd></div>
                            <div class="flex justify-between"><dt class="text-black/55">Tax</dt><dd>{{ order.tax_label }}</dd></div>
                            <div class="flex justify-between font-display text-base pt-2 border-t border-gold/10 mt-2"><dt>Total</dt><dd>{{ order.total_label }}</dd></div>
                        </dl>
                    </div>

                    <div v-if="order.shipping_address">
                        <h2 class="font-display text-sm tracking-widest uppercase mb-2">Shipping to</h2>
                        <p v-for="(line, i) in addressLines(order.shipping_address)" :key="i" class="text-sm text-black/75">{{ line }}</p>
                    </div>

                    <div v-if="order.tracking_code">
                        <h2 class="font-display text-sm tracking-widest uppercase mb-2">Tracking</h2>
                        <p class="text-xs text-black/55">Code <span class="font-mono">{{ order.tracking_code }}</span></p>
                        <p v-if="order.carrier" class="text-xs text-black/55">Carrier {{ order.carrier }}</p>
                        <p v-if="order.tracking_number" class="text-xs text-black/55">Ref <span class="font-mono">{{ order.tracking_number }}</span></p>
                    </div>
                </aside>
            </div>
        </div>
    </div>
</template>
