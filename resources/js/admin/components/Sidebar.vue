<script>
import { api } from '../../lib/api.js';
import NotificationsBell from './NotificationsBell.vue';

export default {
    name: 'AdminSidebar',
    components: { NotificationsBell },
    props: {
        user: { type: Object, default: null },
        // Below `lg` this is an off-canvas drawer; `open` slides it in.
        open: { type: Boolean, default: false },
        // The bell lives in the mobile top bar instead when that is showing —
        // two mounted bells would mean two polls.
        showBell: { type: Boolean, default: true },
    },
    emits: ['close'],
    data() {
        return {
            // Live counts for items that carry a `badge` key.
            badges: { inbox: 0, hive: 0 },
            badgeTimer: null,
            sections: [
                {
                    title: 'Catalogue',
                    items: [
                        { to: '/admin',            label: 'Dashboard' },
                        { to: '/admin/products',   label: 'Products' },
                        { to: '/admin/inventory',  label: 'Inventory' },
                        { to: '/admin/headings',   label: 'Headings' },
                        { to: '/admin/catalogues', label: 'Catalogues' },
                    ],
                },
                {
                    title: 'Fulfilment',
                    items: [
                        { to: '/admin/orders',   label: 'Orders' },
                        { to: '/admin/packages', label: 'Packages' },
                        { to: '/admin/couriers', label: 'Couriers' },
                        { to: '/admin/returns',  label: 'Returns' },
                    ],
                },
                {
                    title: 'Customers',
                    items: [
                        { to: '/admin/customers', label: 'Customers' },
                        { to: '/admin/reviews',   label: 'Reviews' },
                        { to: '/admin/hive',      label: 'Hive reports', badge: 'hive' },
                        { to: '/admin/hive/challenges', label: 'Hive challenges' },
                    ],
                },
                {
                    title: 'Commerce',
                    items: [
                        { to: '/admin/affiliates', label: 'Affiliates' },
                        { to: '/admin/affiliate-inbox', label: 'Affiliate inbox', badge: 'inbox' },
                        { to: '/admin/payments',  label: 'Payments' },
                        { to: '/admin/bees',      label: 'Bees' },
                        { to: '/admin/packs',      label: 'Packs' },
                        { to: '/admin/regions',    label: 'Regions' },
                    ],
                },
                {
                    title: 'Editorial',
                    items: [
                        { to: '/admin/content', label: 'Hero & Top Bar' },
                        { to: '/admin/faqs',    label: 'FAQs' },
                    ],
                },
                {
                    title: 'Insights',
                    items: [
                        { to: '/admin/reports',  label: 'Reports & Exports' },
                        { to: '/admin/ai',       label: 'AI Studio' },
                        { to: '/admin/ai-usage', label: 'AI Usage & Costs' },
                    ],
                },
                {
                    title: 'System',
                    items: [
                        { to: '/admin/users', label: 'Admin users' },
                    ],
                },
            ],
        };
    },
    mounted() {
        this.refreshBadges();
        document.addEventListener('visibilitychange', this.onAttention);
        window.addEventListener('focus', this.onAttention);
        // The inbox page knows the number first-hand and more often; while it
        // is open it tells us, so the sidebar and the page can never disagree.
        window.addEventListener('blessluxe:inbox-unread', this.onInboxUnread);
    },
    beforeUnmount() {
        clearTimeout(this.badgeTimer);
        document.removeEventListener('visibilitychange', this.onAttention);
        window.removeEventListener('focus', this.onAttention);
        window.removeEventListener('blessluxe:inbox-unread', this.onInboxUnread);
    },
    methods: {
        /**
         * A message waiting on the brand has to be visible from ANY admin page,
         * not only from inside the inbox. Polled (the app runs without a socket):
         * one indexed COUNT every 30s, a minute in a background tab, and at once
         * when the tab is looked at again.
         */
        async refreshBadges() {
            clearTimeout(this.badgeTimer);
            try {
                const d = await api.get('/api/admin/affiliate-inbox/unread');
                this.badges.inbox = d.unread_total || 0;
                this.badges.hive = d.hive_reports_open || 0;
            } catch { /* signed out or offline — keep the last number */ }
            this.badgeTimer = setTimeout(this.refreshBadges, document.hidden ? 60000 : 30000);
        },
        onAttention() { if (!document.hidden) this.refreshBadges(); },
        onInboxUnread(e) { this.badges.inbox = e.detail ?? 0; },

        async signOut() {
            try {
                await api.post('/api/admin/logout');
            } catch {
                /* swallow — we're leaving anyway */
            }
            window.dispatchEvent(new CustomEvent('blessluxe:admin-signed-out'));
        },
    },
};
</script>

<template>
    <!-- Backdrop: only exists while the drawer is open on a small screen. -->
    <div
        v-if="open"
        class="fixed inset-0 z-40 bg-black/50 lg:hidden"
        aria-hidden="true"
        @click="$emit('close')"
    ></div>

    <!-- One element, two lives: a fixed drawer that slides in below `lg`, an
         ordinary column in the layout from `lg` up. -->
    <aside
        :class="[
            'bg-black text-white flex flex-col w-72 max-w-[85vw] lg:w-60',
            'fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out',
            // Desktop: pinned to the viewport and exactly as tall as it, so the
            // menu scrolls INSIDE the sidebar. It used to be as tall as its own
            // content — then the nav has nothing to scroll, and because it is
            // `overscroll-contain` (needed for the mobile drawer) Chrome swallowed
            // the mouse wheel over it: the sidebar could not be scrolled at all.
            // `self-start` stops the flex row stretching it back to page height.
            'lg:sticky lg:top-0 lg:self-start lg:h-dvh lg:z-auto lg:translate-x-0 lg:transition-none',
            open ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        ]"
        :aria-hidden="!open ? undefined : 'false'"
    >
        <div class="px-5 py-6 border-b border-white/10 flex items-start justify-between">
            <div>
                <img src="/logo.png" alt="BLESSLUXE" class="h-8 w-auto brightness-0 invert" />
                <p class="text-[10px] tracking-[0.3em] uppercase text-gold mt-2">Admin</p>
            </div>
            <NotificationsBell v-if="showBell" />
        </div>
        <nav class="flex-1 min-h-0 overflow-y-auto overscroll-contain py-4">
            <div v-for="section in sections" :key="section.title" class="mb-6">
                <p class="px-5 text-[10px] tracking-widest uppercase text-white/40 mb-2">{{ section.title }}</p>
                <ul>
                    <li v-for="item in section.items" :key="item.to">
                        <router-link
                            :to="item.to"
                            active-class="bg-white/10 text-gold"
                            class="flex items-center justify-between gap-2 px-5 py-2.5 lg:py-2 text-sm hover:bg-white/5 hover:text-gold transition-colors"
                            @click="$emit('close')"
                        >
                            <span>{{ item.label }}</span>
                            <span
                                v-if="item.badge && badges[item.badge]"
                                class="bg-gold text-white text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center tabular-nums"
                            >{{ badges[item.badge] > 99 ? '99+' : badges[item.badge] }}</span>
                        </router-link>
                    </li>
                </ul>
            </div>
        </nav>
        <div class="border-t border-white/10 px-5 py-4 text-xs text-white/55">
            <p v-if="user" class="mb-2 text-white/70 truncate">{{ user.name || user.email }}</p>
            <button @click="signOut" class="hover:text-gold transition-colors">Sign out</button>
        </div>
    </aside>
</template>
