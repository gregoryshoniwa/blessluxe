<script>
import { api } from '../../lib/api.js';
import { hiveStore, timeAgo } from '../hive-store.js';
import { Heart, MessageCircle, UserPlus, MessageCircleQuestion, BadgeCheck, UserRound, Bell, Gift, Radio } from 'lucide-vue-next';

const ICONS = { hive_like: 'Heart', hive_comment: 'MessageCircle', hive_follow: 'UserPlus', hive_answer: 'MessageCircleQuestion', hive_accepted: 'BadgeCheck', hive_gift: 'Gift', hive_live: 'Radio' };

/** Who hearted, commented, followed, answered. Opening the page clears the badge. */
export default {
    name: 'HiveActivity',
    components: { Heart, MessageCircle, UserPlus, MessageCircleQuestion, BadgeCheck, UserRound, Bell, Gift, Radio },
    data() { return { items: [], loading: true }; },
    async mounted() {
        document.title = 'Activity · Bless Hive';
        try {
            this.items = (await api.get('/api/account/hive/activity')).items;
            // Keep this visit's "new" dots on screen; clear the badge behind them.
            if (this.items.some((i) => i.unread)) {
                await api.post('/api/account/hive/activity/read');
                hiveStore.state.unread = 0;
            }
        } catch { /* empty state covers it */ }
        finally { this.loading = false; }
    },
    methods: { timeAgo, icon(kind) { return ICONS[kind] || 'Bell'; } },
};
</script>

<template>
    <div class="max-w-2xl mx-auto px-4 sm:px-6 py-4 lg:py-8">
        <h1 class="font-display text-2xl tracking-widest uppercase mb-5 hidden lg:block">Activity</h1>

        <p v-if="loading" class="text-sm text-black/40 py-10 text-center">Loading…</p>
        <div v-else-if="!items.length" class="text-center py-20">
            <Bell class="w-8 h-8 text-gold mx-auto mb-3" />
            <p class="text-black/55 text-sm max-w-xs mx-auto">When someone hearts, comments, follows you or answers your question, you'll see it here.</p>
        </div>

        <ul v-else class="space-y-1">
            <li v-for="n in items" :key="n.id">
                <router-link :to="n.url || '/hive'" :class="['flex items-start gap-3 px-3.5 py-3 transition-colors', n.unread ? 'bg-white border border-gold/40' : 'hover:bg-white border border-transparent']">
                    <span class="rounded-full relative w-11 h-11 overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0">
                        <img v-if="n.avatar_url" :src="n.avatar_url" alt="" loading="lazy" class="w-full h-full object-cover" />
                        <UserRound v-else class="w-5 h-5 text-black/25" />
                    </span>
                    <span class="min-w-0 flex-1">
                        <span class="block text-sm leading-snug">{{ n.title }}</span>
                        <span v-if="n.body" class="block text-xs text-black/50 truncate mt-0.5">{{ n.body }}</span>
                        <span class="block text-[11px] text-black/35 mt-0.5">{{ timeAgo(n.created_at) }}</span>
                    </span>
                    <component :is="icon(n.kind)" :class="['w-4 h-4 mt-1 flex-shrink-0', n.kind === 'hive_like' ? 'text-red-500' : n.kind === 'hive_accepted' ? 'text-green-600' : 'text-gold-dark']" />
                </router-link>
            </li>
        </ul>
    </div>
</template>
