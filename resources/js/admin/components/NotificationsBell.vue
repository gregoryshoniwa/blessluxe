<script>
import { api } from '../../lib/api.js';
import { Bell, X } from 'lucide-vue-next';

export default {
    name: 'AdminNotificationsBell',
    components: { Bell, X },
    data() { return { items: [], unread: 0, open: false, poller: null }; },
    async mounted() {
        await this.fetch();
        this.poller = setInterval(() => this.fetch(), 45000);
    },
    beforeUnmount() { clearInterval(this.poller); },
    methods: {
        async fetch() {
            try {
                const d = await api.get('/api/admin/notifications');
                this.items = d.notifications || [];
                this.unread = d.unread || 0;
            } catch { /* silent */ }
        },
        async toggle() {
            this.open = !this.open;
            if (this.open && this.unread > 0) {
                try { await api.post('/api/admin/notifications/read-all'); } catch { /* ignore */ }
                this.unread = 0;
                this.items.forEach((n) => { n.read_at = n.read_at || new Date().toISOString(); });
            }
        },
        async clickItem(n) {
            this.open = false;
            try { await api.post(`/api/admin/notifications/${n.id}/read`); } catch { /* ignore */ }
            if (n.action_url?.startsWith('/')) this.$router.push(n.action_url);
            else if (n.action_url) window.location.href = n.action_url;
        },
        timeAgo(iso) {
            if (!iso) return '';
            const diff = Date.now() - new Date(iso).getTime();
            const m = Math.floor(diff / 60000);
            if (m < 1) return 'just now';
            if (m < 60) return `${m}m`;
            const h = Math.floor(m / 60);
            if (h < 24) return `${h}h`;
            return `${Math.floor(h / 24)}d`;
        },
    },
};
</script>

<template>
    <div class="relative">
        <button @click="toggle" class="p-2 hover:text-gold transition-colors text-white/70 relative" aria-label="Notifications">
            <Bell class="w-5 h-5" stroke-width="1.5" />
            <span v-if="unread > 0" class="absolute top-0 right-0 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-semibold rounded-full flex items-center justify-center">
                {{ unread > 99 ? '99+' : unread }}
            </span>
        </button>
        <div v-if="open" class="fixed inset-0 z-40" @click="open = false"></div>
        <div v-if="open" class="absolute right-0 mt-2 w-[360px] max-w-[90vw] bg-white text-zinc-900 shadow-xl border border-zinc-200 z-50 max-h-[70vh] overflow-y-auto">
            <header class="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
                <p class="font-semibold tracking-widest uppercase text-xs">Notifications</p>
                <button @click="open = false" class="text-zinc-500 hover:text-black"><X class="w-4 h-4" /></button>
            </header>
            <ul v-if="items.length" class="divide-y divide-zinc-100">
                <li v-for="n in items" :key="n.id">
                    <button @click="clickItem(n)" :class="['w-full text-left px-4 py-3 hover:bg-zinc-50 transition-colors', !n.read_at && 'bg-amber-50']">
                        <p class="font-medium text-sm flex items-center gap-2">
                            <span v-if="!n.read_at" class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
                            {{ n.title }}
                        </p>
                        <p v-if="n.body" class="text-xs text-zinc-600 mt-1">{{ n.body }}</p>
                        <p class="text-[10px] tracking-widest uppercase text-zinc-400 mt-1">{{ timeAgo(n.created_at) }}</p>
                    </button>
                </li>
            </ul>
            <p v-else class="px-4 py-8 text-center text-sm text-zinc-500">No new notifications.</p>
        </div>
    </div>
</template>
