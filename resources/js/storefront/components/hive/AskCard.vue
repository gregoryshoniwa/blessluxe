<script>
import { api } from '../../../lib/api.js';
import { confirmDialog, toast, toastError } from '../../../lib/dialog.js';
import { hiveStore, timeAgo, occasionLabel, whatsappShare } from '../../hive-store.js';
import { UserRound, MessageCircle, BadgeCheck, Ellipsis, Flag, Trash2, Share2, Check } from 'lucide-vue-next';

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * A question. With two or more photos it is a "which one?" vote: one tap, one
 * vote each, and the tally only appears once you've voted — showing it first
 * just makes everyone vote with the crowd.
 */
export default {
    name: 'AskCard',
    components: { UserRound, MessageCircle, BadgeCheck, Ellipsis, Flag, Trash2, Share2, Check },
    props: {
        ask: { type: Object, required: true },
        // In the list the card links to the question; on the question's own page it doesn't.
        linked: { type: Boolean, default: true },
    },
    emits: ['removed', 'report'],
    data() { return { menuOpen: false, voting: false, LETTERS }; },
    computed: {
        when() { return timeAgo(this.ask.created_at); },
        occasion() { return this.ask.occasion ? occasionLabel(this.ask.occasion) : null; },
        voted() { return this.ask.votes !== null; },
        shareHref() { return whatsappShare(`Help ${this.ask.is_mine ? 'me' : this.ask.author.display_name} decide — “${this.ask.question}”`, `/hive/ask/${this.ask.id}`); },
    },
    methods: {
        percent(i) {
            const total = this.ask.votes_total || 0;
            return total ? Math.round((this.ask.votes[i] / total) * 100) : 0;
        },
        async vote(i) {
            if (this.voted || this.voting || this.ask.is_mine) return;
            if (!(await hiveStore.ready(this.$router, this.$route))) return;
            this.voting = true;
            try {
                const d = await api.post(`/api/account/hive/asks/${this.ask.id}/vote`, { option: i });
                Object.assign(this.ask, { votes: d.votes, votes_total: d.votes_total, my_vote: d.my_vote });
            } catch (e) { toastError(e); }
            finally { this.voting = false; }
        },
        async remove() {
            this.menuOpen = false;
            if (!(await confirmDialog({ title: 'Remove this question?', body: 'Its answers go with it.', confirmLabel: 'Remove', tone: 'danger' }))) return;
            try {
                await api.del(`/api/account/hive/asks/${this.ask.id}`);
                toast('Question removed');
                this.$emit('removed', this.ask.id);
            } catch (e) { toastError(e); }
        },
        report() { this.menuOpen = false; this.$emit('report', { type: 'ask', id: this.ask.id }); },
    },
};
</script>

