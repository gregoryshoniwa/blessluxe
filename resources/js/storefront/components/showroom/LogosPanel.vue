<script>
import { api } from '../../../lib/api.js';

/**
 * Show Room → Logos.
 *
 * Creation area for embroiderers and logo designers: brief + optional
 * text/style/colours + up to 3 reference sketches → embroidery-friendly
 * flat vector mark. Grid with edit drawer (colours, style, text, freeform
 * instruction → re-render), download and delete.
 */
const STYLES = [
    'Minimal', 'Neo-minimal', 'Wordmark', 'Monogram', 'Emblem / Badge', 'Stamp & Seal',
    'Mascot', 'Freehand mascot', 'Vintage / Retro', 'Hand-drawn linework', 'Geometric',
    'Art-deco luxury', 'Luxury serif', 'Gothic / Blackletter', 'Pixel / 8-bit', 'Crest / Heraldic',
];

export default {
    name: 'LogosPanel',
    data() {
        return {
            customer: undefined,
            logos: [],
            loadingList: true,
            styles: STYLES,

            // Creation form
            files: [],
            previews: [],
            form: { name: '', prompt: '', text: '', style: '', colors: '' },
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
        if (this.customer) await this.fetchLogos();
        this.loadingList = false;
    },
    methods: {
        blankEdit() {
            return { name: '', colors: '', style: '', text: '', instruction: '' };
        },
        async fetchLogos() {
            try {
                const d = await api.get('/api/account/logos');
                this.logos = d.logos || [];
            } catch { /* keep what we had */ }
        },
        pickFiles(e) {
            const incoming = Array.from(e.target.files || []).slice(0, 3 - this.files.length);
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
            if (!this.form.prompt.trim()) { this.createError = 'Describe the logo you want first.'; return; }
            this.creating = true;
            this.createError = '';
            try {
                const fd = new FormData();
                for (const k of ['name', 'prompt', 'text', 'style', 'colors']) {
                    if (this.form[k]) fd.append(k, this.form[k]);
                }
                this.files.forEach((f) => fd.append('images[]', f));
                const d = await api.post('/api/account/logos', fd);
                this.logos.unshift(d.logo);
                this.previews.forEach((p) => URL.revokeObjectURL(p));
                this.files = []; this.previews = [];
                this.form = { name: '', prompt: '', text: '', style: '', colors: '' };
                this.showCreate = false;
            } catch (e) {
                this.createError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not create the logo — please try again.';
            } finally {
                this.creating = false;
            }
        },
        startEdit(l) {
            this.editing = l;
            this.editForm = { ...this.blankEdit(), name: l.name || '' };
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
                        colors: this.editForm.colors || null,
                        style:  this.editForm.style  || null,
                        text:   this.editForm.text   || null,
                    },
                };
                const d = await api.put(`/api/account/logos/${this.editing.id}`, body);
                const idx = this.logos.findIndex((x) => x.id === this.editing.id);
                if (idx >= 0) this.logos[idx] = d.logo;
                this.editing = d.logo;
                this.editForm = { ...this.blankEdit(), name: d.logo.name || '' };
            } catch (e) {
                this.editError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not update the logo.';
            } finally {
                this.savingEdit = false;
            }
        },
        async remove(l) {
            if (!confirm(`Delete "${l.name || 'this logo'}"? This cannot be undone.`)) return;
            try {
                await api.del(`/api/account/logos/${l.id}`);
                this.logos = this.logos.filter((x) => x.id !== l.id);
                if (this.editing?.id === l.id) this.closeEdit();
            } catch (e) {
                alert(e.payload?.error || 'Could not delete the logo.');
            }
        },
        hasRenderChange() {
            const f = this.editForm;
            return !!(f.colors || f.style || f.text || f.instruction);
        },
        downloadName(l) {
            return `blessluxe-logo-${(l.name || l.id).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
        },
    },
};
</script>

<template>
    <div>
        <!-- Guest gate -->
        <div v-if="customer === null" class="border border-dashed border-gold/30 bg-cream/60 py-16 text-center">
            <p class="font-script text-3xl text-gold mb-2">Design your mark</p>
            <p class="text-sm text-black/60 mb-6">Sign in to create embroidery-ready logos — describe it, refine it, download it.</p>
            <router-link to="/account/login" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Sign in
            </router-link>
        </div>

        <template v-else-if="customer">
            <!-- Toolbar -->
            <div class="flex items-center justify-between mb-6">
                <p class="text-sm text-black/60">
                    Describe a logo and we'll design it in a clean, embroidery-ready style — refine colours, style and text until it's yours.
                </p>
                <button
                    @click="showCreate = !showCreate"
                    class="shrink-0 ml-4 bg-gold text-white px-6 py-2.5 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors"
                >
                    {{ showCreate ? 'Close' : 'New Logo' }}
                </button>
            </div>

            <!-- Creation form -->
            <div v-if="showCreate" class="border border-gold/20 bg-cream/40 p-6 mb-8 space-y-4">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div class="space-y-3">
                        <input v-model="form.name" placeholder="Logo name (e.g. Rose Atelier crest)" class="w-full bg-white border border-gold/20 px-3 py-2.5 text-sm" />
                        <textarea
                            v-model="form.prompt"
                            rows="4"
                            placeholder="Describe the logo — “a lion crest for a tailoring house”, “needle and thread forming a heart”…"
                            class="w-full bg-white border border-gold/20 px-3 py-2.5 text-sm resize-none"
                        ></textarea>
                        <div class="grid grid-cols-2 gap-3">
                            <input v-model="form.text" placeholder="Text in the logo (optional)" class="bg-white border border-gold/20 px-3 py-2.5 text-sm" />
                            <input v-model="form.colors" placeholder="Colours (e.g. gold & black)" class="bg-white border border-gold/20 px-3 py-2.5 text-sm" />
                        </div>
                    </div>
                    <div class="space-y-4">
                        <div>
                            <p class="text-xs tracking-widest uppercase text-black/55 mb-2">Style</p>
                            <div class="flex flex-wrap gap-2">
                                <button
                                    v-for="s in styles"
                                    :key="s"
                                    @click="form.style = form.style === s ? '' : s"
                                    :class="['px-3 py-1.5 text-xs border transition-colors', form.style === s ? 'bg-gold text-white border-gold' : 'border-gold/30 text-black/70 hover:border-gold']"
                                >
                                    {{ s }}
                                </button>
                            </div>
                        </div>
                        <div>
                            <p class="text-xs tracking-widest uppercase text-black/55 mb-2">Reference sketches <span class="normal-case text-black/40">(optional, up to 3)</span></p>
                            <div class="flex flex-wrap gap-3">
                                <div v-for="(p, i) in previews" :key="p" class="relative w-16 h-16">
                                    <img :src="p" class="w-full h-full object-contain bg-white border border-gold/20" alt="Reference preview" />
                                    <button @click="removeFile(i)" class="absolute -top-2 -right-2 w-5 h-5 bg-black text-white text-xs leading-none rounded-full">×</button>
                                </div>
                                <label v-if="files.length < 3" class="w-16 h-16 border border-dashed border-gold/40 flex items-center justify-center cursor-pointer hover:bg-cream-dark/40 transition-colors">
                                    <span class="text-xl text-gold leading-none">+</span>
                                    <input type="file" accept="image/*" multiple class="hidden" @change="pickFiles" />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <p v-if="createError" class="text-sm text-red-600">{{ createError }}</p>
                <div class="flex items-center gap-4">
                    <button
                        @click="create"
                        :disabled="creating"
                        class="bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-60"
                    >
                        {{ creating ? 'Designing…' : 'Create Logo' }}
                    </button>
                    <p v-if="creating" class="text-[11px] text-black/45">This can take up to a minute.</p>
                </div>
            </div>

            <!-- Grid -->
            <div v-if="loadingList" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                <div v-for="n in 5" :key="n" class="aspect-square bg-cream-dark animate-pulse" />
            </div>
            <div v-else-if="!logos.length && !showCreate" class="border border-dashed border-gold/30 bg-cream/60 py-16 text-center">
                <p class="font-script text-3xl text-gold mb-2">No logos yet</p>
                <p class="text-sm text-black/55">Tap “New Logo” to design your first mark.</p>
            </div>
            <div v-else class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                <div v-for="l in logos" :key="l.id" class="group border border-gold/10 bg-white flex flex-col">
                    <div class="relative aspect-square overflow-hidden bg-white p-3">
                        <img v-if="l.image_url" :src="l.image_url" :alt="l.name" class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105" />
                    </div>
                    <p class="px-3 pb-2 text-sm font-medium truncate">{{ l.name }}</p>
                    <div class="flex border-t border-gold/10 text-[10px] tracking-widest uppercase">
                        <button @click="startEdit(l)" class="flex-1 py-2 text-black/60 hover:text-gold transition-colors">Edit</button>
                        <a :href="l.image_url" :download="downloadName(l)" class="flex-1 text-center py-2 text-black/60 hover:text-gold transition-colors border-l border-gold/10">Download</a>
                        <button @click="remove(l)" class="flex-1 py-2 text-black/60 hover:text-red-600 transition-colors border-l border-gold/10">Delete</button>
                    </div>
                </div>
            </div>

            <!-- Edit drawer -->
            <div v-if="editing" class="fixed inset-0 z-50 flex">
                <div class="flex-1 bg-black/40" @click="closeEdit"></div>
                <div class="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl p-6">
                    <div class="flex items-center justify-between mb-5">
                        <h3 class="font-display text-lg tracking-widest uppercase">Edit Logo</h3>
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
                        <div class="grid grid-cols-2 gap-3">
                            <input v-model="editForm.colors" placeholder="Colours" class="border border-gold/20 px-3 py-2.5 text-sm" />
                            <input v-model="editForm.style"  placeholder="Style"   class="border border-gold/20 px-3 py-2.5 text-sm" />
                        </div>
                        <input v-model="editForm.text" placeholder="Text in the logo" class="w-full border border-gold/20 px-3 py-2.5 text-sm" />
                        <textarea
                            v-model="editForm.instruction"
                            rows="3"
                            placeholder="Or describe any change — “make the lion face forward”, “thicker outlines for stitching”…"
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
                            Delete Logo
                        </button>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
