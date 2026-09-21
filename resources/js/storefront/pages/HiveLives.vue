<script>
import { api } from '../../lib/api.js';
import { hiveStore } from '../hive-store.js';
import LiveTile from '../components/hive/LiveTile.vue';
import LiveScheduler from '../components/hive/LiveScheduler.vue';
import { Radio, Plus } from 'lucide-vue-next';

/** Live in the Hive: on now, coming up, and recent ones you can watch again. */
export default {
    name: 'HiveLives',
    components: { LiveTile, LiveScheduler, Radio, Plus },
    data() { return { d: { live: [], upcoming: [], past: [] }, loading: true, scheduling: false }; },
    computed: { empty() { return !this.d.live.length && !this.d.upcoming.length && !this.d.past.length; } },
    mounted() {
        document.title = 'Live · Bless Hive';
        this.load();
        if (this.$route.query.schedule) this.schedule();
    },
    methods: {
        async load() {
            try { this.d = await api.get('/api/store/hive/lives'); } catch { /* empty state */ }
            finally { this.loading = false; }
        },
        async schedule() { if (await hiveStore.ready(this.$router, this.$route)) this.scheduling = true; },
        onScheduled(live) { this.scheduling = false; this.$router.push(`/hive/live/${live.id}`); },
    },
};
</script>

<template>
    <div class="max-w-3xl mx-auto px-4 sm:px-6 py-4 lg:py-8">
        <div class="flex items-center justify-between gap-3 mb-5">
            <h1 class="font-display text-2xl tracking-widest uppercase flex items-center gap-2"><Radio class="w-5 h-5 text-gold" /> Live</h1>
            <button @click="schedule" class="h-10 px-5 rounded-full bg-gold text-white text-xs font-semibold tracking-[0.15em] uppercase hover:bg-gold-dark inline-flex items-center gap-1.5"><Plus class="w-4 h-4" /> Schedule</button>
        </div>

        <p v-if="loading" class="text-sm text-black/40 py-16 text-center">Loading…</p>
        <div v-else-if="empty" class="text-center py-16">
            <Radio class="w-9 h-9 text-gold mx-auto mb-3" />
            <p class="text-black/60 mb-6 max-w-xs mx-auto">No lives scheduled yet. Style a haul, answer questions, show a drop — and let people thank you with gifts.</p>
            <button @click="schedule" class="bg-gold text-white px-8 py-3.5 rounded-full text-xs font-semibold tracking-[0.25em] uppercase hover:bg-gold-dark">Schedule a live</button>
        </div>

        <template v-else>
            <section v-for="s in [{ k: 'live', t: 'On now' }, { k: 'upcoming', t: 'Coming up' }, { k: 'past', t: 'Watch again' }]" :key="s.k" v-show="d[s.k].length" class="mb-8">
                <h2 class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-3">{{ s.t }}</h2>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <LiveTile v-for="l in d[s.k]" :key="l.id" :live="l" />
                </div>
            </section>
        </template>

        <LiveScheduler v-if="scheduling" @close="scheduling = false" @scheduled="onScheduled" />
    </div>
</template>
