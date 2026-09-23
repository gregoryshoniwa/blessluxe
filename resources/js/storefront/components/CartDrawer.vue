<script>
import { cart, state } from '../cart-store.js';
import { X, ShoppingBag, ArrowRight, Trash2, Loader2 } from 'lucide-vue-next';

/**
 * The bag, slid in from the side. Opens when something is added, so the size
 * and price can be checked without leaving the page being browsed — and closes
 * back to exactly where they were. Mounted once, in App.vue.
 *
 * Deliberately NOT a checkout: quantity and remove only. Anything more (courier
 * choice, Bees, addresses) belongs on /cart and the checkout steps.
 */
export default {
    name: 'CartDrawer',
    components: { X, ShoppingBag, ArrowRight, Trash2, Loader2 },
    data() {
        return { bag: state, busyLine: null };
    },
    computed: {
        subtotal() { return this.money(this.bag.subtotal); },
    },
    watch: {
        // The page behind must not scroll away under the drawer.
        'bag.open'(open) {
            document.body.classList.toggle('overflow-hidden', open);
            if (open) this.$nextTick(() => this.$refs.panel?.focus());
        },
        // Following a link from inside the bag closes it.
        $route() { cart.hide(); },
    },
    mounted() {
        window.addEventListener('keydown', this.onKey);
    },
    beforeUnmount() {
        window.removeEventListener('keydown', this.onKey);
        document.body.classList.remove('overflow-hidden');
    },
    methods: {
        close() { cart.hide(); },
        onKey(e) { if (e.key === 'Escape' && this.bag.open) this.close(); },
        money(cents) { return `$${((cents || 0) / 100).toFixed(2)}`; },
        async setQty(line, qty) {
            this.busyLine = line.id;
            try { await cart.setQty(line.id, qty); } catch { /* the bag re-reads on the next open */ }
            finally { this.busyLine = null; }
        },
        async removeLine(line) {
            this.busyLine = line.id;
            try { await cart.remove(line.id); } catch { /* as above */ }
            finally { this.busyLine = null; }
        },
    },
};
</script>

