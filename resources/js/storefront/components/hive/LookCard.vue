<script>
import { api } from '../../../lib/api.js';
import { confirmDialog, toast, toastError } from '../../../lib/dialog.js';
import { hiveStore, timeAgo, occasionLabel, whatsappShare } from '../../hive-store.js';
import LookComments from './LookComments.vue';
import SellerBadge from './SellerBadge.vue';
import { Heart, Ellipsis, Flag, Trash2, Share2, Package, ImageOff, UserRound, MessageCircle, BadgeCheck, Star, Trophy, Play, ExternalLink, RectangleVertical, RectangleHorizontal, Square, Proportions } from 'lucide-vue-next';

/**
 * One look: who, the photos, what she's wearing, and the three things you can
 * do about it (heart it, shop it, send it to someone on WhatsApp).
 *
 * Photo-first and light on data: images load lazily, only the first is fetched
 * until you swipe, and nothing autoplays.
 *
 * There is no like COUNT here for anyone but the author — see Hive::presentLook.
 */
export default {
    name: 'LookCard',
    components: { LookComments, SellerBadge, Heart, Ellipsis, Flag, Trash2, Share2, Package, ImageOff, UserRound, MessageCircle, BadgeCheck, Star, Trophy, Play, ExternalLink, RectangleVertical, RectangleHorizontal, Square, Proportions },
    props: {
        look: { type: Object, required: true },
        // On someone's own page the author row is repetition.
        showAuthor: { type: Boolean, default: true },
        // Opened from a notification about a comment: start with the thread showing.
        openComments: { type: Boolean, default: false },
    },
    emits: ['removed', 'report'],
    data() {
        return { slide: 0, menuOpen: false, busy: false, burst: false, talking: this.openComments, playing: false, watcher: null, loaded: false, reshaping: false };
    },
    computed: {
        when() { return timeAgo(this.look.created_at); },
        occasion() { return this.look.occasion ? occasionLabel(this.look.occasion) : null; },
        shape() { return this.look.embed?.shape || this.look.video?.shape || 'post'; },
        /**
         * The frame. Tall is capped in width rather than height, so a phone-shaped
         * clip keeps its true 9:16 on a desktop instead of becoming a letterbox.
         */
        frameClass() {
            return { tall: 'aspect-[9/16] w-full max-w-[24.75rem] mx-auto', wide: 'aspect-video w-full', post: 'aspect-[4/5] w-full' }[this.shape];
        },
        fitLabel() { return { small: 'Runs small', true: 'True to size', large: 'Runs large' }[this.look.try_on?.fit] || null; },
        shareHref() {
            const who = this.look.author.display_name || 'this look';
            return whatsappShare(`See ${who} on Bless Hive —`, `/@${this.look.author.handle}?look=${this.look.id}`);
        },
    },
    beforeUnmount() { this.watcher?.disconnect(); },
    methods: {
        /**
         * Nothing is downloaded until this tap — the label on the cover said
         * what it costs. Scrolling the clip off screen pauses it, so a feed
         * never has sound coming from somewhere you can't see.
         */
        play() {
            this.playing = true;
            this.$nextTick(() => {
                const v = this.$refs.video;
                if (!v) return;
                v.play().catch(() => {});
                this.watcher = new IntersectionObserver(([e]) => { if (!e.isIntersecting) v.pause(); }, { threshold: 0.25 });
                this.watcher.observe(v);
            });
        },

        async setShape(shape) {
            this.reshaping = false;
            if (shape === this.shape) return;
            const was = this.shape;
            const target = this.look.embed || this.look.video;
            target.shape = shape;                        // show it at once; put it back if the save fails
            try { await api.put(`/api/account/hive/looks/${this.look.id}/shape`, { shape }); }
            catch (e) { target.shape = was; toastError(e, "That didn't save — try again."); }
        },

        /** A seller's tag is a sale in waiting: enter their shop first, then open the piece. */
        openRef(e, r) {
            if (!this.look.author.seller || e.metaKey || e.ctrlKey) return;      // ordinary link, or "open in new tab"
            e.preventDefault();
            hiveStore.shopVia(this.$router, { look_id: this.look.id }, this.refPath(r));
        },

        refPath(r) { return r.type === 'pack' ? `/shop/packs/${r.handle}` : `/shop/${r.handle}`; },

        onSwipe(e) {
            const el = e.target;
            this.slide = Math.round(el.scrollLeft / el.clientWidth);
        },

        async toggleLike(forceOn = false) {
            if (this.busy || (forceOn && this.look.liked)) return;
            if (!(await hiveStore.ready(this.$router, this.$route))) return;

            // Optimistic: the heart answers the thumb, the network catches up.
            const next = forceOn ? true : !this.look.liked;
            const was = { liked: this.look.liked, likes: this.look.likes };
            this.look.liked = next;
            if (this.look.likes !== null) this.look.likes += next ? 1 : -1;
            if (next) { this.burst = true; setTimeout(() => { this.burst = false; }, 600); }

            this.busy = true;
            try {
                await api[next ? 'post' : 'del'](`/api/account/hive/looks/${this.look.id}/like`);
            } catch (e) {
                Object.assign(this.look, was);
                toastError(e, "That didn't save — try again.");
            } finally {
                this.busy = false;
            }
        },

        async remove() {
            this.menuOpen = false;
            if (!(await confirmDialog({ title: 'Take this look down?', body: 'It will be removed from your page and the feed, along with its photos.', confirmLabel: 'Take down', tone: 'danger' }))) return;
            try {
                await api.del(`/api/account/hive/looks/${this.look.id}`);
                toast('Look removed');
                this.$emit('removed', this.look.id);
            } catch (e) { toastError(e); }
        },

        report() {
            this.menuOpen = false;
            this.$emit('report', { type: 'look', id: this.look.id });
        },
    },
};
</script>

