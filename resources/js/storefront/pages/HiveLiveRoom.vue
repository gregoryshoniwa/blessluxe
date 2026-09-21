<script>
import { api } from '../../lib/api.js';
import { confirmDialog, toast, toastError } from '../../lib/dialog.js';
import { authStore } from '../auth-store.js';
import { hiveStore, whatsappShare } from '../hive-store.js';
import GiftSheet from '../components/hive/GiftSheet.vue';
import ReportSheet from '../components/hive/ReportSheet.vue';
import SellerBadge from '../components/hive/SellerBadge.vue';
import { ArrowLeft, Play, UserRound, Bell, BellRing, Gift, Share2, Flag, Radio, ExternalLink, LoaderCircle } from 'lucide-vue-next';

/**
 * A live's room: the stream (framed from the host's own platform, loaded only
 * on tap), when it starts, reminders, and gifts. The app has no socket, so the
 * room polls for new gifts — every 8s while it's live, slower otherwise, never
 * in a hidden tab.
 */
export default {
    name: 'HiveLiveRoom',
    components: { GiftSheet, ReportSheet, SellerBadge, ArrowLeft, Play, UserRound, Bell, BellRing, Gift, Share2, Flag, Radio, ExternalLink, LoaderCircle },
    data() { return { auth: authStore.state, live: null, gifts: [], loading: true, notFound: false, loaded: false, busy: false, gifting: null, reporting: null, timer: null, now: Date.now(), tick: null }; },
    computed: {
        frameClass() { return { tall: 'aspect-[9/16] w-full max-w-[24.75rem] mx-auto', wide: 'aspect-video w-full', post: 'aspect-[4/5] w-full' }[this.live?.embed?.shape || 'wide']; },
        countdown() {
            const ms = new Date(this.live.starts_at) - this.now;
            if (ms <= 0) return 'Starting any moment';
            const m = Math.floor(ms / 60000);
            if (m < 60) return `Starts in ${Math.max(1, m)} min`;
            if (m < 1440) return `Starts in ${Math.floor(m / 60)}h ${m % 60}m`;
            return `Starts ${new Date(this.live.starts_at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })} at ${new Date(this.live.starts_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
        },
        shareHref() { return whatsappShare(`${this.live.is_mine ? "I'm" : this.live.host.display_name + ' is'} going live on Bless Hive — “${this.live.title}”`, `/hive/live/${this.live.id}`); },
    },
    watch: { '$route.params.id'() { this.load(); } },
    mounted() {
        this.load();
        this.tick = setInterval(() => { this.now = Date.now(); }, 30000);
        document.addEventListener('visibilitychange', this.poll);
    },
    beforeUnmount() { clearTimeout(this.timer); clearInterval(this.tick); document.removeEventListener('visibilitychange', this.poll); },
    methods: {
        async load() {
            this.loading = true;
            try {
                const d = await api.get(`/api/store/hive/lives/${encodeURIComponent(this.$route.params.id)}`);
                this.live = d.live; this.gifts = d.gifts;
                document.title = `${d.live.title} · Live · Bless Hive`;
                this.schedulePoll();
            } catch (e) { this.notFound = e.status === 404; }
            finally { this.loading = false; }
        },
        schedulePoll() {
            clearTimeout(this.timer);
            if (!this.live || ['ended', 'missed', 'cancelled'].includes(this.live.state)) return;
            this.timer = setTimeout(this.poll, this.live.state === 'live' ? 8000 : 30000);
        },
        async poll() {
            if (document.hidden || !this.live) return;
            try {
                const d = await api.get(`/api/store/hive/lives/${this.live.id}/gifts`);
                this.gifts = d.gifts;
                if (d.gifts_bees !== null) this.live.gifts_bees = d.gifts_bees;
                if (d.state !== this.live.state) await this.load(); else this.schedulePoll();
            } catch { this.schedulePoll(); }
        },
        async host(action, confirm) {
            if (confirm && !(await confirmDialog(confirm))) return;
            this.busy = true;
            try {
                const d = await api.post(`/api/account/hive/lives/${this.live.id}/${action}`);
                if (action === 'cancel') { toast('Live cancelled'); this.$router.replace('/hive/live'); return; }
                this.live = d.live;
                if (action === 'start') { this.loaded = true; toast(this.live.reminders ? `You're live — ${this.live.reminders} ${this.live.reminders === 1 ? 'person has' : 'people have'} been told` : "You're live"); }
                this.schedulePoll();
            } catch (e) { toastError(e); }
            finally { this.busy = false; }
        },
        async toggleRemind() {
            if (!(await hiveStore.ready(this.$router, this.$route))) return;
            try { this.live = (await api[this.live.reminded ? 'del' : 'post'](`/api/account/hive/lives/${this.live.id}/remind`)).live; }
            catch (e) { toastError(e); }
        },
        async gift() {
            if (await hiveStore.ready(this.$router, this.$route)) this.gifting = { context: 'live', id: this.live.id, name: this.live.host.display_name };
        },
        report() {
            if (!this.auth.signedIn) { this.$router.push({ path: '/account/login', query: { next: this.$route.fullPath } }); return; }
            this.reporting = { type: 'live', id: this.live.id };
        },
    },
};
</script>

