<script>
import { api } from '../lib/api.js';
import { Search, X, LoaderCircle, Package, ImageOff } from 'lucide-vue-next';

/**
 * The "@" panel: find a product or pack and drop it into the message.
 *
 * Opens above the composer and takes the keyboard while it is open — type to
 * search, ↑/↓ to move, Enter to choose, Esc to go back to the message. One
 * search box rather than "keep typing after the @": it behaves the same when
 * opened from the button, and it works on a phone, where there are no arrow
 * keys and the text being typed is hidden behind the keyboard anyway.
 *
 * A LIST, not a grid, on purpose: rows give every item the same keyboard path
 * and leave room for the title, which is what people actually recognise.
 *
 * Search, tabs and paging are all server-side — the catalogue can be any size
 * and this only ever holds the rows on screen.
 */
export default {
    name: 'MentionPicker',
    components: { Search, X, LoaderCircle, Package, ImageOff },
    props: {
        // e.g. '/api/account/affiliate/mentions'
        endpoint: { type: String, required: true },
        // type:id keys already attached to the draft — shown as chosen.
        chosen: { type: Array, default: () => [] },
    },
    emits: ['pick', 'close'],
    data() {
        return {
            q: '',
            tab: 'all',
            tabs: [{ key: 'all', label: 'All' }, { key: 'packs', label: 'Packs' }],
            items: [],
            page: 1,
            hasMore: false,
            loading: false,
            active: 0,
            timer: null,
            // Responses can land out of order while someone types; only the
            // newest request is allowed to write to the list.
            ticket: 0,
        };
    },
    watch: {
        q() {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.load(true), 200);
        },
        tab() { this.load(true); },
    },
    mounted() {
        this.load(true);
        this.$nextTick(() => this.$refs.search?.focus());
    },
    beforeUnmount() { clearTimeout(this.timer); },
    methods: {
        async load(reset) {
            const ticket = ++this.ticket;
            const page = reset ? 1 : this.page + 1;
            this.loading = true;
            try {
                const params = new URLSearchParams({ tab: this.tab, page: String(page) });
                if (this.q.trim()) params.set('q', this.q.trim());
                const d = await api.get(`${this.endpoint}?${params}`);
                if (ticket !== this.ticket) return;

                this.tabs = d.tabs?.length ? d.tabs : this.tabs;
                this.items = reset ? d.items : [...this.items, ...d.items];
                this.page = page;
                this.hasMore = Boolean(d.has_more);
                if (reset) {
                    this.active = 0;
                    this.$nextTick(() => { if (this.$refs.list) this.$refs.list.scrollTop = 0; });
                }
            } catch {
                if (ticket === this.ticket && reset) this.items = [];
            } finally {
                if (ticket === this.ticket) this.loading = false;
            }
        },

        onScroll(e) {
            const el = e.target;
            if (this.hasMore && !this.loading && el.scrollHeight - el.scrollTop - el.clientHeight < 160) {
                this.load(false);
            }
        },

        isChosen(item) { return this.chosen.includes(`${item.type}:${item.id}`); },

        pick(item) {
            if (!item || this.isChosen(item)) return;
            this.$emit('pick', item);
        },

        onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); this.$emit('close'); return; }
            if (e.key === 'Enter') { e.preventDefault(); this.pick(this.items[this.active]); return; }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

            e.preventDefault();
            if (!this.items.length) return;
            const step = e.key === 'ArrowDown' ? 1 : -1;
            this.active = (this.active + step + this.items.length) % this.items.length;
            this.$nextTick(() => {
                this.$refs.list?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
            });
        },
    },
};
</script>

<template>
    <div
        class="bg-white border border-black/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[min(26rem,60vh)]"
        role="dialog"
        aria-label="Reference a product"
        @keydown="onKey"
    >
        <!-- Search -->
        <div class="flex items-center gap-2 px-3 py-2.5 border-b border-black/8 flex-shrink-0">
            <Search class="w-4 h-4 text-black/35 flex-shrink-0" />
            <input
                ref="search"
                v-model="q"
                placeholder="Search products and packs…"
                class="flex-1 min-w-0 text-sm bg-transparent focus:outline-none placeholder:text-black/35"
                autocomplete="off"
                spellcheck="false"
            />
            <LoaderCircle v-if="loading" class="w-3.5 h-3.5 animate-spin text-black/30 flex-shrink-0" />
            <button @click="$emit('close')" class="text-black/35 hover:text-black flex-shrink-0" aria-label="Close" title="Close (Esc)">
                <X class="w-4 h-4" />
            </button>
        </div>

        <!-- Tabs: the shop's own headings, so this reads like the shop. -->
        <div class="flex gap-1.5 px-3 py-2 border-b border-black/8 overflow-x-auto flex-shrink-0 [scrollbar-width:none]">
            <button
                v-for="t in tabs"
                :key="t.key"
                @click="tab = t.key"
                :class="[
                    'px-3 py-1 rounded-full text-[11px] whitespace-nowrap transition-colors flex-shrink-0',
                    tab === t.key ? 'bg-gold text-white' : 'bg-black/5 text-black/60 hover:bg-black/10',
                ]"
            >
                {{ t.label }}
            </button>
        </div>

        <!-- Results -->
        <div ref="list" class="flex-1 min-h-0 overflow-y-auto overscroll-contain" @scroll.passive="onScroll">
            <p v-if="!items.length && !loading" class="text-sm text-black/40 text-center py-10 px-4">
                {{ q ? `Nothing matches “${q}”.` : 'Nothing here yet.' }}
            </p>

            <button
                v-for="(item, i) in items"
                :key="`${item.type}:${item.id}`"
                :data-active="i === active"
                @click="pick(item)"
                @mousemove="active = i"
                :disabled="isChosen(item)"
                :class="[
                    'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                    i === active ? 'bg-gold/10' : '',
                    isChosen(item) ? 'opacity-45 cursor-default' : '',
                ]"
            >
                <span class="w-11 h-14 rounded-md overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0 border border-black/5">
                    <img v-if="item.thumbnail" :src="item.thumbnail" loading="lazy" class="w-full h-full object-cover" alt="" />
                    <component v-else :is="item.type === 'pack' ? 'Package' : 'ImageOff'" class="w-4 h-4 text-black/25" />
                </span>
                <span class="min-w-0 flex-1">
                    <span class="block text-sm truncate">{{ item.title }}</span>
                    <span class="block text-[11px] text-black/45 truncate">
                        <span v-if="item.type === 'pack'" class="text-gold-dark">Pack · </span>{{ item.price_label }}
                    </span>
                </span>
                <span v-if="isChosen(item)" class="text-[10px] tracking-widest uppercase text-black/40 flex-shrink-0">Added</span>
            </button>
        </div>

        <p class="hidden sm:block px-3 py-1.5 border-t border-black/8 text-[10px] text-black/35 flex-shrink-0">
            ↑ ↓ to move · Enter to add · Esc to close
        </p>
    </div>
</template>
