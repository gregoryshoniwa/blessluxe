<script>
import { api } from '../../../lib/api.js';
import { X, LoaderCircle, Gift } from 'lucide-vue-next';

/**
 * Send a gift — on a look, or in a live. `target` = { context: 'look'|'live', id, name }.
 *
 * Every tap carries a fresh key; if the network drops and the tap is retried
 * with the same key, the server recognises it and doesn't charge twice.
 */
export default {
    name: 'GiftSheet',
    components: { X, LoaderCircle, Gift },
    props: { target: { type: Object, default: null } },
    emits: ['close', 'sent'],
    data() { return { types: [], balance: null, left: null, loading: true, sending: null, key: null, error: null, thanks: null }; },
    watch: {
        target: { immediate: true, handler(t) { if (t) this.open(); } },
    },
    methods: {
        async open() {
            this.error = null; this.thanks = null; this.loading = true;
            try {
                const d = await api.get('/api/account/hive/gifts');
                this.types = d.gift_types; this.balance = d.balance; this.left = d.left_today;
            } catch (e) { this.error = e.payload?.error || "We couldn't load gifts."; }
            finally { this.loading = false; }
        },
        newKey() { return (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 48); },
        canAfford(g) { return this.balance !== null && g.bees <= this.balance && g.bees <= this.left; },
        async send(g) {
            if (this.sending || !this.canAfford(g)) return;
            this.sending = g.code; this.error = null;
            // One key per intended gift: kept across a retry, replaced after a success.
            this.key = this.key || this.newKey();
            try {
                const d = await api.post('/api/account/hive/gifts', { context: this.target.context, id: this.target.id, gift: g.code, key: this.key });
                this.key = null;
                this.balance = d.balance; this.left = d.left_today;
                this.thanks = d.gift;
                this.$emit('sent', d.gift);
                setTimeout(() => { this.thanks = null; }, 2200);
            } catch (e) {
                if (e.status && e.status < 500) this.key = null;          // refused, not lost — a new try is a new gift
                this.error = e.payload?.error || "That gift didn't go through. Tap to try again.";
            } finally { this.sending = null; }
        },
    },
};
</script>

<template>
    <div v-if="target" class="fixed inset-0 z-[95] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Send a gift">
        <div class="absolute inset-0 bg-black/50" @click="$emit('close')"></div>
        <div class="relative bg-white w-full sm:max-w-md p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div class="flex items-center justify-between">
                <h2 class="font-display text-lg tracking-widest uppercase flex items-center gap-2"><Gift class="w-5 h-5 text-gold" /> Send a gift</h2>
                <button @click="$emit('close')" class="w-11 h-11 -mr-3 inline-flex items-center justify-center text-black/45 hover:text-black" aria-label="Close"><X class="w-5 h-5" /></button>
            </div>
            <p class="text-xs text-black/55 mb-4">To {{ target.name }}. Gifts are Bees you've earned; they can spend them in the BLESSLUXE shop.</p>

            <p v-if="loading" class="text-sm text-black/40 py-8 text-center">Loading…</p>
            <template v-else>
                <div class="relative">
                    <div class="grid grid-cols-5 gap-2">
                        <button
                            v-for="g in types"
                            :key="g.code"
                            @click="send(g)"
                            :disabled="!canAfford(g) || !!sending"
                            :class="['border py-2.5 flex flex-col items-center gap-0.5 transition-colors', canAfford(g) ? 'border-black/10 hover:border-gold hover:bg-cream' : 'border-black/5 opacity-40']"
                            :aria-label="`Send a ${g.label}, ${g.bees} Bees`"
                        >
                            <LoaderCircle v-if="sending === g.code" class="w-6 h-6 animate-spin text-gold" />
                            <span v-else class="text-2xl leading-none" aria-hidden="true">{{ g.emoji }}</span>
                            <span class="text-[10px] mt-1 truncate max-w-full px-0.5">{{ g.label }}</span>
                            <span class="text-[10px] text-gold-dark font-medium">{{ g.bees }}</span>
                        </button>
                    </div>
                    <div v-if="thanks" class="absolute inset-0 bg-white/95 flex flex-col items-center justify-center" role="status">
                        <span class="text-5xl animate-bounce">{{ thanks.emoji }}</span>
                        <span class="text-sm font-medium mt-1">{{ thanks.label }} sent</span>
                    </div>
                </div>

                <p class="flex justify-between text-[11px] text-black/50 mt-3">
                    <span>You have <strong class="text-black">{{ balance }}</strong> Bees</span>
                    <span>{{ left }} left to give today</span>
                </p>
                <p v-if="balance !== null && types.length && balance < types[0].bees" class="text-xs text-black/55 bg-cream px-3.5 py-3 mt-3 leading-relaxed">
                    You earn Bees by shopping, posting a try-on of something you bought, or having an answer accepted in Ask.
                </p>
                <p v-if="error" class="text-sm text-red-600 mt-3" role="alert">{{ error }}</p>
            </template>
        </div>
    </div>
</template>
