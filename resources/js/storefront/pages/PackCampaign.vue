<script>
import { api } from '../../lib/api.js';
import { toast } from '../../lib/dialog.js';
import {
    Clock, Lock, Check, X, ShoppingBag, LoaderCircle, Sparkles, Star, Heart, MapPin, Plane,
    Link2, Share2, MessageCircle, ShieldCheck, Users, Eye, RotateCcw, ArrowRight, ChevronLeft, ChevronRight,
} from 'lucide-vue-next';

/**
 * One series, built for a stranger who was sent the link.
 *
 * Group buys already happen in WhatsApp groups, and the same things go wrong in
 * every one of them: money goes to a person who might vanish, nobody can tell
 * who has paid without scrolling for screenshots, two people claim the same
 * size, someone promises and never pays so the group stalls, "how many are we
 * now?" is asked forty times, and when it fills nobody says so. Each of those
 * is answered here, on the page, before anyone is asked to pay.
 *
 * The page is also how a series FILLS: the share block writes the WhatsApp
 * message for them, with the sizes still open and the link.
 */
export default {
    name: 'PackCampaign',
    components: {
        Clock, Lock, Check, X, ShoppingBag, LoaderCircle, Sparkles, Star, Heart, MapPin, Plane,
        Link2, Share2, MessageCircle, ShieldCheck, Users, Eye, RotateCcw, ArrowRight, ChevronLeft, ChevronRight,
    },
    data() {
        return {
            data: null,
            loading: true,
            notFound: false,
            error: '',
            customer: null,
            tickInterval: null,
            now: Date.now(),
            actingOnSlotId: null,
            image: 0,                // which gallery picture is up
            copied: false,
        };
    },
    computed: {
        code() { return (this.$route.params.code || '').toUpperCase(); },
        campaign() { return this.data?.campaign || null; },
        product() { return this.campaign?.product || null; },
        slots() { return this.data?.slots || []; },
        totals() { return this.data?.totals || { total: 0, available: 0, reserved: 0, paid: 0, needs: 0, fill_percent: 0 }; },
        images() { return this.product?.images?.length ? this.product.images : []; },
        title() { return this.campaign?.title || this.campaign?.definition?.title || this.product?.title || 'Series'; },
        price() { return this.product?.price_label || this.slots[0]?.variant?.price_label || null; },
        reputation() { return this.campaign?.reputation || null; },
        people() { return this.campaign?.people || []; },

        /** A hold is the only state a shopper can act on after claiming. */
        myReservedSlot() { return this.slots.find((s) => s.is_mine && s.status === 'reserved'); },
        myPaidSlots() { return this.slots.filter((s) => s.is_mine && s.status === 'paid'); },
        iAmIn() { return this.myPaidSlots.length > 0; },

        /** The deadline, if the host set one. Past it, nothing can be claimed. */
        deadline() { return this.campaign?.expires_at ? new Date(this.campaign.expires_at) : null; },
        expired() { return this.deadline ? this.deadline.getTime() <= this.now : false; },
        open() { return this.campaign?.status === 'open' && !this.expired; },
        full() { return this.totals.total > 0 && this.totals.paid >= this.totals.total; },
        closesIn() {
            if (!this.deadline) return null;
            const ms = this.deadline.getTime() - this.now;
            if (ms <= 0) return 'Closed';
            const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
            if (d >= 2) return `Closes in ${d} days`;
            if (d === 1) return `Closes tomorrow`;
            if (h >= 1) return `Closes in ${h}h ${m}m`;

            return `Closes in ${m} min`;
        },

        /**
         * Sizes, grouped by the piece they're for. Nearly every series is one
         * piece in several sizes; a mixed one just gets a row per piece.
         */
        groups() {
            const map = new Map();
            for (const s of this.slots) {
                const key = s.product?.id || 'piece';
                if (!map.has(key)) map.set(key, { product: s.product, slots: [] });
                map.get(key).slots.push(s);
            }

            return [...map.values()];
        },
        openSizes() { return this.slots.filter((s) => s.status === 'available').map((s) => s.size_label || s.variant?.title).filter(Boolean); },

        /** The message someone would have typed by hand into the group. */
        shareUrl() { return `${window.location.origin}/shop/series/${this.code}`; },
        shareText() {
            const t = this.totals;
            const lead = this.iAmIn
                ? `I'm in the ${this.title} series on BLESSLUXE.`
                : `${this.title} — a BLESSLUXE series.`;
            const state = this.full
                ? 'Every size is taken.'
                : `${t.paid} of ${t.total} sizes claimed, ${t.needs} more needed.`;
            const sizes = this.openSizes.length ? ` Still open: ${this.openSizes.join(', ')}.` : '';
            const price = this.price ? ` ${this.price} each.` : '';

            return `${lead} ${state}${sizes}${price} Claim yours: ${this.shareUrl}`;
        },
        whatsappHref() { return `https://wa.me/?text=${encodeURIComponent(this.shareText)}`; },
        canNativeShare() { return typeof navigator !== 'undefined' && !!navigator.share; },
    },
    async mounted() {
        await Promise.all([this.fetch(), this.fetchMe()]);
        // Tick once a second so hold countdowns and the deadline stay live.
        this.tickInterval = setInterval(() => { this.now = Date.now(); }, 1000);
    },
    beforeUnmount() {
        clearInterval(this.tickInterval);
    },
    methods: {
        async fetch() {
            this.loading = true;
            try {
                this.data = await api.get(`/api/store/series/${encodeURIComponent(this.code)}`);
            } catch (e) {
                if (e.status === 404) this.notFound = true;
                else this.error = e.payload?.error || 'Could not load this series.';
            } finally { this.loading = false; }
        },
        async fetchMe() {
            try {
                this.customer = (await api.get('/api/account/me')).customer;
            } catch { this.customer = null; }
        },
        secondsLeft(slot) {
            if (!slot.reserved_until) return 0;

            return Math.max(0, Math.floor((new Date(slot.reserved_until).getTime() - this.now) / 1000));
        },
        formatSeconds(s) {
            return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
        },
        sizeOf(slot) { return slot.size_label || slot.variant?.title || '—'; },
        toSizes() {
            document.getElementById('sizes')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        async reserve(slot) {
            if (!this.open || slot.status !== 'available') return;
            if (!this.customer) {
                this.$router.push({ path: '/account/login', query: { next: `/shop/series/${this.code}` } });
                return;
            }
            this.actingOnSlotId = slot.id;
            this.error = '';
            try {
                await api.post(`/api/store/series/${encodeURIComponent(this.code)}/slots/${slot.id}/reserve`);
                window.dispatchEvent(new CustomEvent('blessluxe:cart-updated'));
                await this.fetch();
            } catch (e) {
                this.error = e.payload?.error || 'Could not claim that size.';
                if (e.status === 409) await this.fetch();        // someone was quicker; show the truth
            } finally { this.actingOnSlotId = null; }
        },
        async release(slot) {
            this.actingOnSlotId = slot.id;
            try {
                await api.post(`/api/store/series/${encodeURIComponent(this.code)}/slots/${slot.id}/release`);
                window.dispatchEvent(new CustomEvent('blessluxe:cart-updated'));
                await this.fetch();
            } finally { this.actingOnSlotId = null; }
        },
        async copyLink() {
            try {
                await navigator.clipboard.writeText(this.shareText);
                this.copied = true;
                toast('Copied — paste it into any chat', { tone: 'success' });
                setTimeout(() => { this.copied = false; }, 2000);
            } catch {
                toast('Could not copy that.', { tone: 'error' });
            }
        },
        async nativeShare() {
            try {
                await navigator.share({ title: this.title, text: this.shareText, url: this.shareUrl });
            } catch (e) {
                if (e?.name !== 'AbortError') toast('Could not share that.', { tone: 'error' });
            }
        },
        prev() { this.image = (this.image - 1 + this.images.length) % this.images.length; },
        next() { this.image = (this.image + 1) % this.images.length; },
    },
};
</script>

<template>
    <div class="min-h-[60vh]">
        <div v-if="loading" class="text-center py-32 text-[10px] tracking-widest uppercase text-black/55 animate-pulse">Loading series</div>

        <div v-else-if="notFound" class="text-center py-32 max-w-md mx-auto px-[5%]">
            <p class="font-script text-3xl text-gold">404</p>
            <h1 class="font-display text-2xl tracking-widest uppercase mb-2">Series not found</h1>
            <router-link to="/shop/series" class="text-gold underline">Back to series</router-link>
        </div>

        <div v-else-if="campaign" class="max-w-[1400px] mx-auto px-[5%] pt-6 pb-28 lg:pb-16">
            <!-- ─── Top: the piece, and the way in ───────────────────────── -->
            <div class="lg:grid lg:grid-cols-12 lg:gap-12">

                <!-- Gallery -->
                <div class="lg:col-span-7">
                    <div class="relative bg-cream-dark overflow-hidden aspect-[3/4] sm:aspect-[4/5] lg:aspect-[3/4]">
                        <img
                            v-if="images.length"
                            :src="images[image]"
                            :alt="title"
                            class="absolute inset-0 w-full h-full object-cover object-top"
                        />
                        <!-- What's open, on the picture itself — the first thing a shared link lands on. -->
                        <div class="absolute top-0 left-0 right-0 flex items-start justify-between p-4 pointer-events-none">
                            <span v-if="full" class="bg-emerald-600 text-white text-[10px] font-semibold tracking-[0.2em] uppercase px-3 py-1.5">Full · being ordered</span>
                            <span v-else-if="!open" class="bg-black/70 text-white text-[10px] font-semibold tracking-[0.2em] uppercase px-3 py-1.5">Closed</span>
                            <span v-else class="bg-gold text-white text-[10px] font-semibold tracking-[0.2em] uppercase px-3 py-1.5">Needs {{ totals.needs }} more</span>
                            <span v-if="closesIn && open" class="bg-white/90 backdrop-blur text-[10px] font-semibold tracking-[0.15em] uppercase px-3 py-1.5 inline-flex items-center gap-1.5">
                                <Clock class="w-3 h-3 text-gold" /> {{ closesIn }}
                            </span>
                        </div>
                        <template v-if="images.length > 1">
                            <button @click="prev" class="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/85 backdrop-blur inline-flex items-center justify-center hover:bg-white transition-colors" aria-label="Previous picture"><ChevronLeft class="w-5 h-5" /></button>
                            <button @click="next" class="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/85 backdrop-blur inline-flex items-center justify-center hover:bg-white transition-colors" aria-label="Next picture"><ChevronRight class="w-5 h-5" /></button>
                        </template>
                    </div>
                    <div v-if="images.length > 1" class="scroll-strip flex gap-2 mt-2 scroll-px-0">
                        <button
                            v-for="(src, i) in images"
                            :key="src"
                            @click="image = i"
                            :class="['w-16 h-20 flex-shrink-0 overflow-hidden border-2 transition-colors', image === i ? 'border-gold' : 'border-transparent hover:border-black/20']"
                            :aria-label="`Picture ${i + 1}`"
                        >
                            <img :src="src" :alt="''" class="w-full h-full object-cover object-top" />
                        </button>
                    </div>
                </div>

                <!-- The way in: stays beside the pictures as they scroll on desktop -->
                <div class="lg:col-span-5 mt-8 lg:mt-0">
                    <div class="lg:sticky lg:top-24 space-y-6">
                        <header>
                            <p class="font-script text-2xl text-gold">{{ campaign.host_kind === 'customer' ? 'Hosted by a member' : 'Buy it together' }}</p>
                            <h1 class="font-display text-2xl md:text-3xl tracking-widest uppercase leading-tight">{{ title }}</h1>
                            <div v-if="reputation" class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-black/60">
                                <span v-if="reputation.rating" class="inline-flex items-center gap-1.5" :title="`Rated ${reputation.rating.average_label} out of 5`">
                                    <span class="flex items-center"><Star v-for="n in 5" :key="n" class="w-3.5 h-3.5" :class="n <= Math.round(reputation.rating.average) ? 'text-gold fill-gold' : 'text-black/15'" /></span>
                                    <span class="font-medium text-black/80">{{ reputation.rating.average_label }}</span>
                                </span>
                                <span v-if="reputation.likes" class="inline-flex items-center gap-1.5" :title="`Loved by ${reputation.likes}`"><Heart class="w-3.5 h-3.5 text-gold fill-gold" /> {{ reputation.likes }}</span>
                                <span v-if="reputation.purchases" class="inline-flex items-center gap-1.5" :title="`${reputation.purchases} bought`"><ShoppingBag class="w-3.5 h-3.5 text-gold" /> {{ reputation.purchases }}</span>
                                <span v-if="reputation.sourcing" class="inline-flex items-center gap-1.5" :title="reputation.sourcing.note">
                                    <component :is="reputation.sourcing.kind === 'local' ? 'MapPin' : 'Plane'" class="w-3.5 h-3.5" :class="reputation.sourcing.kind === 'local' ? 'text-emerald-600' : 'text-black/50'" />
                                    {{ reputation.sourcing.eta }}
                                </span>
                            </div>
                            <p v-if="price" class="mt-3 text-xl"><span class="font-semibold">{{ price }}</span> <span class="text-sm text-black/55">per piece</span></p>
                        </header>

                        <!-- The meter: the question everyone asks, answered without asking -->
                        <section class="border border-gold/30 bg-cream-dark/30 p-5">
                            <div class="flex items-end justify-between gap-3 mb-3">
                                <p>
                                    <span class="font-display text-4xl leading-none">{{ totals.paid }}</span>
                                    <span class="text-sm text-black/55"> of {{ totals.total }} sizes claimed</span>
                                </p>
                                <p v-if="full" class="text-[10px] font-semibold tracking-[0.2em] uppercase text-emerald-700">Full</p>
                                <p v-else-if="open" class="text-[10px] font-semibold tracking-[0.2em] uppercase text-gold-dark">Needs {{ totals.needs }} more</p>
                            </div>
                            <div class="h-2 bg-black/10 overflow-hidden">
                                <div class="h-full bg-gold transition-all duration-700" :style="{ width: totals.fill_percent + '%' }"></div>
                            </div>

                            <!-- Who's in. Two initials each, paid only — enough for a stranger to see it's real. -->
                            <div class="flex items-center gap-3 mt-4">
                                <div class="flex -space-x-2">
                                    <span
                                        v-for="(p, i) in people.slice(0, 6)"
                                        :key="i"
                                        class="w-9 h-9 rounded-full bg-gold text-white text-[11px] font-semibold inline-flex items-center justify-center ring-2 ring-cream"
                                        :title="'Paid'"
                                    >{{ p }}</span>
                                    <span v-if="people.length > 6" class="w-9 h-9 rounded-full bg-black/10 text-black/60 text-[11px] font-semibold inline-flex items-center justify-center ring-2 ring-cream">+{{ people.length - 6 }}</span>
                                    <button
                                        v-if="open && !full && !iAmIn"
                                        @click="toSizes"
                                        class="w-9 h-9 rounded-full border-2 border-dashed border-gold text-gold text-sm inline-flex items-center justify-center ring-2 ring-cream hover:bg-gold hover:text-white transition-colors"
                                        title="Take a size"
                                        aria-label="Take a size"
                                    >+</button>
                                </div>
                                <p class="text-sm text-black/65">
                                    <template v-if="iAmIn">You're in<template v-if="people.length > 1">, with {{ people.length - 1 }} other{{ people.length - 1 === 1 ? '' : 's' }}</template>.</template>
                                    <template v-else-if="people.length">{{ people.length }} {{ people.length === 1 ? 'person is' : 'people are' }} in<template v-if="open && !full"> — and you?</template></template>
                                    <template v-else-if="open">Be the first in.</template>
                                </p>
                            </div>
                        </section>

                        <!-- Sizes -->
                        <section id="sizes" class="scroll-mt-28">
                            <p class="text-[10px] tracking-widest uppercase text-black/55 mb-3">{{ open ? 'Take your size' : 'Sizes' }}</p>
                            <div v-for="g in groups" :key="g.product?.id || 'piece'" class="mb-4 last:mb-0">
                                <p v-if="groups.length > 1" class="text-sm font-medium mb-2">{{ g.product?.title }}</p>
                                <div class="flex flex-wrap gap-2">
                                    <button
                                        v-for="slot in g.slots"
                                        :key="slot.id"
                                        @click="reserve(slot)"
                                        :disabled="slot.status !== 'available' || !open || actingOnSlotId === slot.id"
                                        :class="[
                                            'relative min-w-[4.5rem] min-h-[4.5rem] px-3 py-2 border-2 text-center transition-colors',
                                            slot.status === 'paid' && 'bg-emerald-50 border-emerald-200 text-emerald-800 cursor-default',
                                            slot.status === 'reserved' && slot.is_mine && 'bg-gold/10 border-gold text-gold-dark cursor-default',
                                            slot.status === 'reserved' && !slot.is_mine && 'bg-amber-50 border-amber-200 text-amber-800 cursor-default',
                                            slot.status === 'available' && open && 'bg-white border-black/15 hover:border-gold hover:text-gold',
                                            slot.status === 'available' && !open && 'bg-white border-black/10 text-black/35 cursor-default',
                                        ]"
                                        :title="slot.status === 'paid' ? (slot.is_mine ? 'Yours — paid' : 'Taken') : slot.status === 'reserved' ? (slot.is_mine ? 'Yours — pay to keep it' : 'Someone is paying for this one') : open ? 'Take this size' : 'Closed'"
                                    >
                                        <span class="block font-display text-lg leading-none">{{ sizeOf(slot) }}</span>
                                        <span class="block text-[10px] tracking-wider uppercase mt-1.5">
                                            <template v-if="slot.status === 'paid'"><Check class="w-3 h-3 inline -mt-0.5" /> {{ slot.is_mine ? 'Yours' : slot.buyer || 'Paid' }}</template>
                                            <template v-else-if="slot.status === 'reserved' && slot.is_mine"><Clock class="w-3 h-3 inline -mt-0.5" /> {{ formatSeconds(secondsLeft(slot)) }}</template>
                                            <template v-else-if="slot.status === 'reserved'"><Lock class="w-3 h-3 inline -mt-0.5" /> Held</template>
                                            <template v-else-if="actingOnSlotId === slot.id"><LoaderCircle class="w-3 h-3 inline animate-spin" /></template>
                                            <template v-else>{{ open ? 'Open' : '—' }}</template>
                                        </span>
                                    </button>
                                </div>
                            </div>
                            <p v-if="error" class="text-sm text-red-600 mt-3">{{ error }}</p>
                        </section>

                        <!-- The one thing to do next -->
                        <section>
                            <template v-if="myReservedSlot">
                                <router-link
                                    to="/cart"
                                    class="flex items-center justify-center gap-2 w-full bg-gold text-white py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors"
                                >
                                    Pay for size {{ sizeOf(myReservedSlot) }}<template v-if="myReservedSlot.variant?.price_label"> · {{ myReservedSlot.variant.price_label }}</template>
                                    <ArrowRight class="w-4 h-4" />
                                </router-link>
                                <div class="flex items-center justify-between gap-3 mt-2 text-xs text-black/55">
                                    <span class="inline-flex items-center gap-1.5"><Clock class="w-3.5 h-3.5 text-gold" /> Held for you · <span class="font-mono">{{ formatSeconds(secondsLeft(myReservedSlot)) }}</span></span>
                                    <button @click="release(myReservedSlot)" :disabled="actingOnSlotId === myReservedSlot.id" class="min-h-11 inline-flex items-center gap-1 hover:text-red-600 transition-colors">
                                        <X class="w-3.5 h-3.5" /> Let it go
                                    </button>
                                </div>
                            </template>
                            <template v-else-if="full">
                                <div class="border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800 text-center">
                                    <Check class="w-4 h-4 inline -mt-0.5" /> Every size is paid. The series is being ordered.
                                </div>
                            </template>
                            <template v-else-if="!open">
                                <div class="border border-black/10 bg-cream-dark/30 px-4 py-4 text-sm text-black/60 text-center">
                                    <template v-if="campaign.status === 'cancelled'">This series was cancelled. Anyone who had paid is refunded in full.</template>
                                    <template v-else-if="expired">The deadline for this series has passed.</template>
                                    <template v-else>This series is closed.</template>
                                </div>
                            </template>
                            <template v-else>
                                <button
                                    @click="toSizes"
                                    class="flex items-center justify-center gap-2 w-full bg-gold text-white py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors"
                                >
                                    Take a size <ArrowRight class="w-4 h-4" />
                                </button>
                            </template>

                            <!-- The three worries, answered where the money is asked for. -->
                            <ul class="mt-4 space-y-1.5 text-xs text-black/60">
                                <li class="flex items-start gap-2"><ShieldCheck class="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" /> Paid to BLESSLUXE, never to a person.</li>
                                <li class="flex items-start gap-2"><RotateCcw class="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" /> Doesn't fill? Everyone is refunded in full.</li>
                                <li class="flex items-start gap-2"><Lock class="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" /> Your size is held for {{ campaign.reservation_minutes }} minutes while you pay — nobody can take it.</li>
                            </ul>
                        </section>

                        <!-- Share: the series fills because someone passes it on -->
                        <section v-if="open && !full" class="border-t border-gold/15 pt-5">
                            <p class="font-display text-sm tracking-widest uppercase mb-1">Help it fill</p>
                            <p class="text-xs text-black/55 mb-3">
                                Send it to a friend who's your size — or isn't. The message is written for you<template v-if="openSizes.length">, with the sizes still open</template>.
                            </p>
                            <div class="grid grid-cols-2 gap-2">
                                <a
                                    :href="whatsappHref"
                                    target="_blank"
                                    rel="noopener"
                                    class="inline-flex items-center justify-center gap-2 min-h-11 bg-emerald-600 text-white px-4 py-3 text-[10px] font-semibold tracking-[0.2em] uppercase hover:bg-emerald-700 transition-colors"
                                >
                                    <MessageCircle class="w-4 h-4" /> WhatsApp
                                </a>
                                <button
                                    @click="copyLink"
                                    class="inline-flex items-center justify-center gap-2 min-h-11 border border-black/20 px-4 py-3 text-[10px] font-semibold tracking-[0.2em] uppercase hover:border-black/50 transition-colors"
                                >
                                    <Check v-if="copied" class="w-4 h-4 text-emerald-600" /><Link2 v-else class="w-4 h-4" /> {{ copied ? 'Copied' : 'Copy' }}
                                </button>
                                <button
                                    v-if="canNativeShare"
                                    @click="nativeShare"
                                    class="col-span-2 inline-flex items-center justify-center gap-2 min-h-11 text-[10px] font-semibold tracking-[0.2em] uppercase text-black/60 hover:text-gold transition-colors"
                                >
                                    <Share2 class="w-4 h-4" /> More ways to share
                                </button>
                            </div>
                            <p class="mt-3 text-xs text-black/45 border-l-2 border-gold/40 pl-3 italic leading-relaxed">{{ shareText }}</p>
                        </section>
                    </div>
                </div>
            </div>

            <!-- ─── Below: the piece, and how this works ──────────────────── -->
            <div class="lg:grid lg:grid-cols-12 lg:gap-12 mt-14">
                <div class="lg:col-span-7 space-y-12">
                    <section v-if="product?.description">
                        <h2 class="font-display text-lg tracking-widest uppercase mb-3">About the piece</h2>
                        <p class="text-sm text-black/75 leading-relaxed whitespace-pre-line">{{ product.description }}</p>
                        <router-link v-if="product.handle" :to="`/shop/${product.handle}`" class="inline-flex items-center gap-1.5 mt-4 text-[10px] tracking-widest uppercase text-gold-dark underline underline-offset-4 hover:text-gold min-h-11">
                            <Eye class="w-3.5 h-3.5" /> See the piece, its reviews and how it fits
                        </router-link>
                    </section>
                    <section v-else-if="product?.handle">
                        <router-link :to="`/shop/${product.handle}`" class="inline-flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-gold-dark underline underline-offset-4 hover:text-gold min-h-11">
                            <Eye class="w-3.5 h-3.5" /> See the piece, its reviews and how it fits
                        </router-link>
                    </section>

                    <section>
                        <h2 class="font-display text-lg tracking-widest uppercase mb-5">How a series works</h2>
                        <ol class="grid sm:grid-cols-3 gap-4">
                            <li class="border border-gold/20 bg-cream-dark/30 p-5">
                                <p class="font-script text-2xl text-gold leading-none mb-2">1</p>
                                <p class="font-medium text-sm mb-1">Take your size</p>
                                <p class="text-xs text-black/60 leading-relaxed">It's held for you for {{ campaign.reservation_minutes }} minutes. Nobody else can claim it while you pay.</p>
                            </li>
                            <li class="border border-gold/20 bg-cream-dark/30 p-5">
                                <p class="font-script text-2xl text-gold leading-none mb-2">2</p>
                                <p class="font-medium text-sm mb-1">Pay BLESSLUXE</p>
                                <p class="text-xs text-black/60 leading-relaxed">By EcoCash or card, to us — not to whoever started the group. Your size turns green for everyone to see.</p>
                            </li>
                            <li class="border border-gold/20 bg-cream-dark/30 p-5">
                                <p class="font-script text-2xl text-gold leading-none mb-2">3</p>
                                <p class="font-medium text-sm mb-1">It ships together</p>
                                <p class="text-xs text-black/60 leading-relaxed">When the last size is paid, everyone is told and the run is ordered as one. If it never fills, everyone is refunded in full.</p>
                            </li>
                        </ol>
                    </section>

                    <section>
                        <h2 class="font-display text-lg tracking-widest uppercase mb-5">Why it's better than a group chat</h2>
                        <ul class="space-y-4 text-sm">
                            <li class="flex items-start gap-3">
                                <Eye class="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                                <span><strong class="font-medium">Everyone sees who has paid.</strong> <span class="text-black/65">Every size on this page shows whether it's open, held or paid — no scrolling back for screenshots, no "did you get mine?"</span></span>
                            </li>
                            <li class="flex items-start gap-3">
                                <Lock class="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                                <span><strong class="font-medium">A size can't be taken twice.</strong> <span class="text-black/65">The moment you claim it, it's yours while you pay. Nobody can post "I'll take M" over you.</span></span>
                            </li>
                            <li class="flex items-start gap-3">
                                <Clock class="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                                <span><strong class="font-medium">Nobody can stall it.</strong> <span class="text-black/65">A hold that isn't paid for goes back to open on its own. "Needs {{ totals.needs || 1 }} more" is always true.</span></span>
                            </li>
                            <li class="flex items-start gap-3">
                                <ShieldCheck class="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                                <span><strong class="font-medium">Your money is with the shop.</strong> <span class="text-black/65">Not with a person who might go quiet. If the series doesn't fill, it comes straight back.</span></span>
                            </li>
                            <li class="flex items-start gap-3">
                                <Users class="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                                <span><strong class="font-medium">You don't need to know anyone.</strong> <span class="text-black/65">Strangers fill a series as well as friends do. Share it anywhere, or simply wait — the page does the organising.</span></span>
                            </li>
                        </ul>
                    </section>
                </div>
            </div>
        </div>

        <!-- Phone: the state and the next step ride along the bottom, clear of the LUXE launcher. -->
        <div v-if="campaign && !loading && !notFound" class="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-cream border-t border-gold/20 px-4 py-3 pr-24 flex items-center gap-3">
            <div class="min-w-0">
                <p class="text-sm font-semibold leading-tight">{{ totals.paid }}/{{ totals.total }} <span class="font-normal text-black/55">claimed</span></p>
                <p class="text-[10px] tracking-widest uppercase" :class="full ? 'text-emerald-700' : 'text-gold-dark'">
                    <template v-if="myReservedSlot">Held · {{ formatSeconds(secondsLeft(myReservedSlot)) }}</template>
                    <template v-else-if="full">Full</template>
                    <template v-else-if="open">Needs {{ totals.needs }} more</template>
                    <template v-else>Closed</template>
                </p>
            </div>
            <router-link v-if="myReservedSlot" to="/cart" class="ml-auto bg-gold text-white px-5 py-3 text-[10px] font-semibold tracking-[0.2em] uppercase whitespace-nowrap">Pay now</router-link>
            <button v-else-if="open && !full" @click="toSizes" class="ml-auto bg-gold text-white px-5 py-3 text-[10px] font-semibold tracking-[0.2em] uppercase whitespace-nowrap">Take a size</button>
            <a v-else-if="open" :href="whatsappHref" target="_blank" rel="noopener" class="ml-auto border border-black/20 px-5 py-3 text-[10px] font-semibold tracking-[0.2em] uppercase whitespace-nowrap">Share</a>
        </div>
    </div>
</template>
