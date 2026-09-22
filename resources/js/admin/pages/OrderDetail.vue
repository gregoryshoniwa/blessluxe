<script>
import { api } from '../../lib/api.js';
import { ArrowLeft, RotateCcw, Truck, User, MapPin, Sparkles } from 'lucide-vue-next';

export default {
    name: 'AdminOrderDetail',
    components: { ArrowLeft, RotateCcw, Truck, User, MapPin, Sparkles },
    data() {
        return {
            data: null,
            loading: true,
            error: '',
            showRefund: false,
            refundReason: '',
            refunding: false,
            refundError: '',
            refundResult: null,
            creatingPackage: false,
        };
    },
    computed: {
        id() { return this.$route.params.id; },
        canRefund() {
            const o = this.data?.order;
            return o && o.payment_status === 'paid' && o.status !== 'refunded';
        },
        addr() { return this.data?.order?.shipping_address || {}; },
    },
    mounted() { this.fetch(); },
    methods: {
        async fetch() {
            this.loading = true;
            this.error = '';
            try {
                this.data = await api.get(`/api/admin/orders/${this.id}`);
            } catch (e) {
                this.error = e.payload?.error || 'Order not found.';
            } finally { this.loading = false; }
        },
        async submitRefund() {
            this.refunding = true;
            this.refundError = '';
            this.refundResult = null;
            try {
                const r = await api.post(`/api/admin/orders/${this.id}/refund`, { reason: this.refundReason || null });
                this.refundResult = r.refund;
                this.showRefund = false;
                await this.fetch();
            } catch (e) {
                this.refundError = e.payload?.error || 'Could not record refund.';
            } finally { this.refunding = false; }
        },
        async createPackage() {
            this.creatingPackage = true;
            try {
                await api.post(`/api/admin/orders/${this.id}/packages`, {});
                await this.fetch();
            } catch (e) {
                this.error = e.payload?.error || 'Could not create a package for this order.';
            } finally { this.creatingPackage = false; }
        },
        fmtDate(iso) { return iso ? new Date(iso).toLocaleString() : '—'; },
        addressLine(parts) { return parts.filter(Boolean).join(', '); },
    },
};
</script>