<template>
    <div class="max-w-[38rem] mx-auto w-full px-4 sm:px-6 py-3 lg:py-6">
        <router-link to="/hive/live" class="inline-flex items-center gap-2 h-11 text-sm text-black/60 hover:text-black"><ArrowLeft class="w-4 h-4" /> All lives</router-link>

        <p v-if="loading && !live" class="text-sm text-black/40 py-16 text-center">Loading…</p>
        <div v-else-if="notFound" class="text-center py-20"><p class="text-black/55">This live isn't here any more.</p></div>

        <template v-else-if="live">
            <div class="bg-black overflow-hidden">
                <div :class="frameClass">
                    <iframe v-if="loaded" :src="live.embed.url" :title="live.title" class="w-full h-full border-0 bg-black" referrerpolicy="strict-origin-when-cross-origin"
                        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
                    <button v-else @click="loaded = true" class="relative block w-full h-full text-white" :aria-label="`Load the stream from ${live.embed.label}`">
                        <img v-if="live.cover_url" :src="live.cover_url" alt="" class="absolute inset-0 w-full h-full object-cover opacity-55" />
                        <span v-else class="absolute inset-0 bg-gradient-to-br from-zinc-800 to-black"></span>
                        <span class="relative flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
                            <span class="rounded-full w-16 h-16 bg-black/55 flex items-center justify-center"><Play class="w-7 h-7 fill-white ml-0.5" /></span>
                            <span class="text-sm font-medium">{{ live.state === 'upcoming' ? countdown : `Tap to watch on ${live.embed.label}` }}</span>
                            <span class="text-[11px] text-white/70 max-w-[16rem]">Streams use a lot of data — Wi-Fi is best. {{ live.embed.label }} will know you watched.</span>
                        </span>
                    </button>
                </div>
            </div>

            <div class="flex items-start gap-3 mt-4">
                <div class="min-w-0 flex-1">
                    <p class="mb-1">
                        <span v-if="live.state === 'live'" class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-600 text-white text-[10px] font-semibold tracking-widest uppercase"><span class="rounded-full w-1.5 h-1.5 bg-white animate-pulse"></span> Live now</span>
                        <span v-else-if="live.state === 'upcoming'" class="inline-flex px-2.5 py-1 bg-cream text-[11px] text-gold-dark">{{ countdown }}</span>
                        <span v-else class="inline-flex px-2.5 py-1 bg-black/5 text-[11px] text-black/55">{{ live.state === 'missed' ? "This one didn't happen" : 'Ended — watch it again above' }}</span>
                    </p>
                    <h1 class="font-display text-xl sm:text-2xl tracking-wide break-words">{{ live.title }}</h1>
                </div>
                <a :href="shareHref" target="_blank" rel="noopener" class="w-11 h-11 border border-black/12 inline-flex items-center justify-center flex-shrink-0 hover:bg-white" aria-label="Share on WhatsApp"><Share2 class="w-4 h-4" /></a>
            </div>

            <router-link :to="`/@${live.host.handle}`" class="flex items-center gap-3 mt-3 group">
                <span class="rounded-full w-10 h-10 overflow-hidden bg-cream-dark border border-gold/25 flex items-center justify-center flex-shrink-0">
                    <img v-if="live.host.avatar_url" :src="live.host.avatar_url" alt="" class="w-full h-full object-cover" /><UserRound v-else class="w-4 h-4 text-black/30" />
                </span>
                <span class="min-w-0"><span class="flex items-center gap-1 text-sm font-medium group-hover:text-gold-dark"><span class="truncate">{{ live.host.display_name }}</span><SellerBadge v-if="live.host.seller" /></span>
                    <span class="block text-xs text-black/45">@{{ live.host.handle }}</span></span>
            </router-link>
            <p v-if="live.description" class="text-sm text-black/70 leading-relaxed mt-3 whitespace-pre-line break-words">{{ live.description }}</p>

            <!-- Host controls -->
            <div v-if="live.is_mine" class="mt-5 bg-white border border-gold/40 p-4">
                <p class="text-[10px] tracking-[0.2em] uppercase text-gold-dark mb-2">Your live</p>
                <p v-if="live.state === 'upcoming'" class="text-xs text-black/60 leading-relaxed mb-3">{{ live.reminders }} {{ live.reminders === 1 ? 'person wants' : 'people want' }} a reminder. Start your stream on {{ live.embed.label }} first, then tap Go live here — that's what sends the reminders.</p>
                <p v-if="live.gifts_bees" class="text-sm mb-3">Gifts this session: <strong>{{ live.gifts_bees }} Bees</strong></p>
                <div class="flex flex-wrap gap-2">
                    <button v-if="live.can_start" @click="host('start')" :disabled="busy" class="flex-1 h-11 bg-red-600 text-white text-xs font-semibold tracking-[0.2em] uppercase inline-flex items-center justify-center gap-2 disabled:opacity-50"><Radio class="w-4 h-4" /> Go live</button>
                    <p v-else-if="live.state === 'upcoming'" class="flex-1 text-xs text-black/50 self-center">You can go live from 2 hours before the time.</p>
                    <button v-if="live.can_end" @click="host('end', { title: 'End your live?', body: 'People can still watch it again from the link.', confirmLabel: 'End' })" :disabled="busy" class="flex-1 h-11 bg-black text-white text-xs font-semibold tracking-[0.2em] uppercase disabled:opacity-50">End live</button>
                    <button v-if="live.can_cancel" @click="host('cancel', { title: 'Cancel this live?', body: 'Anyone who asked for a reminder won’t get one.', confirmLabel: 'Cancel it', tone: 'danger' })" :disabled="busy" class="h-11 px-5 border border-black/15 text-xs tracking-widest uppercase disabled:opacity-50">Cancel</button>
                </div>
            </div>

            <!-- Viewer actions -->
            <div v-else class="flex gap-2 mt-5">
                <button v-if="live.state === 'upcoming'" @click="toggleRemind" :class="['flex-1 h-12 text-xs font-semibold tracking-[0.2em] uppercase inline-flex items-center justify-center gap-2', live.reminded ? 'border border-black/15' : 'bg-gold text-white hover:bg-gold-dark']">
                    <component :is="live.reminded ? 'BellRing' : 'Bell'" class="w-4 h-4" /> {{ live.reminded ? "We'll remind you" : 'Remind me' }}
                </button>
                <button v-if="live.state !== 'missed'" @click="gift" class="flex-1 h-12 bg-black text-white text-xs font-semibold tracking-[0.2em] uppercase inline-flex items-center justify-center gap-2 hover:bg-zinc-800"><Gift class="w-4 h-4 text-gold" /> Send a gift</button>
                <button @click="report" class="w-12 h-12 border border-black/12 inline-flex items-center justify-center text-black/45 flex-shrink-0" aria-label="Report this live"><Flag class="w-4 h-4" /></button>
            </div>

            <!-- The room -->
            <section v-if="gifts.length" class="mt-6">
                <h2 class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-2">Gifts</h2>
                <ul class="space-y-1.5">
                    <li v-for="g in gifts" :key="g.id" class="flex items-center gap-2.5 bg-white border border-black/6 px-3 py-2 text-sm">
                        <span class="text-xl leading-none" aria-hidden="true">{{ g.emoji }}</span>
                        <span class="min-w-0 flex-1 truncate"><router-link :to="`/@${g.handle}`" class="font-medium hover:text-gold-dark">{{ g.from }}</router-link> sent a {{ g.label }}</span>
                        <span class="text-xs text-gold-dark flex-shrink-0">{{ g.bees }}</span>
                    </li>
                </ul>
            </section>
            <a :href="live.embed.source" target="_blank" rel="noopener nofollow" class="flex items-center gap-1.5 mt-6 text-[11px] text-black/45 hover:text-gold-dark"><ExternalLink class="w-3.5 h-3.5" /> Open on {{ live.embed.label }}</a>
        </template>

        <GiftSheet :target="gifting" @close="gifting = null" @sent="poll" />
        <ReportSheet :subject="reporting" @close="reporting = null" @sent="$router.replace('/hive/live')" />
    </div>
</template>
