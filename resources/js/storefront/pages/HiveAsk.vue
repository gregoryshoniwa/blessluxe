<script>
import { api } from '../../lib/api.js';
import { authStore } from '../auth-store.js';
import { hiveStore, occasionLabel } from '../hive-store.js';
import AskCard from '../components/hive/AskCard.vue';
import AskComposer from '../components/hive/AskComposer.vue';
import ReportSheet from '../components/hive/ReportSheet.vue';
import { LoaderCircle, MessageCircleQuestion, Plus } from 'lucide-vue-next';

/** Ask — "what do I wear to…?" Questions are answered with pieces from the shop. */
export default {
    name: 'HiveAsk',
    components: { AskCard, AskComposer, ReportSheet, LoaderCircle, MessageCircleQuestion, Plus },
    data() {
        return { auth: authStore.state, asks: [], next: null, loading: true, loadingMore: false, mine: false, occasion: '', occasions: [], reward: 0, asking: false, reporting: null, observer: null, ticket: 0 };
    },
    watch: {
        mine() { this.load(true); },
        occasion() { this.load(true); },
    },
    mounted() {
        document.title = 'Ask · Bless Hive';
        this.observer = new IntersectionObserver((e) => { if (e[0].isIntersecting) this.load(false); }, { rootMargin: '800px' });
        this.load(true);
    },
    beforeUnmount() { this.observer?.disconnect(); },
    methods: {
        occasionLabel,
        async load(reset) {
            if (!reset && (!this.next || this.loadingMore || this.loading)) return;
            const ticket = reset ? ++this.ticket : this.ticket;
            reset ? (this.loading = true) : (this.loadingMore = true);
            try {
                const params = new URLSearchParams();
                if (this.mine) params.set('mine', '1');
                if (this.occasion) params.set('occasion', this.occasion);
                if (!reset && this.next) params.set('before', this.next);
                const d = await api.get(`/api/store/hive/asks?${params}`);
                if (ticket !== this.ticket) return;
                this.asks = reset ? d.asks : [...this.asks, ...d.asks];
                this.next = d.next;
                this.occasions = d.occasions;
                this.reward = d.reward;
            } catch { /* empty state */ }
            finally {
                if (ticket === this.ticket) { this.loading = false; this.loadingMore = false; }
                this.$nextTick(() => { if (this.$refs.sentinel) this.observer?.observe(this.$refs.sentinel); });
            }
        },
        async ask() { if (await hiveStore.ready(this.$router, this.$route)) this.asking = true; },
        onPosted(a) { this.asking = false; this.$router.push(`/hive/ask/${a.id}`); },
        pickMine() {
            if (!this.auth.signedIn) { this.$router.push({ path: '/account/login', query: { next: '/hive/ask' } }); return; }
            this.mine = true;
        },
        report(s) {
            if (!this.auth.signedIn) { this.$router.push({ path: '/account/login', query: { next: '/hive/ask' } }); return; }
            this.reporting = s;
        },
        onReported(s) { this.asks = this.asks.filter((a) => a.id !== s.id); },
    },
};
</script>

<template>
    <div class="max-w-[34rem] mx-auto w-full sm:px-6 lg:px-0">
        <div class="sticky top-0 z-30 bg-cream px-4 sm:px-0 pt-3 pb-2.5 border-b border-black/5 sm:border-0">
            <div class="flex items-center gap-2">
                <div class="flex p-1 rounded-full bg-black/5 flex-1">
                    <button @click="mine = false" :class="['flex-1 py-2 rounded-full text-xs tracking-widest uppercase transition-colors', !mine ? 'bg-white shadow-sm text-black' : 'text-black/50']">Everyone</button>
                    <button @click="pickMine" :class="['flex-1 py-2 rounded-full text-xs tracking-widest uppercase transition-colors', mine ? 'bg-white shadow-sm text-black' : 'text-black/50']">Mine</button>
                </div>
                <button @click="ask" class="h-10 px-5 rounded-full bg-gold text-white text-xs font-semibold tracking-[0.15em] uppercase hover:bg-gold-dark inline-flex items-center gap-1.5 flex-shrink-0"><Plus class="w-4 h-4" /> Ask</button>
            </div>
            <div class="scroll-strip scroll-px-4 sm:scroll-px-0 flex gap-1.5 overflow-x-auto [scrollbar-width:none] mt-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                <button @click="occasion = ''" :class="['px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap flex-shrink-0', !occasion ? 'bg-black text-white' : 'bg-white border border-black/10 text-black/65']">All</button>
                <button v-for="o in occasions" :key="o" @click="occasion = occasion === o ? '' : o" :class="['px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap flex-shrink-0', occasion === o ? 'bg-black text-white' : 'bg-white border border-black/10 text-black/65']">{{ occasionLabel(o) }}</button>
            </div>
        </div>

        <div class="px-4 sm:px-0 pt-3 pb-6">
            <p v-if="loading" class="text-sm text-black/40 py-16 text-center">Loading…</p>

            <div v-else-if="!asks.length" class="text-center py-20">
                <MessageCircleQuestion class="w-9 h-9 text-gold mx-auto mb-3" />
                <p class="text-black/60 mb-6 max-w-xs mx-auto">{{ mine ? "You haven't asked anything yet." : 'Stuck on what to wear? Ask — people answer with real pieces you can buy.' }}</p>
                <button @click="ask" class="bg-gold text-white px-8 py-3.5 rounded-full text-xs font-semibold tracking-[0.25em] uppercase hover:bg-gold-dark">Ask the Hive</button>
            </div>

            <div v-else class="space-y-4">
                <AskCard v-for="a in asks" :key="a.id" :ask="a" @removed="(id) => asks = asks.filter((x) => x.id !== id)" @report="report" />
                <div ref="sentinel" class="h-16 flex items-center justify-center"><LoaderCircle v-if="loadingMore" class="w-5 h-5 animate-spin text-black/30" /></div>
            </div>
        </div>

        <AskComposer v-if="asking" :occasions="occasions" :reward="reward" @close="asking = false" @posted="onPosted" />
        <ReportSheet :subject="reporting" @close="reporting = null" @sent="onReported" />
    </div>
</template>
