<script>
import Header from './components/Header.vue';
import Footer from './components/Footer.vue';
import AnnouncementBar from './components/AnnouncementBar.vue';
import ChatWidget from './components/ChatWidget.vue';
import DialogHost from '../components/DialogHost.vue';

export default {
    name: 'StorefrontApp',
    components: { Header, Footer, AnnouncementBar, ChatWidget, DialogHost },
};
</script>

<template>
    <div class="min-h-screen flex flex-col bg-cream text-black">
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
