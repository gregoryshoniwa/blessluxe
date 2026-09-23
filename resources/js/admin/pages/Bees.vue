<script>
import { api } from '../../lib/api.js';
import { Sparkles, TrendingUp, Users, ScrollText } from 'lucide-vue-next';

export default {
    name: 'AdminBees',
    components: { Sparkles, TrendingUp, Users, ScrollText },
    data() {
        return {
            loading: true,
            saving: false,
            saved: false,
            error: '',
            settings: { enabled: true, per_usd: 100, max_discount_percent: 50, earn_per_usd: 10 },
            engagement: { rate: 1, like: 1, comment: 2, daily_cap: 5, min_length: 15, limits: { bees: 100, daily_cap: 50, min_length: 200 } },
            stats: { circulating: 0, customers_with_balance: 0, ledger_rows: 0 },
            ledger: [],
        };
    },
    computed: {
        sampleDiscountOnHundred() {
            // What a customer can save on a $100 order at max policy.
            if (!this.settings.per_usd) return 0;
            const maxCents = 10000 * this.settings.max_discount_percent / 100;
            return (maxCents / 100).toFixed(2);
        },
        sampleEarnOnHundred() {
            // Bees earned on a $100 order at the current rate.
            return Math.floor(100 * this.settings.earn_per_usd);
        },
        /** The most one customer can earn from speaking up in a day, in dollars. */
        engagementWorstDay() {
            const per = this.settings.per_usd || 100;
            const dearest = Math.max(this.engagement.rate, this.engagement.like, this.engagement.comment);

            return ((dearest * this.engagement.daily_cap) / per).toFixed(2);
        },
    },
    async mounted() {
        await this.fetchAll();
    },
    methods: {
        async fetchAll() {
            this.loading = true;
            try {
                const d = await api.get('/api/admin/bees');
                this.settings = d.settings;
                if (d.engagement) this.engagement = d.engagement;
                this.stats = d.stats;
                this.ledger = d.recent_ledger;
            } finally { this.loading = false; }
        },
        async save() {
            this.saving = true;
            this.error = '';
            this.saved = false;
            try {
                const d = await api.put('/api/admin/bees', { ...this.settings, engagement: this.engagement });
                this.settings = d.settings;
                if (d.engagement) this.engagement = d.engagement;
                this.saved = true;
                setTimeout(() => { this.saved = false; }, 1800);
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not save.';
            } finally {
                this.saving = false;
            }
        },
        fmtDate(iso) { return iso ? new Date(iso).toLocaleString() : '—'; },
        ledgerLabel(reason) {
            const map = {
                checkout_redeem: 'Spent at checkout',
                order_earn: 'Earned on order',
                admin_adjustment: 'Admin adjustment',
                checkout_cancel_refund: 'Refund (cancelled)',
                checkout_zero_total_refund: 'Refund (zero-total)',
            };
            return map[reason] || reason.replace(/_/g, ' ');
        },
    },
};
</script>

