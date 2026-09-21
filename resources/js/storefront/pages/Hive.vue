<script>
import { api } from '../../lib/api.js';
import { authStore } from '../auth-store.js';
import { hiveStore, occasionLabel } from '../hive-store.js';
import LookCard from '../components/hive/LookCard.vue';
import ReportSheet from '../components/hive/ReportSheet.vue';
import GiftSheet from '../components/hive/GiftSheet.vue';
import { UserRound, Ruler, LoaderCircle, Sparkles, Search, Trophy, ChevronRight, Radio } from 'lucide-vue-next';

/**
 * Bless Hive — Home. The whole screen is the feed (the frame around it is
 * HiveShell): one column, endless scroll, keyset-paged so nothing repeats or
 * skips while new looks arrive. Open to read without an account.
 */
export default {
    name: 'HiveHome',
    components: { LookCard, ReportSheet, GiftSheet, UserRound, Ruler, LoaderCircle, Sparkles, Search, Trophy, ChevronRight, Radio },
    data() {
        return {
            auth: authStore.state,
            hive: hiveStore.state,
            scope: 'everyone',
            occasion: this.$route.query.occasion || '',
            looks: [],
            next: null,
            loading: true,
            loadingMore: false,
            failed: false,
            twins: [],
            twinsReady: true,
            suggested: [],
            challenges: [],
            lives: [],
            reporting: null, gifting: null,
            observer: null,
            ticket: 0,
        };
    },
    computed: {
        me() { return this.hive.me; },
        occasions() {
            const keys = this.hive.options.occasions.length
                ? this.hive.options.occasions
                : ['everyday', 'work', 'church', 'wedding', 'roora', 'kitchen-party', 'graduation', 'date', 'party'];
            return keys.map((k) => ({ key: k, label: occasionLabel(k) }));
        },
        emptyText() {
            if (this.scope === 'following') return 'Nothing from the people you follow yet. Find your fit twins in Discover, or browse For you.';
            return this.occasion ? `No ${occasionLabel(this.occasion).toLowerCase()} looks yet. Be the first.` : 'No looks yet. Be the first to share one.';
        },
    },
    watch: {
        scope() { this.load(true); },
        occasion(v) {
            this.$router.replace({ query: v ? { occasion: v } : {} });
            this.load(true);
        },
        'auth.signedIn'(v) { if (v) this.loadMine(); },
    },
    async mounted() {
        document.title = 'Bless Hive — real people, real fits';
        window.addEventListener('blessluxe:hive-posted', this.onPosted);
        this.observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) this.load(false);
        }, { rootMargin: '900px' });
        await this.load(true);
        this.loadMine();
    },
    beforeUnmount() {
        window.removeEventListener('blessluxe:hive-posted', this.onPosted);
        this.observer?.disconnect();
    },
    methods: {
        async load(reset) {
            if (!reset && (!this.next || this.loadingMore || this.loading)) return;
            const ticket = reset ? ++this.ticket : this.ticket;
            reset ? (this.loading = true) : (this.loadingMore = true);
            this.failed = false;
            try {
                const params = new URLSearchParams({ scope: this.scope });
                if (this.occasion) params.set('occasion', this.occasion);
                if (!reset && this.next) params.set('before', this.next);
                const d = await api.get(`/api/store/hive/feed?${params}`);
                if (ticket !== this.ticket) return;      // a newer filter won the race
                this.looks = reset ? d.looks : [...this.looks, ...d.looks];
                this.next = d.next;
            } catch {
                this.failed = true;
            } finally {
                if (ticket === this.ticket) { this.loading = false; this.loadingMore = false; }
                this.$nextTick(() => { if (this.$refs.sentinel) this.observer?.observe(this.$refs.sentinel); });
            }
        },

        async loadMine() {
            api.get('/api/store/hive/lives').then((d) => { this.lives = [...d.live, ...d.upcoming].slice(0, 6); }).catch(() => {});
            api.get('/api/store/hive/challenges').then((d) => { this.challenges = d.challenges; }).catch(() => {});
            api.get('/api/store/hive/discover').then((d) => { this.suggested = d.people.slice(0, 5); }).catch(() => {});
            if (!(await hiveStore.load())) return;
            try {
                const d = await api.get('/api/account/hive/twins');
                this.twins = d.twins;
                this.twinsReady = d.ready;
            } catch { /* the rail is a bonus, never an error */ }
        },

        pickScope(s) {
            if (s === 'following' && !this.auth.signedIn) {
                this.$router.push({ path: '/account/login', query: { next: '/hive' } });
                return;
            }
            this.scope = s;
        },
        compose() { hiveStore.compose(this.$router, this.$route); },

        onPosted(e) {
            this.looks.unshift(e.detail);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        onRemoved(id) {
            this.looks = this.looks.filter((l) => l.id !== id);
            if (this.me && this.me.looks > 0) this.me.looks -= 1;
        },
        // What you reported leaves YOUR feed at once, whatever staff decide.
        onReported(subject) {
            if (subject.type === 'look') this.looks = this.looks.filter((l) => l.id !== subject.id);
        },
        async gift(target) { if (await hiveStore.ready(this.$router, this.$route)) this.gifting = target; },
        report(subject) {
            if (!this.auth.signedIn) {
                this.$router.push({ path: '/account/login', query: { next: '/hive' } });
                return;
            }
            this.reporting = subject;
        },
    },
};
</script>

