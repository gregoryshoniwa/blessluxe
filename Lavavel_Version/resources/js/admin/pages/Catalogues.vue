<script>
import { api } from '../../lib/api.js';
import IconButton from '../components/IconButton.vue';
import { Pencil, Trash2 } from 'lucide-vue-next';

export default {
    name: 'AdminCatalogues',
    components: { IconButton, Pencil, Trash2 },
    data() {
        return {
            catalogues: [],
            headings: [],
            loading: true,
            saving: false,
            error: '',
            showForm: false,
            editingId: null,
            form: { heading_id: '', name: '', handle: '', rank: 0, is_active: true },
        };
    },
    async mounted() {
        const [cat, head] = await Promise.all([
            api.get('/api/admin/catalogues'),
            api.get('/api/admin/headings'),
        ]);
        this.catalogues = cat.catalogues || [];
        this.headings = head.headings || [];
        this.loading = false;
    },
    methods: {
        startNew() {
            this.editingId = null;
            this.form = { heading_id: this.headings[0]?.id || '', name: '', handle: '', rank: 0, is_active: true };
            this.showForm = true; this.error = '';
        },
        startEdit(c) {
            this.editingId = c.id;
            this.form = { heading_id: c.heading_id, name: c.name, handle: c.handle, rank: c.rank, is_active: c.is_active };
            this.showForm = true; this.error = '';
        },
        cancel() { this.showForm = false; this.editingId = null; this.error = ''; },
        async save() {
            this.saving = true; this.error = '';
            try {
                if (this.editingId) await api.put(`/api/admin/catalogues/${this.editingId}`, this.form);
                else                await api.post('/api/admin/catalogues', this.form);
                this.cancel();
                const d = await api.get('/api/admin/catalogues');
                this.catalogues = d.catalogues || [];
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not save.';
            } finally { this.saving = false; }
        },
        async remove(c) {
            if (!confirm(`Delete catalogue "${c.name}"? Products will be unlinked.`)) return;
            try {
                await api.del(`/api/admin/catalogues/${c.id}`);
                const d = await api.get('/api/admin/catalogues');
                this.catalogues = d.catalogues || [];
            } catch (e) { alert(e.payload?.error || 'Could not delete.'); }
        },
    },
};
</script>

<template>
    <div>
        <header class="flex items-center justify-between mb-8">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">Navigation</p>
                <h1 class="text-2xl font-semibold">Catalogues</h1>
            </div>
            <button @click="startNew" class="bg-gold text-white px-5 py-2 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark">New Catalogue</button>
        </header>

        <div v-if="showForm" class="bg-white border border-gold/30 p-5 mb-6">
            <h2 class="font-semibold mb-3">{{ editingId ? 'Edit catalogue' : 'New catalogue' }}</h2>
            <div class="grid grid-cols-2 gap-3">
                <select v-model="form.heading_id" class="border border-zinc-300 px-3 py-2">
                    <option value="" disabled>Select heading…</option>
                    <option v-for="h in headings" :key="h.id" :value="h.id">{{ h.name }}</option>
                </select>
                <input v-model="form.name"   placeholder="Name (e.g. Dresses)"  class="border border-zinc-300 px-3 py-2" />
                <input v-model="form.handle" placeholder="Handle (e.g. dresses)" class="border border-zinc-300 px-3 py-2" />
                <input v-model.number="form.rank" type="number" placeholder="Rank" class="border border-zinc-300 px-3 py-2" />
                <label class="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" v-model="form.is_active" /> Active</label>
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
                        <th class="px-5 py-3 text-left">Catalogue</th>
                        <th class="px-5 py-3 text-left">Heading</th>
                        <th class="px-5 py-3 text-left">Products</th>
                        <th class="px-5 py-3 text-left">Rank</th>
                        <th class="px-5 py-3"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="5" class="px-5 py-8 text-center text-zinc-400">Loading…</td></tr>
                    <tr v-else-if="!catalogues.length"><td colspan="5" class="px-5 py-8 text-center text-zinc-400">No catalogues yet.</td></tr>
                    <tr v-for="c in catalogues" :key="c.id" class="border-t border-zinc-100">
                        <td class="px-5 py-3 font-medium">{{ c.name }} <span class="font-mono text-[10px] text-zinc-400 ml-1">/{{ c.handle }}</span></td>
                        <td class="px-5 py-3">{{ c.heading_name }}</td>
                        <td class="px-5 py-3">{{ c.products_count }}</td>
                        <td class="px-5 py-3">{{ c.rank }}</td>
                        <td class="px-5 py-3 text-right">
                            <div class="inline-flex items-center gap-1">
                                <IconButton label="Edit catalogue" @click="startEdit(c)">
                                    <Pencil class="w-4 h-4" />
                                </IconButton>
                                <IconButton label="Delete catalogue" tone="danger" @click="remove(c)">
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
