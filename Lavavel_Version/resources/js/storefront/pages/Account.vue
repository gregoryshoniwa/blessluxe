<script>
import { api } from '../../lib/api.js';

export default {
    name: 'AccountPage',
    data() {
        return {
            loading: true,
            customer: null,
            blits: null,
            blitsSettings: null,
            activeTab: 'overview',
            tabs: [
                { id: 'overview',     label: 'Overview' },
                { id: 'blits',        label: 'Blits' },
                { id: 'transactions', label: 'Transactions' },
                { id: 'addresses',    label: 'Addresses' },
                { id: 'wishlist',     label: 'Wishlist' },
            ],
        };
    },
    computed: {
        displayName() {
            if (!this.customer) return 'Guest';
            const first = this.customer.first_name;
            const last  = this.customer.last_name;
            return [first, last].filter(Boolean).join(' ') || this.customer.email;
        },
    },
    async mounted() {
        const tab = this.$route.query.tab;
        if (tab && this.tabs.some((t) => t.id === tab)) this.activeTab = tab;
        await this.loadMe();
    },
    methods: {
        async loadMe() {
            this.loading = true;
            try {
                const data = await api.get('/api/account/me');
                this.customer = data.customer;
                if (!this.customer) {
                    const here = this.$route.fullPath;
                    this.$router.replace(`/account/login?next=${encodeURIComponent(here)}`);
                    return;
                }
                // Blits panel data — independent fetch so a failure here
                // doesn't block the account from rendering.
                try {
                    const b = await api.get('/api/account/blits');
                    this.blits = b.blits;
                    this.blitsSettings = b.settings;
                } catch { /* leave null */ }
            } catch {
                this.customer = null;
            } finally {
                this.loading = false;
            }
        },
        ledgerLabel(reason) {
            const map = {
                checkout_redeem: 'Spent at checkout',
                order_earn: 'Earned on order',
                admin_adjustment: 'Adjusted by admin',
                checkout_cancel_refund: 'Refunded (cancelled checkout)',
            };
            return map[reason] || reason.replace(/_/g, ' ');
        },
        fmtDate(iso) { return iso ? new Date(iso).toLocaleString() : '—'; },
        async signOut() {
            try {
                await api.post('/api/account/logout');
            } catch {
                /* swallow — we're leaving the page anyway */
            }
            this.customer = null;
            this.$router.push('/');
        },
    },
};
</script>

