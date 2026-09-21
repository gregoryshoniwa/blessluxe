<script>
import SellerBadge from './SellerBadge.vue';
import { UserRound, Radio, Bell } from 'lucide-vue-next';

/** One live in a list: cover, state, host, time. */
export default {
    name: 'LiveTile',
    components: { SellerBadge, UserRound, Radio, Bell },
    props: { live: { type: Object, required: true } },
    computed: {
        when() {
            const d = new Date(this.live.starts_at);
            const day = d.toDateString() === new Date().toDateString() ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
            return `${day} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
        },
    },
};
</script>

<template>
    <router-link :to="`/hive/live/${live.id}`" class="block bg-white border border-black/8 overflow-hidden hover:border-gold transition-colors">
        <span class="relative block aspect-video bg-gradient-to-br from-zinc-800 to-black">
            <img v-if="live.cover_url" :src="live.cover_url" alt="" loading="lazy" decoding="async" class="w-full h-full object-cover opacity-85" />
            <span v-if="live.state === 'live'" class="absolute top-2 left-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-600 text-white text-[10px] font-semibold tracking-widest uppercase"><span class="rounded-full w-1.5 h-1.5 bg-white animate-pulse"></span> Live</span>
            <span v-else-if="live.state === 'upcoming'" class="absolute top-2 left-2 px-2.5 py-1 bg-black/70 text-white text-[10px] tracking-wide">{{ when }}</span>
            <span v-else class="absolute top-2 left-2 px-2.5 py-1 bg-black/70 text-white text-[10px] tracking-widest uppercase">Watch again</span>
            <span class="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white text-[10px]">{{ live.embed?.label }}</span>
        </span>
        <span class="flex items-center gap-2.5 p-3">
            <span class="rounded-full w-8 h-8 overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0">
                <img v-if="live.host.avatar_url" :src="live.host.avatar_url" alt="" loading="lazy" class="w-full h-full object-cover" />
                <UserRound v-else class="w-4 h-4 text-black/30" />
            </span>
            <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium truncate">{{ live.title }}</span>
                <span class="flex items-center gap-1 text-[11px] text-black/50"><span class="truncate">{{ live.host.display_name }}</span><SellerBadge v-if="live.host.seller" /></span>
            </span>
            <span v-if="live.state === 'upcoming' && live.reminders" class="inline-flex items-center gap-1 text-[11px] text-black/45 flex-shrink-0"><Bell class="w-3 h-3" /> {{ live.reminders }}</span>
        </span>
    </router-link>
</template>
