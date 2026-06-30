<script>
import Sidebar from './components/Sidebar.vue';

export default {
    name: 'AdminApp',
    components: { Sidebar },
    computed: {
        isBlank() {
            return this.$route.meta.layout === 'blank';
        },
    },
};
</script>

<template>
    <div v-if="isBlank" class="min-h-screen bg-zinc-50">
        <router-view />
    </div>
    <div v-else class="min-h-screen flex bg-zinc-50">
        <Sidebar />
        <main class="flex-1 p-8 overflow-y-auto">
            <router-view />
        </main>
    </div>
</template>
