<script>
import { api } from '../../lib/api.js';
import { Package, Truck, CheckCircle2, Search, MapPin, Clock, XCircle } from 'lucide-vue-next';

export default {
    name: 'TrackPage',
    components: { Package, Truck, CheckCircle2, Search, MapPin, Clock, XCircle },
    data() {
        return {
            query: '',
            loading: false,
            data: null,
            error: '',
        };
    },
    computed: {
        // The code can come from /track/CODE or be typed into the input.
        urlCode() { return this.$route.params.code; },
        statusLabel() {
            const s = this.data?.package?.status;
            return ({
                created:         'Order received',
                picked:          'Picked',
                packed:          'Packed',
                shipped:         'Shipped',
                in_transit:      'In transit',
                out_for_delivery:'Out for delivery',
                delivered:       'Delivered',
                returned:        'Returned',
                cancelled:       'Cancelled',
            })[s] || s || '—';
        },
        progressIndex() {
            // Maps status onto a 0–4 progress bar.
            return ({
                created: 0, picked: 1, packed: 1, shipped: 2,
                in_transit: 2, out_for_delivery: 3, delivered: 4,
                returned: 4, cancelled: 4,
            })[this.data?.package?.status] ?? 0;
        },
    },
    mounted() {
        if (this.urlCode) {
            this.query = this.urlCode;
            this.lookup();
        }
    },
    watch: {
        urlCode(v) { if (v) { this.query = v; this.lookup(); } },
    },
    methods: {
        async lookup() {
            const code = this.query.trim().toUpperCase();
            if (!code) return;
            this.loading = true;
            this.error = '';
            this.data = null;
            try {
                this.data = await api.get(`/api/store/track/${encodeURIComponent(code)}`);
            } catch (e) {
                this.error = e.payload?.error || 'Could not find that tracking code.';
            } finally { this.loading = false; }
        },
        submit() {
            const code = this.query.trim().toUpperCase();
            if (code !== this.urlCode) this.$router.push(`/track/${code}`);
            else this.lookup();
        },
        fmtDateTime(iso) {
            if (!iso) return '—';
            return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        },
        eventIcon(s) {
            return ({
                created: Package, picked: Package, packed: Package,
                shipped: Truck, in_transit: Truck, out_for_delivery: Truck,
                delivered: CheckCircle2, returned: XCircle, cancelled: XCircle,
            })[s] || Package;
        },
    },
};
</script>

