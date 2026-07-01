<script>
import { api } from '../../lib/api.js';
import IconButton from '../components/IconButton.vue';
import { Sparkles } from 'lucide-vue-next';

export default {
    name: 'AdminCustomers',
    components: { IconButton, Sparkles },
    data() {
        return {
            customers: [], pagination: null, loading: true,
            q: '', page: 1,
            adjusting: null, delta: 0, reason: '',
            saving: false, error: '',
        };
    },
    mounted() { this.fetchAll(); },
    methods: {
        async fetchAll() {
            this.loading = true;
            try {
                const params = new URLSearchParams({ page: this.page, limit: 25 });
                if (this.q) params.set('q', this.q);
                const data = await api.get(`/api/admin/customers?${params}`);
                this.customers = data.customers || [];
                this.pagination = data.pagination;
            } finally { this.loading = false; }
        },
        startAdjust(c) {
            this.adjusting = c; this.delta = 0; this.reason = ''; this.error = '';
        },
        cancel() { this.adjusting = null; },
        async save() {
            if (!this.adjusting || !this.delta) return;
            this.saving = true; this.error = '';
            try {
                await api.post(`/api/admin/customers/${this.adjusting.id}/loyalty`, {
                    delta: this.delta,
                    reason: this.reason || 'admin_adjustment',
                });
                this.cancel();
                await this.fetchAll();
            } catch (e) {
                this.error = e.payload?.error || 'Could not adjust.';
            } finally { this.saving = false; }
        },
        displayName(c) {
            return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email;
        },
    },
};
</script>

<template>
    <div>
        <header class="flex items-center justify-between mb-8">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">People</p>
                <h1 class="text-2xl font-semibold">Customers</h1>
            </div>
        </header>

        <div class="mb-4 flex gap-2">
            <input v-model="q" @keyup.enter="page = 1; fetchAll()" placeholder="Search email, name or phone…" class="border border-zinc-300 px-3 py-2 text-sm w-72" />
            <button @click="page = 1; fetchAll()" class="border border-zinc-300 px-4 py-2 text-xs tracking-widest uppercase hover:bg-zinc-100">Search</button>
        </div>

        <div v-if="adjusting" class="bg-white border border-gold/30 p-5 mb-6">
            <h2 class="font-semibold mb-1">{{ displayName(adjusting) }}</h2>
            <p class="text-xs text-zinc-500 mb-3">{{ adjusting.email }} · {{ adjusting.loyalty_points }} Blits ({{ adjusting.loyalty_tier }})</p>
            <div class="grid grid-cols-2 gap-3">
                <input v-model.number="delta" type="number" placeholder="Delta (e.g. +100, -50)" class="border border-zinc-300 px-3 py-2" />
                <input v-model="reason" placeholder="Reason (e.g. goodwill_gesture)" class="border border-zinc-300 px-3 py-2" />
            </div>
            <p v-if="error" class="text-sm text-red-600 mt-3">{{ error }}</p>
            <div class="flex justify-end gap-2 mt-4">
                <button @click="cancel" class="px-4 py-2 text-xs tracking-widest uppercase text-zinc-600">Cancel</button>
                <button @click="save" :disabled="saving || !delta" class="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50">
                    {{ saving ? 'Saving…' : 'Apply' }}
                </button>
            </div>
        </div>

        <div class="bg-white border border-zinc-200">
            <table class="w-full text-sm">
                <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                    <tr>
                        <th class="px-5 py-3 text-left">Name</th>
                        <th class="px-5 py-3 text-left">Email</th>
                        <th class="px-5 py-3 text-left">Phone</th>
                        <th class="px-5 py-3 text-left">Orders</th>
                        <th class="px-5 py-3 text-left">Blits</th>
                        <th class="px-5 py-3 text-left">Joined</th>
                        <th class="px-5 py-3"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="7" class="px-5 py-8 text-center text-zinc-400">Loading…</td></tr>
                    <tr v-else-if="!customers.length"><td colspan="7" class="px-5 py-8 text-center text-zinc-400">No customers match.</td></tr>
                    <tr v-for="c in customers" :key="c.id" class="border-t border-zinc-100">
                        <td class="px-5 py-3 font-medium">{{ displayName(c) }}</td>
                        <td class="px-5 py-3">{{ c.email }}</td>
                        <td class="px-5 py-3 text-zinc-500">{{ c.phone || '—' }}</td>
                        <td class="px-5 py-3">{{ c.orders_count }}</td>
                        <td class="px-5 py-3">{{ c.loyalty_points }} <span class="text-[10px] text-zinc-400 uppercase">{{ c.loyalty_tier }}</span></td>
                        <td class="px-5 py-3 text-zinc-500 text-xs">{{ new Date(c.created_at).toLocaleDateString() }}</td>
                        <td class="px-5 py-3 text-right">
                            <IconButton label="Adjust Blits" @click="startAdjust(c)">
                                <Sparkles class="w-4 h-4" />
                            </IconButton>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-if="pagination && pagination.last_page > 1" class="flex items-center justify-between mt-4 text-sm">
            <p class="text-zinc-500">Page {{ pagination.page }} of {{ pagination.last_page }} · {{ pagination.total }} customers</p>
            <div class="flex gap-2">
                <button :disabled="pagination.page <= 1" @click="page--; fetchAll()" class="border border-zinc-300 px-3 py-1 disabled:opacity-40">Prev</button>
                <button :disabled="pagination.page >= pagination.last_page" @click="page++; fetchAll()" class="border border-zinc-300 px-3 py-1 disabled:opacity-40">Next</button>
            </div>
        </div>
    </div>
</template>
