<script>
import { api } from '../../lib/api.js';
import NotificationsBell from './NotificationsBell.vue';

export default {
    name: 'AdminSidebar',
    components: { NotificationsBell },
    props: { user: { type: Object, default: null } },
    data() {
        return {
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
                    ],
                },
                {
                    title: 'Customers',
                    items: [
                        { to: '/admin/customers', label: 'Customers' },
                        { to: '/admin/reviews',   label: 'Reviews' },
                    ],
                },
                {
                    title: 'Commerce',
                    items: [
                        { to: '/admin/affiliates', label: 'Affiliates' },
                        { to: '/admin/blits',      label: 'Blits' },
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
                        { to: '/admin/reports', label: 'Reports & Exports' },
                    ],
                },
            ],
        };
    },
    methods: {
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
    <aside class="w-60 bg-black text-white flex flex-col">
        <div class="px-5 py-6 border-b border-white/10 flex items-start justify-between">
            <div>
                <img src="/logo.png" alt="BLESSLUXE" class="h-8 w-auto brightness-0 invert" />
                <p class="text-[10px] tracking-[0.3em] uppercase text-gold mt-2">Admin</p>
            </div>
            <NotificationsBell />
        </div>
        <nav class="flex-1 overflow-y-auto py-4">
            <div v-for="section in sections" :key="section.title" class="mb-6">
                <p class="px-5 text-[10px] tracking-widest uppercase text-white/40 mb-2">{{ section.title }}</p>
                <ul>
                    <li v-for="item in section.items" :key="item.to">
                        <router-link
                            :to="item.to"
                            active-class="bg-white/10 text-gold"
                            class="block px-5 py-2 text-sm hover:bg-white/5 hover:text-gold transition-colors"
                        >
                            {{ item.label }}
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