<template>
    <div class="max-w-[900px] mx-auto px-[5%] py-12 min-h-[60vh]">
        <header class="text-center mb-10">
            <p class="font-script text-3xl text-gold">Track</p>
            <h1 class="font-display text-3xl md:text-4xl tracking-widest uppercase">Your Package</h1>
        </header>

        <form @submit.prevent="submit" class="flex gap-2 mb-10">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                <input
                    v-model="query"
                    type="text"
                    placeholder="Enter your BL-XXXX-XXXX-X code"
                    class="w-full border border-black/15 pl-10 pr-4 py-3 font-mono text-sm uppercase tracking-wider focus:outline-none focus:border-gold"
                />
            </div>
            <button type="submit" class="bg-gold text-white px-6 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Track
            </button>
        </form>

        <div v-if="loading" class="text-center py-12 text-[10px] tracking-widest uppercase text-black/55 animate-pulse">Looking up…</div>

        <div v-else-if="error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm text-center">
            {{ error }}
        </div>

        <div v-else-if="data?.package" class="space-y-8">
            <!-- Summary -->
            <section class="bg-cream-dark/40 border border-gold/15 p-6">
                <div class="flex items-start justify-between flex-wrap gap-3">
                    <div>
                        <p class="text-[10px] tracking-widest uppercase text-black/55">Order</p>
                        <p class="font-mono text-lg">{{ data.package.order_number || '—' }}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] tracking-widest uppercase text-black/55">Status</p>
                        <p class="font-display text-xl text-gold-dark">{{ statusLabel }}</p>
                    </div>
                </div>

                <!-- Progress bar -->
                <div class="mt-6">
                    <div class="flex justify-between text-[10px] tracking-widest uppercase text-black/55 mb-2">
                        <span :class="progressIndex >= 0 ? 'text-gold-dark' : ''">Received</span>
                        <span :class="progressIndex >= 1 ? 'text-gold-dark' : ''">Packed</span>
                        <span :class="progressIndex >= 2 ? 'text-gold-dark' : ''">Shipped</span>
                        <span :class="progressIndex >= 3 ? 'text-gold-dark' : ''">Out for delivery</span>
                        <span :class="progressIndex >= 4 ? 'text-gold-dark' : ''">Delivered</span>
                    </div>
                    <div class="h-1 bg-cream-dark relative overflow-hidden">
                        <div class="absolute inset-y-0 left-0 bg-gold transition-all duration-500"
                             :style="{ width: ((progressIndex / 4) * 100) + '%' }"></div>
                    </div>
                </div>

                <dl class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
                    <div>
                        <dt class="text-[10px] tracking-widest uppercase text-black/55">Tracking code</dt>
                        <dd class="font-mono">{{ data.package.code }}</dd>
                    </div>
                    <div v-if="data.package.carrier">
                        <dt class="text-[10px] tracking-widest uppercase text-black/55">Carrier</dt>
                        <dd class="capitalize">{{ data.package.carrier }}</dd>
                    </div>
                    <div v-if="data.package.carrier_tracking_number">
                        <dt class="text-[10px] tracking-widest uppercase text-black/55">Carrier reference</dt>
                        <dd class="font-mono text-xs">{{ data.package.carrier_tracking_number }}</dd>
                    </div>
                    <div v-if="data.package.estimated_delivery_at">
                        <dt class="text-[10px] tracking-widest uppercase text-black/55">ETA</dt>
                        <dd>{{ fmtDateTime(data.package.estimated_delivery_at) }}</dd>
                    </div>
                </dl>
            </section>

            <!-- Items -->
            <section v-if="data.package.items?.length">
                <h2 class="font-display text-sm tracking-widest uppercase text-gold mb-3">In this package</h2>
                <ul class="border border-gold/10 bg-white divide-y divide-gold/10">
                    <li v-for="(i, idx) in data.package.items" :key="idx" class="px-4 py-3 flex items-center justify-between text-sm">
                        <div>
                            <p class="font-display text-base">{{ i.product_title }}</p>
                            <p v-if="i.variant_title" class="text-xs text-black/55">{{ i.variant_title }}</p>
                        </div>
                        <p class="text-xs tracking-widest uppercase text-black/55">×{{ i.quantity }}</p>
                    </li>
                </ul>
            </section>

            <!-- Timeline -->
            <section v-if="data.package.events?.length">
                <h2 class="font-display text-sm tracking-widest uppercase text-gold mb-4">Activity</h2>
                <ol class="relative border-l-2 border-gold/20 pl-6 space-y-6">
                    <li v-for="(e, idx) in data.package.events" :key="idx" class="relative">
                        <span class="absolute -left-[31px] top-0 w-6 h-6 rounded-full bg-cream border-2 border-gold flex items-center justify-center">
                            <component :is="eventIcon(e.status)" class="w-3 h-3 text-gold-dark" />
                        </span>
                        <p class="font-display text-base capitalize">{{ e.status.replace(/_/g, ' ') }}</p>
                        <p v-if="e.location" class="text-xs text-black/55 inline-flex items-center gap-1 mt-1">
                            <MapPin class="w-3 h-3" /> {{ e.location }}
                        </p>
                        <p v-if="e.notes" class="text-sm text-black/70 mt-1">{{ e.notes }}</p>
                        <p class="text-[10px] tracking-widest uppercase text-black/40 mt-1 inline-flex items-center gap-1">
                            <Clock class="w-3 h-3" /> {{ fmtDateTime(e.created_at) }}
                        </p>
                    </li>
                </ol>
            </section>
        </div>

        <div v-else-if="urlCode" class="text-center py-16 text-sm text-black/55">
            Enter a tracking code above to view delivery progress.
        </div>
    </div>
</template>
