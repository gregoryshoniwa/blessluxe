<script>
import { api } from '../../lib/api.js';
import { confirmDialog, toast, toastError } from '../../lib/dialog.js';

const STATE = {
    draft: ['Draft', 'bg-zinc-100 text-zinc-600'], upcoming: ['Upcoming', 'bg-sky-100 text-sky-700'], live: ['Live', 'bg-emerald-100 text-emerald-700'],
    judging: ['Needs winners', 'bg-amber-100 text-amber-800'], awarded: ['Awarded', 'bg-zinc-900 text-white'],
};

/**
 * Bless Hive challenges: create one, watch entries come in, then — after it
 * closes — tick the winners and pay them. Paying is final and happens once.
 */
export default {
    name: 'AdminHiveChallenges',
    data() {
        return { challenges: [], loading: true, form: null, saving: false, errors: {}, judging: null, entries: [], picked: [], awarding: false, STATE };
    },
    mounted() { this.load(); },
    methods: {
        async load() {
            this.loading = true;
            try { this.challenges = (await api.get('/api/admin/hive/challenges')).challenges; }
            catch (e) { toastError(e); }
            finally { this.loading = false; }
        },
        local(iso) { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); },
        day(iso) { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); },
        create() {
            const start = new Date(); const end = new Date(Date.now() + 7 * 864e5);
            this.errors = {};
            this.form = { id: null, title: '', slug: '', description: '', prize_bees: 500, winners: 3, starts_at: this.local(start), ends_at: this.local(end), is_published: false };
        },
        edit(c) {
            this.errors = {};
            this.form = { id: c.id, title: c.title, slug: c.slug, description: c.description || '', prize_bees: c.prize_bees, winners: c.winners, starts_at: this.local(c.starts_at), ends_at: this.local(c.ends_at), is_published: c.is_published };
        },
        async save() {
            this.saving = true; this.errors = {};
            const body = { ...this.form, starts_at: new Date(this.form.starts_at).toISOString(), ends_at: new Date(this.form.ends_at).toISOString() };
            try {
                await (this.form.id ? api.put(`/api/admin/hive/challenges/${this.form.id}`, body) : api.post('/api/admin/hive/challenges', body));
                toast('Challenge saved');
                this.form = null;
                await this.load();
            } catch (e) { this.errors = e.payload?.errors || {}; if (!e.payload?.errors) toastError(e); }
            finally { this.saving = false; }
        },
        async judge(c) {
            try {
                const d = await api.get(`/api/admin/hive/challenges/${c.id}/entries`);
                this.judging = d.challenge; this.entries = d.entries; this.picked = d.entries.filter((e) => e.won).map((e) => e.id);
            } catch (e) { toastError(e); }
        },
        toggle(e) {
            if (this.judging.state !== 'judging') return;
            const i = this.picked.indexOf(e.id);
            if (i >= 0) this.picked.splice(i, 1);
            else if (this.picked.length < this.judging.winners) this.picked.push(e.id);
        },
        async award() {
            const total = this.picked.length * this.judging.prize_bees;
            if (!(await confirmDialog({ title: `Pay ${this.picked.length} ${this.picked.length === 1 ? 'winner' : 'winners'}?`, body: `${total} Bees will be credited now and the winners are told straight away. This can't be undone or repeated.`, confirmLabel: 'Pay winners' }))) return;
            this.awarding = true;
            try {
                await api.post(`/api/admin/hive/challenges/${this.judging.id}/award`, { look_ids: this.picked });
                toast('Winners paid');
                this.judging = null;
                await this.load();
            } catch (e) { toastError(e); }
            finally { this.awarding = false; }
        },
    },
};
</script>

