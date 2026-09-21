<script>
import { authStore } from '../../auth-store.js';
import { hiveStore } from '../../hive-store.js';
import LookComposer from './LookComposer.vue';
import HiveGate from './HiveGate.vue';
import { House, Compass, MessageCircleQuestion, Bell, UserRound, Plus, ShoppingBag, LogIn, Radio, Camera, X } from 'lucide-vue-next';

/**
 * The Hive's own frame. Inside /hive and /@handle the shop's announcement bar,
 * header, mega-menu, footer and LUXE launcher are gone — this is an app, and
 * the whole screen belongs to it:
 *
 *   phone    the name (scrolls away) · content · bottom tab bar (thumb reach)
 *   desktop  left rail · content
 *
 * The shop is one tap away (the bag), never in the way. The composer and the
 * 18+ gate live here so there is exactly one of each however you got in.
 */
export default {
    name: 'HiveShell',
    components: { LookComposer, HiveGate, House, Compass, MessageCircleQuestion, Bell, UserRound, Plus, ShoppingBag, LogIn, Radio, Camera, X },
    data() {
        return { auth: authStore.state, hive: hiveStore.state, timer: null, choosing: false };
    },
    computed: {
        me() { return this.hive.me; },
        myPath() { return this.me ? `/@${this.me.handle}` : { path: '/account/login', query: { next: '/hive' } }; },
        items() {
            return [
                { key: 'home',     to: '/hive',          label: 'Home',     icon: 'House' },
                { key: 'discover', to: '/hive/discover', label: 'Discover', icon: 'Compass' },
                { key: 'ask',      to: '/hive/ask',      label: 'Ask',      icon: 'MessageCircleQuestion' },
                { key: 'live',     to: '/hive/live',     label: 'Live',     icon: 'Radio' },
                { key: 'activity', to: '/hive/activity', label: 'Activity', icon: 'Bell', badge: this.hive.unread },
                { key: 'me',       to: this.myPath,      label: this.me ? 'My page' : 'Sign in', icon: this.me ? 'UserRound' : 'LogIn' },
            ];
        },
        // Phone tab bar has five places and "+" takes the middle one, so Discover
        // lives as the search button on Home instead of a tab.
        tabs() { return this.items.filter((i) => !['discover', 'live'].includes(i.key)); },
        active() {
            const p = this.$route.path;
            if (p === '/hive') return 'home';
            if (p.startsWith('/hive/discover')) return 'discover';
            if (p.startsWith('/hive/ask')) return 'ask';
            if (p.startsWith('/hive/live')) return 'live';
            if (p.startsWith('/hive/activity')) return 'activity';
            if (this.me && p.toLowerCase() === `/@${this.me.handle}`) return 'me';
            return null;
        },
    },
    watch: {
        '$route.path'() { hiveStore.refreshUnread(); },
        'auth.signedIn'(v) { v ? this.boot() : hiveStore.reset(); },
    },
    mounted() {
        document.body.classList.add('in-hive');
        this.boot();
        this.timer = setInterval(() => { if (!document.hidden) hiveStore.refreshUnread(); }, 60000);
        document.addEventListener('visibilitychange', this.onVisible);
    },
    beforeUnmount() {
        document.body.classList.remove('in-hive');
        clearInterval(this.timer);
        document.removeEventListener('visibilitychange', this.onVisible);
    },
    methods: {
        async boot() {
            if (await hiveStore.load()) hiveStore.refreshUnread();
        },
        onVisible() { if (!document.hidden) hiveStore.refreshUnread(); },
        compose() { this.choosing = false; hiveStore.compose(this.$router, this.$route); },
        go(path) { this.choosing = false; this.$router.push(path); },
        onPosted(look) { hiveStore.posted(look); },
    },
};
</script>

