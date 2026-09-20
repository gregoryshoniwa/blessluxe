<script>
import { dialogState, settleConfirm, dismissToast } from '../lib/dialog.js';
import { X, TriangleAlert, Check, Info } from 'lucide-vue-next';

/**
 * Renders confirms and toasts for whichever SPA mounts it.
 *
 * One component rather than two so the behaviour — focus, Escape, backdrop
 * click, stacking — can't drift between storefront and admin. Only the palette
 * differs, via the `theme` prop.
 */
export default {
    name: 'DialogHost',
    components: { X, TriangleAlert, Check, Info },
    props: {
        theme: { type: String, default: 'storefront' }, // 'storefront' | 'admin'
    },
    data() {
        return { state: dialogState };
    },
    computed: {
        isAdmin() { return this.theme === 'admin'; },
        confirmTone() { return this.state.confirm?.tone || 'default'; },
    },
    watch: {
        // Move focus to the dialog so Enter and Escape work without a click,
        // and so screen readers announce it.
        'state.confirm'(v) {
            if (v) this.$nextTick(() => this.$refs.confirmBtn?.focus());
        },
    },
    mounted() { window.addEventListener('keydown', this.onKey); },
    beforeUnmount() { window.removeEventListener('keydown', this.onKey); },
    methods: {
        onKey(e) {
            if (!this.state.confirm) return;
            // Escape cancels — the same escape hatch the native dialog gave us.
            if (e.key === 'Escape') { e.preventDefault(); this.answer(false); }
        },
        answer(v) { settleConfirm(v); },
        dismissToast,
        toastIcon(tone) {
            return tone === 'error' ? 'TriangleAlert' : tone === 'info' ? 'Info' : 'Check';
        },
    },
};
</script>

<template>
    <div>
        <!-- ─── Confirm ─────────────────────────────────────────────── -->
        <Transition name="dlg-fade">
            <div
                v-if="state.confirm"
                class="fixed inset-0 z-[100] flex items-center justify-center p-4"
                role="dialog"
                aria-modal="true"
                :aria-label="state.confirm.title"
            >
                <!-- Backdrop click cancels, matching the Escape key. -->
                <div class="absolute inset-0 bg-black/45 backdrop-blur-[2px]" @click="answer(false)"></div>

                <div
                    class="relative w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain shadow-2xl"
                    :class="isAdmin ? 'bg-white border border-zinc-200' : 'bg-white border border-gold/20'"
                >
                    <div
                        class="h-[3px]"
                        :class="confirmTone === 'danger' ? 'bg-red-500' : (isAdmin ? 'bg-zinc-800' : 'bg-gold')"
                    ></div>

                    <button
                        @click="answer(false)"
                        class="absolute top-3 right-3 text-black/35 hover:text-black/70 transition-colors"
                        aria-label="Cancel"
                    >
                        <X class="w-4 h-4" />
                    </button>

                    <div class="p-6 pt-7">
                        <div class="flex items-start gap-3">
                            <span
                                v-if="confirmTone === 'danger'"
                                class="w-9 h-9 rounded-full bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0"
                            >
                                <TriangleAlert class="w-4 h-4" />
                            </span>
                            <div class="min-w-0">
                                <h2
                                    class="text-base leading-snug"
                                    :class="isAdmin ? 'font-semibold' : 'font-display tracking-wide'"
                                >{{ state.confirm.title }}</h2>
                                <p v-if="state.confirm.body" class="text-sm text-black/60 mt-2 leading-relaxed">
                                    {{ state.confirm.body }}
                                </p>
                            </div>
                        </div>

                        <div class="flex items-center justify-end gap-2 mt-6">
                            <button
                                @click="answer(false)"
                                class="px-4 py-2 text-[10px] tracking-[0.2em] uppercase text-black/60 hover:text-black transition-colors"
                            >
                                {{ state.confirm.cancelLabel }}
                            </button>
                            <button
                                ref="confirmBtn"
                                @click="answer(true)"
                                class="px-5 py-2 text-[10px] font-semibold tracking-[0.2em] uppercase text-white transition-colors"
                                :class="confirmTone === 'danger'
                                    ? 'bg-red-600 hover:bg-red-700'
                                    : (isAdmin ? 'bg-zinc-900 hover:bg-black' : 'bg-gold hover:bg-gold-dark')"
                            >
                                {{ state.confirm.confirmLabel }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- ─── Toasts ──────────────────────────────────────────────── -->
        <div class="dlg-toasts fixed z-[110] bottom-4 right-4 left-4 sm:left-auto flex flex-col items-stretch sm:items-end gap-2 pointer-events-none">
            <TransitionGroup name="dlg-toast">
                <div
                    v-for="t in state.toasts"
                    :key="t.id"
                    class="pointer-events-auto shadow-lg max-w-sm w-full sm:w-auto flex items-start gap-3 px-4 py-3 bg-white border-l-[3px]"
                    :class="t.tone === 'error'
                        ? 'border-red-500'
                        : (t.tone === 'info' ? 'border-zinc-400' : 'border-emerald-500')"
                    role="status"
                >
                    <component
                        :is="toastIcon(t.tone)"
                        class="w-4 h-4 flex-shrink-0 mt-0.5"
                        :class="t.tone === 'error' ? 'text-red-600' : (t.tone === 'info' ? 'text-zinc-500' : 'text-emerald-600')"
                    />
                    <p class="text-sm text-black/80 flex-1 leading-snug">{{ t.message }}</p>
                    <button @click="dismissToast(t.id)" class="text-black/30 hover:text-black/60 transition-colors" aria-label="Dismiss">
                        <X class="w-3.5 h-3.5" />
                    </button>
                </div>
            </TransitionGroup>
        </div>
    </div>
</template>

<style scoped>
.dlg-fade-enter-active, .dlg-fade-leave-active { transition: opacity .18s ease; }
.dlg-fade-enter-from, .dlg-fade-leave-to { opacity: 0; }

.dlg-toast-enter-active, .dlg-toast-leave-active { transition: all .22s ease; }
.dlg-toast-enter-from { opacity: 0; transform: translateY(8px); }
.dlg-toast-leave-to { opacity: 0; transform: translateX(12px); }
</style>
