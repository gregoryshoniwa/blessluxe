<script>
import { api } from '../../lib/api.js';
import { Bell, X } from 'lucide-vue-next';

export default {
    name: 'NotificationsBell',
    components: { Bell, X },
    data() {
        return {
            items: [],
            unread: 0,
            open: false,
            poller: null,
        };
    },
    async mounted() {
        await this.fetch();
        // Poll every 60s so badges update without a websocket. Cheap query.
        this.poller = setInterval(() => this.fetch(), 60000);
    },
    beforeUnmount() {
        clearInterval(this.poller);
    },
    methods: {
        async fetch() {
            try {
                const d = await api.get('/api/account/notifications');
                this.items = d.notifications || [];
                this.unread = d.unread || 0;
            } catch { /* guest; bell hides itself via v-if elsewhere */ }
        },
        async toggle() {
            this.open = !this.open;
            if (this.open && this.unread > 0) {
                try { await api.post('/api/account/notifications/read-all'); } catch { /* ignore */ }
                this.unread = 0;
                this.items.forEach((n) => { n.read_at = n.read_at || new Date().toISOString(); });
            }
        },
        async clickItem(n) {
            this.open = false;
            try { await api.post(`/api/account/notifications/${n.id}/read`); } catch { /* ignore */ }
            if (n.action_url) {
                if (n.action_url.startsWith('/')) this.$router.push(n.action_url);
                else window.location.href = n.action_url;
            }
        },
        timeAgo(iso) {
            if (!iso) return '';
            const diff = Date.now() - new Date(iso).getTime();
            const m = Math.floor(diff / 60000);
            if (m < 1) return 'just now';
            if (m < 60) return `${m}m`;
            const h = Math.floor(m / 60);
            if (h < 24) return `${h}h`;
            const d = Math.floor(h / 24);
            return `${d}d`;
        },
    },
};
</script>

<template>
    <div class="relative">
        <button @click="toggle" class="p-2 hover:text-gold transition-colors relative" aria-label="Notifications">
            <Bell class="w-5 h-5" stroke-width="1.5" />
            <span
                v-if="unread > 0"
                class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-semibold rounded-full flex items-center justify-center"
            >{{ unread > 99 ? '99+' : unread }}</span>
        </button>

        <!-- Backdrop + panel -->
        <div v-if="open" class="fixed inset-0 z-40" @click="open = false"></div>
        <div
            v-if="open"
            class="absolute right-0 mt-2 w-[360px] max-w-[90vw] bg-white shadow-xl border border-gold/15 z-50 max-h-[70vh] overflow-y-auto"
        >
            <header class="flex items-center justify-between px-4 py-3 border-b border-gold/10">
                <p class="font-display text-sm tracking-widest uppercase">Notifications</p>
                <button @click="open = false" class="text-black/55 hover:text-black">
                    <X class="w-4 h-4" />
                </button>
            </header>
            <ul v-if="items.length" class="divide-y divide-gold/5">
                <li v-for="n in items" :key="n.id">
                    <button
                        @click="clickItem(n)"
                        :class="['w-full text-left px-4 py-3 hover:bg-cream-dark/40 transition-colors', !n.read_at && 'bg-gold/5']"
                    >
                        <p class="font-medium text-sm flex items-center gap-2">
                            <span v-if="!n.read_at" class="w-1.5 h-1.5 rounded-full bg-gold inline-block"></span>
                            {{ n.title }}
                        </p>
                        <p v-if="n.body" class="text-xs text-black/60 mt-1">{{ n.body }}</p>
                        <p class="text-[10px] tracking-widest uppercase text-black/40 mt-1">{{ timeAgo(n.created_at) }}</p>
                    </button>
                </li>
            </ul>
            <p v-else class="px-4 py-8 text-center text-sm text-black/55">You're all caught up.</p>
        </div>
    </div>
</template>
