<script>
import { api } from '../../lib/api.js';
import { confirmDialog, toast } from '../../lib/dialog.js';
import IconButton from './IconButton.vue';
import QuickSeriesForm from './QuickSeriesForm.vue';
import QuickPager from './QuickPager.vue';
import { Plus, Copy, Check, ExternalLink, Pencil, Eye, EyeOff, ArrowLeft, Search } from 'lucide-vue-next';

/**
 * Quick process → Products: single pieces sold one at a time, newest first,
 * with "Add product" top right. The same form as Series (and the same AI
 * reader), in product mode: one list of sizes, stock per size when local.
 */
export default {
    name: 'QuickProductList',
    components: { IconButton, QuickSeriesForm, QuickPager, Plus, Copy, Check, ExternalLink, Pencil, Eye, EyeOff, ArrowLeft, Search },
    data() {
        return {
            rows: [], page: 1, lastPage: 1, total: 0, from: null, to: null, per: 10,
            q: '', status: '', heading: '', origin: '', sourcing: '',
            headings: [], origins: [],
            loading: true, fresh: '', copied: '', busy: '', searchTimer: null,
        };
    },
    computed: {
        adding() { return this.$route.query.new === '1'; },
        filtered() { return !!(this.q || this.status || this.heading || this.origin || this.sourcing); },
    },
    async mounted() {
        this.load();
        try {
            const o = await api.get('/api/admin/quick/series/options');
            this.headings = o.headings || []; this.origins = o.origins || [];
        } catch { /* filters stay empty */ }
    },
    methods: {
        async load(page = 1) {
            this.loading = true;
            try {
                const qs = new URLSearchParams({ page, per: this.per, q: this.q, status: this.status, heading: this.heading, origin: this.origin, sourcing: this.sourcing });
                const d = await api.get(`/api/admin/quick/products?${qs}`);
                Object.assign(this, { rows: d.rows, page: d.page, lastPage: d.last_page, total: d.total, from: d.from, to: d.to });
            } catch { toast('Could not load the products.', { tone: 'error' }); }
            finally { this.loading = false; }
        },
        search() { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.load(1), 300); },
        open(on) { this.$router.push({ query: { ...this.$route.query, new: on ? '1' : undefined } }); },
        onSaved(r) { this.fresh = r.product_id; this.open(false); this.clearFilters(); },
        setPer(n) { this.per = n; this.load(1); },
        clearFilters() { Object.assign(this, { q: '', status: '', heading: '', origin: '', sourcing: '' }); this.load(1); },

        money(c) { return c == null ? '—' : '$' + (c / 100).toFixed(2).replace(/\.00$/, ''); },
        margin(r) { return r.cost && r.price ? Math.round((r.price / r.cost - 1) * 100) + '%' : '—'; },
        async copy(r) {
            try { await navigator.clipboard.writeText(r.link); this.copied = r.id; setTimeout(() => (this.copied = ''), 1500); toast('Link copied'); }
            catch { toast('Could not copy — open it and copy from the address bar.', { tone: 'error' }); }
        },
        /** Publish or hide — the row stays, nothing is deleted. */
        async toggle(r) {
            const next = r.status === 'published' ? 'draft' : 'published';
            if (next === 'draft' && !(await confirmDialog({ title: `Hide "${r.title}"?`, body: 'It comes off the shop until you publish it again. Nothing is deleted.', confirmLabel: 'Hide it' }))) return;
            this.busy = r.id;
            try { await api.put(`/api/admin/products/${r.id}`, { status: next }); r.status = next; toast(next === 'published' ? 'Published — it\'s in the shop' : 'Hidden from the shop'); }
            catch { toast('Could not change that.', { tone: 'error' }); }
            finally { this.busy = ''; }
        },
    },
};
</script>

