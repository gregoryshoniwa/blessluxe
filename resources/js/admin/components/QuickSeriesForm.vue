<script>
import { api } from '../../lib/api.js';
import { toast } from '../../lib/dialog.js';
import { resizeImage } from '../../lib/image-resize.js';
import { Sparkles, Upload, X, ArrowLeft, ArrowRight, Plus } from 'lucide-vue-next';

/**
 * A supplier's post (Telegram / WhatsApp) → a live series, in seven steps.
 * Drop or paste a screenshot of the post and the AI reader fills everything
 * except the photos; every field stays editable, nothing is saved until
 * Publish.
 */
const PRESETS = [
    { label: 'S – XL',       runs: [['S', 'M', 'L', 'XL']] },
    { label: 'XS – XXL',     runs: [['XS', 'S', 'M', 'L', 'XL', 'XXL']] },
    { label: '36 – 44',      runs: [['36', '38', '40', '42', '44']] },
    { label: '38–44 · 44–50', runs: [['38', '40', '42', '44'], ['44', '46', '48', '50']] },
    { label: '46 – 60',      runs: [['46', '48', '50', '52', '54', '56', '58', '60']] },
    { label: 'Baby 0–9M',    runs: [['0-3M', '3-6M', '6-9M']] },
];

function blank(defaults = {}) {
    return {
        title: '', description: '', reference: '', catalogue_ids: [],
        cost: '', single_price: '', margin: defaults.margin ?? 40,
        supplier: { id: null, name: '', phone: '', link: '' },
        origin: 'TR',
        size_runs: [[]],
        open_days: defaults.open_days ?? 14,
    };
}

