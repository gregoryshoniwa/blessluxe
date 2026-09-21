<script>
import { api } from '../../../lib/api.js';
import { toast } from '../../../lib/dialog.js';
import { resizeImage } from '../../../lib/image-resize.js';
import { occasionLabel } from '../../hive-store.js';
import { X, ImagePlus, LoaderCircle } from 'lucide-vue-next';

/** Ask the Hive. Photos are optional; two or more turn the question into a vote. */
export default {
    name: 'AskComposer',
    components: { X, ImagePlus, LoaderCircle },
    props: { occasions: { type: Array, default: () => [] }, reward: { type: Number, default: 0 } },
    emits: ['close', 'posted'],
    data() { return { question: '', details: '', occasion: '', photos: [], preparing: false, sending: false, error: null }; },
    computed: { canPost() { return this.question.trim().length >= 8 && !this.sending && !this.preparing; } },
    mounted() { document.body.style.overflow = 'hidden'; this.$nextTick(() => this.$refs.q?.focus()); },
    beforeUnmount() { document.body.style.overflow = ''; this.photos.forEach((p) => URL.revokeObjectURL(p.url)); },
    methods: {
        occasionLabel,
        async addPhotos(e) {
            const picked = Array.from(e.target.files || []).slice(0, 4 - this.photos.length);
            e.target.value = '';
            this.preparing = true;
            try {
                for (const f of picked) {
                    const small = await resizeImage(f);
                    this.photos.push({ file: small, url: URL.createObjectURL(small) });
                }
            } finally { this.preparing = false; }
        },
        removePhoto(i) { URL.revokeObjectURL(this.photos[i].url); this.photos.splice(i, 1); },
        async post() {
            if (!this.canPost) return;
            this.sending = true;
            this.error = null;
            const form = new FormData();
            form.append('question', this.question.trim());
            if (this.details.trim()) form.append('details', this.details.trim());
            if (this.occasion) form.append('occasion', this.occasion);
            this.photos.forEach((p) => form.append('images[]', p.file));
            try {
                const d = await api.post('/api/account/hive/asks', form);
                toast('Your question is up');
                this.$emit('posted', d.ask);
            } catch (e) {
                this.error = (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0]) || e.payload?.error || "That didn't post. Check your connection and try again.";
            } finally { this.sending = false; }
        },
    },
};
</script>

<template>
    <div class="fixed inset-0 z-[90] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Ask the Hive">
        <div class="absolute inset-0 bg-black/50" @click="$emit('close')"></div>
        <div class="relative bg-white w-full sm:max-w-lg max-h-[92dvh] flex flex-col shadow-2xl">
            <header class="flex items-center justify-between px-5 py-3.5 border-b border-black/8 flex-shrink-0">
                <h2 class="font-display text-lg tracking-widest uppercase">Ask the Hive</h2>
                <button @click="$emit('close')" class="w-11 h-11 -mr-3 inline-flex items-center justify-center text-black/45 hover:text-black" aria-label="Close"><X class="w-5 h-5" /></button>
            </header>

            <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
                <div>
                    <textarea ref="q" v-model="question" rows="2" maxlength="200" placeholder="What do I wear to my cousin's roora in October?" class="w-full border border-black/12 px-3.5 py-3 text-base font-medium focus:outline-none focus:border-gold resize-none"></textarea>
                    <textarea v-model="details" rows="3" maxlength="600" placeholder="Anything that helps — your budget, colours you love, what you already own…" class="w-full mt-2 border border-black/12 px-3.5 py-3 text-sm focus:outline-none focus:border-gold resize-none"></textarea>
                </div>

                <div>
                    <p class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-2">Photos · optional</p>
                    <div class="grid grid-cols-4 gap-2">
                        <div v-for="(p, i) in photos" :key="p.url" class="relative aspect-[4/5] g overflow-hidden bg-cream-dark">
                            <img :src="p.url" alt="" class="w-full h-full object-cover" />
                            <span class="rounded-full absolute top-1 left-1 w-6 h-6 bg-white/90 text-[11px] font-semibold flex items-center justify-center">{{ 'ABCD'[i] }}</span>
                            <button @click="removePhoto(i)" class="rounded-full absolute top-1 right-1 w-7 h-7 bg-black/60 text-white inline-flex items-center justify-center" aria-label="Remove photo"><X class="w-3.5 h-3.5" /></button>
                        </div>
                        <label v-if="photos.length < 4" class="aspect-[4/5] g border-2 border-dashed border-gold/40 flex items-center justify-center text-gold-dark cursor-pointer hover:bg-cream transition-colors">
                            <LoaderCircle v-if="preparing" class="w-5 h-5 animate-spin" /><ImagePlus v-else class="w-6 h-6" />
                            <input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only" @change="addPhotos" />
                        </label>
                    </div>
                    <p class="mt-2 text-[11px] text-black/45 leading-relaxed">
                        {{ photos.length >= 2 ? 'People will vote between these — A, B' + (photos.length > 2 ? ', C…' : '') + '.' : "Can't decide between outfits? Add two or more photos and people can vote." }}
                    </p>
                </div>

                <div>
                    <p class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-2">Occasion</p>
                    <div class="flex flex-wrap gap-1.5">
                        <button v-for="o in occasions" :key="o" @click="occasion = occasion === o ? '' : o" :class="['px-3 py-1.5 text-xs transition-colors', occasion === o ? 'bg-gold text-white' : 'bg-black/5 text-black/65 hover:bg-black/10']">{{ occasionLabel(o) }}</button>
                    </div>
                </div>

                <p v-if="reward" class="text-xs text-black/55 bg-cream px-3.5 py-3 leading-relaxed">When an answer helps, accept it — that person earns {{ reward }} Bees from BLESSLUXE. It costs you nothing.</p>
                <p v-if="error" class="text-sm text-red-600 bg-red-50 px-3.5 py-2.5" role="alert">{{ error }}</p>
            </div>

            <footer class="px-5 py-3.5 border-t border-black/8 flex-shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                <button @click="post" :disabled="!canPost" class="w-full bg-gold text-white py-3.5 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2">
                    <LoaderCircle v-if="sending" class="w-4 h-4 animate-spin" /> {{ sending ? 'Posting…' : 'Ask' }}
                </button>
            </footer>
        </div>
    </div>
</template>
