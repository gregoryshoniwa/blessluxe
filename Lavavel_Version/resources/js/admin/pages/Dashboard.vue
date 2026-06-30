<script>
import { api } from '../../lib/api.js';

export default {
    name: 'AdminDashboard',
    data() {
        return {
            stats: [],
            recentOrders: [],
            pendingReviews: 0,
            loading: true,
        };
    },
    async mounted() {
        try {
            const data = await api.get('/api/admin/dashboard');
            this.stats = data.stats || [];
            this.recentOrders = data.recent_orders || [];
            this.pendingReviews = data.pending_reviews || 0;
        } finally {
            this.loading = false;
        }
    },
    methods: {
        fmtDate(iso) {
            if (!iso) return '—';
            return new Date(iso).toLocaleString();
        },
    },
};
</script>

<template>
    <div>
        <header class="mb-8">
            <p class="text-xs tracking-widest uppercase text-zinc-500">Welcome back</p>
            <h1 class="text-2xl font-semibold">Dashboard</h1>
        </header>

        <div v-if="loading" class="text-zinc-400 text-sm">Loading…</div>

        <div v-else>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div v-for="s in stats" :key="s.label" class="bg-white border border-zinc-200 p-5">
                    <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2">{{ s.label }}</p>
                    <p class="text-3xl font-semibold">{{ s.value }}</p>
                </div>
            </div>

            <div v-if="pendingReviews > 0" class="bg-amber-50 border border-amber-200 px-4 py-3 mb-6 text-sm">
                {{ pendingReviews }} review{{ pendingReviews === 1 ? '' : 's' }} waiting for moderation.
                <router-link to="/admin/reviews" class="ml-2 text-gold underline">Review now →</router-link>
            </div>

            <section class="bg-white border border-zinc-200">
                <header class="px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
                    <h2 class="font-semibold">Recent orders</h2>
                    <span class="text-xs text-zinc-500">last 8</span>
                </header>
                <table class="w-full text-sm">
                    <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                        <tr>
                            <th class="px-5 py-3 text-left">Order</th>
                            <th class="px-5 py-3 text-left">Email</th>
                            <th class="px-5 py-3 text-left">Total</th>
                            <th class="px-5 py-3 text-left">Status</th>
                            <th class="px-5 py-3 text-left">Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="!recentOrders.length">
                            <td colspan="5" class="px-5 py-8 text-center text-zinc-400">No orders yet.</td>
                        </tr>
                        <tr v-for="o in recentOrders" :key="o.id" class="border-t border-zinc-100">
                            <td class="px-5 py-3 font-mono text-xs">{{ o.order_number }}</td>
                            <td class="px-5 py-3">{{ o.email }}</td>
                            <td class="px-5 py-3">{{ o.total_label }}</td>
                            <td class="px-5 py-3">
                                <span class="text-xs px-2 py-0.5 rounded bg-zinc-100">{{ o.status }}</span>
                                <span class="text-xs px-2 py-0.5 rounded ml-1 bg-emerald-100 text-emerald-700" v-if="o.payment_status === 'paid'">paid</span>
                            </td>
                            <td class="px-5 py-3 text-zinc-500">{{ fmtDate(o.created_at) }}</td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    </div>
</template>
