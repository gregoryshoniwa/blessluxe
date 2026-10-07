<script>
import { api } from '../../lib/api.js';
import { confirmDialog, toast } from '../../lib/dialog.js';
import IconButton from '../components/IconButton.vue';
import { ArrowLeft, Trash2, Pencil, Upload, Image as ImageIcon, Plus, Star, Sparkles, X } from 'lucide-vue-next';

export default {
    name: 'AdminProductEditor',
    components: { IconButton, ArrowLeft, Trash2, Pencil, Upload, ImageIcon, Plus, Star, Sparkles, X },
    data() {
        return {
            // AI photo restore: { image, clean, busy, preview: {url, cost} | null }
            enhance: null,
            enhanceQuote: { estimate: 0.067, spent: 0, ready: true },
            loading: true,
            saving: false,
            error: '',
            saved: false,
            product: null,
            catalogues: [],
            form: { title: '', handle: '', subtitle: '', description: '', status: 'draft', sourcing: 'local', default_courier_id: null, catalogue_ids: [] },
            couriers: [],
            reviews: [],            // what shoppers said, hidden ones included
            reviewBusy: '',
            // Variant inline state
            newVariant: this.emptyVariant(),
            editingVariantId: null,
            variantForm: this.emptyVariant(),
            // Image upload
            uploading: false,
            uploadError: '',
            // Video (upload or YouTube link)
            videoBusy: false,
            videoError: '',
            youtubeUrl: '',
            // AI
            aiBusy: false,
            aiError: '',
        };
    },
    computed: {
        id() { return this.$route.params.id; },
    },
    async mounted() {
        this.loadEnhanceQuote();
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
        /** Take a review down, or put it back. The row is kept either way. */
        async setReviewHidden(r, hidden) {
            this.reviewBusy = r.id;
            try {
                await api.put(`/api/admin/product-comments/${r.id}`, { hidden });
                r.hidden = hidden;
                toast(hidden ? 'Review hidden from the shop' : 'Review is showing again');
            } catch (e) { toast(e.payload?.error || 'Could not change that.', { tone: 'error' }); }
            finally { this.reviewBusy = ''; }
        },
        reviewWhen(iso) { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); },
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
                    // 'local' = already in Zimbabwe, no courier fee charged.
                    // 'import' = carried in by a courier the buyer chooses and pays for.
                    sourcing:    this.product.sourcing || 'local',
                    default_courier_id: this.product.default_courier_id || null,
                    catalogue_ids: this.product.catalogue_ids || [],
                };
                try {
                    const c = await api.get('/api/admin/couriers');
                    this.couriers = (c.couriers || []).filter((x) => x.is_active);
                } catch { this.couriers = []; }
                try {
                    this.reviews = (await api.get(`/api/admin/products/${this.id}/comments`)).comments || [];
                } catch { this.reviews = []; }
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
                toast(e.payload?.error || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0]) || 'Could not add variant.', { tone: 'error' });
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
                toast(e.payload?.error || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0]) || 'Could not save.', { tone: 'error' });
            }
        },
        async removeVariant(v) {
            if (!await confirmDialog({ title: `Delete variant "${v.title}"?`, confirmLabel: 'Delete', tone: 'danger' })) return;
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
        // ── AI photo restore ──────────────────────────────────────────────
        money4(n) { return '$' + Number(n || 0).toFixed(4).replace(/(\.\d\d\d*?)0+$/, '$1'); },   // always US dollars, to the hundredth of a cent: $0.0019, $0.039, $0.067
        async loadEnhanceQuote() {
            try { this.enhanceQuote = await api.get(`/api/admin/products/${this.id}/enhance`); } catch { /* keep the default */ }
        },
        openEnhance(img) { this.enhance = { image: img, clean: true, busy: false, preview: null, error: '' }; },
        async runEnhance() {
            const e = this.enhance;
            if (!e || e.busy) return;
            if (e.preview) await this.discardEnhance(false);       // "Try again" throws the last one away
            e.busy = true; e.error = '';
            try {
                const r = await api.post(`/api/admin/products/${this.id}/images/${e.image.id}/enhance`, { clean: e.clean });
                e.preview = r;
                this.enhanceQuote.spent = r.ai_cost;
            } catch (err) { e.error = err?.payload?.error || 'The AI couldn\'t improve that photo just now.'; }
            finally { e.busy = false; }
        },
        async keepEnhance() {
            const e = this.enhance;
            e.busy = true;
            try {
                await api.post(`/api/admin/products/${this.id}/images/${e.image.id}/enhance/keep`, { url: e.preview.url });
                toast('Photo replaced with the improved one');
                this.enhance = null;
                await this.fetchAll();
            } catch (err) { e.error = err?.payload?.error || 'Could not keep it.'; e.busy = false; }
        },
        async discardEnhance(close = true) {
            const e = this.enhance;
            if (e?.preview) {
                try { await api.post(`/api/admin/products/${this.id}/enhance/discard`, { url: e.preview.url }); } catch { /* it's only a preview file */ }
                e.preview = null;
            }
            if (close) this.enhance = null;
        },
        async removeImage(image) {
            if (!await confirmDialog({ title: 'Delete this image?', confirmLabel: 'Delete', tone: 'danger' })) return;
            await api.del(`/api/admin/products/${this.id}/images/${image.id}`);
            await this.fetchAll();
        },
        async makeThumbnail(image) {
            await api.put(`/api/admin/products/${this.id}`, { thumbnail: image.url });
            await this.fetchAll();
        },
        async uploadVideo(file) {
            if (!file) return;
            this.videoBusy = true; this.videoError = '';
            const fd = new FormData();
            fd.append('video', file);
            try {
                await api.post(`/api/admin/products/${this.id}/video`, fd);
                await this.fetchAll();
            } catch (e) {
                this.videoError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Video upload failed.';
            } finally {
                this.videoBusy = false;
                this.$refs.videoInput.value = '';
            }
        },
        async saveYoutube() {
            if (!this.youtubeUrl.trim()) return;
            this.videoBusy = true; this.videoError = '';
            try {
                await api.post(`/api/admin/products/${this.id}/video`, { youtube_url: this.youtubeUrl.trim() });
                this.youtubeUrl = '';
                await this.fetchAll();
            } catch (e) {
                this.videoError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not save the YouTube link.';
            } finally {
                this.videoBusy = false;
            }
        },
        async removeVideo() {
            if (!await confirmDialog({ title: 'Remove this product video?', confirmLabel: 'Delete', tone: 'danger' })) return;
            await api.del(`/api/admin/products/${this.id}/video`);
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
            <header class="flex flex-wrap items-start justify-between gap-3 mb-8">
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

                    <!-- Decides whether this product is charged courier shipping. -->
                    <div class="col-span-2 border border-zinc-200 p-4">
                        <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2">Where does this come from?</p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label
                                class="border p-3 cursor-pointer transition-colors"
                                :class="form.sourcing === 'local' ? 'border-gold border-2 bg-gold/5' : 'border-zinc-200 hover:border-gold/40'"
                            >
                                <span class="flex items-center gap-2">
                                    <input type="radio" value="local" v-model="form.sourcing" class="accent-[#C9A84C]" />
                                    <span class="font-semibold text-sm">Local stock</span>
                                </span>
                                <span class="block text-xs text-zinc-500 mt-1 ml-6">
                                    Already in Zimbabwe. No courier fee. Collect or quick local delivery.
                                </span>
                            </label>

                            <label
                                class="border p-3 cursor-pointer transition-colors"
                                :class="form.sourcing === 'import' ? 'border-gold border-2 bg-gold/5' : 'border-zinc-200 hover:border-gold/40'"
                            >
                                <span class="flex items-center gap-2">
                                    <input type="radio" value="import" v-model="form.sourcing" class="accent-[#C9A84C]" />
                                    <span class="font-semibold text-sm">Imported</span>
                                </span>
                                <span class="block text-xs text-zinc-500 mt-1 ml-6">
                                    Sourced from a supplier abroad. The buyer picks a courier and pays its rate.
                                </span>
                            </label>
                        </div>

                        <div v-if="form.sourcing === 'import'" class="mt-3">
                            <p class="text-xs tracking-widest uppercase text-zinc-500 mb-1">Courier</p>
                            <select v-model="form.default_courier_id" class="border border-zinc-300 px-3 py-2 w-full text-sm">
                                <option :value="null">Let the buyer choose</option>
                                <option v-for="c in couriers" :key="c.id" :value="c.id">
                                    {{ c.name }} — {{ c.base_fee_label }} + {{ c.per_item_fee_label }}/item
                                </option>
                            </select>
                            <p class="text-xs text-zinc-500 mt-1">
                                Pick one only if this item must travel a particular way.
                            </p>
                        </div>
                    </div>
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
                <header class="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                        <h2 class="font-semibold flex items-center gap-2"><ImageIcon class="w-4 h-4" /> Images</h2>
                        <p class="text-xs text-zinc-500 mt-0.5">
                            Blurry WhatsApp or Telegram photo? Use <Sparkles class="w-3 h-3 inline -mt-0.5 text-gold" /> to restore it with AI — about {{ money4(enhanceQuote.estimate) }} a photo.
                            <template v-if="enhanceQuote.spent"> AI spent on this product so far: <strong class="text-zinc-700">{{ money4(enhanceQuote.spent) }}</strong>.</template>
                        </p>
                    </div>
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
                            <IconButton v-if="enhanceQuote.ready" :label="`Improve with AI · about ${money4(enhanceQuote.estimate)}`" @click="openEnhance(img)">
                                <Sparkles class="w-4 h-4 text-white" />
                            </IconButton>
                            <IconButton label="Delete image" tone="danger" @click="removeImage(img)">
                                <Trash2 class="w-4 h-4 text-white" />
                            </IconButton>
                        </div>
                    </div>
                </div>
            </section>

            <!-- AI photo restore: nothing happens until "Improve" is pressed, and
                 nothing is replaced until the new one is compared and kept. -->
            <div v-if="enhance" class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" @click.self="!enhance.busy && discardEnhance()">
                <div class="bg-white w-full max-w-3xl max-h-[92dvh] overflow-y-auto">
                    <header class="flex items-center justify-between px-5 py-3 border-b border-zinc-200">
                        <h3 class="font-semibold inline-flex items-center gap-2"><Sparkles class="w-4 h-4 text-gold" /> Improve this photo with AI</h3>
                        <IconButton label="Close" :disabled="enhance.busy" @click="discardEnhance()"><X class="w-4 h-4" /></IconButton>
                    </header>
                    <div class="p-5">
                        <div :class="['grid gap-3', enhance.preview || enhance.busy ? 'grid-cols-2' : 'grid-cols-1 max-w-xs mx-auto']">
                            <figure>
                                <figcaption class="text-[10px] tracking-widest uppercase text-zinc-500 mb-1">{{ enhance.preview || enhance.busy ? 'Before' : 'This photo' }}</figcaption>
                                <img :src="enhance.image.url" alt="Original" class="w-full aspect-[3/4] object-contain bg-zinc-100 border border-zinc-200" />
                            </figure>
                            <figure v-if="enhance.preview || enhance.busy">
                                <figcaption class="text-[10px] tracking-widest uppercase text-zinc-500 mb-1">After</figcaption>
                                <div v-if="enhance.busy" class="w-full aspect-[3/4] bg-zinc-100 border border-zinc-200 flex flex-col items-center justify-center gap-2 text-sm text-zinc-500">
                                    <Sparkles class="w-6 h-6 text-gold animate-pulse" /> Working… (10–30 seconds)
                                </div>
                                <a v-else :href="enhance.preview.url" target="_blank" title="Open full size"><img :src="enhance.preview.url" alt="Improved" class="w-full aspect-[3/4] object-contain bg-zinc-100 border border-gold" /></a>
                            </figure>
                        </div>

                        <label v-if="!enhance.preview" class="flex items-start gap-2 text-sm mt-4">
                            <input type="checkbox" v-model="enhance.clean" :disabled="enhance.busy" class="mt-1" />
                            <span>Also remove prices, size stickers, phone numbers and supplier logos printed on the photo</span>
                        </label>

                        <p v-if="enhance.preview" class="text-sm mt-4">
                            This one cost <strong>{{ money4(enhance.preview.cost) }}</strong>
                            <span class="text-zinc-500"> · {{ money4(enhanceQuote.spent) }} spent on AI for this product in all</span>
                        </p>
                        <p v-if="enhance.preview" class="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 mt-2">
                            Check it closely — buttons, pattern, colour, lapels. If anything about the garment changed, discard it: shoppers must get what the photo shows.
                        </p>
                        <p v-if="enhance.error" class="text-sm text-red-600 mt-3">{{ enhance.error }}</p>

                        <div class="flex flex-wrap justify-end gap-2 mt-5">
                            <template v-if="enhance.preview">
                                <button @click="discardEnhance()" :disabled="enhance.busy" class="border border-zinc-300 px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:border-zinc-500 disabled:opacity-40">Discard</button>
                                <button @click="runEnhance" :disabled="enhance.busy" class="border border-zinc-300 px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:border-zinc-500 disabled:opacity-40">Try again · ≈{{ money4(enhanceQuote.estimate) }}</button>
                                <button @click="keepEnhance" :disabled="enhance.busy" class="bg-gold text-white px-5 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-40">Keep the new one</button>
                            </template>
                            <template v-else>
                                <button @click="discardEnhance()" :disabled="enhance.busy" class="border border-zinc-300 px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:border-zinc-500 disabled:opacity-40">Cancel</button>
                                <button @click="runEnhance" :disabled="enhance.busy" class="bg-gold text-white px-5 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-40 inline-flex items-center gap-2">
                                    <Sparkles class="w-4 h-4" /> {{ enhance.busy ? 'Improving…' : `Improve · about ${money4(enhanceQuote.estimate)}` }}
                                </button>
                            </template>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Video -->
            <section class="bg-white border border-zinc-200 p-5 mb-6">
                <header class="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 class="font-semibold">Video</h2>
                    <label class="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark cursor-pointer inline-flex items-center gap-2">
                        <Upload class="w-4 h-4" />
                        {{ videoBusy ? 'Working…' : 'Upload video' }}
                        <input ref="videoInput" type="file" accept="video/mp4,video/webm,video/quicktime" class="hidden" @change="uploadVideo($event.target.files[0])" :disabled="videoBusy" />
                    </label>
                </header>
                <p class="text-xs text-zinc-500 mb-3">Plays on the storefront product card (hover) and product page. Upload an MP4/WebM (max 100 MB) or paste a YouTube link — one video per product.</p>

                <div class="flex gap-2 mb-4">
                    <input
                        v-model="youtubeUrl"
                        @keyup.enter="saveYoutube"
                        placeholder="https://www.youtube.com/watch?v=…"
                        class="flex-1 border border-zinc-300 px-3 py-2 text-sm"
                    />
                    <button @click="saveYoutube" :disabled="videoBusy || !youtubeUrl.trim()" class="border border-gold text-gold px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold hover:text-white disabled:opacity-50">
                        Use YouTube link
                    </button>
                </div>
                <p v-if="videoError" class="text-sm text-red-600 mb-3">{{ videoError }}</p>

                <div v-if="product.video" class="flex items-start gap-4">
                    <div class="w-64 bg-black">
                        <video v-if="product.video.kind === 'upload'" :src="product.video.url" controls preload="metadata" class="w-full aspect-video object-contain" />
                        <iframe v-else-if="product.video.embed_url" :src="product.video.embed_url" class="w-full aspect-video" frameborder="0" allowfullscreen title="Product video" />
                    </div>
                    <div class="text-sm">
                        <p class="font-medium">{{ product.video.kind === 'youtube' ? 'YouTube link' : 'Uploaded file' }}</p>
                        <p class="text-xs text-zinc-500 break-all mt-1 max-w-md">{{ product.video.url }}</p>
                        <button @click="removeVideo" class="mt-3 text-xs tracking-widest uppercase text-red-600 hover:underline">Remove video</button>
                    </div>
                </div>
                <p v-else class="text-sm text-zinc-400 py-3 text-center">No video yet.</p>
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

            <!-- What shoppers said. Hiding keeps the row, so a wrong call is undoable. -->
            <section v-if="reviews.length" class="bg-white border border-zinc-200">
                <h2 class="px-5 py-3 border-b border-zinc-200 text-xs tracking-widest uppercase text-zinc-500">
                    Reviews · {{ reviews.length }}
                </h2>
                <ul>
                    <li v-for="r in reviews" :key="r.id" :class="['px-5 py-4 border-b border-zinc-100 last:border-0', reviewBusy === r.id && 'opacity-50']">
                        <div class="flex flex-wrap items-center gap-2 mb-1">
                            <span class="text-sm font-medium">{{ r.author }}</span>
                            <span class="text-xs text-zinc-500">{{ reviewWhen(r.created_at) }}</span>
                            <span v-if="r.hidden" class="text-[10px] tracking-widest uppercase bg-amber-100 text-amber-700 px-2 py-0.5">Hidden</span>
                            <button
                                @click="setReviewHidden(r, !r.hidden)"
                                :disabled="reviewBusy === r.id"
                                class="ml-auto text-[10px] tracking-widest uppercase text-zinc-500 hover:text-zinc-900 underline underline-offset-4 min-h-11"
                            >
                                {{ r.hidden ? 'Show again' : 'Hide from shop' }}
                            </button>
                        </div>
                        <p class="text-sm text-zinc-700 whitespace-pre-line">{{ r.body }}</p>
                    </li>
                </ul>
            </section>
        </div>
    </div>
</template>
