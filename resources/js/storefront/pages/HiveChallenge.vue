<script>
import { api } from '../../lib/api.js';
import { authStore } from '../auth-store.js';
import { hiveStore, whatsappShare } from '../hive-store.js';
import LookCard from '../components/hive/LookCard.vue';
import ReportSheet from '../components/hive/ReportSheet.vue';
import GiftSheet from '../components/hive/GiftSheet.vue';
import { ArrowLeft, Trophy, LoaderCircle, Share2, Plus } from 'lucide-vue-next';

/** One challenge: what it is, what it pays, when it closes — and everyone's entries. */
export default {
    name: 'HiveChallenge',
    components: { LookCard, ReportSheet, GiftSheet, ArrowLeft, Trophy, LoaderCircle, Share2, Plus },
    data() { return { auth: authStore.state, challenge: null, looks: [], next: null, loading: true, loadingMore: false, notFound: false, reporting: null, gifting: null, observer: null }; },
    computed: {
        deadline() {
            const c = this.challenge;
            if (!c) return '';
            if (c.state === 'awarded') return 'Winners announced';
            if (c.state === 'judging') return 'Closed — winners coming soon';
            if (c.state === 'upcoming') return `Opens ${new Date(c.starts_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
            const hours = Math.max(1, Math.round((new Date(c.ends_at) - Date.now()) / 3600000));
            return hours < 48 ? `${hours} ${hours === 1 ? 'hour' : 'hours'} left` : `${Math.round(hours / 24)} days left`;
        },
        shareHref() { return whatsappShare(`${this.challenge.tag} on Bless Hive${this.challenge.prize_bees ? ` — ${this.challenge.prize_bees} Bees to win` : ''}`, `/hive/challenge/${this.challenge.slug}`); },
    },
    mounted() {
        window.addEventListener('blessluxe:hive-posted', this.onPosted);
        this.observer = new IntersectionObserver((e) => { if (e[0].isIntersecting) this.load(false); }, { rootMargin: '800px' });
        this.load(true);
    },
    beforeUnmount() { window.removeEventListener('blessluxe:hive-posted', this.onPosted); this.observer?.disconnect(); },
    methods: {
        async load(reset) {
            if (!reset && (!this.next || this.loadingMore)) return;
            reset ? (this.loading = true) : (this.loadingMore = true);
            try {
                const qs = !reset && this.next ? `?before=${encodeURIComponent(this.next)}` : '';
                const d = await api.get(`/api/store/hive/challenges/${encodeURIComponent(this.$route.params.slug)}${qs}`);
                this.challenge = d.challenge;
                this.looks = reset ? d.looks : [...this.looks, ...d.looks];
                this.next = d.next;
                document.title = `${d.challenge.tag} · Bless Hive`;
            } catch (e) { this.notFound = e.status === 404; }
            finally {
                this.loading = false; this.loadingMore = false;
                this.$nextTick(() => { if (this.$refs.sentinel) this.observer?.observe(this.$refs.sentinel); });
            }
        },
        enter() { hiveStore.compose(this.$router, this.$route, { challengeId: this.challenge.id }); },
        onPosted(e) { if (e.detail.challenge_id === this.challenge?.id) { this.looks.unshift(e.detail); this.challenge.entries += 1; } },
        async gift(target) { if (await hiveStore.ready(this.$router, this.$route)) this.gifting = target; },
        report(s) {
            if (!this.auth.signedIn) { this.$router.push({ path: '/account/login', query: { next: this.$route.fullPath } }); return; }
            this.reporting = s;
        },
    },
};
</script>

<template>
    <div class="max-w-[34rem] mx-auto w-full px-4 sm:px-6 lg:px-0 py-3 lg:py-6">
        <router-link to="/hive" class="inline-flex items-center gap-2 h-11 text-sm text-black/60 hover:text-black"><ArrowLeft class="w-4 h-4" /> Home</router-link>

        <p v-if="loading && !challenge" class="text-sm text-black/40 py-16 text-center">Loading…</p>
        <div v-else-if="notFound" class="text-center py-20"><p class="text-black/55">That challenge isn't here any more.</p></div>

        <template v-else-if="challenge">
            <header class="bg-black text-white p-5 mb-4">
                <p class="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-gold"><Trophy class="w-4 h-4" /> Challenge · {{ deadline }}</p>
                <h1 class="font-display text-2xl tracking-wide mt-2">{{ challenge.title }}</h1>
                <p class="text-gold text-sm mt-0.5">{{ challenge.tag }}</p>
                <p v-if="challenge.description" class="text-sm text-white/75 leading-relaxed mt-3 whitespace-pre-line">{{ challenge.description }}</p>
                <div class="flex gap-6 mt-4 text-sm">
                    <span v-if="challenge.prize_bees"><strong class="text-gold">{{ challenge.prize_bees }} Bees</strong> <span class="text-white/60">× {{ challenge.winners }} {{ challenge.winners === 1 ? 'winner' : 'winners' }}</span></span>
                    <span><strong>{{ challenge.entries }}</strong> <span class="text-white/60">{{ challenge.entries === 1 ? 'entry' : 'entries' }}</span></span>
                </div>
                <div class="flex gap-2 mt-5">
                    <button v-if="challenge.state === 'live'" @click="enter" class="flex-1 bg-gold text-white py-3 text-xs font-semibold tracking-[0.2em] uppercase hover:bg-gold-dark inline-flex items-center justify-center gap-2"><Plus class="w-4 h-4" /> Enter a look</button>
                    <a :href="shareHref" target="_blank" rel="noopener" class="w-12 h-11 border border-white/25 inline-flex items-center justify-center flex-shrink-0" aria-label="Share on WhatsApp"><Share2 class="w-4 h-4" /></a>
                </div>
            </header>

            <p v-if="!looks.length" class="text-center text-sm text-black/50 py-14">No entries yet — yours could be the first.</p>
            <div v-else class="space-y-4">
                <LookCard v-for="l in looks" :key="l.id" :look="l" @removed="(id) => looks = looks.filter((x) => x.id !== id)" @report="report" @gift="gift" />
                <div ref="sentinel" class="h-14 flex items-center justify-center"><LoaderCircle v-if="loadingMore" class="w-5 h-5 animate-spin text-black/30" /></div>
            </div>
        </template>

        <GiftSheet :target="gifting" @close="gifting = null" />
        <ReportSheet :subject="reporting" @close="reporting = null" @sent="(s) => looks = looks.filter((x) => x.id !== s.id)" />
    </div>
</template>
