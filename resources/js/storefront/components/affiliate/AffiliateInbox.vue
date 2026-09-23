<script>
import { api } from '../../../lib/api.js';
import { toast } from '../../../lib/dialog.js';
import { markRaw } from 'vue';
import { createConversation } from '../../../lib/conversation.js';
import ChatThread from '../../../components/ChatThread.vue';
import ChatShell from '../../../components/ChatShell.vue';
import CallPanel from '../../../components/CallPanel.vue';
import { Package, X, ImagePlus, LoaderCircle } from 'lucide-vue-next';

/**
 * The affiliate's conversation with BLESSLUXE.
 *
 * All chat behaviour — windows, deltas, ticks, presence, optimistic send —
 * lives in lib/conversation.js, shared with the admin inbox. This component is
 * layout plus the one thing only an affiliate does: asking for a piece.
 */
export default {
    name: 'AffiliateInbox',
    components: { ChatThread, ChatShell, CallPanel, Package, X, ImagePlus, LoaderCircle },
    data() {
        // markRaw: the controller is closures and timers, not data. Only its
        // `state` (already reactive) should be tracked.
        const chat = markRaw(createConversation({
            me: 'affiliate',
            url: '/api/account/affiliate/messages',
            readUrl: '/api/account/affiliate/messages/read',
        }));
        return {
            chat,
            c: chat.state,
            loading: true,
            affiliateId: null,
            // A scrolling chat nested inside a scrolling page is the worst of
            // both on a phone, so there it opens as its own screen — the way
            // every phone messenger does. Minimise is one tap away.
            fullscreen: window.matchMedia('(max-width: 639px)').matches,
            // Stock request form
            showRequest: false,
            request: { title: '', note: '' },
            requestFiles: [],
            requesting: false,
        };
    },
    computed: {
        status() {
            if (this.c.typing) return 'typing…';
            if (this.c.peerOnline) return 'online';
            return 'Usually replies within a day';
        },
    },
    async mounted() {
        try {
            const d = await this.chat.open();
            this.affiliateId = d.affiliate_id;
            this.chat.connect(`affiliate.${d.affiliate_id}`);
        } catch (e) {
            toast(e.payload?.error || 'Could not load your messages.', { tone: 'error' });
        } finally { this.loading = false; }
    },
    beforeUnmount() {
        this.chat.destroy();
    },
    methods: {
        async send(payload) {
            try { await this.chat.send(payload); }
            catch (e) {
                toast(e.status === 429
                    ? "You're sending messages very quickly — give it a moment."
                    : (e.payload?.error || e.payload?.message || 'Could not send that.'), { tone: 'error' });
            }
        },

        /** Where a referenced item opens for a customer: its page in the shop. */
        refUrl(ref) {
            return ref.type === 'pack' ? `/shop/series/${ref.handle}` : `/shop/${ref.handle}`;
        },

        /** A failed call is worth surfacing — it is usually a permission prompt
         *  that was dismissed, or a network with no route. */
        onCallError(message) { toast(message, { tone: 'error' }); },

        pickRequestFiles(e) { this.requestFiles = Array.from(e.target.files || []).slice(0, 6); },

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
                // The request posts INTO the thread; pull it in rather than
                // waiting for the next poll.
                await this.chat.open();
                toast("Sent to BLESSLUXE — you'll get a reply here.");
            } catch (e) {
                toast(e.payload?.error || 'Could not send that request.', { tone: 'error' });
            } finally { this.requesting = false; }
        },
    },
};
</script>

