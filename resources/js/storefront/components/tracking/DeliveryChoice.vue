<script>
import { api } from '../../../lib/api.js';
import { Check, LoaderCircle, Copy } from 'lucide-vue-next';

export default {
    name: 'DeliveryChoice',
    components: { Check, LoaderCircle, Copy },
    props: {
        delivery: { type: Object, required: true },
        addresses: { type: Array, default: () => [] },
    },
    emits: ['updated'],
    data() {
        return {
            pref: this.delivery.preference || 'collect',
            courierId: this.delivery.courier_id || null,
            addressId: null,
            options: [],
            saving: false,
            error: '',
            copied: false,
        };
    },
    computed: {
        locked() { return !!this.delivery.locked; },
        feePaid() { return this.delivery.fee_status === 'paid'; },
        // The PIN only exists once BLESSLUXE physically holds the goods.
        pin() { return this.delivery.collection_pin; },
        chosen() { return this.options.find((o) => o.courier_id === this.courierId) || null; },
    },
    async mounted() { await this.loadOptions(); },
    methods: {
        async loadOptions() {
            try {
                const d = await api.get('/api/store/couriers');
                this.options = d.couriers || [];
                if (!this.courierId) {
                    this.courierId = (this.options.find((o) => o.is_default) || this.options[0])?.courier_id || null;
                }
            } catch { this.options = []; }
        },
        async choose(pref) {
            if (this.locked) return;
            // Switching away from a paid forward owes a refund, so it is not
            // self-serve — the server refuses it and we explain why.
            this.pref = pref;
            if (pref === 'collect') await this.save();
        },
        async save() {
            this.saving = true;
            this.error = '';
            try {
                const body = { preference: this.pref };
                if (this.pref === 'forward') {
                    body.courier_id = this.courierId;
                    if (this.addressId) body.address_id = this.addressId;
                }
                const d = await api.put(
                    `/api/account/pack-slots/${encodeURIComponent(this.delivery.slot_id)}/delivery`,
                    body,
                );
                this.$emit('updated', d.delivery);
            } catch (e) {
                this.error = e.payload?.error || 'Could not save that choice.';
                this.pref = this.delivery.preference || 'collect';
            } finally { this.saving = false; }
        },
        async copyPin() {
            try {
                await navigator.clipboard.writeText(this.pin);
                this.copied = true;
                setTimeout(() => { this.copied = false; }, 1800);
            } catch { /* clipboard blocked — the code is on screen anyway */ }
        },
    },
};
</script>

<template>
    <section class="bg-white border border-gold/10 p-6">
        <h2 class="font-display text-sm tracking-widest uppercase mb-1">How would you like it?</h2>
        <p class="text-xs text-black/55 mb-4">{{ delivery.cutoff_copy }}</p>

        <!-- Collection code. Shown only to this buyer, only once we hold the goods. -->
        <div v-if="pin" class="bg-cream-dark/50 border border-gold/20 p-4 mb-5">
            <p class="text-[10px] tracking-widest uppercase text-black/55 mb-1">Your collection code</p>
            <div class="flex items-center gap-3 flex-wrap">
                <p class="font-mono text-2xl tracking-[0.3em] text-gold-dark">{{ pin }}</p>
                <button @click="copyPin" class="text-[10px] tracking-widest uppercase text-black/55 hover:text-gold inline-flex items-center gap-1">
                    <Copy class="w-3 h-3" /> {{ copied ? 'Copied' : 'Copy' }}
                </button>
            </div>
            <p class="text-xs text-black/65 mt-2">
                Show this when you collect. Keep it to yourself — anyone with this code can claim your piece.
            </p>
        </div>

        <p v-if="error" class="text-sm text-red-600 mb-4">{{ error }}</p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- Collect -->
            <button
                @click="choose('collect')"
                :disabled="locked || saving"
                :class="[
                    'text-left border p-4 transition-colors disabled:opacity-50',
                    pref === 'collect' ? 'border-gold border-2 bg-gold/5' : 'border-black/15 hover:border-gold/50',
                ]"
            >
                <span class="flex items-center justify-between gap-2">
                    <span class="font-display text-base">Collect in person</span>
                    <Check v-if="pref === 'collect'" class="w-4 h-4 text-gold-dark" />
                </span>
                <span class="block text-[10px] tracking-widest uppercase text-emerald-700 mt-1">Free</span>
                <span v-if="delivery.collection_point" class="block text-xs text-black/65 mt-2">{{ delivery.collection_point }}</span>
                <span v-if="delivery.collection_hours" class="block text-xs text-black/45 mt-1">{{ delivery.collection_hours }}</span>
            </button>

            <!-- Forward -->
            <button
                @click="choose('forward')"
                :disabled="locked || saving"
                :class="[
                    'text-left border p-4 transition-colors disabled:opacity-50',
                    pref === 'forward' ? 'border-gold border-2 bg-gold/5' : 'border-black/15 hover:border-gold/50',
                ]"
            >
                <span class="flex items-center justify-between gap-2">
                    <span class="font-display text-base">Deliver to me</span>
                    <Check v-if="pref === 'forward'" class="w-4 h-4 text-gold-dark" />
                </span>
                <span class="block text-[10px] tracking-widest uppercase text-gold-dark mt-1">
                    {{ chosen ? chosen.label : 'Choose a courier' }}
                </span>
                <span v-if="feePaid" class="block text-xs text-emerald-700 mt-2">Paid ✓</span>
            </button>
        </div>

        <!-- Courier picker, only when forwarding -->
        <div v-if="pref === 'forward' && !locked" class="mt-5 space-y-3">
            <p class="text-[10px] tracking-widest uppercase text-black/55">Choose a courier</p>
            <label
                v-for="o in options"
                :key="o.courier_id"
                class="flex items-center gap-3 border p-3 cursor-pointer transition-colors"
                :class="courierId === o.courier_id ? 'border-gold border-2' : 'border-black/10 hover:border-gold/40'"
            >
                <input type="radio" :value="o.courier_id" v-model="courierId" class="accent-[#C9A84C]" />
                <span class="flex-1 min-w-0">
                    <span class="block text-sm">{{ o.courier }}</span>
                    <span v-if="o.description" class="block text-xs text-black/50">{{ o.description }}</span>
                </span>
                <span class="text-right shrink-0">
                    <span class="block text-sm font-semibold">{{ o.label }}</span>
                    <span v-if="o.eta_days" class="block text-[10px] tracking-widest uppercase text-black/45">{{ o.eta_days }}</span>
                </span>
            </label>

            <select v-if="addresses.length" v-model="addressId" class="border border-black/15 px-3 py-2 text-sm w-full">
                <option :value="null">Choose a delivery address…</option>
                <option v-for="a in addresses" :key="a.id" :value="a.id">
                    {{ [a.first_name, a.last_name].filter(Boolean).join(' ') }} — {{ a.line1 }}, {{ a.city }}
                </option>
            </select>
            <router-link v-else to="/account?tab=addresses" class="text-xs text-gold-dark underline inline-block">
                Add a delivery address first →
            </router-link>

            <button
                @click="save"
                :disabled="saving || !courierId || !addressId"
                class="w-full bg-gold text-white px-4 py-2 text-[10px] font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
                <LoaderCircle v-if="saving" class="w-3.5 h-3.5 animate-spin" />
                {{ saving ? 'Saving' : 'Confirm delivery' }}
            </button>
        </div>

        <p v-if="locked" class="text-xs text-black/55 mt-4">
            Your piece has already been dispatched or handed over, so this can no longer be changed.
        </p>
    </section>
</template>
