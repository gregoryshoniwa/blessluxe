<script>
import { api } from '../../lib/api.js';

export default {
    name: 'AdminReports',
    data() {
        const today = new Date();
        const past = new Date();
        past.setDate(today.getDate() - 30);
        return {
            from: past.toISOString().slice(0, 10),
            to:   today.toISOString().slice(0, 10),
            sales: null,
            customers: null,
            affiliates: null,
            loading: false,
            error: '',
            adviceTopic: 'inventory',
            adviceText: '',
            adviceLoading: false,
            adviceError: '',
        };
    },
    computed: {
        rangeQuery() {
            return `from=${this.from}&to=${this.to}`;
        },
        salesDailyMax() {
            if (!this.sales?.daily?.length) return 1;
            return Math.max(...this.sales.daily.map((d) => d.revenue)) || 1;
        },
    },
    async mounted() {
        await this.refresh();
    },
    methods: {
        async refresh() {
            this.loading = true;
            this.error = '';
            try {
                const [s, c, a] = await Promise.all([
                    api.get(`/api/admin/reports/sales?${this.rangeQuery}`),
                    api.get(`/api/admin/reports/customers?${this.rangeQuery}`),
                    api.get(`/api/admin/reports/affiliates?${this.rangeQuery}`),
                ]);
                this.sales = s;
                this.customers = c;
                this.affiliates = a;
            } catch (e) {
                this.error = e?.message || 'Could not load reports.';
            } finally {
                this.loading = false;
            }
        },
        download(kind) {
            const url = `/api/admin/exports/${kind}?${this.rangeQuery}`;
            window.open(url, '_blank');
        },
        async getAdvice() {
            this.adviceLoading = true;
            this.adviceError = '';
            try {
                const context = {
                    range: this.rangeQuery,
                    sales: this.sales?.summary || {},
                    daily: this.sales?.daily || [],
                    top_products: this.sales?.top_products || [],
                    customers: this.customers?.summary || {},
                    top_affiliates: this.affiliates?.top || [],
                };
                const r = await api.post('/api/admin/ai/advise', { topic: this.adviceTopic, context });
                this.adviceText = r.text || '';
            } catch (e) {
                this.adviceError = e.payload?.error || 'Could not get advice.';
            } finally {
                this.adviceLoading = false;
            }
        },
    },
};
</script>

