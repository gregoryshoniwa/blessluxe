<script>
import { X, User, Heart, ShoppingBag, Search, ChevronRight } from 'lucide-vue-next';
import { api } from '../../lib/api.js';

export default {
    name: 'MobileNavDrawer',
    components: { X, User, Heart, ShoppingBag, Search, ChevronRight },
    props: {
        open: { type: Boolean, default: false },
        navLinks: { type: Array, required: true },
    },
    emits: ['close', 'open-search'],
    data() {
        return { expanded: null, customer: null };
    },
    watch: {
        async open(v) {
            if (v) {
                document.body.style.overflow = 'hidden';
                try {
                    const d = await api.get('/api/account/me');
                    this.customer = d.customer;
                } catch { this.customer = null; }
            } else {
                document.body.style.overflow = '';
                this.expanded = null;
            }
        },
    },
    beforeUnmount() {
        document.body.style.overflow = '';
    },
    methods: {
        close() { this.$emit('close'); },
        openSearch() { this.$emit('open-search'); this.close(); },
        toggle(handle) {
            this.expanded = this.expanded === handle ? null : handle;
        },
    },
};
</script>

<template>
    <transition name="drawer-fade">
        <div v-if="open" class="fixed inset-0 z-50 bg-black/40 lg:hidden" @click.self="close">
            <transition name="drawer-slide" appear>
                <aside v-if="open" class="absolute top-0 left-0 h-full w-[85%] max-w-sm bg-cream shadow-xl overflow-y-auto">
                    <header class="flex items-center justify-between border-b border-gold/15 px-5 py-4">
                        <img src="/logo.png" alt="BLESSLUXE" class="h-10" />
                        <button @click="close" class="p-2 hover:text-gold" aria-label="Close menu">
                            <X class="w-5 h-5" />
                        </button>
                    </header>

                    <!-- Search shortcut -->
                    <button @click="openSearch" class="flex items-center gap-3 w-full px-5 py-4 bg-cream-dark/40 hover:bg-cream-dark transition-colors border-b border-gold/10">
                        <Search class="w-4 h-4 text-gold-dark" />
                        <span class="text-sm tracking-wide text-black/65">Search dresses, bags…</span>
                    </button>

                    <!-- Primary nav -->
                    <nav class="py-2">
                        <router-link to="/shop/packs" @click="close" class="block px-5 py-3 text-sm font-body tracking-widest uppercase hover:text-gold transition-colors">
                            Packs
                        </router-link>
                        <div v-for="link in navLinks" :key="link.handle">
                            <button
                                @click="link.submenu.length ? toggle(link.handle) : (close(), $router.push(link.href))"
                                :class="[
                                    'w-full text-left px-5 py-3 text-sm font-body tracking-widest uppercase flex items-center justify-between transition-colors',
                                    link.isSale ? 'text-red-600' : 'hover:text-gold',
                                ]"
                            >
                                <span>{{ link.label }}</span>
                                <ChevronRight v-if="link.submenu.length" :class="['w-4 h-4 transition-transform', expanded === link.handle ? 'rotate-90' : '']" />
                            </button>
                            <div v-if="link.submenu.length && expanded === link.handle" class="bg-cream-dark/30">
                                <router-link
                                    v-for="sub in link.submenu"
                                    :key="sub.href"
                                    :to="sub.href"
                                    @click="close"
                                    class="block pl-10 pr-5 py-2.5 text-sm text-black/70 hover:text-gold transition-colors"
                                >
                                    {{ sub.label }}
                                </router-link>
                            </div>
                        </div>
                    </nav>

                    <!-- Account block -->
                    <div class="border-t border-gold/15 px-5 py-5 mt-2 bg-white">
                        <template v-if="customer">
                            <p class="text-[10px] tracking-widest uppercase text-black/55 mb-1">Signed in as</p>
                            <p class="font-display text-base mb-3">{{ customer.email }}</p>
                            <router-link to="/account" @click="close" class="block w-full text-center border border-gold text-gold py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-gold hover:text-white transition-colors">
                                My Account
                            </router-link>
                        </template>
                        <template v-else>
                            <router-link to="/account/login" @click="close" class="block w-full text-center bg-gold text-white py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors mb-2">
                                Sign In
                            </router-link>
                            <router-link to="/account/signup" @click="close" class="block text-center text-xs tracking-widest uppercase text-black/55 hover:text-gold">
                                Create an account
                            </router-link>
                        </template>
                    </div>

                    <!-- Quick links -->
                    <div class="grid grid-cols-2 gap-px bg-gold/10 mt-2">
                        <router-link to="/wishlist" @click="close" class="bg-white py-4 flex flex-col items-center text-xs tracking-widest uppercase hover:text-gold transition-colors">
                            <Heart class="w-4 h-4 mb-1" /> Wishlist
                        </router-link>
                        <router-link to="/cart" @click="close" class="bg-white py-4 flex flex-col items-center text-xs tracking-widest uppercase hover:text-gold transition-colors">
                            <ShoppingBag class="w-4 h-4 mb-1" /> Cart
                        </router-link>
                    </div>

                    <div class="px-5 py-6 text-[10px] tracking-widest uppercase text-black/40 text-center">
                        BLESSLUXE · Luxury Atelier
                    </div>
                </aside>
            </transition>
        </div>
    </transition>
</template>

<style scoped>
.drawer-fade-enter-active, .drawer-fade-leave-active { transition: opacity 0.2s; }
.drawer-fade-enter-from, .drawer-fade-leave-to { opacity: 0; }
.drawer-slide-enter-active, .drawer-slide-leave-active { transition: transform 0.25s ease; }
.drawer-slide-enter-from, .drawer-slide-leave-to { transform: translateX(-100%); }
</style>
