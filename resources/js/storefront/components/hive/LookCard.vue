<script>
import { api } from '../../../lib/api.js';
import { confirmDialog, toast, toastError } from '../../../lib/dialog.js';
import { hiveStore, timeAgo, occasionLabel, whatsappShare } from '../../hive-store.js';
import LookComments from './LookComments.vue';
import { Heart, Ellipsis, Flag, Trash2, Share2, Package, ImageOff, UserRound, MessageCircle, BadgeCheck, Star, Trophy } from 'lucide-vue-next';

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
    components: { LookComments, Heart, Ellipsis, Flag, Trash2, Share2, Package, ImageOff, UserRound, MessageCircle, BadgeCheck, Star, Trophy },
    props: {
        look: { type: Object, required: true },
        // On someone's own page the author row is repetition.
        showAuthor: { type: Boolean, default: true },
        // Opened from a notification about a comment: start with the thread showing.
        openComments: { type: Boolean, default: false },
    },
    emits: ['removed', 'report'],
    data() {
        return { slide: 0, menuOpen: false, busy: false, burst: false, talking: this.openComments };
    },
    computed: {
        when() { return timeAgo(this.look.created_at); },
        occasion() { return this.look.occasion ? occasionLabel(this.look.occasion) : null; },
        fitLabel() { return { small: 'Runs small', true: 'True to size', large: 'Runs large' }[this.look.try_on?.fit] || null; },
        shareHref() {
            const who = this.look.author.display_name || 'this look';
            return whatsappShare(`See ${who} on Bless Hive —`, `/@${this.look.author.handle}?look=${this.look.id}`);
        },
    },
    methods: {
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
                    <span class="block text-sm font-medium truncate group-hover:text-gold-dark transition-colors">{{ look.author.display_name }}</span>
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
                    <button v-if="look.is_mine" @click="remove" class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 text-left">
                        <Trash2 class="w-4 h-4" /> Take down
                    </button>
                    <button v-else @click="report" class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-cream text-left">
                        <Flag class="w-4 h-4" /> Report
                    </button>
                </div>
            </div>
        </header>

        <!-- The photos. Double-tap to heart, swipe for more. -->
        <div class="relative bg-cream-dark">
            <div
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
            <div v-if="look.images.length > 1" class="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 pointer-events-none">
                <span v-for="(s, i) in look.images" :key="i" :class="['w-1.5 h-1.5 rounded-full transition-colors', i === slide ? 'bg-white' : 'bg-white/45']"></span>
            </div>
        </div>

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
            <p class="text-[10px] tracking-[0.2em] uppercase text-black/40 mb-2">Shop this look</p>
            <div class="scroll-strip flex gap-2.5 overflow-x-auto [scrollbar-width:none] -mx-3.5 px-3.5">
                <router-link
                    v-for="r in look.refs"
                    :key="`${r.type}:${r.id}`"
                    :to="refPath(r)"
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
