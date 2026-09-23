<script>
import { api } from '../../lib/api.js';
import { toast, toastError } from '../../lib/dialog.js';

/**
 * Payment gateways. Two tables: which gateways are ON, and which payment
 * method (as the customer thinks of it) goes to which gateway. What the
 * customer will see is worked out from those and previewed below.
 */
export default {
    name: 'AdminPayments',
    data() { return { settings: null, methods: [], preview: [], recent: [], pendingCount: 0, loading: true, saving: false, reconciling: false }; },
    computed: {
        gatewayList() { return this.settings ? Object.values(this.settings.gateways) : []; },
    },
    mounted() { this.load(); },
    methods: {
        async load() {
            try { this.apply(await api.get('/api/admin/payments')); }
            catch (e) { toastError(e); }
            finally { this.loading = false; }
        },
        apply(d) { this.settings = d.settings; this.methods = d.methods; this.preview = d.preview; if (d.recent) { this.recent = d.recent; this.pendingCount = d.pending_count; } },
        /** Gateways that could take this method right now. */
        choicesFor(methodId) { return this.gatewayList.filter((g) => g.enabled && g.methods.includes(methodId)); },
        async save() {
            this.saving = true;
            try {
                const gateways = {}; for (const g of this.gatewayList) gateways[g.id] = { enabled: g.enabled };
                this.apply(await api.put('/api/admin/payments', { gateways, routes: this.settings.routes, tax: this.settings.tax }));
                toast('Payment settings saved');
            } catch (e) { toastError(e); await this.load(); }
            finally { this.saving = false; }
        },
        toggleGateway(g) {
            g.enabled = !g.enabled;
            // Switching a gateway off takes its routes with it, so the table never points at nothing.
            if (!g.enabled) for (const m of Object.keys(this.settings.routes)) if (this.settings.routes[m] === g.id) this.settings.routes[m] = null;
        },
        async reconcile() {
            this.reconciling = true;
            try { const r = await api.post('/api/admin/payments/reconcile'); toast(`Checked ${r.checked} pending · ${r.settled} settled`); await this.load(); }
            catch (e) { toastError(e); }
            finally { this.reconciling = false; }
        },
        when(iso) { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); },
        tone(s) { return { paid: 'bg-emerald-100 text-emerald-700', pending: 'bg-amber-100 text-amber-800', failed: 'bg-red-100 text-red-700', cancelled: 'bg-zinc-100 text-zinc-600' }[s] || 'bg-zinc-100'; },
    },
};
</script>

