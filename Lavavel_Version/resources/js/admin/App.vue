<script>
import Sidebar from './components/Sidebar.vue';
import Login from './pages/Login.vue';
import { api } from '../lib/api.js';

export default {
    name: 'AdminApp',
    components: { Sidebar, Login },
    data() {
        return {
            user: null,
            authChecked: false,
        };
    },
    async mounted() {
        await this.refreshAuth();
        window.addEventListener('blessluxe:admin-signed-in', this.refreshAuth);
        window.addEventListener('blessluxe:admin-signed-out', this.handleSignedOut);
    },
    beforeUnmount() {
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
    },
};
</script>

<template>
    <div v-if="!authChecked" class="min-h-screen flex items-center justify-center bg-zinc-50">
        <p class="text-xs tracking-widest uppercase text-zinc-500 animate-pulse">Loading admin</p>
    </div>
    <Login v-else-if="!user" />
    <div v-else class="min-h-screen flex bg-zinc-50">
        <Sidebar :user="user" />
        <main class="flex-1 p-8 overflow-y-auto">
            <router-view />
        </main>
    </div>
</template>
