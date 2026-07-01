<script>
import { api } from '../../lib/api.js';
import { MessageCircle, X, Send, Mic, MicOff, Sparkles, RotateCcw } from 'lucide-vue-next';

/**
 * Floating LUXE shopping assistant.
 *
 * State machine:
 *   closed → open (text-only, no greeting yet)
 *           ↓
 *         opening (POST /agent/opening) → idle
 *           ↓
 *         user sends → loading (POST /agent) → idle
 *           ↓
 *         voice toggle → connecting (Gemini Live WebSocket) → listening / speaking
 *
 * The widget bootstraps once: it pulls `/agent/config` for the live model
 * + api key, then keeps the JSON config in memory. Voice mode lazily
 * imports the GeminiLiveClient so guests who never tap the mic never
 * download the audio code.
 */
export default {
    name: 'ChatWidget',
    components: { MessageCircle, X, Send, Mic, MicOff, Sparkles, RotateCcw },
    data() {
        return {
            open: false,
            messages: [],        // { id, role, content, products?, ui_updates? }
            input: '',
            loading: false,
            error: '',
            sessionId: localStorage.getItem('luxe_session_id') || ('sess_' + Math.random().toString(36).slice(2)),
            config: null,        // { enabled, model, live_model, api_key }
            booted: false,
            // Voice state
            live: null,
            liveState: 'disconnected', // disconnected | connecting | connected | error
            liveTranscript: '',
            voiceResponseBuffer: '',
            voiceTools: [],
            voiceSystemPrompt: '',
            speaking: false,
            activeTools: [],
        };
    },
    computed: {
        canVoice() {
            return Boolean(this.config?.enabled && this.config?.api_key && this.config?.live_model);
        },
    },
    async mounted() {
        if (!localStorage.getItem('luxe_session_id')) localStorage.setItem('luxe_session_id', this.sessionId);
        try {
            this.config = await api.get('/api/store/agent/config');
        } catch { /* widget shows but won't be able to call agent */ }
    },
    beforeUnmount() {
        this.disconnectVoice();
    },
    watch: {
        messages() { this.$nextTick(() => this.scrollToBottom()); },
    },
    methods: {
        async toggle() {
            this.open = !this.open;
            if (this.open && !this.booted) {
                this.booted = true;
                await this.bootstrap();
            }
        },
        async bootstrap() {
            this.loading = true;
            try {
                const h = await api.get(`/api/store/agent/history?session_id=${encodeURIComponent(this.sessionId)}`);
                if (h.messages?.length) {
                    this.messages = h.messages.map((m) => ({
                        id: m.id,
                        role: m.role,
                        content: m.content,
                        products: m.products || [],
                        ui_updates: m.ui_updates || [],
                    }));
                } else {
                    const o = await api.post('/api/store/agent/opening', { session_id: this.sessionId });
                    this.pushAssistant(o.text, [], []);
                }
            } catch (e) {
                this.error = e.payload?.error || 'Could not start chat.';
            } finally {
                this.loading = false;
            }
        },
        async send() {
            const text = this.input.trim();
            if (!text || this.loading) return;
            this.input = '';
            this.pushUser(text);
            this.loading = true;
            this.error = '';
            try {
                const history = this.messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
                const resp = await api.post('/api/store/agent', {
                    text, session_id: this.sessionId, history,
                });
                this.pushAssistant(resp.text, resp.products || [], resp.ui_updates || []);
                this.applyUiUpdates(resp.ui_updates || []);
            } catch (e) {
                this.error = e.payload?.error || 'Sorry — that didn\'t go through.';
            } finally {
                this.loading = false;
            }
        },
        pushUser(text) {
            this.messages.push({ id: crypto.randomUUID(), role: 'user', content: text });
        },
        pushAssistant(text, products = [], ui = []) {
            this.messages.push({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: text,
                products,
                ui_updates: ui,
            });
        },
        applyUiUpdates(updates) {
            for (const u of updates) {
                if (u.type === 'navigate' && u.target) this.$router.push(u.target);
                if (u.type === 'open_cart_drawer') window.dispatchEvent(new CustomEvent('blessluxe:cart-updated'));
            }
        },
        openProduct(p) {
            if (!p?.handle) return;
            this.$router.push(`/shop/${p.handle}`);
            this.open = false;
        },
        scrollToBottom() {
            const el = this.$refs.scroll;
            if (el) el.scrollTop = el.scrollHeight;
        },

        // ── Voice (Gemini Live) ──────────────────────────────────────
        async toggleVoice() {
            if (!this.canVoice) {
                this.error = 'Voice is unavailable. Set GOOGLE_AI_API_KEY on the server.';
                return;
            }
            if (this.live) {
                this.disconnectVoice();
                return;
            }
            try {
                const setup = await api.get('/api/store/agent/live-setup');
                this.voiceTools = setup.tools || [];
                this.voiceSystemPrompt = setup.system_instruction || '';
                const { GeminiLiveClient } = await import('../lib/gemini-live.js');
                this.live = new GeminiLiveClient({
                    apiKey: this.config.api_key,
                    model: this.config.live_model,
                    systemInstruction: this.voiceSystemPrompt,
                    tools: this.voiceTools,
                    executeTool: async (name, args) => {
                        const r = await api.post('/api/store/agent/execute-tool', {
                            name, arguments: args, session_id: this.sessionId,
                        });
                        // Tools that return UI actions should fire client-side
                        // navigation/refresh effects.
                        if (r.ui_action) this.applyUiUpdates([r.ui_action]);
                        // Surface product cards from search-y tools.
                        const prods = r.data?.products || r.data?.recommendations || [];
                        if (prods.length) {
                            this.pushAssistant('', prods, r.ui_action ? [r.ui_action] : []);
                        }
                        return r;
                    },
                }, {
                    onStateChange: (s) => { this.liveState = s; if (s !== 'connected') this.speaking = false; },
                    onTranscript: (text, isFinal) => {
                        if (!isFinal) { this.liveTranscript = text; return; }
                        this.liveTranscript = '';
                        if (text.trim()) this.pushUser(text.trim());
                    },
                    onResponseText: (text) => { this.voiceResponseBuffer += text; },
                    onTurnComplete: () => {
                        if (this.voiceResponseBuffer.trim()) {
                            this.pushAssistant(this.voiceResponseBuffer.trim());
                            this.voiceResponseBuffer = '';
                        }
                        this.speaking = false;
                    },
                    onAudioChunk: () => { this.speaking = true; },
                    onToolCall: (name) => { this.activeTools.push(name); },
                    onToolResult: (name) => {
                        const idx = this.activeTools.indexOf(name);
                        if (idx >= 0) this.activeTools.splice(idx, 1);
                    },
                    onInterrupted: () => { this.speaking = false; },
                    onError: (e) => { this.error = e?.message || 'Voice error.'; },
                    onSetupComplete: () => {
                        // Greet first.
                        if (!this.messages.length) {
                            this.live?.sendText('[Session start — speak first. Give a brief warm welcome in 1–2 sentences. Use first name if known. Prose only, no tools.]');
                        }
                    },
                });
                await this.live.connect();
            } catch (e) {
                this.error = e?.message || 'Could not connect voice.';
                this.live = null;
            }
        },
        async newConversation() {
            // Close voice if open, then reset session and history.
            if (this.live) this.disconnectVoice();
            try {
                const r = await api.post('/api/store/agent/reset', { session_id: this.sessionId });
                if (r.session_id) {
                    this.sessionId = r.session_id;
                    localStorage.setItem('luxe_session_id', this.sessionId);
                }
            } catch { /* even without the server call we still reset locally */ }
            this.messages = [];
            this.error = '';
            this.input = '';
            // Fire a fresh opening greeting.
            this.loading = true;
            try {
                const o = await api.post('/api/store/agent/opening', { session_id: this.sessionId });
                this.pushAssistant(o.text, [], []);
            } catch (e) {
                this.error = e.payload?.error || 'Could not start a new chat.';
            } finally {
                this.loading = false;
            }
        },
        disconnectVoice() {
            if (this.live) {
                this.live.disconnect();
                this.live = null;
            }
            this.liveState = 'disconnected';
            this.liveTranscript = '';
            this.voiceResponseBuffer = '';
            this.speaking = false;
            this.activeTools = [];
        },
    },
};
</script>

