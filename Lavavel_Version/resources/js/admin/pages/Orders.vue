<script>
import { api } from '../../lib/api.js';
import { Receipt } from 'lucide-vue-next';

export default {
    name: 'AdminOrders',
    components: { Receipt },
    data() {
        return {
            orders: [],
            pagination: null,
            loading: true,
            q: '',
            statusFilter: '',
            paymentFilter: '',
            page: 1,
        };
    },
    mounted() { this.fetchAll(); },
    methods: {
        async fetchAll() {
            this.loading = true;
            try {
                const params = new URLSearchParams({ page: this.page, limit: 25 });
                if (this.q) params.set('q', this.q);
                if (this.statusFilter) params.set('status', this.statusFilter);
                if (this.paymentFilter) params.set('payment_status', this.paymentFilter);
                const d = await api.get(`/api/admin/orders?${params}`);
                this.orders = d.orders;
                this.pagination = d.pagination;
            } finally { this.loading = false; }
        },
        fmtDate(iso) { return iso ? new Date(iso).toLocaleString() : '—'; },
    },
};
</script>

<template>
    <div>
        <header class="mb-8">
            <p class="text-xs tracking-widest uppercase text-zinc-500">Sales</p>
            <h1 class="text-2xl font-semibold flex items-center gap-2"><Receipt class="w-5 h-5 text-gold" /> Orders</h1>
        </header>

        <div class="mb-4 flex gap-2 items-center flex-wrap">
            <input v-model="q" @keyup.enter="page = 1; fetchAll()" placeholder="Search order # or email…" class="border border-zinc-300 px-3 py-2 text-sm w-72" />
            <select v-model="statusFilter" @change="page = 1; fetchAll()" class="border border-zinc-300 px-3 py-2 text-sm">
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="refunded">Refunded</option>
                <option value="cancelled">Cancelled</option>
            </select>
            <select v-model="paymentFilter" @change="page = 1; fetchAll()" class="border border-zinc-300 px-3 py-2 text-sm">
                <option value="">All payments</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="refunded">Refunded</option>
                <option value="failed">Failed</option>
            </select>
            <button @click="page = 1; fetchAll()" class="border border-zinc-300 px-4 py-2 text-xs tracking-widest uppercase hover:bg-zinc-100">Apply</button>
        </div>

        <div class="bg-white border border-zinc-200">
            <table class="w-full text-sm">
                <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                    <tr>
                        <th class="px-5 py-3 text-left">Order</th>
                        <th class="px-5 py-3 text-left">Email</th>
                        <th class="px-5 py-3 text-left">Total</th>
                        <th class="px-5 py-3 text-left">Status</th>
                        <th class="px-5 py-3 text-left">Payment</th>
                        <th class="px-5 py-3 text-left">Placed</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">Loading…</td></tr>
                    <tr v-else-if="!orders.length"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">No orders match.</td></tr>
                    <tr v-for="o in orders" :key="o.id" class="border-t border-zinc-100 hover:bg-zinc-50/50 cursor-pointer" @click="$router.push(`/admin/orders/${o.id}`)">
                        <td class="px-5 py-3 font-mono text-xs">{{ o.order_number }}</td>
                        <td class="px-5 py-3">{{ o.email || '—' }}</td>
                        <td class="px-5 py-3 font-medium">{{ o.total_label }}</td>
                        <td class="px-5 py-3">
                            <span :class="['text-xs px-2 py-0.5 rounded', {
                                'bg-emerald-100 text-emerald-700': o.status === 'completed',
                                'bg-amber-100 text-amber-700': o.status === 'pending',
                                'bg-red-100 text-red-700': o.status === 'refunded' || o.status === 'cancelled',
                            }]">{{ o.status }}</span>
                        </td>
                        <td class="px-5 py-3">
                            <span :class="['text-xs px-2 py-0.5 rounded', {
                                'bg-emerald-100 text-emerald-700': o.payment_status === 'paid',
                                'bg-amber-100 text-amber-700': o.payment_status === 'pending',
                                'bg-red-100 text-red-700': o.payment_status === 'refunded' || o.payment_status === 'failed',
                            }]">{{ o.payment_status || '—' }}</span>
                            <span v-if="o.payment_method" class="text-[10px] text-zinc-500 ml-1">{{ o.payment_method }}</span>
                        </td>
                        <td class="px-5 py-3 text-zinc-500 text-xs">{{ fmtDate(o.created_at) }}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-if="pagination && pagination.last_page > 1" class="flex items-center justify-between mt-4 text-sm">
            <p class="text-zinc-500">Page {{ pagination.page }} of {{ pagination.last_page }} · {{ pagination.total }} orders</p>
            <div class="flex gap-2">
                <button :disabled="pagination.page <= 1" @click="page--; fetchAll()" class="border border-zinc-300 px-3 py-1 disabled:opacity-40">Prev</button>
                <button :disabled="pagination.page >= pagination.last_page" @click="page++; fetchAll()" class="border border-zinc-300 px-3 py-1 disabled:opacity-40">Next</button>
            </div>
        </div>
    </div>
</template>
