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
            orders: null,
            ordersLoading: false,
            affiliate: null,
            affiliateChecked: false,
            copyState: '',
            activeTab: 'overview',
            tabs: [
                { id: 'overview',     label: 'Overview' },
                { id: 'blits',        label: 'Blits' },
                { id: 'transactions', label: 'Transactions' },
                { id: 'affiliate',    label: 'Affiliate' },
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
                // Orders — needed for the Transactions tab + sidebar count.
                try {
                    const o = await api.get('/api/account/orders');
                    this.orders = o.orders;
                } catch { /* leave null */ }
                // Affiliate — null if they haven't applied yet.
                try {
                    const a = await api.get('/api/account/affiliate');
                    this.affiliate = a.affiliate;
                } catch { /* leave null */ }
                this.affiliateChecked = true;
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
        async copyShareUrl() {
            if (!this.affiliate?.share_url) return;
            try {
                await navigator.clipboard.writeText(this.affiliate.share_url);
                this.copyState = 'Copied';
            } catch {
                this.copyState = 'Press ⌘C';
            }
            setTimeout(() => { this.copyState = ''; }, 1800);
        },
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
        <div v-if="loading" class="grid grid-cols-12 gap-8 animate-pulse">
            <div class="col-span-12 md:col-span-3 space-y-2">
                <div v-for="n in 5" :key="n" class="h-10 bg-cream-dark" />
            </div>
            <div class="col-span-12 md:col-span-9 bg-cream-dark/40 p-6 space-y-3">
                <div class="h-6 w-1/3 bg-cream-dark" />
                <div class="h-4 w-2/3 bg-cream-dark" />
                <div class="h-4 w-1/2 bg-cream-dark" />
                <div class="h-4 w-3/4 bg-cream-dark" />
            </div>
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
                        <h2 class="font-display text-xl tracking-widest uppercase mb-4">Transactions</h2>
                        <div v-if="!orders" class="text-sm text-black/65">Loading orders…</div>
                        <p v-else-if="!orders.length" class="text-sm text-black/65">No orders yet. Once you check out, receipts and tracking codes show up here.</p>
                        <table v-else class="w-full text-sm">
                            <thead class="text-[10px] tracking-widest uppercase text-black/55 border-b border-gold/10">
                                <tr>
                                    <th class="py-2 text-left">Order</th>
                                    <th class="py-2 text-left">Date</th>
                                    <th class="py-2 text-left">Total</th>
                                    <th class="py-2 text-left">Status</th>
                                    <th class="py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="o in orders" :key="o.order_number" class="border-b border-gold/5">
                                    <td class="py-3 font-mono text-xs">{{ o.order_number }}</td>
                                    <td class="py-3 text-xs text-black/55">{{ fmtDate(o.created_at) }}</td>
                                    <td class="py-3">{{ o.total_label }}</td>
                                    <td class="py-3">
                                        <span class="text-[10px] px-2 py-0.5 rounded bg-cream-dark/60">{{ o.status }}</span>
                                        <span v-if="o.payment_status === 'paid'" class="ml-1 text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">paid</span>
                                    </td>
                                    <td class="py-3 text-right">
                                        <router-link v-if="o.tracking_code" :to="`/track/${o.tracking_code}`" class="text-xs tracking-widest uppercase text-gold-dark hover:text-gold">
                                            Track →
                                        </router-link>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div v-else-if="activeTab === 'affiliate'">
                        <h2 class="font-display text-xl tracking-widest uppercase mb-4">Affiliate</h2>
                        <div v-if="!affiliateChecked" class="text-sm text-black/65">Loading…</div>
                        <div v-else-if="!affiliate">
                            <p class="text-sm text-black/65 mb-4">
                                Earn commission on every order shopped via your code. Apply once — we review applications within 48 hours.
                            </p>
                            <router-link to="/affiliate/apply" class="inline-block bg-gold text-white px-6 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                                Apply now
                            </router-link>
                        </div>
                        <div v-else-if="affiliate.status === 'pending'" class="text-sm text-black/65">
                            <p class="bg-amber-50 border border-amber-200 text-amber-800 p-4 mb-3">
                                Application received. We'll email <span class="font-mono">{{ customer.email }}</span> once your code <span class="font-mono">{{ affiliate.code }}</span> is approved.
                            </p>
                        </div>
                        <div v-else>
                            <div class="bg-cream-dark/40 border border-gold/20 p-5 mb-5">
                                <p class="text-[10px] tracking-widest uppercase text-black/55 mb-1">Your code</p>
                                <div class="flex items-center justify-between gap-3 flex-wrap">
                                    <p class="font-display text-3xl tracking-wider">{{ affiliate.code }}</p>
                                    <p class="text-[10px] tracking-widest uppercase bg-emerald-100 text-emerald-700 px-3 py-1">
                                        {{ affiliate.commission_rate }}% commission
                                    </p>
                                </div>
                                <div class="mt-4 flex items-center gap-2">
                                    <input type="text" :value="affiliate.share_url" readonly class="flex-1 min-w-0 bg-white border border-gold/15 px-3 py-2 text-xs font-mono" />
                                    <button @click="copyShareUrl" class="bg-black text-white px-4 py-2 text-[10px] tracking-widest uppercase hover:bg-gold transition-colors whitespace-nowrap">
                                        {{ copyState || 'Copy link' }}
                                    </button>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                <div class="border border-gold/10 p-3">
                                    <p class="text-[10px] tracking-widest uppercase text-black/55">Total earnings</p>
                                    <p class="text-lg font-display mt-1">{{ affiliate.summary.total_earnings }}</p>
                                </div>
                                <div class="border border-gold/10 p-3">
                                    <p class="text-[10px] tracking-widest uppercase text-black/55">Pending</p>
                                    <p class="text-lg font-display mt-1">{{ affiliate.summary.pending_balance }}</p>
                                </div>
                                <div class="border border-gold/10 p-3">
                                    <p class="text-[10px] tracking-widest uppercase text-black/55">Paid out</p>
                                    <p class="text-lg font-display mt-1">{{ affiliate.summary.paid_out }}</p>
                                </div>
                                <div class="border border-gold/10 p-3">
                                    <p class="text-[10px] tracking-widest uppercase text-black/55">Last 30 days</p>
                                    <p class="text-lg font-display mt-1">{{ affiliate.summary.sales_last_30d }}</p>
                                </div>
                            </div>

                            <h3 class="text-sm tracking-widest uppercase text-black/70 mb-2">Recent sales</h3>
                            <p v-if="!affiliate.recent_sales.length" class="text-sm text-black/55">No sales yet. Share your code to start earning.</p>
                            <table v-else class="w-full text-sm">
                                <thead class="text-[10px] tracking-widest uppercase text-black/55 border-b border-gold/10">
                                    <tr>
                                        <th class="py-2 text-left">Order</th>
                                        <th class="py-2 text-right">Order total</th>
                                        <th class="py-2 text-right">Commission</th>
                                        <th class="py-2 text-right">Status</th>
                                        <th class="py-2 text-right">When</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="s in affiliate.recent_sales" :key="s.order_id" class="border-b border-gold/5">
                                        <td class="py-2 font-mono text-xs">{{ s.order_id.slice(-8) }}</td>
                                        <td class="py-2 text-right">{{ s.order_total }}</td>
                                        <td class="py-2 text-right text-gold-dark">{{ s.commission_amount }}</td>
                                        <td class="py-2 text-right text-xs capitalize">{{ s.status }}</td>
                                        <td class="py-2 text-right text-xs text-black/55">{{ fmtDate(s.created_at) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
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
