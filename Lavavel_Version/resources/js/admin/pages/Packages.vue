<script>
import { api } from '../../lib/api.js';
import IconButton from '../components/IconButton.vue';
import { ExternalLink, ArrowLeft, Plus, Truck } from 'lucide-vue-next';

export default {
    name: 'AdminPackages',
    components: { IconButton, ExternalLink, ArrowLeft, Plus, Truck },
    data() {
        return {
            tab: 'list',
            packages: [],
            pagination: null,
            loading: true,
            q: '',
            statusFilter: '',
            page: 1,

            // Detail state
            selected: null,
            saving: false,
            error: '',
            carrier: '', tracking_number: '', estimated_delivery_at: '', notes: '',
            newEvent: this.emptyEvent(),
        };
    },
    mounted() { this.fetchAll(); },
    methods: {
        emptyEvent() { return { status: 'shipped', location: '', notes: '' }; },
        async fetchAll() {
            this.loading = true;
            try {
                const params = new URLSearchParams({ page: this.page, limit: 25 });
                if (this.q) params.set('q', this.q);
                if (this.statusFilter) params.set('status', this.statusFilter);
                const d = await api.get(`/api/admin/packages?${params}`);
                this.packages = d.packages;
                this.pagination = d.pagination;
            } finally { this.loading = false; }
        },
        async open(p) {
            this.selected = null;
            try {
                const d = await api.get(`/api/admin/packages/${p.id}`);
                this.selected = d.package;
                this.carrier = d.package.carrier || '';
                this.tracking_number = d.package.carrier_tracking_number || '';
                this.estimated_delivery_at = d.package.estimated_delivery_at?.slice(0, 16) || '';
                this.notes = d.package.notes || '';
                this.tab = 'detail';
            } catch (e) {
                alert(e.payload?.error || 'Could not open package.');
            }
        },
        back() { this.selected = null; this.tab = 'list'; this.error = ''; this.fetchAll(); },
        publicUrl(code) {
            if (typeof window === 'undefined') return '';
            return `${window.location.origin}/track/${code}`;
        },
        async saveCarrier() {
            this.saving = true; this.error = '';
            try {
                await api.put(`/api/admin/packages/${this.selected.id}`, {
                    carrier: this.carrier || null,
                    carrier_tracking_number: this.tracking_number || null,
                    estimated_delivery_at: this.estimated_delivery_at || null,
                    notes: this.notes || null,
                });
                await this.refreshSelected();
            } catch (e) {
                this.error = e.payload?.error || 'Could not save.';
            } finally { this.saving = false; }
        },
        async addEvent() {
            if (!this.newEvent.status) return;
            this.saving = true; this.error = '';
            try {
                await api.post(`/api/admin/packages/${this.selected.id}/events`, this.newEvent);
                this.newEvent = this.emptyEvent();
                await this.refreshSelected();
            } catch (e) {
                this.error = e.payload?.error || 'Could not add event.';
            } finally { this.saving = false; }
        },
        async refreshSelected() {
            const d = await api.get(`/api/admin/packages/${this.selected.id}`);
            this.selected = d.package;
        },
        fmtDate(iso) { return iso ? new Date(iso).toLocaleString() : '—'; },
    },
};
</script>

