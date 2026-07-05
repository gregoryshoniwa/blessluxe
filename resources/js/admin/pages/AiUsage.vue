<script>
import { api } from '../../lib/api.js';

/**
 * AI Usage & Costs — estimated Google AI spend across every surface
 * (Show Room tools, LUXE agent, admin studio). Groundwork for billing
 * customers for AI tool usage.
 */
export default {
    name: 'AdminAiUsage',
    data() {
        return {
            loading: true,
            data: null,
        };
    },
    mounted() { this.fetch(); },
    methods: {
        async fetch() {
            this.loading = true;
            try {
                this.data = await api.get('/api/admin/ai-usage');
            } finally {
                this.loading = false;
            }
        },
        money(v) { return '$' + Number(v || 0).toFixed(2); },
        moneyFine(v) { return '$' + Number(v || 0).toFixed(4); },
        when(iso) { return iso ? new Date(iso).toLocaleString() : '—'; },
    },
};
</script>

<template>
    <div>
        <header class="flex items-center justify-between mb-8">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">Insights</p>
                <h1 class="text-2xl font-semibold">AI Usage & Costs</h1>
            </div>
            <button @click="fetch" class="border border-gold text-gold px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold hover:text-white">Refresh</button>
        </header>

        <div v-if="loading" class="text-zinc-400 text-sm">Loading…</div>

        <template v-else-if="data">
            <!-- Totals -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div v-for="(t, label) in { Today: data.totals.today, 'Last 7 days': data.totals.week, 'Last 30 days': data.totals.month, 'All time': data.totals.all }" :key="label" class="bg-white border border-zinc-200 p-5">
                    <p class="text-[10px] tracking-widest uppercase text-zinc-500">{{ label }}</p>
                    <p class="text-2xl font-semibold mt-1">{{ money(t.cost) }}</p>
                    <p class="text-xs text-zinc-500 mt-1">{{ t.calls }} call{{ t.calls === 1 ? '' : 's' }}</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <!-- By surface -->
                <div class="bg-white border border-zinc-200">
                    <p class="px-5 py-3 text-xs tracking-widest uppercase text-zinc-500 border-b border-zinc-100">By feature (30 days)</p>
                    <table class="w-full text-sm">
                        <tbody>
                            <tr v-if="!data.by_surface.length"><td class="px-5 py-6 text-center text-zinc-400">No usage yet.</td></tr>
                            <tr v-for="r in data.by_surface" :key="r.surface" class="border-t border-zinc-100">
                                <td class="px-5 py-2.5 font-medium capitalize">{{ r.surface }}</td>
                                <td class="px-5 py-2.5 text-zinc-500">{{ r.calls }} calls</td>
                                <td class="px-5 py-2.5 text-right font-mono">{{ money(r.cost) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- By kind + rates -->
                <div class="space-y-6">
                    <div class="bg-white border border-zinc-200">
                        <p class="px-5 py-3 text-xs tracking-widest uppercase text-zinc-500 border-b border-zinc-100">By media type (30 days)</p>
                        <table class="w-full text-sm">
                            <tbody>
                                <tr v-if="!data.by_kind.length"><td class="px-5 py-6 text-center text-zinc-400">No usage yet.</td></tr>
                                <tr v-for="r in data.by_kind" :key="r.kind" class="border-t border-zinc-100">
                                    <td class="px-5 py-2.5 font-medium capitalize">{{ r.kind }}</td>
                                    <td class="px-5 py-2.5 text-zinc-500">{{ r.calls }} calls · {{ r.units }} units</td>
                                    <td class="px-5 py-2.5 text-right font-mono">{{ money(r.cost) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="bg-white border border-zinc-200 p-5 text-xs text-zinc-500 leading-relaxed">
                        <p class="text-[10px] tracking-widest uppercase text-zinc-500 mb-2">Estimate rates (override in .env)</p>
                        <p>Image: <span class="font-mono text-zinc-800">{{ moneyFine(data.rates.image) }}</span> / render (<code>AI_COST_IMAGE</code>)</p>
                        <p>Video: <span class="font-mono text-zinc-800">{{ moneyFine(data.rates.video_per_sec) }}</span> / second (<code>AI_COST_VIDEO_PER_SEC</code>)</p>
                        <p>Text: <span class="font-mono text-zinc-800">{{ moneyFine(data.rates.text_call) }}</span> / call (<code>AI_COST_TEXT_CALL</code>)</p>
                    </div>
                </div>
            </div>

            <!-- Top customers -->
            <div class="bg-white border border-zinc-200 mb-8">
                <p class="px-5 py-3 text-xs tracking-widest uppercase text-zinc-500 border-b border-zinc-100">Top customers by AI spend (30 days)</p>
                <table class="w-full text-sm">
                    <thead class="bg-zinc-50 text-[10px] tracking-widest uppercase text-zinc-500">
                        <tr>
                            <th class="px-5 py-2 text-left">Customer</th>
                            <th class="px-5 py-2 text-left">Calls</th>
                            <th class="px-5 py-2 text-right">Est. cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="!data.top_customers.length"><td colspan="3" class="px-5 py-6 text-center text-zinc-400">No customer-attributed usage yet.</td></tr>
                        <tr v-for="r in data.top_customers" :key="r.customer_id" class="border-t border-zinc-100">
                            <td class="px-5 py-2.5">
                                <span class="font-medium">{{ r.name || '—' }}</span>
                                <span class="text-zinc-500 text-xs ml-2">{{ r.email || r.customer_id }}</span>
                            </td>
                            <td class="px-5 py-2.5 text-zinc-500">{{ r.calls }}</td>
                            <td class="px-5 py-2.5 text-right font-mono">{{ money(r.cost) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Recent activity -->
            <div class="bg-white border border-zinc-200">
                <p class="px-5 py-3 text-xs tracking-widest uppercase text-zinc-500 border-b border-zinc-100">Recent activity</p>
                <table class="w-full text-sm">
                    <thead class="bg-zinc-50 text-[10px] tracking-widest uppercase text-zinc-500">
                        <tr>
                            <th class="px-5 py-2 text-left">When</th>
                            <th class="px-5 py-2 text-left">Feature</th>
                            <th class="px-5 py-2 text-left">Kind</th>
                            <th class="px-5 py-2 text-left">Customer</th>
                            <th class="px-5 py-2 text-right">Est. cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="!data.recent.length"><td colspan="5" class="px-5 py-6 text-center text-zinc-400">No AI calls logged yet — usage appears here as tools are used.</td></tr>
                        <tr v-for="(r, i) in data.recent" :key="i" class="border-t border-zinc-100">
                            <td class="px-5 py-2 text-zinc-500 text-xs whitespace-nowrap">{{ when(r.created_at) }}</td>
                            <td class="px-5 py-2 capitalize">{{ r.surface }}</td>
                            <td class="px-5 py-2 capitalize text-zinc-500">{{ r.kind }}</td>
                            <td class="px-5 py-2 text-zinc-500 text-xs">{{ r.customer || '—' }}</td>
                            <td class="px-5 py-2 text-right font-mono">{{ moneyFine(r.cost) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </template>
    </div>
</template>
