<script>
import { toast } from '../../lib/dialog.js';
import { Share2, Check } from 'lucide-vue-next';

/**
 * Hands someone a link to pass on. Uses the phone's own share sheet where
 * there is one — that's how a series actually fills, through WhatsApp — and
 * falls back to copying the address on a desktop that has no sheet.
 */
export default {
    name: 'ShareButton',
    components: { Share2, Check },
    props: {
        title: { type: String, default: 'BLESSLUXE' },
        text: { type: String, default: '' },
        // A path on this site; the full address is built here so callers never
        // have to know the host.
        path: { type: String, required: true },
        label: { type: String, default: 'Share' },
    },
    data() {
        return { copied: false };
    },
    computed: {
        url() { return new URL(this.path, window.location.origin).href; },
    },
    methods: {
        async share() {
            const payload = { title: this.title, text: this.text || undefined, url: this.url };
            try {
                if (navigator.share) {
                    await navigator.share(payload);
                    return;
                }
                await navigator.clipboard.writeText(this.url);
                this.copied = true;
                toast('Link copied — paste it to a friend', { tone: 'success' });
                setTimeout(() => { this.copied = false; }, 2000);
            } catch (e) {
                // Cancelling the share sheet throws AbortError; that isn't a failure.
                if (e?.name !== 'AbortError') toast('Could not share that link.', { tone: 'error' });
            }
        },
    },
};
</script>

<template>
    <button
        @click.prevent.stop="share"
        class="inline-flex items-center justify-center gap-2 min-h-11 border border-black/20 px-5 py-3 text-[10px] font-semibold tracking-[0.2em] uppercase hover:border-black/50 transition-colors"
        :title="`Share this link`"
    >
        <Check v-if="copied" class="w-3.5 h-3.5 text-emerald-600" />
        <Share2 v-else class="w-3.5 h-3.5" />
        {{ copied ? 'Copied' : label }}
    </button>
</template>
