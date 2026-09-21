<script>
import { api } from '../../lib/api.js';
import { toastError } from '../../lib/dialog.js';
import { authStore } from '../auth-store.js';
import { hiveStore, whatsappShare } from '../hive-store.js';
import LookCard from '../components/hive/LookCard.vue';
import FitEditor from '../components/hive/FitEditor.vue';
import PageEditor from '../components/hive/PageEditor.vue';
import ReportSheet from '../components/hive/ReportSheet.vue';
import GiftSheet from '../components/hive/GiftSheet.vue';
import EarningsPanel from '../components/hive/EarningsPanel.vue';
import SellerShop from '../components/hive/SellerShop.vue';
import ClosetPanel from '../components/hive/ClosetPanel.vue';
import SellerBadge from '../components/hive/SellerBadge.vue';
import { UserRound, MapPin, Share2, Pencil, Plus, Flag, X, Lock, ShoppingBag, LoaderCircle, Ruler, Images, Coins, Play, Shirt, Star } from 'lucide-vue-next';

const FIT_LABELS = {
    body_shape: 'Shape', size_top: 'Tops', size_bottom: 'Bottoms', size_dress: 'Dresses', size_shoe: 'Shoes',
    height_cm: 'Height', bust_cm: 'Bust', waist_cm: 'Waist', hips_cm: 'Hips',
};

/**
 * blessluxe.com/@handle — one person's page: Looks, Fit, Shop.
 *
 * Every customer has one. Being an affiliate doesn't change the page, it adds
 * the Shop tab — the same page, now able to earn.
 */
export default {
    name: 'HiveProfilePage',
    components: { LookCard, FitEditor, PageEditor, ReportSheet, GiftSheet, EarningsPanel, SellerShop, ClosetPanel, SellerBadge, Coins, Play, Shirt, Star, UserRound, MapPin, Share2, Pencil, Plus, Flag, X, Lock, ShoppingBag, LoaderCircle, Ruler, Images },
    data() {
        return {
            auth: authStore.state,
            page: null,
            looks: [],
            next: null,
            loading: true,
            loadingMore: false,
            notFound: false,
            tab: 'looks',
            open: null,          // the look shown full-size
            followBusy: false,
            editing: false,
            openWithComments: false,
            observer: null,
            reporting: null, gifting: null,
        };
    },
    computed: {
        handle() { return String(this.$route.params.handle || '').toLowerCase(); },
        tabs() {
            const t = [{ key: 'looks', label: 'Looks', icon: 'Images' }, { key: 'fit', label: 'Fit', icon: 'Ruler' }];
            if (this.page?.shop_code || this.page?.is_me) t.push({ key: 'shop', label: 'Shop', icon: 'ShoppingBag' });
            if (this.page?.is_me) t.push({ key: 'closet', label: 'Closet', icon: 'Shirt' }, { key: 'earned', label: 'Earned', icon: 'Coins' });
            return t;
        },
        fitRows() {
            const fit = this.page?.fit || {};
            return Object.keys(FIT_LABELS).filter((k) => fit[k] != null).map((k) => ({
                label: FIT_LABELS[k],
                value: k.endsWith('_cm') ? `${fit[k]} cm` : (k === 'body_shape' && fit[k] === 'inverted' ? 'Inverted triangle' : fit[k]),
            }));
        },
        shareHref() {
            const text = this.page.is_me ? 'Follow my looks on Bless Hive —' : `See ${this.page.display_name} on Bless Hive —`;
            return whatsappShare(text, `/@${this.page.handle}`);
        },
    },
    watch: {
        handle() { this.load(true); },
        '$route.query.tab'(v) { if (v) this.tab = v; },
        '$route.query.look'(v) { if (v) this.openLinkedLook(); },
        'auth.signedIn'() { this.load(true); },
    },
    mounted() {
        if (this.$route.query.tab) this.tab = this.$route.query.tab;
        window.addEventListener('blessluxe:hive-posted', this.onPosted);
        this.observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && this.tab === 'looks') this.load(false);
        }, { rootMargin: '700px' });
        this.load(true).then(this.openLinkedLook);
    },
    beforeUnmount() {
        window.removeEventListener('blessluxe:hive-posted', this.onPosted);
        this.observer?.disconnect();
    },
    methods: {
        async load(reset) {
            if (!reset && (!this.next || this.loadingMore)) return;
            reset ? (this.loading = true) : (this.loadingMore = true);
            try {
                const qs = !reset && this.next ? `?before=${encodeURIComponent(this.next)}` : '';
                const d = await api.get(`/api/store/hive/pages/${encodeURIComponent(this.handle)}${qs}`);
                this.page = d.page;
                this.looks = reset ? d.looks : [...this.looks, ...d.looks];
                this.next = d.next;
                this.notFound = false;
                document.title = `${d.page.display_name} (@${d.page.handle}) · Bless Hive`;
                if (d.page.is_me) hiveStore.load();
                if (!this.tabs.some((t) => t.key === this.tab)) this.tab = 'looks';
            } catch (e) {
                if (e.status === 404) this.notFound = true;
                else toastError(e, "We couldn't load this page.");
            } finally {
                this.loading = false;
                this.loadingMore = false;
                this.$nextTick(() => { if (this.$refs.sentinel) this.observer?.observe(this.$refs.sentinel); });
            }
        },

        /** /@handle?look=ID — a shared look, or a notification about one. */
        async openLinkedLook() {
            const id = this.$route.query.look;
            if (!id || !this.page) return;
            this.openWithComments = true;
            const have = this.looks.find((l) => l.id === id);
            if (have) { this.open = have; return; }
            try { this.open = (await api.get(`/api/store/hive/looks/${encodeURIComponent(id)}`)).look; }
            catch { toastError(null, 'That look is no longer here.'); }
        },
        closeLook() {
            this.open = null;
            this.openWithComments = false;
            if (this.$route.query.look) this.$router.replace({ query: { ...this.$route.query, look: undefined } });
        },

        async toggleFollow() {
            if (this.followBusy) return;
            if (!(await hiveStore.ready(this.$router, this.$route))) return;
            this.followBusy = true;
            try {
                const d = await api[this.page.i_follow ? 'del' : 'post'](`/api/account/hive/follow/${encodeURIComponent(this.page.handle)}`);
                this.page.i_follow = d.following;
                this.page.followers = d.followers;
            } catch (e) { toastError(e); }
            finally { this.followBusy = false; }
        },

        async openEditor() {
            // The editor fills itself from my stored page, so have it first.
            if (await hiveStore.load()) this.editing = true;
        },
        compose() { hiveStore.compose(this.$router, this.$route); },
        onPosted(e) {
            if (!this.page?.is_me) return;
            this.looks.unshift(e.detail);
            this.page.looks += 1;
            this.tab = 'looks';
        },
        onRemoved(id) {
            this.looks = this.looks.filter((l) => l.id !== id);
            this.page.looks = Math.max(0, this.page.looks - 1);
            this.closeLook();
        },
        onPageSaved(me) {
            this.editing = false;
            // A new handle is a new URL.
            if (me.handle !== this.page.handle) this.$router.replace(`/@${me.handle}`);
            else this.page = { ...this.page, ...me };
        },
        onFitSaved(me) { this.page = { ...this.page, ...me }; },

        async gift(target) { if (await hiveStore.ready(this.$router, this.$route)) this.gifting = target; },
        report(subject) {
            if (!this.auth.signedIn) {
                this.$router.push({ path: '/account/login', query: { next: this.$route.fullPath } });
                return;
            }
            this.reporting = subject;
        },
        onReported(subject) {
            if (subject.type === 'look') { this.looks = this.looks.filter((l) => l.id !== subject.id); this.closeLook(); }
        },
    },
};
</script>

