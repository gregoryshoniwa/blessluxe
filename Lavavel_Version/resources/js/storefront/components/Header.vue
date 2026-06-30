<script>
export default {
    name: 'StoreHeader',
    data() {
        return {
            scrolled: false,
            activeMenu: null,
            headings: [],
            cartCount: 0,
            affiliate: null,
        };
    },
    computed: {
        navLinks() {
            // Map API headings into the same shape the template used to hardcode.
            return this.headings.map((h) => ({
                label: h.name,
                handle: h.handle,
                isSale: h.is_sale,
                href: h.is_sale ? '/shop?sale=true' : `/shop?heading=${h.handle}`,
                submenu: (h.catalogues || []).map((c) => ({
                    label: c.name,
                    href: `/shop?catalogue=${c.handle}`,
                })),
            }));
        },
    },
    mounted() {
        window.addEventListener('scroll', this.handleScroll, { passive: true });
        window.addEventListener('blessluxe:cart-updated', this.fetchCartCount);
        window.addEventListener('blessluxe:affiliate-changed', this.fetchAffiliate);
        this.handleScroll();
        this.fetchHeadings();
        this.fetchCartCount();
        this.fetchAffiliate();
    },
    beforeUnmount() {
        window.removeEventListener('scroll', this.handleScroll);
        window.removeEventListener('blessluxe:cart-updated', this.fetchCartCount);
        window.removeEventListener('blessluxe:affiliate-changed', this.fetchAffiliate);
    },
    methods: {
        handleScroll() {
            this.scrolled = window.scrollY > 24;
        },
        async fetchHeadings() {
            try {
                const res = await fetch('/api/store/headings', { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                this.headings = data.headings || [];
            } catch {
                /* nav silently falls back to empty; safe on first paint */
            }
        },
        async fetchCartCount() {
            try {
                const res = await fetch('/api/store/cart', { cache: 'no-store', credentials: 'include' });
                if (!res.ok) return;
                const data = await res.json();
                this.cartCount = data.cart?.item_count || 0;
            } catch {
                this.cartCount = 0;
            }
        },
        async fetchAffiliate() {
            try {
                const res = await fetch('/api/store/affiliate/active', { cache: 'no-store', credentials: 'include' });
                if (!res.ok) return;
                const data = await res.json();
                this.affiliate = data.affiliate || null;
            } catch {
                this.affiliate = null;
            }
        },
        async clearAffiliate() {
            try {
                await fetch('/api/store/affiliate/clear', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json',
                        'X-XSRF-TOKEN': decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || ''),
                    },
                });
            } catch { /* swallow */ }
            this.affiliate = null;
            window.dispatchEvent(new CustomEvent('blessluxe:affiliate-changed'));
        },
    },
};
</script>

<template>
    <header
        :class="[
            'sticky top-0 z-40 transition-all duration-300 border-b border-gold/10',
            scrolled ? 'bg-cream/95 backdrop-blur shadow-sm' : 'bg-cream/80',
        ]"
    >
        <!-- Affiliate attribution pill — sits above the nav so it's visible
             from any page in the funnel without crowding the brand row. -->
        <div v-if="affiliate" class="bg-gold/15 border-b border-gold/20">
            <div class="max-w-[1600px] mx-auto px-[5%] py-1.5 flex items-center justify-center gap-3 text-[10px] tracking-[0.32em] uppercase text-gold-dark">
                <span class="hidden sm:inline">Shopping via</span>
                <span class="font-mono font-semibold">{{ affiliate.code }}</span>
                <span v-if="affiliate.name && affiliate.name !== affiliate.code" class="hidden sm:inline">· {{ affiliate.name }}</span>
                <button @click="clearAffiliate" class="ml-2 text-black/40 hover:text-black transition-colors" title="Stop shopping via this affiliate">×</button>
            </div>
        </div>

        <div class="max-w-[1600px] mx-auto px-[5%]">
            <div class="flex items-center justify-between py-4">
                <button class="lg:hidden p-2 -ml-2 hover:text-gold transition-colors" aria-label="Open menu">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                    </svg>
                </button>

                <router-link to="/" class="flex items-center flex-shrink-0">
                    <img
                        src="/logo.png"
                        alt="BLESSLUXE"
                        :class="[
                            'w-auto transition-all duration-300 -my-4',
                            scrolled ? 'h-14 sm:h-16' : 'h-16 sm:h-20',
                        ]"
                    />
                </router-link>

                <nav class="hidden lg:flex items-center gap-8">
                    <router-link
                        to="/shop/packs"
                        active-class="text-gold"
                        class="font-body text-sm font-medium tracking-widest uppercase py-3 text-black hover:text-gold transition-colors"
                    >
                        Packs
                    </router-link>
                    <div
                        v-for="link in navLinks"
                        :key="link.handle"
                        class="relative"
                        @mouseenter="activeMenu = link.submenu.length ? link.handle : null"
                        @mouseleave="activeMenu = null"
                    >
                        <router-link
                            :to="link.href"
                            :class="[
                                'relative flex items-center gap-1.5 font-body text-sm font-medium tracking-widest uppercase py-3 transition-colors',
                                link.isSale ? 'text-red-600' : 'text-black hover:text-gold',
                                activeMenu === link.handle && 'text-gold',
                            ]"
                        >
                            {{ link.label }}
                            <svg
                                v-if="link.submenu.length"
                                :class="['w-3.5 h-3.5 transition-transform', activeMenu === link.handle ? 'rotate-180' : '']"
                                fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"
                            >
                                <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                        </router-link>
                        <div v-if="link.submenu.length && activeMenu === link.handle" class="absolute left-0 top-full pt-3 z-30">
                            <div class="bg-white shadow-xl border border-gold/10 min-w-[220px] py-3">
                                <router-link
                                    v-for="sub in link.submenu"
                                    :key="sub.href"
                                    :to="sub.href"
                                    class="block px-5 py-2 text-sm text-black/80 hover:text-gold hover:bg-cream-dark transition-colors"
                                >
                                    {{ sub.label }}
                                </router-link>
                            </div>
                        </div>
                    </div>
                </nav>

                <div class="flex items-center gap-1.5">
                    <button class="p-2 hover:text-gold transition-colors" aria-label="Search">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                    </button>
                    <router-link to="/account" class="p-2 hover:text-gold transition-colors" aria-label="Account">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                        </svg>
                    </router-link>
                    <router-link to="/wishlist" class="p-2 hover:text-gold transition-colors" aria-label="Wishlist">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                        </svg>
                    </router-link>
                    <router-link to="/cart" class="p-2 hover:text-gold transition-colors relative" aria-label="Cart">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                        </svg>
                        <span
                            v-if="cartCount > 0"
                            class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-gold text-white text-[10px] font-semibold rounded-full flex items-center justify-center"
                        >
                            {{ cartCount > 99 ? '99+' : cartCount }}
                        </span>
                    </router-link>
                </div>
            </div>
        </div>
    </header>
</template>
