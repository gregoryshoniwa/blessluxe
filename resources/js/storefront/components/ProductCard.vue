<script>
import { Heart, Play, Star, ShoppingBag, Plane, MapPin, Plus, Check, Loader2 } from 'lucide-vue-next';
import { wishlist } from '../wishlist-store.js';
import { cart } from '../cart-store.js';
import { toast } from '../../lib/dialog.js';

export default {
    name: 'ProductCard',
    components: { Heart, Play, Star, ShoppingBag, Plane, MapPin, Plus, Check, Loader2 },
    props: {
        product: { type: Object, required: true },
    },
    data() {
        return {
            liked: false,
            hovering: false,
            popHeart: false,         // the heart bursts once when it's saved
            sizesOpen: false,        // phones: the "+" opens the sizes, there's no hover
            adding: null,            // the size id being added
            added: null,             // the size id just added — a tick, briefly
        };
    },
    computed: {
        /** Which pieces of social proof this product actually has. */
        signals() {
            return [this.product.rating, this.product.likes, this.product.purchases].filter(Boolean);
        },
        video() { return this.product.video || null; },
        // Autoplaying, muted, looping, chrome-less YouTube embed for hover.
        youtubeHoverSrc() {
            if (!this.video?.embed_url) return null;
            const id = this.video.embed_url.split('/').pop();
            return `${this.video.embed_url}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&playsinline=1&rel=0&modestbranding=1`;
        },
    },
    mounted() {
        this.liked = wishlist.has(this.product.id);
        window.addEventListener('blessluxe:wishlist-updated', this.sync);
    },
    beforeUnmount() {
        window.removeEventListener('blessluxe:wishlist-updated', this.sync);
    },
    methods: {
        sync() { this.liked = wishlist.has(this.product.id); },
        async toggle(e) {
            e.preventDefault();
            e.stopPropagation();
            this.liked = await wishlist.toggle(this.product.id);
            if (this.liked) { this.popHeart = false; this.$nextTick(() => { this.popHeart = true; }); }
        },
        /**
         * Add a size straight from the grid — Baymard's preferred list action,
         * because it saves the trip to the product page for someone who already
         * knows. The bag slides open to confirm, so there's no doubt it worked.
         */
        async addSize(size, e) {
            e.preventDefault();
            e.stopPropagation();
            if (!size.in_stock || this.adding) return;
            this.adding = size.id;
            try {
                await cart.add(size.id, 1);
                this.added = size.id;
                setTimeout(() => { this.added = null; this.sizesOpen = false; }, 1400);
            } catch (err) {
                toast(err?.payload?.error || 'Could not add that to your bag.', { tone: 'error' });
            } finally { this.adding = null; }
        },
        openSizes(e) {
            e.preventDefault();
            e.stopPropagation();
            this.sizesOpen = !this.sizesOpen;
        },
    },
};
</script>