<template>
    <div>
        <p v-if="loading" class="text-sm text-black/55">Loading…</p>

        <ChatShell
            v-else
            v-model:fullscreen="fullscreen"
            height="min(640px, calc(100vh - 12rem))"
        >
            <template #thread-header>
                <div class="w-9 h-9 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center flex-shrink-0 relative">
                    <span class="font-display text-sm text-gold-dark">B</span>
                    <span
                        v-if="c.peerOnline"
                        class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white"
                    ></span>
                </div>
                <div class="min-w-0">
                    <p class="font-display text-sm tracking-widest uppercase text-gold-dark truncate">BLESSLUXE</p>
                    <p :class="['text-[11px] truncate', c.typing || c.peerOnline ? 'text-emerald-600' : 'text-black/40']">{{ status }}</p>
                </div>
            </template>

            <!-- Everything the conversation needs travels WITH it, so full
                 screen loses nothing: calling and asking for a piece both live
                 here rather than in the page around the chat. -->
            <template #actions>
                <CallPanel
                    v-if="affiliateId"
                    :channel="`affiliate.${affiliateId}`"
                    ice-url="/api/account/rtc/ice"
                    peer-name="BLESSLUXE"
                    @call-error="onCallError"
                />
                <button
                    @click="showRequest = !showRequest"
                    :class="[
                        'h-8 px-3 inline-flex items-center gap-1.5 rounded-full text-[10px] tracking-widest uppercase transition-colors',
                        showRequest ? 'bg-gold text-white' : 'text-gold-dark border border-gold/40 hover:bg-gold/10',
                    ]"
                    title="Ask us to stock something"
                >
                    <Package class="w-3.5 h-3.5" />
                    <span class="hidden sm:inline">Ask for a piece</span>
                </button>
            </template>

            <div class="h-full flex flex-col min-h-0 relative">
                <!-- Stock request: a sheet over the top of the conversation. It
                     scrolls on its own, so a long note can never push the
                     composer off the bottom of the screen. -->
                <section
                    v-if="showRequest"
                    class="absolute inset-x-0 top-0 z-20 max-h-full overflow-y-auto bg-cream border-b border-gold/30 shadow-lg"
                >
                    <div class="max-w-3xl mx-auto p-4">
                        <div class="flex items-start justify-between gap-3 mb-3">
                            <p class="text-xs text-black/60 leading-relaxed">
                                Seen something your people would buy? Send it over with photos and we'll look into stocking it.
                            </p>
                            <button @click="showRequest = false" class="text-black/40 hover:text-black flex-shrink-0" aria-label="Close">
                                <X class="w-4 h-4" />
                            </button>
                        </div>
                        <input v-model="request.title" placeholder="What is it?" maxlength="160" class="w-full border border-black/15 bg-white px-3 py-2 text-sm mb-2 focus:outline-none focus:border-gold" />
                        <textarea v-model="request.note" rows="3" placeholder="Where you saw it, sizes, who it's for… (optional)" class="w-full border border-black/15 bg-white px-3 py-2 text-sm mb-2 focus:outline-none focus:border-gold"></textarea>
                        <div class="flex items-center justify-between gap-3 flex-wrap">
                            <label class="inline-flex items-center gap-2 text-[10px] tracking-widest uppercase text-black/55 cursor-pointer hover:text-gold-dark">
                                <ImagePlus class="w-4 h-4" />
                                <span>{{ requestFiles.length ? `${requestFiles.length} photo${requestFiles.length === 1 ? '' : 's'}` : 'Add photos' }}</span>
                                <input type="file" accept="image/*" multiple class="hidden" @change="pickRequestFiles" />
                            </label>
                            <button
                                @click="submitRequest"
                                :disabled="requesting || !request.title.trim()"
                                class="bg-gold text-white px-6 py-2.5 text-[10px] font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark disabled:opacity-40 inline-flex items-center gap-2"
                            >
                                <LoaderCircle v-if="requesting" class="w-3 h-3 animate-spin" />
                                {{ requesting ? 'Sending' : 'Send request' }}
                            </button>
                        </div>
                    </div>
                </section>

                <div class="flex-1 min-h-0">
                    <ChatThread
                        :messages="c.messages"
                        me="affiliate"
                        their-name="BLESSLUXE"
                        :sending="c.sending"
                        :typing="c.typing"
                        :first-unread-id="c.firstUnreadId"
                        :has-more="c.hasMore"
                        :loading-earlier="c.loadingEarlier"
                        mentions-url="/api/account/affiliate/mentions"
                        :ref-url="refUrl"
                        @send="send"
                        @typing="chat.notifyTyping()"
                        @load-earlier="chat.loadEarlier()"
                    />
                </div>
            </div>
        </ChatShell>
    </div>
</template>
