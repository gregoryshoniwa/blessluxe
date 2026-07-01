<script>
import { api } from '../../lib/api.js';
import IconButton from '../components/IconButton.vue';
import { Pencil, Trash2 } from 'lucide-vue-next';

export default {
    name: 'AdminProducts',
    components: { IconButton, Pencil, Trash2 },
    data() {
        return {
            products: [], pagination: null, loading: true,
            q: '', page: 1,
            saving: false, error: '',
            showForm: false,
            form: { title: '', handle: '', subtitle: '', description: '', status: 'draft', price: 0, catalogue_ids: [] },
            catalogues: [],
        };
    },
    mounted() {
        this.fetchAll();
        api.get('/api/admin/catalogues').then((d) => { this.catalogues = d.catalogues || []; });
    },
    methods: {
        async fetchAll() {
            this.loading = true;
            try {
                const params = new URLSearchParams({ page: this.page, limit: 25 });
                if (this.q) params.set('q', this.q);
                const data = await api.get(`/api/admin/products?${params}`);
                this.products = data.products || [];
                this.pagination = data.pagination;
            } finally { this.loading = false; }
        },
        startNew() {
            this.form = { title: '', handle: '', subtitle: '', description: '', status: 'draft', price: 0, catalogue_ids: [] };
            this.showForm = true; this.error = '';
        },
        cancel() { this.showForm = false; this.error = ''; },
        async save() {
            this.saving = true; this.error = '';
            try {
                await api.post('/api/admin/products', this.form);
                this.cancel();
                await this.fetchAll();
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not save.';
            } finally { this.saving = false; }
        },
        async remove(p) {
            if (!confirm(`Delete "${p.title}"? This removes its variants too.`)) return;
            try {
                await api.del(`/api/admin/products/${p.id}`);
                await this.fetchAll();
            } catch (e) { alert(e.payload?.error || 'Could not delete.'); }
        },
        slugify() {
            if (!this.form.handle && this.form.title) {
                this.form.handle = this.form.title.toLowerCase().trim()
                    .replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
            }
        },
    },
};
</script>

<template>
    <div>
        <header class="flex items-center justify-between mb-8">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">Catalogue</p>
                <h1 class="text-2xl font-semibold">Products</h1>
            </div>
            <button @click="startNew" class="bg-gold text-white px-5 py-2 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark">New Product</button>
        </header>

        <div class="mb-4 flex gap-2">
            <input v-model="q" @keyup.enter="page = 1; fetchAll()" placeholder="Search title or handle…" class="border border-zinc-300 px-3 py-2 text-sm w-72" />
            <button @click="page = 1; fetchAll()" class="border border-zinc-300 px-4 py-2 text-xs tracking-widest uppercase hover:bg-zinc-100">Search</button>
        </div>

        <div v-if="showForm" class="bg-white border border-gold/30 p-5 mb-6">
            <h2 class="font-semibold mb-3">New product</h2>
            <div class="grid grid-cols-2 gap-3">
                <input v-model="form.title" @blur="slugify" placeholder="Title" class="border border-zinc-300 px-3 py-2" />
                <input v-model="form.handle" placeholder="Handle (kebab-case)" class="border border-zinc-300 px-3 py-2 font-mono" />
                <input v-model="form.subtitle" placeholder="Subtitle (optional)" class="border border-zinc-300 px-3 py-2 col-span-2" />
                <textarea v-model="form.description" placeholder="Description" class="border border-zinc-300 px-3 py-2 col-span-2" rows="3"></textarea>
                <select v-model="form.status" class="border border-zinc-300 px-3 py-2">
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                </select>
                <input v-model.number="form.price" type="number" min="0" placeholder="Price (cents — e.g. 34900)" class="border border-zinc-300 px-3 py-2" />
                <div class="col-span-2">
                    <p class="text-xs tracking-widest uppercase text-zinc-500 mb-1">Catalogues</p>
                    <div class="flex flex-wrap gap-2">
                        <label v-for="c in catalogues" :key="c.id" class="flex items-center gap-1 text-sm border border-zinc-200 px-2 py-1 cursor-pointer">
                            <input type="checkbox" :value="c.id" v-model="form.catalogue_ids" />
                            {{ c.name }}
                        </label>
                    </div>
                </div>
            </div>
            <p v-if="error" class="text-sm text-red-600 mt-3">{{ error }}</p>
            <div class="flex justify-end gap-2 mt-4">
                <button @click="cancel" class="px-4 py-2 text-xs tracking-widest uppercase text-zinc-600">Cancel</button>
                <button @click="save" :disabled="saving" class="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50">
                    {{ saving ? 'Saving…' : 'Create Product' }}
                </button>
            </div>
        </div>

        <div class="bg-white border border-zinc-200">
            <table class="w-full text-sm">
                <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                    <tr>
                        <th class="px-5 py-3 text-left">Title</th>
                        <th class="px-5 py-3 text-left">Catalogues</th>
                        <th class="px-5 py-3 text-left">Variants</th>
                        <th class="px-5 py-3 text-left">Status</th>
                        <th class="px-5 py-3 text-left">Updated</th>
                        <th class="px-5 py-3"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">Loading…</td></tr>
                    <tr v-else-if="!products.length"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">No products.</td></tr>
                    <tr v-for="p in products" :key="p.id" class="border-t border-zinc-100">
                        <td class="px-5 py-3 font-medium">
                            <router-link :to="`/admin/products/${p.id}`" class="hover:text-gold transition-colors">
                                {{ p.title }}
                            </router-link>
                            <span class="font-mono text-[10px] text-zinc-400 ml-1">/{{ p.handle }}</span>
                        </td>
                        <td class="px-5 py-3 text-xs">{{ p.catalogues.join(', ') || '—' }}</td>
                        <td class="px-5 py-3">{{ p.variants_count }}</td>
                        <td class="px-5 py-3">
                            <span :class="['text-xs px-2 py-0.5 rounded', p.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600']">{{ p.status }}</span>
                        </td>
                        <td class="px-5 py-3 text-zinc-500 text-xs">{{ p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '—' }}</td>
                        <td class="px-5 py-3 text-right">
                            <div class="inline-flex items-center gap-1">
                                <router-link :to="`/admin/products/${p.id}`" class="inline-flex items-center justify-center w-8 h-8 rounded text-zinc-500 hover:text-gold hover:bg-gold/10 transition-colors" title="Edit product" :aria-label="`Edit ${p.title}`">
                                    <Pencil class="w-4 h-4" />
                                </router-link>
                                <IconButton label="Delete product" tone="danger" @click="remove(p)">
                                    <Trash2 class="w-4 h-4" />
                                </IconButton>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-if="pagination && pagination.last_page > 1" class="flex items-center justify-between mt-4 text-sm">
            <p class="text-zinc-500">Page {{ pagination.page }} of {{ pagination.last_page }} · {{ pagination.total }} products</p>
            <div class="flex gap-2">
                <button :disabled="pagination.page <= 1" @click="page--; fetchAll()" class="border border-zinc-300 px-3 py-1 disabled:opacity-40">Prev</button>
                <button :disabled="pagination.page >= pagination.last_page" @click="page++; fetchAll()" class="border border-zinc-300 px-3 py-1 disabled:opacity-40">Next</button>
            </div>
        </div>
    </div>
</template>
