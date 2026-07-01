<script>
import { api } from '../../lib/api.js';
import IconButton from '../components/IconButton.vue';
import { Pencil, Trash2, Plus } from 'lucide-vue-next';

export default {
    name: 'AdminFaqs',
    components: { IconButton, Pencil, Trash2, Plus },
    data() {
        return {
            faqs: [],
            categories: [],
            loading: true,
            showForm: false,
            editingId: null,
            form: this.emptyForm(),
            saving: false,
            error: '',
        };
    },
    computed: {
        grouped() {
            // Group by category for the table — easier to scan when there are
            // dozens of FAQs split across "Sizing", "Shipping", "Returns" etc.
            const map = {};
            for (const f of this.faqs) {
                const key = f.category || 'General';
                (map[key] ||= []).push(f);
            }
            return Object.entries(map).map(([category, items]) => ({ category, items }));
        },
    },
    mounted() { this.fetchAll(); },
    methods: {
        emptyForm() {
            return { question: '', answer: '', category: '', sort_order: 0, is_active: true };
        },
        async fetchAll() {
            this.loading = true;
            try {
                const d = await api.get('/api/admin/faqs');
                this.faqs = d.faqs;
                this.categories = d.categories;
            } finally { this.loading = false; }
        },
        startNew(category = '') {
            this.editingId = null;
            this.form = this.emptyForm();
            this.form.category = category;
            this.form.sort_order = (this.faqs.filter((f) => f.category === category).at(-1)?.sort_order ?? 0) + 1;
            this.showForm = true; this.error = '';
        },
        startEdit(f) {
            this.editingId = f.id;
            this.form = { question: f.question, answer: f.answer, category: f.category || '', sort_order: f.sort_order, is_active: f.is_active };
            this.showForm = true; this.error = '';
        },
        cancel() { this.showForm = false; this.error = ''; },
        async save() {
            this.saving = true; this.error = '';
            try {
                if (this.editingId) {
                    await api.put(`/api/admin/faqs/${this.editingId}`, this.form);
                } else {
                    await api.post('/api/admin/faqs', this.form);
                }
                this.showForm = false;
                await this.fetchAll();
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not save.';
            } finally { this.saving = false; }
        },
        async remove(f) {
            if (!confirm('Delete this FAQ?')) return;
            await api.del(`/api/admin/faqs/${f.id}`);
            await this.fetchAll();
        },
    },
};
</script>

<template>
    <div>
        <header class="flex items-center justify-between mb-8">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">Storefront content</p>
                <h1 class="text-2xl font-semibold">FAQs</h1>
            </div>
            <button @click="startNew()" class="bg-gold text-white px-5 py-2 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark inline-flex items-center gap-2">
                <Plus class="w-4 h-4" /> New FAQ
            </button>
        </header>

        <section v-if="showForm" class="bg-white border border-gold/30 p-5 mb-6">
            <h2 class="font-semibold mb-3">{{ editingId ? 'Edit FAQ' : 'New FAQ' }}</h2>
            <div class="grid grid-cols-2 gap-3">
                <input v-model="form.question" placeholder="Question" class="border border-zinc-300 px-3 py-2 col-span-2" />
                <textarea v-model="form.answer" placeholder="Answer (supports plain text)" rows="4" class="border border-zinc-300 px-3 py-2 col-span-2"></textarea>
                <input v-model="form.category" placeholder="Category (e.g. Shipping)" list="faq-categories" class="border border-zinc-300 px-3 py-2" />
                <datalist id="faq-categories">
                    <option v-for="c in categories" :key="c" :value="c" />
                </datalist>
                <input v-model.number="form.sort_order" type="number" placeholder="Sort order" class="border border-zinc-300 px-3 py-2" />
                <label class="col-span-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" v-model="form.is_active" /> Show on storefront
                </label>
            </div>
            <p v-if="error" class="text-sm text-red-600 mt-3">{{ error }}</p>
            <div class="flex justify-end gap-2 mt-4">
                <button @click="cancel" class="px-4 py-2 text-xs tracking-widest uppercase text-zinc-600">Cancel</button>
                <button @click="save" :disabled="saving" class="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50">
                    {{ saving ? 'Saving…' : 'Save' }}
                </button>
            </div>
        </section>

        <div v-if="loading" class="text-zinc-400 text-sm">Loading…</div>
        <div v-else-if="!faqs.length" class="bg-white border border-zinc-200 p-12 text-center text-zinc-400">
            No FAQs yet. Add your first answer to seed the storefront help page.
        </div>

        <div v-else class="space-y-6">
            <section v-for="g in grouped" :key="g.category" class="bg-white border border-zinc-200">
                <header class="px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
                    <h2 class="font-semibold">{{ g.category }}</h2>
                    <button @click="startNew(g.category === 'General' ? '' : g.category)" class="text-xs tracking-widest uppercase text-zinc-500 hover:text-gold inline-flex items-center gap-1">
                        <Plus class="w-3 h-3" /> Add
                    </button>
                </header>
                <table class="w-full text-sm">
                    <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                        <tr>
                            <th class="px-5 py-2 text-left">Question</th>
                            <th class="px-5 py-2 text-left">Order</th>
                            <th class="px-5 py-2 text-left">Visible</th>
                            <th class="px-5 py-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="f in g.items" :key="f.id" class="border-t border-zinc-100 align-top">
                            <td class="px-5 py-3">
                                <p class="font-medium">{{ f.question }}</p>
                                <p class="text-xs text-zinc-500 line-clamp-2 mt-1">{{ f.answer }}</p>
                            </td>
                            <td class="px-5 py-3">#{{ f.sort_order }}</td>
                            <td class="px-5 py-3">
                                <span :class="['text-xs px-2 py-0.5 rounded', f.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600']">
                                    {{ f.is_active ? 'shown' : 'hidden' }}
                                </span>
                            </td>
                            <td class="px-5 py-3 text-right">
                                <div class="inline-flex items-center gap-1">
                                    <IconButton label="Edit FAQ" @click="startEdit(f)">
                                        <Pencil class="w-4 h-4" />
                                    </IconButton>
                                    <IconButton label="Delete FAQ" tone="danger" @click="remove(f)">
                                        <Trash2 class="w-4 h-4" />
                                    </IconButton>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    </div>
</template>
