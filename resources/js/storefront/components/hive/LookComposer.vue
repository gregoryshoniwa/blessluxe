<script>
import { api } from '../../../lib/api.js';
import { toast } from '../../../lib/dialog.js';
import { resizeImage } from '../../../lib/image-resize.js';
import { prepareClip, megabytes } from '../../../lib/video-compress.js';
import { hiveStore, occasionLabel } from '../../hive-store.js';
import MentionPicker from '../../../components/MentionPicker.vue';
import { X, ImagePlus, Tag, LoaderCircle, Package, ImageOff, Star, Trophy, ShoppingBag, Video, Play } from 'lucide-vue-next';

const MAX_IMAGES = 4;
const MAX_REFS = 6;

/**
 * Post a look: photos first, then what you're wearing.
 *
 * Photos are shrunk in the browser before upload (see lib/image-resize.js), so
 * posting costs kilobytes rather than megabytes of someone's data bundle. The
 * product tags carry only {type, id} — the server writes the title and price.
 */
export default {
    name: 'LookComposer',
    components: { MentionPicker, X, ImagePlus, Tag, LoaderCircle, Package, ImageOff, Star, Trophy, ShoppingBag, Video, Play },
    emits: ['close', 'posted'],
    data() {
        return {
            hive: hiveStore.state,
            photos: [],          // { file, url }
            caption: '',
            occasion: '',
            refs: [],
            picking: false,
            preparing: false,
            sending: false,
            error: null,
            MAX_IMAGES,
            // A short clip instead of photos. Shrunk on this phone before upload.
            clip: null,          // { video, poster, posterUrl, seconds, compressed }
            clipProgress: null,  // 0..1 while shrinking
            // Try-on: a look about something they bought. Pays Bees once per purchase.
            lines: [],
            reward: 0,
            line: null,
            fit: '',
            sizeWorn: '',
            rating: 0,
            fitChoices: [{ key: 'small', label: 'Runs small' }, { key: 'true', label: 'True to size' }, { key: 'large', label: 'Runs large' }],
            // Challenges open right now; one may be pre-chosen by the page that opened us.
            challenges: [],
            challengeId: hiveStore.state.composerPreset?.challengeId || null,
        };
    },
    computed: {
        chosenKeys() { return this.refs.map((r) => `${r.type}:${r.id}`); },
        canPost() { return (this.photos.length > 0 || this.clip) && !this.sending && !this.preparing && this.clipProgress === null && (!this.line || this.fit); },
        videoRules() { return this.hive.options.video || { max_seconds: 30, max_bytes: 12 * 1024 * 1024 }; },
        clipLabel() { return this.clip ? `${Math.round(this.clip.seconds)}s · ${megabytes(this.clip.video.size)}` : ''; },
        occasions() { return this.hive.options.occasions.map((k) => ({ key: k, label: occasionLabel(k) })); },
    },
    mounted() {
        api.get('/api/account/hive/tryons/eligible').then((d) => { this.lines = d.lines; this.reward = d.reward; }).catch(() => {});
        api.get('/api/store/hive/challenges').then((d) => { this.challenges = d.challenges; }).catch(() => {});
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', this.onKey);
    },
    beforeUnmount() {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', this.onKey);
        this.photos.forEach((p) => URL.revokeObjectURL(p.url));
        if (this.clip) URL.revokeObjectURL(this.clip.posterUrl);
    },
    methods: {
        occasionLabel,
        onKey(e) { if (e.key === 'Escape' && !this.picking) this.$emit('close'); },

        async addPhotos(e) {
            const picked = Array.from(e.target.files || []).slice(0, MAX_IMAGES - this.photos.length);
            e.target.value = '';
            if (!picked.length) return;

            this.preparing = true;
            this.error = null;
            try {
                for (const f of picked) {
                    const small = await resizeImage(f);
                    this.photos.push({ file: small, url: URL.createObjectURL(small) });
                }
            } finally {
                this.preparing = false;
            }
        },
        removePhoto(i) {
            URL.revokeObjectURL(this.photos[i].url);
            this.photos.splice(i, 1);
        },

        async addClip(e) {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            this.error = null;
            this.clipProgress = 0;
            try {
                const out = await prepareClip(file, {
                    maxSeconds: this.videoRules.max_seconds, maxBytes: this.videoRules.max_bytes,
                    onProgress: (p) => { this.clipProgress = p; },
                });
                this.clip = { ...out, posterUrl: URL.createObjectURL(out.poster) };
            } catch (err) {
                this.error = err.message || "That video didn't work. Try another clip.";
            } finally {
                this.clipProgress = null;
            }
        },
        removeClip() {
            URL.revokeObjectURL(this.clip.posterUrl);
            this.clip = null;
        },

        pick(item) {
            if (this.refs.length < MAX_REFS) this.refs.push(item);
            if (this.refs.length >= MAX_REFS) this.picking = false;
        },
        removeRef(i) { this.refs.splice(i, 1); },
        pickLine(l) {
            this.line = this.line?.line_item_id === l.line_item_id ? null : l;
            if (this.line && !this.sizeWorn) this.sizeWorn = l.variant || '';
        },

        async post() {
            if (!this.canPost) return;
            this.sending = true;
            this.error = null;

            const form = new FormData();
            if (this.clip) {
                form.append('images[]', this.clip.poster);
                form.append('video', this.clip.video);
                form.append('video_seconds', String(this.clip.seconds));
            } else {
                this.photos.forEach((p) => form.append('images[]', p.file));
            }
            if (this.caption.trim()) form.append('caption', this.caption.trim());
            if (this.occasion) form.append('occasion', this.occasion);
            if (this.challengeId) form.append('challenge_id', this.challengeId);
            if (this.line) {
                form.append('line_item_id', this.line.line_item_id);
                form.append('fit', this.fit);
                if (this.sizeWorn.trim()) form.append('size_worn', this.sizeWorn.trim());
                if (this.rating) form.append('rating', String(this.rating));
            }
            if (this.refs.length) form.append('refs', JSON.stringify(this.refs.map((r) => ({ type: r.type, id: r.id }))));

            try {
                const d = await api.post('/api/account/hive/looks', form);
                toast(d.earned ? `Your try-on is up — you earned ${d.earned} Bees` : 'Your look is up');
                this.$emit('posted', d.look);
            } catch (e) {
                const first = e.payload?.errors && Object.values(e.payload.errors)[0]?.[0];
                this.error = first || e.payload?.error || "That didn't post. Check your connection and try again.";
            } finally {
                this.sending = false;
            }
        },
    },
};
</script>

