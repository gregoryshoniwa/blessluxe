<script>
import { api } from '../../lib/api.js';
import IconButton from '../components/IconButton.vue';
import { Pencil, Trash2 } from 'lucide-vue-next';

export default {
    name: 'AdminAffiliates',
    components: { IconButton, Pencil, Trash2 },
    data() {
        return {
            affiliates: [], pagination: null, loading: true,
            q: '', page: 1,
            showForm: false, editingId: null,
            form: this.emptyForm(),
            saving: false, error: '',
        };
    },
    mounted() { this.fetchAll(); },
    methods: {
        emptyForm() {
            return { code: '', email: '', first_name: '', last_name: '', commission_rate: 10, status: 'pending' };
        },
        async fetchAll() {
            this.loading = true;
            try {
                const params = new URLSearchParams({ page: this.page, limit: 25 });
                if (this.q) params.set('q', this.q);
                const data = await api.get(`/api/admin/affiliates?${params}`);
                this.affiliates = data.affiliates || [];
                this.pagination = data.pagination;
            } finally { this.loading = false; }
        },
        startNew() {
            this.editingId = null; this.form = this.emptyForm();
            this.showForm = true; this.error = '';
        },
        startEdit(a) {
            this.editingId = a.id;
            this.form = { code: a.code, email: a.email, first_name: a.first_name || '', last_name: a.last_name || '', commission_rate: a.commission_rate, status: a.status };
            this.showForm = true; this.error = '';
        },
        cancel() { this.showForm = false; this.editingId = null; this.error = ''; },
        async save() {
            this.saving = true; this.error = '';
            try {
                if (this.editingId) {
                    const body = { commission_rate: this.form.commission_rate, status: this.form.status, first_name: this.form.first_name, last_name: this.form.last_name };
                    await api.put(`/api/admin/affiliates/${this.editingId}`, body);
                } else {
                    await api.post('/api/admin/affiliates', this.form);
                }
                this.cancel();
                await this.fetchAll();
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not save.';
            } finally { this.saving = false; }
        },
        async remove(a) {
            if (!confirm(`Delete affiliate ${a.code}? Their sales history stays in place.`)) return;
            try {
                await api.del(`/api/admin/affiliates/${a.id}`);
                await this.fetchAll();
            } catch (e) { alert(e.payload?.error || 'Could not delete.'); }
        },
    },
};
</script>

<template>
    <div>
        <header class="flex items-center justify-between mb-8">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">Partners</p>
                <h1 class="text-2xl font-semibold">Affiliates</h1>
            </div>
            <button @click="startNew" class="bg-gold text-white px-5 py-2 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark">New Affiliate</button>
        </header>

        <div class="mb-4 flex gap-2">
            <input v-model="q" @keyup.enter="page = 1; fetchAll()" placeholder="Search code or email…" class="border border-zinc-300 px-3 py-2 text-sm w-72" />
            <button @click="page = 1; fetchAll()" class="border border-zinc-300 px-4 py-2 text-xs tracking-widest uppercase hover:bg-zinc-100">Search</button>
        </div>

        <div v-if="showForm" class="bg-white border border-gold/30 p-5 mb-6">
            <h2 class="font-semibold mb-3">{{ editingId ? 'Edit affiliate' : 'New affiliate' }}</h2>
            <div class="grid grid-cols-2 gap-3">
                <input v-model="form.code" :disabled="!!editingId" placeholder="Code (e.g. JANE10)" class="border border-zinc-300 px-3 py-2 font-mono uppercase disabled:bg-zinc-100" />
                <input v-model="form.email" :disabled="!!editingId" type="email" placeholder="Email" class="border border-zinc-300 px-3 py-2 disabled:bg-zinc-100" />
                <input v-model="form.first_name" placeholder="First name" class="border border-zinc-300 px-3 py-2" />
                <input v-model="form.last_name"  placeholder="Last name"  class="border border-zinc-300 px-3 py-2" />
                <div>
                    <label class="block text-xs tracking-widest uppercase text-zinc-500 mb-1">Commission (%)</label>
                    <input v-model.number="form.commission_rate" type="number" step="0.5" min="0" max="100" class="w-full border border-zinc-300 px-3 py-2" />
                </div>
                <div>
                    <label class="block text-xs tracking-widest uppercase text-zinc-500 mb-1">Status</label>
                    <select v-model="form.status" class="w-full border border-zinc-300 px-3 py-2">
                        <option value="pending">Pending</option>
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                    </select>
                </div>
            </div>
            <p v-if="error" class="text-sm text-red-600 mt-3">{{ error }}</p>
            <div class="flex justify-end gap-2 mt-4">
                <button @click="cancel" class="px-4 py-2 text-xs tracking-widest uppercase text-zinc-600">Cancel</button>
                <button @click="save" :disabled="saving" class="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50">
                    {{ saving ? 'Saving…' : 'Save' }}
                </button>
            </div>
        </div>

        <div class="bg-white border border-zinc-200">
            <table class="w-full text-sm">
                <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                    <tr>
                        <th class="px-5 py-3 text-left">Code</th>
                        <th class="px-5 py-3 text-left">Owner</th>
                        <th class="px-5 py-3 text-left">Commission</th>
                        <th class="px-5 py-3 text-left">Earnings</th>
                        <th class="px-5 py-3 text-left">Status</th>
                        <th class="px-5 py-3"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">Loading…</td></tr>
                    <tr v-else-if="!affiliates.length"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">No affiliates yet.</td></tr>
                    <tr v-for="a in affiliates" :key="a.id" class="border-t border-zinc-100">
                        <td class="px-5 py-3 font-mono">
                            <router-link :to="`/admin/affiliates/${a.id}`" class="hover:text-gold">{{ a.code }}</router-link>
                        </td>
                        <td class="px-5 py-3">{{ [a.first_name, a.last_name].filter(Boolean).join(' ') || a.email }}</td>
                        <td class="px-5 py-3">{{ a.commission_rate }}%</td>
                        <td class="px-5 py-3">{{ a.total_earnings }} <span class="text-zinc-400 text-[10px]">({{ a.paid_out }} paid)</span></td>
                        <td class="px-5 py-3">
                            <span :class="['text-xs px-2 py-0.5 rounded', {
                                'bg-amber-100 text-amber-700': a.status === 'pending',
                                'bg-emerald-100 text-emerald-700': a.status === 'active',
                                'bg-zinc-100 text-zinc-600': a.status === 'paused',
                            }]">{{ a.status }}</span>
                        </td>
                        <td class="px-5 py-3 text-right">
                            <div class="inline-flex items-center gap-1">
                                <IconButton label="Edit affiliate" @click="startEdit(a)">
                                    <Pencil class="w-4 h-4" />
                                </IconButton>
                                <IconButton label="Delete affiliate" tone="danger" @click="remove(a)">
                                    <Trash2 class="w-4 h-4" />
                                </IconButton>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
