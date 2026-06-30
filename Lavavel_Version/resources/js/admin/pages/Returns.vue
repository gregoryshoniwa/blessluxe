<script>
import { api } from '../../lib/api.js';

export default {
    name: 'AdminReturns',
    data() {
        return {
            returns: [],
            loading: true,
            filter: '',
            selected: null,
            decision: { status: '', admin_notes: '', refund_amount: 0 },
            busy: false,
            error: '',
        };
    },
    async mounted() { await this.load(); },
    methods: {
        async load() {
            this.loading = true;
            try {
                const r = await api.get(`/api/admin/returns${this.filter ? '?status=' + this.filter : ''}`);
                this.returns = r.returns || [];
            } finally { this.loading = false; }
        },
        async open(r) {
            try {
                const d = await api.get(`/api/admin/returns/${r.id}`);
                this.selected = d.return;
                this.decision = {
                    status: this.selected.status,
                    admin_notes: this.selected.admin_notes || '',
                    refund_amount: this.selected.refund_amount || 0,
                };
            } catch (e) { this.error = e.payload?.error || 'Could not load.'; }
        },
        close() { this.selected = null; this.error = ''; },
        async save() {
            this.busy = true;
            this.error = '';
            try {
                const r = await api.put(`/api/admin/returns/${this.selected.id}`, this.decision);
                this.selected = r.return;
                await this.load();
            } catch (e) {
                this.error = e.payload?.error || 'Could not save.';
            } finally { this.busy = false; }
        },
        fmtDate(iso) { return iso ? new Date(iso).toLocaleString() : '—'; },
        statusColor(s) {
            return {
                requested: 'bg-amber-100 text-amber-700',
                approved:  'bg-blue-100 text-blue-700',
                rejected:  'bg-zinc-100 text-zinc-500',
                refunded:  'bg-emerald-100 text-emerald-700',
            }[s] || 'bg-zinc-100';
        },
    },
};
</script>

<template>
    <div class="px-8 py-8 max-w-[1400px]">
        <header class="mb-6 flex items-end justify-between">
            <div>
                <h1 class="text-3xl font-serif">Returns</h1>
                <p class="text-sm text-zinc-500 mt-1">Review customer-initiated return requests.</p>
            </div>
            <div class="flex items-center gap-2">
                <select v-model="filter" @change="load" class="border border-zinc-300 px-3 py-1.5 text-sm bg-white">
                    <option value="">All</option>
                    <option value="requested">Requested</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="refunded">Refunded</option>
                </select>
            </div>
        </header>

        <div v-if="loading" class="text-sm text-zinc-500">Loading…</div>
        <p v-else-if="!returns.length" class="text-sm text-zinc-500">No return requests in this view.</p>
        <table v-else class="w-full text-sm bg-white border border-zinc-200">
            <thead class="text-[10px] tracking-widest uppercase text-zinc-500">
                <tr class="border-b border-zinc-200">
                    <th class="py-2 px-3 text-left">Order</th>
                    <th class="py-2 px-3 text-left">Customer</th>
                    <th class="py-2 px-3 text-left">Items</th>
                    <th class="py-2 px-3 text-left">Status</th>
                    <th class="py-2 px-3 text-right">Refund</th>
                    <th class="py-2 px-3 text-right">Created</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="r in returns" :key="r.id" @click="open(r)" class="border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer">
                    <td class="py-2 px-3 font-mono text-xs">{{ r.order_number }}</td>
                    <td class="py-2 px-3">{{ r.customer_email || '—' }}</td>
                    <td class="py-2 px-3">{{ r.items.length }}</td>
                    <td class="py-2 px-3">
                        <span :class="['text-[10px] tracking-widest uppercase px-2 py-0.5', statusColor(r.status)]">{{ r.status }}</span>
                    </td>
                    <td class="py-2 px-3 text-right">{{ r.refund_label }}</td>
                    <td class="py-2 px-3 text-right text-xs text-zinc-500">{{ fmtDate(r.created_at) }}</td>
                </tr>
            </tbody>
        </table>

        <!-- Detail drawer / modal -->
        <div v-if="selected" class="fixed inset-0 z-50 flex" @click.self="close">
            <div class="absolute inset-0 bg-black/40"></div>
            <div class="ml-auto bg-white w-full max-w-[480px] h-full relative overflow-y-auto p-6">
                <button @click="close" class="absolute top-4 right-4 text-zinc-500 hover:text-black">✕</button>
                <p class="text-[10px] tracking-widest uppercase text-zinc-500">Order</p>
                <p class="font-mono text-lg mb-3">{{ selected.order_number }}</p>

                <p class="text-[10px] tracking-widest uppercase text-zinc-500">Customer</p>
                <p class="mb-3">{{ selected.customer_email || '—' }}</p>

                <p class="text-[10px] tracking-widest uppercase text-zinc-500">Reason</p>
                <p class="mb-3 text-sm">{{ selected.reason || '—' }}</p>

                <p class="text-[10px] tracking-widest uppercase text-zinc-500 mb-1">Items requested</p>
                <ul class="text-sm space-y-1 mb-4">
                    <li v-for="(it, idx) in selected.items" :key="idx" class="border-b border-zinc-100 py-1">
                        Qty {{ it.quantity }} · <span class="font-mono text-xs">{{ it.order_line_item_id.slice(-10) }}</span>
                        <span v-if="it.reason" class="text-zinc-500"> — {{ it.reason }}</span>
                    </li>
                </ul>

                <form @submit.prevent="save" class="border-t border-zinc-200 pt-4 space-y-3">
                    <label class="block">
                        <span class="text-[10px] tracking-widest uppercase text-zinc-500">Status</span>
                        <select v-model="decision.status" class="block w-full border border-zinc-300 px-3 py-2 text-sm bg-white mt-1">
                            <option value="requested">Requested</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="refunded">Refunded</option>
                        </select>
                    </label>
                    <label class="block">
                        <span class="text-[10px] tracking-widest uppercase text-zinc-500">Refund amount (cents)</span>
                        <input type="number" v-model.number="decision.refund_amount" min="0" class="block w-full border border-zinc-300 px-3 py-2 text-sm mt-1" />
                    </label>
                    <label class="block">
                        <span class="text-[10px] tracking-widest uppercase text-zinc-500">Notes to customer</span>
                        <textarea v-model="decision.admin_notes" rows="3" class="block w-full border border-zinc-300 px-3 py-2 text-sm mt-1"></textarea>
                    </label>
                    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
                    <button type="submit" :disabled="busy" class="bg-black text-white px-5 py-2 text-xs tracking-widest uppercase hover:bg-gold disabled:opacity-50">
                        {{ busy ? 'Saving…' : 'Save decision' }}
                    </button>
                </form>
            </div>
        </div>
    </div>
</template>
