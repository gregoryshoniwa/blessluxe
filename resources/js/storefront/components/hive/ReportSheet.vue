<script>
import { api } from '../../../lib/api.js';
import { toast, toastError } from '../../../lib/dialog.js';
import { X, LoaderCircle } from 'lucide-vue-next';

const REASONS = [
    { key: 'minor',      label: 'It shows a child',            hint: 'Hidden straight away while we check.' },
    { key: 'nudity',     label: 'Nudity or sexual content' },
    { key: 'harassment', label: 'Bullying or body-shaming' },
    { key: 'scam',       label: 'A scam or fake seller' },
    { key: 'spam',       label: 'Spam' },
    { key: 'other',      label: 'Something else' },
];

/** Report a look or a page. `subject` = { type: 'look'|'page', id }. */
export default {
    name: 'ReportSheet',
    components: { X, LoaderCircle },
    props: { subject: { type: Object, default: null } },
    emits: ['close', 'sent'],
    data() { return { reason: null, note: '', sending: false, REASONS }; },
    watch: { subject() { this.reason = null; this.note = ''; } },
    methods: {
        async send() {
            if (!this.reason || this.sending) return;
            this.sending = true;
            try {
                await api.post('/api/account/hive/reports', { type: this.subject.type, id: this.subject.id, reason: this.reason, note: this.note.trim() || null });
                toast("Thank you — we'll take a look.");
                this.$emit('sent', this.subject);
                this.$emit('close');
            } catch (e) {
                if (e.status === 401) this.$router.push({ path: '/account/login', query: { next: this.$route.fullPath } });
                else toastError(e);
            } finally {
                this.sending = false;
            }
        },
    },
};
</script>

<template>
    <div v-if="subject" class="fixed inset-0 z-[95] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Report">
        <div class="absolute inset-0 bg-black/50" @click="$emit('close')"></div>
        <div class="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90dvh] overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div class="flex items-center justify-between mb-1">
                <h2 class="font-display text-lg tracking-widest uppercase">Report</h2>
                <button @click="$emit('close')" class="w-11 h-11 -mr-3 inline-flex items-center justify-center text-black/45 hover:text-black" aria-label="Close"><X class="w-5 h-5" /></button>
            </div>
            <p class="text-xs text-black/50 mb-4">They won't know it was you.</p>

            <div class="space-y-1.5 mb-4">
                <label v-for="r in REASONS" :key="r.key" :class="['flex items-start gap-3 px-3.5 py-3 rounded-xl border cursor-pointer transition-colors', reason === r.key ? 'border-gold bg-cream' : 'border-black/10']">
                    <input v-model="reason" type="radio" :value="r.key" class="mt-0.5 w-4 h-4 accent-[var(--color-gold)] flex-shrink-0" />
                    <span class="text-sm">
                        {{ r.label }}
                        <span v-if="r.hint" class="block text-[11px] text-black/45">{{ r.hint }}</span>
                    </span>
                </label>
            </div>

            <textarea v-model="note" rows="2" maxlength="300" placeholder="Anything we should know? (optional)" class="w-full border border-black/12 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-gold resize-none mb-4"></textarea>

            <button @click="send" :disabled="!reason || sending" class="w-full bg-black text-white py-3.5 text-xs font-semibold tracking-[0.3em] uppercase disabled:opacity-40 inline-flex items-center justify-center gap-2">
                <LoaderCircle v-if="sending" class="w-4 h-4 animate-spin" /> Send report
            </button>
        </div>
    </div>
</template>
