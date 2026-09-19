<script>
import { api } from '../../lib/api.js';
import { confirmDialog } from '../../lib/dialog.js';
import IconButton from '../components/IconButton.vue';
import { Plus, Trash2, Check, X, LoaderCircle } from 'lucide-vue-next';

export default {
    name: 'AdminCouriers',
    components: { IconButton, Plus, Trash2, Check, X, LoaderCircle },
    data() {
        return {
            couriers: [],
            loading: true,
            saving: null,
            error: '',
            notice: '',
            creating: false,
            draft: this.emptyDraft(),
        };
    },
    mounted() { this.fetchAll(); },
    methods: {
        emptyDraft() {
            return { code: '', name: '', description: '', base_fee: '', per_item_fee: '', min_days: '', max_days: '' };
        },
        // Admin types dollars; the API stores cents.
        toCents(v) { return Math.round(parseFloat(v || 0) * 100) || 0; },
        toDollars(c) { return ((c || 0) / 100).toFixed(2); },

        async fetchAll() {
            this.loading = true;
            try {
                const d = await api.get('/api/admin/couriers');
                this.couriers = d.couriers.map((c) => ({
                    ...c,
                    base_fee_input: this.toDollars(c.base_fee),
                    per_item_fee_input: this.toDollars(c.per_item_fee),
                }));
            } catch (e) {
                this.error = e.payload?.error || 'Could not load couriers.';
            } finally { this.loading = false; }
        },

        async create() {
            this.error = ''; this.notice = '';
            this.creating = true;
            try {
                await api.post('/api/admin/couriers', {
                    code: this.draft.code.trim().toLowerCase(),
                    name: this.draft.name.trim(),
                    description: this.draft.description || null,
                    base_fee: this.toCents(this.draft.base_fee),
                    per_item_fee: this.toCents(this.draft.per_item_fee),
                    min_days: this.draft.min_days === '' ? null : Number(this.draft.min_days),
                    max_days: this.draft.max_days === '' ? null : Number(this.draft.max_days),
                });
                this.draft = this.emptyDraft();
                await this.fetchAll();
                this.notice = 'Courier added.';
            } catch (e) {
                this.error = e.payload?.error
                    || Object.values(e.payload?.errors || {}).flat()[0]
                    || 'Could not add that courier.';
            } finally { this.creating = false; }
        },

        async save(c) {
            this.error = ''; this.notice = '';
            this.saving = c.id;
            try {
                await api.put(`/api/admin/couriers/${c.id}`, {
                    name: c.name,
                    description: c.description || null,
                    base_fee: this.toCents(c.base_fee_input),
                    per_item_fee: this.toCents(c.per_item_fee_input),
                    min_days: c.min_days === '' || c.min_days === null ? null : Number(c.min_days),
                    max_days: c.max_days === '' || c.max_days === null ? null : Number(c.max_days),
                    is_active: !!c.is_active,
                    sort_order: Number(c.sort_order) || 0,
                });
                await this.fetchAll();
                this.notice = 'Saved.';
            } catch (e) {
                this.error = e.payload?.error
                    || Object.values(e.payload?.errors || {}).flat()[0]
                    || 'Could not save.';
            } finally { this.saving = null; }
        },

        async makeDefault(c) {
            this.saving = c.id;
            try {
                await api.put(`/api/admin/couriers/${c.id}`, { is_default: true });
                await this.fetchAll();
            } finally { this.saving = null; }
        },

        async remove(c) {
            // A courier that has carried goods is deactivated instead, so say which
            // is about to happen rather than asking a vague "are you sure?".
            const msg = c.in_use
                ? `${c.name} is carrying goods, so it will be DEACTIVATED, not deleted. Existing shipments keep their history and buyers can no longer choose it. Continue?`
                : `Delete ${c.name}? Nothing is using it, so this is permanent.`;
            if (!await confirmDialog(msg)) return;

            this.saving = c.id;
            this.error = ''; this.notice = '';
            try {
                const d = await api.del(`/api/admin/couriers/${c.id}`);
                await this.fetchAll();
                this.notice = d.message || (d.deleted ? 'Courier deleted.' : 'Courier deactivated.');
            } catch (e) {
                this.error = e.payload?.error || 'Could not remove that courier.';
            } finally { this.saving = null; }
        },
    },
};
</script>

