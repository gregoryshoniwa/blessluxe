<script>
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';

/** "1–10 of 42 · 10 per page · ‹ 1 2 3 › " — shared by the Quick process tables. */
export default {
    name: 'QuickPager',
    components: { ChevronLeft, ChevronRight },
    props: {
        page: { type: Number, default: 1 },
        lastPage: { type: Number, default: 1 },
        total: { type: Number, default: 0 },
        from: { type: Number, default: null },
        to: { type: Number, default: null },
        per: { type: Number, default: 10 },
    },
    emits: ['page', 'per'],
    computed: {
        /** Up to seven page numbers around the current one, with the ends always reachable. */
        pages() {
            const last = this.lastPage, cur = this.page;
            if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
            const set = new Set([1, last, cur - 1, cur, cur + 1].filter((p) => p >= 1 && p <= last));
            const out = [];
            [...set].sort((a, b) => a - b).forEach((p, i, a) => { if (i && p - a[i - 1] > 1) out.push('…' + p); out.push(p); });
            return out;
        },
    },
};
</script>

<template>
    <div class="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 border-t border-zinc-200 text-xs text-zinc-600">
        <div class="flex items-center gap-3">
            <span class="tabular-nums">{{ total ? `${from}–${to} of ${total}` : '0 of 0' }}</span>
            <label class="inline-flex items-center gap-1.5">
                <select :value="per" @change="$emit('per', Number($event.target.value))" class="border border-zinc-300 px-2 py-1 bg-white" aria-label="Rows per page">
                    <option v-for="n in [10, 25, 50, 100]" :key="n" :value="n">{{ n }}</option>
                </select>
                per page
            </label>
        </div>
        <nav class="flex items-center gap-1" aria-label="Pages">
            <button :disabled="page <= 1" @click="$emit('page', page - 1)" class="w-8 h-8 inline-flex items-center justify-center border border-zinc-300 disabled:opacity-30" aria-label="Previous page" title="Previous page"><ChevronLeft class="w-4 h-4" /></button>
            <template v-for="p in pages" :key="p">
                <span v-if="typeof p === 'string'" class="px-1 text-zinc-400">…</span>
                <button v-else @click="$emit('page', p)" :aria-current="p === page ? 'page' : null" :class="['min-w-8 h-8 px-2 tabular-nums border', p === page ? 'border-gold bg-gold/10 text-gold-dark font-semibold' : 'border-zinc-300 hover:border-zinc-500']">{{ p }}</button>
            </template>
            <button :disabled="page >= lastPage" @click="$emit('page', page + 1)" class="w-8 h-8 inline-flex items-center justify-center border border-zinc-300 disabled:opacity-30" aria-label="Next page" title="Next page"><ChevronRight class="w-4 h-4" /></button>
        </nav>
    </div>
</template>