<template>
    <article class="bg-white border border-black/8 rounded-2xl overflow-hidden">
        <!-- Who -->
        <header class="flex items-center gap-3 px-3.5 py-3">
            <router-link v-if="showAuthor" :to="`/@${look.author.handle}`" class="flex items-center gap-3 min-w-0 flex-1 group">
                <span class="w-9 h-9 rounded-full overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0 border border-gold/20">
                    <img v-if="look.author.avatar_url" :src="look.author.avatar_url" alt="" loading="lazy" class="w-full h-full object-cover" />
                    <UserRound v-else class="w-4 h-4 text-black/30" />
                </span>
                <span class="min-w-0">
                    <span class="flex items-center gap-1 text-sm font-medium group-hover:text-gold-dark transition-colors"><span class="truncate">{{ look.author.display_name }}</span><SellerBadge v-if="look.author.seller" /></span>
                    <span class="block text-[11px] text-black/45 truncate">@{{ look.author.handle }} · {{ when }}</span>
                </span>
            </router-link>
            <span v-else class="flex-1 text-[11px] text-black/45">{{ when }}</span>

            <span v-if="occasion" class="hidden min-[380px]:inline-block px-2.5 py-1 rounded-full bg-cream text-[10px] tracking-widest uppercase text-gold-dark flex-shrink-0">{{ occasion }}</span>

            <div class="relative flex-shrink-0">
                <button @click="menuOpen = !menuOpen" class="w-11 h-11 -mr-2 inline-flex items-center justify-center text-black/45 hover:text-black" aria-label="More">
                    <Ellipsis class="w-5 h-5" />
                </button>
                <div v-if="menuOpen" class="fixed inset-0 z-10" @click="menuOpen = false"></div>
                <div v-if="menuOpen" class="absolute right-0 top-full z-20 bg-white border border-black/10 rounded-xl shadow-xl py-1.5 min-w-[11rem]">
                    <button v-if="look.is_mine && (look.embed || look.video)" @click="menuOpen = false; reshaping = true" class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-cream text-left">
                        <Proportions class="w-4 h-4" /> Change shape
                    </button>
                    <button v-if="look.is_mine" @click="remove" class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 text-left">
                        <Trash2 class="w-4 h-4" /> Take down
                    </button>
                    <button v-else @click="report" class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-cream text-left">
                        <Flag class="w-4 h-4" /> Report
                    </button>
                </div>
            </div>
        </header>

        <!-- Owner only: fix a clip or linked post that's showing in the wrong shape. -->
        <div v-if="reshaping" class="flex items-center gap-2 px-3.5 pb-3">
            <button
                v-for="sh in [{ k: 'tall', l: 'Portrait', i: 'RectangleVertical' }, { k: 'wide', l: 'Landscape', i: 'RectangleHorizontal' }, { k: 'post', l: 'Square', i: 'Square' }]"
                :key="sh.k"
                @click="setShape(sh.k)"
                :class="['flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-full text-xs border transition-colors', shape === sh.k ? 'border-gold bg-cream text-black' : 'border-black/10 text-black/60']"
            >
                <component :is="sh.i" class="w-4 h-4" /> {{ sh.l }}
            </button>
        </div>

        <!-- The photos. Double-tap to heart, swipe for more. -->
        <div class="relative bg-cream-dark">
            <!-- A post on another platform. Nothing is requested from that platform
                 until the tap: it costs data, and they will see the visit. The
                 frame's address was built by our server, never typed by a member. -->
            <div v-if="look.embed" class="bg-black"><div :class="frameClass">
                <iframe
                    v-if="loaded"
                    :src="look.embed.url"
                    :title="`${look.embed.label} post shared by ${look.author.display_name}`"
                    class="w-full h-full border-0 bg-white"
                    loading="lazy"
                    referrerpolicy="strict-origin-when-cross-origin"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
                    allowfullscreen
                ></iframe>
                <button v-else @click="loaded = true" class="relative block w-full h-full text-white" :aria-label="`Load this ${look.embed.label} post`">
                    <img v-if="look.images[0]" :src="look.images[0]" alt="" loading="lazy" decoding="async" class="absolute inset-0 w-full h-full object-cover opacity-55" />
                    <span v-else class="absolute inset-0 bg-gradient-to-br from-zinc-800 to-black"></span>
                    <span class="relative flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
                        <span class="w-16 h-16 rounded-full bg-black/55 flex items-center justify-center"><Play class="w-7 h-7 fill-white ml-0.5" /></span>
                        <span class="text-sm font-medium drop-shadow">Tap to load from {{ look.embed.label }}</span>
                        <span class="text-[11px] text-white/75 drop-shadow max-w-[16rem]">Uses your data. {{ look.embed.label }} will know you viewed it.</span>
                    </span>
                </button>
            </div></div>
            <!-- Video: a cover with its size until tapped; then the clip, with controls. -->
            <div v-else-if="look.video" class="bg-black"><div :class="frameClass">
                <video v-if="playing" ref="video" :src="look.video.url" :poster="look.images[0]" controls playsinline loop preload="auto" class="w-full h-full object-contain bg-black"></video>
                <button v-else @click="play" class="relative block w-full h-full" :aria-label="`Play video, ${look.video.size_label || ''}`">
                    <img :src="look.images[0]" :alt="look.caption || `Video by ${look.author.display_name}`" loading="lazy" decoding="async" class="w-full h-full object-cover" />
                    <span class="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/55 text-white flex items-center justify-center"><Play class="w-7 h-7 fill-white ml-0.5" /></span>
                    <span class="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/70 text-white text-[11px]">Video · {{ look.video.seconds }}s<template v-if="look.video.size_label"> · {{ look.video.size_label }}</template></span>
                </button>
            </div></div>
            <div
                v-else
                class="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                @scroll.passive="onSwipe"
                @dblclick="toggleLike(true)"
            >
                <div v-for="(src, i) in look.images" :key="src" class="w-full flex-shrink-0 snap-center aspect-[4/5]">
                    <img
                        :src="src"
                        :alt="look.caption || `Look by ${look.author.display_name}`"
                        :loading="i === 0 ? 'eager' : 'lazy'"
                        decoding="async"
                        class="w-full h-full object-cover select-none"
                        draggable="false"
                    />
                </div>
            </div>
            <Heart v-if="burst" class="absolute inset-0 m-auto w-24 h-24 text-white fill-white drop-shadow-lg pointer-events-none animate-ping" />
            <div v-if="!look.video && !look.embed && look.images.length > 1" class="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 pointer-events-none">
                <span v-for="(s, i) in look.images" :key="i" :class="['w-1.5 h-1.5 rounded-full transition-colors', i === slide ? 'bg-white' : 'bg-white/45']"></span>
            </div>
        </div>

        <a v-if="look.embed" :href="look.embed.source" target="_blank" rel="noopener nofollow" class="flex items-center gap-1.5 px-3.5 py-2 bg-cream/70 border-b border-black/5 text-[11px] text-black/55 hover:text-gold-dark">
            <ExternalLink class="w-3.5 h-3.5" /> From {{ look.embed.label }} · open it there
        </a>

        <!-- Ordered vs got: only ever shown for a real, paid purchase. -->
        <div v-if="look.try_on" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 bg-cream/70 border-b border-black/5 text-xs">
            <span class="inline-flex items-center gap-1 text-green-700 font-medium"><BadgeCheck class="w-4 h-4" /> Bought it</span>
            <span v-if="fitLabel" class="font-medium">{{ fitLabel }}</span>
            <span v-if="look.try_on.size_worn" class="text-black/60">wore {{ look.try_on.size_worn }}</span>
            <span v-if="look.try_on.rating" class="inline-flex items-center gap-0.5 text-black/60"><Star class="w-3.5 h-3.5 text-gold fill-gold" /> {{ look.try_on.rating }}/5</span>
        </div>
        <p v-if="look.won" class="flex items-center gap-1.5 px-3.5 py-2 bg-black text-white text-[11px] tracking-widest uppercase"><Trophy class="w-3.5 h-3.5 text-gold" /> Challenge winner</p>

        <!-- Actions -->
        <div class="flex items-center gap-1 px-2 pt-1.5">
            <button @click="toggleLike()" class="w-11 h-11 inline-flex items-center justify-center" :aria-label="look.liked ? 'Remove heart' : 'Heart this look'" :aria-pressed="look.liked">
                <Heart :class="['w-6 h-6 transition-all', look.liked ? 'text-red-500 fill-red-500 scale-110' : 'text-black/70 hover:text-black']" />
            </button>
                <button @click="talking = !talking" class="h-11 px-2 inline-flex items-center gap-1.5 text-black/70 hover:text-black" :aria-expanded="talking" aria-label="Comments">
                <MessageCircle class="w-[22px] h-[22px]" />
                <span v-if="look.comments" class="text-xs">{{ look.comments }}</span>
            </button>
            <a :href="shareHref" target="_blank" rel="noopener" class="w-11 h-11 inline-flex items-center justify-center text-black/70 hover:text-black" aria-label="Share on WhatsApp">
                <Share2 class="w-5 h-5" />
            </a>
            <!-- Only the author ever sees this number. -->
            <span v-if="look.likes !== null" class="ml-auto pr-2.5 text-[11px] text-black/45">
                {{ look.likes }} {{ look.likes === 1 ? 'heart' : 'hearts' }} · only you see this
            </span>
        </div>

        <p v-if="look.caption" class="px-3.5 pb-3 text-sm leading-relaxed text-black/80 whitespace-pre-line break-words">{{ look.caption }}</p>

        <!-- What she's wearing — the reason this isn't just a photo app. -->
        <div v-if="look.refs.length" class="border-t border-black/6 px-3.5 py-3">
            <p class="text-[10px] tracking-[0.2em] uppercase text-black/40 mb-2">Shop this look<template v-if="look.author.seller"> · sold by {{ look.author.display_name }}</template></p>
            <div class="scroll-strip flex gap-2.5 overflow-x-auto [scrollbar-width:none] -mx-3.5 px-3.5">
                <router-link
                    v-for="r in look.refs"
                    :key="`${r.type}:${r.id}`"
                    :to="refPath(r)"
                    @click="openRef($event, r)"
                    class="group flex items-center gap-2.5 p-1.5 pr-3 rounded-xl border border-black/8 hover:border-gold/60 transition-colors flex-shrink-0 w-[13.5rem]"
                >
                    <span class="w-11 h-14 rounded-md overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0">
                        <img v-if="r.thumbnail" :src="r.thumbnail" alt="" loading="lazy" class="w-full h-full object-cover" />
                        <component v-else :is="r.type === 'pack' ? 'Package' : 'ImageOff'" class="w-4 h-4 text-black/25" />
                    </span>
                    <span class="min-w-0">
                        <span class="block text-xs truncate group-hover:text-gold-dark">{{ r.title }}</span>
                        <span class="block text-[11px] text-black/50 truncate">{{ r.price_label }}</span>
                    </span>
                </router-link>
            </div>
        </div>

        <LookComments v-if="talking" :look-id="look.id" @count="(n) => look.comments = Math.max(0, (look.comments || 0) + n)" @report="(s) => $emit('report', s)" />
    </article>
</template>
