<script>
import { api } from '../../../lib/api.js';
import { confirmDialog, toast } from '../../../lib/dialog.js';

/**
 * Show Room → Studio.
 *
 * Proposal workshop: pick a logo + a base (your digitised product or a
 * garment preset), choose what to create (mockup / worn photography /
 * angle sheet / advert with script), optionally animate it, then bundle
 * selected concepts into a branded PDF proposal for your client.
 */
const GARMENTS = [
    "Men's polo shirt", "Ladies' blouse", "Men's dress shirt", "Ladies' dress shirt", 'Golf shirt',
    'Heavyweight t-shirt', 'Hoodie', 'Quarter-zip sweater', 'Softshell jacket', 'Puffer vest', 'Fleece jacket',
    'Baseball cap', 'Beanie', 'Bucket hat', 'Trucker cap',
    'Apron', 'Chef coat', 'Safety vest', 'Work overalls', 'Scrubs', 'Lab coat', 'Tracksuit',
    'Tote bag', 'Backpack', 'Duffel bag', 'Embroidered patch',
];
const PLACEMENTS = [
    'Left chest', 'Right chest', 'Left sleeve', 'Right sleeve', 'Full front', 'Upper back',
    'Full back', 'Cap front', 'Cap side', 'Beanie cuff', 'Collar / nape', 'Pocket', 'Bag panel',
];
const KINDS = [
    { id: 'mockup', label: 'Mockup',       blurb: 'Clean catalogue render' },
    { id: 'worn',   label: 'Worn',         blurb: 'Models wearing it' },
    { id: 'angles', label: 'Angle views',  blurb: 'Front · side · back sheet' },
    { id: 'advert', label: 'Advert',       blurb: 'Campaign visual + script' },
];