<template>
    <div class="max-w-3xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
        <div v-if="loading && !page" class="animate-pulse">
            <div class="flex items-center gap-5 mb-8"><div class="w-24 h-24 rounded-full bg-cream-dark"></div><div class="flex-1 space-y-3"><div class="h-5 w-40 bg-cream-dark rounded"></div><div class="h-3 w-24 bg-cream-dark rounded"></div></div></div>
            <div class="grid grid-cols-3 gap-1"><div v-for="n in 6" :key="n" class="aspect-[4/5] bg-cream-dark"></div></div>
        </div>

        <div v-else-if="notFound" class="text-center py-24">
            <h1 class="font-display text-2xl tracking-widest uppercase mb-3">Page not found</h1>
            <p class="text-black/55 mb-8">There's nobody at @{{ handle }} — the link may be old.</p>
            <router-link to="/hive" class="inline-block bg-gold text-white px-8 py-3.5 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark">Back to the Hive</router-link>
        </div>

        <template v-else-if="page">
            <!-- ─── Who ─────────────────────────────────────────────── -->
            <header class="flex items-start gap-4 sm:gap-7 mb-6">
                <span class="w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-cream-dark border border-gold/30 flex items-center justify-center flex-shrink-0">
                    <img v-if="page.avatar_url" :src="page.avatar_url" :alt="page.display_name" class="w-full h-full object-cover" />
                    <UserRound v-else class="w-8 h-8 text-black/25" />
                </span>
                <div class="min-w-0 flex-1">
                    <h1 class="font-display text-xl sm:text-2xl tracking-wide break-words">{{ page.display_name }} <SellerBadge v-if="page.seller" label /></h1>
                    <p class="text-sm text-black/50 break-all">@{{ page.handle }}</p>
                    <div class="flex gap-5 mt-3 text-sm">
                        <span><strong class="font-medium">{{ page.looks }}</strong> <span class="text-black/50">looks</span></span>
                        <span><strong class="font-medium">{{ page.followers }}</strong> <span class="text-black/50">followers</span></span>
                        <span class="hidden min-[400px]:inline"><strong class="font-medium">{{ page.following }}</strong> <span class="text-black/50">following</span></span>
                    </div>
                </div>
            </header>

            <p v-if="page.reputation" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mb-2">
                <span v-if="page.reputation.rating" class="inline-flex items-center gap-1 font-medium"><Star class="w-3.5 h-3.5 text-gold fill-gold" /> {{ page.reputation.rating }} <span class="font-normal text-black/50">from {{ page.reputation.reviews }} {{ page.reputation.reviews === 1 ? 'buyer' : 'buyers' }}</span></span>
                <span class="text-black/50">{{ page.reputation.sales_label }}</span>
                <button @click="tab = 'shop'" class="text-gold-dark underline underline-offset-4">Visit the shop</button>
            </p>
            <p v-if="page.city" class="flex items-center gap-1.5 text-xs text-black/50 mb-1.5"><MapPin class="w-3.5 h-3.5" /> {{ page.city }}</p>
            <p v-if="page.bio" class="text-sm text-black/75 leading-relaxed whitespace-pre-line break-words mb-3">{{ page.bio }}</p>

            <p v-if="page.twin_match" class="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-cream border border-gold/30 text-xs text-gold-dark mb-3">
                <Ruler class="w-3.5 h-3.5" /> {{ page.twin_match }}% fit match with you
            </p>

            <div class="flex gap-2 mt-2 mb-7">
                <template v-if="page.is_me">
                    <button @click="compose" class="flex-1 min-w-0 bg-gold text-white py-3 text-xs font-semibold tracking-[0.12em] sm:tracking-[0.2em] uppercase whitespace-nowrap hover:bg-gold-dark inline-flex items-center justify-center gap-2"><Plus class="w-4 h-4 flex-shrink-0" /> New look</button>
                    <button @click="openEditor" class="flex-1 min-w-0 border border-black/15 py-3 text-xs tracking-[0.12em] sm:tracking-[0.2em] uppercase whitespace-nowrap hover:bg-cream inline-flex items-center justify-center gap-2"><Pencil class="w-3.5 h-3.5 flex-shrink-0" /> Edit page</button>
                </template>
                <button
                    v-else
                    @click="toggleFollow"
                    :disabled="followBusy"
                    :class="['flex-1 py-3 text-xs font-semibold tracking-[0.25em] uppercase transition-colors', page.i_follow ? 'border border-black/15 hover:bg-cream' : 'bg-gold text-white hover:bg-gold-dark']"
                >
                    {{ page.i_follow ? 'Following' : 'Follow' }}
                </button>
                <a :href="shareHref" target="_blank" rel="noopener" class="w-12 border border-black/15 inline-flex items-center justify-center hover:bg-cream flex-shrink-0" aria-label="Share on WhatsApp"><Share2 class="w-4 h-4" /></a>
                <button v-if="!page.is_me" @click="report({ type: 'page', id: page.handle })" class="w-12 border border-black/15 inline-flex items-center justify-center hover:bg-cream text-black/50 flex-shrink-0" aria-label="Report this page"><Flag class="w-4 h-4" /></button>
            </div>

            <!-- ─── Tabs ────────────────────────────────────────────── -->
            <nav class="scroll-strip flex border-b border-black/10 mb-5 overflow-x-auto [scrollbar-width:none]" role="tablist">
                <button
                    v-for="t in tabs"
                    :key="t.key"
                    role="tab"
                    :aria-selected="tab === t.key"
                    @click="tab = t.key"
                    :class="['flex-1 min-w-[5.25rem] px-2 py-3.5 inline-flex items-center justify-center gap-1.5 text-[11px] sm:text-xs tracking-[0.1em] sm:tracking-[0.18em] uppercase whitespace-nowrap border-b-2 -mb-px transition-colors', tab === t.key ? 'border-gold text-black' : 'border-transparent text-black/45 hover:text-black']"
                >
                    <component :is="t.icon" class="w-4 h-4" /> {{ t.label }}
                </button>
            </nav>

            <!-- Looks -->
            <section v-if="tab === 'looks'">
                <div v-if="!looks.length" class="text-center py-16">
                    <p class="text-black/55 mb-5">{{ page.is_me ? "You haven't shared a look yet." : 'No looks yet.' }}</p>
                    <button v-if="page.is_me" @click="compose" class="bg-gold text-white px-8 py-3.5 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark">Share your first look</button>
                </div>
                <div v-else class="grid grid-cols-3 gap-1">
                    <button v-for="l in looks" :key="l.id" @click="open = l" class="relative aspect-[4/5] bg-cream-dark overflow-hidden group" :aria-label="l.caption || 'Open look'">
                        <img v-if="l.images[0]" :src="l.images[0]" alt="" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
                        <span v-else class="absolute inset-0 bg-gradient-to-br from-zinc-700 to-black text-white flex flex-col items-center justify-center gap-1.5 text-[11px]"><Play class="w-5 h-5 fill-white" /> {{ l.embed?.label }}</span>
                        <Play v-if="l.video || l.embed" class="absolute top-2 right-2 w-4 h-4 text-white fill-white drop-shadow" />
                        <Images v-else-if="l.images.length > 1" class="absolute top-2 right-2 w-4 h-4 text-white drop-shadow" />
                        <ShoppingBag v-if="l.refs.length" class="absolute bottom-2 left-2 w-4 h-4 text-white drop-shadow" />
                    </button>
                </div>
                <div ref="sentinel" class="h-12 flex items-center justify-center">
                    <LoaderCircle v-if="loadingMore" class="w-5 h-5 animate-spin text-black/30" />
                </div>
            </section>

            <!-- Fit -->
            <section v-else-if="tab === 'fit'">
                <FitEditor v-if="page.is_me" @saved="onFitSaved" />
                <div v-else-if="fitRows.length">
                    <dl class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div v-for="r in fitRows" :key="r.label" class="bg-white border border-black/8 rounded-xl px-4 py-3">
                            <dt class="text-[10px] tracking-[0.2em] uppercase text-black/40">{{ r.label }}</dt>
                            <dd class="text-sm mt-0.5 capitalize">{{ r.value }}</dd>
                        </div>
                    </dl>
                    <p class="text-xs text-black/45 mt-4 leading-relaxed">Shared by {{ page.display_name }} to help others choose the right size.</p>
                </div>
                <div v-else class="text-center py-16">
                    <Lock class="w-6 h-6 text-black/25 mx-auto mb-3" />
                    <p class="text-black/55 text-sm">{{ page.display_name }} keeps their fit private.</p>
                </div>
            </section>

            <!-- Closet (mine only) -->
            <section v-else-if="tab === 'closet' && page.is_me"><ClosetPanel /></section>

            <!-- Earned (mine only) -->
            <section v-else-if="tab === 'earned' && page.is_me"><EarningsPanel /></section>

            <!-- Shop: a seller's line; for everyone else (own page only), how to become one. -->
            <section v-else-if="tab === 'shop'">
                <SellerShop v-if="page.shop_code" :handle="page.handle" :name="page.display_name" :mine="page.is_me" />
                <div v-else class="text-center py-12 px-4">
                    <ShoppingBag class="w-8 h-8 text-gold mx-auto mb-4" />
                    <h2 class="font-display text-xl tracking-widest uppercase mb-2">Sell from your page</h2>
                    <p class="text-sm text-black/55 mb-6 max-w-sm mx-auto">Approved sellers get a verified badge, a shop on their page, and commission whenever someone buys what they tag in a look.</p>
                    <router-link to="/affiliate" class="inline-block bg-gold text-white px-10 py-3.5 rounded-full text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark">Apply to sell</router-link>
                </div>
            </section>
        </template>

        <router-link v-if="page?.is_me" to="/shop" class="lg:hidden mt-10 flex items-center justify-center gap-2 text-xs tracking-widest uppercase text-black/45 py-3"><ShoppingBag class="w-4 h-4" /> Back to the shop</router-link>

        <!-- A look, opened from the grid. -->
        <div v-if="open" class="fixed inset-0 z-[80] flex items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true">
            <div class="absolute inset-0 bg-black/70" @click="closeLook"></div>
            <div class="relative w-full sm:max-w-md max-h-[100dvh] sm:max-h-[94dvh] overflow-y-auto overscroll-contain sm:rounded-2xl">
                <!-- Its own bar on a phone: the card's top-right corner is the "more" menu. -->
                <div class="sm:hidden sticky top-0 z-30 bg-white flex justify-end border-b border-black/8">
                    <button @click="closeLook" class="h-12 px-4 inline-flex items-center gap-1.5 text-xs tracking-widest uppercase text-black/60" aria-label="Close"><X class="w-4 h-4" /> Close</button>
                </div>
                <LookCard :key="open.id" :look="open" :open-comments="openWithComments" @removed="onRemoved" @report="report" @gift="gift" />
            </div>
        </div>

        <PageEditor v-if="editing" @close="editing = false" @saved="onPageSaved" />
        <GiftSheet :target="gifting" @close="gifting = null" />
        <ReportSheet :subject="reporting" @close="reporting = null" @sent="onReported" />
    </div>
</template>
