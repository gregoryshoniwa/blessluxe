<script>
import { api } from '../../lib/api.js';
import { Copy, ExternalLink, Wallet, TrendingUp, Calendar, ShoppingBag } from 'lucide-vue-next';

export default {
    name: 'AffiliateDashboard',
    components: { Copy, ExternalLink, Wallet, TrendingUp, Calendar, ShoppingBag },
    data() {
        return { data: null, loading: true, error: '', copied: false, needsLogin: false };
    },
    computed: {
        code() { return (this.$route.params.code || '').toUpperCase(); },
        shopLink() {
            if (typeof window === 'undefined') return '';
            return `${window.location.origin}/affiliate/shop/${this.code}`;
        },
    },
    async mounted() {
        try {
            const res = await api.get(`/api/store/affiliate/dashboard/${encodeURIComponent(this.code)}`);
            this.data = res;
        } catch (e) {
            this.error = e.payload?.error || 'Affiliate code not found.';
            if (e.status === 401) this.needsLogin = true;
        } finally {
            this.loading = false;
        }
    },
    methods: {
        async copyLink() {
            try {
                await navigator.clipboard.writeText(this.shopLink);
                this.copied = true;
                setTimeout(() => { this.copied = false; }, 1800);
            } catch { /* ignore */ }
        },
        fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString() : '—'; },
    },
};
</script>

