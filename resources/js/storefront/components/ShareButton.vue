<script>
import { toast } from '../../lib/dialog.js';
import { Link2, Check } from 'lucide-vue-next';

/**
 * Copies a link to the clipboard, and says so. Deliberately NOT the phone's
 * share sheet: that puts a list of apps between someone and the one thing they
 * wanted, which is the link itself to paste wherever they were already typing.
 */
export default {
    name: 'ShareButton',
    components: { Link2, Check },
    props: {
        // A path on this site; the full address is built here so callers never
        // have to know the host.
        path: { type: String, required: true },
        label: { type: String, default: 'Copy link' },
    },
    data() {
        return { copied: false };
    },
    computed: {
        url() { return new URL(this.path, window.location.origin).href; },
    },
    methods: {
        async copy() {
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(this.url);
                } else {
                    // No clipboard API without https (or on an old browser).
                    const el = document.createElement('textarea');
                    el.value = this.url;
                    el.setAttribute('readonly', '');
                    el.style.position = 'fixed';
                    el.style.opacity = '0';
                    document.body.appendChild(el);
                    el.select();
                    document.execCommand('copy');
                    document.body.removeChild(el);
                }
                this.copied = true;
                toast('Link copied — paste it to a friend', { tone: 'success' });
                setTimeout(() => { this.copied = false; }, 2000);
            } catch {
                toast('Could not copy that link.', { tone: 'error' });
            }
        },
    },
};
</script>

<template>
    <button
        @click.prevent.stop="copy"
        class="inline-flex items-center justify-center gap-2 min-h-11 border border-black/20 px-5 py-3 text-[10px] font-semibold tracking-[0.2em] uppercase hover:border-black/50 transition-colors"
        :title="url"
    >
        <Check v-if="copied" class="w-3.5 h-3.5 text-emerald-600" />
        <Link2 v-else class="w-3.5 h-3.5" />
        {{ copied ? 'Copied' : label }}
    </button>
</template>
