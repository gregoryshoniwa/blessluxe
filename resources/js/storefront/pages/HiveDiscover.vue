<script>
import { api } from '../../lib/api.js';
import { toastError } from '../../lib/dialog.js';
import { authStore } from '../auth-store.js';
import { hiveStore, occasionLabel } from '../hive-store.js';
import { Search, UserRound, LoaderCircle, Ruler, X, ShoppingBag } from 'lucide-vue-next';

/** Find people (by name or @handle), your fit twins, and looks by occasion. */
export default {
    name: 'HiveDiscover',
    components: { Search, UserRound, LoaderCircle, Ruler, X, ShoppingBag },
    data() {
        return { auth: authStore.state, hive: hiveStore.state, q: '', people: [], searching: false, loading: true, occasions: [], twins: [], twinsReady: true, timer: null, ticket: 0, busy: null };
    },
    watch: {
        q() {
            clearTimeout(this.timer);
            this.timer = setTimeout(this.search, 250);
        },
    },
    mounted() {
        document.title = 'Discover · Bless Hive';
        this.search();
        this.loadTwins();
    },
    beforeUnmount() { clearTimeout(this.timer); },
    methods: {
        occasionLabel,
        async search() {
            const ticket = ++this.ticket;
            this.loading = true;
            try {
                const d = await api.get(`/api/store/hive/discover?q=${encodeURIComponent(this.q.trim())}`);
                if (ticket !== this.ticket) return;
                this.people = d.people;
                this.searching = d.searching;
                this.occasions = d.occasions;
            } catch { if (ticket === this.ticket) this.people = []; }
            finally { if (ticket === this.ticket) this.loading = false; }
        },
        async loadTwins() {
            if (!(await hiveStore.load())) return;
            try {
                const d = await api.get('/api/account/hive/twins');
                this.twins = d.twins;
                this.twinsReady = d.ready;
            } catch { /* optional */ }
        },
        async toggleFollow(p) {
            if (this.busy) return;
            if (!(await hiveStore.ready(this.$router, this.$route))) return;
            this.busy = p.handle;
            try {
                const d = await api[p.i_follow ? 'del' : 'post'](`/api/account/hive/follow/${encodeURIComponent(p.handle)}`);
                p.i_follow = d.following;
                p.followers = d.followers;
            } catch (e) { toastError(e); }
            finally { this.busy = null; }
        },
    },
};
</script>

<template>
    <div class="max-w-2xl mx-auto px-4 sm:px-6 py-4 lg:py-8">
        <label class="flex items-center gap-3 bg-white border border-black/10 rounded-full px-4 h-12 focus-within:border-gold sticky top-3 lg:top-4 z-20 shadow-sm">
            <Search class="w-4 h-4 text-black/40 flex-shrink-0" />
            <input v-model="q" placeholder="Search people by name or @handle" autocapitalize="none" autocomplete="off" class="flex-1 min-w-0 bg-transparent text-sm focus:outline-none" />
            <LoaderCircle v-if="loading && q" class="w-4 h-4 animate-spin text-black/30" />
            <button v-else-if="q" @click="q = ''" class="text-black/40" aria-label="Clear"><X class="w-4 h-4" /></button>
        </label>

        <template v-if="!searching">
            <!-- By occasion -->
            <section class="mt-6">
                <h2 class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-3">What's the occasion?</h2>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <router-link v-for="o in occasions" :key="o" :to="{ path: '/hive', query: { occasion: o } }" class="bg-white border border-black/8 rounded-xl px-4 py-4 text-sm hover:border-gold transition-colors">
                        {{ occasionLabel(o) }}
                    </router-link>
                </div>
            </section>

            <!-- Fit twins -->
            <section v-if="hive.me" class="mt-8">
                <h2 class="flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-black/45 mb-3"><Ruler class="w-3.5 h-3.5" /> Your fit twins</h2>
                <div v-if="twins.length" class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    <router-link v-for="t in twins" :key="t.handle" :to="`/@${t.handle}`" class="bg-white border border-black/8 rounded-2xl p-3 text-center hover:border-gold transition-colors">
                        <span class="block w-14 h-14 mx-auto rounded-full overflow-hidden bg-cream-dark border-2 border-gold/40 flex items-center justify-center">
                            <img v-if="t.avatar_url" :src="t.avatar_url" alt="" loading="lazy" class="w-full h-full object-cover" />
                            <UserRound v-else class="w-5 h-5 text-black/25" />
                        </span>
                        <span class="block text-xs truncate mt-2">{{ t.display_name }}</span>
                        <span class="block text-[11px] text-gold-dark">{{ t.twin_match }}% match</span>
                    </router-link>
                </div>
                <div v-else class="bg-white border border-black/8 rounded-2xl p-5 text-sm text-black/60">
                    {{ twinsReady ? 'No close matches yet — more people join every week.' : 'Add your measurements and we’ll find people built like you, so you can see how pieces really fit.' }}
                    <router-link v-if="!twinsReady" :to="`/@${hive.me.handle}?tab=fit`" class="block mt-3 text-gold-dark underline underline-offset-4 text-xs">Set up my fit</router-link>
                </div>
            </section>
        </template>

        <!-- People -->
        <section class="mt-8">
            <h2 class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-3">{{ searching ? 'People' : 'People to follow' }}</h2>
            <p v-if="!loading && !people.length" class="text-sm text-black/50 py-6">{{ searching ? `Nobody matches “${q}”.` : 'Nobody to suggest yet — share a look and be the first.' }}</p>
            <ul class="space-y-1">
                <li v-for="p in people" :key="p.handle" class="flex items-center gap-3 bg-white border border-black/8 rounded-2xl px-3.5 py-3">
                    <router-link :to="`/@${p.handle}`" class="flex items-center gap-3 min-w-0 flex-1">
                        <span class="w-12 h-12 rounded-full overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0">
                            <img v-if="p.avatar_url" :src="p.avatar_url" alt="" loading="lazy" class="w-full h-full object-cover" />
                            <UserRound v-else class="w-5 h-5 text-black/25" />
                        </span>
                        <span class="min-w-0">
                            <span class="block text-sm font-medium truncate">{{ p.display_name }}</span>
                            <span class="block text-xs text-black/45 truncate">@{{ p.handle }} · {{ p.looks }} {{ p.looks === 1 ? 'look' : 'looks' }}<template v-if="p.twin_match"> · <span class="text-gold-dark">{{ p.twin_match }}% match</span></template></span>
                        </span>
                    </router-link>
                    <button
                        v-if="!p.is_me"
                        @click="toggleFollow(p)"
                        :disabled="busy === p.handle"
                        :class="['px-4 h-9 rounded-full text-xs font-medium flex-shrink-0 transition-colors', p.i_follow ? 'border border-black/15 text-black/70' : 'bg-gold text-white hover:bg-gold-dark']"
                    >
                        {{ p.i_follow ? 'Following' : 'Follow' }}
                    </button>
                </li>
            </ul>
        </section>

        <router-link to="/shop" class="lg:hidden mt-10 flex items-center justify-center gap-2 text-xs tracking-widest uppercase text-black/45 py-3"><ShoppingBag class="w-4 h-4" /> Back to the shop</router-link>
    </div>
</template>