export default {
    name: 'QuickSeriesForm',
    components: { Sparkles, Upload, X, ArrowLeft, ArrowRight, Plus },
    emits: ['saved'],
    data() {
        return {
            opts: { catalogues: [], suppliers: [], origins: [], open_days: [], defaults: {}, reader: true },
            form: blank(),
            shots: [],            // screenshots for the reader: { file, url }
            photos: [],           // the product photos: { file, url }
            sizeDraft: [''],      // what's being typed into each run
            reading: false,
            readNote: '',
            saving: false,
            pasteTarget: 'shots',
            presets: PRESETS,
        };
    },
    computed: {
        cost() { return parseFloat(this.form.cost) || 0; },
        price() { return this.cost ? Math.ceil(this.cost * (1 + (Number(this.form.margin) || 0) / 100)) : 0; },
        profit() { return this.price - this.cost; },
        /** Their own single-piece price is what a shopper could pay going direct. */
        single_price_note() {
            const single = parseFloat(this.form.single_price) || 0;
            if (!single || !this.price) return '';
            return this.price <= single
                ? `Below their own single-piece price of ${this.money(single)} — a buyer saves by joining.`
                : `Above their single-piece price of ${this.money(single)} — buyers could find it cheaper.`;
        },
        runs() { return this.form.size_runs.filter((r) => r.length); },
        slots() { return this.runs.reduce((n, r) => n + r.length, 0); },
        supplierMatch() {
            const n = this.form.supplier.name.trim().toLowerCase();
            return n ? this.opts.suppliers.find((s) => s.name.toLowerCase() === n) : null;
        },
        missing() {
            const m = [];
            if (!this.form.title.trim()) m.push('a name');
            if (!this.photos.length) m.push('a photo');
            if (!this.cost) m.push('the cost');
            if (!this.runs.some((r) => r.length >= 2)) m.push('at least two sizes');
            return m;
        },
    },
    async mounted() {
        try {
            this.opts = await api.get('/api/admin/quick/series/options');
            this.form = blank(this.opts.defaults);
        } catch { toast('Could not load the form options.', { tone: 'error' }); }
        window.addEventListener('paste', this.onPaste);
    },
    beforeUnmount() {
        window.removeEventListener('paste', this.onPaste);
        [...this.shots, ...this.photos].forEach((x) => URL.revokeObjectURL(x.url));
    },
    methods: {
        money(n) { return '$' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, ''); },

        // ── Pictures ────────────────────────────────────────────────────
        addFiles(list, files, max) {
            for (const file of [...files].filter((f) => f.type.startsWith('image/')).slice(0, max - list.length)) {
                list.push({ file, url: URL.createObjectURL(file) });
            }
        },
        onPick(target, e) { this.addFiles(this[target], e.target.files || [], target === 'shots' ? 4 : 10); e.target.value = ''; },
        onDrop(target, e) { this.pasteTarget = target; this.addFiles(this[target], e.dataTransfer?.files || [], target === 'shots' ? 4 : 10); },
        /** Ctrl/⌘+V a screenshot straight from Telegram or WhatsApp Web. */
        onPaste(e) {
            if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
            const files = [...(e.clipboardData?.files || [])];
            if (!files.length) return;
            e.preventDefault();
            this.addFiles(this[this.pasteTarget], files, this.pasteTarget === 'shots' ? 4 : 10);
        },
        removeFrom(list, i) { URL.revokeObjectURL(list[i].url); list.splice(i, 1); },
        move(list, i, by) { const [x] = list.splice(i, 1); list.splice(i + by, 0, x); },
        /** The post's own pictures are often the product photos too. */
        useShotsAsPhotos() { this.addFiles(this.photos, this.shots.map((s) => s.file), 10); this.pasteTarget = 'photos'; },

        // ── The reader ──────────────────────────────────────────────────
        async read() {
            if (!this.shots.length || this.reading) return;
            this.reading = true; this.readNote = '';
            try {
                const fd = new FormData();
                for (const s of this.shots) fd.append('shots[]', await resizeImage(s.file, { max: 1600, quality: 0.85 }), 'shot.jpg');
                const { draft } = await api.post('/api/admin/quick/series/read', fd);
                const f = this.form;
                if (draft.title) f.title = draft.title;
                if (draft.description) f.description = draft.description + (draft.colours?.length > 1 ? `\n\nColours: ${draft.colours.join(', ')}.` : '');
                if (draft.reference) f.reference = draft.reference;
                if (draft.catalogue_ids?.length) f.catalogue_ids = draft.catalogue_ids;
                if (draft.cost != null) f.cost = draft.cost;
                if (draft.single_price != null) f.single_price = draft.single_price;
                if (draft.supplier?.name) f.supplier = { ...f.supplier, ...draft.supplier, link: draft.supplier.link || f.supplier.link };
                if (draft.origin) f.origin = draft.origin;
                if (draft.size_runs?.length) { f.size_runs = draft.size_runs; this.sizeDraft = draft.size_runs.map(() => ''); }
                const notes = [];
                if (draft.currency && draft.currency !== 'USD') notes.push(`Prices were in ${draft.currency} — convert the cost to US dollars.`);
                if (draft.note) notes.push(draft.note);
                this.readNote = notes.join(' ');
                toast('Filled from the post — check each step, then add the photos');
                this.pasteTarget = 'photos';
            } catch (e) {
                toast(e?.payload?.error || 'Could not read that picture.', { tone: 'error' });
            } finally { this.reading = false; }
        },

        // ── Sizes ───────────────────────────────────────────────────────
        /** Typing "46 48 50" or "38-40-42" and Enter adds each size. */
        addSizes(r) {
            const raw = (this.sizeDraft[r] || '').trim();
            if (!raw) return;
            const parts = /^\d+-\d+M?$/i.test(raw) ? [raw] : raw.split(/[\s,;/]+|(?<=\d)-(?=\d)/).filter(Boolean);
            for (const p of parts) if (!this.form.size_runs[r].includes(p.toUpperCase())) this.form.size_runs[r].push(p.toUpperCase());
            this.sizeDraft[r] = '';
        },
        sizeKey(r, e) {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); this.addSizes(r); }
            else if (e.key === 'Backspace' && !this.sizeDraft[r] && this.form.size_runs[r].length) this.form.size_runs[r].pop();
        },
        addRun() { this.form.size_runs.push([]); this.sizeDraft.push(''); },
        removeRun(r) { this.form.size_runs.splice(r, 1); this.sizeDraft.splice(r, 1); if (!this.form.size_runs.length) this.addRun(); },
        usePreset(p) { this.form.size_runs = p.runs.map((r) => [...r]); this.sizeDraft = p.runs.map(() => ''); },

        pickSupplier(s) { this.form.supplier = { id: s.id, name: s.name, phone: s.phone || '', link: s.link || '' }; if (s.country) this.form.origin = s.country; },
        onSupplierName() {
            const m = this.supplierMatch;
            if (m) this.pickSupplier(m); else this.form.supplier.id = null;
        },

        // ── Save ────────────────────────────────────────────────────────
        async save(publish) {
            this.form.size_runs.forEach((_, r) => this.addSizes(r));
            if (publish && this.missing.length) { toast(`Still needed: ${this.missing.join(', ')}.`, { tone: 'error' }); return; }
            this.saving = true;
            try {
                const fd = new FormData();
                const f = this.form;
                for (const k of ['title', 'description', 'reference', 'cost', 'margin', 'single_price', 'origin', 'open_days']) fd.append(k, f[k] ?? '');
                fd.append('supplier', JSON.stringify(f.supplier));
                fd.append('size_runs', JSON.stringify(this.runs));
                fd.append('catalogue_ids', JSON.stringify(f.catalogue_ids));
                fd.append('publish', publish ? '1' : '0');
                for (const p of this.photos) fd.append('images[]', await resizeImage(p.file, { max: 1600, quality: 0.86 }), 'photo.jpg');
                const r = await api.post('/api/admin/quick/series', fd);
                toast(publish ? `Published — selling at ${this.money(r.price / 100)} a piece` : 'Saved as a draft — launch it from Series when ready');
                this.$emit('saved', { ...r, publish });
            } catch (e) {
                const p = e?.payload || {};
                toast(p.error || Object.values(p.errors || {})[0]?.[0] || p.message || 'Could not save that.', { tone: 'error' });
            } finally { this.saving = false; }
        },
    },
};
</script>