<template>
    <div class="max-w-[1000px] mx-auto sm:px-6 lg:px-8 xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-10 xl:items-start">
        <!-- ─── Feed ─────────────────────────────────────────────── -->
        <section class="max-w-[34rem] mx-auto w-full">
            <!-- Sticks under the phone top bar, so switching never needs a scroll to the top. -->
            <div class="sticky top-0 z-30 bg-cream px-4 sm:px-0 pt-3 pb-2.5 border-b border-black/5 sm:border-0">
                <div class="flex items-center gap-2">
                <div class="flex p-1 rounded-full bg-black/5 flex-1 min-w-0">
                    <button
                        v-for="s in [{ k: 'everyone', l: 'For you' }, { k: 'following', l: 'Following' }]"
                        :key="s.k"
                        @click="pickScope(s.k)"
                        :class="['flex-1 py-2 rounded-full text-xs tracking-widest uppercase transition-colors', scope === s.k ? 'bg-white shadow-sm text-black' : 'text-black/50']"
                    >
                        {{ s.l }}
                    </button>
                </div>
                <router-link to="/hive/discover" class="lg:hidden w-11 h-11 rounded-full bg-white border border-black/10 inline-flex items-center justify-center flex-shrink-0" aria-label="Search people and occasions">
                    <Search class="w-[18px] h-[18px]" />
                </router-link>
                </div>
                <div class="scroll-strip scroll-px-4 sm:scroll-px-0 flex gap-1.5 overflow-x-auto [scrollbar-width:none] mt-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                    <button @click="occasion = ''" :class="['px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap flex-shrink-0 transition-colors', !occasion ? 'bg-black text-white' : 'bg-white border border-black/10 text-black/65']">All</button>
                    <button
                        v-for="o in occasions"
                        :key="o.key"
                        @click="occasion = occasion === o.key ? '' : o.key"
                        :class="['px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap flex-shrink-0 transition-colors', occasion === o.key ? 'bg-black text-white' : 'bg-white border border-black/10 text-black/65']"
                    >
                        {{ o.label }}
                    </button>
                </div>
            </div>

            <div class="px-4 sm:px-0 pt-3 pb-6">
                <!-- Live now / coming up -->
                <div v-if="lives.length" class="mb-4">
                    <div class="flex items-center justify-between mb-2">
                        <p class="flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-black/45"><Radio class="w-3.5 h-3.5" /> Live</p>
                        <router-link to="/hive/live" class="text-[11px] text-gold-dark">See all</router-link>
                    </div>
                    <div class="scroll-strip scroll-px-4 sm:scroll-px-0 flex gap-2.5 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 sm:mx-0 sm:px-0">
                        <router-link v-for="l in lives" :key="l.id" :to="`/hive/live/${l.id}`" class="flex items-center gap-2.5 bg-white border border-black/8 rounded-full pl-1.5 pr-4 py-1.5 flex-shrink-0 max-w-[16rem]">
                            <span :class="['w-9 h-9 rounded-full overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0 border-2', l.state === 'live' ? 'border-red-500' : 'border-gold/40']">
                                <img v-if="l.host.avatar_url" :src="l.host.avatar_url" alt="" loading="lazy" class="w-full h-full object-cover" /><UserRound v-else class="w-4 h-4 text-black/30" />
                            </span>
                            <span class="min-w-0">
                                <span class="block text-xs font-medium truncate">{{ l.title }}</span>
                                <span :class="['block text-[10px] truncate', l.state === 'live' ? 'text-red-600 font-semibold tracking-widest uppercase' : 'text-black/45']">{{ l.state === 'live' ? 'Live now' : new Date(l.starts_at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) }}</span>
                            </span>
                        </router-link>
                    </div>
                </div>

                <!-- What's on this week -->
                <router-link v-for="c in challenges" :key="c.id" :to="`/hive/challenge/${c.slug}`" class="flex items-center gap-3 mb-4 bg-black text-white rounded-2xl px-4 py-3.5">
                    <Trophy class="w-5 h-5 text-gold flex-shrink-0" />
                    <span class="min-w-0 flex-1">
                        <span class="block text-sm font-medium truncate">{{ c.title }} <span class="text-gold">{{ c.tag }}</span></span>
                        <span class="block text-xs text-white/60 truncate">{{ c.prize_bees ? `${c.prize_bees} Bees × ${c.winners} · ` : '' }}{{ c.entries }} {{ c.entries === 1 ? 'entry' : 'entries' }}</span>
                    </span>
                    <ChevronRight class="w-4 h-4 text-white/50 flex-shrink-0" />
                </router-link>

                <!-- Fit twins ride above the feed until there's a side rail to hold them. -->
                <div v-if="twins.length" class="xl:hidden mb-4">
                    <p class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-2">Your fit twins</p>
                    <div class="scroll-strip scroll-px-4 sm:scroll-px-0 flex gap-3 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 sm:mx-0 sm:px-0">
                        <router-link v-for="t in twins" :key="t.handle" :to="`/@${t.handle}`" class="flex-shrink-0 w-[4.5rem] text-center">
                            <span class="block w-16 h-16 mx-auto rounded-full overflow-hidden bg-cream-dark border-2 border-gold/50 flex items-center justify-center">
                                <img v-if="t.avatar_url" :src="t.avatar_url" alt="" loading="lazy" class="w-full h-full object-cover" />
                                <UserRound v-else class="w-6 h-6 text-black/25" />
                            </span>
                            <span class="block text-[11px] truncate mt-1">{{ t.display_name }}</span>
                            <span class="block text-[10px] text-gold-dark">{{ t.twin_match }}% match</span>
                        </router-link>
                    </div>
                </div>

                <router-link v-if="me && !twinsReady && !twins.length" :to="`/@${me.handle}?tab=fit`" class="xl:hidden flex items-center gap-3 mb-4 bg-white border border-gold/40 rounded-2xl px-4 py-3.5">
                    <Ruler class="w-5 h-5 text-gold-dark flex-shrink-0" />
                    <span class="text-xs leading-relaxed"><span class="block font-medium text-sm">Find your fit twins</span>Add your measurements to see how pieces fit people built like you.</span>
                </router-link>

                <div v-if="loading" class="space-y-4">
                    <div v-for="n in 2" :key="n" class="rounded-2xl border border-black/8 overflow-hidden animate-pulse bg-white">
                        <div class="h-14"></div>
                        <div class="aspect-[4/5] bg-cream-dark"></div>
                    </div>
                </div>

                <div v-else-if="failed && !looks.length" class="text-center py-20 px-4">
                    <p class="text-black/60 mb-4">We couldn't load the Hive. Check your connection.</p>
                    <button @click="load(true)" class="px-8 py-3 text-xs tracking-[0.25em] uppercase border border-black/20 hover:bg-white rounded-full">Try again</button>
                </div>

                <div v-else-if="!looks.length" class="text-center py-20 px-6">
                    <Sparkles class="w-8 h-8 text-gold mx-auto mb-3" />
                    <p class="text-black/60 mb-6 max-w-xs mx-auto">{{ emptyText }}</p>
                    <button v-if="scope === 'everyone'" @click="compose" class="bg-gold text-white px-8 py-3.5 rounded-full text-xs font-semibold tracking-[0.25em] uppercase hover:bg-gold-dark">Share a look</button>
                    <router-link v-else to="/hive/discover" class="inline-block px-8 py-3.5 rounded-full text-xs tracking-[0.25em] uppercase border border-black/20 hover:bg-white">Find people</router-link>
                </div>

                <div v-else class="space-y-4">
                    <LookCard v-for="l in looks" :key="l.id" :look="l" @removed="onRemoved" @report="report" @gift="gift" />
                    <div ref="sentinel" class="h-16 flex items-center justify-center">
                        <LoaderCircle v-if="loadingMore" class="w-5 h-5 animate-spin text-black/30" />
                        <span v-else-if="!next && looks.length > 3" class="text-[10px] tracking-widest uppercase text-black/30">You're all caught up</span>
                    </div>
                </div>
            </div>
        </section>

        <!-- ─── Right rail (wide screens) ───────────────────────────── -->
        <aside class="hidden xl:block sticky top-6 space-y-5 pt-6">
            <div v-if="!me" class="bg-white border border-black/8 rounded-2xl p-5 text-center">
                <p class="text-sm text-black/65 mb-4">Everyone with a BLESSLUXE account has a page. Sign in to claim yours.</p>
                <router-link :to="{ path: '/account/login', query: { next: '/hive' } }" class="block bg-gold text-white py-3 rounded-full text-xs font-semibold tracking-[0.25em] uppercase hover:bg-gold-dark">Sign in</router-link>
            </div>

            <div v-if="me" class="bg-white border border-black/8 rounded-2xl p-5">
                <p class="flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-black/45 mb-3"><Ruler class="w-3.5 h-3.5" /> Your fit twins</p>
                <div v-if="twins.length" class="space-y-3">
                    <router-link v-for="t in twins.slice(0, 6)" :key="t.handle" :to="`/@${t.handle}`" class="flex items-center gap-3 group">
                        <span class="w-10 h-10 rounded-full overflow-hidden bg-cream-dark border border-gold/30 flex items-center justify-center flex-shrink-0">
                            <img v-if="t.avatar_url" :src="t.avatar_url" alt="" loading="lazy" class="w-full h-full object-cover" />
                            <UserRound v-else class="w-4 h-4 text-black/25" />
                        </span>
                        <span class="min-w-0 flex-1">
                            <span class="block text-sm truncate group-hover:text-gold-dark">{{ t.display_name }}</span>
                            <span class="block text-[11px] text-black/45 truncate">{{ t.fit?.size_dress ? `Wears a ${t.fit.size_dress}` : `@${t.handle}` }}</span>
                        </span>
                        <span class="text-xs text-gold-dark flex-shrink-0">{{ t.twin_match }}%</span>
                    </router-link>
                </div>
                <div v-else>
                    <p class="text-xs text-black/55 leading-relaxed mb-3">
                        {{ twinsReady ? 'No close matches yet — more people join every week.' : 'Add your measurements to find people built like you, and see how pieces really fit them.' }}
                    </p>
                    <router-link v-if="!twinsReady" :to="`/@${me.handle}?tab=fit`" class="text-xs text-gold-dark underline underline-offset-4">Set up my fit</router-link>
                </div>
            </div>

            <div v-if="suggested.length" class="bg-white border border-black/8 rounded-2xl p-5">
                <p class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-3">People to follow</p>
                <div class="space-y-3">
                    <router-link v-for="p in suggested" :key="p.handle" :to="`/@${p.handle}`" class="flex items-center gap-3 group">
                        <span class="w-10 h-10 rounded-full overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0">
                            <img v-if="p.avatar_url" :src="p.avatar_url" alt="" loading="lazy" class="w-full h-full object-cover" />
                            <UserRound v-else class="w-4 h-4 text-black/25" />
                        </span>
                        <span class="min-w-0 flex-1">
                            <span class="block text-sm truncate group-hover:text-gold-dark">{{ p.display_name }}</span>
                            <span class="block text-[11px] text-black/45 truncate">{{ p.looks }} {{ p.looks === 1 ? 'look' : 'looks' }}</span>
                        </span>
                    </router-link>
                </div>
                <router-link to="/hive/discover" class="block mt-4 text-xs text-gold-dark underline underline-offset-4">See more</router-link>
            </div>
        </aside>

        <GiftSheet :target="gifting" @close="gifting = null" />
        <ReportSheet :subject="reporting" @close="reporting = null" @sent="onReported" />
    </div>
</template>

