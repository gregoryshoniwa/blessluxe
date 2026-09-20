<script>
import Sidebar from './components/Sidebar.vue';
import NotificationsBell from './components/NotificationsBell.vue';
import { Menu } from 'lucide-vue-next';
import Login from './pages/Login.vue';
import DialogHost from '../components/DialogHost.vue';
import { api } from '../lib/api.js';

export default {
    name: 'AdminApp',
    components: { Sidebar, Login, DialogHost, NotificationsBell, Menu },
    data() {
        return {
            user: null,
            authChecked: false,
            navOpen: false,
            // Decides WHERE the bell is mounted (top bar vs sidebar), so it has
            // to be known in JS — a CSS breakpoint would mount both.
            isDesktop: window.matchMedia('(min-width: 1024px)').matches,
            mq: null,
        };
    },
    watch: {
        // Navigating is the whole reason the drawer was opened; close behind it.
        '$route.fullPath'() { this.navOpen = false; },
        navOpen(open) { document.body.style.overflow = open ? 'hidden' : ''; },
    },
    async mounted() {
        await this.refreshAuth();
        window.addEventListener('blessluxe:admin-signed-in', this.refreshAuth);
        window.addEventListener('blessluxe:admin-signed-out', this.handleSignedOut);
        window.addEventListener('keydown', this.onKey);
        this.mq = window.matchMedia('(min-width: 1024px)');
        this.mq.addEventListener('change', this.onBreakpoint);
    },
    beforeUnmount() {
        window.removeEventListener('keydown', this.onKey);
        this.mq?.removeEventListener('change', this.onBreakpoint);
        document.body.style.overflow = '';
        window.removeEventListener('blessluxe:admin-signed-in', this.refreshAuth);
        window.removeEventListener('blessluxe:admin-signed-out', this.handleSignedOut);
    },
    methods: {
        async refreshAuth() {
            try {
                const data = await api.get('/api/admin/me');
                this.user = data.user;
            } catch {
                this.user = null;
            } finally {
                this.authChecked = true;
            }
        },
        handleSignedOut() {
            this.user = null;
        },
        onKey(e) { if (e.key === 'Escape') this.navOpen = false; },
        onBreakpoint(e) {
            this.isDesktop = e.matches;
            if (e.matches) this.navOpen = false;
        },
    },
};
</script>

<template>
    <div v-if="!authChecked" class="min-h-screen flex items-center justify-center bg-zinc-50">
        <p class="text-xs tracking-widest uppercase text-zinc-500 animate-pulse">Loading admin</p>
    </div>
    <Login v-else-if="!user" />
    <div v-else class="min-h-screen lg:flex bg-zinc-50">
        <Sidebar :user="user" :open="navOpen" :show-bell="isDesktop" @close="navOpen = false" />

        <div class="flex-1 min-w-0 flex flex-col">
            <!-- Phone / tablet top bar. The sidebar is a drawer here, so this is
                 the only way into it — and where the bell lives meanwhile. -->
            <header
                v-if="!isDesktop"
                class="sticky top-0 z-30 h-14 px-3 flex items-center justify-between gap-2 bg-black text-white"
                :style="{ paddingTop: 'env(safe-area-inset-top, 0px)', height: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }"
            >
                <button
                    @click="navOpen = true"
                    class="w-11 h-11 -ml-1 inline-flex items-center justify-center rounded-full hover:bg-white/10"
                    aria-label="Open menu"
                    :aria-expanded="navOpen"
                >
                    <Menu class="w-5 h-5" />
                </button>
                <img src="/logo.png" alt="BLESSLUXE" class="h-7 w-auto brightness-0 invert" />
                <NotificationsBell />
            </header>

            <!-- min-w-0 is what lets a wide table scroll INSIDE the page instead
                 of stretching it: a flex child won't shrink below its content
                 without it. -->
            <main class="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
                <router-view />
            </main>
        </div>
    </div>
    <DialogHost theme="admin" />
</template>
