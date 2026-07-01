<script>
import { api } from '../../lib/api.js';
import { Clock, Lock, Check, X, ArrowRight, Sparkles } from 'lucide-vue-next';

export default {
    name: 'PackCampaign',
    components: { Clock, Lock, Check, X, ArrowRight, Sparkles },
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
        };
    },
    computed: {
        code() { return (this.$route.params.code || '').toUpperCase(); },
        campaign() { return this.data?.campaign || null; },
        slots() { return this.data?.slots || []; },
        totals() { return this.data?.totals || { total: 0, available: 0, reserved: 0, paid: 0 }; },
        myReservedSlot() { return this.slots.find((s) => s.is_mine); },
    },
    async mounted() {
        await Promise.all([this.fetch(), this.fetchMe()]);
        // Tick once a second so reservation countdowns update live.
        this.tickInterval = setInterval(() => { this.now = Date.now(); }, 1000);
    },
    beforeUnmount() {
        clearInterval(this.tickInterval);
    },
    methods: {
        async fetch() {
            this.loading = true;
            try {
                this.data = await api.get(`/api/store/packs/${encodeURIComponent(this.code)}`);
            } catch (e) {
                if (e.status === 404) this.notFound = true;
                else this.error = e.payload?.error || 'Could not load this pack.';
            } finally { this.loading = false; }
        },
        async fetchMe() {
            try {
                const d = await api.get('/api/account/me');
                this.customer = d.customer;
            } catch { this.customer = null; }
        },
        secondsLeft(slot) {
            if (!slot.reserved_until) return 0;
            const ms = new Date(slot.reserved_until).getTime() - this.now;
            return Math.max(0, Math.floor(ms / 1000));
        },
        formatSeconds(s) {
            const m = Math.floor(s / 60);
            const sec = s % 60;
            return `${m}:${sec.toString().padStart(2, '0')}`;
        },
        async reserve(slot) {
            if (!this.customer) {
                this.$router.push(`/account/login?next=/shop/packs/${this.code}`);
                return;
            }
            this.actingOnSlotId = slot.id;
            this.error = '';
            try {
                await api.post(`/api/store/packs/${encodeURIComponent(this.code)}/slots/${slot.id}/reserve`);
                window.dispatchEvent(new CustomEvent('blessluxe:cart-updated'));
                await this.fetch();
            } catch (e) {
                this.error = e.payload?.error || 'Could not reserve that slot.';
                if (e.status === 409) await this.fetch();
            } finally { this.actingOnSlotId = null; }
        },
        async release(slot) {
            this.actingOnSlotId = slot.id;
            try {
                await api.post(`/api/store/packs/${encodeURIComponent(this.code)}/slots/${slot.id}/release`);
                window.dispatchEvent(new CustomEvent('blessluxe:cart-updated'));
                await this.fetch();
            } finally { this.actingOnSlotId = null; }
        },
    },
};
</script>