<template>
    <div class="max-w-[1200px] mx-auto px-[5%] py-12 min-h-[60vh]">
        <div v-if="loading" class="flex justify-center py-24">
            <p class="text-[10px] tracking-widest uppercase text-black/55 animate-pulse">Loading account</p>
        </div>

        <div v-else-if="customer">
            <div class="flex items-start justify-between mb-10">
                <div>
                    <p class="font-script text-3xl text-gold">Welcome</p>
                    <h1 class="font-display text-3xl md:text-4xl tracking-widest uppercase">{{ displayName }}</h1>
                    <p class="text-sm text-black/60 mt-1">{{ customer.email }}</p>
                </div>
                <button @click="signOut" class="text-[10px] tracking-widest uppercase text-black/55 hover:text-gold transition-colors">
                    Sign out
                </button>
            </div>

            <div class="grid grid-cols-12 gap-8">
                <aside class="col-span-12 md:col-span-3 space-y-1">
                    <button
                        v-for="t in tabs"
                        :key="t.id"
                        @click="activeTab = t.id"
                        :class="[
                            'w-full text-left px-4 py-3 text-sm tracking-widest uppercase',
                            activeTab === t.id ? 'bg-gold text-white' : 'text-black/70 hover:bg-cream-dark',
                        ]"
                    >
                        {{ t.label }}
                    </button>
                </aside>
                <section class="col-span-12 md:col-span-9 bg-white border border-gold/10 p-6">
                    <div v-if="activeTab === 'overview'">
                        <h2 class="font-display text-xl tracking-widest uppercase mb-4">Overview</h2>
                        <dl class="text-sm space-y-2">
                            <div class="flex justify-between"><dt class="text-black/55">Loyalty tier</dt><dd>{{ customer.loyalty_tier }}</dd></div>
                            <div class="flex justify-between"><dt class="text-black/55">Loyalty points</dt><dd>{{ customer.loyalty_points }}</dd></div>
                            <div class="flex justify-between"><dt class="text-black/55">Email verified</dt><dd>{{ customer.email_verified_at ? 'Yes' : 'No' }}</dd></div>
                            <div v-if="customer.oauth_provider" class="flex justify-between">
                                <dt class="text-black/55">Sign-in via</dt>
                                <dd class="capitalize">{{ customer.oauth_provider }}</dd>
                            </div>
                            <div class="flex justify-between"><dt class="text-black/55">Last login</dt><dd>{{ customer.last_login_at || '—' }}</dd></div>
                        </dl>
                    </div>
                    <div v-else-if="activeTab === 'blits'">
                        <h2 class="font-display text-xl tracking-widest uppercase mb-4">Blits</h2>
                        <div v-if="!blits" class="text-sm text-black/65">Loading…</div>
                        <div v-else>
                            <div class="bg-cream-dark/40 border border-gold/20 p-5 mb-5 flex items-center justify-between">
                                <div>
                                    <p class="text-[10px] tracking-widest uppercase text-black/55 mb-1">Balance</p>
                                    <p class="font-display text-3xl">{{ blits.balance }} <span class="text-base text-black/55">Blits</span></p>
                                    <p v-if="blitsSettings" class="text-xs text-black/55 mt-1">
                                        ≈ ${{ (blits.balance / blitsSettings.per_usd).toFixed(2) }} at checkout
                                    </p>
                                </div>
                                <p class="text-[10px] tracking-widest uppercase bg-gold/20 text-gold-dark px-3 py-1">{{ blits.tier }}</p>
                            </div>

                            <p v-if="!blits.recent.length" class="text-sm text-black/55">No activity yet.</p>
                            <table v-else class="w-full text-sm">
                                <thead class="text-[10px] tracking-widest uppercase text-black/55 border-b border-gold/10">
                                    <tr>
                                        <th class="py-2 text-left">Activity</th>
                                        <th class="py-2 text-right">Change</th>
                                        <th class="py-2 text-right">Balance</th>
                                        <th class="py-2 text-right">When</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="e in blits.recent" :key="e.id" class="border-b border-gold/5">
                                        <td class="py-2">{{ ledgerLabel(e.reason) }}</td>
                                        <td :class="['py-2 text-right font-medium', e.delta > 0 ? 'text-emerald-600' : 'text-red-600']">
                                            {{ e.delta > 0 ? '+' : '' }}{{ e.delta }}
                                        </td>
                                        <td class="py-2 text-right">{{ e.balance_after }}</td>
                                        <td class="py-2 text-right text-xs text-black/55">{{ fmtDate(e.created_at) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div v-else-if="activeTab === 'transactions'">
                        <h2 class="font-display text-xl tracking-widest uppercase mb-2">Transactions</h2>
                        <p class="text-sm text-black/65">Orders show up here once Milestone 5 (cart + checkout) lands.</p>
                    </div>
                    <div v-else-if="activeTab === 'addresses'">
                        <h2 class="font-display text-xl tracking-widest uppercase mb-2">Addresses</h2>
                        <p class="text-sm text-black/65">Saved addresses appear here after your first checkout.</p>
                    </div>
                    <div v-else-if="activeTab === 'wishlist'">
                        <h2 class="font-display text-xl tracking-widest uppercase mb-2">Wishlist</h2>
                        <p class="text-sm text-black/65">
                            <router-link to="/wishlist" class="text-gold underline">View full wishlist →</router-link>
                        </p>
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>