<template>
    <!-- Floating launcher -->
    <button
        @click="toggle"
        :class="['fixed bottom-5 right-5 z-50 rounded-full shadow-lg flex items-center justify-center transition-all',
                 open ? 'w-12 h-12 bg-black text-white' : 'w-14 h-14 bg-gold text-white hover:bg-gold-dark']"
        aria-label="Chat with LUXE"
    >
        <X v-if="open" class="w-5 h-5" />
        <Sparkles v-else class="w-6 h-6" />
    </button>

    <transition name="luxe-panel">
        <div v-if="open"
             class="fixed bottom-24 right-5 z-50 w-[min(380px,calc(100vw-2rem))] h-[min(620px,calc(100vh-7rem))] bg-white shadow-2xl border border-gold/15 flex flex-col">
            <!-- Header -->
            <header class="px-4 py-3 border-b border-gold/10 flex items-center justify-between bg-gradient-to-r from-cream-dark/50 to-cream">
                <div>
                    <p class="font-script text-xl text-gold leading-none">LUXE</p>
                    <p class="text-[10px] tracking-widest uppercase text-black/55">Your shopping assistant</p>
                </div>
                <div class="flex items-center gap-1">
                    <button @click="newConversation"
                            :disabled="loading"
                            class="p-2 rounded-full text-black/60 hover:text-gold transition-colors disabled:opacity-40"
                            title="Start a new conversation">
                        <RotateCcw class="w-4 h-4" />
                    </button>
                    <button v-if="canVoice"
                            @click="toggleVoice"
                            :class="['p-2 rounded-full transition-colors',
                                     liveState === 'connected' ? 'bg-emerald-500 text-white' :
                                     liveState === 'connecting' ? 'bg-amber-100 text-amber-700' :
                                     'text-black/60 hover:text-gold']"
                            :title="liveState === 'connected' ? 'End voice chat' : 'Start voice chat'">
                        <Mic v-if="liveState !== 'connected'" class="w-4 h-4" />
                        <MicOff v-else class="w-4 h-4" />
                    </button>
                </div>
            </header>

            <!-- Live state banner -->
            <div v-if="liveState === 'connecting'" class="px-4 py-2 text-xs bg-amber-50 text-amber-800 border-b border-amber-100">
                Connecting voice…
            </div>
            <div v-else-if="liveState === 'connected'" class="px-4 py-2 text-xs bg-emerald-50 text-emerald-800 border-b border-emerald-100 flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span v-if="speaking">LUXE is speaking…</span>
                <span v-else>Listening…</span>
                <span v-if="activeTools.length" class="ml-auto text-amber-700">using {{ activeTools.join(', ') }}</span>
            </div>

            <!-- Scroll area -->
            <div ref="scroll" class="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-cream/30">
                <div v-for="m in messages" :key="m.id">
                    <div v-if="m.role === 'user'" class="flex justify-end">
                        <p class="bg-gold/90 text-white px-3 py-2 rounded-2xl rounded-br-sm max-w-[85%] text-sm whitespace-pre-wrap">{{ m.content }}</p>
                    </div>
                    <div v-else class="flex flex-col gap-2">
                        <p v-if="m.content" class="bg-white border border-gold/10 px-3 py-2 rounded-2xl rounded-bl-sm max-w-[90%] text-sm whitespace-pre-wrap text-black">{{ m.content }}</p>
                        <div v-if="m.products && m.products.length" class="grid grid-cols-2 gap-2">
                            <button v-for="p in m.products.slice(0, 4)" :key="p.id" @click="openProduct(p)"
                                    class="text-left bg-white border border-gold/10 hover:border-gold/40 transition-colors overflow-hidden">
                                <div class="aspect-[3/4] bg-cream-dark/40">
                                    <img v-if="p.thumbnail" :src="p.thumbnail" :alt="p.title" class="w-full h-full object-cover object-top" />
                                </div>
                                <div class="px-2 py-1.5">
                                    <p class="text-xs line-clamp-1 font-display">{{ p.title }}</p>
                                    <p class="text-[10px] text-black/60">{{ p.price_label || '' }}</p>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
                <div v-if="loading" class="text-xs text-black/55 inline-flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full bg-gold animate-pulse"></span>
                    LUXE is thinking…
                </div>
                <p v-if="liveTranscript" class="text-xs text-black/50 italic">{{ liveTranscript }}</p>
                <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
            </div>

            <!-- Composer -->
            <form @submit.prevent="send" class="px-3 py-3 border-t border-gold/10 flex items-center gap-2 bg-white">
                <input v-model="input"
                       type="text"
                       :placeholder="liveState === 'connected' ? 'Talking — or type here' : 'Ask LUXE anything…'"
                       :disabled="loading"
                       class="flex-1 border border-black/15 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-gold" />
                <button type="submit"
                        :disabled="loading || !input.trim()"
                        class="w-9 h-9 rounded-full bg-gold text-white flex items-center justify-center hover:bg-gold-dark disabled:opacity-40">
                    <Send class="w-4 h-4" />
                </button>
            </form>
        </div>
    </transition>
</template>

<style scoped>
.luxe-panel-enter-active,
.luxe-panel-leave-active { transition: transform 200ms ease, opacity 200ms ease; }
.luxe-panel-enter-from,
.luxe-panel-leave-to { transform: translateY(20px); opacity: 0; }
</style>
