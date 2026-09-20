<script>
import { api } from '../../lib/api.js';
import { Copy, ExternalLink, Wallet, TrendingUp, Calendar, ShoppingBag, LayoutGrid, MessageCircle, Crown, Palette } from 'lucide-vue-next';
import StorefrontBuilder from '../components/affiliate/StorefrontBuilder.vue';
import AffiliateInbox from '../components/affiliate/AffiliateInbox.vue';
import ShopDesignEditor from '../components/affiliate/ShopDesignEditor.vue';

export default {
    name: 'AffiliateDashboard',
    components: { Copy, ExternalLink, Wallet, TrendingUp, Calendar, ShoppingBag, LayoutGrid, MessageCircle, Crown, StorefrontBuilder, AffiliateInbox, ShopDesignEditor, Palette },
    data() {
        return {
            data: null, loading: true, error: '', copied: false, needsLogin: false,
            // Optional, and entirely the affiliate's own — deliberately not part
            // of applying.
            profile: { bio: '', instagram: '', tiktok: '', website: '' },
            profileOpen: false,
            profileSaving: false,
            profileSaved: false,
            profileError: '',
            // Sections: earnings | shop | inbox
            section: 'earnings',
            storefront: null,
        };
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
            const meta = res.affiliate?.metadata || {};
            try {
                const sf = await api.get('/api/account/affiliate/storefront');
                this.storefront = sf;
            } catch { /* not active yet */ }
            this.profile = {
                bio: meta.bio || '',
                instagram: meta.instagram || '',
                tiktok: meta.tiktok || '',
                website: meta.website || '',
            };
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
        async refreshStorefront() {
            try { this.storefront = await api.get('/api/account/affiliate/storefront'); } catch { /* keep last */ }
        },
        async toggleMode() {
            const next = this.storefront.storefront.mode === 'curated' ? 'all' : 'curated';
            try {
                this.storefront = await api.put('/api/account/affiliate/storefront', { mode: next });
            } catch (e) {
                this.profileError = e.payload?.error || 'Could not switch mode.';
            }
        },
        async saveProfile() {
            this.profileSaving = true;
            this.profileError = '';
            this.profileSaved = false;
            try {
                await api.put('/api/account/affiliate/profile', this.profile);
                this.profileSaved = true;
                setTimeout(() => { this.profileSaved = false; }, 2200);
            } catch (e) {
                this.profileError = e.payload?.error || 'Could not save your profile.';
            } finally { this.profileSaving = false; }
        },
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
                <!-- Stacked on a phone: the link gets the full width (it is the
                     thing being read), the actions share a row beneath it. A
                     single row only fits from `sm` up — below that the third
                     button was pushing the whole page 72px wider than the screen. -->
                <div class="flex flex-col sm:flex-row gap-2">
                    <input
                        :value="shopLink"
                        readonly
                        @focus="$event.target.select()"
                        class="w-full sm:flex-1 min-w-0 border border-black/15 px-4 py-2.5 bg-white font-mono text-sm"
                    />
                    <div class="flex gap-2">
                    <button
                        @click="copyLink"
                        class="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-gold text-white px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
                    >
                        <Copy class="w-4 h-4" />
                        {{ copied ? 'Copied ✓' : 'Copy' }}
                    </button>
                    <a
                        :href="shopLink"
                        target="_blank"
                        class="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 border border-black/15 px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:border-gold hover:text-gold transition-colors"
                    >
                        <ExternalLink class="w-4 h-4" />
                        Open
                    </a>
                    </div>
                </div>
            </section>

            <!-- Sections. Earnings is the default because it's what most
                 affiliates open the dashboard to check. -->
            <!-- A strip that scrolls sideways rather than wrapping: four tabs
                 don't fit a phone, and wrapped they broke "MY SHOP" onto two
                 lines and pushed "Messages" off the edge. -->
            <nav class="scroll-strip sm:gap-1 mb-6 border-b border-gold/15">
                <button
                    v-for="s in [
                        { id: 'earnings', label: 'Earnings', icon: 'TrendingUp' },
                        { id: 'shop',     label: 'My shop',  icon: 'LayoutGrid' },
                        { id: 'design',   label: 'Design',   icon: 'Palette' },
                        { id: 'inbox',    label: 'Messages', icon: 'MessageCircle' },
                    ]"
                    :key="s.id"
                    @click="section = s.id"
                    :class="[
                        'flex-1 sm:flex-none justify-center px-3 sm:px-4 py-3.5 text-[11px] tracking-widest uppercase whitespace-nowrap inline-flex items-center gap-2 border-b-2 -mb-px transition-colors',
                        section === s.id ? 'border-gold text-gold-dark' : 'border-transparent text-black/50 hover:text-black/80',
                    ]"
                >
                    <component :is="s.icon" class="w-3.5 h-3.5" />
                    {{ s.label }}
                </button>
            </nav>

            <!-- ─── My shop ─────────────────────────────────────────── -->
            <section v-if="section === 'shop'" class="mb-10">
                <div v-if="storefront" class="bg-cream-dark/40 border border-gold/20 p-5 mb-6">
                    <div class="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <p class="text-[10px] tracking-widest uppercase text-black/55 mb-1">Your shop shows</p>
                            <p class="font-display text-lg">
                                {{ storefront.storefront.mode === 'curated'
                                    ? `${storefront.storefront.product_count} pieces you chose`
                                    : 'Everything BLESSLUXE sells' }}
                            </p>
                        </div>
                        <button
                            @click="toggleMode"
                            class="text-[10px] tracking-widest uppercase border border-gold/40 text-gold-dark px-4 py-2 hover:bg-gold/10 transition-colors"
                        >
                            Switch to {{ storefront.storefront.mode === 'curated' ? 'the whole shop' : 'my own line' }}
                        </button>
                    </div>

                    <!-- Exclusives they hold, with progress against the minimum. -->
                    <div v-if="storefront.exclusives?.length" class="mt-4 pt-4 border-t border-gold/15">
                        <p class="text-[10px] tracking-widest uppercase text-black/55 mb-2 inline-flex items-center gap-1">
                            <Crown class="w-3 h-3" /> Exclusive to you
                        </p>
                        <ul class="space-y-1.5">
                            <li v-for="e in storefront.exclusives" :key="e.id" class="flex items-center gap-2 text-sm">
                                <span class="flex-1 min-w-0 truncate">{{ e.product_title }}</span>
                                <span v-if="e.progress" :class="e.at_risk ? 'text-amber-700' : 'text-emerald-700'" class="text-[10px] tracking-widest uppercase">
                                    {{ e.progress }} sold
                                </span>
                                <span v-if="e.status === 'pending_payment'" class="text-[10px] tracking-widest uppercase text-black/45">
                                    awaiting payment
                                </span>
                            </li>
                        </ul>
                    </div>
                </div>

                <StorefrontBuilder @changed="refreshStorefront" />
            </section>

            <!-- ─── Design: colour, top bar, hero ───────────────────── -->
            <section v-else-if="section === 'design'" class="mb-10">
                <ShopDesignEditor :shop-url="shopLink" />
            </section>

            <!-- ─── Messages ────────────────────────────────────────── -->
            <section v-else-if="section === 'inbox'" class="mb-10">
                <AffiliateInbox />
            </section>

            <!-- Your profile. Optional, and entirely yours — none of this was
                 asked for when applying. -->
            <section v-show="section === 'earnings'" class="bg-white border border-gold/15 mb-10">
                <header class="px-5 py-3 border-b border-gold/10 flex items-center justify-between gap-3">
                    <h2 class="font-display text-sm tracking-widest uppercase">Your profile</h2>
                    <button
                        @click="profileOpen = !profileOpen"
                        class="text-[10px] tracking-widest uppercase text-black/55 hover:text-gold"
                    >
                        {{ profileOpen ? 'Close' : 'Edit' }}
                    </button>
                </header>

                <div v-if="profileOpen" class="px-5 py-4 space-y-3">
                    <p class="text-xs text-black/55">
                        Optional — add your links and a short bio if you'd like them on record.
                    </p>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input v-model="profile.instagram" placeholder="Instagram" class="border border-black/15 px-3 py-2 text-sm" />
                        <input v-model="profile.tiktok" placeholder="TikTok" class="border border-black/15 px-3 py-2 text-sm" />
                        <input v-model="profile.website" placeholder="Website" class="border border-black/15 px-3 py-2 text-sm" />
                    </div>
                    <textarea v-model="profile.bio" rows="3" placeholder="A short bio (optional)" class="w-full border border-black/15 px-3 py-2 text-sm"></textarea>

                    <p v-if="profileError" class="text-sm text-red-600">{{ profileError }}</p>

                    <div class="flex items-center gap-3">
                        <button
                            @click="saveProfile"
                            :disabled="profileSaving"
                            class="bg-gold text-white px-5 py-2 text-[10px] font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark disabled:opacity-50"
                        >
                            {{ profileSaving ? 'Saving' : 'Save profile' }}
                        </button>
                        <span v-if="profileSaved" class="text-xs text-emerald-700">Saved ✓</span>
                    </div>
                </div>

                <div v-else class="px-5 py-4 text-sm text-black/65">
                    <template v-if="profile.instagram || profile.tiktok || profile.website || profile.bio">
                        <p v-if="profile.bio" class="mb-2">{{ profile.bio }}</p>
                        <p class="text-xs text-black/55">
                            <span v-if="profile.instagram">{{ profile.instagram }}</span>
                            <span v-if="profile.tiktok"> · {{ profile.tiktok }}</span>
                            <span v-if="profile.website"> · {{ profile.website }}</span>
                        </p>
                    </template>
                    <p v-else class="text-black/45">Nothing here yet — add your links if you'd like.</p>
                </div>
            </section>

            <!-- Recent sales -->
            <section v-show="section === 'earnings'" class="bg-white border border-gold/15 mb-10">
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

            <!-- Payouts live under Earnings: money owed and money received are
                 read together, and three tabs fit a phone where four did not.
                 The guard matters — without one this rendered under every tab. -->
            <section v-show="section === 'earnings'" class="bg-white border border-gold/15">
                <header class="px-5 py-3 border-b border-gold/10 flex items-center justify-between gap-3 flex-wrap">
                    <h2 class="font-display text-sm tracking-widest uppercase flex items-center gap-2"><Wallet class="w-3.5 h-3.5" /> Payouts</h2>
                    <p class="text-[10px] tracking-widest uppercase text-black/45">
                        Awaiting payout · <span class="text-gold-dark">{{ data.summary.pending_balance }}</span>
                    </p>
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
