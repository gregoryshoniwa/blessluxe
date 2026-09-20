<script>
import { defineAsyncComponent } from 'vue';
import Header from './components/Header.vue';
import Footer from './components/Footer.vue';
import AnnouncementBar from './components/AnnouncementBar.vue';
import ChatWidget from './components/ChatWidget.vue';
import DialogHost from '../components/DialogHost.vue';

export default {
    name: 'StorefrontApp',
    components: {
        Header, Footer, AnnouncementBar, ChatWidget, DialogHost,
        // Loaded only when someone enters the Hive — shoppers never download it.
        HiveShell: defineAsyncComponent(() => import('./components/hive/HiveShell.vue')),
    },
    computed: {
        // Routes with `meta.shell: 'hive'` get the Hive's own full-screen frame
        // instead of the shop's bar, header, footer and LUXE launcher.
        // Until the router has resolved the first URL there is no meta yet, so
        // the address decides — otherwise a Hive link would flash the shop's
        // header for a moment on the way in.
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
        <Footer />
        <ChatWidget />
    </div>
    <DialogHost />
</template>
