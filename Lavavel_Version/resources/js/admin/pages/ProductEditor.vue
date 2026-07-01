<script>
import { api } from '../../lib/api.js';
import IconButton from '../components/IconButton.vue';
import { ArrowLeft, Trash2, Pencil, Upload, Image as ImageIcon, Plus, Star } from 'lucide-vue-next';

export default {
    name: 'AdminProductEditor',
    components: { IconButton, ArrowLeft, Trash2, Pencil, Upload, ImageIcon, Plus, Star },
    data() {
        return {
            loading: true,
            saving: false,
            error: '',
            saved: false,
            product: null,
            catalogues: [],
            form: { title: '', handle: '', subtitle: '', description: '', status: 'draft', catalogue_ids: [] },
            // Variant inline state
            newVariant: this.emptyVariant(),
            editingVariantId: null,
            variantForm: this.emptyVariant(),
            // Image upload
            uploading: false,
            uploadError: '',
            // AI
            aiBusy: false,
            aiError: '',
        };
    },
    computed: {
        id() { return this.$route.params.id; },
    },
    async mounted() {
        await this.fetchAll();
    },
    methods: {
        emptyVariant() {
            return { title: '', sku: '', manage_inventory: true, inventory_quantity: 0, price: 0 };
        },
        async generateDescription() {
            if (!this.form.title) {
                this.aiError = 'Add a title first.';
                return;
            }
            this.aiBusy = true;
            this.aiError = '';
            try {
                const r = await api.post('/api/admin/ai/describe-product', {
                    title: this.form.title,
                    subtitle: this.form.subtitle,
                    bullets: this.form.description ? this.form.description.split('\n').filter(Boolean) : [],
                });
                this.form.description = r.description;
            } catch (e) {
                this.aiError = e.payload?.error || 'AI could not write a description.';
            } finally {
                this.aiBusy = false;
            }
        },
        async fetchAll() {
            this.loading = true;
            try {
                const [pRes, cRes] = await Promise.all([
                    api.get(`/api/admin/products/${this.id}`),
                    api.get('/api/admin/catalogues'),
                ]);
                this.product = pRes.product;
                this.catalogues = cRes.catalogues || [];
                this.form = {
                    title:       this.product.title,
                    handle:      this.product.handle,
                    subtitle:    this.product.subtitle    || '',
                    description: this.product.description || '',
                    status:      this.product.status,
                    catalogue_ids: this.product.catalogue_ids || [],
                };
            } catch (e) {
                this.error = e.payload?.error || 'Product not found.';
            } finally {
                this.loading = false;
            }
        },
        async save() {
            this.saving = true; this.error = ''; this.saved = false;
            try {
                await api.put(`/api/admin/products/${this.id}`, this.form);
                this.saved = true;
                setTimeout(() => { this.saved = false; }, 1800);
                await this.fetchAll();
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not save.';
            } finally {
                this.saving = false;
            }
        },
        async addVariant() {
            if (!this.newVariant.title) return;
            try {
                await api.post(`/api/admin/products/${this.id}/variants`, this.newVariant);
                this.newVariant = this.emptyVariant();
                await this.fetchAll();
            } catch (e) {
                alert(e.payload?.error || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0]) || 'Could not add variant.');
            }
        },
        startEditVariant(v) {
            this.editingVariantId = v.id;
            this.variantForm = {
                title: v.title,
                sku: v.sku || '',
                manage_inventory: v.manage_inventory,
                inventory_quantity: v.inventory_quantity,
                price: v.price ?? 0,
            };
        },
        cancelEditVariant() { this.editingVariantId = null; },
        async saveVariant(v) {
            try {
                await api.put(`/api/admin/products/${this.id}/variants/${v.id}`, this.variantForm);
                this.editingVariantId = null;
                await this.fetchAll();
            } catch (e) {
                alert(e.payload?.error || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0]) || 'Could not save.');
            }
        },
        async removeVariant(v) {
            if (!confirm(`Delete variant "${v.title}"?`)) return;
            await api.del(`/api/admin/products/${this.id}/variants/${v.id}`);
            await this.fetchAll();
        },
        async uploadImage(file) {
            if (!file) return;
            this.uploading = true; this.uploadError = '';
            const fd = new FormData();
            fd.append('image', file);
            try {
                await api.post(`/api/admin/products/${this.id}/images`, fd);
                await this.fetchAll();
            } catch (e) {
                this.uploadError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Upload failed.';
            } finally {
                this.uploading = false;
                this.$refs.fileInput.value = '';
            }
        },
        async removeImage(image) {
            if (!confirm('Delete this image?')) return;
            await api.del(`/api/admin/products/${this.id}/images/${image.id}`);
            await this.fetchAll();
        },
        async makeThumbnail(image) {
            await api.put(`/api/admin/products/${this.id}`, { thumbnail: image.url });
            await this.fetchAll();
        },
        money(cents) { return cents != null ? `$${(cents / 100).toFixed(2)}` : '—'; },
    },
};
</script>

