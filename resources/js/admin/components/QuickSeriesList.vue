<script>
import { api } from '../../lib/api.js';
import { confirmDialog, toast } from '../../lib/dialog.js';
import IconButton from './IconButton.vue';
import QuickSeriesForm from './QuickSeriesForm.vue';
import QuickPager from './QuickPager.vue';
import { Plus, Copy, Check, ExternalLink, Pencil, Ban, ArrowLeft, Search, MessageCircle } from 'lucide-vue-next';

const STATUS = {
    open:      ['Open',      'bg-emerald-50 text-emerald-700 border-emerald-200'],
    filled:    ['Filled',    'bg-gold/10 text-gold-dark border-gold/30'],
    closed:    ['Closed',    'bg-zinc-100 text-zinc-600 border-zinc-200'],
    cancelled: ['Cancelled', 'bg-red-50 text-red-700 border-red-200'],
};

/**
 * Quick process → Series: every series in a compact table, newest first, and
 * "Add series" top right. The form opens in place; after publishing you land
 * back here with the new rows marked.
 */
export default {
    name: 'QuickSeriesList',
    components: { IconButton, QuickSeriesForm, QuickPager, Plus, Copy, Check, ExternalLink, Pencil, Ban, ArrowLeft, Search, MessageCircle },
    data() {
        return {
            rows: [], page: 1, lastPage: 1, total: 0, from: null, to: null, per: 10,
            q: '', status: '', heading: '', origin: '',
            headings: [], origins: [],
            loading: true, fresh: [], copied: '', searchTimer: null, statuses: STATUS,
        };
    },
    computed: {
        adding() { return this.$route.query.new === '1'; },
    },
    async mounted() {
        this.load();
        try {
            const o = await api.get('/api/admin/quick/series/options');
            this.headings = o.headings || []; this.origins = o.origins || [];
        } catch { /* the department and origin filters just stay empty */ }
    },
    methods: {
        async load(page = 1) {
            this.loading = true;
            try {
                const qs = new URLSearchParams({ page, per: this.per, q: this.q, status: this.status, heading: this.heading, origin: this.origin });
                const d = await api.get(`/api/admin/quick/series?${qs}`);
                Object.assign(this, { rows: d.rows, page: d.page, lastPage: d.last_page, total: d.total, from: d.from, to: d.to });
            } catch { toast('Could not load the series.', { tone: 'error' }); }
            finally { this.loading = false; }
        },
        search() { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.load(1), 300); },
        open(on) { this.$router.push({ query: { ...this.$route.query, new: on ? '1' : undefined } }); },
        onSaved(r) { this.fresh = r.codes || []; this.open(false); Object.assign(this, { q: '', status: '', heading: '', origin: '' }); this.load(1); },
        setPer(n) { this.per = n; this.load(1); },
        clearFilters() { Object.assign(this, { q: '', status: '', heading: '', origin: '' }); this.load(1); },

        money(c) { return c == null ? '—' : '$' + (c / 100).toFixed(2); },
        margin(r) { return r.cost && r.price ? Math.round((r.price / r.cost - 1) * 100) + '%' : '—'; },
        closes(r) {
            if (!r.expires_at || r.status !== 'open') return '—';
            const days = Math.ceil((new Date(r.expires_at) - Date.now()) / 86400000);
            return days < 0 ? 'Overdue' : days === 0 ? 'Today' : `${days}d`;
        },
        async copy(r) {
            try { await navigator.clipboard.writeText(r.link); this.copied = r.id; setTimeout(() => (this.copied = ''), 1500); toast('Link copied'); }
            catch { toast('Could not copy — open it and copy from the address bar.', { tone: 'error' }); }
        },
        /** The message a group chat needs: what it is, the price, the sizes left, the link. */
        whatsapp(r) {
            const text = `${r.title}\n${this.money(r.price)} a piece · ${r.paid} of ${r.slots} sizes taken\nClaim your size: ${r.link}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        },
        async cancel(r) {
            if (!(await confirmDialog({ title: `Cancel "${r.title}"?`, body: r.paid ? `${r.paid} ${r.paid === 1 ? 'buyer has' : 'buyers have'} paid — they will need refunds.` : 'Nobody has paid yet. It comes off the shop.', confirmLabel: 'Cancel series', tone: 'danger' }))) return;
            try { await api.post(`/api/admin/series/campaigns/${r.id}/cancel`); toast('Series cancelled'); this.load(this.page); }
            catch { toast('Could not cancel that.', { tone: 'error' }); }
        },
    },
};
</script>

<template>
    <!-- Adding: the form, with a way back. -->
    <div v-if="adding">
        <div class="flex items-center gap-2 mb-4">
            <IconButton label="Back to the list" @click="open(false)"><ArrowLeft class="w-4 h-4" /></IconButton>
            <h2 class="text-sm font-semibold">New series</h2>
        </div>
        <QuickSeriesForm @saved="onSaved" />
    </div>

    <div v-else>
        <div class="flex items-start gap-2 mb-3">
          <div class="flex-1 min-w-0 flex flex-wrap items-center gap-2">
            <label class="relative w-full sm:w-56">
                <Search class="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input v-model="q" @input="search" placeholder="Search name, code or supplier" class="w-full border border-zinc-300 pl-8 pr-3 py-2 text-sm" />
            </label>
            <select v-model="heading" @change="load(1)" class="border border-zinc-300 pl-2 pr-7 py-2 text-sm bg-white max-w-[11rem]" aria-label="Department">
                <option value="">All departments</option>
                <option v-for="h in headings" :key="h.id" :value="h.id">{{ h.name }}</option>
            </select>
            <select v-model="origin" @change="load(1)" class="border border-zinc-300 pl-2 pr-7 py-2 text-sm bg-white max-w-[11rem]" aria-label="Ships from">
                <option value="">Ships from anywhere</option>
                <option v-for="o in origins" :key="o.code" :value="o.code">{{ o.label }}</option>
            </select>
            <select v-model="status" @change="load(1)" class="border border-zinc-300 pl-2 pr-7 py-2 text-sm bg-white max-w-[11rem]" aria-label="Status">
                <option value="">Any status</option>
                <option v-for="(s, k) in statuses" :key="k" :value="k">{{ s[0] }}</option>
            </select>
            <button v-if="q || status || heading || origin" @click="clearFilters" class="text-xs text-zinc-500 underline hover:text-black">Clear</button>
          </div>
            <button @click="open(true)" class="flex-shrink-0 whitespace-nowrap bg-gold text-white px-4 py-2 text-xs font-semibold tracking-[0.25em] uppercase hover:bg-gold-dark inline-flex items-center gap-1.5">
                <Plus class="w-4 h-4" /> Add series
            </button>
        </div>

        <div class="bg-white border border-zinc-200">
            <table class="w-full text-sm">
                <thead class="text-[10px] tracking-widest uppercase text-zinc-500 border-b border-zinc-200">
                    <tr>
                        <th class="text-left font-medium px-3 py-2">Series</th>
                        <th class="text-left font-medium px-3 py-2">Supplier</th>
                        <th class="text-right font-medium px-3 py-2">Cost</th>
                        <th class="text-right font-medium px-3 py-2">Price</th>
                        <th class="text-right font-medium px-3 py-2">Margin</th>
                        <th class="text-left font-medium px-3 py-2">Filled</th>
                        <th class="text-left font-medium px-3 py-2">Closes</th>
                        <th class="text-left font-medium px-3 py-2">Status</th>
                        <th class="px-3 py-2"><span class="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody v-if="loading && !rows.length">
                    <tr v-for="n in 5" :key="n" class="border-b border-zinc-100"><td colspan="9" class="px-3 py-3"><div class="h-8 bg-zinc-100 animate-pulse"></div></td></tr>
                </tbody>
                <tbody v-else-if="!rows.length">
                    <tr><td colspan="9" class="px-3 py-10 text-center text-zinc-500">
                        {{ q || status || heading || origin ? 'No series match.' : 'No series yet.' }}
                        <button v-if="!q && !status && !heading && !origin" @click="open(true)" class="text-gold-dark underline ml-1">Add the first one</button>
                    </td></tr>
                </tbody>
                <tbody v-else :class="loading && 'opacity-60'">
                    <tr v-for="r in rows" :key="r.id" :class="['border-b border-zinc-100 hover:bg-zinc-50', fresh.includes(r.code) && 'bg-gold/5']">
                        <td class="px-3 py-2">
                            <div class="flex items-center gap-2.5 min-w-0">
                                <div class="w-8 h-10 bg-zinc-100 flex-shrink-0 overflow-hidden">
                                    <img v-if="r.thumbnail" :src="r.thumbnail" alt="" class="w-full h-full object-cover object-top" />
                                </div>
                                <div class="min-w-0">
                                    <p class="font-medium truncate max-w-[16rem]" :title="r.title">{{ r.title }}
                                        <span v-if="fresh.includes(r.code)" class="ml-1 text-[9px] tracking-widest uppercase bg-gold text-white px-1.5 py-0.5 align-middle">New</span>
                                    </p>
                                    <p class="font-mono text-[11px] text-zinc-500">{{ r.code }}</p>
                                </div>
                            </div>
                        </td>
                        <td class="px-3 py-2 text-zinc-600 truncate max-w-[10rem]" :title="r.supplier">{{ r.supplier || '—' }}<span v-if="r.origin" class="text-zinc-400"> · {{ r.origin }}</span></td>
                        <td class="px-3 py-2 text-right tabular-nums text-zinc-600">{{ money(r.cost) }}</td>
                        <td class="px-3 py-2 text-right tabular-nums font-medium">{{ money(r.price) }}</td>
                        <td class="px-3 py-2 text-right tabular-nums text-zinc-600">{{ margin(r) }}</td>
                        <td class="px-3 py-2">
                            <div class="flex items-center gap-2" :title="`${r.paid} of ${r.slots} sizes paid`">
                                <div class="w-16 h-1.5 bg-zinc-100"><div class="h-full bg-gold" :style="{ width: (r.slots ? (r.paid / r.slots) * 100 : 0) + '%' }"></div></div>
                                <span class="tabular-nums text-xs text-zinc-600">{{ r.paid }}/{{ r.slots }}</span>
                            </div>
                        </td>
                        <td class="px-3 py-2 text-xs text-zinc-600 whitespace-nowrap">{{ closes(r) }}</td>
                        <td class="px-3 py-2"><span :class="['text-[10px] tracking-widest uppercase border px-1.5 py-0.5 whitespace-nowrap', statuses[r.status]?.[1]]">{{ statuses[r.status]?.[0] || r.status }}</span></td>
                        <td class="px-2 py-2">
                            <div class="flex items-center justify-end">
                                <IconButton :label="copied === r.id ? 'Copied' : 'Copy link'" @click="copy(r)"><Check v-if="copied === r.id" class="w-4 h-4 text-emerald-600" /><Copy v-else class="w-4 h-4" /></IconButton>
                                <IconButton label="Share on WhatsApp" tone="positive" :disabled="r.status !== 'open'" @click="whatsapp(r)"><MessageCircle class="w-4 h-4" /></IconButton>
                                <a :href="r.link" target="_blank" rel="noopener" title="Open the series page" aria-label="Open the series page" class="inline-flex items-center justify-center w-8 h-8 rounded text-zinc-500 hover:text-gold hover:bg-gold/10"><ExternalLink class="w-4 h-4" /></a>
                                <router-link v-if="r.product_id" :to="`/admin/products/${r.product_id}`" title="Edit the product" aria-label="Edit the product" class="inline-flex items-center justify-center w-8 h-8 rounded text-zinc-500 hover:text-gold hover:bg-gold/10"><Pencil class="w-4 h-4" /></router-link>
                                <IconButton label="Cancel series" tone="danger" :disabled="r.status !== 'open'" @click="cancel(r)"><Ban class="w-4 h-4" /></IconButton>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
            <QuickPager :page="page" :last-page="lastPage" :total="total" :from="from" :to="to" :per="per" @page="load" @per="setPer" />
        </div>

    </div>
</template>
