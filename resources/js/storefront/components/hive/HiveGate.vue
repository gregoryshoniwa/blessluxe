<script>
import { hiveStore } from '../../hive-store.js';
import { toastError } from '../../../lib/dialog.js';
import { ShieldCheck, LoaderCircle } from 'lucide-vue-next';

/**
 * The one-time 18+ confirmation. Mounted once per Hive page; opened by
 * `hiveStore.ready()` the first time someone tries to post, heart or follow.
 *
 * Asked at the moment it matters rather than at the door: reading the Hive
 * needs nothing, so nobody is interrupted until they want to take part.
 */
export default {
    name: 'HiveGate',
    components: { ShieldCheck, LoaderCircle },
    data() { return { hive: hiveStore.state, ticked: false, saving: false }; },
    methods: {
        async confirm() {
            if (!this.ticked || this.saving) return;
            this.saving = true;
            try { await hiveStore.confirmAdult(); }
            catch (e) { toastError(e); }
            finally { this.saving = false; }
        },
        cancel() { hiveStore.settleGate(false); },
    },
};
</script>

<template>
    <div v-if="hive.gateOpen" class="fixed inset-0 z-[95] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Confirm your age">
        <div class="absolute inset-0 bg-black/50" @click="cancel"></div>
        <div class="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl">
            <ShieldCheck class="w-8 h-8 text-gold mb-3" />
            <h2 class="font-display text-xl tracking-widest uppercase mb-2">One thing first</h2>
            <p class="text-sm text-black/65 leading-relaxed mb-5">
                Bless Hive is a community for adults. To post, heart and follow, please confirm your age. You only do this once.
            </p>
            <label class="flex items-start gap-3 p-3.5 rounded-xl border border-black/10 cursor-pointer mb-5">
                <input v-model="ticked" type="checkbox" class="mt-0.5 w-5 h-5 accent-[var(--color-gold)] flex-shrink-0" />
                <span class="text-sm">I am 18 or older, and I'll only post photos of myself or of people who've agreed — never of children.</span>
            </label>
            <div class="flex gap-3">
                <button @click="cancel" class="flex-1 py-3.5 text-xs tracking-[0.25em] uppercase border border-black/15 hover:bg-cream transition-colors">Not now</button>
                <button @click="confirm" :disabled="!ticked || saving" class="flex-1 py-3.5 text-xs font-semibold tracking-[0.25em] uppercase bg-gold text-white hover:bg-gold-dark transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2">
                    <LoaderCircle v-if="saving" class="w-4 h-4 animate-spin" /> Confirm
                </button>
            </div>
        </div>
    </div>
</template>
