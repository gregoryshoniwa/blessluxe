<script>
import { api } from '../../../lib/api.js';
import { toast } from '../../../lib/dialog.js';
import { Check, Search, LoaderCircle, Lock, Crown, Play, ExternalLink } from 'lucide-vue-next';

/**
 * The product gallery: everything BLESSLUXE sells, with the affiliate's own
 * price beside the list price. Picking an item and setting a markup are the
 * same screen, because choosing what to sell and what to charge for it is one
 * decision, not two.
 */
export default {
    name: 'StorefrontBuilder',
    components: { Check, Search, LoaderCircle, Lock, Crown, Play, ExternalLink },
    emits: ['changed'],
    data() {
        return {
            products: [],
            catalogues: [],
            pagination: null,
            loading: true,
            q: '',
            catalogue: '',
            page: 1,
            savingId: null,
            // Per-product markup drafts, so typing doesn't fire a save per keystroke.
            drafts: {},
            // Which card the cursor is over — drives hover playback.
            hoveringId: null,
        };
    },
    mounted() { this.fetch(); },
    methods: {
        /** Muted, looping YouTube embed — same treatment as the main shop. */
        youtubeSrc(video) {
            if (!video?.embed_url) return null;
            const id = video.embed_url.split('/').pop();
            return `${video.embed_url}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&playsinline=1&rel=0&modestbranding=1`;
        },
        /** "12 in stock", or "Made to order" when the variant isn't tracked. */
        stockLabel(p) {
            if (!p.variants?.length) return null;
            if (!p.any_tracked) return 'Made to order';
            return p.total_stock > 0 ? `${p.total_stock} in stock` : 'Out of stock';
        },
        async fetch() {
            this.loading = true;
            try {
                const params = new URLSearchParams({ page: this.page, limit: 24 });
                if (this.q) params.set('q', this.q);
                if (this.catalogue) params.set('catalogue', this.catalogue);
                const d = await api.get(`/api/account/affiliate/gallery?${params}`);
                this.products = d.products;
                this.catalogues = d.catalogues;
                this.pagination = d.pagination;
                this.drafts = Object.fromEntries(d.products.map((p) => [
                    p.id,
                    { type: p.markup_type || 'percent', value: p.markup_value ?? '' },
                ]));
            } catch (e) {
                toast(e.payload?.error || 'Could not load the gallery.', { tone: 'error' });
            } finally { this.loading = false; }
        },

        async toggle(p) {
            this.savingId = p.id;
            try {
                const d = await api.put(`/api/account/affiliate/products/${p.id}`, { selected: !p.selected });
                p.selected = d.selected;
                p.your_price_label = d.your_price_label;
                p.markup_label = d.markup_label;
                this.$emit('changed');
                toast(p.selected ? `${p.title} added to your line` : `${p.title} removed`);
            } catch (e) {
                toast(e.payload?.error || 'Could not update that piece.', { tone: 'error' });
            } finally { this.savingId = null; }
        },

        async saveMarkup(p) {
            const d0 = this.drafts[p.id];
            this.savingId = p.id;
            try {
                const d = await api.put(`/api/account/affiliate/products/${p.id}`, {
                    markup_type: d0.value === '' ? null : d0.type,
                    // Percent is a whole number; an amount is typed in dollars.
                    markup_value: d0.value === ''
                        ? null
                        : (d0.type === 'percent' ? Number(d0.value) : Math.round(Number(d0.value) * 100)),
                });
                p.your_price_label = d.your_price_label;
                p.markup_label = d.markup_label;
                this.$emit('changed');
                toast('Price updated');
            } catch (e) {
                toast(e.payload?.error || 'Could not save that price.', { tone: 'error' });
            } finally { this.savingId = null; }
        },

        async buyExclusive(p) {
            try {
                await api.post(`/api/account/affiliate/exclusivity/${p.id}`, {});
                toast('Exclusivity reserved — complete payment to activate it.');
                this.fetch();
            } catch (e) {
                toast(e.payload?.error || 'Could not start that.', { tone: 'error' });
            }
        },
    },
};
</script>

