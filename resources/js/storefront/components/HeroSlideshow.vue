<script>
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';

/**
 * The home page hero — one slide or several, image / video / YouTube.
 *
 * Used twice on purpose: by the Home page, and by the affiliate's design editor
 * as its live preview. Being the SAME component is the point — what an
 * affiliate sees while designing is exactly what their shoppers will get, crop
 * and all, instead of an approximation that drifts.
 *
 * Behaviour people expect of a slideshow, and that accessibility asks for:
 *   - advances on its own, but pauses while hovered, focused, or in a hidden tab
 *   - does NOT auto-advance for anyone who asked their device for less motion
 *   - swipe on touch, arrows + dots otherwise, arrow keys when focused
 */
export default {
    name: 'HeroSlideshow',
    components: { ChevronLeft, ChevronRight },
    props: {
        slides:   { type: Array, default: () => [] },
        // Copy used for any field a slide leaves blank (and when there are none).
        fallback: { type: Object, required: true },
        // Editor preview: shorter, never auto-advances, links don't navigate.
        preview:  { type: Boolean, default: false },
        // Force a phone-shaped crop in the editor, to show what gets cut off.
        phone:    { type: Boolean, default: false },
        interval: { type: Number, default: 7000 },
    },
    data() {
        return { index: 0, paused: false, timer: null, touchX: null, videoReady: false };
    },
    computed: {
        list() {
            const f = this.fallback;
            const src = this.slides.length ? this.slides : [{}];
            return src.map((s) => ({
                key:       s.id || 'default',
                heading:    s.heading    || f.heading,
                subheading: s.subheading || f.subheading,
                ctaLabel:   s.cta_label  || f.ctaLabel,
                ctaHref:    s.cta_href   || f.ctaHref,
                type:       s.media_type || 'image',
                src:        s.media_url  || null,
                youtubeId:  s.youtube_id || null,
                poster:     s.poster_url || null,
                focus:      { left: 'object-left', right: 'object-right' }[s.focus] || 'object-center',
                hasMedia:   Boolean(s.media_url || s.youtube_id),
            }));
        },
        many() { return this.list.length > 1; },
        reducedMotion() { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; },
    },
    watch: {
        // Slides were added/removed in the editor — don't point past the end.
        'list.length'(n) { if (this.index >= n) this.index = 0; this.restart(); },
    },
    mounted() {
        this.restart();
        document.addEventListener('visibilitychange', this.restart);
    },
    beforeUnmount() {
        clearInterval(this.timer);
        document.removeEventListener('visibilitychange', this.restart);
    },
    methods: {
        restart() {
            clearInterval(this.timer);
            if (!this.many || this.preview || this.paused || this.reducedMotion || document.hidden) return;
            this.timer = setInterval(() => this.go(1), this.interval);
        },
        go(step) { this.videoReady = false; this.index = (this.index + step + this.list.length) % this.list.length; },
        jump(i) { this.videoReady = false; this.index = i; this.restart(); },
        pause(on) { this.paused = on; this.restart(); },
        onKey(e) {
            if (!this.many) return;
            if (e.key === 'ArrowLeft')  { this.go(-1); this.restart(); }
            if (e.key === 'ArrowRight') { this.go(1);  this.restart(); }
        },
        onTouchStart(e) { this.touchX = e.changedTouches[0].clientX; },
        onTouchEnd(e) {
            if (this.touchX === null || !this.many) return;
            const dx = e.changedTouches[0].clientX - this.touchX;
            this.touchX = null;
            // A deliberate swipe, not a tap that drifted.
            if (Math.abs(dx) > 45) { this.go(dx < 0 ? 1 : -1); this.restart(); }
        },
        onVideoLoad() { setTimeout(() => { this.videoReady = true; }, 900); },
        embed(id) {
            // Built here from the bare id — never from a URL someone supplied.
            return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&modestbranding=1&rel=0&disablekb=1`;
        },
    },
};
</script>

<template>
    <section
        :class="[
            'hero relative overflow-hidden bg-gradient-to-br from-cream via-blush to-cream-dark',
            preview ? (phone ? 'aspect-[9/16] max-h-[420px] mx-auto' : 'aspect-[16/9]') : 'h-[80vh] min-h-[560px]',
        ]"
        :tabindex="many ? 0 : -1"
        :aria-roledescription="many ? 'carousel' : null"
        aria-label="Featured"
        @mouseenter="pause(true)" @mouseleave="pause(false)"
        @focusin="pause(true)" @focusout="pause(false)"
        @keydown="onKey"
        @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd"
    >
        <div
            v-for="(s, i) in list"
            :key="s.key"
            :class="['absolute inset-0 transition-opacity duration-700', i === index ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none']"
            :aria-hidden="i !== index"
        >
            <!-- Media -->
            <template v-if="s.hasMedia">
                <template v-if="s.type === 'youtube'">
                    <img :src="s.poster" class="absolute inset-0 w-full h-full object-cover" alt="" />
                    <!-- Only the slide on screen runs a player; five at once
                         would mean five videos streaming behind the page. Sized
                         with container units so it COVERS the hero at any shape,
                         the way object-cover does for an image. -->
                    <!-- Invisible until it has loaded, so the still shows through
                         instead of a black box with a spinner. The short delay
                         lets playback actually start before the fade. -->
                    <iframe
                        v-if="i === index"
                        :src="embed(s.youtubeId)"
                        @load="onVideoLoad"
                        :class="['hero-video absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none border-0 transition-opacity duration-700', videoReady ? 'opacity-100' : 'opacity-0']"
                        allow="autoplay; encrypted-media"
                        tabindex="-1"
                        title=""
                        aria-hidden="true"
                    ></iframe>
                </template>
                <video v-else-if="s.type === 'video'" :src="s.src" :class="['absolute inset-0 w-full h-full object-cover', s.focus]" autoplay muted loop playsinline />
                <img v-else :src="s.src" :alt="s.heading" :class="['absolute inset-0 w-full h-full object-cover', s.focus]" />
                <div class="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent"></div>
            </template>

            <!-- Copy -->
            <div :class="['relative h-full flex items-center', preview ? 'px-[6%]' : 'max-w-[1400px] mx-auto px-[5%]']">
                <div :class="[preview ? 'max-w-[75%]' : 'max-w-3xl', s.hasMedia && 'text-white']">
                    <p :class="['font-script mb-2', preview ? 'text-lg' : 'text-4xl md:text-5xl mb-3', s.hasMedia ? 'text-white' : 'text-gold']">Welcome to BlessLuxe</p>
                    <component
                        :is="i === 0 ? 'h1' : 'h2'"
                        :class="['font-display tracking-tight', preview ? 'text-xl sm:text-2xl mb-1.5' : 'text-5xl md:text-7xl mb-4', s.hasMedia ? 'text-white' : 'text-black']"
                    >{{ s.heading }}</component>
                    <p :class="['font-body tracking-wide', preview ? 'text-[10px] mb-3 line-clamp-2' : 'text-base md:text-lg mb-8', s.hasMedia ? 'text-white/85' : 'text-black/70']">
                        {{ s.subheading }}
                    </p>
                    <component
                        :is="preview ? 'span' : 'router-link'"
                        :to="preview ? undefined : s.ctaHref"
                        :tabindex="i === index ? 0 : -1"
                        :class="['inline-block bg-gold text-white font-semibold uppercase hover:bg-gold-dark transition-colors', preview ? 'px-3 py-1.5 text-[8px] tracking-[0.2em]' : 'px-10 py-4 text-xs tracking-[0.3em]']"
                    >{{ s.ctaLabel }}</component>
                </div>
            </div>
        </div>

        <!-- Controls -->
        <template v-if="many">
            <button @click="go(-1); restart()" :class="['absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/25 text-white hover:bg-black/45 backdrop-blur-sm inline-flex items-center justify-center transition-colors', preview ? 'w-7 h-7' : 'w-11 h-11']" aria-label="Previous slide">
                <ChevronLeft :class="preview ? 'w-4 h-4' : 'w-5 h-5'" />
            </button>
            <button @click="go(1); restart()" :class="['absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/25 text-white hover:bg-black/45 backdrop-blur-sm inline-flex items-center justify-center transition-colors', preview ? 'w-7 h-7' : 'w-11 h-11']" aria-label="Next slide">
                <ChevronRight :class="preview ? 'w-4 h-4' : 'w-5 h-5'" />
            </button>
            <div :class="['absolute left-0 right-0 z-20 flex justify-center gap-2', preview ? 'bottom-2' : 'bottom-6']">
                <button
                    v-for="(s, i) in list" :key="s.key"
                    @click="jump(i)"
                    class="p-2 -m-1"
                    :aria-label="`Slide ${i + 1} of ${list.length}`"
                    :aria-current="i === index"
                >
                    <span :class="['block rounded-full transition-all', preview ? 'h-1' : 'h-1.5', i === index ? (preview ? 'w-4 bg-white' : 'w-7 bg-white') : (preview ? 'w-1 bg-white/55' : 'w-1.5 bg-white/55')]"></span>
                </button>
            </div>
        </template>
    </section>
</template>

<style scoped>
/* The hero is the container; the player is sized from IT, so it covers a
   16:9 banner, a tall phone crop and the 80vh page hero alike.

   It is sized to cover and then a further 35% — deliberately. YouTube draws its
   own furniture inside the frame (title and channel along the top, logo and
   "more videos" along the bottom) and none of it can be switched off. Oversizing
   pushes that band outside the hero, where overflow:hidden discards it, so what
   is left is just the moving picture behind the affiliate's own headline. */
.hero { container-type: size; }
.hero-video {
    width:  max(135cqw, 240cqh);
    height: max(135cqh, 75.94cqw);
}
</style>
