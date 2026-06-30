<script>
import { api } from '../../lib/api.js';
import IconButton from '../components/IconButton.vue';
import { Trash2, Rocket, X, ExternalLink, Copy } from 'lucide-vue-next';

export default {
    name: 'AdminPacks',
    components: { IconButton, Trash2, Rocket, X, ExternalLink, Copy },
    data() {
        return {
            tab: 'campaigns',
            definitions: [],
            campaigns: [],
            products: [],
            loading: true,
            showDefForm: false,
            defForm: { title: '', description: '', pack_kind: 'single', product_id: '', product_ids: [], status: 'published' },
            defSaving: false,
            defError: '',
            showLaunchForm: false,
            launchForm: { pack_definition_id: '', title: '', expires_at: '' },
            launchSaving: false,
            launchError: '',
            copiedCode: null,
        };
    },
    mounted() {
        this.fetchAll();
    },
    methods: {
        async fetchAll() {
            this.loading = true;
            try {
                const [d, c, p] = await Promise.all([
                    api.get('/api/admin/packs/definitions'),
                    api.get('/api/admin/packs/campaigns'),
                    api.get('/api/admin/products?limit=60'),
                ]);
                this.definitions = d.definitions;
                this.campaigns   = c.campaigns;
                this.products    = p.products;
            } finally { this.loading = false; }
        },
        publicUrl(code) {
            if (typeof window === 'undefined') return '';
            return `${window.location.origin}/shop/packs/${code}`;
        },
        async copyCode(code) {
            try {
                await navigator.clipboard.writeText(this.publicUrl(code));
                this.copiedCode = code;
                setTimeout(() => { this.copiedCode = null; }, 1500);
            } catch { /* ignore */ }
        },
        startDef() {
            this.defForm = { title: '', description: '', pack_kind: 'single', product_id: '', product_ids: [], status: 'published' };
            this.showDefForm = true; this.defError = '';
        },
        async saveDef() {
            this.defSaving = true; this.defError = '';
            try {
                await api.post('/api/admin/packs/definitions', this.defForm);
                this.showDefForm = false;
                await this.fetchAll();
            } catch (e) {
                this.defError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not save.';
            } finally { this.defSaving = false; }
        },
        async removeDef(d) {
            if (!confirm(`Delete pack "${d.title}"? Open campaigns will be cancelled.`)) return;
            await api.del(`/api/admin/packs/definitions/${d.id}`);
            await this.fetchAll();
        },
        startLaunch(def) {
            this.launchForm = { pack_definition_id: def?.id || this.definitions[0]?.id || '', title: '', expires_at: '' };
            this.showLaunchForm = true; this.launchError = '';
        },
        async launch() {
            this.launchSaving = true; this.launchError = '';
            try {
                await api.post('/api/admin/packs/campaigns', this.launchForm);
                this.showLaunchForm = false;
                this.tab = 'campaigns';
                await this.fetchAll();
            } catch (e) {
                this.launchError = e.payload?.error || 'Could not launch campaign.';
            } finally { this.launchSaving = false; }
        },
        async cancelCampaign(c) {
            if (!confirm(`Cancel campaign ${c.public_code}? Slots will be released.`)) return;
            await api.post(`/api/admin/packs/campaigns/${c.id}/cancel`);
            await this.fetchAll();
        },
    },
};
</script>

