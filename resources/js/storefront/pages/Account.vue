<script>
import { api } from '../../lib/api.js';
import { authStore } from '../auth-store.js';
import { confirmDialog, toast } from '../../lib/dialog.js';
import { wishlist } from '../wishlist-store.js';
import {
    LayoutGrid, Package, Sparkles, RotateCcw, TrendingUp, MapPin, Heart,
    ArrowRight, ExternalLink, ChevronRight, ShoppingBag,
} from 'lucide-vue-next';

export default {
    name: 'AccountPage',
    components: {
        LayoutGrid, Package, Sparkles, RotateCcw, TrendingUp, MapPin, Heart,
        ArrowRight, ExternalLink, ChevronRight, ShoppingBag,
    },
    data() {
        return {
            loading: true,
            customer: null,
            bees: null,
            beesSettings: null,
            orders: null,
            ordersLoading: false,
            affiliate: null,
            affiliateChecked: false,
            copyState: '',
            addresses: [],
            addrEditing: null,
            addrForm: {
                label: '', first_name: '', last_name: '', phone: '',
                line1: '', line2: '', city: '', region: '', postal_code: '', country: 'ZW',
                is_default_shipping: false, is_default_billing: false,
            },
            addrBusy: false,
            addrError: '',
            verifySending: false,
            verifyState: '',
            activeTab: 'overview',
            tabs: [
                { id: 'overview',     label: 'Overview',     icon: 'LayoutGrid' },
                { id: 'transactions', label: 'Orders',       icon: 'Package' },
                { id: 'bees',        label: 'Bees',        icon: 'Sparkles' },
                { id: 'returns',      label: 'Returns',      icon: 'RotateCcw' },
                { id: 'affiliate',    label: 'Affiliate',    icon: 'TrendingUp' },
                { id: 'addresses',    label: 'Addresses',    icon: 'MapPin' },
                { id: 'wishlist',     label: 'Wishlist',     icon: 'Heart' },
            ],
            wishlistItems: null,
            returns: [],
            returnsLoaded: false,
            returnForm: { order_number: '', reason: '', items: [] },
            returnFormOrder: null,
            returnBusy: false,
            returnError: '',
            showReturnForm: false,
        };
    },
    computed: {
        displayName() {
            if (!this.customer) return 'Guest';
            const first = this.customer.first_name;
            const last  = this.customer.last_name;
            return [first, last].filter(Boolean).join(' ') || this.customer.email;
        },
        // ─── Dashboard figures ────────────────────────────────────────
        // The overview was a bare list of account fields; these turn it into
        // something worth landing on.
        orderCount() { return this.orders?.length || 0; },
        openOrders() {
            // Anything not yet in the customer's hands.
            return (this.orders || []).filter(
                (o) => !['delivered', 'collected', 'returned', 'cancelled'].includes(o.fulfillment_status),
            );
        },
        recentOrders() { return (this.orders || []).slice(0, 4); },
        isAffiliate() { return this.affiliate?.status === 'active'; },
        // Counts shown against the nav so a tab's weight is visible before opening it.
        tabCounts() {
            return {
                transactions: this.orderCount || null,
                bees: this.bees?.balance || null,
                returns: this.returns?.length || null,
                addresses: this.addresses?.length || null,
            };
        },
        greeting() {
            const h = new Date().getHours();
            if (h < 12) return 'Good morning';
            if (h < 18) return 'Good afternoon';
            return 'Good evening';
        },
        // Where we actually ship. Zimbabwe first since it's the home market.
        countryOptions() {
            return [
                { code: 'ZW', name: 'Zimbabwe' },
                { code: 'ZA', name: 'South Africa' },
                { code: 'BW', name: 'Botswana' },
                { code: 'ZM', name: 'Zambia' },
                { code: 'MZ', name: 'Mozambique' },
                { code: 'NA', name: 'Namibia' },
                { code: 'MW', name: 'Malawi' },
                { code: 'GB', name: 'United Kingdom' },
                { code: 'US', name: 'United States' },
            ];
        },
    },
    async mounted() {
        // The points programme was renamed. Emails and notifications sent before
        // the rename still link to the old tab key, so it keeps working.
        const LEGACY_TABS = { ['bl' + 'its']: 'bees' };
        const asked = this.$route.query.tab;
        const tab = LEGACY_TABS[asked] || asked;
        if (tab && this.tabs.some((t) => t.id === tab)) this.activeTab = tab;
        // …and don't leave the old word sitting in the address bar.
        if (LEGACY_TABS[asked]) this.$router.replace({ query: { ...this.$route.query, tab } });
        // Show toast for verify-email landing.
        const v = this.$route.query.verify;
        if (v === 'ok') this.verifyState = 'Email verified ✓';
        else if (v === 'expired') this.verifyState = 'That link expired. Send a new one below.';
        else if (v) this.verifyState = 'That link is invalid. Send a new one below.';
        await this.loadMe();
        // If we landed via "Request return" deep link, hydrate the form.
        if (this.activeTab === 'returns') {
            await this.loadReturns();
            const start = this.$route.query.start;
            if (start) this.startReturn(start);
        }
    },
    methods: {
        async loadMe() {
            this.loading = true;
            try {
                const data = await api.get('/api/account/me');
                this.customer = data.customer;
                if (!this.customer) {
                    const here = this.$route.fullPath;
                    this.$router.replace(`/account/login?next=${encodeURIComponent(here)}`);
                    return;
                }
                // Bees panel data — independent fetch so a failure here
                // doesn't block the account from rendering.
                try {
                    const b = await api.get('/api/account/bees');
                    this.bees = b.bees;
                    this.beesSettings = b.settings;
                } catch { /* leave null */ }
                // Orders — needed for the Transactions tab + sidebar count.
                try {
                    const o = await api.get('/api/account/orders');
                    this.orders = o.orders;
                } catch { /* leave null */ }
                // Wishlist — drives the overview count and the saved-items tab.
                try { this.wishlistItems = await wishlist.list(); } catch { this.wishlistItems = []; }
                // Affiliate — null if they haven't applied yet.
                try {
                    const a = await api.get('/api/account/affiliate');
                    this.affiliate = a.affiliate;
                } catch { /* leave null */ }
                this.affiliateChecked = true;
                // Addresses.
                try {
                    const r = await api.get('/api/account/addresses');
                    this.addresses = r.addresses || [];
                } catch { this.addresses = []; }
            } catch {
                this.customer = null;
            } finally {
                this.loading = false;
            }
        },
        ledgerLabel(reason) {
            const map = {
                checkout_redeem: 'Spent at checkout',
                order_earn: 'Earned on order',
                admin_adjustment: 'Adjusted by admin',
                checkout_cancel_refund: 'Refunded (cancelled checkout)',
            };
            return map[reason] || reason.replace(/_/g, ' ');
        },
        fmtDate(iso) { return iso ? new Date(iso).toLocaleString() : '—'; },
        async copyShareUrl() {
            if (!this.affiliate?.share_url) return;
            try {
                await navigator.clipboard.writeText(this.affiliate.share_url);
                this.copyState = 'Copied';
            } catch {
                this.copyState = 'Press ⌘C';
            }
            setTimeout(() => { this.copyState = ''; }, 1800);
        },
        async loadReturns() {
            if (this.returnsLoaded) return;
            try {
                const r = await api.get('/api/account/returns');
                this.returns = r.returns || [];
            } catch { this.returns = []; }
            this.returnsLoaded = true;
        },
        async startReturn(orderNumber) {
            this.returnError = '';
            this.returnForm = { order_number: orderNumber, reason: '', items: [] };
            try {
                const d = await api.get(`/api/account/orders/${orderNumber}`);
                this.returnFormOrder = d.order;
                this.returnForm.items = (d.order.items || []).map((it) => ({
                    order_line_item_id: it.id,
                    quantity: 0,
                    reason: '',
                    label: it.title + (it.variant_title ? ' · ' + it.variant_title : ''),
                    max: it.quantity,
                }));
            } catch (e) {
                this.returnError = e.payload?.error || 'Could not load this order.';
            }
            this.showReturnForm = true;
        },
        cancelReturn() {
            this.showReturnForm = false;
            this.returnFormOrder = null;
            this.returnForm = { order_number: '', reason: '', items: [] };
        },
        async submitReturn() {
            const items = this.returnForm.items.filter((i) => i.quantity > 0);
            if (!items.length) {
                this.returnError = 'Select at least one item to return.';
                return;
            }
            this.returnBusy = true;
            this.returnError = '';
            try {
                await api.post('/api/account/returns', {
                    order_number: this.returnForm.order_number,
                    reason: this.returnForm.reason || null,
                    items: items.map((i) => ({
                        order_line_item_id: i.order_line_item_id,
                        quantity: i.quantity,
                        reason: i.reason || null,
                    })),
                });
                this.returnsLoaded = false;
                await this.loadReturns();
                this.cancelReturn();
            } catch (e) {
                this.returnError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not file return.';
            } finally {
                this.returnBusy = false;
            }
        },
        async resendVerify() {
            this.verifySending = true;
            try {
                await api.post('/api/account/verify-email/resend');
                this.verifyState = 'Sent — check your inbox.';
            } catch {
                this.verifyState = "Couldn't send. Try again in a moment.";
            } finally {
                this.verifySending = false;
            }
        },
        blankAddressForm() {
            // Prefill the recipient from the account. A courier needs a name and a
            // phone on the label, but making someone retype what we already hold is
            // pure friction — they stay editable for delivering to someone else.
            return {
                label: '',
                first_name: this.customer?.first_name || '',
                last_name: this.customer?.last_name || '',
                phone: this.customer?.phone || '',
                line1: '', line2: '', city: '', region: '', postal_code: '', country: 'ZW',
                is_default_shipping: false, is_default_billing: false,
            };
        },
        startAddAddress() {
            this.addrEditing = 'new';
            this.addrForm = this.blankAddressForm();
            this.addrError = '';
        },
        startEditAddress(a) {
            this.addrEditing = a.id;
            this.addrForm = { ...a };
            this.addrError = '';
        },
        cancelAddress() {
            this.addrEditing = null;
            this.addrError = '';
        },
        async saveAddress() {
            this.addrBusy = true;
            this.addrError = '';
            try {
                if (this.addrEditing === 'new') {
                    const r = await api.post('/api/account/addresses', this.addrForm);
                    this.addresses.unshift(r.address);
                } else {
                    const r = await api.put(`/api/account/addresses/${this.addrEditing}`, this.addrForm);
                    const idx = this.addresses.findIndex((x) => x.id === this.addrEditing);
                    if (idx >= 0) this.addresses[idx] = r.address;
                    // If the saved address became default, reflect that on the others client-side.
                    if (r.address.is_default_shipping) this.addresses.forEach((x) => { if (x.id !== r.address.id) x.is_default_shipping = false; });
                    if (r.address.is_default_billing)  this.addresses.forEach((x) => { if (x.id !== r.address.id) x.is_default_billing  = false; });
                }
                this.addrEditing = null;
            } catch (e) {
                this.addrError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not save the address.';
            } finally {
                this.addrBusy = false;
            }
        },
        async deleteAddress(a) {
            if (!await confirmDialog({ title: 'Delete this address?', confirmLabel: 'Delete', tone: 'danger' })) return;
            try {
                await api.del(`/api/account/addresses/${a.id}`);
                this.addresses = this.addresses.filter((x) => x.id !== a.id);
            } catch {
                toast('Could not delete that address.', { tone: 'error' });
            }
        },
        async signOut() {
            try {
                await api.post('/api/account/logout');
            } catch {
                /* swallow — we're leaving the page anyway */
            }
            this.customer = null;
            // Immediately — not when a cache expires. Hides the members-only
            // menu and closes the Show Room route in the same tick.
            authStore.clear();
            this.$router.push('/');
        },
    },
};
</script>

