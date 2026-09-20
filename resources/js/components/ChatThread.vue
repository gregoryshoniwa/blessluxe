<script>
import { Check, CheckCheck, Paperclip, Send, X, LoaderCircle, Download, AtSign, Package, ImageOff, ChevronRight } from 'lucide-vue-next';
import MentionPicker from './MentionPicker.vue';

/**
 * A messaging thread, shared by the affiliate and admin sides.
 *
 * One component rather than two so behaviour that is easy to get subtly wrong —
 * scroll anchoring, message grouping, read state, optimistic send — can't drift
 * between them. The caller owns transport; this owns presentation.
 *
 * Built to the conventions people already know from WhatsApp and Telegram:
 *   - consecutive messages from one sender group into a single bubble stack
 *   - day separators, with Today / Yesterday rather than a bare date
 *   - ticks for sent and read
 *   - the view only auto-scrolls when you are already at the bottom, so a new
 *     message never yanks you away from something you are reading
 *   - history arrives a window at a time as you scroll up, and the view stays
 *     pinned to the message you were looking at while it does
 *   - "@" references a product or pack: it rides on the message as a card the
 *     other side can open, not as text they have to go and search for
 */
export default {
    name: 'ChatThread',
    components: { Check, CheckCheck, Paperclip, Send, X, LoaderCircle, Download, AtSign, Package, ImageOff, ChevronRight, MentionPicker },
    props: {
        messages: { type: Array, default: () => [] },
        // Which `sender` value counts as "me" — 'affiliate' or 'admin'.
        me: { type: String, required: true },
        theirName: { type: String, default: 'Them' },
        sending: { type: Boolean, default: false },
        typing: { type: Boolean, default: false },
        allowAttachments: { type: Boolean, default: true },
        // Where the reader left off. Supplied by the server at open time,
        // because opening the thread marks everything read — after that the
        // messages themselves can no longer say where the new ones began.
        firstUnreadId: { type: String, default: null },
        placeholder: { type: String, default: 'Write a message…' },
        // Older messages exist on the server that haven't been loaded yet.
        hasMore: { type: Boolean, default: false },
        loadingEarlier: { type: Boolean, default: false },
        // Where "@" searches. Leave unset and the feature simply isn't there.
        mentionsUrl: { type: String, default: null },
        // (ref) => URL. The two apps open a product in different places — the
        // shop page for a customer, the editor for staff — so the caller says.
        refUrl: { type: Function, default: null },
    },
    emits: ['send', 'typing', 'load-earlier'],
    data() {
        return {
            body: '',
            files: [],
            atBottom: true,
            lightbox: null,
            typingTimer: null,
            lastTypingAt: 0,
            firstId: null,
            // Products/packs attached to the draft, and the "@" panel.
            refs: [],
            picking: false,
            // Object URLs must be revoked or each attachment preview leaks a
            // blob for the life of the page.
            previews: new Map(),
        };
    },
    computed: {
        /** Their messages that arrived while I wasn't looking. */
        unreadCount() {
            if (this.firstUnreadId) {
                const from = this.messages.findIndex((m) => m.id === this.firstUnreadId);
                if (from === -1) return 0;
                return this.messages.slice(from).filter((m) => m.sender !== this.me).length;
            }
            return this.messages.filter((m) => m.sender !== this.me && !m.read_at).length;
        },
        /**
         * Flatten into a render list of day separators and grouped messages.
         * `startsGroup` drives whether a bubble shows its author and avatar.
         */
        rendered() {
            const out = [];
            let lastDay = null;
            let lastSender = null;
            let lastAt = 0;
            // Only the FIRST unread gets the divider, and only for messages
            // that arrived from the other side.
            let dividerPlaced = this.unreadCount === 0;

            for (const m of this.messages) {
                const at = m.created_at ? new Date(m.created_at).getTime() : Date.now();
                const day = new Date(at).toDateString();

                if (day !== lastDay) {
                    out.push({ type: 'day', key: `d-${day}`, label: this.dayLabel(at) });
                    lastDay = day;
                    lastSender = null;
                }

                // A gap of more than five minutes starts a fresh group even for
                // the same person — otherwise a day's worth of replies reads as
                // one unbroken block.
                const sameGroup = m.sender === lastSender && (at - lastAt) < 5 * 60 * 1000;

                const isBoundary = this.firstUnreadId
                    ? m.id === this.firstUnreadId
                    : (m.sender !== this.me && !m.read_at);

                if (!dividerPlaced && isBoundary && m.sender !== this.me) {
                    out.push({ type: 'unread', key: `unread-${m.id}`, count: this.unreadCount });
                    dividerPlaced = true;
                    lastSender = null;
                }

                out.push({
                    type: 'msg',
                    key: m.id || `m-${at}`,
                    msg: m,
                    mine: m.sender === this.me,
                    startsGroup: !sameGroup,
                });

                lastSender = m.sender;
                lastAt = at;
            }
            return out;
        },
        canSend() {
            return !this.sending && (this.body.trim().length > 0 || this.files.length > 0 || this.refs.length > 0);
        },
        chosenKeys() { return this.refs.map((r) => `${r.type}:${r.id}`); },
    },
    watch: {
        messages: {
            deep: true,
            // Runs BEFORE the DOM updates (Vue's default flush), which is the
            // only moment the old scroll height can still be measured.
            handler(now) {
                const el = this.$refs.scroller;
                const firstNow = now[0]?.id ?? null;
                // Older history was added above what's on screen. Left alone,
                // the browser keeps scrollTop fixed and the content jumps down
                // by the height of everything that was just inserted.
                const prepended = Boolean(
                    el && this.firstId && firstNow !== this.firstId
                    && now.some((m) => m.id === this.firstId)
                );
                const prevHeight = el?.scrollHeight ?? 0;
                const prevTop = el?.scrollTop ?? 0;
                this.firstId = firstNow;

                this.$nextTick(() => {
                    if (prepended && el) {
                        el.scrollTop = prevTop + (el.scrollHeight - prevHeight);
                    } else if (this.atBottom) {
                        // Only follow new messages if the reader is already at
                        // the bottom; otherwise they lose their place.
                        this.scrollToEnd();
                    }
                });
            },
        },
    },
    mounted() {
        this.firstId = this.messages[0]?.id ?? null;
        this.$nextTick(this.scrollToEnd);
    },
    beforeUnmount() {
        clearTimeout(this.typingTimer);
        this.releasePreviews();
    },
    methods: {
        /** Memoised so re-renders don't mint a new blob URL per frame. */
        previewUrl(file) {
            if (!this.previews.has(file)) this.previews.set(file, URL.createObjectURL(file));
            return this.previews.get(file);
        },
        releasePreviews() {
            for (const url of this.previews.values()) URL.revokeObjectURL(url);
            this.previews.clear();
        },
        scrollToEnd() {
            const el = this.$refs.scroller;
            if (el) el.scrollTop = el.scrollHeight;
        },
        onScroll() {
            const el = this.$refs.scroller;
            if (!el) return;
            // 40px of slack so "near enough the bottom" still counts.
            this.atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            // Near the top: fetch the next window before they hit the end of it.
            if (el.scrollTop < 120 && this.hasMore && !this.loadingEarlier) {
                this.$emit('load-earlier');
            }
        },
        onInput(e) {
            this.detectMention(e);
            this.autoGrow();
            // At most one signal every two seconds. The other side holds the
            // indicator for three, so this keeps it lit continuously while
            // sending a fraction of the frames a per-keystroke emit would.
            const now = Date.now();
            if (this.body.trim() && now - this.lastTypingAt > 2000) {
                this.lastTypingAt = now;
                this.$emit('typing');
            }
        },
        autoGrow() {
            const el = this.$refs.input;
            if (!el) return;
            el.style.height = 'auto';
            // Cap it so a long paste can't swallow the conversation.
            el.style.height = Math.min(el.scrollHeight, 160) + 'px';
        },
        /**
         * "@" opens the product panel — but only an "@" that STARTS a word.
         * Without that check, typing an email address would hijack the keyboard
         * halfway through.
         */
        detectMention(e) {
            if (!this.mentionsUrl || e?.data !== '@') return;
            const el = this.$refs.input;
            const at = (el?.selectionStart ?? this.body.length) - 1;
            if (this.body[at] !== '@') return;
            if (at > 0 && !/\s/.test(this.body[at - 1])) return;

            // The "@" was a command, not text — take it back out.
            this.body = this.body.slice(0, at) + this.body.slice(at + 1);
            this.$nextTick(() => { el.selectionStart = el.selectionEnd = at; });
            this.picking = true;
        },
        addRef(item) {
            if (this.refs.length >= 6 || this.chosenKeys.includes(`${item.type}:${item.id}`)) return;
            this.refs.push(item);
            this.closePicker();
        },
        removeRef(i) { this.refs.splice(i, 1); },
        closePicker() {
            this.picking = false;
            this.$nextTick(() => this.$refs.input?.focus());
        },
        urlFor(ref) { return this.refUrl ? this.refUrl(ref) : null; },

        pickFiles(e) {
            this.files = [...this.files, ...Array.from(e.target.files || [])].slice(0, 6);
            e.target.value = '';
        },
        removeFile(i) { this.files.splice(i, 1); },
        submit() {
            if (!this.canSend) return;
            this.$emit('send', { body: this.body, files: this.files, refs: this.refs });
            this.body = '';
            this.files = [];
            this.refs = [];
            this.picking = false;
            this.releasePreviews();
            this.$nextTick(() => {
                this.autoGrow();
                this.atBottom = true;
                this.scrollToEnd();
            });
        },
        // Enter sends, Shift+Enter makes a newline — the convention everywhere.
        onKeydown(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.submit();
            }
        },
        dayLabel(at) {
            const d = new Date(at);
            const today = new Date();
            const yest = new Date(); yest.setDate(today.getDate() - 1);
            if (d.toDateString() === today.toDateString()) return 'Today';
            if (d.toDateString() === yest.toDateString()) return 'Yesterday';
            return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
        },
        time(iso) {
            return iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
        },
        isImage(src) { return /\.(png|jpe?g|gif|webp|avif)$/i.test(src || ''); },
    },
};
</script>

