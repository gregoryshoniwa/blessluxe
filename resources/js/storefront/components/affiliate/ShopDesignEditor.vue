<script>
import { api } from '../../../lib/api.js';
import { toast, confirmDialog } from '../../../lib/dialog.js';
import { affiliateStore } from '../../affiliate-store.js';
import HeroSlideshow from '../HeroSlideshow.vue';
import {
    Palette, Megaphone, Images, Upload, Youtube, Sparkles, Check, X, Trash2, Eye, EyeOff,
    ArrowUp, ArrowDown, LoaderCircle, Monitor, Smartphone, Plus, Info,
} from 'lucide-vue-next';

/**
 * Design your shop: accent colour, top-bar messages, hero slides.
 *
 * Three independent choices, each "BLESSLUXE's" or "my own" — wanting your own
 * colour says nothing about wanting to make banner artwork. Switching back to
 * the default never deletes anything.
 *
 * Every rule shown here (sizes, limits, the 20 colours) comes from the server's
 * `guide`, so the guidance on screen cannot drift from what is enforced. And
 * the preview is the REAL hero component, in desktop and phone shapes, so an
 * affiliate sees the actual crop before shoppers do.
 */
export default {
    name: 'ShopDesignEditor',
    components: {
        HeroSlideshow, Palette, Megaphone, Images, Upload, Youtube, Sparkles, Check, X, Trash2, Eye, EyeOff,
        ArrowUp, ArrowDown, LoaderCircle, Monitor, Smartphone, Plus, Info,
    },
    props: { shopUrl: { type: String, default: null } },
    data() {
        return {
            loading: true,
            look: null,
            slides: [],
            guide: null,
            saving: null,            // which block is saving: 'theme' | 'topbar' | 'hero'

            // theme
            customColor: '',
            // top bar
            messages: [],
            // hero
            device: 'desktop',       // preview shape
            adding: null,            // null | 'upload' | 'youtube' | 'ai'
            draft: this.blankDraft(),
            busy: false,
            editing: null,           // slide id being edited
            // ai wizard
            ai: { prompt: '', style: 'Editorial studio', result: null, generating: false },
            styles: ['Editorial studio', 'Golden-hour street', 'Boutique interior', 'Minimal flat-lay', 'Garden party', 'Evening glamour'],
            fallback: {
                heading: 'Elegance Redefined', subheading: 'Discover curated luxury fashion for the modern woman.',
                ctaLabel: 'Shop now', ctaHref: '/shop',
            },
        };
    },
    computed: {
        activeSlides() { return this.slides.filter((s) => s.is_active); },
        // What the preview shows: their live slides in custom mode, else ours.
        previewSlides() {
            if (this.ai.result) return [{ id: 'ai-preview', media_type: 'image', media_url: this.ai.result, ...this.draftText }];
            return this.look?.hero_mode === 'custom' ? this.activeSlides : [];
        },
        draftText() {
            const d = this.draft;
            return { heading: d.heading, subheading: d.subheading, cta_label: d.cta_label, cta_href: d.cta_href, focus: d.focus };
        },
        canAddSlide() { return this.slides.length < (this.guide?.max_slides ?? 5); },
        selectedHex() { return (this.look?.theme_color || '#C9A84C').toUpperCase(); },
        isCustomColor() { return !this.guide?.presets.some((p) => p.hex.toUpperCase() === this.selectedHex); },
    },
    async mounted() {
        try {
            this.apply(await api.get('/api/account/affiliate/look'));
            // Open in THEIR colours. The dashboard isn't "inside" their shop, so
            // without this it opens gold and the saved colour looks lost.
            affiliateStore.paint(this.look.palette);
        }
        catch (e) { toast(e.payload?.error || 'Could not load your shop design.', { tone: 'error' }); }
        finally { this.loading = false; }
    },
    beforeUnmount() {
        // The editor previews colours on the live page; leaving must put back
        // whatever shop (if any) this browser is actually shopping via.
        affiliateStore.refresh();
    },
    methods: {
        blankDraft() { return { heading: '', subheading: '', cta_label: '', cta_href: '/shop', focus: 'center', file: null, fileUrl: null, youtube_url: '' }; },

        apply(d) {
            this.look = d.look; this.slides = d.slides; this.guide = d.guide;
            this.messages = [...d.look.top_bar_messages];
            if (d.notice) toast(d.notice);
        },

        async save(block, patch) {
            this.saving = block;
            try {
                this.apply(await api.put('/api/account/affiliate/look', patch));
                return true;
            } catch (e) {
                toast(e.payload?.error || 'Could not save that.', { tone: 'error' });
                return false;
            } finally { this.saving = null; }
        },

        // ─── Colour ────────────────────────────────────────────────────────
        async pickColor(hex) {
            if (await this.save('theme', { theme_color: hex })) affiliateStore.paint(this.look.palette);
        },
        async applyCustom() {
            if (!this.customColor.trim()) return;
            if (await this.save('theme', { theme_color: this.customColor })) {
                affiliateStore.paint(this.look.palette);
                this.customColor = '';
            }
        },
        async resetColor() {
            if (await this.save('theme', { theme_color: null })) affiliateStore.paint(null);
        },

        // ─── Top bar ───────────────────────────────────────────────────────
        setTopBarMode(mode) { this.save('topbar', { top_bar_mode: mode }); },
        addMessage() { if (this.messages.length < this.guide.max_messages) this.messages.push(''); },
        removeMessage(i) { this.messages.splice(i, 1); },
        async saveMessages() {
            if (await this.save('topbar', { top_bar_messages: this.messages, top_bar_mode: 'custom' })) toast('Top bar saved.');
        },

        // ─── Hero ──────────────────────────────────────────────────────────
        setHeroMode(mode) { this.save('hero', { hero_mode: mode }); },

        startAdding(kind) {
            this.adding = kind; this.editing = null;
            this.releaseFile();
            this.draft = this.blankDraft();
            this.ai.result = null;
        },
        cancelAdding() { this.releaseFile(); this.adding = null; this.ai.result = null; this.draft = this.blankDraft(); },
        releaseFile() { if (this.draft?.fileUrl) URL.revokeObjectURL(this.draft.fileUrl); },

        /** Check the file in the browser first — a clear "too small" now beats a
         *  failed upload of an 8 MB file over mobile data. */
        onFile(e) {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const g = this.guide.hero;
            if (file.size > g.max_mb * 1024 * 1024) { toast(`That file is over ${g.max_mb} MB. Export it as a JPG or WebP and try again.`, { tone: 'error' }); return; }

            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                if (img.naturalWidth < g.min_width || img.naturalHeight < g.min_height) {
                    URL.revokeObjectURL(url);
                    toast(`That image is ${img.naturalWidth} × ${img.naturalHeight}px — too small for a full-width banner. Use at least ${g.minimum}.`, { tone: 'error' });
                    return;
                }
                this.releaseFile();
                this.draft.file = file; this.draft.fileUrl = url;
            };
            img.onerror = () => { URL.revokeObjectURL(url); toast("That file couldn't be read as an image.", { tone: 'error' }); };
            img.src = url;
        },

        async generate() {
            if (this.ai.prompt.trim().length < 8) { toast('Describe the scene in a few more words.', { tone: 'error' }); return; }
            this.ai.generating = true;
            try {
                const d = await api.post('/api/account/affiliate/look/generate', { prompt: this.ai.prompt, style: this.ai.style });
                this.ai.result = d.generated_url;
                this.guide.ai.remaining = d.remaining;
            } catch (e) {
                toast(e.payload?.error || 'The AI designer had a problem. Please try again.', { tone: 'error' });
            } finally { this.ai.generating = false; }
        },

        async saveSlide() {
            this.busy = true;
            try {
                const fd = new FormData();
                for (const k of ['heading', 'subheading', 'cta_label', 'cta_href', 'focus']) fd.append(k, this.draft[k] ?? '');
                if (this.adding === 'upload') {
                    if (!this.draft.file) { toast('Choose an image first.', { tone: 'error' }); return; }
                    fd.append('image', this.draft.file);
                } else if (this.adding === 'youtube') {
                    fd.append('youtube_url', this.draft.youtube_url);
                } else {
                    if (!this.ai.result) { toast('Generate an image first.', { tone: 'error' }); return; }
                    fd.append('generated_url', this.ai.result);
                    fd.append('prompt', this.ai.prompt);
                }
                const d = await api.post('/api/account/affiliate/look/slides', fd);
                this.apply(d);
                this.cancelAdding();
                // Adding a slide only matters if slides are being shown.
                if (this.look.hero_mode !== 'custom') await this.save('hero', { hero_mode: 'custom' });
                toast('Slide added to your shop.');
            } catch (e) {
                const first = e.payload?.errors && Object.values(e.payload.errors)[0]?.[0];
                toast(e.payload?.error || first || 'Could not add that slide.', { tone: 'error' });
            } finally { this.busy = false; }
        },

        async patchSlide(s, patch) {
            try { this.apply(await api.put(`/api/account/affiliate/look/slides/${s.id}`, patch)); }
            catch (e) { toast(e.payload?.error || 'Could not save that.', { tone: 'error' }); }
        },
        async saveEdit(s) { await this.patchSlide(s, { heading: s.heading, subheading: s.subheading, cta_label: s.cta_label, cta_href: s.cta_href, focus: s.focus }); this.editing = null; },
        async move(i, step) {
            const ids = this.slides.map((s) => s.id);
            const j = i + step;
            if (j < 0 || j >= ids.length) return;
            [ids[i], ids[j]] = [ids[j], ids[i]];
            try { this.apply(await api.put('/api/account/affiliate/look/slides/order', { ids })); }
            catch { toast('Could not reorder.', { tone: 'error' }); }
        },
        async remove(s) {
            if (!await confirmDialog({ title: 'Remove this slide?', body: 'It will be taken off your shop. This can\'t be undone.', confirmLabel: 'Remove', tone: 'danger' })) return;
            try { this.apply(await api.del(`/api/account/affiliate/look/slides/${s.id}`)); }
            catch (e) { toast(e.payload?.error || 'Could not remove that.', { tone: 'error' }); }
        },
        thumb(s) { return s.media_type === 'youtube' ? s.poster_url : s.media_url; },
    },
};
</script>

