<script>
import { api } from '../../../lib/api.js';

/**
 * Show Room → Generations.
 *
 * Composer: pick an avatar + up to 4 products + an environment + optional
 * prompt → generate a personal image, or a video (Omni Flash animates the
 * composed still; pending rows poll until the clip is ready).
 * Results grid: preview, share, download, delete.
 */
const ENVIRONMENTS = [
    'Elegant minimalist studio',
    'Paris street at golden hour',
    'Runway show, spotlights',
    'Rooftop terrace at dusk',
    'Hotel rooftop pool',
    'Beach at sunset',
    'Windswept sand dunes',
    'Luxury boutique interior',
    'Marble hotel lobby',
    'Victorian townhouse interior',
    'Mid-century modern home',
    'English garden party',
    'Botanical garden',
    'Countryside meadow',
    'Urban street style, downtown',
    'Café terrace, morning light',
    'Art gallery opening',
    'City lights at night',
    'Desert at golden hour',
    'Snowy alpine chalet',
];

export default {
    name: 'GenerationsPanel',
    data() {
        return {
            customer: undefined,
            loading: true,

            avatars: [],
            products: [],
            productQuery: '',
            searching: false,

            environments: ENVIRONMENTS,
            sel: { avatarId: null, productIds: [], environment: null, prompt: '', kind: 'image' },

            generations: [],
            creating: false,
            createError: '',
            poller: null,
            copiedId: null,
        };
    },
    async mounted() {
        try {
            const d = await api.get('/api/account/me');
            this.customer = d.customer || null;
        } catch { this.customer = null; }
        if (this.customer) {
            await Promise.all([this.fetchAvatars(), this.fetchProducts(), this.fetchGenerations()]);
            this.poller = setInterval(() => this.pollPending(), 6000);
        }
        this.loading = false;
    },
    beforeUnmount() { clearInterval(this.poller); },
    computed: {
        selectedAvatar() { return this.avatars.find((a) => a.id === this.sel.avatarId) || null; },
        canCreate() { return !!this.sel.avatarId && !this.creating; },
        pendingCount() { return this.generations.filter((g) => g.status === 'pending').length; },
    },
    methods: {
        async fetchAvatars() {
            try {
                const d = await api.get('/api/account/avatars');
                this.avatars = d.avatars || [];
                if (this.avatars.length && !this.sel.avatarId) this.sel.avatarId = this.avatars[0].id;
            } catch { /* leave empty */ }
        },
        async fetchProducts() {
            this.searching = true;
            try {
                const q = this.productQuery ? `&q=${encodeURIComponent(this.productQuery)}` : '';
                const res = await fetch(`/api/store/products?limit=12&sort=newest${q}`);
                if (res.ok) this.products = (await res.json()).products || [];
            } finally { this.searching = false; }
        },
        async fetchGenerations() {
            try {
                const d = await api.get('/api/account/generations');
                this.generations = d.generations || [];
            } catch { /* leave empty */ }
        },
        toggleProduct(p) {
            const i = this.sel.productIds.indexOf(p.id);
            if (i >= 0) this.sel.productIds.splice(i, 1);
            else if (this.sel.productIds.length < 4) this.sel.productIds.push(p.id);
        },
        async create() {
            if (!this.sel.avatarId) { this.createError = 'Pick one of your avatars first.'; return; }
            this.creating = true;
            this.createError = '';
            try {
                const d = await api.post('/api/account/generations', {
                    avatar_id:   this.sel.avatarId,
                    kind:        this.sel.kind,
                    product_ids: this.sel.productIds,
                    environment: this.sel.environment,
                    prompt:      this.sel.prompt || null,
                });
                this.generations.unshift(d.generation);
                this.sel.prompt = '';
            } catch (e) {
                this.createError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not create the generation.';
            } finally {
                this.creating = false;
            }
        },
        async pollPending() {
            const pending = this.generations.filter((g) => g.status === 'pending');
            for (const g of pending) {
                try {
                    const d = await api.get(`/api/account/generations/${g.id}`);
                    const idx = this.generations.findIndex((x) => x.id === g.id);
                    if (idx >= 0) this.generations[idx] = d.generation;
                } catch { /* retry next tick */ }
            }
        },
        async remove(g) {
            if (!confirm('Delete this generation?')) return;
            try {
                await api.del(`/api/account/generations/${g.id}`);
                this.generations = this.generations.filter((x) => x.id !== g.id);
            } catch (e) {
                alert(e.payload?.error || 'Could not delete.');
            }
        },
        mediaUrl(g) { return g.video_url || g.image_url; },
        async share(g) {
            const url = window.location.origin + this.mediaUrl(g);
            const title = 'My BLESSLUXE look';
            if (navigator.share) {
                try { await navigator.share({ title, url }); return; } catch { /* fall through */ }
            }
            try {
                await navigator.clipboard.writeText(url);
                this.copiedId = g.id;
                setTimeout(() => { if (this.copiedId === g.id) this.copiedId = null; }, 2000);
            } catch { /* clipboard unavailable */ }
        },
        downloadName(g) {
            return `blessluxe-${g.kind}-${g.id.slice(-6)}.${g.video_url ? 'mp4' : 'png'}`;
        },
    },
};
</script>

