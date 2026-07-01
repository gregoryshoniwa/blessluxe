<script>
import { Search, X } from 'lucide-vue-next';

export default {
    name: 'SearchOverlay',
    components: { Search, X },
    props: {
        open: { type: Boolean, default: false },
    },
    emits: ['close'],
    data() {
        return {
            term: '',
            results: [],
            loading: false,
            // Cheap debounce — abort the in-flight fetch if the user keeps typing.
            inflight: null,
        };
    },
    watch: {
        open(v) {
            if (v) {
                this.$nextTick(() => this.$refs.input?.focus());
                document.body.style.overflow = 'hidden';
                window.addEventListener('keydown', this.onKey);
            } else {
                this.term = '';
                this.results = [];
                document.body.style.overflow = '';
                window.removeEventListener('keydown', this.onKey);
            }
        },
        term(v) { this.runSearch(v); },
    },
    beforeUnmount() {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', this.onKey);
    },
    methods: {
        close() { this.$emit('close'); },
        onKey(e) { if (e.key === 'Escape') this.close(); },
        async runSearch(q) {
            const v = q.trim();
            if (this.inflight) this.inflight.abort();
            if (!v) { this.results = []; this.loading = false; return; }
            this.loading = true;
            this.inflight = new AbortController();
            try {
                const r = await fetch(`/api/store/products?limit=8&q=${encodeURIComponent(v)}`,
                    { signal: this.inflight.signal });
                if (!r.ok) return;
                const data = await r.json();
                this.results = data.products || [];
            } catch (e) {
                if (e.name !== 'AbortError') this.results = [];
            } finally { this.loading = false; }
        },
        submit() {
            if (this.term.trim()) {
                this.$router.push({ path: '/shop', query: { q: this.term.trim() } });
                this.close();
            }
        },
    },
};
</script>

<template>
    <transition name="search-fade">
        <div v-if="open" class="fixed inset-0 z-50 bg-cream/95 backdrop-blur" @click.self="close">
            <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-16">
                <div class="flex items-center justify-between mb-6">
                    <p class="font-script text-2xl text-gold">Find</p>
                    <button @click="close" class="p-2 hover:text-gold transition-colors" aria-label="Close search">
                        <X class="w-5 h-5" />
                    </button>
                </div>
                <form @submit.prevent="submit" class="flex items-center gap-3 border-b-2 border-gold/40 focus-within:border-gold pb-2">
                    <Search class="w-5 h-5 text-gold-dark" />
                    <input
                        ref="input"
                        v-model="term"
                        type="search"
                        placeholder="Search dresses, bags, brands…"
                        class="flex-1 bg-transparent text-lg md:text-2xl font-display py-2 focus:outline-none placeholder:text-black/40"
                    />
                    <button v-if="term" type="button" @click="term = ''" class="text-xs tracking-widest uppercase text-black/55 hover:text-gold">Clear</button>
                </form>

                <div v-if="loading" class="mt-8 text-[10px] tracking-widest uppercase text-black/55 animate-pulse">Searching…</div>

                <div v-else-if="!term" class="mt-8 text-sm text-black/55">
                    Try “floral”, “evening gown”, or a category like “bags”.
                </div>

                <div v-else-if="!results.length" class="mt-8 text-sm text-black/55">
                    No matches for <strong>"{{ term }}"</strong>. Try a shorter or different term.
                </div>

                <ul v-else class="mt-6 divide-y divide-gold/10">
                    <li v-for="p in results" :key="p.id">
                        <router-link :to="`/shop/${p.handle}`" @click="close" class="flex gap-4 py-3 hover:bg-cream-dark/30 px-2 transition-colors">
                            <div class="w-14 h-16 bg-cream-dark flex-shrink-0 overflow-hidden">
                                <img v-if="p.thumbnail" :src="p.thumbnail" :alt="p.title" class="w-full h-full object-cover object-top" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="font-display text-base line-clamp-1">{{ p.title }}</p>
                                <p v-if="p.subtitle" class="text-xs text-black/55 line-clamp-1">{{ p.subtitle }}</p>
                            </div>
                            <p class="text-sm font-medium">{{ p.price_label || '—' }}</p>
                        </router-link>
                    </li>
                </ul>

                <div v-if="results.length" class="mt-6 text-center">
                    <button @click="submit" class="text-xs tracking-widest uppercase text-gold-dark hover:text-gold underline">
                        See all results →
                    </button>
                </div>
            </div>
        </div>
    </transition>
</template>

<style scoped>
.search-fade-enter-active, .search-fade-leave-active { transition: opacity 0.18s; }
.search-fade-enter-from, .search-fade-leave-to { opacity: 0; }
</style>