<template>
    <router-link
        :to="`/shop/${product.handle}`"
        class="block group relative border border-black/10 hover:border-gold/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_14px_30px_-18px_rgba(0,0,0,.35)] motion-reduce:hover:translate-y-0"
        @mouseenter="hovering = true"
        @mouseleave="hovering = false"
    >
        <button
            @click="toggle"
            class="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-white/85 backdrop-blur flex items-center justify-center shadow-sm hover:bg-white transition-colors"
            :aria-label="liked ? 'Remove from wishlist' : 'Add to wishlist'"
            :title="liked ? 'Remove from wishlist' : 'Save to wishlist'"
        >
            <Heart :class="['w-4 h-4 transition-colors', liked ? 'fill-gold text-gold' : 'text-black/55 hover:text-gold', popHeart && 'pop-once']" @animationend="popHeart = false" />
        </button>
        <div class="img-shine relative aspect-[3/4] bg-cream-dark overflow-hidden">
            <!-- New in: the one label worth a shimmer. -->
            <span v-if="product.is_new" class="badge-new absolute top-2 left-9 z-10 bg-white/95 text-gold-dark text-[9px] font-semibold tracking-[0.18em] uppercase px-2 py-1">New</span>
            <!-- How soon it can be here: the other half of the price decision.
                 A small square by default so it never sits on the part of the
                 photo someone wants to see; the words unfurl on hover, and the
                 hint carries them either way. -->
            <span
                v-if="product.sourcing"
                :class="['absolute top-0 left-0 z-10 inline-flex items-center h-7 px-2 text-[9px] font-semibold tracking-[0.12em] uppercase text-white',
                         product.sourcing.kind === 'local' ? 'bg-emerald-600/95' : 'bg-black/70 backdrop-blur-sm']"
                :title="product.sourcing.note"
            >
                <component :is="product.sourcing.kind === 'local' ? 'MapPin' : 'Plane'" class="w-3 h-3 flex-shrink-0" />
                <!-- The square comes out of the maths, not a fixed width: 8px
                     padding + a 12px icon + 0 + 8px = 28px, which is h-7. The
                     label animates on max-width (display can't be animated),
                     and box-border clips its padding while it's closed. -->
                <span class="max-w-0 opacity-0 overflow-hidden whitespace-nowrap pl-1 transition-all duration-300 group-hover:max-w-[8rem] group-hover:opacity-100">
                    {{ product.sourcing.eta }}
                </span>
            </span>

            <img
                v-if="product.thumbnail"
                :src="product.thumbnail"
                :alt="product.title"
                class="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            />

            <!-- Hover playback: uploaded file plays inline; YouTube embeds a
                 muted looping iframe (pointer-events off so the card still
                 clicks through to the product). -->
            <template v-if="video && hovering">
                <video
                    v-if="video.kind === 'upload'"
                    :src="video.url"
                    autoplay
                    muted
                    loop
                    playsinline
                    class="absolute inset-0 w-full h-full object-cover object-top"
                />
                <iframe
                    v-else-if="youtubeHoverSrc"
                    :src="youtubeHoverSrc"
                    class="absolute inset-0 w-full h-full pointer-events-none"
                    frameborder="0"
                    allow="autoplay; encrypted-media"
                    title="Product video"
                />
            </template>

            <!-- Sizes, straight to the bag. Hover reveals them; on a phone the "+" does. -->
            <div
                v-if="product.sizes?.length"
                :class="['absolute inset-x-0 bottom-0 z-20 bg-white/95 backdrop-blur px-2 pt-2 pb-2.5 transition-all duration-300',
                         sizesOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 lg:group-hover:translate-y-0 lg:group-hover:opacity-100']"
                @click.prevent.stop
            >
                <p class="text-[9px] tracking-[0.2em] uppercase text-black/50 mb-1.5 text-center">Add to bag</p>
                <div class="flex flex-wrap justify-center gap-1">
                    <button
                        v-for="size in product.sizes"
                        :key="size.id"
                        @click="addSize(size, $event)"
                        :disabled="!size.in_stock || !!adding"
                        :class="['min-w-9 h-8 px-2 border text-[11px] transition-all press',
                                 added === size.id ? 'bg-emerald-600 border-emerald-600 text-white' :
                                 size.in_stock ? 'border-black/20 hover:border-gold hover:bg-gold hover:text-white' : 'border-black/10 text-black/30 line-through cursor-not-allowed']"
                        :title="size.in_stock ? `Add ${size.title} to your bag` : `${size.title} is sold out`"
                    >
                        <Loader2 v-if="adding === size.id" class="w-3 h-3 animate-spin mx-auto" />
                        <Check v-else-if="added === size.id" class="w-3.5 h-3.5 mx-auto" />
                        <template v-else>{{ size.title }}</template>
                    </button>
                </div>
            </div>
            <button
                v-if="product.sizes?.length"
                @click="openSizes"
                class="lg:hidden absolute bottom-2 right-2 z-30 w-9 h-9 rounded-full bg-gold text-white shadow-md inline-flex items-center justify-center press"
                :aria-label="sizesOpen ? 'Close sizes' : 'Add to bag'"
            >
                <Plus :class="['w-4 h-4 transition-transform', sizesOpen && 'rotate-45']" />
            </button>

            <!-- Video badge -->
            <span
                v-if="video"
                class="absolute bottom-2 left-2 z-10 w-6 h-6 rounded-full bg-black/55 backdrop-blur flex items-center justify-center lg:group-hover:opacity-0 transition-opacity"
                title="This piece has a video"
            >
                <Play class="w-3 h-3 text-white fill-white" />
            </span>
        </div>
        <div class="p-3">
            <p class="font-display text-sm leading-tight line-clamp-1 group-hover:text-gold transition-colors">
                {{ product.title }}
            </p>
            <p v-if="product.subtitle" class="text-[10px] text-black/55 line-clamp-1">{{ product.subtitle }}</p>
            <!-- Price leads; what other people made of it answers from the right.
                 Each signal appears only once it's true, so a new piece shows a
                 clean card rather than three zeros. The numbers stand alone —
                 the words that explained them are in the hover hints. -->
            <div class="flex items-baseline justify-between gap-2 mt-0.5">
                <p class="text-xs text-black truncate">{{ product.price_label || '—' }}</p>
                <p v-if="signals.length" class="flex items-center gap-2 text-[11px] text-black/55 flex-shrink-0">
                    <span v-if="product.rating" class="inline-flex items-center gap-1" :title="`Rated ${product.rating.average_label} out of 5 by ${product.rating.count} ${product.rating.count === 1 ? 'person' : 'people'}`">
                        <Star class="w-3 h-3 text-gold fill-gold" />
                        <span class="font-medium text-black/75">{{ product.rating.average_label }}</span>
                    </span>
                    <span v-if="product.likes" class="inline-flex items-center gap-1" :title="`Loved by ${product.likes}`">
                        <Heart class="w-3 h-3 text-gold fill-gold" />
                        {{ product.likes }}
                    </span>
                    <span v-if="product.purchases" class="inline-flex items-center gap-1" :title="`${product.purchases} bought`">
                        <ShoppingBag class="w-3 h-3 text-gold" />
                        {{ product.purchases }}
                    </span>
                </p>
            </div>
        </div>
    </router-link>
</template>

<style scoped>
/* "New" catches the light every few seconds — the only label that earns it. */
.badge-new { overflow: hidden; }
.badge-new::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 -60%;
    width: 40%;
    background: linear-gradient(105deg, transparent, rgba(201, 168, 76, .45), transparent);
    transform: skewX(-18deg);
    animation: badge-sheen 4.5s ease-in-out infinite;
}
@keyframes badge-sheen { 0%, 70% { left: -60%; } 100% { left: 130%; } }
@media (prefers-reduced-motion: reduce) { .badge-new::after { animation: none; display: none; } }
</style>
