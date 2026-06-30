<script>
import { api } from '../../lib/api.js';
import IconButton from '../components/IconButton.vue';
import { Pencil, Trash2 } from 'lucide-vue-next';

export default {
    name: 'AdminHeadings',
    components: { IconButton, Pencil, Trash2 },
    data() {
        return {
            headings: [],
            loading: true,
            saving: false,
            error: '',
            showForm: false,
            editingId: null,
            form: this.emptyForm(),
        };
    },
    mounted() { this.fetchAll(); },
    methods: {
        emptyForm() {
            return { name: '', handle: '', rank: 0, is_active: true, is_sale: false };
        },
        async fetchAll() {
            this.loading = true;
            try {
                const data = await api.get('/api/admin/headings');
                this.headings = data.headings || [];
            } finally {
                this.loading = false;
            }
        },
        startNew() {
            this.editingId = null;
            this.form = this.emptyForm();
            this.form.rank = (this.headings.at(-1)?.rank ?? 0) + 1;
            this.showForm = true;
            this.error = '';
        },
        startEdit(h) {
            this.editingId = h.id;
            this.form = { name: h.name, handle: h.handle, rank: h.rank, is_active: h.is_active, is_sale: h.is_sale };
            this.showForm = true;
            this.error = '';
        },
        cancel() { this.showForm = false; this.editingId = null; this.error = ''; },
        async save() {
            this.saving = true;
            this.error = '';
            try {
                if (this.editingId) {
                    await api.put(`/api/admin/headings/${this.editingId}`, this.form);
                } else {
                    await api.post('/api/admin/headings', this.form);
                }
                this.cancel();
                await this.fetchAll();
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not save.';
            } finally {
                this.saving = false;
            }
        },
        async remove(h) {
            if (!confirm(`Delete heading "${h.name}"? This also deletes its catalogues.`)) return;
            try {
                await api.del(`/api/admin/headings/${h.id}`);
                await this.fetchAll();
            } catch (e) {
                alert(e.payload?.error || 'Could not delete.');
            }
        },
    },
};
</script>

<template>
    <div>
        <header class="flex items-center justify-between mb-8">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">Navigation</p>
                <h1 class="text-2xl font-semibold">Headings</h1>
            </div>
            <button @click="startNew" class="bg-gold text-white px-5 py-2 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark">New Heading</button>
        </header>

        <div v-if="showForm" class="bg-white border border-gold/30 p-5 mb-6">
            <h2 class="font-semibold mb-3">{{ editingId ? 'Edit heading' : 'New heading' }}</h2>
            <div class="grid grid-cols-2 gap-3">
                <input v-model="form.name"   placeholder="Name (e.g. Women)"     class="border border-zinc-300 px-3 py-2" />
                <input v-model="form.handle" placeholder="Handle (e.g. women)"   class="border border-zinc-300 px-3 py-2" />
                <input v-model.number="form.rank" type="number" placeholder="Rank" class="border border-zinc-300 px-3 py-2" />
                <div class="flex items-center gap-4 px-3 py-2">
                    <label class="flex items-center gap-1 text-sm"><input type="checkbox" v-model="form.is_active" /> Active</label>
                    <label class="flex items-center gap-1 text-sm"><input type="checkbox" v-model="form.is_sale"   /> Sale</label>
                </div>
            </div>
            <p v-if="error" class="text-sm text-red-600 mt-3">{{ error }}</p>
            <div class="flex justify-end gap-2 mt-4">
                <button @click="cancel" class="px-4 py-2 text-xs tracking-widest uppercase text-zinc-600 hover:text-black">Cancel</button>
                <button @click="save" :disabled="saving" class="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50">
                    {{ saving ? 'Saving…' : 'Save' }}
                </button>
            </div>
        </div>

        <div class="bg-white border border-zinc-200">
            <table class="w-full text-sm">
                <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                    <tr>
                        <th class="px-5 py-3 text-left">Heading</th>
                        <th class="px-5 py-3 text-left">Handle</th>
                        <th class="px-5 py-3 text-left">Catalogues</th>
                        <th class="px-5 py-3 text-left">Rank</th>
                        <th class="px-5 py-3 text-left">Active</th>
                        <th class="px-5 py-3 text-left">Sale</th>
                        <th class="px-5 py-3"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="7" class="px-5 py-8 text-center text-zinc-400">Loading…</td></tr>
                    <tr v-else-if="!headings.length"><td colspan="7" class="px-5 py-8 text-center text-zinc-400">No headings yet.</td></tr>
                    <tr v-for="h in headings" :key="h.id" class="border-t border-zinc-100">
                        <td class="px-5 py-3 font-medium">{{ h.name }}</td>
                        <td class="px-5 py-3 font-mono text-xs">{{ h.handle }}</td>
                        <td class="px-5 py-3">{{ h.catalogues_count }}</td>
                        <td class="px-5 py-3">{{ h.rank }}</td>
                        <td class="px-5 py-3">{{ h.is_active ? '✓' : '—' }}</td>
                        <td class="px-5 py-3">{{ h.is_sale ? '★' : '—' }}</td>
                        <td class="px-5 py-3 text-right">
                            <div class="inline-flex items-center gap-1">
                                <IconButton label="Edit heading" @click="startEdit(h)">
                                    <Pencil class="w-4 h-4" />
                                </IconButton>
                                <IconButton label="Delete heading" tone="danger" @click="remove(h)">
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