export default {
    name: 'StudioPanel',
    data() {
        return {
            customer: undefined,
            loading: true,

            logos: [],
            myProducts: [],
            items: [],

            garments: GARMENTS,
            placements: PLACEMENTS,
            kinds: KINDS,

            sel: {
                logoId: null,
                productId: null,
                garment: null,
                kind: 'mockup',
                audience: null,
                placement: 'Left chest',
                application: 'embroidered',
                prompt: '',
                withVideo: false,
            },
            creating: false,
            createError: '',
            poller: null,

            // Proposal builder
            selectedIds: [],
            proposal: { title: '', client_name: '', notes: '' },
            showProposal: false,
            exporting: false,
            proposalError: '',
            proposalUrl: null,

            scriptView: null,
        };
    },
    async mounted() {
        try {
            const d = await api.get('/api/account/me');
            this.customer = d.customer || null;
        } catch { this.customer = null; }
        if (this.customer) {
            await Promise.all([this.fetchLogos(), this.fetchMyProducts(), this.fetchItems()]);
            this.poller = setInterval(() => this.pollPending(), 6000);
        }
        this.loading = false;
    },
    beforeUnmount() { clearInterval(this.poller); },
    computed: {
        needsAudience() { return ['worn', 'advert'].includes(this.sel.kind); },
        canCreate() {
            return !!this.sel.logoId
                && (!!this.sel.productId || !!this.sel.garment)
                && (!this.needsAudience || !!this.sel.audience || this.sel.kind === 'advert')
                && !this.creating;
        },
    },
    methods: {
        async fetchLogos() {
            try {
                const d = await api.get('/api/account/logos');
                this.logos = d.logos || [];
                if (this.logos.length && !this.sel.logoId) this.sel.logoId = this.logos[0].id;
            } catch { /* leave empty */ }
        },
        async fetchMyProducts() {
            try {
                const d = await api.get('/api/account/my-products');
                this.myProducts = d.products || [];
            } catch { /* leave empty */ }
        },
        async fetchItems() {
            try {
                const d = await api.get('/api/account/studio');
                this.items = d.items || [];
            } catch { /* leave empty */ }
        },
        pickProduct(p) {
            this.sel.productId = this.sel.productId === p.id ? null : p.id;
            if (this.sel.productId) this.sel.garment = null;
        },
        pickGarment(g) {
            this.sel.garment = this.sel.garment === g ? null : g;
            if (this.sel.garment) this.sel.productId = null;
        },
        async create() {
            this.creating = true;
            this.createError = '';
            try {
                const d = await api.post('/api/account/studio', {
                    logo_id:             this.sel.logoId,
                    kind:                this.sel.kind,
                    customer_product_id: this.sel.productId,
                    garment:             this.sel.garment,
                    audience:            this.needsAudience ? this.sel.audience : null,
                    placement:           this.sel.placement,
                    application:         this.sel.application,
                    prompt:              this.sel.prompt || null,
                    with_video:          this.sel.withVideo,
                });
                this.items.unshift(d.item);
                this.sel.prompt = '';
            } catch (e) {
                this.createError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not create the concept.';
            } finally {
                this.creating = false;
            }
        },
        async pollPending() {
            const pending = this.items.filter((i) => i.status === 'pending');
            for (const it of pending) {
                try {
                    const d = await api.get(`/api/account/studio/${it.id}`);
                    const idx = this.items.findIndex((x) => x.id === it.id);
                    if (idx >= 0) this.items[idx] = d.item;
                } catch { /* retry next tick */ }
            }
        },
        async remove(it) {
            if (!await confirmDialog({ title: 'Delete this concept?', confirmLabel: 'Delete', tone: 'danger' })) return;
            try {
                await api.del(`/api/account/studio/${it.id}`);
                this.items = this.items.filter((x) => x.id !== it.id);
                this.selectedIds = this.selectedIds.filter((id) => id !== it.id);
            } catch (e) {
                toast(e.payload?.error || 'Could not delete.', { tone: 'error' });
            }
        },
        toggleSelect(it) {
            const i = this.selectedIds.indexOf(it.id);
            if (i >= 0) this.selectedIds.splice(i, 1);
            else if (this.selectedIds.length < 20) this.selectedIds.push(it.id);
        },
        async exportProposal() {
            if (!this.selectedIds.length) return;
            this.exporting = true;
            this.proposalError = '';
            this.proposalUrl = null;
            try {
                const d = await api.post('/api/account/studio/proposal', {
                    item_ids: this.selectedIds,
                    title: this.proposal.title || null,
                    client_name: this.proposal.client_name || null,
                    notes: this.proposal.notes || null,
                });
                this.proposalUrl = d.url;
            } catch (e) {
                this.proposalError = e.payload?.error || 'Could not build the PDF.';
            } finally {
                this.exporting = false;
            }
        },
        mediaUrl(it) { return it.video_url || it.image_url; },
        downloadName(it) {
            return `blessluxe-studio-${it.kind}-${it.id.slice(-6)}.${it.video_url ? 'mp4' : 'png'}`;
        },
        kindLabel(id) { return this.kinds.find((k) => k.id === id)?.label || id; },
    },
};
</script>

