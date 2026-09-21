<script>
import { api } from '../../lib/api.js';
import { confirmDialog, toast, toastError } from '../../lib/dialog.js';
import { authStore } from '../auth-store.js';
import { hiveStore, timeAgo } from '../hive-store.js';
import AskCard from '../components/hive/AskCard.vue';
import ReportSheet from '../components/hive/ReportSheet.vue';
import MentionPicker from '../../components/MentionPicker.vue';
import SellerBadge from '../components/hive/SellerBadge.vue';
import { ArrowLeft, UserRound, BadgeCheck, Tag, X, SendHorizontal, LoaderCircle, Package, ImageOff, Flag, Trash2 } from 'lucide-vue-next';

/** One question and its answers. The asker accepts the answer that helped; that helper earns Bees. */
export default {
    name: 'HiveAskDetail',
    components: { AskCard, ReportSheet, MentionPicker, SellerBadge, ArrowLeft, UserRound, BadgeCheck, Tag, X, SendHorizontal, LoaderCircle, Package, ImageOff, Flag, Trash2 },
    data() {
        return { auth: authStore.state, ask: null, answers: [], reward: 0, loading: true, notFound: false, draft: '', refs: [], picking: false, sending: false, accepting: null, reporting: null };
    },
    computed: {
        chosenKeys() { return this.refs.map((r) => `${r.type}:${r.id}`); },
        canSend() { return (this.draft.trim() || this.refs.length) && !this.sending; },
    },
    watch: { '$route.params.id'() { this.load(); }, 'auth.signedIn'() { this.load(); } },
    mounted() { this.load(); },
    methods: {
        timeAgo,
        refPath(r) { return r.type === 'pack' ? `/shop/packs/${r.handle}` : `/shop/${r.handle}`; },
        openRef(e, a, r) {
            if (!a.author.seller || e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            hiveStore.shopVia(this.$router, { answer_id: a.id }, this.refPath(r));
        },
        apply(d) { this.ask = d.ask; this.answers = d.answers; this.reward = d.reward ?? this.reward; },
        async load() {
            this.loading = true;
            try {
                this.apply(await api.get(`/api/store/hive/asks/${encodeURIComponent(this.$route.params.id)}`));
                document.title = `${this.ask.question} · Bless Hive`;
            } catch (e) { this.notFound = e.status === 404; if (!this.notFound) toastError(e); }
            finally { this.loading = false; }
        },
        async openPicker() { if (await hiveStore.ready(this.$router, this.$route)) this.picking = true; },
        pick(item) { if (this.refs.length < 6) this.refs.push(item); this.picking = false; },
        async send() {
            if (!this.canSend) return;
            if (!(await hiveStore.ready(this.$router, this.$route))) return;
            this.sending = true;
            try {
                this.apply(await api.post(`/api/account/hive/asks/${this.ask.id}/answers`, { body: this.draft.trim() || null, refs: this.refs.map((r) => ({ type: r.type, id: r.id })) }));
                this.draft = ''; this.refs = [];
                toast('Answer posted');
            } catch (e) { toastError(e, e.payload?.errors?.body?.[0]); }
            finally { this.sending = false; }
        },
        async accept(a) {
            if (!(await confirmDialog({ title: 'Accept this answer?', body: `This marks your question solved and thanks ${a.author.display_name}${this.reward ? ` with ${this.reward} Bees from BLESSLUXE` : ''}. You can accept one answer, and it can't be changed.`, confirmLabel: 'Accept' }))) return;
            this.accepting = a.id;
            try {
                const d = await api.post(`/api/account/hive/asks/${this.ask.id}/accept`, { answer_id: a.id });
                this.apply(d);
                toast(d.awarded ? `Accepted — ${a.author.display_name} earned ${d.awarded} Bees` : 'Answer accepted');
            } catch (e) { toastError(e); }
            finally { this.accepting = null; }
        },
        async removeAnswer(a) {
            try {
                await api.del(`/api/account/hive/answers/${a.id}`);
                this.answers = this.answers.filter((x) => x.id !== a.id);
                this.ask.answers = Math.max(0, this.ask.answers - 1);
            } catch (e) { toastError(e); }
        },
        report(s) {
            if (!this.auth.signedIn) { this.$router.push({ path: '/account/login', query: { next: this.$route.fullPath } }); return; }
            this.reporting = s;
        },
        onReported(s) {
            if (s.type === 'ask') this.$router.replace('/hive/ask');
            else this.answers = this.answers.filter((x) => x.id !== s.id);
        },
    },
};
</script>

<template>
    <div class="max-w-[34rem] mx-auto w-full px-4 sm:px-6 lg:px-0 py-3 lg:py-6">
        <router-link to="/hive/ask" class="inline-flex items-center gap-2 h-11 text-sm text-black/60 hover:text-black"><ArrowLeft class="w-4 h-4" /> All questions</router-link>

        <p v-if="loading && !ask" class="text-sm text-black/40 py-16 text-center">Loading…</p>
        <div v-else-if="notFound" class="text-center py-20">
            <p class="text-black/55 mb-6">This question is no longer here.</p>
            <router-link to="/hive/ask" class="inline-block bg-gold text-white px-8 py-3.5 text-xs font-semibold tracking-[0.25em] uppercase">See other questions</router-link>
        </div>

        <template v-else-if="ask">
            <AskCard :ask="ask" :linked="false" @removed="$router.replace('/hive/ask')" @report="report" />

            <h2 class="text-[10px] tracking-[0.2em] uppercase text-black/45 mt-6 mb-3">{{ answers.length ? `${answers.length} ${answers.length === 1 ? 'answer' : 'answers'}` : 'No answers yet' }}</h2>

            <ul class="space-y-3">
                <li v-for="a in answers" :key="a.id" :class="['bg-white border px-3.5 py-3', a.accepted ? 'border-green-500/60' : 'border-black/8']">
                    <p v-if="a.accepted" class="inline-flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-green-700 mb-2"><BadgeCheck class="w-4 h-4" /> Accepted answer<template v-if="a.bees"> · earned {{ a.bees }} Bees</template></p>
                    <div class="flex gap-2.5">
                        <router-link :to="`/@${a.author.handle}`" class="rounded-full w-8 h-8 overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0">
                            <img v-if="a.author.avatar_url" :src="a.author.avatar_url" alt="" loading="lazy" class="w-full h-full object-cover" />
                            <UserRound v-else class="w-4 h-4 text-black/30" />
                        </router-link>
                        <div class="min-w-0 flex-1">
                            <p class="text-sm"><router-link :to="`/@${a.author.handle}`" class="font-medium hover:text-gold-dark">{{ a.author.display_name }}</router-link> <SellerBadge v-if="a.author.seller" label /> <span class="text-[11px] text-black/40">· {{ timeAgo(a.created_at) }}</span></p>
                            <p v-if="a.body" class="text-sm text-black/80 leading-relaxed mt-0.5 whitespace-pre-line break-words">{{ a.body }}</p>

                            <div v-if="a.refs.length" class="flex flex-col gap-1.5 mt-2">
                                <router-link v-for="r in a.refs" :key="`${r.type}:${r.id}`" :to="refPath(r)" @click="openRef($event, a, r)" class="group flex items-center gap-3 p-1.5 pr-3 border border-black/8 hover:border-gold/60 transition-colors">
                                    <span class="w-11 h-14 overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0">
                                        <img v-if="r.thumbnail" :src="r.thumbnail" alt="" loading="lazy" class="w-full h-full object-cover object-top" />
                                        <component v-else :is="r.type === 'pack' ? 'Package' : 'ImageOff'" class="w-4 h-4 text-black/25" />
                                    </span>
                                    <span class="min-w-0 flex-1">
                                        <span class="block text-sm truncate group-hover:text-gold-dark">{{ r.title }}</span>
                                        <span class="block text-xs text-black/50">{{ r.price_label }}</span>
                                    </span>
                                    <span class="text-[10px] tracking-widest uppercase text-gold-dark flex-shrink-0">View</span>
                                </router-link>
                            </div>

                            <div class="flex items-center gap-4 mt-2 text-[11px] text-black/40">
                                <button v-if="a.can_accept" @click="accept(a)" :disabled="accepting === a.id" class="inline-flex items-center gap-1.5 h-9 px-4 bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                                    <LoaderCircle v-if="accepting === a.id" class="w-3.5 h-3.5 animate-spin" /><BadgeCheck v-else class="w-3.5 h-3.5" /> This helped
                                </button>
                                <button v-if="a.is_mine && !a.accepted" @click="removeAnswer(a)" class="hover:text-red-600 inline-flex items-center gap-1 py-2"><Trash2 class="w-3 h-3" /> Remove</button>
                                <button v-if="!a.is_mine" @click="report({ type: 'answer', id: a.id })" class="hover:text-black inline-flex items-center gap-1 py-2"><Flag class="w-3 h-3" /> Report</button>
                            </div>
                        </div>
                    </div>
                </li>
            </ul>

            <!-- Answer -->
            <div v-if="!ask.is_mine" class="mt-5 bg-white border border-black/8 p-3.5">
                <p v-if="reward && !ask.solved" class="text-[11px] text-black/50 mb-2">If {{ ask.author.display_name }} accepts your answer you earn {{ reward }} Bees.</p>
                <textarea v-model="draft" rows="2" maxlength="500" placeholder="Suggest something…" class="w-full bg-cream/60 px-3.5 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-gold resize-none"></textarea>
                <div v-if="refs.length" class="flex flex-wrap gap-1.5 mt-2">
                    <span v-for="(r, i) in refs" :key="`${r.type}:${r.id}`" class="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 bg-cream text-xs max-w-full">
                        <span class="truncate">{{ r.title }}</span>
                        <button @click="refs.splice(i, 1)" class="w-6 h-6 inline-flex items-center justify-center text-black/40 hover:text-black" aria-label="Remove"><X class="w-3 h-3" /></button>
                    </span>
                </div>
                <MentionPicker v-if="picking" class="mt-2" endpoint="/api/account/hive/mentions" :chosen="chosenKeys" @pick="pick" @close="picking = false" />
                <div class="flex items-center justify-between mt-2">
                    <button v-if="!picking" @click="openPicker" class="inline-flex items-center gap-2 h-10 px-3.5 border border-gold/50 text-gold-dark text-xs hover:bg-cream"><Tag class="w-3.5 h-3.5" /> Tag a piece</button>
                    <span v-else></span>
                    <button @click="send" :disabled="!canSend" class="inline-flex items-center gap-2 h-10 px-5 bg-gold text-white text-xs font-semibold tracking-[0.15em] uppercase hover:bg-gold-dark disabled:opacity-40">
                        <LoaderCircle v-if="sending" class="w-4 h-4 animate-spin" /><SendHorizontal v-else class="w-4 h-4" /> Answer
                    </button>
                </div>
            </div>
            <p v-else-if="!ask.solved && answers.length" class="mt-5 text-xs text-black/50 text-center">Tap “This helped” on the answer that solved it{{ reward ? ` — they'll earn ${reward} Bees` : '' }}.</p>
        </template>

        <ReportSheet :subject="reporting" @close="reporting = null" @sent="onReported" />
    </div>
</template>