<template>
    <div class="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-y-6 gap-x-0 lg:gap-x-6 items-start">
        <div class="space-y-4 min-w-0">
            <!-- 0. Read a post -->
            <section
                :class="['border-2 border-dashed p-5 transition-colors', pasteTarget === 'shots' ? 'border-gold bg-gold/5' : 'border-zinc-300 bg-white']"
                @click="pasteTarget = 'shots'"
                @dragover.prevent="pasteTarget = 'shots'"
                @drop.prevent="onDrop('shots', $event)"
            >
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                        <p class="text-sm font-semibold inline-flex items-center gap-2"><Sparkles class="w-4 h-4 text-gold" /> Fill it from a post</p>
                        <p class="text-xs text-zinc-500 mt-1 max-w-xl">Screenshot the Telegram or WhatsApp post — the pictures <em>and</em> the caption with the prices and sizes — then paste it here (Ctrl/⌘+V), drop it, or choose it. Up to 4 screenshots.</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <label class="inline-flex items-center gap-1.5 border border-zinc-300 bg-white px-3 py-2 text-xs cursor-pointer hover:border-zinc-500">
                            <Upload class="w-4 h-4" /> Choose
                            <input type="file" multiple accept="image/*" class="hidden" @change="onPick('shots', $event)" />
                        </label>
                        <button @click.stop="read" :disabled="!shots.length || reading || !opts.reader" class="inline-flex items-center gap-1.5 bg-black text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase disabled:opacity-40">
                            <Sparkles :class="['w-4 h-4', reading && 'animate-pulse']" /> {{ reading ? 'Reading…' : 'Read with AI' }}
                        </button>
                    </div>
                </div>
                <div v-if="shots.length" class="flex flex-wrap gap-2 mt-4">
                    <div v-for="(s, i) in shots" :key="s.url" class="relative w-20 h-24 border border-zinc-200 bg-zinc-100">
                        <img :src="s.url" alt="" class="w-full h-full object-cover object-top" />
                        <button @click.stop="removeFrom(shots, i)" class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black text-white inline-flex items-center justify-center" aria-label="Remove screenshot"><X class="w-3.5 h-3.5" /></button>
                    </div>
                    <button @click.stop="useShotsAsPhotos" class="self-end text-xs text-zinc-500 underline hover:text-black">Use these as the photos too</button>
                </div>
                <p v-if="!opts.reader" class="text-xs text-amber-700 mt-3">The AI reader isn't set up on this server (no GOOGLE_AI_API_KEY). Fill the steps by hand.</p>
                <p v-if="readNote" class="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 mt-3">{{ readNote }}</p>
            </section>

            <!-- 1. Name and description -->
            <section class="bg-white border border-zinc-200 p-5">
                <h3 class="text-xs tracking-widest uppercase text-zinc-500 mb-3"><span class="text-gold font-semibold">1</span> · Name and description</h3>
                <div class="grid sm:grid-cols-2 gap-3">
                    <label class="sm:col-span-2 flex flex-col gap-1">
                        <span class="text-xs text-zinc-600">Name shoppers see</span>
                        <input v-model="form.title" maxlength="120" placeholder="e.g. Three-Piece Check Suit" class="border border-zinc-300 px-3 py-2 text-sm" />
                    </label>
                    <label class="sm:col-span-2 flex flex-col gap-1">
                        <span class="text-xs text-zinc-600">Description</span>
                        <textarea v-model="form.description" rows="4" maxlength="3000" class="border border-zinc-300 px-3 py-2 text-sm"></textarea>
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-xs text-zinc-600">Where it goes in the shop</span>
                        <select :value="form.catalogue_ids[0] || ''" @change="form.catalogue_ids = $event.target.value ? [$event.target.value] : []" class="border border-zinc-300 px-3 py-2 text-sm bg-white">
                            <option value="">— Choose —</option>
                            <option v-for="c in opts.catalogues" :key="c.id" :value="c.id">{{ c.label }}</option>
                        </select>
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-xs text-zinc-600">Supplier's code <span class="text-zinc-400">(optional)</span></span>
                        <input v-model="form.reference" maxlength="60" placeholder="e.g. 2095" class="border border-zinc-300 px-3 py-2 text-sm" />
                    </label>
                </div>
            </section>

            <!-- 2. Photos -->
            <section
                :class="['bg-white border p-5 transition-colors', pasteTarget === 'photos' ? 'border-gold' : 'border-zinc-200']"
                @click="pasteTarget = 'photos'"
                @dragover.prevent="pasteTarget = 'photos'"
                @drop.prevent="onDrop('photos', $event)"
            >
                <h3 class="text-xs tracking-widest uppercase text-zinc-500 mb-1"><span class="text-gold font-semibold">2</span> · Photos</h3>
                <p class="text-xs text-zinc-500 mb-3">The first is the cover. Drop, paste or choose — up to 10.</p>
                <div class="flex flex-wrap gap-3">
                    <div v-for="(p, i) in photos" :key="p.url" class="w-24">
                        <div class="relative aspect-[3/4] bg-zinc-100 border border-zinc-200 overflow-hidden">
                            <img :src="p.url" alt="" class="w-full h-full object-cover object-top" />
                            <span v-if="i === 0" class="absolute top-1 left-1 bg-black/70 text-white text-[9px] tracking-widest uppercase px-1.5 py-0.5">Cover</span>
                        </div>
                        <div class="flex justify-between mt-1 text-zinc-500">
                            <button :disabled="i === 0" @click.stop="move(photos, i, -1)" class="w-8 h-8 inline-flex items-center justify-center hover:text-black disabled:opacity-30" aria-label="Earlier"><ArrowLeft class="w-4 h-4" /></button>
                            <button @click.stop="removeFrom(photos, i)" class="w-8 h-8 inline-flex items-center justify-center hover:text-red-600" aria-label="Remove"><X class="w-4 h-4" /></button>
                            <button :disabled="i === photos.length - 1" @click.stop="move(photos, i, 1)" class="w-8 h-8 inline-flex items-center justify-center hover:text-black disabled:opacity-30" aria-label="Later"><ArrowRight class="w-4 h-4" /></button>
                        </div>
                    </div>
                    <label v-if="photos.length < 10" class="w-24 aspect-[3/4] border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center gap-1 text-xs text-zinc-500 cursor-pointer hover:border-zinc-500 hover:text-black">
                        <Upload class="w-5 h-5" /> Add
                        <input type="file" multiple accept="image/*" class="hidden" @change="onPick('photos', $event)" />
                    </label>
                </div>
            </section>

            <!-- 3 + 4. Cost and margin -->
            <section class="bg-white border border-zinc-200 p-5 grid sm:grid-cols-2 gap-x-6 gap-y-5">
                <div>
                    <h3 class="text-xs tracking-widest uppercase text-zinc-500 mb-3"><span class="text-gold font-semibold">3</span> · Cost price</h3>
                    <label class="flex flex-col gap-1 mb-3">
                        <span class="text-xs text-zinc-600">Series price per piece (what we pay) · USD</span>
                        <input v-model="form.cost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="60" class="border border-zinc-300 px-3 py-2 text-sm" />
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-xs text-zinc-600">Their single-piece price <span class="text-zinc-400">(for reference)</span></span>
                        <input v-model="form.single_price" type="number" min="0" step="0.01" inputmode="decimal" placeholder="85" class="border border-zinc-300 px-3 py-2 text-sm" />
                    </label>
                </div>
                <div>
                    <h3 class="text-xs tracking-widest uppercase text-zinc-500 mb-3"><span class="text-gold font-semibold">4</span> · Profit margin</h3>
                    <div class="flex items-center gap-2 mb-2">
                        <input v-model.number="form.margin" type="number" min="0" max="500" class="border border-zinc-300 px-3 py-2 text-sm w-24" />
                        <span class="text-sm text-zinc-500">%</span>
                    </div>
                    <div class="flex flex-wrap gap-1.5 mb-3">
                        <button v-for="m in [25, 30, 40, 50, 60, 80]" :key="m" @click="form.margin = m" :class="['px-2.5 py-1 text-xs border', form.margin === m ? 'border-gold bg-gold/10 text-gold-dark' : 'border-zinc-300 hover:border-zinc-500']">{{ m }}%</button>
                    </div>
                    <p v-if="cost" class="text-sm">Sells at <strong class="text-lg">{{ money(price) }}</strong> <span class="text-zinc-500">· {{ money(profit) }} profit a piece</span></p>
                    <p v-if="cost && single_price_note" class="text-xs text-zinc-500 mt-1">{{ single_price_note }}</p>
                </div>
            </section>

            <!-- 5 + 6. Supplier and where from -->
            <section class="bg-white border border-zinc-200 p-5 grid sm:grid-cols-2 gap-x-6 gap-y-5">
                <div>
                    <h3 class="text-xs tracking-widest uppercase text-zinc-500 mb-3"><span class="text-gold font-semibold">5</span> · Supplier</h3>
                    <label class="flex flex-col gap-1 mb-3">
                        <span class="text-xs text-zinc-600">Name <span v-if="supplierMatch" class="text-emerald-700">· already on file</span><span v-else-if="form.supplier.name" class="text-zinc-400">· new — will be saved</span></span>
                        <input v-model="form.supplier.name" @change="onSupplierName" list="quick-suppliers" maxlength="120" placeholder="e.g. Mario casas mens wear" class="border border-zinc-300 px-3 py-2 text-sm" />
                        <datalist id="quick-suppliers"><option v-for="s in opts.suppliers" :key="s.id" :value="s.name" /></datalist>
                    </label>
                    <div class="grid grid-cols-2 gap-2">
                        <input v-model="form.supplier.phone" maxlength="40" placeholder="Phone / WhatsApp" class="border border-zinc-300 px-3 py-2 text-sm min-w-0" />
                        <input v-model="form.supplier.link" maxlength="300" placeholder="Channel or group link" class="border border-zinc-300 px-3 py-2 text-sm min-w-0" />
                    </div>
                </div>
                <div>
                    <h3 class="text-xs tracking-widest uppercase text-zinc-500 mb-3"><span class="text-gold font-semibold">6</span> · Ships from</h3>
                    <div class="flex flex-wrap gap-2">
                        <button v-for="o in opts.origins" :key="o.code" @click="form.origin = o.code" :class="['px-3 py-2 text-sm border', form.origin === o.code ? 'border-gold bg-gold/10 text-gold-dark font-medium' : 'border-zinc-300 hover:border-zinc-500']">{{ o.label }}</button>
                    </div>
                </div>
            </section>

            <!-- 7. Sizes -->
            <section class="bg-white border border-zinc-200 p-5">
                <h3 class="text-xs tracking-widest uppercase text-zinc-500 mb-1"><span class="text-gold font-semibold">7</span> · Sizes</h3>
                <p class="text-xs text-zinc-500 mb-3">One size run = one series: a buyer takes each size. Type sizes and press Enter ("46 48 50" adds three). A post with two runs ("38–44 and 44–50") becomes two series.</p>
                <div class="flex flex-wrap gap-1.5 mb-4">
                    <button v-for="p in presets" :key="p.label" @click="usePreset(p)" class="px-2.5 py-1 text-xs border border-zinc-300 hover:border-zinc-500">{{ p.label }}</button>
                </div>
                <div v-for="(run, r) in form.size_runs" :key="r" class="flex items-start gap-2 mb-2">
                    <span v-if="form.size_runs.length > 1" class="text-xs text-zinc-500 pt-2.5 w-12 flex-shrink-0">Run {{ r + 1 }}</span>
                    <div class="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 border border-zinc-300 px-2 py-1.5 focus-within:border-zinc-500">
                        <span v-for="(s, k) in run" :key="s" class="inline-flex items-center gap-1 bg-zinc-100 px-2 py-1 text-sm font-medium">
                            {{ s }} <button @click="run.splice(k, 1)" class="text-zinc-400 hover:text-red-600" :aria-label="`Remove ${s}`"><X class="w-3 h-3" /></button>
                        </span>
                        <input v-model="sizeDraft[r]" @keydown="sizeKey(r, $event)" @blur="addSizes(r)" placeholder="Add sizes…" class="flex-1 min-w-[6rem] px-1 py-1 text-sm outline-none" />
                    </div>
                    <button @click="removeRun(r)" class="w-10 h-10 inline-flex items-center justify-center text-zinc-400 hover:text-red-600 flex-shrink-0" aria-label="Remove this run"><X class="w-4 h-4" /></button>
                </div>
                <button @click="addRun" class="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-black mt-1"><Plus class="w-3.5 h-3.5" /> Another size run</button>
            </section>
        </div>

        <!-- Summary: what's about to go live, and the two buttons. -->
        <aside class="bg-white border border-zinc-200 p-5 lg:sticky lg:top-6 space-y-4">
            <div class="flex gap-3">
                <div class="w-20 aspect-[3/4] bg-zinc-100 border border-zinc-200 flex-shrink-0 overflow-hidden">
                    <img v-if="photos[0]" :src="photos[0].url" alt="" class="w-full h-full object-cover object-top" />
                </div>
                <div class="min-w-0">
                    <p class="text-sm font-semibold line-clamp-2">{{ form.title || 'Untitled series' }}</p>
                    <p class="text-lg font-semibold text-gold-dark mt-1">{{ price ? money(price) : '—' }}</p>
                    <p class="text-xs text-zinc-500">Imported · no stock kept</p>
                </div>
            </div>
            <dl class="text-xs space-y-1.5 border-t border-zinc-100 pt-3">
                <div class="flex justify-between"><dt class="text-zinc-500">Series</dt><dd>{{ runs.length || '—' }}</dd></div>
                <div class="flex justify-between"><dt class="text-zinc-500">Sizes to fill</dt><dd>{{ slots || '—' }}</dd></div>
                <div class="flex justify-between"><dt class="text-zinc-500">We pay when all fill</dt><dd>{{ cost && slots ? money(cost * slots) : '—' }}</dd></div>
                <div class="flex justify-between"><dt class="text-zinc-500">Shoppers pay</dt><dd>{{ price && slots ? money(price * slots) : '—' }}</dd></div>
                <div class="flex justify-between font-semibold"><dt>Profit when full</dt><dd class="text-emerald-700">{{ cost && slots ? money(profit * slots) : '—' }}</dd></div>
            </dl>
            <label class="flex flex-col gap-1 border-t border-zinc-100 pt-3">
                <span class="text-xs text-zinc-600">Open for</span>
                <select v-model.number="form.open_days" class="border border-zinc-300 px-3 py-2 text-sm bg-white">
                    <option v-for="d in opts.open_days" :key="d" :value="d">{{ d }} days</option>
                    <option :value="0">No deadline</option>
                </select>
            </label>
            <p v-if="missing.length" class="text-xs text-zinc-500">Still needed: {{ missing.join(', ') }}.</p>
            <div class="flex flex-col gap-2">
                <button @click="save(true)" :disabled="saving" class="bg-gold text-white px-5 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark disabled:opacity-50">
                    {{ saving ? 'Saving…' : runs.length > 1 ? `Publish ${runs.length} series` : 'Publish series' }}
                </button>
                <button @click="save(false)" :disabled="saving || !form.title.trim()" class="border border-zinc-300 px-5 py-2.5 text-xs font-semibold tracking-[0.2em] uppercase hover:border-zinc-500 disabled:opacity-40">Save as draft</button>
            </div>
        </aside>
    </div>
</template>
