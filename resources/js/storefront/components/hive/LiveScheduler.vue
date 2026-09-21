<script>
import { api } from '../../../lib/api.js';
import { toast } from '../../../lib/dialog.js';
import { X, LoaderCircle, RectangleVertical, RectangleHorizontal, Square } from 'lucide-vue-next';

/** Schedule a live: a title, your live's link, and when. The stream itself stays on the platform you already use. */
export default {
    name: 'LiveScheduler',
    components: { X, LoaderCircle, RectangleVertical, RectangleHorizontal, Square },
    emits: ['close', 'scheduled'],
    data() {
        const soon = new Date(Date.now() + 60 * 60000); soon.setMinutes(0, 0, 0);
        const local = new Date(soon.getTime() - soon.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        return {
            form: { title: '', url: '', starts_at: local, description: '', shape: 'tall' },
            saving: false, errors: {},
            shapes: [{ key: 'tall', label: 'Portrait', icon: 'RectangleVertical' }, { key: 'wide', label: 'Landscape', icon: 'RectangleHorizontal' }, { key: 'post', label: 'Square', icon: 'Square' }],
        };
    },
    mounted() { document.body.style.overflow = 'hidden'; },
    beforeUnmount() { document.body.style.overflow = ''; },
    methods: {
        async save() {
            if (this.saving) return;
            this.saving = true; this.errors = {};
            try {
                const d = await api.post('/api/account/hive/lives', { ...this.form, starts_at: new Date(this.form.starts_at).toISOString() });
                toast('Your live is scheduled');
                this.$emit('scheduled', d.live);
            } catch (e) { this.errors = e.payload?.errors || { _: [e.payload?.error || "That didn't save. Try again."] }; }
            finally { this.saving = false; }
        },
    },
};
</script>

<template>
    <div class="fixed inset-0 z-[90] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Schedule a live">
        <div class="absolute inset-0 bg-black/50" @click="$emit('close')"></div>
        <form @submit.prevent="save" class="relative bg-white w-full sm:max-w-lg max-h-[92dvh] flex flex-col shadow-2xl">
            <header class="flex items-center justify-between px-5 py-3.5 border-b border-black/8 flex-shrink-0">
                <h2 class="font-display text-lg tracking-widest uppercase">Schedule a live</h2>
                <button type="button" @click="$emit('close')" class="w-11 h-11 -mr-3 inline-flex items-center justify-center text-black/45 hover:text-black" aria-label="Close"><X class="w-5 h-5" /></button>
            </header>
            <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
                <p class="text-xs text-black/55 bg-cream px-3.5 py-3 leading-relaxed">Go live on YouTube, TikTok, Facebook or Instagram as you normally do, and paste that link here. People watch it inside the Hive, get a reminder when you start, and can send you gifts.</p>
                <label class="block"><span class="block text-xs text-black/60 mb-1">What's it about?</span>
                    <input v-model.trim="form.title" required maxlength="100" placeholder="Styling five wedding-guest looks" class="w-full border border-black/12 g px-3 py-2.5 text-sm focus:outline-none focus:border-gold" />
                    <span v-if="errors.title" class="block text-[11px] text-red-600 mt-1">{{ errors.title[0] }}</span></label>
                <label class="block"><span class="block text-xs text-black/60 mb-1">Your live's link</span>
                    <input v-model.trim="form.url" required type="url" inputmode="url" autocapitalize="none" placeholder="https://…" class="w-full border border-black/12 g px-3 py-2.5 text-sm focus:outline-none focus:border-gold" />
                    <span v-if="errors.url" class="block text-[11px] text-red-600 mt-1">{{ errors.url[0] }}</span>
                    <span v-else class="block text-[11px] text-black/40 mt-1">On YouTube you can create the live in advance and copy its link before you start.</span></label>
                <label class="block"><span class="block text-xs text-black/60 mb-1">When</span>
                    <input v-model="form.starts_at" required type="datetime-local" class="w-full border border-black/12 g px-3 py-2.5 text-sm focus:outline-none focus:border-gold" />
                    <span v-if="errors.starts_at" class="block text-[11px] text-red-600 mt-1">{{ errors.starts_at[0] }}</span></label>
                <div><span class="block text-xs text-black/60 mb-1.5">How will you film it?</span>
                    <div class="grid grid-cols-3 gap-2">
                        <button v-for="sh in shapes" :key="sh.key" type="button" @click="form.shape = sh.key" :aria-pressed="form.shape === sh.key" :class="['border py-2.5 flex flex-col items-center gap-1 text-xs transition-colors', form.shape === sh.key ? 'border-gold bg-cream' : 'border-black/10 text-black/55']">
                            <component :is="sh.icon" class="w-5 h-5" /> {{ sh.label }}
                        </button>
                    </div></div>
                <label class="block"><span class="block text-xs text-black/60 mb-1">Anything else? <span class="text-black/35">(optional)</span></span>
                    <textarea v-model="form.description" rows="2" maxlength="400" class="w-full border border-black/12 g px-3 py-2.5 text-sm focus:outline-none focus:border-gold resize-none"></textarea></label>
                <p v-if="errors._" class="text-sm text-red-600" role="alert">{{ errors._[0] }}</p>
            </div>
            <footer class="px-5 py-3.5 border-t border-black/8 flex-shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                <button type="submit" :disabled="saving" class="w-full bg-gold text-white py-3.5 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark disabled:opacity-40 inline-flex items-center justify-center gap-2">
                    <LoaderCircle v-if="saving" class="w-4 h-4 animate-spin" /> Schedule
                </button>
            </footer>
        </form>
    </div>
</template>