<template>
    <p v-if="loading" class="text-sm text-black/55">Loading your shop design…</p>

    <div v-else-if="look" class="space-y-8">
        <div class="flex items-start justify-between gap-4 flex-wrap">
            <div>
                <h3 class="font-display text-lg tracking-widest uppercase">Design your shop</h3>
                <p class="text-xs text-black/55 mt-1 max-w-xl leading-relaxed">
                    Make your shop feel like yours. Each part below can stay on the BLESSLUXE look or be your own — change one without touching the others. Shoppers only see this when they arrive through your link.
                </p>
            </div>
            <a v-if="shopUrl" :href="shopUrl" target="_blank" rel="noopener" class="text-[10px] tracking-widest uppercase border border-gold/40 text-gold-dark px-3 py-2 hover:bg-gold/10 transition-colors inline-flex items-center gap-1.5">
                <Eye class="w-3.5 h-3.5" /> View my shop
            </a>
        </div>

        <!-- ═══ 1. Colour ═══════════════════════════════════════════════ -->
        <section class="bg-white border border-gold/15 p-5">
            <header class="flex items-center justify-between gap-3 flex-wrap mb-1">
                <h4 class="font-display text-sm tracking-widest uppercase flex items-center gap-2"><Palette class="w-4 h-4 text-gold" /> Shop colour</h4>
                <button v-if="look.theme_color" @click="resetColor" class="text-[10px] tracking-widest uppercase text-black/45 hover:text-gold underline underline-offset-4">Back to BLESSLUXE gold</button>
            </header>
            <p class="text-xs text-black/55 mb-4">One colour re-skins your whole shop — buttons, links, highlights and a soft tint behind the page. You're seeing it live on this page now.</p>

            <div class="grid grid-cols-5 sm:grid-cols-10 gap-2">
                <button
                    v-for="p in guide.presets" :key="p.hex"
                    @click="pickColor(p.hex)"
                    :title="p.name"
                    :aria-label="p.name"
                    :aria-pressed="selectedHex === p.hex.toUpperCase()"
                    class="group relative aspect-square rounded-full border-2 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/40"
                    :class="selectedHex === p.hex.toUpperCase() ? 'border-black/70' : 'border-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]'"
                    :style="{ backgroundColor: p.hex }"
                >
                    <Check v-if="selectedHex === p.hex.toUpperCase()" class="absolute inset-0 m-auto w-4 h-4 text-white" />
                </button>
            </div>

            <div class="mt-5 pt-4 border-t border-gold/10">
                <label class="text-[10px] tracking-widest uppercase text-black/55 block mb-2">Or your exact brand colour</label>
                <div class="flex flex-wrap items-center gap-2">
                    <input
                        v-model="customColor"
                        @keyup.enter="applyCustom"
                        placeholder="#C2338B  or  194, 51, 139"
                        class="w-full sm:w-64 border border-black/15 px-3 py-2 text-sm font-mono focus:outline-none focus:border-gold"
                        autocapitalize="off" spellcheck="false"
                    />
                    <button @click="applyCustom" :disabled="!customColor.trim() || saving === 'theme'" class="bg-gold text-white px-5 py-2 text-[10px] font-semibold tracking-[0.25em] uppercase hover:bg-gold-dark disabled:opacity-40">Apply</button>
                    <span v-if="isCustomColor" class="inline-flex items-center gap-2 text-xs text-black/55">
                        <span class="w-4 h-4 rounded-full border border-black/10" :style="{ backgroundColor: selectedHex }"></span> Using {{ selectedHex }}
                    </span>
                </div>
                <p class="text-[11px] text-black/45 mt-2 flex items-start gap-1.5"><Info class="w-3 h-3 mt-0.5 flex-shrink-0" /> Hex (<span class="font-mono">#RRGGBB</span> or <span class="font-mono">#RGB</span>) or RGB both work. Very light colours are deepened a little automatically, so the white text on your buttons stays readable.</p>
            </div>
        </section>

        <!-- ═══ 2. Top bar ══════════════════════════════════════════════ -->
        <section class="bg-white border border-gold/15 p-5">
            <h4 class="font-display text-sm tracking-widest uppercase flex items-center gap-2 mb-1"><Megaphone class="w-4 h-4 text-gold" /> Top bar</h4>
            <p class="text-xs text-black/55 mb-4">The scrolling strip at the very top of every page.</p>

            <div class="grid sm:grid-cols-2 gap-2 mb-4">
                <button v-for="o in [{ v: 'default', t: 'BLESSLUXE messages', d: 'New arrivals, returns, rewards, free shipping.' }, { v: 'custom', t: 'My own messages', d: 'Your voice — a welcome, a launch, a code.' }]"
                    :key="o.v" @click="setTopBarMode(o.v)"
                    :class="['text-left p-3 border transition-colors', look.top_bar_mode === o.v ? 'border-gold bg-gold/5' : 'border-black/10 hover:border-gold/50']">
                    <span class="flex items-center gap-2 text-sm font-medium"><span :class="['w-3.5 h-3.5 rounded-full border-2 flex-shrink-0', look.top_bar_mode === o.v ? 'border-gold bg-gold' : 'border-black/25']"></span>{{ o.t }}</span>
                    <span class="block text-[11px] text-black/50 mt-1 pl-5">{{ o.d }}</span>
                </button>
            </div>

            <div v-if="look.top_bar_mode === 'custom'">
                <div v-for="(m, i) in messages" :key="i" class="flex items-center gap-2 mb-2">
                    <input v-model="messages[i]" :maxlength="guide.message_length" :placeholder="['Welcome to my edit', 'New pieces every Friday', 'Message me for sizing help'][i] || 'Another line'" class="flex-1 min-w-0 border border-black/15 px-3 py-2 text-sm focus:outline-none focus:border-gold" />
                    <span class="text-[10px] text-black/35 tabular-nums w-10 text-right flex-shrink-0">{{ (m || '').length }}/{{ guide.message_length }}</span>
                    <button @click="removeMessage(i)" class="w-9 h-9 inline-flex items-center justify-center text-black/35 hover:text-red-600 flex-shrink-0" aria-label="Remove line"><X class="w-4 h-4" /></button>
                </div>
                <div class="flex flex-wrap items-center gap-3 mt-3">
                    <button v-if="messages.length < guide.max_messages" @click="addMessage" class="text-[10px] tracking-widest uppercase text-gold-dark inline-flex items-center gap-1 hover:text-gold"><Plus class="w-3 h-3" /> Add a line</button>
                    <button @click="saveMessages" :disabled="saving === 'topbar'" class="bg-gold text-white px-5 py-2 text-[10px] font-semibold tracking-[0.25em] uppercase hover:bg-gold-dark disabled:opacity-40 ml-auto">Save top bar</button>
                </div>
                <p class="text-[11px] text-black/45 mt-3 flex items-start gap-1.5"><Info class="w-3 h-3 mt-0.5 flex-shrink-0" /> Up to {{ guide.max_messages }} short lines, {{ guide.message_length }} characters each — they're shown in capitals and scroll past, so keep them punchy. Leave it empty and the BLESSLUXE messages show.</p>
            </div>
        </section>

        <!-- ═══ 3. Hero ═════════════════════════════════════════════════ -->
        <section class="bg-white border border-gold/15 p-5">
            <h4 class="font-display text-sm tracking-widest uppercase flex items-center gap-2 mb-1"><Images class="w-4 h-4 text-gold" /> Hero banner</h4>
            <p class="text-xs text-black/55 mb-4">The big picture at the top of your home page — the first thing a shopper sees.</p>

            <div class="grid sm:grid-cols-2 gap-2 mb-5">
                <button v-for="o in [{ v: 'default', t: 'BLESSLUXE banner', d: 'Always current, nothing to maintain.' }, { v: 'custom', t: 'My own slides', d: 'Upload, link a YouTube video, or design one with AI.' }]"
                    :key="o.v" @click="setHeroMode(o.v)"
                    :class="['text-left p-3 border transition-colors', look.hero_mode === o.v ? 'border-gold bg-gold/5' : 'border-black/10 hover:border-gold/50']">
                    <span class="flex items-center gap-2 text-sm font-medium"><span :class="['w-3.5 h-3.5 rounded-full border-2 flex-shrink-0', look.hero_mode === o.v ? 'border-gold bg-gold' : 'border-black/25']"></span>{{ o.t }}</span>
                    <span class="block text-[11px] text-black/50 mt-1 pl-5">{{ o.d }}</span>
                </button>
            </div>

            <!-- Live preview: the real hero component, in the real shapes. -->
            <div class="bg-cream-dark/40 border border-gold/10 p-3 mb-5">
                <div class="flex items-center justify-between mb-2">
                    <p class="text-[10px] tracking-widest uppercase text-black/50">{{ ai.result ? 'Preview of your new slide' : 'How your shop opens' }}</p>
                    <div class="flex gap-1">
                        <button v-for="d in [{ v: 'desktop', i: 'Monitor', l: 'Computer' }, { v: 'phone', i: 'Smartphone', l: 'Phone' }]" :key="d.v" @click="device = d.v"
                            :class="['h-8 px-2.5 inline-flex items-center gap-1.5 text-[10px] tracking-widest uppercase transition-colors', device === d.v ? 'bg-gold text-white' : 'text-black/50 hover:text-gold']">
                            <component :is="d.i" class="w-3.5 h-3.5" /> <span class="hidden sm:inline">{{ d.l }}</span>
                        </button>
                    </div>
                </div>
                <HeroSlideshow :slides="previewSlides" :fallback="fallback" preview :phone="device === 'phone'" />
                <p v-if="device === 'phone'" class="text-[11px] text-black/45 mt-2 text-center">Phones show a tall slice of the middle. If your subject is cut off, change "Keep in view" on that slide.</p>
            </div>

            <!-- Size guide -->
            <div class="border border-gold/20 bg-gold/5 p-3 mb-5 text-xs text-black/65 leading-relaxed">
                <p class="font-medium text-black/80 mb-1.5 flex items-center gap-1.5"><Info class="w-3.5 h-3.5 text-gold-dark" /> Getting a banner that looks great</p>
                <ul class="space-y-1 pl-5 list-disc marker:text-gold">
                    <li><strong>Wide, landscape image — {{ guide.hero.ratio }}.</strong> Best at <strong>{{ guide.hero.recommended }}</strong>; at least {{ guide.hero.minimum }} or it will look soft on large screens.</li>
                    <li>{{ guide.hero.formats }}, up to {{ guide.hero.max_mb }} MB.</li>
                    <li><strong>Keep the person or product in the middle.</strong> Your headline sits on the left, and phones crop the sides away — check the Phone preview.</li>
                    <li>Avoid images with writing on them; your headline is added on top.</li>
                    <li>YouTube videos play silently on a loop behind your headline — short, calm clips work best.</li>
                </ul>
            </div>

            <!-- Existing slides -->
            <ul v-if="slides.length" class="space-y-2 mb-4">
                <li v-for="(s, i) in slides" :key="s.id" class="border border-black/10">
                    <div class="flex items-center gap-3 p-2">
                        <span class="w-24 sm:w-32 aspect-[16/9] bg-cream-dark overflow-hidden flex-shrink-0 relative">
                            <img :src="thumb(s)" class="w-full h-full object-cover" :class="!s.is_active && 'opacity-40 grayscale'" alt="" />
                            <Youtube v-if="s.media_type === 'youtube'" class="absolute bottom-1 right-1 w-4 h-4 text-white drop-shadow" />
                            <Sparkles v-else-if="s.source === 'ai'" class="absolute bottom-1 right-1 w-3.5 h-3.5 text-white drop-shadow" />
                        </span>
                        <span class="min-w-0 flex-1">
                            <span class="block text-sm truncate">{{ s.heading || 'No headline — uses the default' }}</span>
                            <span class="block text-[10px] tracking-widest uppercase" :class="s.is_active ? 'text-emerald-600' : 'text-black/35'">{{ s.is_active ? 'Showing' : 'Hidden' }}</span>
                        </span>
                        <span class="flex items-center flex-shrink-0">
                            <button @click="move(i, -1)" :disabled="i === 0" class="w-8 h-9 inline-flex items-center justify-center text-black/40 hover:text-gold disabled:opacity-20" aria-label="Move up"><ArrowUp class="w-4 h-4" /></button>
                            <button @click="move(i, 1)" :disabled="i === slides.length - 1" class="w-8 h-9 inline-flex items-center justify-center text-black/40 hover:text-gold disabled:opacity-20" aria-label="Move down"><ArrowDown class="w-4 h-4" /></button>
                            <button @click="patchSlide(s, { is_active: !s.is_active })" class="w-8 h-9 inline-flex items-center justify-center text-black/40 hover:text-gold" :aria-label="s.is_active ? 'Hide' : 'Show'"><component :is="s.is_active ? 'Eye' : 'EyeOff'" class="w-4 h-4" /></button>
                            <button @click="editing = editing === s.id ? null : s.id; adding = null" class="px-2 h-9 text-[10px] tracking-widest uppercase text-gold-dark hover:text-gold">{{ editing === s.id ? 'Close' : 'Edit' }}</button>
                            <button @click="remove(s)" class="w-8 h-9 inline-flex items-center justify-center text-black/40 hover:text-red-600" aria-label="Remove"><Trash2 class="w-4 h-4" /></button>
                        </span>
                    </div>
                    <div v-if="editing === s.id" class="border-t border-black/10 p-3 bg-cream-dark/20 grid sm:grid-cols-2 gap-2">
                        <input v-model="s.heading" maxlength="80" placeholder="Headline" class="border border-black/15 px-3 py-2 text-sm sm:col-span-2" />
                        <input v-model="s.subheading" maxlength="160" placeholder="A line beneath it (optional)" class="border border-black/15 px-3 py-2 text-sm sm:col-span-2" />
                        <input v-model="s.cta_label" maxlength="40" placeholder="Button text, e.g. Shop the edit" class="border border-black/15 px-3 py-2 text-sm" />
                        <input v-model="s.cta_href" placeholder="Button goes to, e.g. /shop" class="border border-black/15 px-3 py-2 text-sm font-mono" />
                        <label class="text-xs text-black/60 flex items-center gap-2 sm:col-span-2">Keep in view on phones:
                            <select v-model="s.focus" class="border border-black/15 px-2 py-1.5 text-sm"><option value="left">Left side</option><option value="center">Middle</option><option value="right">Right side</option></select>
                        </label>
                        <button @click="saveEdit(s)" class="bg-gold text-white px-5 py-2 text-[10px] font-semibold tracking-[0.25em] uppercase hover:bg-gold-dark sm:col-span-2 sm:justify-self-end">Save slide</button>
                    </div>
                </li>
            </ul>
            <p v-else class="text-sm text-black/45 mb-4">No slides yet. Add your first one below — your shop keeps the BLESSLUXE banner until you do.</p>

            <!-- Add a slide: three ways -->
            <div v-if="!adding">
                <p class="text-[10px] tracking-widest uppercase text-black/50 mb-2">Add a slide <span class="text-black/35">· {{ slides.length }} of {{ guide.max_slides }}</span></p>
                <div v-if="canAddSlide" class="grid sm:grid-cols-3 gap-2">
                    <button @click="startAdding('upload')" class="p-4 border border-black/10 hover:border-gold text-left transition-colors">
                        <Upload class="w-5 h-5 text-gold mb-2" /><span class="block text-sm font-medium">Upload an image</span><span class="block text-[11px] text-black/50 mt-0.5">A photo you already have.</span>
                    </button>
                    <button @click="startAdding('youtube')" class="p-4 border border-black/10 hover:border-gold text-left transition-colors">
                        <Youtube class="w-5 h-5 text-gold mb-2" /><span class="block text-sm font-medium">Use a YouTube video</span><span class="block text-[11px] text-black/50 mt-0.5">Paste a link; it plays silently.</span>
                    </button>
                    <button @click="startAdding('ai')" :disabled="!guide.ai.available" class="p-4 border border-black/10 hover:border-gold text-left transition-colors disabled:opacity-45 disabled:hover:border-black/10">
                        <Sparkles class="w-5 h-5 text-gold mb-2" /><span class="block text-sm font-medium">Design one with AI</span>
                        <span class="block text-[11px] text-black/50 mt-0.5">{{ guide.ai.available ? `Describe it; we'll create it. ${guide.ai.remaining} left today.` : 'Not switched on yet.' }}</span>
                    </button>
                </div>
                <p v-else class="text-xs text-black/50">You've reached {{ guide.max_slides }} slides. Remove one to add another.</p>
            </div>

            <!-- The add form -->
            <div v-else class="border border-gold/30 bg-cream-dark/20 p-4">
                <div class="flex items-center justify-between mb-3">
                    <p class="font-display text-sm tracking-widest uppercase">{{ { upload: 'Upload an image', youtube: 'Use a YouTube video', ai: 'Design one with AI' }[adding] }}</p>
                    <button @click="cancelAdding" class="w-9 h-9 inline-flex items-center justify-center text-black/40 hover:text-black" aria-label="Cancel"><X class="w-4 h-4" /></button>
                </div>

                <!-- upload -->
                <template v-if="adding === 'upload'">
                    <label class="block border-2 border-dashed border-gold/40 hover:border-gold p-6 text-center cursor-pointer transition-colors bg-white">
                        <img v-if="draft.fileUrl" :src="draft.fileUrl" class="mx-auto max-h-40 mb-2" alt="" />
                        <Upload v-else class="w-6 h-6 text-gold mx-auto mb-2" />
                        <span class="block text-sm">{{ draft.file ? draft.file.name : 'Choose an image' }}</span>
                        <span class="block text-[11px] text-black/45 mt-1">{{ guide.hero.recommended }} · {{ guide.hero.formats }} · up to {{ guide.hero.max_mb }} MB</span>
                        <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onFile" />
                    </label>
                </template>

                <!-- youtube -->
                <template v-else-if="adding === 'youtube'">
                    <input v-model="draft.youtube_url" placeholder="https://www.youtube.com/watch?v=…" class="w-full border border-black/15 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-gold" inputmode="url" autocapitalize="off" />
                    <p class="text-[11px] text-black/45 mt-1.5">On YouTube press <strong>Share</strong> and paste the link here. The video must be public and allow embedding.</p>
                </template>

                <!-- ai wizard -->
                <template v-else>
                    <p class="text-xs text-black/60 mb-2"><strong>1.</strong> Pick a mood</p>
                    <div class="flex flex-wrap gap-1.5 mb-3">
                        <button v-for="st in styles" :key="st" @click="ai.style = st" :class="['px-3 py-1.5 rounded-full text-[11px] transition-colors', ai.style === st ? 'bg-gold text-white' : 'bg-white border border-black/10 text-black/60 hover:border-gold']">{{ st }}</button>
                    </div>
                    <p class="text-xs text-black/60 mb-2"><strong>2.</strong> Describe the scene</p>
                    <textarea v-model="ai.prompt" rows="3" maxlength="600" placeholder="e.g. A woman in a flowing emerald dress walking through a sunlit marble lobby, warm and elegant" class="w-full border border-black/15 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-gold"></textarea>
                    <div class="flex flex-wrap items-center gap-3 mt-2">
                        <button @click="generate" :disabled="ai.generating || !guide.ai.remaining" class="bg-black text-white px-5 py-2.5 text-[10px] font-semibold tracking-[0.25em] uppercase hover:bg-black/80 disabled:opacity-40 inline-flex items-center gap-2">
                            <LoaderCircle v-if="ai.generating" class="w-3.5 h-3.5 animate-spin" /><Sparkles v-else class="w-3.5 h-3.5" />
                            {{ ai.generating ? 'Designing… about 20 seconds' : (ai.result ? 'Try another' : 'Create my banner') }}
                        </button>
                        <span class="text-[11px] text-black/45">{{ guide.ai.remaining }} of {{ guide.ai.daily_limit }} designs left today</span>
                    </div>
                    <p v-if="ai.result" class="text-xs text-emerald-700 mt-3 flex items-center gap-1.5"><Check class="w-3.5 h-3.5" /> Created in the right shape for a banner — see it in the preview above, then add your words below.</p>
                </template>

                <!-- words — same for all three -->
                <div v-if="adding !== 'ai' || ai.result" class="grid sm:grid-cols-2 gap-2 mt-4 pt-4 border-t border-gold/15">
                    <p class="text-xs text-black/60 sm:col-span-2"><strong>{{ adding === 'ai' ? '3.' : '' }}</strong> Your words <span class="text-black/40">— all optional; blank uses the BLESSLUXE wording</span></p>
                    <input v-model="draft.heading" maxlength="80" placeholder="Headline, e.g. The Summer Edit" class="border border-black/15 bg-white px-3 py-2 text-sm sm:col-span-2" />
                    <input v-model="draft.subheading" maxlength="160" placeholder="A line beneath it" class="border border-black/15 bg-white px-3 py-2 text-sm sm:col-span-2" />
                    <input v-model="draft.cta_label" maxlength="40" placeholder="Button text, e.g. Shop the edit" class="border border-black/15 bg-white px-3 py-2 text-sm" />
                    <input v-model="draft.cta_href" placeholder="/shop" class="border border-black/15 bg-white px-3 py-2 text-sm font-mono" />
                    <label class="text-xs text-black/60 flex items-center gap-2 sm:col-span-2">Keep in view on phones:
                        <select v-model="draft.focus" class="border border-black/15 px-2 py-1.5 text-sm bg-white"><option value="left">Left side</option><option value="center">Middle</option><option value="right">Right side</option></select>
                    </label>
                    <p class="text-[11px] text-black/45 sm:col-span-2">The button can only link to a page in your shop (it starts with <span class="font-mono">/</span>).</p>
                    <div class="sm:col-span-2 flex justify-end gap-2 mt-1">
                        <button @click="cancelAdding" class="px-4 py-2.5 text-[10px] tracking-[0.25em] uppercase text-black/55 hover:text-black">Cancel</button>
                        <button @click="saveSlide" :disabled="busy" class="bg-gold text-white px-6 py-2.5 text-[10px] font-semibold tracking-[0.25em] uppercase hover:bg-gold-dark disabled:opacity-40 inline-flex items-center gap-2">
                            <LoaderCircle v-if="busy" class="w-3.5 h-3.5 animate-spin" /> Add to my shop
                        </button>
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>
