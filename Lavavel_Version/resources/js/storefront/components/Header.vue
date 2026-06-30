<script>
export default {
    name: 'StoreHeader',
    data() {
        return {
            scrolled: false,
            activeMenu: null,
            navLinks: [
                {
                    label: 'Women',
                    href: '/shop?category=women',
                    submenu: [
                        { label: 'Dresses', href: '/shop?category=women&type=dresses' },
                        { label: 'Tops & Blouses', href: '/shop?category=women&type=tops' },
                        { label: 'Trousers & Skirts', href: '/shop?category=women&type=trousers' },
                        { label: 'Bags', href: '/shop?category=women&type=bags' },
                    ],
                },
                {
                    label: 'Men',
                    href: '/shop?category=men',
                    submenu: [
                        { label: 'Shirts', href: '/shop?category=men&type=shirts' },
                        { label: 'Trousers', href: '/shop?category=men&type=trousers' },
                        { label: 'Suits', href: '/shop?category=men&type=suits' },
                    ],
                },
                {
                    label: 'Children',
                    href: '/shop?category=children',
                    submenu: [
                        { label: 'Girls', href: '/shop?category=children&type=girls' },
                        { label: 'Boys', href: '/shop?category=children&type=boys' },
                    ],
                },
                { label: 'Sale', href: '/shop?sale=true', isSale: true },
            ],
        };
    },
    mounted() {
        window.addEventListener('scroll', this.handleScroll, { passive: true });
        this.handleScroll();
    },
    beforeUnmount() {
        window.removeEventListener('scroll', this.handleScroll);
    },
    methods: {
        handleScroll() {
            this.scrolled = window.scrollY > 24;
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
        <div class="max-w-[1600px] mx-auto px-[5%]">
            <div class="flex items-center justify-between py-4">
                <!-- Mobile menu button -->
                <button
                    class="lg:hidden p-2 -ml-2 hover:text-gold transition-colors"
                    aria-label="Open menu"
                >
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                    </svg>
                </button>

                <!-- Logo -->
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

                <!-- Desktop nav -->
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
                        :key="link.label"
                        class="relative"
                        @mouseenter="activeMenu = link.submenu ? link.label : null"
                        @mouseleave="activeMenu = null"
                    >
                        <a
                            :href="link.href"
                            :class="[
                                'relative flex items-center gap-1.5 font-body text-sm font-medium tracking-widest uppercase py-3 transition-colors',
                                link.isSale ? 'text-red-600' : 'text-black hover:text-gold',
                                activeMenu === link.label && 'text-gold',
                            ]"
                        >
                            {{ link.label }}
                            <svg
                                v-if="link.submenu"
                                :class="['w-3.5 h-3.5 transition-transform', activeMenu === link.label ? 'rotate-180' : '']"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                viewBox="0 0 24 24"
                            >
                                <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                        </a>
                        <div
                            v-if="link.submenu && activeMenu === link.label"
                            class="absolute left-0 top-full pt-3 z-30"
                        >
                            <div class="bg-white shadow-xl border border-gold/10 min-w-[220px] py-3">
                                <a
                                    v-for="sub in link.submenu"
                                    :key="sub.label"
                                    :href="sub.href"
                                    class="block px-5 py-2 text-sm text-black/80 hover:text-gold hover:bg-cream-dark transition-colors"
                                >
                                    {{ sub.label }}
                                </a>
                            </div>
                        </div>
                    </div>
                </nav>

                <!-- Right icons -->
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
                    </router-link>
                </div>
            </div>
        </div>
    </header>
</template>