<template>
    <div>
        <!-- List view -->
        <template v-if="tab === 'list'">
            <header class="flex items-center justify-between mb-8">
                <div>
                    <p class="text-xs tracking-widest uppercase text-zinc-500">Fulfilment</p>
                    <h1 class="text-2xl font-semibold flex items-center gap-2"><Truck class="w-5 h-5 text-gold" /> Packages</h1>
                </div>
            </header>

            <div class="mb-4 flex gap-2 items-center">
                <input v-model="q" @keyup.enter="page = 1; fetchAll()" placeholder="Search code, order #, email…" class="border border-zinc-300 px-3 py-2 text-sm w-72" />
                <select v-model="statusFilter" @change="page = 1; fetchAll()" class="border border-zinc-300 px-3 py-2 text-sm">
                    <option value="">All statuses</option>
                    <option value="created">Created</option>
                    <option value="picked">Picked</option>
                    <option value="packed">Packed</option>
                    <option value="shipped">Shipped</option>
                    <option value="in_transit">In transit</option>
                    <option value="out_for_delivery">Out for delivery</option>
                    <option value="delivered">Delivered</option>
                    <option value="returned">Returned</option>
                    <option value="cancelled">Cancelled</option>
                </select>
                <button @click="page = 1; fetchAll()" class="border border-zinc-300 px-4 py-2 text-xs tracking-widest uppercase hover:bg-zinc-100">Search</button>
            </div>

            <div class="bg-white border border-zinc-200">
                <table class="w-full text-sm">
                    <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                        <tr>
                            <th class="px-5 py-3 text-left">Code</th>
                            <th class="px-5 py-3 text-left">Order</th>
                            <th class="px-5 py-3 text-left">Customer</th>
                            <th class="px-5 py-3 text-left">Status</th>
                            <th class="px-5 py-3 text-left">Carrier</th>
                            <th class="px-5 py-3 text-left">Created</th>
                            <th class="px-5 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="loading"><td colspan="7" class="px-5 py-8 text-center text-zinc-400">Loading…</td></tr>
                        <tr v-else-if="!packages.length"><td colspan="7" class="px-5 py-8 text-center text-zinc-400">No packages yet. They're created automatically when an order is paid.</td></tr>
                        <tr v-for="p in packages" :key="p.id" class="border-t border-zinc-100 hover:bg-zinc-50/50 cursor-pointer" @click="open(p)">
                            <td class="px-5 py-3 font-mono text-xs text-gold-dark">{{ p.package_code }}</td>
                            <td class="px-5 py-3 font-mono text-xs">{{ p.order_number || '—' }}</td>
                            <td class="px-5 py-3 text-xs">{{ p.customer_email || '—' }}</td>
                            <td class="px-5 py-3">
                                <span class="text-xs px-2 py-0.5 rounded bg-zinc-100">{{ p.status }}</span>
                            </td>
                            <td class="px-5 py-3 text-xs">{{ p.carrier || '—' }}</td>
                            <td class="px-5 py-3 text-zinc-500 text-xs">{{ new Date(p.created_at).toLocaleDateString() }}</td>
                            <td class="px-5 py-3 text-right">
                                <a :href="publicUrl(p.package_code)" target="_blank" class="inline-flex items-center justify-center w-8 h-8 text-zinc-500 hover:text-gold hover:bg-gold/10 rounded" title="Open public tracking" @click.stop>
                                    <ExternalLink class="w-4 h-4" />
                                </a>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div v-if="pagination && pagination.last_page > 1" class="flex items-center justify-between mt-4 text-sm">
                <p class="text-zinc-500">Page {{ pagination.page }} of {{ pagination.last_page }} · {{ pagination.total }} packages</p>
                <div class="flex gap-2">
                    <button :disabled="pagination.page <= 1" @click="page--; fetchAll()" class="border border-zinc-300 px-3 py-1 disabled:opacity-40">Prev</button>
                    <button :disabled="pagination.page >= pagination.last_page" @click="page++; fetchAll()" class="border border-zinc-300 px-3 py-1 disabled:opacity-40">Next</button>
                </div>
            </div>
        </template>

        <!-- Detail view -->
        <template v-else-if="tab === 'detail' && selected">
            <button @click="back" class="text-xs tracking-widest uppercase text-zinc-500 hover:text-gold inline-flex items-center gap-1 mb-4">
                <ArrowLeft class="w-3 h-3" /> All packages
            </button>

            <header class="flex items-start justify-between mb-6">
                <div>
                    <p class="text-xs tracking-widest uppercase text-zinc-500">Package</p>
                    <h1 class="text-2xl font-semibold font-mono text-gold-dark">{{ selected.package_code }}</h1>
                    <p class="text-sm text-zinc-500 mt-1">
                        Order <span class="font-mono">{{ selected.order_number }}</span> · {{ selected.customer_email }}
                    </p>
                </div>
                <a :href="publicUrl(selected.package_code)" target="_blank" class="text-xs tracking-widest uppercase text-zinc-500 hover:text-gold inline-flex items-center gap-1">
                    <ExternalLink class="w-3 h-3" /> Public tracking
                </a>
            </header>

            <!-- Current status block -->
            <section class="bg-cream-dark/40 border border-gold/15 p-5 mb-6">
                <div class="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <p class="text-[10px] tracking-widest uppercase text-zinc-500">Status</p>
                        <p class="font-display text-2xl text-gold-dark capitalize">{{ (selected.status || '').replace(/_/g, ' ') }}</p>
                    </div>
                    <div class="text-right text-xs space-y-1">
                        <p v-if="selected.current_location" class="text-zinc-600">📍 {{ selected.current_location }}</p>
                        <p v-if="selected.shipped_at" class="text-zinc-600">Shipped: {{ fmtDate(selected.shipped_at) }}</p>
                        <p v-if="selected.delivered_at" class="text-emerald-600">Delivered: {{ fmtDate(selected.delivered_at) }}</p>
                    </div>
                </div>
            </section>

            <!-- Carrier form -->
            <section class="bg-white border border-zinc-200 p-5 mb-6">
                <h2 class="font-semibold mb-3">Carrier details</h2>
                <div class="grid grid-cols-2 gap-3">
                    <input v-model="carrier" placeholder="Carrier (e.g. ups, fedex, dhl, manual)" class="border border-zinc-300 px-3 py-2" />
                    <input v-model="tracking_number" placeholder="Carrier tracking number" class="border border-zinc-300 px-3 py-2 font-mono" />
                    <input v-model="estimated_delivery_at" type="datetime-local" class="border border-zinc-300 px-3 py-2" />
                    <input v-model="notes" placeholder="Internal notes" class="border border-zinc-300 px-3 py-2" />
                </div>
                <p v-if="error" class="text-sm text-red-600 mt-3">{{ error }}</p>
                <div class="flex justify-end mt-3">
                    <button @click="saveCarrier" :disabled="saving" class="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50">
                        {{ saving ? 'Saving…' : 'Save Details' }}
                    </button>
                </div>
            </section>

            <!-- Items -->
            <section v-if="selected.items?.length" class="bg-white border border-zinc-200 mb-6">
                <header class="px-5 py-3 border-b border-zinc-200">
                    <h2 class="font-semibold">Contents</h2>
                </header>
                <table class="w-full text-sm">
                    <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                        <tr>
                            <th class="px-5 py-2 text-left">Item</th>
                            <th class="px-5 py-2 text-left">SKU</th>
                            <th class="px-5 py-2 text-right">Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="i in selected.items" :key="i.id" class="border-t border-zinc-100">
                            <td class="px-5 py-2">
                                <p>{{ i.product_title }}</p>
                                <p v-if="i.variant_title" class="text-xs text-zinc-500">{{ i.variant_title }}</p>
                            </td>
                            <td class="px-5 py-2 font-mono text-xs">{{ i.sku || '—' }}</td>
                            <td class="px-5 py-2 text-right">×{{ i.quantity }}</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <!-- Events timeline + add event -->
            <section class="bg-white border border-zinc-200 mb-6">
                <header class="px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
                    <h2 class="font-semibold">Activity</h2>
                </header>
                <div class="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50">
                    <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2 inline-flex items-center gap-1"><Plus class="w-3 h-3" /> Append event</p>
                    <div class="grid grid-cols-3 gap-2">
                        <select v-model="newEvent.status" class="border border-zinc-300 px-3 py-2 text-sm">
                            <option value="picked">Picked</option>
                            <option value="packed">Packed</option>
                            <option value="shipped">Shipped</option>
                            <option value="in_transit">In transit</option>
                            <option value="out_for_delivery">Out for delivery</option>
                            <option value="delivered">Delivered</option>
                            <option value="returned">Returned</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                        <input v-model="newEvent.location" placeholder="Location (optional)" class="border border-zinc-300 px-3 py-2 text-sm" />
                        <input v-model="newEvent.notes" placeholder="Notes (optional)" class="border border-zinc-300 px-3 py-2 text-sm" />
                    </div>
                    <div class="flex justify-end mt-2">
                        <button @click="addEvent" :disabled="saving" class="bg-gold text-white px-4 py-1.5 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50">
                            Append
                        </button>
                    </div>
                </div>

                <ol class="px-5 py-4 space-y-3">
                    <li v-for="e in selected.events" :key="e.id" class="flex items-start gap-3 text-sm">
                        <span class="w-1.5 h-1.5 rounded-full bg-gold mt-2"></span>
                        <div class="flex-1">
                            <p class="capitalize"><strong>{{ (e.status || '').replace(/_/g, ' ') }}</strong> <span v-if="e.location" class="text-zinc-500">— {{ e.location }}</span></p>
                            <p v-if="e.notes" class="text-xs text-zinc-600">{{ e.notes }}</p>
                            <p class="text-[10px] tracking-widest uppercase text-zinc-400">{{ fmtDate(e.created_at) }}</p>
                        </div>
                    </li>
                </ol>
            </section>
        </template>
    </div>
</template>