<template>
    <article class="bg-white border border-black/8 rounded-2xl overflow-hidden">
        <header class="flex items-center gap-3 px-3.5 pt-3">
            <router-link :to="`/@${ask.author.handle}`" class="flex items-center gap-3 min-w-0 flex-1 group">
                <span class="w-9 h-9 rounded-full overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0 border border-gold/20">
                    <img v-if="ask.author.avatar_url" :src="ask.author.avatar_url" alt="" loading="lazy" class="w-full h-full object-cover" />
                    <UserRound v-else class="w-4 h-4 text-black/30" />
                </span>
                <span class="min-w-0">
                    <span class="block text-sm font-medium truncate group-hover:text-gold-dark">{{ ask.author.display_name }}</span>
                    <span class="block text-[11px] text-black/45 truncate">asked · {{ when }}</span>
                </span>
            </router-link>
            <span v-if="ask.solved" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-[10px] tracking-widest uppercase flex-shrink-0"><BadgeCheck class="w-3.5 h-3.5" /> Solved</span>
            <div class="relative flex-shrink-0">
                <button @click="menuOpen = !menuOpen" class="w-11 h-11 -mr-2 inline-flex items-center justify-center text-black/45 hover:text-black" aria-label="More"><Ellipsis class="w-5 h-5" /></button>
                <div v-if="menuOpen" class="fixed inset-0 z-10" @click="menuOpen = false"></div>
                <div v-if="menuOpen" class="absolute right-0 top-full z-20 bg-white border border-black/10 rounded-xl shadow-xl py-1.5 min-w-[11rem]">
                    <button v-if="ask.is_mine" @click="remove" class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 text-left"><Trash2 class="w-4 h-4" /> Remove</button>
                    <button v-else @click="report" class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-cream text-left"><Flag class="w-4 h-4" /> Report</button>
                </div>
            </div>
        </header>

        <component :is="linked ? 'router-link' : 'div'" :to="linked ? `/hive/ask/${ask.id}` : null" class="block px-3.5 pt-2 pb-3">
            <h2 :class="['font-medium leading-snug break-words', linked ? 'text-base' : 'text-lg']">{{ ask.question }}</h2>
            <p v-if="ask.details" :class="['text-sm text-black/65 mt-1.5 leading-relaxed whitespace-pre-line break-words', linked ? 'line-clamp-3' : '']">{{ ask.details }}</p>
            <span v-if="occasion" class="inline-block mt-2.5 px-2.5 py-1 rounded-full bg-cream text-[10px] tracking-widest uppercase text-gold-dark">{{ occasion }}</span>
        </component>

        <!-- One photo: context. Two or more: the options of a vote. -->
        <div v-if="ask.images.length === 1" class="bg-cream-dark">
            <img :src="ask.images[0]" alt="" loading="lazy" decoding="async" class="w-full max-h-[28rem] object-cover" />
        </div>
        <div v-else-if="ask.is_poll" :class="['grid gap-0.5 bg-white', ask.images.length === 3 ? 'grid-cols-3' : 'grid-cols-2']">
            <button
                v-for="(src, i) in ask.images"
                :key="src"
                @click="vote(i)"
                :disabled="voted || ask.is_mine || voting"
                class="relative aspect-[4/5] bg-cream-dark overflow-hidden group disabled:cursor-default"
                :aria-label="`Vote for option ${LETTERS[i]}`"
            >
                <img :src="src" alt="" loading="lazy" decoding="async" class="w-full h-full object-cover" />
                <span class="absolute top-2 left-2 w-7 h-7 rounded-full bg-white/90 text-xs font-semibold flex items-center justify-center shadow">{{ LETTERS[i] }}</span>
                <span v-if="ask.my_vote === i" class="absolute top-2 right-2 w-7 h-7 rounded-full bg-gold text-white flex items-center justify-center shadow"><Check class="w-4 h-4" /></span>
                <span v-if="voted" class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent pt-8 pb-2 px-2.5 text-left">
                    <span class="block text-white text-lg font-semibold leading-none">{{ percent(i) }}%</span>
                    <span class="block h-1 rounded-full bg-white/30 mt-1.5 overflow-hidden"><span class="block h-full bg-white rounded-full transition-all duration-500" :style="{ width: percent(i) + '%' }"></span></span>
                </span>
                <span v-else-if="!ask.is_mine" class="absolute inset-x-0 bottom-0 bg-black/45 text-white text-[11px] tracking-widest uppercase py-2 opacity-0 group-hover:opacity-100 sm:transition-opacity max-sm:opacity-100">Tap to vote</span>
            </button>
        </div>
        <p v-if="ask.is_poll && voted" class="px-3.5 pt-2 text-[11px] text-black/45">{{ ask.votes_total }} {{ ask.votes_total === 1 ? 'vote' : 'votes' }}</p>

        <footer class="flex items-center gap-1 px-2 py-1">
            <component :is="linked ? 'router-link' : 'span'" :to="linked ? `/hive/ask/${ask.id}` : null" class="h-11 px-2 inline-flex items-center gap-1.5 text-sm text-black/70 hover:text-black">
                <MessageCircle class="w-[22px] h-[22px]" /> {{ ask.answers }} {{ ask.answers === 1 ? 'answer' : 'answers' }}
            </component>
            <a :href="shareHref" target="_blank" rel="noopener" class="ml-auto w-11 h-11 inline-flex items-center justify-center text-black/70 hover:text-black" aria-label="Share on WhatsApp"><Share2 class="w-5 h-5" /></a>
        </footer>
    </article>
</template>
