<script>
import { api } from '../../lib/api.js';
import { confirmDialog, toast, toastError } from '../../lib/dialog.js';

const REASONS = { minor: 'Shows a child', nudity: 'Nudity', harassment: 'Bullying', scam: 'Scam', spam: 'Spam', other: 'Other' };

/**
 * Bless Hive moderation queue. One card per REPORTED THING, not per report:
 * five people flagging one look is one decision, and deciding it closes all five.
 * Reports about a child are always listed first (the server orders them).
 */
export default {
    name: 'AdminHiveReports',
    data() {
        return { status: 'open', reports: [], openCount: 0, loading: true, busy: null, REASONS };
    },
    computed: {
        subjects() {
            const map = new Map();
            for (const r of this.reports) {
                const key = `${r.subject_type}:${r.look?.id || r.talk?.id || r.page?.handle || r.id}`;
                if (!map.has(key)) map.set(key, { key, first: r, type: r.subject_type, look: r.look, talk: r.talk, page: r.page, reports: [] });
                map.get(key).reports.push(r);
            }
            return [...map.values()];
        },
    },
    mounted() { this.load(); },
    methods: {
        async load() {
            this.loading = true;
            try {
                const d = await api.get(`/api/admin/hive/reports?status=${this.status}`);
                this.reports = d.reports;
                this.openCount = d.open_count;
            } catch (e) { toastError(e); }
            finally { this.loading = false; }
        },
        author(s) { return s.look?.author || s.talk?.author || s.page?.handle; },
        noun(s) { return { look: 'Look by', page: 'Page', comment: 'Comment by', ask: 'Question by', answer: 'Answer by' }[s.type] || s.type; },
        hasMinor(s) { return s.reports.some((r) => r.reason === 'minor'); },
        when(iso) { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); },

        async decide(s, decision, suspend = false) {
            if (suspend && !(await confirmDialog({
                title: 'Suspend this page?',
                body: `@${this.author(s)} will disappear from the Hive and won't be able to post. Their shop orders are not affected.`,
                confirmLabel: 'Suspend', tone: 'danger',
            }))) return;

            this.busy = s.key;
            try {
                await api.put(`/api/admin/hive/reports/${s.first.id}`, { decision, suspend });
                toast(decision === 'dismiss' ? 'Dismissed — restored if it was hidden' : suspend ? 'Page suspended' : 'Hidden');
                await this.load();
            } catch (e) { toastError(e); }
            finally { this.busy = null; }
        },
    },
};
</script>

<template>
    <div class="px-4 sm:px-8 py-8 max-w-[1100px]">
        <header class="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
                <h1 class="text-3xl font-serif">Hive reports</h1>
                <p class="text-sm text-zinc-500 mt-1">What members have flagged in Bless Hive. {{ openCount }} waiting.</p>
            </div>
            <select v-model="status" @change="load" class="border border-zinc-300 px-3 py-1.5 text-sm bg-white">
                <option value="open">Open</option>
                <option value="upheld">Upheld</option>
                <option value="dismissed">Dismissed</option>
            </select>
        </header>

        <p v-if="loading" class="text-sm text-zinc-500 py-10">Loading…</p>
        <p v-else-if="!subjects.length" class="text-sm text-zinc-500 py-16 text-center bg-white border border-zinc-200">
            {{ status === 'open' ? 'Nothing waiting. The Hive is quiet.' : 'Nothing here.' }}
        </p>

        <div v-else class="space-y-4">
            <article v-for="s in subjects" :key="s.key" :class="['bg-white border p-4 sm:p-5 flex flex-col sm:flex-row gap-4', hasMinor(s) ? 'border-red-400' : 'border-zinc-200']">
                <!-- What was reported -->
                <div v-if="s.look || s.talk?.images?.length" class="flex gap-2 flex-shrink-0">
                    <a v-for="src in (s.look || s.talk).images.slice(0, 2)" :key="src" :href="src" target="_blank" rel="noopener" class="block w-24 h-32 bg-zinc-100 overflow-hidden">
                        <img :src="src" alt="" class="w-full h-full object-cover" />
                    </a>
                </div>

                <div class="min-w-0 flex-1">
                    <p v-if="hasMinor(s)" class="inline-block bg-red-600 text-white text-[10px] tracking-widest uppercase px-2 py-1 mb-2">Child safety — review first</p>
                    <p class="text-sm">
                        <span class="text-zinc-500">{{ noun(s) }}</span>
                        <a :href="`/@${author(s)}`" target="_blank" rel="noopener" class="ml-1 font-medium underline underline-offset-2">@{{ author(s) || 'deleted' }}</a>
                        <span v-if="s.look || s.talk" :class="['ml-2 text-[10px] tracking-widest uppercase px-2 py-0.5', (s.look || s.talk).status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700']">{{ (s.look || s.talk).status }}</span>
                        <span v-if="s.page?.suspended" class="ml-2 text-[10px] tracking-widest uppercase px-2 py-0.5 bg-red-100 text-red-700">suspended</span>
                        <span v-if="s.type !== 'page' && !s.look && !s.talk" class="ml-2 text-xs text-zinc-400">— already removed by its owner</span>
                    </p>
                    <p v-if="s.talk?.text" class="text-sm text-zinc-800 mt-1 break-words">“{{ s.talk.text }}”</p>
                    <a v-if="s.look?.video_url" :href="s.look.video_url" target="_blank" rel="noopener" class="inline-block mt-1 text-xs underline underline-offset-2">▶ This look is a video — watch it</a>
                    <a v-if="s.look?.embed" :href="s.look.embed.source" target="_blank" rel="noopener" class="inline-block mt-1 text-xs underline underline-offset-2">↗ This look is a {{ s.look.embed.label }} post — open it</a>
                    <p v-if="s.look?.caption" class="text-sm text-zinc-600 mt-1 break-words">“{{ s.look.caption }}”</p>

                    <ul class="mt-3 space-y-1.5">
                        <li v-for="r in s.reports" :key="r.id" class="text-xs text-zinc-600">
                            <span class="font-medium text-zinc-900">{{ REASONS[r.reason] || r.reason }}</span>
                            · @{{ r.reporter || 'member' }} · {{ when(r.created_at) }}
                            <span v-if="r.note" class="block text-zinc-500 mt-0.5 break-words">“{{ r.note }}”</span>
                        </li>
                    </ul>

                    <div v-if="status === 'open'" class="flex flex-wrap gap-2 mt-4">
                        <button @click="decide(s, 'dismiss')" :disabled="busy === s.key" class="px-4 py-2 text-xs border border-zinc-300 hover:bg-zinc-50 disabled:opacity-50">Dismiss{{ (s.look || s.talk)?.status === 'hidden' ? ' & restore' : '' }}</button>
                        <button v-if="s.type !== 'page'" @click="decide(s, 'uphold')" :disabled="busy === s.key" class="px-4 py-2 text-xs bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50">Hide {{ s.type === 'ask' ? 'question' : s.type }}</button>
                        <button @click="decide(s, 'uphold', true)" :disabled="busy === s.key" class="px-4 py-2 text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">{{ s.type === 'page' ? 'Suspend page' : 'Hide & suspend page' }}</button>
                    </div>
                </div>
            </article>
        </div>
    </div>
</template>