<template>
    <teleport to="body">
        <transition name="fade">
            <div v-if="bag.open" class="fixed inset-0 bg-black/40 z-[70]" @click="close" aria-hidden="true"></div>
        </transition>

        <transition name="slide">
            <aside
                v-if="bag.open"
                ref="panel"
                tabindex="-1"
                role="dialog"
                aria-modal="true"
                aria-label="Your bag"
                class="fixed top-0 right-0 bottom-0 z-[71] w-full sm:w-[26rem] max-w-full bg-cream flex flex-col outline-none"
                style="height: 100dvh"
            >
                <header class="flex items-center justify-between px-5 py-4 border-b border-gold/20 flex-shrink-0">
                    <p class="font-display text-sm tracking-widest uppercase flex items-center gap-2">
                        <ShoppingBag class="w-4 h-4 text-gold" />
                        Your bag
                        <span v-if="bag.itemCount" class="text-black/45">· {{ bag.itemCount }}</span>
                    </p>
                    <button @click="close" class="w-11 h-11 -mr-3 inline-flex items-center justify-center hover:text-gold transition-colors" aria-label="Close bag">
                        <X class="w-5 h-5" />
                    </button>
                </header>

                <!-- Lines -->
                <div class="flex-1 overflow-y-auto px-5 py-4">
                    <p v-if="bag.loading && !bag.items.length" class="text-xs tracking-widest uppercase text-black/45 py-10 text-center">Loading…</p>

                    <div v-else-if="!bag.items.length" class="text-center py-14">
                        <ShoppingBag class="w-8 h-8 text-gold/40 mx-auto mb-4" />
                        <p class="font-display text-lg tracking-widest uppercase mb-2">Your bag is empty</p>
                        <p class="text-sm text-black/55 mb-6">Nothing chosen yet — the new season is waiting.</p>
                        <router-link to="/shop" @click="close" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                            Start shopping
                        </router-link>
                    </div>

                    <ul v-else class="space-y-5">
                        <li v-for="line in bag.items" :key="line.id" :class="['flex gap-4', busyLine === line.id && 'opacity-50']">
                            <router-link :to="`/shop/${line.product_handle}`" @click="close" class="w-20 h-24 bg-cream-dark flex-shrink-0 overflow-hidden">
                                <img v-if="line.thumbnail" :src="line.thumbnail" :alt="line.title" class="w-full h-full object-cover object-top" />
                            </router-link>

                            <div class="flex-1 min-w-0">
                                <!-- Name and the way out of it, on one line. -->
                                <div class="flex items-start gap-2">
                                    <router-link :to="`/shop/${line.product_handle}`" @click="close" class="flex-1 min-w-0 text-sm font-medium leading-snug line-clamp-2 hover:text-gold transition-colors">
                                        {{ line.title }}
                                    </router-link>
                                    <button
                                        @click="removeLine(line)"
                                        :disabled="busyLine === line.id"
                                        class="w-9 h-9 -mt-1 -mr-1 inline-flex items-center justify-center text-black/35 hover:text-red-600 transition-colors disabled:opacity-40"
                                        :title="`Remove ${line.title} from your bag`"
                                        :aria-label="`Remove ${line.title} from your bag`"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                </div>
                                <p v-if="line.variant_title" class="text-xs text-black/55 mt-0.5">{{ line.variant_title }}</p>

                                <!-- Quantity on the left, what that quantity costs on the right. -->
                                <div class="flex items-center justify-between gap-3 mt-3">
                                    <div class="flex border border-black/15">
                                        <button @click="setQty(line, line.quantity - 1)" :disabled="busyLine === line.id" class="w-8 h-8 inline-flex items-center justify-center text-base leading-none hover:bg-cream-dark disabled:opacity-40" :title="line.quantity === 1 ? 'Remove from your bag' : 'One fewer'" aria-label="One fewer">−</button>
                                        <span class="w-8 h-8 inline-flex items-center justify-center text-sm tabular-nums">{{ line.quantity }}</span>
                                        <button @click="setQty(line, line.quantity + 1)" :disabled="busyLine === line.id" class="w-8 h-8 inline-flex items-center justify-center text-base leading-none hover:bg-cream-dark disabled:opacity-40" title="One more" aria-label="One more">+</button>
                                    </div>
                                    <p class="text-sm font-medium tabular-nums">{{ money(line.line_total) }}</p>
                                </div>
                                <p v-if="line.quantity > 1" class="text-[11px] text-black/45 mt-1 text-right">{{ money(line.unit_price) }} each</p>
                            </div>
                        </li>
                    </ul>
                </div>

                <!-- Pay or look properly -->
                <footer v-if="bag.items.length" class="border-t border-gold/20 px-5 py-4 flex-shrink-0 bg-cream">
                    <div class="flex justify-between text-sm mb-1">
                        <span class="text-black/60">Subtotal</span>
                        <span class="font-semibold">{{ subtotal }}</span>
                    </div>
                    <p class="text-xs text-black/45 mb-4">Delivery and any payment charge are worked out at checkout.</p>

                    <router-link
                        to="/checkout"
                        @click="close"
                        class="flex items-center justify-center gap-2 w-full bg-gold text-white py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors"
                    >
                        Checkout
                        <ArrowRight class="w-4 h-4" />
                    </router-link>
                    <div class="flex items-center justify-between gap-3 mt-3">
                        <router-link to="/cart" @click="close" class="text-[10px] tracking-widest uppercase text-black/55 hover:text-gold transition-colors min-h-11 inline-flex items-center">
                            View full bag
                        </router-link>
                        <button @click="close" class="text-[10px] tracking-widest uppercase text-black/55 hover:text-gold transition-colors min-h-11">
                            Keep shopping
                        </button>
                    </div>
                </footer>
            </aside>
        </transition>
    </teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active, .slide-leave-active { transition: transform .25s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(100%); }
</style>
