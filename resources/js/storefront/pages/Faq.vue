<script>
import { api } from '../../lib/api.js';

export default {
    name: 'FaqPage',
    data() {
        return { groups: [], loading: true, open: {} };
    },
    async mounted() {
        try {
            const d = await api.get('/api/store/faqs');
            this.groups = d.groups || [];
        } finally { this.loading = false; }
    },
};
</script>

<template>
    <div class="max-w-[900px] mx-auto px-[5%] py-12 min-h-[60vh]">
        <header class="text-center mb-12">
            <p class="font-script text-3xl text-gold">We can help</p>
            <h1 class="font-display text-3xl md:text-4xl tracking-widest uppercase">Frequently Asked</h1>
        </header>

        <div v-if="loading" class="text-center py-16 text-[10px] tracking-widest uppercase text-black/55 animate-pulse">Loading help articles…</div>

        <div v-else-if="!groups.length" class="text-center py-16">
            <p class="text-sm text-black/65 mb-4">No FAQs yet — reach out to <a href="mailto:info@blessluxe.com" class="underline text-gold">info@blessluxe.com</a> and our concierge will answer.</p>
        </div>

        <div v-else class="space-y-10">
            <section v-for="g in groups" :key="g.category">
                <h2 class="font-display text-sm tracking-widest uppercase text-gold border-b border-gold/20 pb-2 mb-4">{{ g.category }}</h2>
                <details v-for="f in g.faqs" :key="f.id" class="border-b border-gold/10 py-3 group">
                    <summary class="flex items-center justify-between cursor-pointer list-none">
                        <span class="font-display text-base text-black group-open:text-gold transition-colors">{{ f.question }}</span>
                        <span class="text-gold-dark text-xl group-open:rotate-45 transition-transform">+</span>
                    </summary>
                    <p class="text-sm text-black/70 leading-relaxed mt-3 whitespace-pre-line">{{ f.answer }}</p>
                </details>
            </section>
        </div>
    </div>
</template>