<template>
    <div class="px-4 sm:px-8 py-8 max-w-[1100px]">
        <header class="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
                <h1 class="text-3xl font-serif">Hive challenges</h1>
                <p class="text-sm text-zinc-500 mt-1">Themed calls for looks, with a Bees prize. 100 Bees = $1 at checkout.</p>
            </div>
            <button @click="create" class="px-4 py-2 text-sm bg-zinc-900 text-white hover:bg-zinc-700">New challenge</button>
        </header>

        <p v-if="loading" class="text-sm text-zinc-500 py-10">Loading…</p>
        <p v-else-if="!challenges.length" class="text-sm text-zinc-500 py-16 text-center bg-white border border-zinc-200">No challenges yet. Try a weekly one — “Sunday Best”, “Roora Ready”.</p>

        <div v-else class="bg-white border border-zinc-200">
            <table class="w-full text-sm">
                <thead class="text-left text-xs text-zinc-500 border-b border-zinc-200"><tr><th class="p-3">Challenge</th><th class="p-3">Runs</th><th class="p-3">Prize</th><th class="p-3">Entries</th><th class="p-3">State</th><th class="p-3"></th></tr></thead>
                <tbody>
                    <tr v-for="c in challenges" :key="c.id" class="border-b border-zinc-100 last:border-0">
                        <td class="p-3"><span class="font-medium">{{ c.title }}</span><span class="block text-xs text-zinc-500">{{ c.tag }}</span></td>
                        <td class="p-3 whitespace-nowrap">{{ day(c.starts_at) }} – {{ day(c.ends_at) }}</td>
                        <td class="p-3 whitespace-nowrap">{{ c.prize_bees }} × {{ c.winners }}</td>
                        <td class="p-3">{{ c.entries }}</td>
                        <td class="p-3"><span :class="['text-[10px] tracking-widest uppercase px-2 py-1 whitespace-nowrap', STATE[c.state][1]]">{{ STATE[c.state][0] }}</span></td>
                        <td class="p-3 text-right whitespace-nowrap">
                            <button @click="judge(c)" class="text-xs underline underline-offset-2 mr-3">{{ c.state === 'judging' ? 'Choose winners' : 'Entries' }}</button>
                            <button v-if="c.state !== 'awarded'" @click="edit(c)" class="text-xs underline underline-offset-2">Edit</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Create / edit -->
        <div v-if="form" class="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
            <div class="absolute inset-0 bg-black/40" @click="form = null"></div>
            <form @submit.prevent="save" class="relative bg-white w-full max-w-md h-full overflow-y-auto p-6 space-y-4">
                <h2 class="text-xl font-serif">{{ form.id ? 'Edit challenge' : 'New challenge' }}</h2>
                <label class="block text-sm">Title<input v-model="form.title" required maxlength="80" placeholder="Sunday Best" class="mt-1 w-full border border-zinc-300 px-3 py-2" /><span v-if="errors.title" class="text-xs text-red-600">{{ errors.title[0] }}</span></label>
                <label class="block text-sm">Tag <span class="text-zinc-400">(optional — made from the title)</span><input v-model="form.slug" maxlength="40" placeholder="sunday-best" class="mt-1 w-full border border-zinc-300 px-3 py-2" /><span v-if="errors.slug" class="text-xs text-red-600">{{ errors.slug[0] }}</span></label>
                <label class="block text-sm">What to post<textarea v-model="form.description" rows="3" maxlength="400" class="mt-1 w-full border border-zinc-300 px-3 py-2"></textarea></label>
                <div class="grid grid-cols-2 gap-3">
                    <label class="block text-sm">Bees per winner<input v-model.number="form.prize_bees" type="number" min="0" required class="mt-1 w-full border border-zinc-300 px-3 py-2" /></label>
                    <label class="block text-sm">Winners<input v-model.number="form.winners" type="number" min="1" max="10" required class="mt-1 w-full border border-zinc-300 px-3 py-2" /></label>
                </div>
                <p class="text-xs text-zinc-500 -mt-2">Total prize: {{ (form.prize_bees || 0) * (form.winners || 0) }} Bees (${{ (((form.prize_bees || 0) * (form.winners || 0)) / 100).toFixed(2) }} at the default rate).</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label class="block text-sm">Opens<input v-model="form.starts_at" type="datetime-local" required class="mt-1 w-full border border-zinc-300 px-3 py-2" /></label>
                    <label class="block text-sm">Closes<input v-model="form.ends_at" type="datetime-local" required class="mt-1 w-full border border-zinc-300 px-3 py-2" /><span v-if="errors.ends_at" class="text-xs text-red-600">{{ errors.ends_at[0] }}</span></label>
                </div>
                <label class="flex items-center gap-2 text-sm"><input v-model="form.is_published" type="checkbox" /> Published — members can see and enter it</label>
                <div class="flex gap-2 pt-2">
                    <button type="button" @click="form = null" class="flex-1 py-2.5 text-sm border border-zinc-300">Cancel</button>
                    <button type="submit" :disabled="saving" class="flex-1 py-2.5 text-sm bg-zinc-900 text-white disabled:opacity-50">Save</button>
                </div>
            </form>
        </div>

        <!-- Entries / judging -->
        <div v-if="judging" class="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
            <div class="absolute inset-0 bg-black/40" @click="judging = null"></div>
            <div class="relative bg-white w-full max-w-2xl h-full flex flex-col">
                <header class="p-5 border-b border-zinc-200">
                    <h2 class="text-xl font-serif">{{ judging.title }} <span class="text-zinc-400 text-base">{{ judging.tag }}</span></h2>
                    <p class="text-sm text-zinc-500 mt-1">
                        <template v-if="judging.state === 'judging'">Tick up to {{ judging.winners }} winners — one prize per person. Most-hearted first.</template>
                        <template v-else-if="judging.state === 'awarded'">Winners have been paid.</template>
                        <template v-else>Winners can be chosen once the challenge closes.</template>
                    </p>
                </header>
                <div class="flex-1 overflow-y-auto p-5">
                    <p v-if="!entries.length" class="text-sm text-zinc-500 py-10 text-center">No entries.</p>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <button v-for="e in entries" :key="e.id" @click="toggle(e)" :class="['text-left border-2 overflow-hidden', picked.includes(e.id) ? 'border-emerald-500' : 'border-transparent']">
                            <span class="block aspect-[3/4] bg-zinc-100"><img v-if="e.image" :src="e.image" alt="" loading="lazy" class="w-full h-full object-cover object-top" /></span>
                            <span class="block p-2 text-xs"><span class="font-medium">@{{ e.handle }}</span><span class="block text-zinc-500">♥ {{ e.hearts }} · 💬 {{ e.comments }}</span></span>
                        </button>
                    </div>
                </div>
                <footer class="p-4 border-t border-zinc-200 flex gap-2">
                    <button @click="judging = null" class="flex-1 py-2.5 text-sm border border-zinc-300">Close</button>
                    <button v-if="judging.state === 'judging'" @click="award" :disabled="!picked.length || awarding" class="flex-1 py-2.5 text-sm bg-emerald-600 text-white disabled:opacity-40">Pay {{ picked.length }} × {{ judging.prize_bees }} Bees</button>
                </footer>
            </div>
        </div>
    </div>
</template>
