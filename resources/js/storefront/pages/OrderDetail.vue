<script>
import { api } from '../../lib/api.js';
import { addressLines } from '../../lib/address.js';
import ShipmentProgress from '../components/tracking/ShipmentProgress.vue';
import ShipmentTimeline from '../components/tracking/ShipmentTimeline.vue';
import TrackingSummary from '../components/tracking/TrackingSummary.vue';
import PackageContents from '../components/tracking/PackageContents.vue';
import PackFillMeter from '../components/tracking/PackFillMeter.vue';
import DeliveryChoice from '../components/tracking/DeliveryChoice.vue';

export default {
    name: 'OrderDetailPage',
    components: { ShipmentProgress, ShipmentTimeline, TrackingSummary, PackageContents, PackFillMeter, DeliveryChoice },
    data() { return { order: null, loading: true, error: '', addresses: [] }; },
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
                // Only needed when the buyer might choose delivery over collection.
                if (this.order.pack?.delivery?.length && !this.addresses.length) {
                    try {
                        const a = await api.get('/api/account/addresses');
                        this.addresses = a.addresses || [];
                    } catch { this.addresses = []; }
                }
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
        // Orders store {address1, province}; this used to read only {line1, region},
        // so the panel rendered blank. The shared helper accepts both shapes.
        addressLines,
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
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-[10px] tracking-widest uppercase px-3 py-1 bg-cream-dark/60">{{ order.status }}</span>
                    <span v-if="order.payment_status === 'paid'" class="text-[10px] tracking-widest uppercase px-3 py-1 bg-emerald-100 text-emerald-700" :title="order.payment?.reference ? `Ref ${order.payment.reference}` : ''">Paid<template v-if="order.payment?.method"> · {{ order.payment.method }}</template></span>
                    <!-- Payment and fulfilment answer different questions — show both. -->
                    <span v-if="order.payment?.reference" class="text-[10px] text-black/45 font-mono">{{ order.payment.gateway }} ref {{ order.payment.reference }}</span>
                    <span v-if="order.fulfillment_label" class="text-[10px] tracking-widest uppercase px-3 py-1 bg-gold/15 text-gold-dark">{{ order.fulfillment_label }}</span>
                    <router-link v-if="order.tracking_code" :to="`/track/${order.tracking_code}`" class="text-[10px] tracking-widest uppercase px-3 py-1 bg-gold text-white hover:bg-gold-dark transition-colors">
                        Track →
                    </router-link>
                    <router-link
                        v-if="order.payment_status === 'paid' && order.status !== 'refunded' && order.status !== 'cancelled'"
                        :to="`/account?tab=returns&start=${order.order_number}`"
                        class="text-[10px] tracking-widest uppercase px-3 py-1 border border-black/20 hover:border-gold hover:text-gold transition-colors"
                    >
                        Request return
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

                    <PackFillMeter v-if="order.pack" :pack="order.pack" class="-mx-6 px-6 md:mx-0 md:px-5" />
                </aside>
            </div>

            <!-- One card per piece this buyer owns in the pack. -->
            <section v-if="order.pack?.delivery?.length" class="mt-6 space-y-6">
                <DeliveryChoice
                    v-for="d in order.pack.delivery"
                    :key="d.slot_id"
                    :delivery="d"
                    :addresses="addresses"
                    @updated="load"
                />
            </section>

            <!-- Shipments. Previously this whole area was three lines of text; the
                 anonymous /track page showed the customer more than their own
                 account did. One block per package, so a split shipment or a pack
                 consignment reads as its own journey. -->
            <section v-if="order.shipments?.length" class="mt-6 space-y-6">
                <article
                    v-for="s in order.shipments"
                    :key="s.code"
                    class="bg-white border border-gold/10 p-6"
                >
                    <header class="flex items-end justify-between gap-4 flex-wrap mb-5">
                        <div>
                            <h2 class="font-display text-sm tracking-widest uppercase">
                                {{ s.is_pack ? 'Series consignment' : 'Shipment' }}
                            </h2>
                            <p class="font-mono text-xs text-gold-dark mt-1">{{ s.code }}</p>
                        </div>
                        <router-link
                            :to="`/track/${s.code}`"
                            class="text-[10px] tracking-widest uppercase px-3 py-1 border border-black/15 hover:border-gold hover:text-gold transition-colors"
                        >
                            Full tracking →
                        </router-link>
                    </header>

                    <ShipmentProgress
                        :progress-index="s.progress_index"
                        :is-failure="s.is_failure"
                        :status-label="s.status_label"
                        :awaiting-pack="order.fulfillment_status === 'awaiting_pack'"
                    />

                    <div class="mt-6">
                        <TrackingSummary :shipment="s" />
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-gold/10">
                        <div>
                            <h3 class="font-display text-sm tracking-widest uppercase text-gold mb-3">In this shipment</h3>
                            <PackageContents :items="s.items" />
                        </div>
                        <div>
                            <h3 class="font-display text-sm tracking-widest uppercase text-gold mb-3">Activity</h3>
                            <ShipmentTimeline :events="s.events" />
                        </div>
                    </div>
                </article>
            </section>
        </div>
    </div>
</template>