<template>
    <div>
        <header class="mb-8">
            <p class="text-xs tracking-widest uppercase text-zinc-500">Loyalty</p>
            <h1 class="text-2xl font-semibold flex items-center gap-2"><Sparkles class="w-5 h-5 text-gold" /> Bees</h1>
        </header>

        <div v-if="loading" class="text-zinc-400 text-sm">Loading…</div>

        <div v-else>
            <!-- Stats -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div class="bg-white border border-zinc-200 p-5">
                    <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2 flex items-center gap-1"><TrendingUp class="w-3 h-3" /> Bees in circulation</p>
                    <p class="text-3xl font-semibold">{{ stats.circulating.toLocaleString() }}</p>
                    <p class="text-xs text-zinc-500 mt-1">≈ ${{ (stats.circulating / (settings.per_usd || 1)).toFixed(2) }} of latent discount</p>
                </div>
                <div class="bg-white border border-zinc-200 p-5">
                    <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2 flex items-center gap-1"><Users class="w-3 h-3" /> Customers with balance</p>
                    <p class="text-3xl font-semibold">{{ stats.customers_with_balance.toLocaleString() }}</p>
                </div>
                <div class="bg-white border border-zinc-200 p-5">
                    <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2 flex items-center gap-1"><ScrollText class="w-3 h-3" /> Ledger rows</p>
                    <p class="text-3xl font-semibold">{{ stats.ledger_rows.toLocaleString() }}</p>
                </div>
            </div>

            <!-- Settings -->
            <section class="bg-white border border-zinc-200 p-5 mb-8">
                <h2 class="font-semibold mb-3">Settings</h2>
                <div class="grid grid-cols-2 gap-4">
                    <label class="flex flex-col gap-1">
                        <span class="text-xs tracking-widest uppercase text-zinc-500">Master switch</span>
                        <label class="flex items-center gap-2 mt-2">
                            <input type="checkbox" v-model="settings.enabled" class="accent-gold" />
                            <span class="text-sm">{{ settings.enabled ? 'Enabled' : 'Disabled' }}</span>
                        </label>
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-xs tracking-widest uppercase text-zinc-500">Bees per US dollar</span>
                        <input v-model.number="settings.per_usd" type="number" min="1" max="10000" class="border border-zinc-300 px-3 py-2 font-mono" />
                        <span class="text-xs text-zinc-500">e.g. 100 means 100 Bees = $1</span>
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-xs tracking-widest uppercase text-zinc-500">Max discount per order (%)</span>
                        <input v-model.number="settings.max_discount_percent" type="number" min="0" max="100" step="0.5" class="border border-zinc-300 px-3 py-2 font-mono" />
                        <span class="text-xs text-zinc-500">On a $100 order: up to ${{ sampleDiscountOnHundred }} can be paid in Bees</span>
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-xs tracking-widest uppercase text-zinc-500">Earn per US dollar spent</span>
                        <input v-model.number="settings.earn_per_usd" type="number" min="0" max="1000" step="0.5" class="border border-zinc-300 px-3 py-2 font-mono" />
                        <span class="text-xs text-zinc-500">$100 order earns {{ sampleEarnOnHundred }} Bees</span>
                    </label>
                </div>
                <h2 class="font-semibold mt-8 mb-1">Speaking up about a piece</h2>
                <p class="text-xs text-zinc-500 mb-3 max-w-3xl">
                    What a customer earns for rating, hearting or reviewing a product. Paid once per customer per piece per action, for ever — re-rating,
                    unhearting and hearting again, or deleting and re-posting a review all earn nothing. The daily limit is the real brake: at these
                    settings the most one customer can earn in a day is <strong>${{ engagementWorstDay }}</strong>.
                </p>
                <div class="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <label class="flex flex-col gap-1">
                        <span class="text-xs tracking-widest uppercase text-zinc-500">Bees for a rating</span>
                        <input v-model.number="engagement.rate" type="number" min="0" :max="engagement.limits.bees" class="border border-zinc-300 px-3 py-2 font-mono" />
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-xs tracking-widest uppercase text-zinc-500">Bees for a heart</span>
                        <input v-model.number="engagement.like" type="number" min="0" :max="engagement.limits.bees" class="border border-zinc-300 px-3 py-2 font-mono" />
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-xs tracking-widest uppercase text-zinc-500">Bees for a review</span>
                        <input v-model.number="engagement.comment" type="number" min="0" :max="engagement.limits.bees" class="border border-zinc-300 px-3 py-2 font-mono" />
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-xs tracking-widest uppercase text-zinc-500">Paid actions per day</span>
                        <input v-model.number="engagement.daily_cap" type="number" min="0" :max="engagement.limits.daily_cap" class="border border-zinc-300 px-3 py-2 font-mono" />
                        <span class="text-xs text-zinc-500">0 stops paying; people can still rate and review</span>
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-xs tracking-widest uppercase text-zinc-500">Shortest review</span>
                        <input v-model.number="engagement.min_length" type="number" min="1" :max="engagement.limits.min_length" class="border border-zinc-300 px-3 py-2 font-mono" />
                        <span class="text-xs text-zinc-500">characters, before it counts at all</span>
                    </label>
                </div>

                <p v-if="error" class="text-sm text-red-600 mt-3">{{ error }}</p>
                <div class="flex items-center justify-end gap-3 mt-4">
                    <span v-if="saved" class="text-sm text-emerald-600">Saved ✓</span>
                    <button @click="save" :disabled="saving" class="bg-gold text-white px-5 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50">
                        {{ saving ? 'Saving…' : 'Save Settings' }}
                    </button>
                </div>
            </section>

            <!-- Recent ledger -->
            <section class="bg-white border border-zinc-200">
                <header class="px-5 py-3 border-b border-zinc-200">
                    <h2 class="font-semibold">Recent ledger</h2>
                </header>
                <table class="w-full text-sm">
                    <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                        <tr>
                            <th class="px-5 py-3 text-left">Customer</th>
                            <th class="px-5 py-3 text-left">Reason</th>
                            <th class="px-5 py-3 text-right">Delta</th>
                            <th class="px-5 py-3 text-right">Balance</th>
                            <th class="px-5 py-3 text-left">Reference</th>
                            <th class="px-5 py-3 text-left">When</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="!ledger.length"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">No ledger activity yet.</td></tr>
                        <tr v-for="e in ledger" :key="e.id" class="border-t border-zinc-100">
                            <td class="px-5 py-3 font-mono text-xs">{{ e.customer_id }}</td>
                            <td class="px-5 py-3">{{ ledgerLabel(e.reason) }}</td>
                            <td :class="['px-5 py-3 text-right font-medium', e.delta > 0 ? 'text-emerald-600' : 'text-red-600']">
                                {{ e.delta > 0 ? '+' : '' }}{{ e.delta }}
                            </td>
                            <td class="px-5 py-3 text-right">{{ e.balance_after }}</td>
                            <td class="px-5 py-3 font-mono text-xs">{{ e.reference || '—' }}</td>
                            <td class="px-5 py-3 text-zinc-500 text-xs">{{ fmtDate(e.created_at) }}</td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    </div>
</template>
