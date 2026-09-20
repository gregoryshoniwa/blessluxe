<script>
import { api } from '../../../lib/api.js';
import { toast } from '../../../lib/dialog.js';
import { Send, Paperclip, LoaderCircle, X, Package } from 'lucide-vue-next';

/**
 * One conversation with BLESSLUXE, plus the form for asking them to stock
 * something. Stock requests post INTO the thread rather than living in a
 * separate list, so an affiliate reads the decision where they asked.
 */
export default {
    name: 'AffiliateInbox',
    components: { Send, Paperclip, LoaderCircle, X, Package },
    data() {
        return {
            messages: [],
            loading: true,
            body: '',
            files: [],
            sending: false,
            // Stock request form
            showRequest: false,
            request: { title: '', note: '' },
            requestFiles: [],
            requesting: false,
        };
    },
    async mounted() { await this.load(); },
    methods: {
        async load() {
            this.loading = true;
            try {
                const d = await api.get('/api/account/affiliate/messages');
                this.messages = d.messages;
                this.$nextTick(this.scrollToEnd);
            } catch (e) {
                toast(e.payload?.error || 'Could not load your messages.', { tone: 'error' });
            } finally { this.loading = false; }
        },
        scrollToEnd() {
            const el = this.$refs.thread;
            if (el) el.scrollTop = el.scrollHeight;
        },
        pickFiles(e, target) { this[target] = Array.from(e.target.files || []).slice(0, 6); },

        async send() {
            if (!this.body.trim() && !this.files.length) return;
            this.sending = true;
            try {
                // FormData because of the photos; the api wrapper passes it through.
                const fd = new FormData();
                fd.append('body', this.body);
                this.files.forEach((f) => fd.append('images[]', f));
                const d = await api.post('/api/account/affiliate/messages', fd);
                this.messages = d.messages;
                this.body = '';
                this.files = [];
                this.$nextTick(this.scrollToEnd);
            } catch (e) {
                toast(e.payload?.error || 'Could not send that.', { tone: 'error' });
            } finally { this.sending = false; }
        },

        async submitRequest() {
            if (!this.request.title.trim()) return;
            this.requesting = true;
            try {
                const fd = new FormData();
                fd.append('title', this.request.title);
                if (this.request.note) fd.append('note', this.request.note);
                this.requestFiles.forEach((f) => fd.append('images[]', f));
                await api.post('/api/account/affiliate/requests', fd);
                this.request = { title: '', note: '' };
                this.requestFiles = [];
                this.showRequest = false;
                await this.load();
                toast('Sent to BLESSLUXE — you\'ll get a reply here.');
            } catch (e) {
                toast(e.payload?.error || 'Could not send that request.', { tone: 'error' });
            } finally { this.requesting = false; }
        },

        fmt(iso) {
            return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
        },
    },
};
</script>

<template>
    <div>
        <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h3 class="font-display text-sm tracking-widest uppercase text-gold">Messages</h3>
            <button
                @click="showRequest = !showRequest"
                class="text-[10px] tracking-widest uppercase border border-gold/40 text-gold-dark px-3 py-1.5 hover:bg-gold/10 transition-colors inline-flex items-center gap-1"
            >
                <Package class="w-3 h-3" /> {{ showRequest ? 'Close' : 'Ask for a piece' }}
            </button>
        </div>

        <!-- Stock request: the "send pictures of what you'd like us to carry" path. -->
        <section v-if="showRequest" class="bg-cream-dark/40 border border-gold/20 p-4 mb-5">
            <p class="text-xs text-black/60 mb-3">
                Seen something your people would buy? Send it over with photos and we'll look into stocking it.
            </p>
            <input v-model="request.title" placeholder="What is it?" maxlength="160" class="w-full border border-black/15 px-3 py-2 text-sm mb-2" />
            <textarea v-model="request.note" rows="3" placeholder="Where you saw it, sizes, who it's for… (optional)" class="w-full border border-black/15 px-3 py-2 text-sm mb-2"></textarea>
            <label class="inline-flex items-center gap-2 text-[10px] tracking-widest uppercase text-black/55 cursor-pointer mb-3">
                <Paperclip class="w-3.5 h-3.5" />
                <span>{{ requestFiles.length ? `${requestFiles.length} photo(s)` : 'Add photos' }}</span>
                <input type="file" accept="image/*" multiple class="hidden" @change="pickFiles($event, 'requestFiles')" />
            </label>
            <button
                @click="submitRequest"
                :disabled="requesting || !request.title.trim()"
                class="w-full bg-gold text-white py-2.5 text-[10px] font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark disabled:opacity-40"
            >
                {{ requesting ? 'Sending…' : 'Send request' }}
            </button>
        </section>

        <p v-if="loading" class="text-sm text-black/55">Loading…</p>

        <template v-else>
            <div ref="thread" class="border border-gold/10 bg-white max-h-[420px] overflow-y-auto p-4 space-y-4">
                <p v-if="!messages.length" class="text-sm text-black/50 text-center py-8">
                    Nothing yet. Say hello, or ask us to stock something.
                </p>

                <div
                    v-for="m in messages"
                    :key="m.id"
                    :class="['flex', m.sender === 'affiliate' ? 'justify-end' : 'justify-start']"
                >
                    <div
                        class="max-w-[80%] px-4 py-2.5"
                        :class="m.sender === 'affiliate' ? 'bg-gold/15 border border-gold/25' : 'bg-cream-dark/50 border border-black/5'"
                    >
                        <p class="text-[10px] tracking-widest uppercase text-black/45 mb-1">
                            {{ m.sender === 'affiliate' ? 'You' : 'BLESSLUXE' }} · {{ fmt(m.created_at) }}
                        </p>
                        <p class="text-sm whitespace-pre-line leading-relaxed">{{ m.body }}</p>
                        <div v-if="m.attachments?.length" class="flex flex-wrap gap-2 mt-2">
                            <a v-for="(src, i) in m.attachments" :key="i" :href="src" target="_blank" rel="noopener">
                                <img :src="src" class="w-16 h-20 object-cover border border-black/10" alt="" />
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mt-3 flex items-end gap-2">
                <textarea
                    v-model="body"
                    rows="2"
                    placeholder="Write a message…"
                    class="flex-1 border border-black/15 px-3 py-2 text-sm"
                ></textarea>
                <label class="cursor-pointer text-black/45 hover:text-gold p-2" title="Attach photos">
                    <Paperclip class="w-4 h-4" />
                    <input type="file" accept="image/*" multiple class="hidden" @change="pickFiles($event, 'files')" />
                </label>
                <button
                    @click="send"
                    :disabled="sending || (!body.trim() && !files.length)"
                    class="bg-gold text-white px-4 py-2.5 hover:bg-gold-dark disabled:opacity-40"
                >
                    <LoaderCircle v-if="sending" class="w-4 h-4 animate-spin" />
                    <Send v-else class="w-4 h-4" />
                </button>
            </div>
            <p v-if="files.length" class="text-[10px] tracking-widest uppercase text-black/45 mt-1">
                {{ files.length }} photo(s) attached
                <button @click="files = []" class="ml-1 text-black/30 hover:text-red-500"><X class="w-3 h-3 inline" /></button>
            </p>
        </template>
    </div>
</template>