<template>
    <div>
        <!-- Guest gate -->
        <div v-if="customer === null" class="border border-dashed border-gold/30 bg-cream/60 py-16 text-center">
            <p class="font-script text-3xl text-gold mb-2">Pitch it beautifully</p>
            <p class="text-sm text-black/60 mb-6">Sign in to mock up your logo on corporate wear and export client-ready proposals.</p>
            <router-link to="/account/login" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Sign in
            </router-link>
        </div>

        <template v-else-if="customer">
            <!-- Needs a logo first -->
            <div v-if="!loading && !logos.length" class="border border-dashed border-gold/30 bg-cream/60 py-16 text-center">
                <p class="font-script text-3xl text-gold mb-2">First, design a logo</p>
                <p class="text-sm text-black/60 mb-6">Studio concepts start from one of your logos — create one and come back.</p>
                <router-link to="/showroom/logos" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                    Go to Logos
                </router-link>
            </div>

            <template v-else>
                <!-- Composer -->
                <div class="border border-gold/20 bg-cream/40 p-6 mb-8 space-y-6">
                    <!-- 1. Logo -->
                    <div>
                        <p class="text-xs tracking-widest uppercase text-black/55 mb-3">1 · Your logo</p>
                        <div class="flex gap-3 overflow-x-auto pb-1">
                            <button
                                v-for="l in logos"
                                :key="l.id"
                                @click="sel.logoId = l.id"
                                :class="['relative shrink-0 w-20 h-20 bg-white overflow-hidden border-2 transition-colors p-1', sel.logoId === l.id ? 'border-gold' : 'border-gold/15 hover:border-gold/50']"
                            >
                                <img v-if="l.image_url" :src="l.image_url" :alt="l.name" class="w-full h-full object-contain" />
                            </button>
                        </div>
                    </div>

                    <!-- 2. Base garment -->
                    <div>
                        <p class="text-xs tracking-widest uppercase text-black/55 mb-3">2 · On what?</p>
                        <div v-if="myProducts.length" class="mb-3">
                            <p class="text-[10px] tracking-widest uppercase text-black/40 mb-2">Your products</p>
                            <div class="flex gap-3 overflow-x-auto pb-1">
                                <button
                                    v-for="p in myProducts"
                                    :key="p.id"
                                    @click="pickProduct(p)"
                                    :class="['relative shrink-0 w-20 h-20 bg-white overflow-hidden border-2 transition-colors p-1', sel.productId === p.id ? 'border-gold' : 'border-gold/15 hover:border-gold/50']"
                                >
                                    <img v-if="p.image_url" :src="p.image_url" :alt="p.name" class="w-full h-full object-contain" />
                                </button>
                            </div>
                        </div>
                        <p class="text-[10px] tracking-widest uppercase text-black/40 mb-2">Or a garment type</p>
                        <div class="flex flex-wrap gap-2">
                            <button
                                v-for="g in garments"
                                :key="g"
                                @click="pickGarment(g)"
                                :class="['px-3 py-1.5 text-xs border transition-colors', sel.garment === g ? 'bg-gold text-white border-gold' : 'border-gold/30 text-black/70 hover:border-gold']"
                            >
                                {{ g }}
                            </button>
                        </div>
                    </div>

                    <!-- 3. What to create -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                            <p class="text-xs tracking-widest uppercase text-black/55 mb-3">3 · Create a…</p>
                            <div class="grid grid-cols-2 gap-2">
                                <button
                                    v-for="k in kinds"
                                    :key="k.id"
                                    @click="sel.kind = k.id"
                                    :class="['text-left px-3 py-2.5 border transition-colors', sel.kind === k.id ? 'bg-gold text-white border-gold' : 'border-gold/30 hover:border-gold']"
                                >
                                    <span class="block text-xs font-semibold tracking-widest uppercase">{{ k.label }}</span>
                                    <span :class="['block text-[10px] mt-0.5', sel.kind === k.id ? 'text-white/80' : 'text-black/45']">{{ k.blurb }}</span>
                                </button>
                            </div>
                            <div v-if="needsAudience" class="mt-3">
                                <p class="text-[10px] tracking-widest uppercase text-black/40 mb-2">Who's wearing it?</p>
                                <div class="flex gap-2">
                                    <button
                                        v-for="a in ['men', 'women', 'family']"
                                        :key="a"
                                        @click="sel.audience = sel.audience === a ? null : a"
                                        :class="['px-4 py-1.5 text-xs border capitalize transition-colors', sel.audience === a ? 'bg-gold text-white border-gold' : 'border-gold/30 text-black/70 hover:border-gold']"
                                    >
                                        {{ a }}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div>
                            <p class="text-xs tracking-widest uppercase text-black/55 mb-3">4 · Placement & finish</p>
                            <div class="flex flex-wrap gap-2 mb-3">
                                <button
                                    v-for="pl in placements"
                                    :key="pl"
                                    @click="sel.placement = pl"
                                    :class="['px-3 py-1.5 text-xs border transition-colors', sel.placement === pl ? 'bg-gold text-white border-gold' : 'border-gold/30 text-black/70 hover:border-gold']"
                                >
                                    {{ pl }}
                                </button>
                            </div>
                            <div class="flex border border-gold/30 w-fit mb-3">
                                <button
                                    @click="sel.application = 'embroidered'"
                                    :class="['px-4 py-2 text-xs tracking-widest uppercase transition-colors', sel.application === 'embroidered' ? 'bg-gold text-white' : 'text-black/60 hover:text-black']"
                                >Embroidered</button>
                                <button
                                    @click="sel.application = 'printed'"
                                    :class="['px-4 py-2 text-xs tracking-widest uppercase transition-colors', sel.application === 'printed' ? 'bg-gold text-white' : 'text-black/60 hover:text-black']"
                                >Printed</button>
                            </div>
                            <textarea
                                v-model="sel.prompt"
                                rows="2"
                                placeholder="Optional direction — “navy garments”, “outdoor construction site setting”…"
                                class="w-full bg-white border border-gold/20 px-3 py-2.5 text-sm resize-none"
                            ></textarea>
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center gap-4">
                        <label class="flex items-center gap-2 text-xs tracking-widest uppercase text-black/60">
                            <input type="checkbox" v-model="sel.withVideo" />
                            Also create a video version
                        </label>
                        <button
                            @click="create"
                            :disabled="!canCreate"
                            class="bg-black text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold transition-colors disabled:opacity-50"
                        >
                            {{ creating ? 'Creating…' : 'Create Concept' }}
                        </button>
                        <p v-if="creating" class="text-[11px] text-black/45">Rendering{{ sel.withVideo ? ' — the video continues in the background' : '' }}… up to a minute.</p>
                    </div>
                    <p v-if="createError" class="text-sm text-red-600">{{ createError }}</p>
                </div>

                <!-- Proposal bar -->
                <div v-if="items.length" class="flex flex-wrap items-center justify-between gap-3 mb-6 border border-gold/20 bg-white px-4 py-3">
                    <p class="text-sm text-black/60">
                        <span class="font-medium text-black">{{ selectedIds.length }}</span> concept{{ selectedIds.length === 1 ? '' : 's' }} selected for your proposal
                    </p>
                    <button
                        @click="showProposal = !showProposal"
                        :disabled="!selectedIds.length"
                        class="bg-gold text-white px-6 py-2.5 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-50"
                    >
                        Export PDF Proposal
                    </button>
                </div>

                <!-- Proposal form -->
                <div v-if="showProposal && selectedIds.length" class="border border-gold/20 bg-cream/40 p-6 mb-8 space-y-3">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input v-model="proposal.title" placeholder="Proposal title (e.g. Acme Corp Uniform Concepts)" class="bg-white border border-gold/20 px-3 py-2.5 text-sm" />
                        <input v-model="proposal.client_name" placeholder="Client name (optional)" class="bg-white border border-gold/20 px-3 py-2.5 text-sm" />
                    </div>
                    <textarea v-model="proposal.notes" rows="2" placeholder="Intro notes for the client (optional)" class="w-full bg-white border border-gold/20 px-3 py-2.5 text-sm resize-none"></textarea>
                    <p v-if="proposalError" class="text-sm text-red-600">{{ proposalError }}</p>
                    <div class="flex items-center gap-4">
                        <button
                            @click="exportProposal"
                            :disabled="exporting"
                            class="bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-60"
                        >
                            {{ exporting ? 'Building PDF…' : 'Build PDF' }}
                        </button>
                        <a
                            v-if="proposalUrl"
                            :href="proposalUrl"
                            target="_blank"
                            download
                            class="border border-gold text-gold px-6 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold hover:text-white transition-colors"
                        >
                            Download Proposal ↓
                        </a>
                    </div>
                </div>

                <!-- Concepts grid -->
                <div v-if="loading" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    <div v-for="n in 4" :key="n" class="aspect-[3/4] bg-cream-dark animate-pulse" />
                </div>
                <div v-else-if="!items.length" class="text-center text-sm text-black/50 py-10">
                    No concepts yet — compose your first one above.
                </div>
                <div v-else class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    <div v-for="it in items" :key="it.id" :class="['group border bg-white flex flex-col transition-colors', selectedIds.includes(it.id) ? 'border-gold' : 'border-gold/10']">
                        <div class="relative aspect-square overflow-hidden bg-cream-dark">
                            <video
                                v-if="it.video_url"
                                :src="it.video_url"
                                :poster="it.image_url || undefined"
                                controls
                                playsinline
                                class="w-full h-full object-cover"
                            />
                            <img v-else-if="it.image_url" :src="it.image_url" alt="Studio concept" class="w-full h-full object-cover" />

                            <div v-if="it.status === 'pending'" class="absolute inset-0 bg-black/45 flex flex-col items-center justify-center text-center px-4">
                                <p class="font-script text-2xl text-gold animate-pulse mb-1">Filming…</p>
                                <p class="text-[11px] text-white/80">The video version is rendering.</p>
                            </div>
                            <div v-else-if="it.status === 'failed'" class="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-center px-4">
                                <p class="text-sm text-white font-medium mb-1">Video failed</p>
                                <p class="text-[11px] text-white/75">{{ it.error || 'The image is still available below.' }}</p>
                            </div>

                            <span class="absolute top-2 left-2 bg-black/60 text-white text-[9px] tracking-widest uppercase px-2 py-1">{{ kindLabel(it.kind) }}</span>
                            <button
                                @click="toggleSelect(it)"
                                :class="['absolute top-2 right-2 w-6 h-6 rounded-full text-xs leading-none flex items-center justify-center transition-colors', selectedIds.includes(it.id) ? 'bg-gold text-white' : 'bg-white/85 text-black/50 hover:text-gold']"
                                :title="selectedIds.includes(it.id) ? 'Remove from proposal' : 'Add to proposal'"
                            >✓</button>
                        </div>
                        <div class="p-3 text-xs text-black/60 flex-1">
                            <p class="truncate capitalize">{{ it.label || it.garment || it.kind }}</p>
                            <p v-if="it.placement || it.application" class="truncate text-black/45">{{ [it.placement, it.application].filter(Boolean).join(' · ') }}</p>
                        </div>
                        <div class="flex border-t border-gold/10 text-[10px] tracking-widest uppercase">
                            <a :href="mediaUrl(it)" :download="downloadName(it)" class="flex-1 text-center py-2 text-black/60 hover:text-gold transition-colors">Download</a>
                            <button v-if="it.script" @click="scriptView = it" class="flex-1 py-2 text-black/60 hover:text-gold transition-colors border-l border-gold/10">Script</button>
                            <button @click="remove(it)" class="flex-1 py-2 text-black/60 hover:text-red-600 transition-colors border-l border-gold/10">Delete</button>
                        </div>
                    </div>
                </div>

                <!-- Script viewer -->
                <div v-if="scriptView" class="fixed inset-0 z-50 flex items-center justify-center p-6" @click.self="scriptView = null">
                    <div class="absolute inset-0 bg-black/40" @click="scriptView = null"></div>
                    <div class="relative bg-white max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl p-6">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="font-display text-lg tracking-widest uppercase">Advert Script</h3>
                            <button @click="scriptView = null" class="text-black/50 hover:text-black text-xl leading-none">×</button>
                        </div>
                        <pre class="text-sm text-black/75 whitespace-pre-wrap font-body leading-relaxed">{{ scriptView.script }}</pre>
                    </div>
                </div>
            </template>
        </template>
    </div>
</template>