<template>
    <div v-if="adding">
        <div class="flex items-center gap-2 mb-4">
            <IconButton label="Back to the list" @click="open(false)"><ArrowLeft class="w-4 h-4" /></IconButton>
            <h2 class="text-sm font-semibold">New product</h2>
        </div>
        <QuickSeriesForm mode="product" @saved="onSaved" />
    </div>

    <div v-else>
        <div class="flex items-start gap-2 mb-3">
          <div class="flex-1 min-w-0 flex flex-wrap items-center gap-2">
            <label class="relative w-full sm:w-56">
                <Search class="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input v-model="q" @input="search" placeholder="Search name or supplier" class="w-full border border-zinc-300 pl-8 pr-3 py-2 text-sm" />
            </label>
            <select v-model="heading" @change="load(1)" class="border border-zinc-300 pl-2 pr-7 py-2 text-sm bg-white max-w-[11rem]" aria-label="Department">
                <option value="">All departments</option>
                <option v-for="h in headings" :key="h.id" :value="h.id">{{ h.name }}</option>
            </select>
            <select v-model="sourcing" @change="load(1)" class="border border-zinc-300 pl-2 pr-7 py-2 text-sm bg-white max-w-[11rem]" aria-label="Local or import">
                <option value="">Local and import</option>
                <option value="local">Local · in stock</option>
                <option value="import">Import · no stock</option>
            </select>
            <select v-model="origin" @change="load(1)" class="border border-zinc-300 pl-2 pr-7 py-2 text-sm bg-white max-w-[11rem]" aria-label="Ships from">
                <option value="">From anywhere</option>
                <option v-for="o in origins" :key="o.code" :value="o.code">{{ o.label }}</option>
            </select>
            <select v-model="status" @change="load(1)" class="border border-zinc-300 pl-2 pr-7 py-2 text-sm bg-white max-w-[11rem]" aria-label="Status">
                <option value="">Any status</option>
                <option value="published">Published</option>
                <option value="draft">Hidden / draft</option>
            </select>
            <button v-if="filtered" @click="clearFilters" class="text-xs text-zinc-500 underline hover:text-black">Clear</button>
          </div>
            <button @click="open(true)" class="flex-shrink-0 whitespace-nowrap bg-gold text-white px-4 py-2 text-xs font-semibold tracking-[0.25em] uppercase hover:bg-gold-dark inline-flex items-center gap-1.5">
                <Plus class="w-4 h-4" /> Add product
            </button>
        </div>

        <div class="bg-white border border-zinc-200">
            <table class="w-full text-sm">
                <thead class="text-[10px] tracking-widest uppercase text-zinc-500 border-b border-zinc-200">
                    <tr>
                        <th class="text-left font-medium px-3 py-2">Product</th>
                        <th class="text-left font-medium px-3 py-2">Where</th>
                        <th class="text-left font-medium px-3 py-2">Supplier</th>
                        <th class="text-right font-medium px-3 py-2">Cost</th>
                        <th class="text-right font-medium px-3 py-2">Price</th>
                        <th class="text-right font-medium px-3 py-2">Margin</th>
                        <th class="text-right font-medium px-3 py-2">Stock</th>
                        <th class="text-right font-medium px-3 py-2">Sold</th>
                        <th class="text-left font-medium px-3 py-2">Status</th>
                        <th class="px-3 py-2"><span class="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody v-if="loading && !rows.length">
                    <tr v-for="n in 5" :key="n" class="border-b border-zinc-100"><td colspan="10" class="px-3 py-3"><div class="h-8 bg-zinc-100 animate-pulse"></div></td></tr>
                </tbody>
                <tbody v-else-if="!rows.length">
                    <tr><td colspan="10" class="px-3 py-10 text-center text-zinc-500">
                        {{ filtered ? 'No products match.' : 'No products yet.' }}
                        <button v-if="!filtered" @click="open(true)" class="text-gold-dark underline ml-1">Add the first one</button>
                    </td></tr>
                </tbody>
                <tbody v-else :class="loading && 'opacity-60'">
                    <tr v-for="r in rows" :key="r.id" :class="['border-b border-zinc-100 hover:bg-zinc-50', fresh === r.id && 'bg-gold/5']">
                        <td class="px-3 py-2">
                            <div class="flex items-center gap-2.5 min-w-0">
                                <div class="w-8 h-10 bg-zinc-100 flex-shrink-0 overflow-hidden">
                                    <img v-if="r.thumbnail" :src="r.thumbnail" alt="" class="w-full h-full object-cover object-top" />
                                </div>
                                <div class="min-w-0">
                                    <p class="font-medium truncate max-w-[16rem]" :title="r.title">{{ r.title }}
                                        <span v-if="fresh === r.id" class="ml-1 text-[9px] tracking-widest uppercase bg-gold text-white px-1.5 py-0.5 align-middle">New</span>
                                    </p>
                                    <p class="text-[11px] text-zinc-500">{{ r.sizes }} size{{ r.sizes === 1 ? '' : 's' }} · {{ r.sourcing === 'local' ? 'Local' : 'Import · to order' }}</p>
                                </div>
                            </div>
                        </td>
                        <td class="px-3 py-2 text-xs text-zinc-600 whitespace-nowrap">{{ r.where || '—' }}</td>
                        <td class="px-3 py-2 text-zinc-600 truncate max-w-[10rem]" :title="r.supplier">{{ r.supplier || '—' }}<span v-if="r.origin" class="text-zinc-400"> · {{ r.origin }}</span></td>
                        <td class="px-3 py-2 text-right tabular-nums text-zinc-600">{{ money(r.cost) }}</td>
                        <td class="px-3 py-2 text-right tabular-nums font-medium">{{ money(r.price) }}</td>
                        <td class="px-3 py-2 text-right tabular-nums text-zinc-600">{{ margin(r) }}</td>
                        <td :class="['px-3 py-2 text-right tabular-nums', r.stock === 0 ? 'text-red-600' : 'text-zinc-600']" :title="r.stock === null ? 'Imported to order — no stock kept' : `${r.stock} on the shelf`"><span v-if="r.stock === null" class="text-[10px] tracking-widest uppercase text-zinc-400">No stock</span><template v-else>{{ r.stock }}</template></td>
                        <td class="px-3 py-2 text-right tabular-nums text-zinc-600">{{ r.sold || '—' }}</td>
                        <td class="px-3 py-2">
                            <span :class="['text-[10px] tracking-widest uppercase border px-1.5 py-0.5 whitespace-nowrap', r.status === 'published' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-100 text-zinc-600 border-zinc-200']">{{ r.status === 'published' ? 'Live' : 'Hidden' }}</span>
                        </td>
                        <td class="px-2 py-2">
                            <div class="flex items-center justify-end">
                                <IconButton :label="copied === r.id ? 'Copied' : 'Copy link'" :disabled="r.status !== 'published'" @click="copy(r)"><Check v-if="copied === r.id" class="w-4 h-4 text-emerald-600" /><Copy v-else class="w-4 h-4" /></IconButton>
                                <a :href="r.link" target="_blank" rel="noopener" title="Open the product page" aria-label="Open the product page" class="inline-flex items-center justify-center w-8 h-8 rounded text-zinc-500 hover:text-gold hover:bg-gold/10"><ExternalLink class="w-4 h-4" /></a>
                                <router-link :to="`/admin/products/${r.id}`" title="Edit the product" aria-label="Edit the product" class="inline-flex items-center justify-center w-8 h-8 rounded text-zinc-500 hover:text-gold hover:bg-gold/10"><Pencil class="w-4 h-4" /></router-link>
                                <IconButton :label="r.status === 'published' ? 'Hide from the shop' : 'Publish'" :tone="r.status === 'published' ? 'warning' : 'positive'" :disabled="busy === r.id" @click="toggle(r)">
                                    <EyeOff v-if="r.status === 'published'" class="w-4 h-4" /><Eye v-else class="w-4 h-4" />
                                </IconButton>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
            <QuickPager :page="page" :last-page="lastPage" :total="total" :from="from" :to="to" :per="per" @page="load" @per="setPer" />
        </div>
    </div>
</template>