<template>
    <div class="max-w-[1200px] mx-auto px-[5%] py-12 min-h-[60vh]">
        <div v-if="loading" class="text-center py-24">
            <p class="text-[10px] tracking-widest uppercase text-black/55 animate-pulse">Loading dashboard</p>
        </div>

        <div v-else-if="needsLogin" class="text-center py-24 max-w-md mx-auto">
            <p class="font-script text-3xl text-gold">Hi there</p>
            <h1 class="font-display text-2xl tracking-widest uppercase mb-2">Sign in to view this dashboard</h1>
            <p class="text-sm text-black/65 mb-6">{{ error }}</p>
            <router-link :to="`/account/login?next=/affiliate/${code}/dashboard`" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Sign in
            </router-link>
        </div>

        <div v-else-if="error" class="text-center py-24">
            <p class="font-script text-3xl text-gold">404</p>
            <h1 class="font-display text-2xl tracking-widest uppercase mb-2">{{ error }}</h1>
            <router-link to="/" class="text-gold underline">Back to home</router-link>
        </div>

        <div v-else>
            <header class="mb-10">
                <p class="font-script text-3xl text-gold">Hello {{ data.affiliate.name }}</p>
                <div class="flex flex-wrap items-end gap-3">
                    <h1 class="font-display text-3xl md:text-4xl tracking-widest uppercase">
                        Affiliate · {{ data.affiliate.code }}
                    </h1>
                    <span
                        :class="['text-[10px] px-2 py-1 tracking-widest uppercase', {
                            'bg-emerald-100 text-emerald-700': data.affiliate.status === 'active',
                            'bg-amber-100 text-amber-700': data.affiliate.status === 'pending',
                            'bg-zinc-100 text-zinc-600': data.affiliate.status === 'paused',
                        }]"
                    >{{ data.affiliate.status }}</span>
                </div>
                <p class="text-sm text-black/65 mt-2">Commission rate: <strong>{{ data.affiliate.commission_rate }}%</strong></p>
            </header>

            <!-- Stat tiles -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                <div class="bg-white border border-gold/15 p-5">
                    <p class="text-[10px] tracking-widest uppercase text-black/55 mb-2 flex items-center gap-1"><Wallet class="w-3 h-3" /> Total earnings</p>
                    <p class="font-display text-2xl">{{ data.summary.total_earnings }}</p>
                </div>
                <div class="bg-white border border-gold/15 p-5">
                    <p class="text-[10px] tracking-widest uppercase text-black/55 mb-2 flex items-center gap-1"><Wallet class="w-3 h-3" /> Paid out</p>
                    <p class="font-display text-2xl">{{ data.summary.paid_out }}</p>
                </div>
                <div class="bg-white border border-gold/15 p-5">
                    <p class="text-[10px] tracking-widest uppercase text-black/55 mb-2 flex items-center gap-1"><TrendingUp class="w-3 h-3" /> Pending balance</p>
                    <p class="font-display text-2xl text-gold-dark">{{ data.summary.pending_balance }}</p>
                </div>
                <div class="bg-white border border-gold/15 p-5">
                    <p class="text-[10px] tracking-widest uppercase text-black/55 mb-2 flex items-center gap-1"><Calendar class="w-3 h-3" /> Last 30 days</p>
                    <p class="font-display text-2xl">{{ data.summary.sales_last_30d }}</p>
                </div>
            </div>

            <!-- Shareable link -->
            <section class="bg-cream-dark/50 p-6 mb-10">
                <h2 class="font-display text-lg tracking-widest uppercase mb-3">Your shareable link</h2>
                <p class="text-xs text-black/60 mb-3">Send this to followers — every order placed in their session earns you commission.</p>
                <div class="flex gap-2">
                    <input
                        :value="shopLink"
                        readonly
                        class="flex-1 border border-black/15 px-4 py-2 bg-white font-mono text-sm"
                    />
                    <button
                        @click="copyLink"
                        class="inline-flex items-center gap-2 bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
                    >
                        <Copy class="w-4 h-4" />
                        {{ copied ? 'Copied ✓' : 'Copy' }}
                    </button>
                    <a
                        :href="shopLink"
                        target="_blank"
                        class="inline-flex items-center gap-2 border border-black/15 px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:border-gold hover:text-gold transition-colors"
                    >
                        <ExternalLink class="w-4 h-4" />
                        Open
                    </a>
                </div>
            </section>

            <!-- Recent sales -->
            <section class="bg-white border border-gold/15 mb-10">
                <header class="px-5 py-3 border-b border-gold/10 flex items-center justify-between">
                    <h2 class="font-display text-sm tracking-widest uppercase flex items-center gap-2"><ShoppingBag class="w-3.5 h-3.5" /> Recent sales</h2>
                    <span class="text-[10px] tracking-widest uppercase text-black/40">last 20</span>
                </header>
                <table class="w-full text-sm">
                    <thead class="bg-cream-dark/30 text-[10px] tracking-widest uppercase text-black/55">
                        <tr>
                            <th class="px-5 py-3 text-left">Order</th>
                            <th class="px-5 py-3 text-left">Total</th>
                            <th class="px-5 py-3 text-left">Your share</th>
                            <th class="px-5 py-3 text-left">Status</th>
                            <th class="px-5 py-3 text-left">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="!data.recent_sales.length"><td colspan="5" class="px-5 py-8 text-center text-black/40">No sales yet — share your link to start earning.</td></tr>
                        <tr v-for="s in data.recent_sales" :key="s.id" class="border-t border-gold/5">
                            <td class="px-5 py-3 font-mono text-xs">{{ s.order_id }}</td>
                            <td class="px-5 py-3">{{ s.order_total }}</td>
                            <td class="px-5 py-3 font-semibold text-gold-dark">{{ s.commission_amount }}</td>
                            <td class="px-5 py-3">
                                <span :class="['text-xs px-2 py-0.5 rounded', {
                                    'bg-amber-100 text-amber-700': s.status === 'pending',
                                    'bg-emerald-100 text-emerald-700': s.status === 'paid',
                                    'bg-zinc-100 text-zinc-600': s.status === 'cancelled',
                                }]">{{ s.status }}</span>
                            </td>
                            <td class="px-5 py-3 text-black/55 text-xs">{{ fmtDate(s.created_at) }}</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <!-- Payouts -->
            <section class="bg-white border border-gold/15">
                <header class="px-5 py-3 border-b border-gold/10">
                    <h2 class="font-display text-sm tracking-widest uppercase flex items-center gap-2"><Wallet class="w-3.5 h-3.5" /> Payouts</h2>
                </header>
                <table class="w-full text-sm">
                    <thead class="bg-cream-dark/30 text-[10px] tracking-widest uppercase text-black/55">
                        <tr>
                            <th class="px-5 py-3 text-left">Amount</th>
                            <th class="px-5 py-3 text-left">Method</th>
                            <th class="px-5 py-3 text-left">Status</th>
                            <th class="px-5 py-3 text-left">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="!data.recent_payouts.length"><td colspan="4" class="px-5 py-8 text-center text-black/40">No payouts yet.</td></tr>
                        <tr v-for="p in data.recent_payouts" :key="p.id" class="border-t border-gold/5">
                            <td class="px-5 py-3 font-semibold">{{ p.amount }}</td>
                            <td class="px-5 py-3 capitalize">{{ p.method.replace('_', ' ') }}</td>
                            <td class="px-5 py-3">{{ p.status }}</td>
                            <td class="px-5 py-3 text-black/55 text-xs">{{ fmtDate(p.created_at) }}</td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    </div>
</template>