<template>
    <div>
        <header class="flex items-start justify-between mb-6 flex-wrap gap-3">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">Fulfilment</p>
                <h1 class="text-2xl font-semibold">Couriers</h1>
                <p class="text-sm text-zinc-500 mt-1">
                    Buyers choose one of these to carry imported stock. Rates are base fee plus a fee per item.
                    Local stock never shows a courier charge.
                </p>
            </div>
        </header>

        <p v-if="error" class="bg-red-50 border border-red-200 text-sm text-red-700 p-3 mb-4">{{ error }}</p>
        <p v-if="notice" class="bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 p-3 mb-4">{{ notice }}</p>

        <div v-if="loading" class="text-zinc-400 text-sm">Loading…</div>

        <template v-else>
            <!-- Existing couriers -->
            <div class="bg-white border border-zinc-200 mb-6 overflow-x-auto">
                <table class="w-full text-sm min-w-[900px]">
                    <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                        <tr>
                            <th class="px-4 py-2 text-left">Name</th>
                            <th class="px-4 py-2 text-left">Code</th>
                            <th class="px-4 py-2 text-left">Base</th>
                            <th class="px-4 py-2 text-left">Per item</th>
                            <th class="px-4 py-2 text-left">Days</th>
                            <th class="px-4 py-2 text-left">Active</th>
                            <th class="px-4 py-2 text-left">Default</th>
                            <th class="px-4 py-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="c in couriers" :key="c.id" class="border-t border-zinc-100" :class="c.is_active ? '' : 'opacity-50'">
                            <td class="px-4 py-2">
                                <input v-model="c.name" class="border border-zinc-300 px-2 py-1 w-40" />
                                <input v-model="c.description" placeholder="Short note" class="border border-zinc-300 px-2 py-1 w-40 mt-1 text-xs" />
                            </td>
                            <td class="px-4 py-2 font-mono text-xs">{{ c.code }}</td>
                            <td class="px-4 py-2">
                                <span class="text-zinc-400">$</span>
                                <input v-model="c.base_fee_input" class="border border-zinc-300 px-2 py-1 w-20" />
                            </td>
                            <td class="px-4 py-2">
                                <span class="text-zinc-400">$</span>
                                <input v-model="c.per_item_fee_input" class="border border-zinc-300 px-2 py-1 w-20" />
                            </td>
                            <td class="px-4 py-2 whitespace-nowrap">
                                <input v-model="c.min_days" class="border border-zinc-300 px-2 py-1 w-14" />
                                <span class="text-zinc-400 mx-1">–</span>
                                <input v-model="c.max_days" class="border border-zinc-300 px-2 py-1 w-14" />
                            </td>
                            <td class="px-4 py-2">
                                <input type="checkbox" v-model="c.is_active" />
                            </td>
                            <td class="px-4 py-2">
                                <span v-if="c.is_default" class="text-[10px] tracking-widest uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Default</span>
                                <button
                                    v-else-if="c.is_active"
                                    @click="makeDefault(c)"
                                    class="text-[10px] tracking-widest uppercase text-zinc-500 hover:text-gold"
                                >Make default</button>
                            </td>
                            <td class="px-4 py-2">
                                <div class="flex items-center justify-end gap-1">
                                    <IconButton tone="positive" label="Save changes" :disabled="saving === c.id" @click="save(c)">
                                        <LoaderCircle v-if="saving === c.id" class="w-4 h-4 animate-spin" />
                                        <Check v-else class="w-4 h-4" />
                                    </IconButton>
                                    <IconButton
                                        tone="danger"
                                        :label="c.in_use ? 'Deactivate (in use)' : 'Delete'"
                                        :disabled="saving === c.id"
                                        @click="remove(c)"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </IconButton>
                                </div>
                            </td>
                        </tr>
                        <tr v-if="!couriers.length">
                            <td colspan="8" class="px-4 py-8 text-center text-zinc-400">
                                No couriers yet. Add one below so buyers have a way to receive imported stock.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Add -->
            <section class="bg-white border border-zinc-200 p-5">
                <h2 class="font-semibold mb-3 inline-flex items-center gap-2"><Plus class="w-4 h-4" /> Add a courier</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <input v-model="draft.name" placeholder="Name (e.g. Kwik Cargo)" class="border border-zinc-300 px-3 py-2" />
                    <input v-model="draft.code" placeholder="code (lowercase, no spaces)" class="border border-zinc-300 px-3 py-2 font-mono text-sm" />
                    <input v-model="draft.base_fee" placeholder="Base fee ($)" class="border border-zinc-300 px-3 py-2" />
                    <input v-model="draft.per_item_fee" placeholder="Per item ($)" class="border border-zinc-300 px-3 py-2" />
                    <input v-model="draft.min_days" placeholder="Fastest (days)" class="border border-zinc-300 px-3 py-2" />
                    <input v-model="draft.max_days" placeholder="Slowest (days)" class="border border-zinc-300 px-3 py-2" />
                    <input v-model="draft.description" placeholder="Short note shown to buyers" class="border border-zinc-300 px-3 py-2 md:col-span-2" />
                </div>
                <div class="flex justify-end mt-3">
                    <button
                        @click="create"
                        :disabled="creating || !draft.name || !draft.code"
                        class="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-40"
                    >
                        {{ creating ? 'Adding…' : 'Add courier' }}
                    </button>
                </div>
            </section>
        </template>
    </div>
</template>