<template>
    <div class="px-8 py-8 max-w-[1400px]">
        <header class="mb-8 flex items-end justify-between gap-6 flex-wrap">
            <div>
                <h1 class="text-3xl font-serif">Reports &amp; Exports</h1>
                <p class="text-sm text-zinc-500 mt-1">Sales, customers, affiliates — and CSV downloads.</p>
            </div>
            <div class="flex items-end gap-3">
                <label class="block">
                    <span class="text-[10px] tracking-widest uppercase text-zinc-500">From</span>
                    <input type="date" v-model="from" class="block mt-1 border border-zinc-300 px-3 py-1.5 text-sm" />
                </label>
                <label class="block">
                    <span class="text-[10px] tracking-widest uppercase text-zinc-500">To</span>
                    <input type="date" v-model="to" class="block mt-1 border border-zinc-300 px-3 py-1.5 text-sm" />
                </label>
                <button @click="refresh" :disabled="loading" class="bg-black text-white px-5 py-2 text-xs tracking-widest uppercase hover:bg-gold transition-colors disabled:opacity-50">
                    {{ loading ? 'Loading…' : 'Refresh' }}
                </button>
            </div>
        </header>

        <p v-if="error" class="mb-6 p-4 bg-red-50 border border-red-200 text-sm text-red-700">{{ error }}</p>

        <!-- Sales summary cards -->
        <section v-if="sales" class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
            <article class="border border-zinc-200 p-4">
                <p class="text-[10px] tracking-widest uppercase text-zinc-500">Orders</p>
                <p class="text-2xl font-serif mt-1">{{ sales.summary.orders }}</p>
            </article>
            <article class="border border-zinc-200 p-4">
                <p class="text-[10px] tracking-widest uppercase text-zinc-500">Revenue</p>
                <p class="text-2xl font-serif mt-1">{{ sales.summary.revenue_label }}</p>
            </article>
            <article class="border border-zinc-200 p-4">
                <p class="text-[10px] tracking-widest uppercase text-zinc-500">AOV</p>
                <p class="text-2xl font-serif mt-1">{{ sales.summary.aov_label }}</p>
            </article>
            <article class="border border-zinc-200 p-4">
                <p class="text-[10px] tracking-widest uppercase text-zinc-500">Subtotal</p>
                <p class="text-2xl font-serif mt-1">{{ sales.summary.subtotal_label }}</p>
            </article>
            <article class="border border-zinc-200 p-4">
                <p class="text-[10px] tracking-widest uppercase text-zinc-500">Discounts</p>
                <p class="text-2xl font-serif mt-1">{{ sales.summary.discount_label }}</p>
            </article>
        </section>

        <!-- Daily sparkline + Top products -->
        <section v-if="sales" class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div class="lg:col-span-2 border border-zinc-200 p-5">
                <h2 class="text-sm tracking-widest uppercase font-semibold mb-4">Daily revenue</h2>
                <div v-if="sales.daily.length" class="flex items-end gap-1 h-44">
                    <div v-for="d in sales.daily" :key="d.day" class="flex-1 group relative flex flex-col items-center">
                        <div
                            class="w-full bg-gold hover:bg-amber-700 transition-colors"
                            :style="{ height: ((d.revenue / salesDailyMax) * 100) + '%' }"
                        ></div>
                        <span class="absolute -top-7 text-[10px] bg-black text-white px-1.5 py-0.5 opacity-0 group-hover:opacity-100 whitespace-nowrap">
                            {{ d.day }} · {{ d.revenue_label }}
                        </span>
                    </div>
                </div>
                <p v-else class="text-sm text-zinc-500">No paid orders in this range.</p>
            </div>
            <div class="border border-zinc-200 p-5">
                <h2 class="text-sm tracking-widest uppercase font-semibold mb-4">Top products</h2>
                <ul v-if="sales.top_products.length" class="space-y-2 text-sm">
                    <li v-for="p in sales.top_products" :key="p.product_id" class="flex justify-between gap-3">
                        <span class="truncate">{{ p.title }}</span>
                        <span class="text-zinc-500 whitespace-nowrap">{{ p.units }} · {{ p.revenue_label }}</span>
                    </li>
                </ul>
                <p v-else class="text-sm text-zinc-500">No sales in this range.</p>
            </div>
        </section>

        <!-- Customers + Affiliates -->
        <section class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div v-if="customers" class="border border-zinc-200 p-5">
                <h2 class="text-sm tracking-widest uppercase font-semibold mb-4">Customers</h2>
                <dl class="grid grid-cols-3 gap-4">
                    <div>
                        <dt class="text-[10px] tracking-widest uppercase text-zinc-500">New signups</dt>
                        <dd class="text-xl font-serif mt-1">{{ customers.summary.new_signups }}</dd>
                    </div>
                    <div>
                        <dt class="text-[10px] tracking-widest uppercase text-zinc-500">All time</dt>
                        <dd class="text-xl font-serif mt-1">{{ customers.summary.total_customers }}</dd>
                    </div>
                    <div>
                        <dt class="text-[10px] tracking-widest uppercase text-zinc-500">Repeat buyers</dt>
                        <dd class="text-xl font-serif mt-1">{{ customers.summary.repeat_buyers }}</dd>
                    </div>
                </dl>
            </div>
            <div v-if="affiliates" class="border border-zinc-200 p-5">
                <h2 class="text-sm tracking-widest uppercase font-semibold mb-4">Top affiliates</h2>
                <table v-if="affiliates.top.length" class="w-full text-sm">
                    <thead>
                        <tr class="text-[10px] tracking-widest uppercase text-zinc-500 text-left">
                            <th class="py-1">Code</th><th>Sales</th><th class="text-right">Commission</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="a in affiliates.top" :key="a.code" class="border-t border-zinc-100">
                            <td class="py-2 font-mono">{{ a.code }}</td>
                            <td>{{ a.sales }}</td>
                            <td class="text-right">{{ a.commission_label }}</td>
                        </tr>
                    </tbody>
                </table>
                <p v-else class="text-sm text-zinc-500">No affiliate sales in this range.</p>
            </div>
        </section>

        <!-- AI advisor -->
        <section class="border border-zinc-200 p-6 mb-6 bg-gradient-to-br from-amber-50 to-white">
            <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 class="text-sm tracking-widest uppercase font-semibold">LUXE advisor</h2>
                <div class="flex items-center gap-2">
                    <select v-model="adviceTopic" class="border border-zinc-300 px-3 py-1.5 text-sm bg-white">
                        <option value="inventory">Inventory</option>
                        <option value="finance">Finance</option>
                        <option value="campaign">Campaign</option>
                        <option value="general">General</option>
                    </select>
                    <button @click="getAdvice" :disabled="adviceLoading || !sales" class="bg-black text-white px-4 py-2 text-xs tracking-widest uppercase hover:bg-gold transition-colors disabled:opacity-50">
                        {{ adviceLoading ? 'Thinking…' : 'Get advice' }}
                    </button>
                </div>
            </div>
            <p v-if="adviceError" class="mt-3 text-sm text-red-600">{{ adviceError }}</p>
            <pre v-if="adviceText" class="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 font-sans">{{ adviceText }}</pre>
            <p v-else class="text-xs text-zinc-500">Pick a topic and let LUXE analyse the current numbers.</p>
        </section>

        <!-- CSV exports -->
        <section class="border border-zinc-200 p-6">
            <h2 class="text-sm tracking-widest uppercase font-semibold mb-2">CSV exports</h2>
            <p class="text-xs text-zinc-500 mb-4">Orders honour the date range above. Customers and products export everything.</p>
            <div class="flex gap-3 flex-wrap">
                <button @click="download('orders')" class="border border-zinc-300 px-5 py-2 text-xs tracking-widest uppercase hover:bg-zinc-50">
                    Orders ({{ from }} → {{ to }})
                </button>
                <button @click="download('customers')" class="border border-zinc-300 px-5 py-2 text-xs tracking-widest uppercase hover:bg-zinc-50">
                    Customers
                </button>
                <button @click="download('products')" class="border border-zinc-300 px-5 py-2 text-xs tracking-widest uppercase hover:bg-zinc-50">
                    Products
                </button>
            </div>
        </section>
    </div>
</template>
