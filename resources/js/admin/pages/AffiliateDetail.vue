<script>
import { api } from '../../lib/api.js';
import IconButton from '../components/IconButton.vue';
import { ArrowLeft, Wallet, ExternalLink } from 'lucide-vue-next';

export default {
    name: 'AdminAffiliateDetail',
    components: { IconButton, ArrowLeft, Wallet, ExternalLink },
    data() {
        return {
            data: null, loading: true, error: '',
            showPayoutForm: false,
            payout: { amount: 0, method: 'bank_transfer', reference: '', notes: '' },
            saving: false,
            saveError: '',
        };
    },
    computed: {
        id() { return this.$route.params.id; },
        shopLink() {
            if (!this.data || typeof window === 'undefined') return '';
            return `${window.location.origin}/affiliate/shop/${this.data.affiliate.code}`;
        },
    },
    mounted() { this.fetchDetail(); },
    methods: {
        async fetchDetail() {
            this.loading = true;
            try {
                this.data = await api.get(`/api/admin/affiliates/${this.id}`);
            } catch (e) {
                this.error = e.payload?.error || 'Affiliate not found.';
            } finally {
                this.loading = false;
            }
        },
        openPayout() {
            this.payout = {
                amount: this.data.pending_balance_raw,  // pre-fill with full pending
                method: 'bank_transfer',
                reference: '',
                notes: '',
            };
            this.showPayoutForm = true;
            this.saveError = '';
        },
        cancelPayout() { this.showPayoutForm = false; this.saveError = ''; },
        async submitPayout() {
            this.saving = true;
            this.saveError = '';
            try {
                await api.post(`/api/admin/affiliates/${this.id}/payouts`, this.payout);
                this.showPayoutForm = false;
                await this.fetchDetail();
            } catch (e) {
                this.saveError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not record payout.';
            } finally {
                this.saving = false;
            }
        },
        fmtDate(iso) { return iso ? new Date(iso).toLocaleString() : '—'; },
        fmtAmount(cents) { return '$' + (cents / 100).toFixed(2); },
    },
};
</script>