<template>
    <div class="max-w-[1200px] mx-auto px-[5%] py-12 min-h-[60vh]">
        <div v-if="loading" class="text-center py-20 text-[10px] tracking-widest uppercase text-black/55 animate-pulse">Loading pack</div>

        <div v-else-if="notFound" class="text-center py-20 max-w-md mx-auto">
            <p class="font-script text-3xl text-gold">404</p>
            <h1 class="font-display text-2xl tracking-widest uppercase mb-2">Pack not found</h1>
            <router-link to="/shop/packs" class="text-gold underline">Back to packs</router-link>
        </div>

        <div v-else>
            <!-- Header -->
            <header class="text-center mb-10">
                <p class="font-script text-3xl text-gold">{{ campaign.host_kind === 'customer' ? 'Customer-hosted drop' : 'Limited drop' }}</p>
                <h1 class="font-display text-3xl md:text-4xl tracking-widest uppercase">{{ campaign.title || campaign.definition?.title }}</h1>
                <p v-if="campaign.definition?.description" class="text-sm text-black/65 mt-3 max-w-xl mx-auto">{{ campaign.definition.description }}</p>
                <div class="flex items-center justify-center gap-3 mt-4 text-xs text-black/55">
                    <span class="font-mono text-gold-dark">{{ campaign.public_code }}</span>
                    <span>·</span>
                    <span>Reservation holds for {{ campaign.reservation_minutes }} minutes</span>
                </div>
            </header>

            <!-- Status banner -->
            <div v-if="campaign.status !== 'open'" class="bg-zinc-100 border border-zinc-200 px-4 py-3 mb-6 text-sm text-center">
                <span v-if="campaign.status === 'filled'">This pack has sold out. Watch your inbox for the next drop.</span>
                <span v-else-if="campaign.status === 'cancelled'">This pack was cancelled.</span>
                <span v-else>This pack is closed.</span>
            </div>

            <!-- Totals -->
            <div class="grid grid-cols-3 gap-4 mb-10 text-center">
                <div class="bg-cream-dark/30 border border-gold/10 p-4">
                    <p class="text-[10px] tracking-widest uppercase text-black/55">Total slots</p>
                    <p class="font-display text-2xl">{{ totals.total }}</p>
                </div>
                <div class="bg-cream-dark/30 border border-gold/10 p-4">
                    <p class="text-[10px] tracking-widest uppercase text-gold-dark">Available</p>
                    <p class="font-display text-2xl text-gold-dark">{{ totals.available }}</p>
                </div>
                <div class="bg-cream-dark/30 border border-gold/10 p-4">
                    <p class="text-[10px] tracking-widest uppercase text-emerald-600">Locked in</p>
                    <p class="font-display text-2xl text-emerald-600">{{ totals.paid + totals.reserved }}</p>
                </div>
            </div>

            <p v-if="error" class="text-sm text-red-600 text-center mb-4">{{ error }}</p>

            <!-- Slots grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-12">
                <div
                    v-for="slot in slots"
                    :key="slot.id"
                    :class="[
                        'border bg-white p-4 flex gap-3 transition-all',
                        slot.is_mine ? 'border-gold border-2' : 'border-gold/15',
                        slot.status === 'paid' && 'opacity-60',
                    ]"
                >
                    <router-link :to="`/shop/${slot.product.handle}`" class="w-20 h-24 bg-cream-dark flex-shrink-0 overflow-hidden">
                        <img
                            v-if="slot.product.thumbnail"
                            :src="slot.product.thumbnail"
                            :alt="slot.product.title"
                            class="w-full h-full object-cover object-top"
                        />
                    </router-link>
                    <div class="flex-1 min-w-0">
                        <p class="font-display text-sm leading-tight line-clamp-1">{{ slot.product.title }}</p>
                        <p class="text-xs text-black/55">Size {{ slot.size_label || slot.variant.title }}</p>
                        <p class="text-sm font-semibold mt-1">{{ slot.variant.price_label || '—' }}</p>

                        <!-- State badges -->
                        <div class="mt-2 flex items-center gap-1 text-[10px] tracking-widest uppercase">
                            <span v-if="slot.status === 'paid'" class="bg-emerald-100 text-emerald-700 px-2 py-0.5 inline-flex items-center gap-1">
                                <Check class="w-3 h-3" /> Paid
                            </span>
                            <span v-else-if="slot.status === 'reserved' && !slot.is_mine" class="bg-amber-100 text-amber-700 px-2 py-0.5 inline-flex items-center gap-1">
                                <Lock class="w-3 h-3" /> Held
                            </span>
                            <span v-else-if="slot.is_mine" class="bg-gold/20 text-gold-dark px-2 py-0.5 inline-flex items-center gap-1">
                                <Sparkles class="w-3 h-3" />
                                Yours · <Clock class="w-3 h-3" /> {{ formatSeconds(secondsLeft(slot)) }}
                            </span>
                            <span v-else class="bg-emerald-50 text-emerald-700 px-2 py-0.5">Available</span>
                        </div>

                        <!-- Actions -->
                        <div class="mt-3">
                            <button
                                v-if="slot.status === 'available' && campaign.status === 'open'"
                                @click="reserve(slot)"
                                :disabled="actingOnSlotId === slot.id"
                                class="w-full bg-gold text-white px-3 py-1.5 text-[10px] font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1"
                            >
                                {{ actingOnSlotId === slot.id ? 'Reserving…' : 'Reserve' }}
                                <ArrowRight v-if="actingOnSlotId !== slot.id" class="w-3 h-3" />
                            </button>
                            <div v-else-if="slot.is_mine" class="flex gap-1">
                                <router-link to="/cart" class="flex-1 text-center bg-gold text-white px-3 py-1.5 text-[10px] font-semibold tracking-widest uppercase hover:bg-gold-dark">
                                    Checkout
                                </router-link>
                                <button @click="release(slot)" :disabled="actingOnSlotId === slot.id" class="border border-black/15 px-3 py-1.5 text-[10px] tracking-widest uppercase hover:border-red-300 hover:text-red-600 disabled:opacity-50" title="Drop the hold">
                                    <X class="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Mine summary -->
            <div v-if="myReservedSlot" class="bg-gold/15 border border-gold/30 p-4 mb-12 text-center text-sm">
                You're holding 1 slot · expires in <span class="font-mono">{{ formatSeconds(secondsLeft(myReservedSlot)) }}</span>.
                <router-link to="/cart" class="ml-2 text-gold-dark underline font-semibold">Go to checkout →</router-link>
            </div>
        </div>
    </div>
</template>