<template>
    <div>
        <router-link to="/admin/orders" class="text-xs tracking-widest uppercase text-zinc-500 hover:text-gold inline-flex items-center gap-1 mb-4">
            <ArrowLeft class="w-3 h-3" /> All orders
        </router-link>

        <div v-if="loading" class="text-zinc-400 text-sm">Loading…</div>

        <div v-else-if="error" class="text-center py-16">
            <h1 class="text-xl font-semibold mb-2">{{ error }}</h1>
            <router-link to="/admin/orders" class="text-gold underline">Back</router-link>
        </div>

        <div v-else-if="data">
            <header class="flex items-start justify-between mb-8 flex-wrap gap-3">
                <div>
                    <p class="text-xs tracking-widest uppercase text-zinc-500">Order</p>
                    <h1 class="text-2xl font-semibold font-mono">{{ data.order.order_number }}</h1>
                    <p class="text-sm text-zinc-500 mt-1">{{ data.order.email }} · placed {{ fmtDate(data.order.created_at) }}</p>
                </div>
                <div class="flex items-center gap-3">
                    <span :class="['text-xs px-2 py-1 rounded tracking-widest uppercase', {
                        'bg-emerald-100 text-emerald-700': data.order.status === 'completed',
                        'bg-amber-100 text-amber-700': data.order.status === 'pending',
                        'bg-red-100 text-red-700': data.order.status === 'refunded',
                    }]">{{ data.order.status }}</span>
                    <button
                        v-if="canRefund"
                        @click="showRefund = true"
                        class="border border-red-300 text-red-600 px-4 py-2 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-red-50 inline-flex items-center gap-2"
                    >
                        <RotateCcw class="w-4 h-4" /> Refund
                    </button>
                </div>
            </header>

            <!-- Refund modal -->
            <section v-if="showRefund" class="bg-white border border-red-200 p-5 mb-6">
                <h2 class="font-semibold mb-2 text-red-700">Refund this order?</h2>
                <p class="text-sm text-zinc-600 mb-4">
                    Restocks {{ data.order.lines.length }} line item{{ data.order.lines.length === 1 ? '' : 's' }},
                    refunds Bees if any were used, cancels any affiliate sale, and emails the customer.
                    <strong>The money refund still has to be processed in the payment gateway's own dashboard.</strong>
                </p>
                <textarea v-model="refundReason" placeholder="Reason (optional, shown to the customer)" rows="3" class="w-full border border-zinc-300 px-3 py-2 text-sm mb-3"></textarea>
                <p v-if="refundError" class="text-sm text-red-600 mb-3">{{ refundError }}</p>
                <div class="flex justify-end gap-2">
                    <button @click="showRefund = false" class="px-4 py-2 text-xs tracking-widest uppercase text-zinc-600">Cancel</button>
                    <button @click="submitRefund" :disabled="refunding" class="bg-red-600 text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-red-700 disabled:opacity-50">
                        {{ refunding ? 'Refunding…' : 'Refund order' }}
                    </button>
                </div>
            </section>

            <section v-if="refundResult" class="bg-emerald-50 border border-emerald-300 p-4 mb-6 text-sm text-emerald-800">
                Refunded ✓ — restocked {{ Object.keys(refundResult.restocked).length }} variant(s)<template v-if="refundResult.blits_refunded">, refunded {{ refundResult.blits_refunded }} Bees</template><template v-if="refundResult.affiliate_reversed">, reversed ${{ (refundResult.affiliate_reversed / 100).toFixed(2) }} in affiliate earnings</template>
            </section>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Items -->
                <section class="lg:col-span-2 bg-white border border-zinc-200">
                    <header class="px-5 py-3 border-b border-zinc-200">
                        <h2 class="font-semibold">Line items</h2>
                    </header>
                    <table class="w-full text-sm">
                        <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                            <tr>
                                <th class="px-5 py-2 text-left">Item</th>
                                <th class="px-5 py-2 text-left">SKU</th>
                                <th class="px-5 py-2 text-right">Qty</th>
                                <th class="px-5 py-2 text-right">Unit</th>
                                <th class="px-5 py-2 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="l in data.order.lines" :key="l.id" class="border-t border-zinc-100">
                                <td class="px-5 py-3">
                                    <p>{{ l.title }}</p>
                                    <p v-if="l.variant_title" class="text-xs text-zinc-500">{{ l.variant_title }}</p>
                                </td>
                                <td class="px-5 py-3 font-mono text-xs">{{ l.sku || '—' }}</td>
                                <td class="px-5 py-3 text-right">×{{ l.quantity }}</td>
                                <td class="px-5 py-3 text-right">{{ l.unit_price }}</td>
                                <td class="px-5 py-3 text-right font-medium">{{ l.line_total }}</td>
                            </tr>
                        </tbody>
                        <tfoot class="bg-zinc-50">
                            <tr><td colspan="4" class="px-5 py-2 text-right text-zinc-500">Subtotal</td><td class="px-5 py-2 text-right">{{ data.order.subtotal }}</td></tr>
                            <tr><td colspan="4" class="px-5 py-2 text-right text-zinc-500">Discount</td><td class="px-5 py-2 text-right text-emerald-600">{{ data.order.discount_total === '$0.00' ? '—' : '-' + data.order.discount_total }}</td></tr>
                            <tr><td colspan="4" class="px-5 py-2 text-right text-zinc-500">Shipping</td><td class="px-5 py-2 text-right">{{ data.order.shipping_total }}</td></tr>
                            <tr><td colspan="4" class="px-5 py-3 text-right font-semibold border-t border-zinc-200">Total</td><td class="px-5 py-3 text-right font-semibold border-t border-zinc-200">{{ data.order.total }}</td></tr>
                        </tfoot>
                    </table>
                </section>

                <!-- Side panels -->
                <aside class="space-y-4">
                    <section class="bg-white border border-zinc-200 p-4">
                        <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2 inline-flex items-center gap-1"><User class="w-3 h-3" /> Customer</p>
                        <p class="font-medium">{{ data.order.customer?.name || '—' }}</p>
                        <p class="text-sm text-zinc-600">{{ data.order.email }}</p>
                        <p v-if="data.order.customer" class="text-xs text-zinc-500 mt-2">
                            <Sparkles class="w-3 h-3 inline -mt-0.5" /> {{ data.order.customer.loyalty_points }} Bees
                        </p>
                    </section>

                    <section v-if="data.order.shipping_address" class="bg-white border border-zinc-200 p-4">
                        <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2 inline-flex items-center gap-1"><MapPin class="w-3 h-3" /> Shipping</p>
                        <p class="text-sm">{{ addressLine([addr.address1, addr.address2]) }}</p>
                        <p class="text-sm">{{ addressLine([addr.city, addr.province, addr.postal_code]) }}</p>
                        <p class="text-sm">{{ addr.country }}</p>
                    </section>

                    <section class="bg-white border border-zinc-200 p-4">
                        <p class="text-xs tracking-widest uppercase text-zinc-500 mb-3 inline-flex items-center gap-1">
                            <Truck class="w-3 h-3" /> Fulfilment
                            <span v-if="data.fulfillment?.label" class="ml-1 text-[10px] px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 normal-case tracking-normal">
                                {{ data.fulfillment.label }}
                            </span>
                        </p>

                        <div v-if="!data.packages?.length" class="text-sm text-zinc-500">
                            <p class="mb-3">No package yet.</p>
                            <!-- Package creation runs once at payment. If it failed,
                                 there was previously no way back. -->
                            <button
                                v-if="data.fulfillment?.can_create_package"
                                @click="createPackage"
                                :disabled="creatingPackage"
                                class="border border-zinc-300 px-3 py-1.5 text-xs tracking-widest uppercase hover:bg-zinc-100 disabled:opacity-40"
                            >
                                {{ creatingPackage ? 'Creating…' : 'Create package' }}
                            </button>
                        </div>

                        <div v-for="p in data.packages" :key="p.id" class="border-t border-zinc-100 first:border-t-0 py-3 first:pt-0">
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0">
                                    <router-link :to="`/admin/packages/${p.id}`" class="font-mono text-xs text-gold-dark hover:underline">
                                        {{ p.package_code }}
                                    </router-link>
                                    <p class="text-sm">{{ p.status_label || p.status }}</p>
                                </div>
                                <span v-if="p.is_pack" class="text-[10px] tracking-widest uppercase px-2 py-0.5 bg-gold/15 text-gold-dark shrink-0">Pack</span>
                            </div>

                            <p v-if="p.is_pack && p.pack_public_code" class="text-xs text-zinc-500 mt-1">
                                Consignment · <span class="font-mono">{{ p.pack_public_code }}</span>
                            </p>
                            <!-- Which piece inside the shared box is THIS order's. -->
                            <p v-for="piece in p.our_pieces" :key="piece.sub_code" class="text-xs text-zinc-600 mt-1">
                                This order's piece: <span class="font-mono text-gold-dark">{{ piece.sub_code }}</span>
                                <span v-if="piece.size_label"> · {{ piece.size_label }}</span>
                            </p>

                            <p v-if="p.carrier_label" class="text-xs text-zinc-500 mt-1">
                                {{ p.carrier_label }}
                                <a v-if="p.carrier_tracking_url" :href="p.carrier_tracking_url" target="_blank" rel="noopener noreferrer" class="font-mono text-gold-dark underline ml-1">
                                    {{ p.carrier_tracking_number }}
                                </a>
                                <span v-else-if="p.carrier_tracking_number" class="font-mono ml-1">{{ p.carrier_tracking_number }}</span>
                            </p>

                            <router-link :to="`/admin/packages/${p.id}`" class="text-xs tracking-widest uppercase text-zinc-500 hover:text-gold mt-2 inline-block">
                                Open package →
                            </router-link>
                        </div>
                    </section>

                    <section v-if="data.payment_session" class="bg-white border border-zinc-200 p-4">
                        <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2">Payment</p>
                        <p class="text-sm capitalize">{{ data.payment_session.provider }}</p>
                        <p class="font-mono text-xs">{{ data.payment_session.reference }}</p>
                        <p class="text-xs text-zinc-500 mt-1">{{ data.payment_session.provider_status }}</p>
                    </section>

                    <section v-if="data.affiliate_sales.length" class="bg-white border border-zinc-200 p-4">
                        <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2">Affiliate</p>
                        <div v-for="s in data.affiliate_sales" :key="s.id" class="text-sm">
                            <p class="font-mono text-gold-dark">{{ s.affiliate?.code }}</p>
                            <p class="text-xs text-zinc-500">
                                {{ s.commission_amount }} commission ·
                                <span :class="[{ 'text-emerald-600': s.status === 'paid', 'text-zinc-500': s.status === 'pending', 'text-red-600': s.status === 'cancelled' }]">{{ s.status }}</span>
                            </p>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    </div>
</template>
