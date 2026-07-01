<script>
import { api } from '../../lib/api.js';
import IconButton from '../components/IconButton.vue';
import { SlidersHorizontal } from 'lucide-vue-next';

export default {
    name: 'AdminInventory',
    components: { IconButton, SlidersHorizontal },
    data() {
        return {
            variants: [], pagination: null, loading: true,
            q: '', page: 1, lowOnly: false,
            adjusting: null,
            delta: 0, reason: '', notes: '',
            saving: false, error: '',
        };
    },
    mounted() { this.fetchAll(); },
    methods: {
        async fetchAll() {
            this.loading = true;
            try {
                const params = new URLSearchParams({ page: this.page, limit: 50 });
                if (this.q) params.set('q', this.q);
                if (this.lowOnly) params.set('low_stock', 'true');
                const data = await api.get(`/api/admin/inventory?${params}`);
                this.variants = data.variants || [];
                this.pagination = data.pagination;
            } finally { this.loading = false; }
        },
        startAdjust(v) {
            this.adjusting = v;
            this.delta = 0; this.reason = ''; this.notes = ''; this.error = '';
        },
        cancel() { this.adjusting = null; },
        async save() {
            if (!this.adjusting || !this.delta) return;
            this.saving = true; this.error = '';
            try {
                await api.post(`/api/admin/inventory/${this.adjusting.id}/adjust`, {
                    delta: this.delta,
                    reason: this.reason || (this.delta > 0 ? 'receive' : 'adjustment'),
                    notes: this.notes,
                });
                this.cancel();
                await this.fetchAll();
            } catch (e) {
                this.error = e.payload?.error || 'Could not adjust.';
            } finally { this.saving = false; }
        },
    },
};
</script>

<template>
    <div>
        <header class="flex items-center justify-between mb-8">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">Stock</p>
                <h1 class="text-2xl font-semibold">Inventory</h1>
            </div>
        </header>

        <div class="mb-4 flex gap-2 items-center">
            <input v-model="q" @keyup.enter="page = 1; fetchAll()" placeholder="Search SKU or product…" class="border border-zinc-300 px-3 py-2 text-sm w-72" />
            <label class="flex items-center gap-1 text-sm"><input type="checkbox" v-model="lowOnly" @change="page = 1; fetchAll()" /> Low stock only</label>
            <button @click="page = 1; fetchAll()" class="border border-zinc-300 px-4 py-2 text-xs tracking-widest uppercase hover:bg-zinc-100">Search</button>
        </div>

        <div v-if="adjusting" class="bg-white border border-gold/30 p-5 mb-6">
            <h2 class="font-semibold mb-1">{{ adjusting.product_title }} · {{ adjusting.title }}</h2>
            <p class="text-xs text-zinc-500 mb-3">SKU {{ adjusting.sku || '—' }} · on hand {{ adjusting.inventory_quantity }}</p>
            <div class="grid grid-cols-3 gap-3">
                <div>
                    <label class="block text-xs tracking-widest uppercase text-zinc-500 mb-1">Delta</label>
                    <input v-model.number="delta" type="number" placeholder="e.g. +10 or -3" class="w-full border border-zinc-300 px-3 py-2" />
                </div>
                <div>
                    <label class="block text-xs tracking-widest uppercase text-zinc-500 mb-1">Reason</label>
                    <select v-model="reason" class="w-full border border-zinc-300 px-3 py-2">
                        <option value="">Auto</option>
                        <option value="receive">Receive</option>
                        <option value="adjustment">Adjustment</option>
                        <option value="return">Return</option>
                        <option value="sale">Sale</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs tracking-widest uppercase text-zinc-500 mb-1">Notes</label>
                    <input v-model="notes" placeholder="Optional" class="w-full border border-zinc-300 px-3 py-2" />
                </div>
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
                        <th class="px-5 py-3 text-left">SKU</th>
                        <th class="px-5 py-3 text-left">Product</th>
                        <th class="px-5 py-3 text-left">Variant</th>
                        <th class="px-5 py-3 text-left">On hand</th>
                        <th class="px-5 py-3 text-left">Tracked</th>
                        <th class="px-5 py-3"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">Loading…</td></tr>
                    <tr v-else-if="!variants.length"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">No variants match.</td></tr>
                    <tr v-for="v in variants" :key="v.id" class="border-t border-zinc-100">
                        <td class="px-5 py-3 font-mono text-xs">{{ v.sku || '—' }}</td>
                        <td class="px-5 py-3">{{ v.product_title }}</td>
                        <td class="px-5 py-3">{{ v.title }}</td>
                        <td :class="['px-5 py-3 font-medium', v.inventory_quantity <= 5 ? 'text-red-600' : '']">{{ v.inventory_quantity }}</td>
                        <td class="px-5 py-3">{{ v.manage_inventory ? '✓' : '—' }}</td>
                        <td class="px-5 py-3 text-right">
                            <IconButton label="Adjust stock" @click="startAdjust(v)">
                                <SlidersHorizontal class="w-4 h-4" />
                            </IconButton>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-if="pagination && pagination.last_page > 1" class="flex items-center justify-between mt-4 text-sm">
            <p class="text-zinc-500">Page {{ pagination.page }} of {{ pagination.last_page }} · {{ pagination.total }} variants</p>
            <div class="flex gap-2">
                <button :disabled="pagination.page <= 1" @click="page--; fetchAll()" class="border border-zinc-300 px-3 py-1 disabled:opacity-40">Prev</button>
                <button :disabled="pagination.page >= pagination.last_page" @click="page++; fetchAll()" class="border border-zinc-300 px-3 py-1 disabled:opacity-40">Next</button>
            </div>
        </div>
    </div>
</template>
