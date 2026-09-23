<script>
import { defineAsyncComponent } from 'vue';
import Header from './components/Header.vue';
import Footer from './components/Footer.vue';
import FooterSlim from './components/FooterSlim.vue';
import AnnouncementBar from './components/AnnouncementBar.vue';
import ChatWidget from './components/ChatWidget.vue';
import DialogHost from '../components/DialogHost.vue';
import CartDrawer from './components/CartDrawer.vue';

export default {
    name: 'StorefrontApp',
    components: {
        Header, Footer, FooterSlim, AnnouncementBar, ChatWidget, DialogHost, CartDrawer,
        // Loaded only when someone enters the Hive — shoppers never download it.
        HiveShell: defineAsyncComponent(() => import('./components/hive/HiveShell.vue')),
    },
    computed: {
        // Routes with `meta.shell: 'hive'` get the Hive's own full-screen frame
        // instead of the shop's bar, header, footer and LUXE launcher.
        // Until the router has resolved the first URL there is no meta yet, so
        // the address decides — otherwise a Hive link would flash the shop's
        // header for a moment on the way in.
        isHome() { return this.$route.path === '/'; },
        inHive() {
            const r = this.$route;
            return r.matched.length ? r.meta.shell === 'hive' : /^\/(hive(\/|$)|@)/.test(window.location.pathname);
        },
    },
};
</script>

<template>
    <HiveShell v-if="inHive">
        <router-view />
    </HiveShell>
    <div v-else class="min-h-screen flex flex-col bg-cream text-black">
        <AnnouncementBar />
        <Header />
        <main class="flex-1">
            <router-view />
        </main>
        <!-- The full footer belongs to the home page. Every other page ends in
             a single line of the links a shopper actually reaches for, because
             a wall of them competes with the thing they came to buy. -->
        <Footer v-if="isHome" />
        <FooterSlim v-else />
        <ChatWidget />
    </div>
    <!-- One bag for the whole shop; the Hive has no cart chrome of its own. -->
    <CartDrawer v-if="!inHive" />
    <DialogHost />
</template>