<template>
    <div>
        <div class="flex gap-2 mb-5 flex-wrap">
            <div class="relative flex-1 min-w-[200px]">
                <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
                <input
                    v-model="q"
                    @keyup.enter="page = 1; fetch()"
                    placeholder="Search pieces…"
                    class="w-full border border-black/15 pl-9 pr-3 py-2 text-sm"
                />
            </div>
            <select v-model="catalogue" @change="page = 1; fetch()" class="border border-black/15 px-3 py-2 text-sm">
                <option value="">All categories</option>
                <option v-for="c in catalogues" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
        </div>

        <p v-if="loading" class="text-sm text-black/55">Loading the gallery…</p>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <article
                v-for="p in products"
                :key="p.id"
                class="border bg-white transition-colors"
                :class="p.selected ? 'border-gold border-2' : 'border-gold/15'"
            >
                <!-- The image opens the product, exactly as it does on the main
                     shop. The controls below stay outside the link so picking a
                     piece or pricing it never navigates away. -->
                <router-link
                    :to="`/shop/${p.handle}`"
                    target="_blank"
                    class="block aspect-[3/4] bg-cream-dark overflow-hidden relative group"
                    @mouseenter="hoveringId = p.id"
                    @mouseleave="hoveringId = null"
                >
                    <img
                        v-if="p.thumbnail"
                        :src="p.thumbnail"
                        :alt="p.title"
                        class="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                    />

                    <!-- Hover playback. An uploaded file plays inline; YouTube
                         gets a muted looping iframe with pointer events off so
                         the card still clicks through. -->
                    <template v-if="p.video && hoveringId === p.id">
                        <video
                            v-if="p.video.kind === 'upload'"
                            :src="p.video.url"
                            autoplay muted loop playsinline
                            class="absolute inset-0 w-full h-full object-cover object-top"
                        />
                        <iframe
                            v-else-if="youtubeSrc(p.video)"
                            :src="youtubeSrc(p.video)"
                            class="absolute inset-0 w-full h-full pointer-events-none"
                            frameborder="0"
                            allow="autoplay; encrypted-media"
                            title="Product video"
                        />
                    </template>

                    <span
                        v-if="p.video"
                        class="absolute bottom-2 left-2 z-10 w-6 h-6 rounded-full bg-black/55 backdrop-blur flex items-center justify-center"
                        title="This piece has a video"
                    >
                        <Play class="w-3 h-3 text-white fill-white" />
                    </span>

                    <span class="absolute bottom-2 right-2 z-10 w-6 h-6 rounded-full bg-white/85 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Open the full piece">
                        <ExternalLink class="w-3 h-3 text-black/60" />
                    </span>

                    <!-- Somebody else owns this piece outright. -->
                    <span
                        v-if="p.exclusivity.held && !p.exclusivity.held_by_me"
                        class="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-white text-center px-3"
                    >
                        <Lock class="w-5 h-5 mb-2" />
                        <span class="text-[10px] tracking-widest uppercase">Held exclusively</span>
                    </span>
                    <span
                        v-else-if="p.exclusivity.held_by_me"
                        class="absolute top-2 left-2 bg-gold text-white text-[10px] tracking-widest uppercase px-2 py-1 inline-flex items-center gap-1"
                    >
                        <Crown class="w-3 h-3" /> Yours only
                    </span>
                </router-link>

                <div class="p-4">
                    <router-link :to="`/shop/${p.handle}`" target="_blank" class="font-display text-sm leading-tight line-clamp-1 hover:text-gold transition-colors block">
                        {{ p.title }}
                    </router-link>
                    <p class="text-xs text-black/45 mt-0.5">
                        BLESSLUXE {{ p.base_label }}
                        <template v-if="p.markup_label">
                            · <span class="text-gold-dark">yours {{ p.your_price_label }}</span>
                        </template>
                    </p>

                    <!-- Sizes and stock, only here: deciding what to carry means
                         knowing what can actually be supplied. -->
                    <div v-if="p.variants?.length" class="mt-2.5">
                        <div class="flex flex-wrap gap-1">
                            <span
                                v-for="v in p.variants"
                                :key="v.id"
                                :title="v.tracked ? `${v.stock} in stock` : 'Made to order'"
                                :class="[
                                    'text-[10px] tracking-widest uppercase px-1.5 py-0.5 border',
                                    v.in_stock
                                        ? 'border-black/15 text-black/70'
                                        : 'border-black/10 text-black/30 line-through',
                                ]"
                            >{{ v.title }}</span>
                        </div>
                        <p
                            class="text-[10px] tracking-widest uppercase mt-1.5"
                            :class="p.any_tracked && p.total_stock === 0 ? 'text-red-500' : 'text-black/40'"
                        >{{ stockLabel(p) }}</p>
                    </div>

                    <button
                        v-if="!(p.exclusivity.held && !p.exclusivity.held_by_me)"
                        @click="toggle(p)"
                        :disabled="savingId === p.id"
                        class="w-full mt-3 px-3 py-2 text-[10px] font-semibold tracking-[0.2em] uppercase transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1"
                        :class="p.selected ? 'bg-gold text-white hover:bg-gold-dark' : 'border border-black/15 hover:border-gold'"
                    >
                        <LoaderCircle v-if="savingId === p.id" class="w-3.5 h-3.5 animate-spin" />
                        <Check v-else-if="p.selected" class="w-3.5 h-3.5" />
                        {{ p.selected ? 'In your shop' : 'Add to my shop' }}
                    </button>

                    <!-- Pricing only matters once it's in their line. -->
                    <div v-if="p.selected" class="mt-3 pt-3 border-t border-gold/10">
                        <p class="text-[10px] tracking-widest uppercase text-black/45 mb-1.5">Your markup</p>
                        <div class="flex gap-1.5">
                            <select v-model="drafts[p.id].type" class="border border-black/15 px-2 py-1.5 text-xs">
                                <option value="percent">%</option>
                                <option value="amount">$</option>
                            </select>
                            <input
                                v-model="drafts[p.id].value"
                                @keyup.enter="saveMarkup(p)"
                                type="number" min="0" step="0.01" placeholder="0"
                                class="flex-1 min-w-0 border border-black/15 px-2 py-1.5 text-xs"
                            />
                            <button
                                @click="saveMarkup(p)"
                                :disabled="savingId === p.id"
                                class="bg-black text-white px-3 py-1.5 text-[10px] tracking-widest uppercase hover:bg-gold transition-colors disabled:opacity-50"
                            >Set</button>
                        </div>
                        <p class="text-[10px] text-black/45 mt-1.5">
                            You earn your commission <em>plus</em> this markup.
                        </p>
                    </div>

                    <!-- Exclusivity, when BLESSLUXE has put this piece up for it. -->
                    <div v-if="p.exclusivity.offered && !p.exclusivity.held" class="mt-3 pt-3 border-t border-gold/10">
                        <button
                            @click="buyExclusive(p)"
                            class="w-full border border-gold/40 text-gold-dark px-3 py-2 text-[10px] tracking-widest uppercase hover:bg-gold/10 transition-colors inline-flex items-center justify-center gap-1"
                        >
                            <Crown class="w-3.5 h-3.5" />
                            Sell it exclusively · {{ p.exclusivity.fee_label }}
                        </button>
                        <p class="text-[10px] text-black/45 mt-1.5">
                            {{ p.exclusivity.term_days }} days, only on your page.
                            <template v-if="p.exclusivity.min_units">
                                Sell {{ p.exclusivity.min_units }} to keep it.
                            </template>
                        </p>
                    </div>
                </div>
            </article>
        </div>

        <div v-if="pagination && pagination.last_page > 1" class="flex items-center justify-center gap-3 mt-6 text-xs">
            <button @click="page--; fetch()" :disabled="page <= 1" class="border border-black/15 px-3 py-1 disabled:opacity-40">Prev</button>
            <span class="text-black/55">Page {{ pagination.page }} of {{ pagination.last_page }}</span>
            <button @click="page++; fetch()" :disabled="page >= pagination.last_page" class="border border-black/15 px-3 py-1 disabled:opacity-40">Next</button>
        </div>
    </div>
</template>