<template>
    <div>
        <router-link to="/admin/affiliates" class="text-xs tracking-widest uppercase text-zinc-500 hover:text-gold inline-flex items-center gap-1 mb-4">
            <ArrowLeft class="w-3 h-3" /> All affiliates
        </router-link>

        <div v-if="loading" class="text-zinc-400 text-sm">Loading…</div>

        <div v-else-if="error" class="text-center py-16">
            <h1 class="text-xl font-semibold mb-2">{{ error }}</h1>
            <router-link to="/admin/affiliates" class="text-gold underline">Back</router-link>
        </div>

        <div v-else>
            <!-- Header -->
            <header class="flex items-start justify-between mb-8">
                <div>
                    <p class="text-xs tracking-widest uppercase text-zinc-500">Affiliate</p>
                    <h1 class="text-2xl font-semibold flex items-center gap-3">
                        <span class="font-mono">{{ data.affiliate.code }}</span>
                        <span
                            :class="['text-[10px] px-2 py-1 tracking-widest uppercase', {
                                'bg-emerald-100 text-emerald-700': data.affiliate.status === 'active',
                                'bg-amber-100 text-amber-700': data.affiliate.status === 'pending',
                                'bg-zinc-100 text-zinc-600': data.affiliate.status === 'paused',
                            }]"
                        >{{ data.affiliate.status }}</span>
                    </h1>
                    <p class="text-sm text-zinc-500 mt-1">
                        {{ [data.affiliate.first_name, data.affiliate.last_name].filter(Boolean).join(' ') || data.affiliate.email }}
                        · {{ data.affiliate.email }} · {{ data.affiliate.commission_rate }}% commission
                    </p>
                </div>
                <button
                    @click="openPayout"
                    :disabled="data.pending_balance_raw <= 0"
                    class="bg-gold text-white px-5 py-2 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                    <Wallet class="w-4 h-4" /> Mark Paid
                </button>
            </header>

            <!-- Stats -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div class="bg-white border border-zinc-200 p-5">
                    <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2">Total earnings</p>
                    <p class="text-3xl font-semibold">{{ data.affiliate.total_earnings }}</p>
                </div>
                <div class="bg-white border border-zinc-200 p-5">
                    <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2">Paid out</p>
                    <p class="text-3xl font-semibold">{{ data.affiliate.paid_out }}</p>
                </div>
                <div class="bg-white border-2 border-gold p-5">
                    <p class="text-xs tracking-widest uppercase text-gold-dark mb-2">Pending balance</p>
                    <p class="text-3xl font-semibold text-gold-dark">{{ data.pending_balance }}</p>
                </div>
            </div>

            <!-- Shareable link -->
            <section class="bg-zinc-50 border border-zinc-200 p-5 mb-8">
                <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2">Affiliate share link</p>
                <div class="flex gap-2">
                    <input :value="shopLink" readonly class="flex-1 border border-zinc-200 bg-white px-3 py-2 font-mono text-xs" />
                    <a :href="shopLink" target="_blank" class="border border-zinc-200 px-3 py-2 text-xs tracking-widest uppercase hover:border-gold hover:text-gold inline-flex items-center gap-1">
                        <ExternalLink class="w-3 h-3" /> Open
                    </a>
                    <a :href="`/affiliate/${data.affiliate.code}/dashboard`" target="_blank" class="border border-zinc-200 px-3 py-2 text-xs tracking-widest uppercase hover:border-gold hover:text-gold">
                        Affiliate dashboard
                    </a>
                </div>
            </section>

            <!-- Payout form -->
            <section v-if="showPayoutForm" class="bg-white border border-gold/30 p-5 mb-6">
                <h2 class="font-semibold mb-3">Record a payout</h2>
                <p class="text-xs text-zinc-500 mb-3">
                    Pending balance: <strong>{{ data.pending_balance }}</strong>. Recording marks the oldest pending sales as paid, up to this amount.
                </p>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs tracking-widest uppercase text-zinc-500 mb-1">Amount (cents)</label>
                        <input v-model.number="payout.amount" type="number" min="1" :max="data.pending_balance_raw" class="w-full border border-zinc-300 px-3 py-2 font-mono" />
                        <p class="text-xs text-zinc-500 mt-1">= ${{ (payout.amount / 100).toFixed(2) }}</p>
                    </div>
                    <div>
                        <label class="block text-xs tracking-widest uppercase text-zinc-500 mb-1">Method</label>
                        <select v-model="payout.method" class="w-full border border-zinc-300 px-3 py-2">
                            <option value="bank_transfer">Bank transfer</option>
                            <option value="ecocash">EcoCash</option>
                            <option value="onemoney">OneMoney</option>
                            <option value="cash">Cash</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <input v-model="payout.reference" placeholder="Reference (e.g. transfer #12345)" class="border border-zinc-300 px-3 py-2 col-span-2" />
                    <textarea v-model="payout.notes" placeholder="Notes (optional)" rows="2" class="border border-zinc-300 px-3 py-2 col-span-2"></textarea>
                </div>
                <p v-if="saveError" class="text-sm text-red-600 mt-3">{{ saveError }}</p>
                <div class="flex justify-end gap-2 mt-4">
                    <button @click="cancelPayout" class="px-4 py-2 text-xs tracking-widest uppercase text-zinc-600">Cancel</button>
                    <button @click="submitPayout" :disabled="saving" class="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50">
                        {{ saving ? 'Recording…' : 'Record Payout' }}
                    </button>
                </div>
            </section>

            <!-- Sales -->
            <section class="bg-white border border-zinc-200 mb-8">
                <header class="px-5 py-3 border-b border-zinc-200">
                    <h2 class="font-semibold">Sales</h2>
                </header>
                <table class="w-full text-sm">
                    <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                        <tr>
                            <th class="px-5 py-3 text-left">Order</th>
                            <th class="px-5 py-3 text-left">Order total</th>
                            <th class="px-5 py-3 text-left">Commission</th>
                            <th class="px-5 py-3 text-left">Status</th>
                            <th class="px-5 py-3 text-left">Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="!data.sales.length"><td colspan="5" class="px-5 py-8 text-center text-zinc-400">No sales yet.</td></tr>
                        <tr v-for="s in data.sales" :key="s.id" class="border-t border-zinc-100">
                            <td class="px-5 py-3 font-mono text-xs">{{ s.order_id }}</td>
                            <td class="px-5 py-3">{{ s.order_total }}</td>
                            <td class="px-5 py-3 font-semibold">{{ s.commission_amount }}</td>
                            <td class="px-5 py-3">
                                <span :class="['text-xs px-2 py-0.5 rounded', {
                                    'bg-amber-100 text-amber-700': s.status === 'pending',
                                    'bg-emerald-100 text-emerald-700': s.status === 'paid',
                                    'bg-zinc-100 text-zinc-600': s.status === 'cancelled',
                                }]">{{ s.status }}</span>
                            </td>
                            <td class="px-5 py-3 text-zinc-500 text-xs">{{ fmtDate(s.created_at) }}</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <!-- Payouts -->
            <section class="bg-white border border-zinc-200">
                <header class="px-5 py-3 border-b border-zinc-200">
                    <h2 class="font-semibold">Payouts</h2>
                </header>
                <table class="w-full text-sm">
                    <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                        <tr>
                            <th class="px-5 py-3 text-left">Amount</th>
                            <th class="px-5 py-3 text-left">Method</th>
                            <th class="px-5 py-3 text-left">Reference</th>
                            <th class="px-5 py-3 text-left">Status</th>
                            <th class="px-5 py-3 text-left">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="!data.payouts.length"><td colspan="5" class="px-5 py-8 text-center text-zinc-400">No payouts recorded.</td></tr>
                        <tr v-for="p in data.payouts" :key="p.id" class="border-t border-zinc-100">
                            <td class="px-5 py-3 font-semibold">{{ p.amount }}</td>
                            <td class="px-5 py-3 capitalize">{{ p.method.replace('_', ' ') }}</td>
                            <td class="px-5 py-3 text-xs">{{ p.reference || '—' }}</td>
                            <td class="px-5 py-3">{{ p.status }}</td>
                            <td class="px-5 py-3 text-zinc-500 text-xs">{{ fmtDate(p.created_at) }}</td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    </div>
</template>