<template>
    <div class="min-h-dvh bg-cream text-black">
        <!-- ─── Desktop: left rail ─────────────────────────────────── -->
        <aside class="hidden lg:flex fixed inset-y-0 left-0 w-60 xl:w-64 flex-col border-r border-black/8 bg-white px-4 py-6 z-40">
            <router-link to="/hive" class="flex items-center gap-2.5 px-3 mb-8" aria-label="Bless Hive home">
                <img src="/hive-mark.png" alt="BLESSLUXE" class="h-11 w-auto" width="50" height="44" />
                <span class="font-display text-[1.7rem] leading-none font-medium tracking-[0.28em] uppercase">Hive</span>
            </router-link>

            <nav class="space-y-1">
                <router-link
                    v-for="i in items"
                    :key="i.key"
                    :to="i.to"
                    :class="['flex items-center gap-4 px-3 py-3 text-[15px] transition-colors', active === i.key ? 'bg-cream font-semibold text-black' : 'text-black/70 hover:bg-cream/70 hover:text-black']"
                    :aria-current="active === i.key ? 'page' : null"
                >
                    <span class="relative">
                        <component :is="i.icon" class="w-6 h-6" :stroke-width="active === i.key ? 2.2 : 1.6" />
                        <span v-if="i.badge" class="rounded-full absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">{{ i.badge > 99 ? '99+' : i.badge }}</span>
                    </span>
                    {{ i.label }}
                </router-link>
            </nav>

            <button @click="compose" class="mt-6 w-full bg-gold text-white py-3.5 text-xs font-semibold tracking-[0.2em] uppercase hover:bg-gold-dark transition-colors inline-flex items-center justify-center gap-2">
                <Plus class="w-4 h-4" /> Share a look
            </button>

            <div class="mt-auto space-y-1">
                <router-link v-if="me" :to="`/@${me.handle}`" class="flex items-center gap-3 px-3 py-2.5 hover:bg-cream/70">
                    <span class="rounded-full w-9 h-9 overflow-hidden bg-cream-dark border border-gold/25 flex items-center justify-center flex-shrink-0">
                        <img v-if="me.avatar_url" :src="me.avatar_url" alt="" class="w-full h-full object-cover" />
                        <UserRound v-else class="w-4 h-4 text-black/30" />
                    </span>
                    <span class="min-w-0">
                        <span class="block text-sm font-medium truncate">{{ me.display_name }}</span>
                        <span class="block text-xs text-black/45 truncate">@{{ me.handle }}</span>
                    </span>
                </router-link>
                <router-link to="/shop" class="flex items-center gap-4 px-3 py-3 text-sm text-black/60 hover:bg-cream/70 hover:text-black">
                    <ShoppingBag class="w-5 h-5" /> Back to the shop
                </router-link>
            </div>
        </aside>

        <!-- ─── Phone: just the name, and it scrolls away — the screen is for the feed.
             Activity is a bottom tab; the way back to the shop is on My page. -->
        <header class="lg:hidden bg-white border-b border-black/8 h-12 px-4 flex items-center pt-[env(safe-area-inset-top)] box-content">
            <router-link to="/hive" class="flex items-center gap-2" aria-label="Bless Hive home">
                <img src="/hive-mark.png" alt="BLESSLUXE" class="h-8 w-auto" width="36" height="32" />
                <span class="font-display text-[1.35rem] leading-none font-medium tracking-[0.28em] uppercase">Hive</span>
            </router-link>
        </header>

        <!-- ─── Content ────────────────────────────────────────────── -->
        <main class="lg:pl-60 xl:pl-64 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0 min-w-0">
            <slot />
        </main>

        <!-- ─── Phone: bottom tabs, "+" in the middle ──────────────── -->
        <nav class="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-black/10 pb-[env(safe-area-inset-bottom)]" aria-label="Hive">
            <div class="grid grid-cols-5 h-14 max-w-md mx-auto">
                <template v-for="(t, n) in tabs" :key="t.key">
                    <button v-if="n === 2" @click="choosing = true" class="flex items-center justify-center" aria-label="Create">
                        <span class="rounded-full w-11 h-11 bg-gold text-white flex items-center justify-center shadow-md"><Plus class="w-6 h-6" /></span>
                    </button>
                    <router-link :to="t.to" class="flex flex-col items-center justify-center gap-0.5" :aria-current="active === t.key ? 'page' : null" :aria-label="t.label">
                        <span class="relative">
                            <component :is="t.icon" :class="['w-6 h-6', active === t.key ? 'text-black' : 'text-black/45']" :stroke-width="active === t.key ? 2.2 : 1.6" />
                            <span v-if="t.badge" class="rounded-full absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">{{ t.badge > 99 ? '99+' : t.badge }}</span>
                        </span>
                        <span :class="['text-[9px] tracking-wide', active === t.key ? 'text-black font-semibold' : 'text-black/45']">{{ t.label }}</span>
                    </router-link>
                </template>
            </div>
        </nav>

        <!-- Phone "+": what do you want to make? -->
        <div v-if="choosing" class="lg:hidden fixed inset-0 z-[85] flex items-end" role="dialog" aria-modal="true" aria-label="Create">
            <div class="absolute inset-0 bg-black/50" @click="choosing = false"></div>
            <div class="relative bg-white w-full p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button v-for="c in [
                    { l: 'Share a look', h: 'Photos, a short video, or a link', i: 'Camera', f: compose },
                    { l: 'Ask the Hive', h: 'What should I wear? Which one?', i: 'MessageCircleQuestion', f: () => go('/hive/ask?ask=1') },
                    { l: 'Schedule a live', h: 'Go live by link and receive gifts', i: 'Radio', f: () => go('/hive/live?schedule=1') },
                ]" :key="c.l" @click="c.f()" class="w-full flex items-center gap-4 px-3 py-3.5 hover:bg-cream text-left">
                    <span class="rounded-full w-11 h-11 bg-cream flex items-center justify-center flex-shrink-0"><component :is="c.i" class="w-5 h-5 text-gold-dark" /></span>
                    <span><span class="block text-sm font-medium">{{ c.l }}</span><span class="block text-xs text-black/50">{{ c.h }}</span></span>
                </button>
            </div>
        </div>

        <LookComposer v-if="hive.composerOpen" @close="hive.composerOpen = false" @posted="onPosted" />
        <HiveGate />
    </div>
</template>