<template>
    <div>
        <header class="flex items-center justify-between mb-8">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">Group buy</p>
                <h1 class="text-2xl font-semibold">Packs</h1>
            </div>
            <div class="flex items-center gap-2">
                <button @click="startDef" class="border border-zinc-300 px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:border-gold hover:text-gold">
                    New Definition
                </button>
                <button @click="startLaunch(null)" :disabled="!definitions.length" class="bg-gold text-white px-5 py-2 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark disabled:opacity-40 inline-flex items-center gap-2">
                    <Rocket class="w-4 h-4" /> Launch Campaign
                </button>
            </div>
        </header>

        <!-- Tabs -->
        <div class="flex gap-1 mb-6 text-xs tracking-widest uppercase border-b border-zinc-200">
            <button @click="tab = 'campaigns'" :class="['px-4 py-2', tab === 'campaigns' ? 'border-b-2 border-gold text-gold' : 'text-zinc-500 hover:text-black']">Campaigns</button>
            <button @click="tab = 'definitions'" :class="['px-4 py-2', tab === 'definitions' ? 'border-b-2 border-gold text-gold' : 'text-zinc-500 hover:text-black']">Definitions</button>
        </div>

        <!-- Definition form -->
        <section v-if="showDefForm" class="bg-white border border-gold/30 p-5 mb-6">
            <h2 class="font-semibold mb-3">New pack definition</h2>
            <div class="grid grid-cols-2 gap-3">
                <input v-model="defForm.title" placeholder="Title (e.g. Summer Limited Drop)" class="border border-zinc-300 px-3 py-2 col-span-2" />
                <textarea v-model="defForm.description" placeholder="Description" rows="2" class="border border-zinc-300 px-3 py-2 col-span-2"></textarea>
                <select v-model="defForm.pack_kind" class="border border-zinc-300 px-3 py-2">
                    <option value="single">Single product (slots = variants)</option>
                    <option value="merge">Merge of multiple products</option>
                </select>
                <select v-model="defForm.status" class="border border-zinc-300 px-3 py-2">
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                </select>
                <select v-if="defForm.pack_kind === 'single'" v-model="defForm.product_id" class="border border-zinc-300 px-3 py-2 col-span-2">
                    <option value="" disabled>Select a product</option>
                    <option v-for="p in products" :key="p.id" :value="p.id">{{ p.title }}</option>
                </select>
                <div v-else class="col-span-2">
                    <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2">Products to merge</p>
                    <div class="flex flex-wrap gap-2 max-h-40 overflow-y-auto border border-zinc-200 p-2">
                        <label v-for="p in products" :key="p.id" class="flex items-center gap-1 text-sm border border-zinc-200 px-2 py-1 cursor-pointer">
                            <input type="checkbox" :value="p.id" v-model="defForm.product_ids" /> {{ p.title }}
                        </label>
                    </div>
                </div>
            </div>
            <p v-if="defError" class="text-sm text-red-600 mt-3">{{ defError }}</p>
            <div class="flex justify-end gap-2 mt-4">
                <button @click="showDefForm = false" class="px-4 py-2 text-xs tracking-widest uppercase text-zinc-600">Cancel</button>
                <button @click="saveDef" :disabled="defSaving" class="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50">
                    {{ defSaving ? 'Saving…' : 'Save Definition' }}
                </button>
            </div>
        </section>

        <!-- Launch form -->
        <section v-if="showLaunchForm" class="bg-white border border-gold/30 p-5 mb-6">
            <h2 class="font-semibold mb-3">Launch new campaign</h2>
            <div class="grid grid-cols-2 gap-3">
                <select v-model="launchForm.pack_definition_id" class="border border-zinc-300 px-3 py-2">
                    <option v-for="d in definitions" :key="d.id" :value="d.id">{{ d.title }} <span v-if="d.pack_kind">({{ d.pack_kind }})</span></option>
                </select>
                <input v-model="launchForm.title" placeholder="Campaign title (optional)" class="border border-zinc-300 px-3 py-2" />
                <input v-model="launchForm.expires_at" type="datetime-local" class="border border-zinc-300 px-3 py-2 col-span-2" />
            </div>
            <p v-if="launchError" class="text-sm text-red-600 mt-3">{{ launchError }}</p>
            <div class="flex justify-end gap-2 mt-4">
                <button @click="showLaunchForm = false" class="px-4 py-2 text-xs tracking-widest uppercase text-zinc-600">Cancel</button>
                <button @click="launch" :disabled="launchSaving" class="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50 inline-flex items-center gap-2">
                    <Rocket class="w-4 h-4" /> {{ launchSaving ? 'Launching…' : 'Launch' }}
                </button>
            </div>
        </section>

        <!-- Campaigns table -->
        <section v-if="tab === 'campaigns'" class="bg-white border border-zinc-200">
            <table class="w-full text-sm">
                <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                    <tr>
                        <th class="px-5 py-3 text-left">Code</th>
                        <th class="px-5 py-3 text-left">Definition</th>
                        <th class="px-5 py-3 text-left">Status</th>
                        <th class="px-5 py-3 text-left">Slots</th>
                        <th class="px-5 py-3 text-left">Expires</th>
                        <th class="px-5 py-3"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">Loading…</td></tr>
                    <tr v-else-if="!campaigns.length"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">No campaigns yet — launch one from an existing definition.</td></tr>
                    <tr v-for="c in campaigns" :key="c.id" class="border-t border-zinc-100">
                        <td class="px-5 py-3">
                            <button @click="copyCode(c.public_code)" class="font-mono font-semibold text-gold-dark hover:text-gold inline-flex items-center gap-1">
                                {{ c.public_code }}
                                <Copy v-if="copiedCode !== c.public_code" class="w-3 h-3" />
                                <span v-else class="text-emerald-600 text-xs">✓</span>
                            </button>
                        </td>
                        <td class="px-5 py-3">{{ c.definition?.title || '—' }}</td>
                        <td class="px-5 py-3">
                            <span :class="['text-xs px-2 py-0.5 rounded', {
                                'bg-emerald-100 text-emerald-700': c.status === 'open',
                                'bg-zinc-100 text-zinc-600': c.status === 'cancelled' || c.status === 'closed',
                                'bg-amber-100 text-amber-700': c.status === 'filled',
                            }]">{{ c.status }}</span>
                        </td>
                        <td class="px-5 py-3 text-xs">
                            <span class="font-medium">{{ c.slots_paid }}</span> paid ·
                            <span>{{ c.slots_available }}</span> open ·
                            <span class="text-zinc-400">{{ c.slots_total }} total</span>
                        </td>
                        <td class="px-5 py-3 text-zinc-500 text-xs">{{ c.expires_at ? new Date(c.expires_at).toLocaleDateString() : '—' }}</td>
                        <td class="px-5 py-3 text-right">
                            <div class="inline-flex items-center gap-1">
                                <a :href="`/shop/packs/${c.public_code}`" target="_blank" class="inline-flex items-center justify-center w-8 h-8 text-zinc-500 hover:text-gold hover:bg-gold/10 rounded" title="Open public link" :aria-label="'Open ' + c.public_code">
                                    <ExternalLink class="w-4 h-4" />
                                </a>
                                <IconButton v-if="c.status === 'open'" label="Cancel campaign" tone="danger" @click="cancelCampaign(c)">
                                    <X class="w-4 h-4" />
                                </IconButton>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </section>

        <!-- Definitions table -->
        <section v-else class="bg-white border border-zinc-200">
            <table class="w-full text-sm">
                <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                    <tr>
                        <th class="px-5 py-3 text-left">Title</th>
                        <th class="px-5 py-3 text-left">Kind</th>
                        <th class="px-5 py-3 text-left">Products</th>
                        <th class="px-5 py-3 text-left">Status</th>
                        <th class="px-5 py-3 text-left">Campaigns</th>
                        <th class="px-5 py-3"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">Loading…</td></tr>
                    <tr v-else-if="!definitions.length"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">No definitions yet — create one to seed a campaign.</td></tr>
                    <tr v-for="d in definitions" :key="d.id" class="border-t border-zinc-100">
                        <td class="px-5 py-3 font-medium">{{ d.title }}</td>
                        <td class="px-5 py-3 capitalize">{{ d.pack_kind }}</td>
                        <td class="px-5 py-3 text-xs">{{ d.product_titles.join(', ') || '—' }}</td>
                        <td class="px-5 py-3">
                            <span :class="['text-xs px-2 py-0.5 rounded', d.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600']">{{ d.status }}</span>
                        </td>
                        <td class="px-5 py-3">{{ d.campaigns_count }}</td>
                        <td class="px-5 py-3 text-right">
                            <div class="inline-flex items-center gap-1">
                                <button @click="startLaunch(d)" class="inline-flex items-center justify-center w-8 h-8 text-zinc-500 hover:text-gold hover:bg-gold/10 rounded" title="Launch a campaign from this definition" :aria-label="'Launch ' + d.title">
                                    <Rocket class="w-4 h-4" />
                                </button>
                                <IconButton label="Delete definition" tone="danger" @click="removeDef(d)">
                                    <Trash2 class="w-4 h-4" />
                                </IconButton>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </section>
    </div>
</template>