<template>
    <div>
        <!-- Guest gate -->
        <div v-if="customer === null" class="border border-dashed border-gold/30 bg-cream/60 py-16 text-center">
            <p class="font-script text-3xl text-gold mb-2">Star in your own editorial</p>
            <p class="text-sm text-black/60 mb-6">Sign in to create shareable images and films of your avatar wearing BLESSLUXE pieces.</p>
            <router-link to="/account/login" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Sign in
            </router-link>
        </div>

        <template v-else-if="customer">
            <!-- No avatars yet -->
            <div v-if="!loading && !avatars.length" class="border border-dashed border-gold/30 bg-cream/60 py-16 text-center mb-8">
                <p class="font-script text-3xl text-gold mb-2">First, create an avatar</p>
                <p class="text-sm text-black/60 mb-6">Generations star one of your avatars — create one and come back.</p>
                <router-link to="/showroom/avatars" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                    Go to Avatars
                </router-link>
            </div>

            <!-- Composer -->
            <div v-else class="border border-gold/20 bg-cream/40 p-6 mb-10 space-y-6">
                <!-- 1. Avatar -->
                <div>
                    <p class="text-xs tracking-widest uppercase text-black/55 mb-3">1 · Your avatar</p>
                    <div class="flex gap-3 overflow-x-auto pb-1">
                        <button
                            v-for="a in avatars"
                            :key="a.id"
                            @click="sel.avatarId = a.id"
                            :class="['relative shrink-0 w-20 h-24 overflow-hidden border-2 transition-colors', sel.avatarId === a.id ? 'border-gold' : 'border-transparent hover:border-gold/40']"
                        >
                            <img v-if="a.image_url" :src="a.image_url" :alt="a.name" class="w-full h-full object-cover" />
                            <span class="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">{{ a.name }}</span>
                        </button>
                    </div>
                </div>

                <!-- 2. Products -->
                <div>
                    <div class="flex items-center justify-between mb-3">
                        <p class="text-xs tracking-widest uppercase text-black/55">2 · Products <span class="normal-case text-black/40">(optional, up to 4)</span></p>
                        <input
                            v-model="productQuery"
                            @keyup.enter="fetchProducts"
                            placeholder="Search pieces…"
                            class="bg-white border border-gold/20 px-3 py-1.5 text-xs w-44"
                        />
                    </div>
                    <div class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                        <button
                            v-for="p in products"
                            :key="p.id"
                            @click="toggleProduct(p)"
                            :class="['relative aspect-[3/4] overflow-hidden border-2 transition-colors bg-cream-dark', sel.productIds.includes(p.id) ? 'border-gold' : 'border-transparent hover:border-gold/40']"
                        >
                            <img v-if="p.thumbnail" :src="p.thumbnail" :alt="p.title" class="w-full h-full object-cover" />
                            <span class="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">{{ p.title }}</span>
                            <span v-if="sel.productIds.includes(p.id)" class="absolute top-1 right-1 w-4 h-4 bg-gold text-white text-[10px] leading-4 text-center rounded-full">✓</span>
                        </button>
                    </div>
                </div>

                <!-- 3. Environment -->
                <div>
                    <p class="text-xs tracking-widest uppercase text-black/55 mb-3">3 · Environment</p>
                    <div class="flex flex-wrap gap-2">
                        <button
                            v-for="env in environments"
                            :key="env"
                            @click="sel.environment = sel.environment === env ? null : env"
                            :class="['px-3 py-1.5 text-xs border transition-colors', sel.environment === env ? 'bg-gold text-white border-gold' : 'border-gold/30 text-black/70 hover:border-gold']"
                        >
                            {{ env }}
                        </button>
                    </div>
                </div>

                <!-- 4. Direction + kind -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-end">
                    <textarea
                        v-model="sel.prompt"
                        rows="2"
                        placeholder="Optional direction — “laughing, walking towards camera”, “rain-soaked street, cinematic”…"
                        class="w-full bg-white border border-gold/20 px-3 py-2.5 text-sm resize-none"
                    ></textarea>
                    <div class="flex items-center gap-3">
                        <div class="flex border border-gold/30">
                            <button
                                @click="sel.kind = 'image'"
                                :class="['px-5 py-2.5 text-xs tracking-widest uppercase transition-colors', sel.kind === 'image' ? 'bg-gold text-white' : 'text-black/60 hover:text-black']"
                            >Image</button>
                            <button
                                @click="sel.kind = 'video'"
                                :class="['px-5 py-2.5 text-xs tracking-widest uppercase transition-colors', sel.kind === 'video' ? 'bg-gold text-white' : 'text-black/60 hover:text-black']"
                            >Video</button>
                        </div>
                        <button
                            @click="create"
                            :disabled="!canCreate"
                            class="flex-1 bg-black text-white px-6 py-2.5 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold transition-colors disabled:opacity-50"
                        >
                            {{ creating ? 'Creating…' : 'Generate' }}
                        </button>
                    </div>
                </div>
                <p v-if="creating" class="text-[11px] text-black/45">
                    Composing your look{{ sel.kind === 'video' ? ' — the film keeps rendering in the background afterwards' : '' }}… up to a minute.
                </p>
                <p v-if="createError" class="text-sm text-red-600">{{ createError }}</p>
            </div>

            <!-- Results grid -->
            <div v-if="loading" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                <div v-for="n in 4" :key="n" class="aspect-[3/4] bg-cream-dark animate-pulse" />
            </div>
            <div v-else-if="!generations.length" class="text-center text-sm text-black/50 py-10">
                Nothing generated yet — your creations will appear here.
            </div>
            <div v-else class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                <div v-for="g in generations" :key="g.id" class="group border border-gold/10 bg-white flex flex-col">
                    <div class="relative aspect-[3/4] overflow-hidden bg-cream-dark">
                        <video
                            v-if="g.video_url"
                            :src="g.video_url"
                            :poster="g.image_url || undefined"
                            controls
                            playsinline
                            class="w-full h-full object-cover"
                        />
                        <img v-else-if="g.image_url" :src="g.image_url" alt="Generation" class="w-full h-full object-cover" />

                        <!-- Pending video overlay -->
                        <div v-if="g.status === 'pending'" class="absolute inset-0 bg-black/45 flex flex-col items-center justify-center text-center px-4">
                            <p class="font-script text-2xl text-gold animate-pulse mb-1">Filming…</p>
                            <p class="text-[11px] text-white/80">Your video is rendering — this can take a few minutes.</p>
                        </div>
                        <div v-else-if="g.status === 'failed'" class="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-center px-4">
                            <p class="text-sm text-white font-medium mb-1">Generation failed</p>
                            <p class="text-[11px] text-white/75">{{ g.error || 'Try again with a simpler brief.' }}</p>
                        </div>
                        <span class="absolute top-2 left-2 bg-black/60 text-white text-[9px] tracking-widest uppercase px-2 py-1">{{ g.kind }}</span>
                    </div>
                    <div class="p-3 text-xs text-black/60 flex-1">
                        <p v-if="g.product_titles.length" class="truncate">{{ g.product_titles.join(' · ') }}</p>
                        <p v-if="g.environment" class="truncate text-black/45">{{ g.environment }}</p>
                    </div>
                    <div class="flex border-t border-gold/10 text-[10px] tracking-widest uppercase">
                        <a
                            v-if="g.status === 'ready'"
                            :href="mediaUrl(g)"
                            :download="downloadName(g)"
                            class="flex-1 text-center py-2 text-black/60 hover:text-gold transition-colors"
                        >Download</a>
                        <button
                            v-if="g.status === 'ready'"
                            @click="share(g)"
                            class="flex-1 py-2 text-black/60 hover:text-gold transition-colors border-l border-gold/10"
                        >{{ copiedId === g.id ? 'Copied!' : 'Share' }}</button>
                        <button
                            @click="remove(g)"
                            class="flex-1 py-2 text-black/60 hover:text-red-600 transition-colors border-l border-gold/10"
                        >Delete</button>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
