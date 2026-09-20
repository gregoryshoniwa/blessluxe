<script>
import { Maximize2, Minimize2, ArrowLeft } from 'lucide-vue-next';

/**
 * The frame a messenger lives in — list on the left, conversation on the right,
 * and a real full-screen mode.
 *
 * Exists because both inboxes previously sat in a fixed-height box inside a
 * scrolling page, which is the one layout a chat must never have: the page
 * scrolls, the thread scrolls, and neither ends where you expect. Here the
 * shell owns the height and the panes scroll independently, so the conversation
 * always ends at the composer.
 *
 * Responsive rule, same as every phone messenger: below `md` the list and the
 * conversation are the SAME space, and `hasSelection` decides which one you are
 * looking at. Above `md` they sit side by side and the back arrow disappears.
 *
 * ONE tree in both modes. Full screen is the same elements teleported to
 * <body> with different classes — every slot is rendered exactly once and is
 * never remounted by the toggle. That matters: the actions slot holds the call
 * panel, and remounting it would hang up a call in progress.
 */
export default {
    name: 'ChatShell',
    components: { Maximize2, Minimize2, ArrowLeft },
    props: {
        // v-model:fullscreen
        fullscreen:   { type: Boolean, default: false },
        // Heads the conversation list (only shown when there is one).
        title:        { type: String, default: 'Messages' },
        // Whether a conversation is open — drives the mobile list/thread swap.
        hasSelection: { type: Boolean, default: true },
        // Omit the sidebar slot for a single-thread view (the affiliate side).
        hasSidebar:   { type: Boolean, default: false },
        // Height when NOT full screen.
        height:       { type: String, default: '600px' },
        // The two SPAs have different chrome: the storefront is cream + gold,
        // the admin is zinc + white. Same layout, different skin.
        tone:         { type: String, default: 'store' },  // 'store' | 'admin'
    },
    emits: ['update:fullscreen', 'back'],
    data() {
        return {
            scrollLocked: false,
            // The part of the screen that is actually visible — i.e. minus the
            // on-screen keyboard. null until measured / when unsupported.
            viewport: null,
        };
    },
    computed: {
        admin() { return this.tone === 'admin'; },
        skin() {
            return this.admin
                ? { page: 'bg-zinc-50', frame: 'border border-zinc-200 bg-white', bar: 'border-zinc-200 bg-white', side: 'border-zinc-200 bg-white', ground: 'bg-zinc-50' }
                : { page: 'bg-cream', frame: 'border border-gold/15 bg-cream', bar: 'border-gold/20 bg-white/80', side: 'border-gold/15 bg-white/60', ground: 'bg-cream-dark/30' };
        },
    },
    watch: {
        fullscreen: {
            immediate: true,
            handler(on) {
                // A full-screen overlay over a scrollable page leaves the page
                // scrolling behind it on touch devices.
                if (on) { this.lockScroll(); this.trackViewport(true); }
                else { this.unlockScroll(); this.trackViewport(false); }
            },
        },
    },
    mounted() {
        window.addEventListener('keydown', this.onKey);
        // Anything floating in the bottom-right corner (the LUXE launcher) lands
        // on this messenger's Send button. Flag the page so CSS can lift it.
        document.body.classList.add('has-messenger');
    },
    beforeUnmount() {
        window.removeEventListener('keydown', this.onKey);
        document.body.classList.remove('has-messenger');
        this.trackViewport(false);
        // Never leave the page unscrollable because a chat unmounted while open.
        this.unlockScroll();
    },
    methods: {
        onKey(e) {
            if (e.key === 'Escape' && this.fullscreen) this.$emit('update:fullscreen', false);
        },
        lockScroll() {
            if (this.scrollLocked) return;
            document.body.style.overflow = 'hidden';
            this.scrollLocked = true;
        },
        unlockScroll() {
            if (!this.scrollLocked) return;
            document.body.style.overflow = '';
            this.scrollLocked = false;
        },
        toggle() { this.$emit('update:fullscreen', !this.fullscreen); },

        /**
         * Keep the full-screen panel exactly as tall as what can be SEEN.
         *
         * `position: fixed; inset: 0` is sized from the layout viewport, which
         * on iOS does not shrink when the keyboard opens — the composer ends up
         * underneath the keyboard, typing blind. `visualViewport` reports the
         * real visible box (and how far Safari has panned it), so the panel is
         * pinned to that instead. This is the one thing a chat on a phone must
         * get right.
         */
        trackViewport(on) {
            const vv = window.visualViewport;
            if (!vv) return;
            vv.removeEventListener('resize', this.syncViewport);
            vv.removeEventListener('scroll', this.syncViewport);
            if (!on) { this.viewport = null; return; }
            vv.addEventListener('resize', this.syncViewport);
            vv.addEventListener('scroll', this.syncViewport);
            this.syncViewport();
        },
        syncViewport() {
            const vv = window.visualViewport;
            this.viewport = { height: Math.round(vv.height), top: Math.round(vv.offsetTop) };
        },
    },
};
</script>