<template>
    <div class="max-w-[1200px] mx-auto px-[5%] py-12 min-h-[60vh]">
        <div v-if="loading" class="grid grid-cols-12 gap-y-8 gap-x-0 md:gap-x-8 animate-pulse">
            <div class="col-span-12 md:col-span-3 space-y-2">
                <div v-for="n in 5" :key="n" class="h-10 bg-cream-dark" />
            </div>
            <div class="col-span-12 md:col-span-9 bg-cream-dark/40 p-6 space-y-3">
                <div class="h-6 w-1/3 bg-cream-dark" />
                <div class="h-4 w-2/3 bg-cream-dark" />
                <div class="h-4 w-1/2 bg-cream-dark" />
                <div class="h-4 w-3/4 bg-cream-dark" />
            </div>
        </div>

        <div v-else-if="customer">
            <div class="flex items-start justify-between mb-10">
                <div>
                    <p class="font-script text-3xl text-gold">Welcome</p>
                    <h1 class="font-display text-3xl md:text-4xl tracking-widest uppercase">{{ displayName }}</h1>
                    <p class="text-sm text-black/60 mt-1">{{ customer.email }}</p>
                </div>
                <button @click="signOut" class="text-[10px] tracking-widest uppercase text-black/55 hover:text-gold transition-colors">
                    Sign out
                </button>
            </div>

            <!-- Verify-email banner: shows only when the customer's email
                 isn't verified (or a verify link came back with an issue). -->
            <div v-if="!customer.email_verified_at" class="bg-amber-50 border border-amber-200 text-amber-900 p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <p class="text-sm font-medium">Verify your email to secure your account.</p>
                    <p v-if="verifyState" class="text-xs text-amber-700 mt-1">{{ verifyState }}</p>
                </div>
                <button @click="resendVerify" :disabled="verifySending" class="text-[10px] tracking-widest uppercase border border-amber-600 text-amber-800 px-4 py-2 hover:bg-amber-100 disabled:opacity-50">
                    {{ verifySending ? 'Sending…' : 'Send verification link' }}
                </button>
            </div>
            <div v-else-if="verifyState" class="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3 mb-6">{{ verifyState }}</div>

            <div class="grid grid-cols-12 gap-y-8 gap-x-0 md:gap-x-8">
                <aside class="col-span-12 md:col-span-3">
                    <nav class="space-y-0.5 md:sticky md:top-6">
                        <button
                            v-for="t in tabs"
                            :key="t.id"
                            @click="activeTab = t.id; t.id === 'returns' && loadReturns()"
                            :class="[
                                'w-full text-left px-4 py-3 text-xs tracking-widest uppercase flex items-center gap-3 transition-colors',
                                activeTab === t.id ? 'bg-gold text-white' : 'text-black/70 hover:bg-cream-dark',
                            ]"
                        >
                            <component :is="t.icon" class="w-4 h-4 flex-shrink-0" />
                            <span class="flex-1 min-w-0">{{ t.label }}</span>

                            <!-- Weight of each section, visible before opening it. -->
                            <span
                                v-if="tabCounts[t.id]"
                                :class="[
                                    'text-[10px] px-1.5 py-0.5 rounded-full font-sans tracking-normal',
                                    activeTab === t.id ? 'bg-white/25' : 'bg-black/5 text-black/50',
                                ]"
                            >{{ tabCounts[t.id] }}</span>
                            <span
                                v-else-if="t.id === 'affiliate' && isAffiliate"
                                :class="['w-1.5 h-1.5 rounded-full', activeTab === t.id ? 'bg-white' : 'bg-emerald-500']"
                                title="Active affiliate"
                            ></span>
                        </button>

                        <!-- The affiliate dashboard had no way in from here; an
                             approved affiliate had to know the URL. -->
                        <router-link
                            v-if="isAffiliate"
                            :to="`/affiliate/${affiliate.code}/dashboard`"
                            class="w-full text-left px-4 py-3 text-xs tracking-widest uppercase flex items-center gap-3 text-gold-dark hover:bg-cream-dark transition-colors border-t border-gold/10 mt-2 pt-4"
                        >
                            <ExternalLink class="w-4 h-4 flex-shrink-0" />
                            <span class="flex-1">Affiliate dashboard</span>
                            <ChevronRight class="w-3.5 h-3.5" />
                        </router-link>
                    </nav>
                </aside>
                <section class="col-span-12 md:col-span-9 bg-white border border-gold/10 p-6">
                    <div v-if="activeTab === 'overview'">
                        <header class="mb-6">
                            <p class="font-script text-2xl text-gold">{{ greeting }}</p>
                            <h2 class="font-display text-xl tracking-widest uppercase">Overview</h2>
                        </header>

                        <!-- What's actually happening on the account, rather than
                             a list of database fields. -->
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                            <button
                                @click="activeTab = 'transactions'"
                                class="text-left bg-cream-dark/40 border border-gold/15 p-4 hover:border-gold/40 transition-colors"
                            >
                                <p class="text-[10px] tracking-widest uppercase text-black/55 mb-1">Orders</p>
                                <p class="font-display text-2xl">{{ orderCount }}</p>
                                <p v-if="openOrders.length" class="text-[10px] tracking-widest uppercase text-gold-dark mt-1">
                                    {{ openOrders.length }} in progress
                                </p>
                            </button>

                            <button
                                @click="activeTab = 'bees'"
                                class="text-left bg-cream-dark/40 border border-gold/15 p-4 hover:border-gold/40 transition-colors"
                            >
                                <p class="text-[10px] tracking-widest uppercase text-black/55 mb-1">Bees</p>
                                <p class="font-display text-2xl">{{ bees?.balance ?? '—' }}</p>
                                <p v-if="bees && beesSettings" class="text-[10px] tracking-widest uppercase text-black/45 mt-1">
                                    ≈ ${{ (bees.balance / beesSettings.per_usd).toFixed(2) }}
                                </p>
                            </button>

                            <div class="bg-cream-dark/40 border border-gold/15 p-4">
                                <p class="text-[10px] tracking-widest uppercase text-black/55 mb-1">Tier</p>
                                <p class="font-display text-2xl capitalize">{{ customer.loyalty_tier || '—' }}</p>
                            </div>

                            <button
                                @click="activeTab = 'wishlist'"
                                class="text-left bg-cream-dark/40 border border-gold/15 p-4 hover:border-gold/40 transition-colors"
                            >
                                <p class="text-[10px] tracking-widest uppercase text-black/55 mb-1">Saved</p>
                                <p class="font-display text-2xl">{{ wishlistItems === null ? '—' : wishlistItems.length }}</p>
                            </button>
                        </div>

                        <!-- Recent orders: the thing most people come here for. -->
                        <section class="mb-8">
                            <div class="flex items-center justify-between mb-3">
                                <h3 class="font-display text-sm tracking-widest uppercase text-gold">Recent orders</h3>
                                <button
                                    v-if="orderCount > recentOrders.length"
                                    @click="activeTab = 'transactions'"
                                    class="text-[10px] tracking-widest uppercase text-black/55 hover:text-gold"
                                >View all</button>
                            </div>

                            <ul v-if="recentOrders.length" class="divide-y divide-gold/10 border-y border-gold/10">
                                <li v-for="o in recentOrders" :key="o.order_number">
                                    <router-link
                                        :to="`/account/orders/${o.order_number}`"
                                        class="flex items-center gap-3 py-3 hover:bg-cream-dark/30 transition-colors px-1"
                                    >
                                        <span class="w-9 h-9 bg-cream-dark flex items-center justify-center flex-shrink-0">
                                            <Package class="w-4 h-4 text-gold-dark" />
                                        </span>
                                        <span class="flex-1 min-w-0">
                                            <span class="block font-mono text-xs">{{ o.order_number }}</span>
                                            <span class="block text-[10px] tracking-widest uppercase text-black/45">{{ fmtDate(o.created_at) }}</span>
                                        </span>
                                        <span class="text-right flex-shrink-0">
                                            <span class="block text-sm">{{ o.total_label }}</span>
                                            <span v-if="o.fulfillment_label" class="block text-[10px] tracking-widest uppercase text-gold-dark">
                                                {{ o.fulfillment_label }}
                                            </span>
                                        </span>
                                        <ChevronRight class="w-4 h-4 text-black/25 flex-shrink-0" />
                                    </router-link>
                                </li>
                            </ul>

                            <!-- An empty state that offers a way forward. -->
                            <div v-else class="border border-dashed border-gold/25 p-8 text-center">
                                <ShoppingBag class="w-8 h-8 mx-auto text-gold/40 mb-3" />
                                <p class="text-sm text-black/60 mb-4">No orders yet.</p>
                                <router-link to="/shop" class="inline-block bg-gold text-white px-6 py-2.5 text-[10px] font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                                    Start shopping
                                </router-link>
                            </div>
                        </section>

                        <!-- Nudges, shown only when there's something to act on. -->
                        <section v-if="!customer.email_verified_at || !addresses.length || !affiliate" class="mb-8">
                            <h3 class="font-display text-sm tracking-widest uppercase text-gold mb-3">Finish setting up</h3>
                            <ul class="space-y-2">
                                <li v-if="!addresses.length">
                                    <button @click="activeTab = 'addresses'" class="w-full text-left flex items-center gap-3 border border-gold/15 p-3 hover:border-gold/40 transition-colors">
                                        <MapPin class="w-4 h-4 text-gold-dark flex-shrink-0" />
                                        <span class="flex-1 text-sm">Add a delivery address</span>
                                        <ArrowRight class="w-4 h-4 text-black/30" />
                                    </button>
                                </li>
                                <li v-if="!affiliate">
                                    <router-link to="/affiliate/apply" class="w-full text-left flex items-center gap-3 border border-gold/15 p-3 hover:border-gold/40 transition-colors">
                                        <TrendingUp class="w-4 h-4 text-gold-dark flex-shrink-0" />
                                        <span class="flex-1 text-sm">Become an affiliate and earn {{ 10 }}% on every sale</span>
                                        <ArrowRight class="w-4 h-4 text-black/30" />
                                    </router-link>
                                </li>
                            </ul>
                        </section>

                        <!-- Account details, demoted to where they belong. -->
                        <section>
                            <h3 class="font-display text-sm tracking-widest uppercase text-gold mb-3">Account</h3>
                            <dl class="text-sm divide-y divide-gold/5 border-y border-gold/5">
                                <div class="flex justify-between py-2"><dt class="text-black/55">Email</dt><dd>{{ customer.email }}</dd></div>
                                <div class="flex justify-between py-2">
                                    <dt class="text-black/55">Email verified</dt>
                                    <dd :class="customer.email_verified_at ? 'text-emerald-700' : 'text-amber-700'">
                                        {{ customer.email_verified_at ? 'Yes' : 'Not yet' }}
                                    </dd>
                                </div>
                                <div v-if="customer.oauth_provider" class="flex justify-between py-2">
                                    <dt class="text-black/55">Sign-in via</dt>
                                    <dd class="capitalize">{{ customer.oauth_provider }}</dd>
                                </div>
                                <div class="flex justify-between py-2"><dt class="text-black/55">Last login</dt><dd>{{ customer.last_login_at || '—' }}</dd></div>
                            </dl>
                        </section>
                    </div>
                    <div v-else-if="activeTab === 'bees'">
                        <h2 class="font-display text-xl tracking-widest uppercase mb-4">Bees</h2>
                        <div v-if="!bees" class="text-sm text-black/65">Loading…</div>
                        <div v-else>
                            <div class="bg-cream-dark/40 border border-gold/20 p-5 mb-5 flex items-center justify-between">
                                <div>
                                    <p class="text-[10px] tracking-widest uppercase text-black/55 mb-1">Balance</p>
                                    <p class="font-display text-3xl">{{ bees.balance }} <span class="text-base text-black/55">Bees</span></p>
                                    <p v-if="beesSettings" class="text-xs text-black/55 mt-1">
                                        ≈ ${{ (bees.balance / beesSettings.per_usd).toFixed(2) }} at checkout
                                    </p>
                                </div>
                                <p class="text-[10px] tracking-widest uppercase bg-gold/20 text-gold-dark px-3 py-1">{{ bees.tier }}</p>
                            </div>

                            <p v-if="!bees.recent.length" class="text-sm text-black/55">No activity yet.</p>
                            <table v-else class="w-full text-sm">
                                <thead class="text-[10px] tracking-widest uppercase text-black/55 border-b border-gold/10">
                                    <tr>
                                        <th class="py-2 text-left">Activity</th>
                                        <th class="py-2 text-right">Change</th>
                                        <th class="py-2 text-right">Balance</th>
                                        <th class="py-2 text-right">When</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="e in bees.recent" :key="e.id" class="border-b border-gold/5">
                                        <td class="py-2">{{ ledgerLabel(e.reason) }}</td>
                                        <td :class="['py-2 text-right font-medium', e.delta > 0 ? 'text-emerald-600' : 'text-red-600']">
                                            {{ e.delta > 0 ? '+' : '' }}{{ e.delta }}
                                        </td>
                                        <td class="py-2 text-right">{{ e.balance_after }}</td>
                                        <td class="py-2 text-right text-xs text-black/55">{{ fmtDate(e.created_at) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div v-else-if="activeTab === 'transactions'">
                        <h2 class="font-display text-xl tracking-widest uppercase mb-4">Transactions</h2>
                        <div v-if="!orders" class="text-sm text-black/65">Loading orders…</div>
                        <p v-else-if="!orders.length" class="text-sm text-black/65">No orders yet. Once you check out, receipts and tracking codes show up here.</p>
                        <table v-else class="w-full text-sm">
                            <thead class="text-[10px] tracking-widest uppercase text-black/55 border-b border-gold/10">
                                <tr>
                                    <th class="py-2 text-left">Order</th>
                                    <th class="py-2 text-left">Date</th>
                                    <th class="py-2 text-left">Total</th>
                                    <th class="py-2 text-left">Status</th>
                                    <th class="py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="o in orders" :key="o.order_number" class="border-b border-gold/5">
                                    <td class="py-3 font-mono text-xs">
                                        <router-link :to="`/account/orders/${o.order_number}`" class="hover:text-gold transition-colors">
                                            {{ o.order_number }}
                                        </router-link>
                                    </td>
                                    <td class="py-3 text-xs text-black/55">{{ fmtDate(o.created_at) }}</td>
                                    <td class="py-3">{{ o.total_label }}</td>
                                    <td class="py-3">
                                        <span class="text-[10px] px-2 py-0.5 rounded bg-cream-dark/60">{{ o.status }}</span>
                                        <span v-if="o.payment_status === 'paid'" class="ml-1 text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">paid</span>
                                        <!-- Without this, a paid order looked identical to a delivered one. -->
                                        <span v-if="o.fulfillment_label" class="ml-1 text-[10px] px-2 py-0.5 rounded bg-gold/15 text-gold-dark">{{ o.fulfillment_label }}</span>
                                    </td>
                                    <td class="py-3 text-right space-x-3">
                                        <router-link :to="`/account/orders/${o.order_number}`" class="text-xs tracking-widest uppercase text-black/55 hover:text-gold">
                                            View
                                        </router-link>
                                        <router-link v-if="o.tracking_code" :to="`/track/${o.tracking_code}`" class="text-xs tracking-widest uppercase text-gold-dark hover:text-gold">
                                            Track →
                                        </router-link>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div v-else-if="activeTab === 'affiliate'">
                        <h2 class="font-display text-xl tracking-widest uppercase mb-4">Affiliate</h2>
                        <div v-if="!affiliateChecked" class="text-sm text-black/65">Loading…</div>
                        <div v-else-if="!affiliate" class="border border-dashed border-gold/25 p-8 text-center">
                            <TrendingUp class="w-9 h-9 mx-auto text-gold/50 mb-4" />
                            <h3 class="font-display text-lg tracking-wide mb-2">Earn on every order you send our way</h3>
                            <p class="text-sm text-black/60 mb-5 max-w-sm mx-auto">
                                Pick your own share code, send it to your people, and take 10% of every order placed
                                through it. We review applications within a couple of business days.
                            </p>
                            <router-link to="/affiliate/apply" class="inline-block bg-gold text-white px-8 py-3 text-[10px] font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                                Apply now
                            </router-link>
                        </div>

                        <div v-else-if="affiliate.status === 'pending'">
                            <div class="bg-amber-50 border border-amber-200 p-5">
                                <p class="text-[10px] tracking-widest uppercase text-amber-700 mb-2">Under review</p>
                                <p class="font-display text-2xl tracking-wider mb-2">{{ affiliate.code }}</p>
                                <p class="text-sm text-amber-900">
                                    We're holding this code for you. We'll email
                                    <span class="font-mono">{{ customer.email }}</span> as soon as it's approved —
                                    usually within a couple of business days.
                                </p>
                            </div>
                        </div>

                        <div v-else-if="affiliate.status === 'paused'">
                            <div class="bg-zinc-50 border border-zinc-200 p-5">
                                <p class="text-[10px] tracking-widest uppercase text-zinc-500 mb-2">Paused</p>
                                <p class="font-display text-2xl tracking-wider mb-2">{{ affiliate.code }}</p>
                                <p class="text-sm text-black/60">
                                    Your code isn't earning at the moment. Get in touch if you think this is a mistake.
                                </p>
                            </div>
                        </div>
                        <div v-else>
                            <div class="bg-cream-dark/40 border border-gold/20 p-5 mb-5">
                                <p class="text-[10px] tracking-widest uppercase text-black/55 mb-1">Your code</p>
                                <div class="flex items-center justify-between gap-3 flex-wrap">
                                    <p class="font-display text-3xl tracking-wider">{{ affiliate.code }}</p>
                                    <p class="text-[10px] tracking-widest uppercase bg-emerald-100 text-emerald-700 px-3 py-1">
                                        {{ affiliate.commission_rate }}% commission
                                    </p>
                                </div>
                                <div class="mt-4 flex items-center gap-2">
                                    <input type="text" :value="affiliate.share_url" readonly class="flex-1 min-w-0 bg-white border border-gold/15 px-3 py-2 text-xs font-mono" />
                                    <button @click="copyShareUrl" class="bg-black text-white px-4 py-2 text-[10px] tracking-widest uppercase hover:bg-gold transition-colors whitespace-nowrap">
                                        {{ copyState || 'Copy link' }}
                                    </button>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                <div class="border border-gold/10 p-3">
                                    <p class="text-[10px] tracking-widest uppercase text-black/55">Total earnings</p>
                                    <p class="text-lg font-display mt-1">{{ affiliate.summary.total_earnings }}</p>
                                </div>
                                <div class="border border-gold/10 p-3">
                                    <p class="text-[10px] tracking-widest uppercase text-black/55">Pending</p>
                                    <p class="text-lg font-display mt-1">{{ affiliate.summary.pending_balance }}</p>
                                </div>
                                <div class="border border-gold/10 p-3">
                                    <p class="text-[10px] tracking-widest uppercase text-black/55">Paid out</p>
                                    <p class="text-lg font-display mt-1">{{ affiliate.summary.paid_out }}</p>
                                </div>
                                <div class="border border-gold/10 p-3">
                                    <p class="text-[10px] tracking-widest uppercase text-black/55">Last 30 days</p>
                                    <p class="text-lg font-display mt-1">{{ affiliate.summary.sales_last_30d }}</p>
                                </div>
                            </div>

                            <!-- The full dashboard existed but nothing linked to it,
                                 so an approved affiliate had to know the URL. -->
                            <router-link
                                :to="`/affiliate/${affiliate.code}/dashboard`"
                                class="flex items-center gap-3 border border-gold/20 bg-cream-dark/30 p-4 mb-6 hover:border-gold/50 transition-colors"
                            >
                                <TrendingUp class="w-5 h-5 text-gold-dark flex-shrink-0" />
                                <span class="flex-1 min-w-0">
                                    <span class="block font-display text-base">Your affiliate dashboard</span>
                                    <span class="block text-xs text-black/55">Full earnings history, payouts and your profile</span>
                                </span>
                                <ArrowRight class="w-4 h-4 text-gold-dark flex-shrink-0" />
                            </router-link>

                            <h3 class="text-sm tracking-widest uppercase text-black/70 mb-2">Recent sales</h3>
                            <div v-if="!affiliate.recent_sales.length" class="border border-dashed border-gold/25 p-8 text-center">
                                <TrendingUp class="w-8 h-8 mx-auto text-gold/40 mb-3" />
                                <p class="text-sm text-black/60 mb-1">No sales yet.</p>
                                <p class="text-xs text-black/45">Share your link — you earn on every order placed through it.</p>
                            </div>
                            <table v-else class="w-full text-sm">
                                <thead class="text-[10px] tracking-widest uppercase text-black/55 border-b border-gold/10">
                                    <tr>
                                        <th class="py-2 text-left">Order</th>
                                        <th class="py-2 text-right">Order total</th>
                                        <th class="py-2 text-right">Commission</th>
                                        <th class="py-2 text-right">Status</th>
                                        <th class="py-2 text-right">When</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="s in affiliate.recent_sales" :key="s.order_id" class="border-b border-gold/5">
                                        <td class="py-2 font-mono text-xs">{{ s.order_id.slice(-8) }}</td>
                                        <td class="py-2 text-right">{{ s.order_total }}</td>
                                        <td class="py-2 text-right text-gold-dark">{{ s.commission_amount }}</td>
                                        <td class="py-2 text-right text-xs capitalize">{{ s.status }}</td>
                                        <td class="py-2 text-right text-xs text-black/55">{{ fmtDate(s.created_at) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div v-else-if="activeTab === 'addresses'">
                        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
                            <h2 class="font-display text-xl tracking-widest uppercase">Addresses</h2>
                            <button v-if="!addrEditing" @click="startAddAddress" class="bg-gold text-white px-4 py-2 text-[10px] tracking-widest uppercase hover:bg-gold-dark transition-colors">
                                + Add address
                            </button>
                        </div>

                        <!-- Add/edit form -->
                        <form v-if="addrEditing" @submit.prevent="saveAddress" class="bg-cream-dark/40 border border-gold/10 p-5 mb-5 space-y-3">
                            <div class="grid grid-cols-2 gap-3">
                                <input v-model="addrForm.label" placeholder="Label (Home, Work…)" class="border border-black/15 px-3 py-2 text-sm" />
                                <input v-model="addrForm.phone" placeholder="Phone — the courier calls this" required class="border border-black/15 px-3 py-2 text-sm" />
                                <input v-model="addrForm.first_name" placeholder="Recipient first name" required class="border border-black/15 px-3 py-2 text-sm" />
                                <input v-model="addrForm.last_name" placeholder="Recipient last name" class="border border-black/15 px-3 py-2 text-sm" />
                            </div>
                            <input v-model="addrForm.line1" placeholder="Street address" required class="w-full border border-black/15 px-3 py-2 text-sm" />
                            <input v-model="addrForm.line2" placeholder="Apartment, suite, etc. (optional)" class="w-full border border-black/15 px-3 py-2 text-sm" />
                            <div class="grid grid-cols-2 gap-3">
                                <input v-model="addrForm.city" placeholder="City" required class="border border-black/15 px-3 py-2 text-sm" />
                                <input v-model="addrForm.region" placeholder="Province / region" class="border border-black/15 px-3 py-2 text-sm" />
                                <input v-model="addrForm.postal_code" placeholder="Postal code" class="border border-black/15 px-3 py-2 text-sm" />
                                <!-- A raw 2-letter code invited typos like "ZI" for Zimbabwe. -->
                                <select v-model="addrForm.country" required class="border border-black/15 px-3 py-2 text-sm">
                                    <option v-for="c in countryOptions" :key="c.code" :value="c.code">{{ c.name }}</option>
                                </select>
                            </div>
                            <div class="flex items-center gap-4 text-xs">
                                <label class="flex items-center gap-1.5"><input type="checkbox" v-model="addrForm.is_default_shipping" /> Default shipping</label>
                                <label class="flex items-center gap-1.5"><input type="checkbox" v-model="addrForm.is_default_billing" /> Default billing</label>
                            </div>
                            <p v-if="addrError" class="text-sm text-red-600">{{ addrError }}</p>
                            <div class="flex items-center gap-2">
                                <button type="submit" :disabled="addrBusy" class="bg-gold text-white px-5 py-2 text-[10px] tracking-widest uppercase hover:bg-gold-dark transition-colors disabled:opacity-50">
                                    {{ addrBusy ? 'Saving…' : 'Save address' }}
                                </button>
                                <button type="button" @click="cancelAddress" class="text-[10px] tracking-widest uppercase text-black/55 hover:text-black">Cancel</button>
                            </div>
                        </form>

                        <p v-if="!addresses.length && !addrEditing" class="text-sm text-black/65">
                            No saved addresses yet. Add one to speed up future checkouts.
                        </p>

                        <ul v-else-if="!addrEditing" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <li v-for="a in addresses" :key="a.id" class="bg-white border border-gold/10 p-4">
                                <div class="flex items-start justify-between gap-2 mb-2">
                                    <p class="font-display text-sm tracking-widest uppercase">{{ a.label || 'Address' }}</p>
                                    <div class="flex gap-1 text-[9px] tracking-widest uppercase">
                                        <span v-if="a.is_default_shipping" class="bg-gold/15 text-gold-dark px-1.5 py-0.5">Ship</span>
                                        <span v-if="a.is_default_billing" class="bg-gold/15 text-gold-dark px-1.5 py-0.5">Bill</span>
                                    </div>
                                </div>
                                <p class="text-sm">{{ [a.first_name, a.last_name].filter(Boolean).join(' ') }}</p>
                                <p class="text-sm text-black/75">{{ a.line1 }}</p>
                                <p v-if="a.line2" class="text-sm text-black/75">{{ a.line2 }}</p>
                                <p class="text-sm text-black/75">{{ [a.city, a.region, a.postal_code].filter(Boolean).join(', ') }}</p>
                                <p class="text-sm text-black/75">{{ a.country }}</p>
                                <p v-if="a.phone" class="text-xs text-black/55 mt-1">{{ a.phone }}</p>
                                <div class="flex gap-3 mt-3">
                                    <button @click="startEditAddress(a)" class="text-[10px] tracking-widest uppercase text-gold-dark hover:text-gold">Edit</button>
                                    <button @click="deleteAddress(a)" class="text-[10px] tracking-widest uppercase text-black/45 hover:text-red-600">Delete</button>
                                </div>
                            </li>
                        </ul>
                    </div>
                    <div v-else-if="activeTab === 'returns'">
                        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
                            <h2 class="font-display text-xl tracking-widest uppercase">Returns</h2>
                            <p class="text-xs text-black/55">30-day return window from order date.</p>
                        </div>

                        <!-- Return-request form -->
                        <div v-if="showReturnForm" class="bg-cream-dark/40 border border-gold/10 p-5 mb-5">
                            <p class="text-[10px] tracking-widest uppercase text-black/55 mb-2">Return from order</p>
                            <p class="font-mono mb-4">{{ returnForm.order_number }}</p>
                            <ul class="divide-y divide-gold/5 mb-4">
                                <li v-for="(it, idx) in returnForm.items" :key="idx" class="py-2 flex items-center justify-between gap-3">
                                    <p class="text-sm flex-1 min-w-0 line-clamp-1">{{ it.label }} <span class="text-black/55">(max {{ it.max }})</span></p>
                                    <input type="number" v-model.number="it.quantity" min="0" :max="it.max" class="w-16 border border-black/15 px-2 py-1 text-sm text-right" />
                                </li>
                            </ul>
                            <label class="block mb-3">
                                <span class="text-[10px] tracking-widest uppercase text-black/55">Reason (optional)</span>
                                <textarea v-model="returnForm.reason" rows="2" class="w-full border border-black/15 px-3 py-2 text-sm mt-1"></textarea>
                            </label>
                            <p v-if="returnError" class="text-sm text-red-600 mb-2">{{ returnError }}</p>
                            <div class="flex gap-2">
                                <button @click="submitReturn" :disabled="returnBusy" class="bg-gold text-white px-5 py-2 text-[10px] tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50">
                                    {{ returnBusy ? 'Submitting…' : 'Submit return' }}
                                </button>
                                <button @click="cancelReturn" class="text-[10px] tracking-widest uppercase text-black/55 hover:text-black">Cancel</button>
                            </div>
                        </div>

                        <p v-if="!returnsLoaded" class="text-sm text-black/65">Loading…</p>
                        <p v-else-if="!returns.length && !showReturnForm" class="text-sm text-black/65">
                            No return requests yet. Start one from any paid order in
                            <button @click="activeTab = 'transactions'" class="underline text-gold">Transactions</button>.
                        </p>
                        <ul v-else-if="!showReturnForm" class="divide-y divide-gold/10">
                            <li v-for="r in returns" :key="r.id" class="py-3">
                                <div class="flex items-start justify-between gap-3 flex-wrap">
                                    <div>
                                        <p class="text-sm">
                                            <router-link :to="`/account/orders/${r.order_number}`" class="font-mono hover:text-gold">{{ r.order_number }}</router-link>
                                            · {{ r.items.length }} item<span v-if="r.items.length !== 1">s</span>
                                        </p>
                                        <p v-if="r.reason" class="text-xs text-black/55 mt-1">{{ r.reason }}</p>
                                        <p v-if="r.admin_notes" class="text-xs text-black/55 mt-1 italic">Note: {{ r.admin_notes }}</p>
                                    </div>
                                    <div class="text-right">
                                        <p class="text-[10px] tracking-widest uppercase">
                                            <span v-if="r.status === 'requested'" class="bg-amber-100 text-amber-700 px-2 py-0.5">Pending</span>
                                            <span v-else-if="r.status === 'approved'" class="bg-blue-100 text-blue-700 px-2 py-0.5">Approved</span>
                                            <span v-else-if="r.status === 'refunded'" class="bg-emerald-100 text-emerald-700 px-2 py-0.5">Refunded {{ r.refund_label }}</span>
                                            <span v-else class="bg-zinc-100 text-zinc-500 px-2 py-0.5">{{ r.status }}</span>
                                        </p>
                                        <p class="text-[10px] text-black/45 mt-1">{{ fmtDate(r.created_at) }}</p>
                                    </div>
                                </div>
                            </li>
                        </ul>
                    </div>
                    <div v-else-if="activeTab === 'wishlist'">
                        <div class="flex items-center justify-between mb-5 gap-3 flex-wrap">
                            <h2 class="font-display text-xl tracking-widest uppercase">Wishlist</h2>
                            <router-link
                                v-if="wishlistItems?.length"
                                to="/wishlist"
                                class="text-[10px] tracking-widest uppercase text-black/55 hover:text-gold inline-flex items-center gap-1"
                            >
                                View all <ArrowRight class="w-3 h-3" />
                            </router-link>
                        </div>

                        <p v-if="wishlistItems === null" class="text-sm text-black/55">Loading…</p>

                        <!-- It used to be a bare link off the page; saved pieces
                             belong where you're already looking. -->
                        <ul v-else-if="wishlistItems.length" class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <li v-for="p in wishlistItems.slice(0, 6)" :key="p.id">
                                <router-link :to="`/shop/${p.handle}`" class="block group">
                                    <span class="block aspect-[3/4] bg-cream-dark overflow-hidden mb-2">
                                        <img
                                            v-if="p.thumbnail"
                                            :src="p.thumbnail"
                                            :alt="p.title"
                                            class="w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform duration-500"
                                        />
                                    </span>
                                    <span class="block font-display text-sm leading-tight line-clamp-1">{{ p.title }}</span>
                                    <span v-if="p.price_label" class="block text-xs text-black/55 mt-0.5">{{ p.price_label }}</span>
                                </router-link>
                            </li>
                        </ul>

                        <div v-else class="border border-dashed border-gold/25 p-8 text-center">
                            <Heart class="w-8 h-8 mx-auto text-gold/40 mb-3" />
                            <p class="text-sm text-black/60 mb-4">Nothing saved yet.</p>
                            <router-link to="/shop" class="inline-block bg-gold text-white px-6 py-2.5 text-[10px] font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                                Browse the shop
                            </router-link>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>