<template>
    <div class="flex flex-col h-full min-h-0">
        <!-- ─── Scrollback ──────────────────────────────────────────── -->
        <div
            ref="scroller"
            @scroll="onScroll"
            class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4"
        >
          <!-- A reading column: on a wide full-screen window, bubbles pinned to
               opposite edges of a 2000px pane are impossible to follow. -->
          <div class="max-w-3xl mx-auto space-y-1">
            <p v-if="!messages.length" class="text-sm text-black/45 text-center py-12">
                No messages yet. Say hello.
            </p>

            <div v-if="hasMore || loadingEarlier" class="flex justify-center pb-2">
                <button
                    @click="$emit('load-earlier')"
                    :disabled="loadingEarlier"
                    class="text-[10px] tracking-widest uppercase text-black/45 hover:text-gold inline-flex items-center gap-1.5 px-3 py-1.5"
                >
                    <LoaderCircle v-if="loadingEarlier" class="w-3 h-3 animate-spin" />
                    {{ loadingEarlier ? 'Loading' : 'Earlier messages' }}
                </button>
            </div>

            <template v-for="row in rendered" :key="row.key">
                <!-- Day separator -->
                <div v-if="row.type === 'day'" class="flex items-center justify-center py-2">
                    <span class="text-[10px] tracking-widest uppercase text-black/45 bg-cream-dark/90 backdrop-blur border border-black/5 px-3 py-1 rounded-full">
                        {{ row.label }}
                    </span>
                </div>

                <!-- Where you left off, so a backlog doesn't have to be re-read. -->
                <div v-else-if="row.type === 'unread'" class="flex items-center gap-3 py-3">
                    <span class="flex-1 h-px bg-gold/30"></span>
                    <span class="text-[10px] tracking-widest uppercase text-gold-dark">
                        {{ row.count }} new {{ row.count === 1 ? 'message' : 'messages' }}
                    </span>
                    <span class="flex-1 h-px bg-gold/30"></span>
                </div>

                <div
                    v-else
                    :class="['flex', row.mine ? 'justify-end' : 'justify-start', row.startsGroup ? 'pt-2' : 'pt-0.5']"
                >
                    <div
                        :class="[
                            'max-w-[88%] sm:max-w-[78%] px-3.5 py-2 relative',
                            row.mine
                                ? 'bg-gold/15 border border-gold/25 rounded-2xl rounded-br-sm'
                                : 'bg-white border border-black/8 rounded-2xl rounded-bl-sm',
                        ]"
                    >
                        <p v-if="row.startsGroup" class="text-[10px] tracking-widest uppercase text-black/40 mb-1">
                            {{ row.mine ? 'You' : theirName }}
                        </p>

                        <p v-if="row.msg.body" class="text-sm whitespace-pre-wrap break-words leading-relaxed">{{ row.msg.body }}</p>

                        <!-- Referenced products / packs. A real link, opened in a
                             new tab: following it must not cost you your place
                             in the conversation. -->
                        <div v-if="row.msg.refs?.length" :class="['flex flex-col gap-1.5', row.msg.body ? 'mt-2' : '']">
                            <component
                                :is="urlFor(r) ? 'a' : 'div'"
                                v-for="r in row.msg.refs"
                                :key="`${r.type}:${r.id}`"
                                :href="urlFor(r)"
                                target="_blank"
                                rel="noopener"
                                class="group flex items-center gap-3 p-1.5 pr-2 rounded-xl bg-white/80 border border-black/8 hover:border-gold/60 transition-colors min-w-[13rem] max-w-xs"
                            >
                                <span class="w-12 h-16 rounded-lg overflow-hidden bg-cream-dark flex items-center justify-center flex-shrink-0">
                                    <img v-if="r.thumbnail" :src="r.thumbnail" loading="lazy" class="w-full h-full object-cover" alt="" />
                                    <component v-else :is="r.type === 'pack' ? 'Package' : 'ImageOff'" class="w-4 h-4 text-black/25" />
                                </span>
                                <span class="min-w-0 flex-1">
                                    <span class="block text-[9px] tracking-widest uppercase text-gold-dark">{{ r.type === 'pack' ? 'Pack' : 'Product' }}</span>
                                    <span class="block text-sm leading-snug line-clamp-2">{{ r.title }}</span>
                                    <span v-if="r.price_label" class="block text-[11px] text-black/50 mt-0.5">{{ r.price_label }}</span>
                                </span>
                                <ChevronRight v-if="urlFor(r)" class="w-4 h-4 text-black/25 group-hover:text-gold flex-shrink-0 transition-colors" />
                            </component>
                        </div>

                        <!-- Attachments: images open full size, anything else downloads. -->
                        <div v-if="row.msg.attachments?.length" class="flex flex-wrap gap-1.5 mt-2">
                            <template v-for="(src, i) in row.msg.attachments" :key="i">
                                <button v-if="isImage(src)" @click="lightbox = src" class="block">
                                    <img :src="src" class="w-24 h-28 object-cover rounded-lg border border-black/10 hover:opacity-90 transition-opacity" alt="" />
                                </button>
                                <a v-else :href="src" target="_blank" rel="noopener"
                                   class="inline-flex items-center gap-1 text-xs text-gold-dark underline">
                                    <Download class="w-3 h-3" /> Attachment
                                </a>
                            </template>
                        </div>

                        <!-- Timestamp and delivery state, in the bubble corner. -->
                        <span class="flex items-center justify-end gap-1 mt-1 text-[10px] text-black/35">
                            {{ time(row.msg.created_at) }}
                            <template v-if="row.mine">
                                <LoaderCircle v-if="row.msg.pending" class="w-3 h-3 animate-spin" />
                                <CheckCheck v-else-if="row.msg.read_at" class="w-3.5 h-3.5 text-gold-dark" />
                                <Check v-else class="w-3.5 h-3.5" />
                            </template>
                        </span>
                    </div>
                </div>
            </template>

            <!-- Typing indicator -->
            <div v-if="typing" class="flex justify-start pt-2">
                <div class="bg-white border border-black/8 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                    <span class="w-1.5 h-1.5 bg-black/30 rounded-full animate-bounce" style="animation-delay:0ms"></span>
                    <span class="w-1.5 h-1.5 bg-black/30 rounded-full animate-bounce" style="animation-delay:150ms"></span>
                    <span class="w-1.5 h-1.5 bg-black/30 rounded-full animate-bounce" style="animation-delay:300ms"></span>
                </div>
            </div>
          </div>
        </div>

        <!-- Jump back down, when you've scrolled away and missed something. -->
        <div v-if="!atBottom" class="relative">
            <button
                @click="atBottom = true; scrollToEnd()"
                class="absolute -top-12 right-4 bg-white border border-black/10 shadow-lg rounded-full pl-3 pr-2.5 py-1.5 text-[10px] tracking-widest uppercase text-black/60 hover:text-gold transition-colors inline-flex items-center gap-2"
            >
                Latest ↓
                <span v-if="unreadCount" class="bg-gold text-white rounded-full min-w-4 h-4 px-1 flex items-center justify-center text-[9px] tabular-nums">
                    {{ unreadCount }}
                </span>
            </button>
        </div>

        <!-- ─── Composer ────────────────────────────────────────────── -->
        <div class="border-t border-black/8 bg-white p-3 relative">
          <div class="max-w-3xl mx-auto relative">
            <!-- The "@" panel floats above the composer, anchored to it, so it
                 never moves the conversation underneath. -->
            <div v-if="picking && mentionsUrl" class="absolute bottom-full left-0 right-0 mb-3 z-30">
                <MentionPicker :endpoint="mentionsUrl" :chosen="chosenKeys" @pick="addRef" @close="closePicker" />
            </div>

            <!-- What's attached to this draft: products first, then photos. -->
            <div v-if="refs.length || files.length" class="flex flex-wrap gap-2 mb-2">
                <span
                    v-for="(r, i) in refs"
                    :key="`${r.type}:${r.id}`"
                    class="relative flex items-center gap-2 pl-1 pr-7 py-1 rounded-xl bg-cream-dark/60 border border-gold/25 max-w-[15rem]"
                >
                    <span class="w-8 h-10 rounded-md overflow-hidden bg-white flex items-center justify-center flex-shrink-0">
                        <img v-if="r.thumbnail" :src="r.thumbnail" class="w-full h-full object-cover" alt="" />
                        <Package v-else class="w-3.5 h-3.5 text-black/25" />
                    </span>
                    <span class="min-w-0">
                        <span class="block text-xs truncate">{{ r.title }}</span>
                        <span class="block text-[10px] text-black/45 truncate">{{ r.price_label }}</span>
                    </span>
                    <button @click="removeRef(i)" class="absolute top-1/2 -translate-y-1/2 right-1.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-500" aria-label="Remove">
                        <X class="w-2.5 h-2.5" />
                    </button>
                </span>

                <span v-for="(f, i) in files" :key="i" class="relative">
                    <img v-if="f.type?.startsWith('image/')" :src="previewUrl(f)" class="w-14 h-16 object-cover rounded border border-black/10" alt="" />
                    <span v-else class="w-14 h-16 rounded border border-black/10 bg-cream-dark flex items-center justify-center text-[9px] text-black/50 px-1 text-center">{{ f.name?.slice(0, 14) }}</span>
                    <button @click="removeFile(i)" class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-500" aria-label="Remove">
                        <X class="w-2.5 h-2.5" />
                    </button>
                </span>
            </div>

            <!-- Text on the left, every control on the right beside Send — one
                 cluster for the thumb, the way messengers lay it out. -->
            <div class="flex items-end gap-1.5">
                <textarea
                    ref="input"
                    v-model="body"
                    @input="onInput"
                    @keydown="onKeydown"
                    rows="1"
                    :placeholder="placeholder"
                    class="flex-1 min-w-0 resize-none border border-black/15 rounded-2xl px-4 py-2.5 text-sm leading-relaxed focus:outline-none focus:border-gold transition-colors"
                ></textarea>

                <button
                    v-if="mentionsUrl"
                    @click="picking = !picking"
                    :class="[
                        'w-10 h-10 rounded-full flex items-center justify-center transition-colors flex-shrink-0',
                        picking ? 'bg-gold/15 text-gold-dark' : 'text-black/40 hover:text-gold hover:bg-gold/10',
                    ]"
                    title="Reference a product or pack (or type @)"
                    aria-label="Reference a product"
                >
                    <AtSign class="w-4 h-4" />
                </button>

                <label
                    v-if="allowAttachments"
                    class="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer text-black/40 hover:text-gold hover:bg-gold/10 transition-colors flex-shrink-0"
                    title="Attach photos"
                >
                    <Paperclip class="w-4 h-4" />
                    <input type="file" accept="image/*" multiple class="hidden" @change="pickFiles" />
                </label>

                <button
                    @click="submit"
                    :disabled="!canSend"
                    class="w-10 h-10 rounded-full bg-gold text-white flex items-center justify-center hover:bg-gold-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    aria-label="Send"
                >
                    <LoaderCircle v-if="sending" class="w-4 h-4 animate-spin" />
                    <Send v-else class="w-4 h-4" />
                </button>
            </div>
            <p class="hidden sm:block text-[10px] text-black/30 mt-1.5 pl-2">
                Enter to send · Shift + Enter for a new line<template v-if="mentionsUrl"> · @ to reference a product</template>
            </p>
          </div>
        </div>

        <!-- Image lightbox -->
        <div v-if="lightbox" class="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-6" @click="lightbox = null">
            <img :src="lightbox" class="max-w-full max-h-full object-contain" alt="" />
            <button class="absolute top-4 right-4 text-white/70 hover:text-white" aria-label="Close">
                <X class="w-6 h-6" />
            </button>
        </div>
    </div>
</template>