<template>
    <div class="px-4 sm:px-8 py-8 max-w-[1100px]">
        <header class="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
                <h1 class="text-3xl font-serif">Payments</h1>
                <p class="text-sm text-zinc-500 mt-1">Which gateways take money, and which way of paying goes to which gateway.</p>
            </div>
            <button @click="save" :disabled="saving || loading" class="px-5 py-2 text-sm bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50">{{ saving ? 'Saving…' : 'Save changes' }}</button>
        </header>

        <p v-if="loading" class="text-sm text-zinc-500 py-10">Loading…</p>
        <template v-else>
            <!-- Gateways -->
            <section class="bg-white border border-zinc-200 mb-6">
                <h2 class="px-4 py-3 border-b border-zinc-200 text-xs tracking-widest uppercase text-zinc-500">Gateways</h2>
                <div v-for="g in gatewayList" :key="g.id" class="flex flex-wrap items-center gap-4 px-4 py-4 border-b border-zinc-100 last:border-0">
                    <label class="flex items-center gap-3 min-w-[12rem]">
                        <input type="checkbox" :checked="g.enabled" :disabled="!g.configured" @change="toggleGateway(g)" class="accent-gold w-4 h-4" />
                        <span class="font-medium">{{ g.label }}</span>
                    </label>
                    <span :class="['text-[10px] tracking-widest uppercase px-2 py-1', g.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500']">{{ g.configured ? 'Credentials set' : 'No credentials' }}</span>
                    <span class="text-xs text-zinc-500">{{ g.mode === 'hosted' ? 'Hosted page — the customer chooses the method there' : 'Direct — we take the method and phone number' }}</span>
                    <span class="text-xs text-zinc-500 ml-auto">Takes: {{ g.methods.map((m) => methods.find((x) => x.id === m)?.label || m).join(', ') }}</span>
                    <p v-if="!g.configured" class="w-full text-xs text-zinc-500">Add its keys to the environment (see <code>.env.example</code>) and it can be switched on.</p>
                </div>
            </section>

            <!-- Tax shown to customers -->
            <section class="bg-white border border-zinc-200 mb-6">
                <h2 class="px-4 py-3 border-b border-zinc-200 text-xs tracking-widest uppercase text-zinc-500">Tax</h2>
                <div class="p-4 space-y-3">
                    <label class="flex items-center gap-3">
                        <input type="checkbox" v-model="settings.tax.enabled" class="accent-gold w-4 h-4" />
                        <span class="text-sm font-medium">Tell customers how much {{ settings.tax.label }} is inside the price</span>
                    </label>
                    <div class="flex flex-wrap items-end gap-4">
                        <label class="text-xs text-zinc-500">
                            Rate
                            <span class="flex items-center gap-1 mt-1">
                                <input type="number" step="0.1" min="0" max="100" v-model.number="settings.tax.rate" class="border border-zinc-300 px-3 py-2 w-24 text-sm text-zinc-900" />
                                <span class="text-sm text-zinc-900">%</span>
                            </span>
                        </label>
                        <label class="text-xs text-zinc-500">
                            Called
                            <input v-model="settings.tax.label" maxlength="24" class="block border border-zinc-300 px-3 py-2 w-32 text-sm text-zinc-900 mt-1" />
                        </label>
                    </div>
                    <p class="text-xs text-zinc-500 max-w-3xl">
                        Zimbabwe requires prices quoted to the public to already include VAT, so this only <strong>discloses</strong> the tax inside a price — it never adds to what a customer pays.
                        The standard rate is 15.5% from 1 January 2026 (Finance Act 2025). Only switch it on if BLESSLUXE is VAT-registered, which is required once turnover passes US$25,000 in any 12 months.
                    </p>
                </div>
            </section>

            <!-- Routing -->
            <section class="bg-white border border-zinc-200 mb-6">
                <h2 class="px-4 py-3 border-b border-zinc-200 text-xs tracking-widest uppercase text-zinc-500">Where each way of paying goes</h2>
                <div class="overflow-x-auto"><table class="w-full text-sm">
                    <tbody>
                        <tr v-for="m in methods" :key="m.id" class="border-b border-zinc-100 last:border-0">
                            <td class="px-4 py-3"><span class="font-medium">{{ m.label }}</span><span class="block text-xs text-zinc-500">{{ m.hint }}</span></td>
                            <td class="px-4 py-3 text-right">
                                <select v-model="settings.routes[m.id]" class="border border-zinc-300 px-3 py-2 bg-white min-w-[14rem]">
                                    <option :value="null">Off — not offered</option>
                                    <option v-for="g in choicesFor(m.id)" :key="g.id" :value="g.id">{{ g.label }}</option>
                                </select>
                                <p v-if="!choicesFor(m.id).length" class="text-[11px] text-zinc-400 mt-1">No switched-on gateway takes this.</p>
                            </td>
                        </tr>
                    </tbody>
                </table></div>
                <p class="px-4 py-3 text-xs text-zinc-500 border-t border-zinc-100">Everyone on one gateway? Point every row at it. Split by method (say EcoCash through one, cards through another) by choosing per row. The preview below updates when you save.</p>
            </section>

            <!-- Preview -->
            <section class="bg-white border border-zinc-200 mb-6">
                <h2 class="px-4 py-3 border-b border-zinc-200 text-xs tracking-widest uppercase text-zinc-500">What customers see at checkout (saved settings)</h2>
                <p v-if="!preview.length" class="px-4 py-6 text-sm text-red-700">Nothing — customers can't pay. Switch a gateway on and route at least one method to it.</p>
                <ul v-else class="divide-y divide-zinc-100">
                    <li v-for="o in preview" :key="o.id" class="px-4 py-3 flex items-start gap-3">
                        <span class="w-4 h-4 mt-0.5 border-2 border-zinc-400 flex-shrink-0"></span>
                        <span><span class="block text-sm font-medium">{{ o.label }}</span><span class="block text-xs text-zinc-500">{{ o.hint }}</span><span v-if="o.needs.includes('phone')" class="block text-[11px] text-zinc-400">asks for a phone number</span></span>
                    </li>
                </ul>
            </section>

            <!-- Recent -->
            <section class="bg-white border border-zinc-200">
                <div class="px-4 py-3 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2">
                    <h2 class="text-xs tracking-widest uppercase text-zinc-500">Recent payments</h2>
                    <button @click="reconcile" :disabled="reconciling" class="text-xs px-3 py-1.5 border border-zinc-300 hover:bg-zinc-50 disabled:opacity-50">{{ reconciling ? 'Checking…' : `Check ${pendingCount} pending with the gateways` }}</button>
                </div>
                <div class="overflow-x-auto"><table class="w-full text-sm">
                    <thead class="text-left text-xs text-zinc-500 border-b border-zinc-200"><tr><th class="p-3">Reference</th><th class="p-3">Gateway ref</th><th class="p-3">Gateway</th><th class="p-3">Method</th><th class="p-3">Kind</th><th class="p-3">Amount</th><th class="p-3">Status</th><th class="p-3">When</th></tr></thead>
                    <tbody>
                        <tr v-if="!recent.length"><td colspan="8" class="p-6 text-center text-zinc-500">No payments yet.</td></tr>
                        <tr v-for="s in recent" :key="s.reference" class="border-b border-zinc-100 last:border-0">
                            <td class="p-3 font-mono text-xs"><router-link v-if="s.order_id" :to="`/admin/orders/${s.order_id}`" class="underline underline-offset-2">{{ s.reference }}</router-link><template v-else>{{ s.reference }}</template></td>
                            <td class="p-3 font-mono text-xs select-all">{{ s.provider_reference || '—' }}</td>
                            <td class="p-3 capitalize">{{ s.provider }}</td>
                            <td class="p-3">{{ s.method || '—' }}</td>
                            <td class="p-3">{{ s.kind }}</td>
                            <td class="p-3">{{ s.amount_label }}</td>
                            <td class="p-3"><span :class="['text-[10px] tracking-widest uppercase px-2 py-1', tone(s.status)]">{{ s.status }}</span><span v-if="s.provider_status" class="block text-[11px] text-zinc-400 mt-0.5">{{ s.provider_status }}</span></td>
                            <td class="p-3 whitespace-nowrap text-zinc-500">{{ when(s.created_at) }}</td>
                        </tr>
                    </tbody>
                </table></div>
            </section>
        </template>
    </div>
</template>
