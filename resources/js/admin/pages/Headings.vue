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
            file: null,
            removeImage: false,
        };
    },
    mounted() { this.fetchAll(); },
    computed: {
        // What the card will look like: freshly picked file > existing image.
        imagePreview() {
            if (this.file) return URL.createObjectURL(this.file);
            if (this.removeImage) return null;
            return this.form.image_url || null;
        },
    },
    methods: {
        emptyForm() {
            return { name: '', handle: '', rank: 0, is_active: true, is_sale: false, image_url: null };
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
            this.file = null;
            this.removeImage = false;
            this.showForm = true;
            this.error = '';
        },
        startEdit(h) {
            this.editingId = h.id;
            this.form = { name: h.name, handle: h.handle, rank: h.rank, is_active: h.is_active, is_sale: h.is_sale, image_url: h.image_url };
            this.file = null;
            this.removeImage = false;
            this.showForm = true;
            this.error = '';
        },
        onFilePick(e) {
            this.file = e.target.files?.[0] || null;
            if (this.file) this.removeImage = false;
        },
        clearImage() {
            this.file = null;
            this.removeImage = true;
        },
        cancel() { this.showForm = false; this.editingId = null; this.error = ''; },
        async save() {
            this.saving = true;
            this.error = '';
            try {
                const fd = new FormData();
                for (const k of ['name', 'handle', 'rank', 'is_active', 'is_sale']) {
                    const v = this.form[k];
                    if (v === null || v === undefined || v === '') continue;
                    fd.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : v);
                }
                if (this.file) fd.append('image_file', this.file);
                if (this.removeImage) fd.append('remove_image', '1');
                // Laravel doesn't honour FormData for PUT — use POST + _method override.
                if (this.editingId) fd.append('_method', 'PUT');
                const path = this.editingId ? `/api/admin/headings/${this.editingId}` : '/api/admin/headings';
                await api.post(path, fd);
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
            <!-- Card image — shown on the storefront "Shop By Category" tile -->
            <div class="mt-3 flex items-center gap-4">
                <div class="w-20 h-[6.5rem] shrink-0 border border-zinc-200 bg-zinc-50 overflow-hidden flex items-center justify-center">
                    <img v-if="imagePreview" :src="imagePreview" alt="Card image preview" class="w-full h-full object-cover" />
                    <span v-else class="text-[10px] text-zinc-400 text-center px-1">No card image</span>
                </div>
                <div class="text-sm">
                    <p class="text-xs tracking-widest uppercase text-zinc-500 mb-1">Category card image</p>
                    <input type="file" accept="image/*" @change="onFilePick" class="text-xs" />
                    <button
                        v-if="imagePreview"
                        type="button"
                        @click="clearImage"
                        class="block mt-1 text-xs text-red-600 hover:underline"
                    >Remove image</button>
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
                        <th class="px-5 py-3 text-left">Image</th>
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
                    <tr v-if="loading"><td colspan="8" class="px-5 py-8 text-center text-zinc-400">Loading…</td></tr>
                    <tr v-else-if="!headings.length"><td colspan="8" class="px-5 py-8 text-center text-zinc-400">No headings yet.</td></tr>
                    <tr v-for="h in headings" :key="h.id" class="border-t border-zinc-100">
                        <td class="px-5 py-3">
                            <img v-if="h.image_url" :src="h.image_url" :alt="h.name" class="w-10 h-12 object-cover border border-zinc-200" />
                            <span v-else class="text-zinc-300">—</span>
                        </td>
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
