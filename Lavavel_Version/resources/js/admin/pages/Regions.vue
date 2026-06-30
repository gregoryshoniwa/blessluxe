<script>
import { api } from '../../lib/api.js';
import IconButton from '../components/IconButton.vue';
import { Pencil, Trash2 } from 'lucide-vue-next';

export default {
    name: 'AdminRegions',
    components: { IconButton, Pencil, Trash2 },
    data() {
        return {
            regions: [], loading: true,
            showForm: false, editingId: null,
            form: { name: '', currency_code: 'usd', countries_csv: '' },
            saving: false, error: '',
        };
    },
    mounted() { this.fetchAll(); },
    methods: {
        async fetchAll() {
            this.loading = true;
            try {
                const data = await api.get('/api/admin/regions');
                this.regions = data.regions || [];
            } finally { this.loading = false; }
        },
        startNew() {
            this.editingId = null;
            this.form = { name: '', currency_code: 'usd', countries_csv: '' };
            this.showForm = true; this.error = '';
        },
        startEdit(r) {
            this.editingId = r.id;
            this.form = { name: r.name, currency_code: r.currency_code, countries_csv: (r.countries || []).join(', ') };
            this.showForm = true; this.error = '';
        },
        cancel() { this.showForm = false; this.editingId = null; this.error = ''; },
        async save() {
            this.saving = true; this.error = '';
            const body = {
                name: this.form.name,
                currency_code: this.form.currency_code,
                countries: this.form.countries_csv.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
            };
            try {
                if (this.editingId) await api.put(`/api/admin/regions/${this.editingId}`, body);
                else                await api.post('/api/admin/regions', body);
                this.cancel();
                await this.fetchAll();
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not save.';
            } finally { this.saving = false; }
        },
        async remove(r) {
            if (!confirm(`Delete region "${r.name}"?`)) return;
            try {
                await api.del(`/api/admin/regions/${r.id}`);
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
                <p class="text-xs tracking-widest uppercase text-zinc-500">Geography</p>
                <h1 class="text-2xl font-semibold">Regions</h1>
            </div>
            <button @click="startNew" class="bg-gold text-white px-5 py-2 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark">New Region</button>
        </header>

        <div v-if="showForm" class="bg-white border border-gold/30 p-5 mb-6">
            <h2 class="font-semibold mb-3">{{ editingId ? 'Edit region' : 'New region' }}</h2>
            <div class="grid grid-cols-2 gap-3">
                <input v-model="form.name" placeholder="Name (e.g. Africa)" class="border border-zinc-300 px-3 py-2" />
                <input v-model="form.currency_code" placeholder="Currency code (e.g. usd)" class="border border-zinc-300 px-3 py-2 lowercase" />
                <textarea v-model="form.countries_csv" placeholder="Country codes, comma-separated (e.g. ZW, ZA, BW)" rows="2" class="border border-zinc-300 px-3 py-2 col-span-2"></textarea>
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
                        <th class="px-5 py-3 text-left">Region</th>
                        <th class="px-5 py-3 text-left">Currency</th>
                        <th class="px-5 py-3 text-left">Countries</th>
                        <th class="px-5 py-3"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="4" class="px-5 py-8 text-center text-zinc-400">Loading…</td></tr>
                    <tr v-else-if="!regions.length"><td colspan="4" class="px-5 py-8 text-center text-zinc-400">No regions yet.</td></tr>
                    <tr v-for="r in regions" :key="r.id" class="border-t border-zinc-100">
                        <td class="px-5 py-3 font-medium">{{ r.name }}</td>
                        <td class="px-5 py-3 uppercase">{{ r.currency_code }}</td>
                        <td class="px-5 py-3 text-xs">{{ (r.countries || []).join(', ') || '—' }}</td>
                        <td class="px-5 py-3 text-right">
                            <div class="inline-flex items-center gap-1">
                                <IconButton label="Edit region" @click="startEdit(r)">
                                    <Pencil class="w-4 h-4" />
                                </IconButton>
                                <IconButton label="Delete region" tone="danger" @click="remove(r)">
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