<template>
    <div>
        <router-link to="/admin/products" class="text-xs tracking-widest uppercase text-zinc-500 hover:text-gold inline-flex items-center gap-1 mb-4">
            <ArrowLeft class="w-3 h-3" /> All products
        </router-link>

        <div v-if="loading" class="text-zinc-400 text-sm">Loading…</div>

        <div v-else-if="error && !product" class="text-center py-16">
            <h1 class="text-xl font-semibold mb-2">{{ error }}</h1>
            <router-link to="/admin/products" class="text-gold underline">Back</router-link>
        </div>

        <div v-else-if="product">
            <header class="flex items-start justify-between mb-8">
                <div>
                    <p class="text-xs tracking-widest uppercase text-zinc-500">Edit product</p>
                    <h1 class="text-2xl font-semibold">{{ product.title }}</h1>
                    <p class="text-xs text-zinc-500 mt-1 font-mono">{{ product.handle }}</p>
                </div>
                <a :href="`/shop/${product.handle}`" target="_blank" class="text-xs tracking-widest uppercase text-zinc-500 hover:text-gold">View on storefront ↗</a>
            </header>

            <!-- Details -->
            <section class="bg-white border border-zinc-200 p-5 mb-6">
                <h2 class="font-semibold mb-3">Details</h2>
                <div class="grid grid-cols-2 gap-3">
                    <input v-model="form.title" placeholder="Title" class="border border-zinc-300 px-3 py-2" />
                    <input v-model="form.handle" placeholder="Handle" class="border border-zinc-300 px-3 py-2 font-mono" />
                    <input v-model="form.subtitle" placeholder="Subtitle" class="border border-zinc-300 px-3 py-2 col-span-2" />
                    <div class="col-span-2 relative">
                        <textarea v-model="form.description" placeholder="Description" rows="4" class="border border-zinc-300 px-3 py-2 w-full"></textarea>
                        <button type="button" @click="generateDescription" :disabled="aiBusy" class="absolute top-2 right-2 text-[10px] tracking-widest uppercase bg-gradient-to-r from-amber-500 to-amber-700 text-white px-3 py-1 disabled:opacity-50">
                            {{ aiBusy ? '…' : '✨ LUXE write' }}
                        </button>
                        <p v-if="aiError" class="mt-1 text-xs text-red-600">{{ aiError }}</p>
                    </div>
                    <select v-model="form.status" class="border border-zinc-300 px-3 py-2">
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                    </select>
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
                <div class="flex items-center justify-end gap-3 mt-4">
                    <span v-if="saved" class="text-sm text-emerald-600">Saved ✓</span>
                    <button @click="save" :disabled="saving" class="bg-gold text-white px-5 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50">
                        {{ saving ? 'Saving…' : 'Save Details' }}
                    </button>
                </div>
            </section>

            <!-- Images -->
            <section class="bg-white border border-zinc-200 p-5 mb-6">
                <header class="flex items-center justify-between mb-4">
                    <h2 class="font-semibold flex items-center gap-2"><ImageIcon class="w-4 h-4" /> Images</h2>
                    <label class="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark cursor-pointer inline-flex items-center gap-2">
                        <Upload class="w-4 h-4" />
                        {{ uploading ? 'Uploading…' : 'Upload' }}
                        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="uploadImage($event.target.files[0])" :disabled="uploading" />
                    </label>
                </header>
                <p v-if="uploadError" class="text-sm text-red-600 mb-3">{{ uploadError }}</p>
                <p v-if="!product.images.length" class="text-sm text-zinc-400 py-6 text-center">No images yet. Upload to populate the storefront gallery.</p>
                <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    <div v-for="img in product.images" :key="img.id" class="relative group border border-zinc-200 bg-zinc-50 overflow-hidden">
                        <img :src="img.url" :alt="product.title" class="w-full aspect-[3/4] object-cover object-top" />
                        <span
                            v-if="product.thumbnail === img.url"
                            class="absolute top-2 left-2 bg-gold text-white text-[10px] tracking-widest uppercase px-2 py-0.5"
                        >
                            <Star class="w-3 h-3 inline -mt-0.5 mr-0.5" /> Primary
                        </span>
                        <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2 gap-1">
                            <IconButton v-if="product.thumbnail !== img.url" label="Set as primary" tone="warning" @click="makeThumbnail(img)">
                                <Star class="w-4 h-4 text-white" />
                            </IconButton>
                            <IconButton label="Delete image" tone="danger" @click="removeImage(img)">
                                <Trash2 class="w-4 h-4 text-white" />
                            </IconButton>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Variants -->
            <section class="bg-white border border-zinc-200">
                <header class="px-5 py-3 border-b border-zinc-200">
                    <h2 class="font-semibold">Variants</h2>
                </header>

                <table class="w-full text-sm">
                    <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                        <tr>
                            <th class="px-5 py-3 text-left">Title</th>
                            <th class="px-5 py-3 text-left">SKU</th>
                            <th class="px-5 py-3 text-left">Stock</th>
                            <th class="px-5 py-3 text-left">Cost</th>
                            <th class="px-5 py-3 text-left">Price</th>
                            <th class="px-5 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="v in product.variants" :key="v.id" class="border-t border-zinc-100">
                            <template v-if="editingVariantId === v.id">
                                <td class="px-5 py-3"><input v-model="variantForm.title" class="border border-zinc-300 px-2 py-1 w-full" /></td>
                                <td class="px-5 py-3"><input v-model="variantForm.sku" class="border border-zinc-300 px-2 py-1 w-full font-mono text-xs" /></td>
                                <td class="px-5 py-3"><input v-model.number="variantForm.inventory_quantity" type="number" min="0" class="border border-zinc-300 px-2 py-1 w-20" /></td>
                                <td class="px-5 py-3"><input v-model.number="variantForm.cost_price" type="number" min="0" placeholder="cents" class="border border-zinc-300 px-2 py-1 w-24 font-mono" /></td>
                                <td class="px-5 py-3"><input v-model.number="variantForm.price" type="number" min="0" placeholder="cents" class="border border-zinc-300 px-2 py-1 w-24 font-mono" /></td>
                                <td class="px-5 py-3 text-right">
                                    <button @click="saveVariant(v)" class="text-xs tracking-widest uppercase text-emerald-600 hover:text-emerald-800 mr-2">Save</button>
                                    <button @click="cancelEditVariant" class="text-xs tracking-widest uppercase text-zinc-500 hover:text-black">Cancel</button>
                                </td>
                            </template>
                            <template v-else>
                                <td class="px-5 py-3 font-medium">{{ v.title }}</td>
                                <td class="px-5 py-3 font-mono text-xs">{{ v.sku || '—' }}</td>
                                <td :class="['px-5 py-3', v.inventory_quantity <= 5 ? 'text-red-600' : '']">
                                    {{ v.manage_inventory ? v.inventory_quantity : '—' }}
                                </td>
                                <td class="px-5 py-3">{{ money(v.cost_price) }}</td>
                                <td class="px-5 py-3">{{ money(v.price) }}</td>
                                <td class="px-5 py-3 text-right">
                                    <div class="inline-flex items-center gap-1">
                                        <IconButton label="Edit variant" @click="startEditVariant(v)">
                                            <Pencil class="w-4 h-4" />
                                        </IconButton>
                                        <IconButton label="Delete variant" tone="danger" @click="removeVariant(v)">
                                            <Trash2 class="w-4 h-4" />
                                        </IconButton>
                                    </div>
                                </td>
                            </template>
                        </tr>

                        <!-- Add row -->
                        <tr class="border-t border-zinc-100 bg-zinc-50/50">
                            <td class="px-5 py-3"><input v-model="newVariant.title" placeholder="e.g. M" class="border border-zinc-300 px-2 py-1 w-full" /></td>
                            <td class="px-5 py-3"><input v-model="newVariant.sku" placeholder="(optional)" class="border border-zinc-300 px-2 py-1 w-full font-mono text-xs" /></td>
                            <td class="px-5 py-3"><input v-model.number="newVariant.inventory_quantity" type="number" min="0" class="border border-zinc-300 px-2 py-1 w-20" /></td>
                            <td class="px-5 py-3"></td>
                            <td class="px-5 py-3"><input v-model.number="newVariant.price" type="number" min="0" placeholder="cents" class="border border-zinc-300 px-2 py-1 w-24 font-mono" /></td>
                            <td class="px-5 py-3 text-right">
                                <IconButton label="Add variant" tone="positive" @click="addVariant">
                                    <Plus class="w-4 h-4" />
                                </IconButton>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    </div>
</template>
