<script>
import { api } from '../../../lib/api.js';
import { timeAgo } from '../../hive-store.js';
import { Coins, ShoppingBag, MessageCircleQuestion, Trophy, Store } from 'lucide-vue-next';

/** What the Hive has paid me, and the ways to earn more. Money-like labels come from the server. */
export default {
    name: 'EarningsPanel',
    components: { Coins, ShoppingBag, MessageCircleQuestion, Trophy, Store },
    data() { return { s: null, loading: true }; },
    async mounted() {
        try { this.s = await api.get('/api/account/hive/earnings'); } catch { /* empty state */ }
        finally { this.loading = false; }
    },
    methods: { timeAgo },
};
</script>

<template>
    <p v-if="loading" class="text-sm text-black/40 py-10 text-center">Loading…</p>
    <div v-else-if="s" class="space-y-5">
        <div class="bg-black text-white rounded-2xl p-5">
            <p class="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-gold"><Coins class="w-4 h-4" /> Earned in the Hive</p>
            <p class="font-display text-4xl mt-2">{{ s.total_bees }} <span class="text-lg text-white/60">Bees</span></p>
            <p class="text-sm text-white/60 mt-1">Worth {{ s.worth_label }} at checkout · your balance is {{ s.balance }} Bees</p>
        </div>

        <div>
            <p class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-2.5">Ways to earn</p>
            <div class="space-y-2">
                <div class="flex items-center gap-3 bg-white border border-black/8 rounded-xl px-4 py-3">
                    <ShoppingBag class="w-5 h-5 text-gold-dark flex-shrink-0" />
                    <span class="text-sm flex-1">Post a try-on of something you bought</span>
                    <span class="text-xs text-gold-dark whitespace-nowrap">+{{ s.rates.try_on }} Bees</span>
                </div>
                <router-link to="/hive/ask" class="flex items-center gap-3 bg-white border border-black/8 rounded-xl px-4 py-3 hover:border-gold">
                    <MessageCircleQuestion class="w-5 h-5 text-gold-dark flex-shrink-0" />
                    <span class="text-sm flex-1">Answer a question and have it accepted</span>
                    <span class="text-xs text-gold-dark whitespace-nowrap">+{{ s.rates.accepted_answer }} Bees</span>
                </router-link>
                <router-link to="/hive" class="flex items-center gap-3 bg-white border border-black/8 rounded-xl px-4 py-3 hover:border-gold">
                    <Trophy class="w-5 h-5 text-gold-dark flex-shrink-0" />
                    <span class="text-sm flex-1">Win a weekly challenge</span>
                    <span class="text-xs text-gold-dark whitespace-nowrap">prizes vary</span>
                </router-link>
                <router-link :to="s.shop_code ? `/affiliate/${s.shop_code}/dashboard` : '/affiliate'" class="flex items-center gap-3 bg-white border border-black/8 rounded-xl px-4 py-3 hover:border-gold">
                    <Store class="w-5 h-5 text-gold-dark flex-shrink-0" />
                    <span class="text-sm flex-1">{{ s.shop_code ? 'Your shop — commission on every sale' : 'Open a shop on your page and earn commission' }}</span>
                    <span class="text-xs text-gold-dark whitespace-nowrap">{{ s.shop_code ? 'Dashboard' : 'Learn more' }}</span>
                </router-link>
            </div>
        </div>

        <div v-if="s.recent.length">
            <p class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-2.5">Recent</p>
            <ul class="bg-white border border-black/8 rounded-xl divide-y divide-black/5">
                <li v-for="(r, i) in s.recent" :key="i" class="flex items-center justify-between px-4 py-3 text-sm">
                    <span>{{ r.label }} <span class="text-[11px] text-black/40">· {{ timeAgo(r.at) }}</span></span>
                    <span class="text-green-700 font-medium">+{{ r.bees }}</span>
                </li>
            </ul>
        </div>
    </div>
</template>