<template>
    <div class="fixed inset-0 z-[90] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Share a look">
        <div class="absolute inset-0 bg-black/50" @click="$emit('close')"></div>

        <div class="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col shadow-2xl">
            <header class="flex items-center justify-between px-5 py-3.5 border-b border-black/8 flex-shrink-0">
                <h2 class="font-display text-lg tracking-widest uppercase">Share a look</h2>
                <button @click="$emit('close')" class="w-11 h-11 -mr-3 inline-flex items-center justify-center text-black/45 hover:text-black" aria-label="Close">
                    <X class="w-5 h-5" />
                </button>
            </header>

            <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
                <!-- Photos, or one short clip -->
                <div>
                    <!-- A clip: its cover, how long, and what it will cost a viewer to play. -->
                    <div v-if="clip" class="relative w-40 mx-auto aspect-[4/5] rounded-xl overflow-hidden bg-black">
                        <img :src="clip.posterUrl" alt="" class="w-full h-full object-cover opacity-90" />
                        <span class="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/55 text-white flex items-center justify-center"><Play class="w-5 h-5 fill-white" /></span>
                        <span class="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/70 text-white text-[10px]">{{ clipLabel }}</span>
                        <button @click="removeClip" class="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white inline-flex items-center justify-center" aria-label="Remove video"><X class="w-3.5 h-3.5" /></button>
                    </div>

                    <div v-else-if="clipProgress !== null" class="rounded-xl border border-gold/40 bg-cream/60 p-4 text-center">
                        <p class="text-sm font-medium">Shrinking your video… {{ Math.round(clipProgress * 100) }}%</p>
                        <div class="h-1.5 rounded-full bg-black/10 overflow-hidden mt-2.5"><div class="h-full bg-gold rounded-full transition-all" :style="{ width: (clipProgress * 100) + '%' }"></div></div>
                        <p class="text-[11px] text-black/50 mt-2">This takes about as long as the clip. Keep this screen open.</p>
                    </div>

                    <template v-else>
                        <div class="grid grid-cols-4 gap-2">
                            <div v-for="(p, i) in photos" :key="p.url" class="relative aspect-[4/5] rounded-lg overflow-hidden bg-cream-dark">
                                <img :src="p.url" alt="" class="w-full h-full object-cover" />
                                <button @click="removePhoto(i)" class="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white inline-flex items-center justify-center" aria-label="Remove photo">
                                    <X class="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <label
                                v-if="photos.length < MAX_IMAGES"
                                :class="[
                                    'rounded-lg border-2 border-dashed border-gold/40 flex flex-col items-center justify-center gap-1.5 text-gold-dark cursor-pointer hover:bg-cream transition-colors',
                                    photos.length === 0 ? 'col-span-2 aspect-[4/3]' : 'aspect-[4/5]',
                                ]"
                            >
                                <LoaderCircle v-if="preparing" class="w-5 h-5 animate-spin" />
                                <ImagePlus v-else class="w-6 h-6" />
                                <span v-if="photos.length === 0" class="text-xs tracking-wide">{{ preparing ? 'Preparing…' : 'Photos' }}</span>
                                <input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only" @change="addPhotos" />
                            </label>
                            <label v-if="photos.length === 0" class="col-span-2 aspect-[4/3] rounded-lg border-2 border-dashed border-gold/40 flex flex-col items-center justify-center gap-1.5 text-gold-dark cursor-pointer hover:bg-cream transition-colors">
                                <Video class="w-6 h-6" />
                                <span class="text-xs tracking-wide">Video · up to {{ videoRules.max_seconds }}s</span>
                                <input type="file" accept="video/mp4,video/quicktime,video/webm" class="sr-only" @change="addClip" />
                            </label>
                        </div>
                    </template>
                    <p class="mt-2 text-[11px] text-black/45 leading-relaxed">
                        {{ clip ? 'Nobody downloads your video until they tap play, and they see its size first.' : 'Full-length photos work best. Photos and videos are shrunk on your phone first, so posting uses very little data.' }}
                    </p>
                </div>

                <!-- Try-on -->
                <div v-if="lines.length" class="rounded-2xl border border-gold/40 bg-cream/60 p-3.5">
                    <p class="flex items-center gap-2 text-sm font-medium"><ShoppingBag class="w-4 h-4 text-gold-dark" /> Wearing something you bought?</p>
                    <p class="text-xs text-black/55 mt-0.5 mb-3">Show how it really fits. Each piece earns you {{ reward }} Bees, and helps the next person pick a size.</p>
                    <div class="scroll-strip scroll-px-1 flex gap-2 overflow-x-auto [scrollbar-width:none]">
                        <button
                            v-for="l in lines"
                            :key="l.line_item_id"
                            type="button"
                            @click="pickLine(l)"
                            :class="['flex items-center gap-2.5 p-1.5 pr-3 rounded-xl border bg-white flex-shrink-0 w-[12.5rem] text-left transition-colors', line?.line_item_id === l.line_item_id ? 'border-gold ring-1 ring-gold' : 'border-black/10']"
                        >
                            <span class="w-10 h-12 rounded-md overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0">
                                <img v-if="l.thumbnail" :src="l.thumbnail" alt="" class="w-full h-full object-cover" />
                                <ImageOff v-else class="w-4 h-4 text-black/25" />
                            </span>
                            <span class="min-w-0">
                                <span class="block text-xs truncate">{{ l.title }}</span>
                                <span class="block text-[11px] text-black/45 truncate">{{ l.variant || l.order_number }}<template v-if="l.earns"> · +{{ l.earns }} Bees</template></span>
                            </span>
                        </button>
                    </div>

                    <div v-if="line" class="mt-3.5 space-y-3">
                        <div>
                            <p class="text-xs text-black/60 mb-1.5">How does it fit?</p>
                            <div class="grid grid-cols-3 gap-1.5">
                                <button v-for="f in fitChoices" :key="f.key" type="button" @click="fit = f.key" :class="['py-2.5 rounded-xl text-xs transition-colors', fit === f.key ? 'bg-gold text-white' : 'bg-white border border-black/10 text-black/70']">{{ f.label }}</button>
                            </div>
                        </div>
                        <div class="flex items-end gap-3">
                            <label class="flex-1 min-w-0">
                                <span class="block text-xs text-black/60 mb-1">Size you took</span>
                                <input v-model="sizeWorn" maxlength="24" placeholder="e.g. 14 / L" class="w-full border border-black/12 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-gold" />
                            </label>
                            <div class="flex-shrink-0">
                                <span class="block text-xs text-black/60 mb-1">Rating</span>
                                <div class="flex">
                                    <button v-for="n in 5" :key="n" type="button" @click="rating = rating === n ? 0 : n" class="w-9 h-10 inline-flex items-center justify-center" :aria-label="`${n} stars`">
                                        <Star :class="['w-5 h-5', n <= rating ? 'text-gold fill-gold' : 'text-black/20']" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Caption -->
                <div>
                    <textarea
                        v-model="caption"
                        rows="3"
                        maxlength="500"
                        placeholder="Where did you wear it? How does it fit — true to size?"
                        class="w-full border border-black/12 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-gold resize-none"
                    ></textarea>
                    <p class="text-right text-[10px] text-black/35">{{ caption.length }}/500</p>
                </div>

                <!-- Occasion -->
                <div>
                    <p class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-2">Occasion</p>
                    <div class="flex flex-wrap gap-1.5">
                        <button
                            v-for="o in occasions"
                            :key="o.key"
                            @click="occasion = occasion === o.key ? '' : o.key"
                            :class="['px-3 py-1.5 rounded-full text-xs transition-colors', occasion === o.key ? 'bg-gold text-white' : 'bg-black/5 text-black/65 hover:bg-black/10']"
                        >
                            {{ o.label }}
                        </button>
                    </div>
                </div>

                <!-- Challenges -->
                <div v-if="challenges.length">
                    <p class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-2">Enter a challenge</p>
                    <div class="flex flex-wrap gap-1.5">
                        <button
                            v-for="c in challenges"
                            :key="c.id"
                            type="button"
                            @click="challengeId = challengeId === c.id ? null : c.id"
                            :class="['inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs transition-colors', challengeId === c.id ? 'bg-black text-white' : 'bg-black/5 text-black/70 hover:bg-black/10']"
                        >
                            <Trophy class="w-3.5 h-3.5" /> {{ c.tag }}<template v-if="c.prize_bees"> · {{ c.prize_bees }} Bees</template>
                        </button>
                    </div>
                </div>

                <!-- What I'm wearing -->
                <div>
                    <p class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-2">What you're wearing</p>
                    <div v-if="refs.length" class="space-y-1.5 mb-2">
                        <div v-for="(r, i) in refs" :key="`${r.type}:${r.id}`" class="flex items-center gap-3 p-1.5 pr-1 rounded-xl border border-black/8">
                            <span class="w-9 h-11 rounded-md overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0">
                                <img v-if="r.thumbnail" :src="r.thumbnail" alt="" class="w-full h-full object-cover" />
                                <component v-else :is="r.type === 'pack' ? 'Package' : 'ImageOff'" class="w-4 h-4 text-black/25" />
                            </span>
                            <span class="min-w-0 flex-1">
                                <span class="block text-xs truncate">{{ r.title }}</span>
                                <span class="block text-[11px] text-black/45">{{ r.price_label }}</span>
                            </span>
                            <button @click="removeRef(i)" class="w-10 h-10 inline-flex items-center justify-center text-black/35 hover:text-black" aria-label="Remove">
                                <X class="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <button v-if="!picking && refs.length < 6" @click="picking = true" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-gold/50 text-gold-dark text-xs tracking-wide hover:bg-cream transition-colors">
                        <Tag class="w-3.5 h-3.5" /> Tag a BLESSLUXE piece
                    </button>
                    <MentionPicker
                        v-if="picking"
                        endpoint="/api/account/hive/mentions"
                        :chosen="chosenKeys"
                        @pick="pick"
                        @close="picking = false"
                    />
                </div>

                <p v-if="error" class="text-sm text-red-600 bg-red-50 rounded-xl px-3.5 py-2.5" role="alert">{{ error }}</p>
            </div>

            <footer class="px-5 py-3.5 border-t border-black/8 flex-shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                <button
                    @click="post"
                    :disabled="!canPost"
                    class="w-full bg-gold text-white py-3.5 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                    <LoaderCircle v-if="sending" class="w-4 h-4 animate-spin" />
                    {{ sending ? 'Posting…' : 'Post look' }}
                </button>
            </footer>
        </div>
    </div>
</template>