<template>
    <!-- `disabled` is Teleport's own switch: full screen moves this out to
         <body> so no ancestor's overflow or stacking context can clip it;
         inline mode renders it exactly where it sits. Toggling it MOVES the
         nodes — nothing inside is destroyed. -->
    <Teleport to="body" :disabled="!fullscreen">
        <div
            :class="fullscreen
                ? ['fixed inset-0 z-[110] flex', skin.page]
                : ['flex overflow-hidden', skin.frame]"
            :style="fullscreen
                ? {
                    paddingTop: 'env(safe-area-inset-top, 0px)',
                    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                    ...(viewport ? { height: viewport.height + 'px', top: viewport.top + 'px', bottom: 'auto' } : {}),
                }
                : { height }"
        >
            <!-- ─── Conversation list ──────────────────────────────── -->
            <aside
                v-if="hasSidebar"
                :class="[
                    'min-h-0 flex-col border-r flex-shrink-0',
                    skin.side,
                    fullscreen ? 'w-full md:w-80 lg:w-96' : 'w-full md:w-72 lg:w-80',
                    // On a narrow screen the list yields to the open thread.
                    hasSelection ? 'hidden md:flex' : 'flex',
                ]"
            >
                <div :class="['h-14 px-4 flex items-center justify-between gap-2 border-b flex-shrink-0', skin.bar]">
                    <h2 :class="['text-sm truncate', admin ? 'font-semibold text-zinc-800' : 'font-display tracking-[0.25em] uppercase text-gold']">
                        {{ title }}
                    </h2>
                    <!-- On a phone the conversation pane (and its toggle) is
                         hidden while the list shows, so the list carries one. -->
                    <button
                        @click="toggle"
                        class="md:hidden w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-full text-black/45 hover:text-gold hover:bg-gold/10 transition-colors"
                        :title="fullscreen ? 'Exit full screen' : 'Full screen'"
                    >
                        <component :is="fullscreen ? 'Minimize2' : 'Maximize2'" class="w-4 h-4" />
                    </button>
                </div>
                <slot name="sidebar" />
            </aside>

            <!-- ─── Conversation ───────────────────────────────────── -->
            <section
                :class="[
                    'flex-1 min-h-0 min-w-0 flex-col',
                    hasSidebar && !hasSelection ? 'hidden md:flex' : 'flex',
                ]"
            >
                <header :class="['h-14 px-3 sm:px-4 flex items-center justify-between gap-2 border-b flex-shrink-0', skin.bar]">
                    <div class="flex items-center gap-2 min-w-0">
                        <button
                            v-if="hasSidebar && hasSelection"
                            @click="$emit('back')"
                            class="md:hidden w-11 h-11 -ml-2 inline-flex items-center justify-center text-black/50 hover:text-gold flex-shrink-0"
                            aria-label="Back to conversations"
                        >
                            <ArrowLeft class="w-4 h-4" />
                        </button>
                        <slot name="thread-header" />
                    </div>

                    <div class="flex items-center gap-1 flex-shrink-0">
                        <slot name="actions" />
                        <button
                            @click="toggle"
                            class="w-10 h-10 sm:w-8 sm:h-8 inline-flex items-center justify-center rounded-full text-black/45 hover:text-gold hover:bg-gold/10 transition-colors"
                            :title="fullscreen ? 'Exit full screen (Esc)' : 'Full screen'"
                        >
                            <component :is="fullscreen ? 'Minimize2' : 'Maximize2'" class="w-4 h-4" />
                        </button>
                    </div>
                </header>

                <!-- The conversation needs a ground of its own: white bubbles
                     on a white pane have no edge to read against. -->
                <div :class="['flex-1 min-h-0', skin.ground]">
                    <slot />
                </div>
            </section>
        </div>
    </Teleport>
</template>
