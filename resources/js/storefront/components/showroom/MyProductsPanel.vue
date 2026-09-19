<script>
import { api } from '../../../lib/api.js';
import { confirmDialog, toast } from '../../../lib/dialog.js';

/**
 * Show Room → My Products.
 *
 * The customer photographs their own merch (caps, t-shirts, totes...) and
 * we digitise it into a clean catalogue-style render — the digital version
 * pairs with their logos in Studio. Grid with edit drawer (colour /
 * material / angle / freeform instruction → re-render), download, delete.
 */
const CATEGORIES = [
    'Cap', 'Beanie', 'Bucket hat', 'T-Shirt', 'Polo', 'Dress shirt', 'Hoodie', 'Sweater',
    'Jacket', 'Vest', 'Tracksuit', 'Apron', 'Chef coat', 'Safety vest', 'Scrubs', 'Overalls',
    'Tote bag', 'Backpack', 'Duffel bag', 'Mug', 'Water bottle', 'Notebook', 'Other',
];

export default {
    name: 'MyProductsPanel',
    data() {
        return {
            customer: undefined,
            products: [],
            loadingList: true,
            categories: CATEGORIES,

            // Creation form
            files: [],
            previews: [],
            form: { name: '', category: '', prompt: '' },
            creating: false,
            createError: '',
            showCreate: false,

            // Edit drawer
            editing: null,
            editForm: this.blankEdit(),
            savingEdit: false,
            editError: '',
        };
    },
    async mounted() {
        try {
            const d = await api.get('/api/account/me');
            this.customer = d.customer || null;
        } catch { this.customer = null; }
        if (this.customer) await this.fetchProducts();
        this.loadingList = false;
    },
    methods: {
        blankEdit() {
            return { name: '', color: '', material: '', angle: '', instruction: '' };
        },
        async fetchProducts() {
            try {
                const d = await api.get('/api/account/my-products');
                this.products = d.products || [];
            } catch { /* keep what we had */ }
        },
        pickFiles(e) {
            const incoming = Array.from(e.target.files || []).slice(0, 5 - this.files.length);
            for (const f of incoming) {
                this.files.push(f);
                this.previews.push(URL.createObjectURL(f));
            }
            e.target.value = '';
        },
        removeFile(i) {
            URL.revokeObjectURL(this.previews[i]);
            this.files.splice(i, 1);
            this.previews.splice(i, 1);
        },
        async create() {
            if (!this.files.length) { this.createError = 'Add at least one photo of your product.'; return; }
            this.creating = true;
            this.createError = '';
            try {
                const fd = new FormData();
                for (const k of ['name', 'category', 'prompt']) {
                    if (this.form[k]) fd.append(k, this.form[k]);
                }
                this.files.forEach((f) => fd.append('images[]', f));
                const d = await api.post('/api/account/my-products', fd);
                this.products.unshift(d.product);
                this.previews.forEach((p) => URL.revokeObjectURL(p));
                this.files = []; this.previews = [];
                this.form = { name: '', category: '', prompt: '' };
                this.showCreate = false;
            } catch (e) {
                this.createError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not digitise the product — please try again.';
            } finally {
                this.creating = false;
            }
        },
        startEdit(p) {
            this.editing = p;
            this.editForm = { ...this.blankEdit(), name: p.name || '' };
            this.editError = '';
        },
        closeEdit() { this.editing = null; this.editError = ''; },
        async applyEdit() {
            this.savingEdit = true;
            this.editError = '';
            try {
                const body = {
                    name: this.editForm.name,
                    instruction: this.editForm.instruction || null,
                    attributes: {
                        color:    this.editForm.color    || null,
                        material: this.editForm.material || null,
                        angle:    this.editForm.angle    || null,
                    },
                };
                const d = await api.put(`/api/account/my-products/${this.editing.id}`, body);
                const idx = this.products.findIndex((x) => x.id === this.editing.id);
                if (idx >= 0) this.products[idx] = d.product;
                this.editing = d.product;
                this.editForm = { ...this.blankEdit(), name: d.product.name || '' };
            } catch (e) {
                this.editError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not update the product.';
            } finally {
                this.savingEdit = false;
            }
        },
        async remove(p) {
            if (!await confirmDialog({ title: `Delete "${p.name || 'this product'}"? This cannot be undone.`, confirmLabel: 'Delete', tone: 'danger' })) return;
            try {
                await api.del(`/api/account/my-products/${p.id}`);
                this.products = this.products.filter((x) => x.id !== p.id);
                if (this.editing?.id === p.id) this.closeEdit();
            } catch (e) {
                toast(e.payload?.error || 'Could not delete the product.', { tone: 'error' });
            }
        },
        hasRenderChange() {
            const f = this.editForm;
            return !!(f.color || f.material || f.angle || f.instruction);
        },
        downloadName(p) {
            return `blessluxe-product-${(p.name || p.id).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
        },
    },
};
</script>

<template>
    <div>
        <!-- Guest gate -->
        <div v-if="customer === null" class="border border-dashed border-gold/30 bg-cream/60 py-16 text-center">
            <p class="font-script text-3xl text-gold mb-2">Digitise your merch</p>
            <p class="text-sm text-black/60 mb-6">Sign in to turn photos of your caps, tees and totes into clean digital product renders.</p>
            <router-link to="/account/login" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Sign in
            </router-link>
        </div>

        <template v-else-if="customer">
            <!-- Toolbar -->
            <div class="flex items-center justify-between mb-6">
                <p class="text-sm text-black/60">
                    Photograph your own products and we'll digitise them into clean catalogue renders — ready to pair with your logos in the Studio.
                </p>
                <button
                    @click="showCreate = !showCreate"
                    class="shrink-0 ml-4 bg-gold text-white px-6 py-2.5 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors"
                >
                    {{ showCreate ? 'Close' : 'Add Product' }}
                </button>
            </div>

            <!-- Creation form -->
            <div v-if="showCreate" class="border border-gold/20 bg-cream/40 p-6 mb-8 space-y-4">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                        <p class="text-xs tracking-widest uppercase text-black/55 mb-2">Photos of your item (1–5)</p>
                        <div class="flex flex-wrap gap-3">
                            <div v-for="(p, i) in previews" :key="p" class="relative w-20 h-20">
                                <img :src="p" class="w-full h-full object-cover border border-gold/20" alt="Upload preview" />
                                <button @click="removeFile(i)" class="absolute -top-2 -right-2 w-5 h-5 bg-black text-white text-xs leading-none rounded-full">×</button>
                            </div>
                            <label v-if="files.length < 5" class="w-20 h-20 border border-dashed border-gold/40 flex flex-col items-center justify-center cursor-pointer hover:bg-cream-dark/40 transition-colors">
                                <span class="text-2xl text-gold leading-none">+</span>
                                <span class="text-[9px] tracking-widest uppercase text-black/50 mt-1">Add</span>
                                <input type="file" accept="image/*" multiple class="hidden" @change="pickFiles" />
                            </label>
                        </div>
                        <p class="text-[11px] text-black/45 mt-2">Shoot in good light, from a couple of angles if you can.</p>
                    </div>
                    <div class="space-y-3">
                        <input v-model="form.name" placeholder="Product name (e.g. Classic Dad Cap)" class="w-full bg-white border border-gold/20 px-3 py-2.5 text-sm" />
                        <div>
                            <p class="text-xs tracking-widest uppercase text-black/55 mb-2">Category</p>
                            <div class="flex flex-wrap gap-2">
                                <button
                                    v-for="c in categories"
                                    :key="c"
                                    @click="form.category = form.category === c ? '' : c"
                                    :class="['px-3 py-1.5 text-xs border transition-colors', form.category === c ? 'bg-gold text-white border-gold' : 'border-gold/30 text-black/70 hover:border-gold']"
                                >
                                    {{ c }}
                                </button>
                            </div>
                        </div>
                        <textarea
                            v-model="form.prompt"
                            rows="2"
                            placeholder="Optional direction — “show it slightly angled”, “steam it flat first”…"
                            class="w-full bg-white border border-gold/20 px-3 py-2.5 text-sm resize-none"
                        ></textarea>
                    </div>
                </div>
                <p v-if="createError" class="text-sm text-red-600">{{ createError }}</p>
                <div class="flex items-center gap-4">
                    <button
                        @click="create"
                        :disabled="creating"
                        class="bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-60"
                    >
                        {{ creating ? 'Digitising…' : 'Create Digital Version' }}
                    </button>
                    <p v-if="creating" class="text-[11px] text-black/45">This can take up to a minute.</p>
                </div>
            </div>

            <!-- Grid -->
            <div v-if="loadingList" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                <div v-for="n in 5" :key="n" class="aspect-square bg-cream-dark animate-pulse" />
            </div>
            <div v-else-if="!products.length && !showCreate" class="border border-dashed border-gold/30 bg-cream/60 py-16 text-center">
                <p class="font-script text-3xl text-gold mb-2">No products yet</p>
                <p class="text-sm text-black/55">Tap “Add Product” to digitise your first item.</p>
            </div>
            <div v-else class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                <div v-for="p in products" :key="p.id" class="group border border-gold/10 bg-white flex flex-col">
                    <div class="relative aspect-square overflow-hidden bg-white p-3">
                        <img v-if="p.image_url" :src="p.image_url" :alt="p.name" class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105" />
                        <span v-if="p.category" class="absolute top-2 left-2 bg-black/55 text-white text-[9px] tracking-widest uppercase px-2 py-0.5">{{ p.category }}</span>
                    </div>
                    <p class="px-3 pb-2 text-sm font-medium truncate">{{ p.name }}</p>
                    <div class="flex border-t border-gold/10 text-[10px] tracking-widest uppercase">
                        <button @click="startEdit(p)" class="flex-1 py-2 text-black/60 hover:text-gold transition-colors">Edit</button>
                        <a :href="p.image_url" :download="downloadName(p)" class="flex-1 text-center py-2 text-black/60 hover:text-gold transition-colors border-l border-gold/10">Download</a>
                        <button @click="remove(p)" class="flex-1 py-2 text-black/60 hover:text-red-600 transition-colors border-l border-gold/10">Delete</button>
                    </div>
                </div>
            </div>

            <!-- Edit drawer -->
            <div v-if="editing" class="fixed inset-0 z-50 flex">
                <div class="flex-1 bg-black/40" @click="closeEdit"></div>
                <div class="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl p-6">
                    <div class="flex items-center justify-between mb-5">
                        <h3 class="font-display text-lg tracking-widest uppercase">Edit Product</h3>
                        <button @click="closeEdit" class="text-black/50 hover:text-black text-xl leading-none">×</button>
                    </div>

                    <div class="relative">
                        <img v-if="editing.image_url" :src="editing.image_url" :alt="editing.name" class="w-full aspect-square object-contain border border-gold/15 mb-5 bg-white" />
                        <div v-if="savingEdit" class="absolute inset-0 mb-5 bg-white/70 flex items-center justify-center">
                            <p class="font-script text-2xl text-gold animate-pulse">Re-rendering…</p>
                        </div>
                    </div>

                    <div class="space-y-3">
                        <input v-model="editForm.name" placeholder="Name" class="w-full border border-gold/20 px-3 py-2.5 text-sm" />
                        <div class="grid grid-cols-3 gap-3">
                            <input v-model="editForm.color"    placeholder="Colour"   class="border border-gold/20 px-3 py-2.5 text-sm" />
                            <input v-model="editForm.material" placeholder="Material" class="border border-gold/20 px-3 py-2.5 text-sm" />
                            <input v-model="editForm.angle"    placeholder="Angle"    class="border border-gold/20 px-3 py-2.5 text-sm" />
                        </div>
                        <textarea
                            v-model="editForm.instruction"
                            rows="3"
                            placeholder="Or describe any change — “show the back view”, “make it navy blue”…"
                            class="w-full border border-gold/20 px-3 py-2.5 text-sm resize-none"
                        ></textarea>
                        <p v-if="editError" class="text-sm text-red-600">{{ editError }}</p>
                        <button
                            @click="applyEdit"
                            :disabled="savingEdit"
                            class="w-full bg-gold text-white py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-60"
                        >
                            {{ savingEdit ? 'Working…' : hasRenderChange() ? 'Apply & Re-render' : 'Save Name' }}
                        </button>
                        <button @click="remove(editing)" class="w-full border border-red-200 text-red-600 py-2.5 text-xs tracking-[0.3em] uppercase hover:bg-red-50 transition-colors">
                            Delete Product
                        </button>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
