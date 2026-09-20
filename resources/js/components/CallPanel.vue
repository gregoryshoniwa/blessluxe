<script>
import { subscribe, whisper, realtimeEnabled, onRealtimeStatus } from '../lib/realtime.js';
import { createCallEngine } from '../lib/webrtc.js';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, X } from 'lucide-vue-next';

/**
 * Voice and video calling for a presence channel.
 *
 * Self-contained on purpose: it subscribes to the channel itself rather than
 * borrowing the parent's subscription, so a page gains calling by rendering it
 * and loses nothing if calling is unavailable. `realtime.js` refcounts the
 * channel, so sharing it with the message thread is safe.
 *
 * Renders nothing at all when there is no socket — a call button that cannot
 * work is worse than no call button.
 */
export default {
    name: 'CallPanel',
    components: { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, X },
    props: {
        channel:  { type: String, required: true },
        iceUrl:   { type: String, required: true },
        peerName: { type: String, default: 'them' },
    },
    data() {
        return {
            engine: null,
            unsubscribe: null,
            call: { status: 'idle', error: null, muted: false, cameraOff: false, withVideo: false, hasRelay: true, startedAt: null },
            elapsed: '00:00',
            timer: null,
            supported: realtimeEnabled() && Boolean(navigator.mediaDevices?.getUserMedia),
            connected: false,
            offStatus: null,
        };
    },
    computed: {
        /**
         * Calls are signalled over the socket, so they exist only while it does.
         * In polling-only mode, or when a provider has refused the connection,
         * the buttons disappear rather than ringing into nothing.
         */
        available() { return this.supported && (this.connected || this.overlay); },
        ringing()   { return this.call.status === 'ringing-in'; },
        outgoing()  { return this.call.status === 'ringing-out'; },
        inCall()    { return ['connecting', 'active'].includes(this.call.status); },
        overlay()   { return this.ringing || this.outgoing || this.inCall; },
        statusText() {
            return {
                'ringing-out': `Calling ${this.peerName}…`,
                'ringing-in':  `${this.peerName} is calling`,
                'connecting':  'Connecting…',
                'active':      this.elapsed,
            }[this.call.status] || '';
        },
    },
    mounted() {
        if (!this.supported) return;
        this.offStatus = onRealtimeStatus((s) => { this.connected = s === 'connected'; });

        this.engine = createCallEngine({
            channel: this.channel,
            whisper,
            iceUrl: this.iceUrl,
            onChange: (s) => {
                this.call = s;
                this.attachStreams(s);
                this.tickTimer(s);
                if (s.error) this.$emit('call-error', s.error);
            },
        });

        this.unsubscribe = subscribe(this.channel, this.engine.handlers);
        // A call in progress must survive a stray tab close attempt gracefully:
        // tell the other side rather than leaving them staring at a dead frame.
        window.addEventListener('beforeunload', this.endOnUnload);
    },
    beforeUnmount() {
        window.removeEventListener('beforeunload', this.endOnUnload);
        this.offStatus?.();
        clearInterval(this.timer);
        this.engine?.hangUp();
        this.engine?.destroy();
        this.unsubscribe?.();
    },
    methods: {
        endOnUnload() { this.engine?.hangUp(); },

        /**
         * MediaStreams can't go through `src`, so they are assigned after the
         * elements exist. Guarded with $nextTick because the video elements are
         * inside a v-if that flips in the same update as the stream arriving.
         */
        attachStreams(s) {
            this.$nextTick(() => {
                if (this.$refs.remote && this.$refs.remote.srcObject !== s.remoteStream) {
                    this.$refs.remote.srcObject = s.remoteStream || null;
                }
                if (this.$refs.local && this.$refs.local.srcObject !== s.localStream) {
                    this.$refs.local.srcObject = s.localStream || null;
                }
            });
        },

        tickTimer(s) {
            clearInterval(this.timer);
            if (s.status !== 'active' || !s.startedAt) { this.elapsed = '00:00'; return; }
            const render = () => {
                const secs = Math.floor((Date.now() - s.startedAt) / 1000);
                const m = String(Math.floor(secs / 60)).padStart(2, '0');
                const ss = String(secs % 60).padStart(2, '0');
                this.elapsed = `${m}:${ss}`;
            };
            render();
            this.timer = setInterval(render, 1000);
        },

        startVoice() { this.engine?.start(false, this.peerName); },
        startVideo() { this.engine?.start(true, this.peerName); },
    },
};
</script>

<template>
    <div v-if="available">
        <!-- Call buttons, shown inline by the parent -->
        <div v-if="!overlay" class="flex items-center gap-1">
            <button
                @click="startVoice"
                title="Voice call"
                class="w-10 h-10 sm:w-8 sm:h-8 inline-flex items-center justify-center rounded-full text-gold-dark hover:bg-gold/10 transition-colors"
            >
                <Phone class="w-4 h-4" />
            </button>
            <button
                @click="startVideo"
                title="Video call"
                class="w-10 h-10 sm:w-8 sm:h-8 inline-flex items-center justify-center rounded-full text-gold-dark hover:bg-gold/10 transition-colors"
            >
                <Video class="w-4 h-4" />
            </button>
        </div>

        <!-- Call surface -->
        <teleport to="body">
            <div v-if="overlay" class="fixed inset-0 z-[120] bg-black/95 flex flex-col">
                <!-- Remote video fills; for a voice call it stays empty and the
                     name carries the screen instead. -->
                <div class="flex-1 relative overflow-hidden">
                    <video
                        v-show="call.withVideo && call.status === 'active'"
                        ref="remote" autoplay playsinline
                        class="absolute inset-0 w-full h-full object-cover"
                    ></video>

                    <div
                        v-if="!(call.withVideo && call.status === 'active')"
                        class="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
                    >
                        <div class="w-24 h-24 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center mb-5">
                            <span class="font-display text-3xl text-gold">{{ (peerName || '?').charAt(0).toUpperCase() }}</span>
                        </div>
                        <p class="font-display text-xl text-white tracking-wide">{{ peerName }}</p>
                        <p class="text-[11px] tracking-[0.25em] uppercase text-white/50 mt-2">{{ statusText }}</p>
                        <p v-if="!call.hasRelay && outgoing" class="text-[10px] text-white/35 mt-4 max-w-xs leading-relaxed">
                            No relay server is configured, so this may not connect on some networks.
                        </p>
                    </div>

                    <!-- Self-view -->
                    <video
                        v-show="call.withVideo"
                        ref="local" autoplay playsinline muted
                        class="absolute bottom-4 right-4 w-28 sm:w-36 aspect-[3/4] object-cover rounded-lg border border-white/20 shadow-lg bg-black"
                    ></video>

                    <p v-if="call.status === 'active'" class="absolute top-4 left-1/2 -translate-x-1/2 text-[11px] tracking-[0.2em] text-white/70 tabular-nums">
                        {{ elapsed }}
                    </p>
                </div>

                <!-- Controls -->
                <div class="pb-10 pt-6 flex items-center justify-center gap-4">
                    <template v-if="ringing">
                        <button
                            @click="engine.decline()"
                            class="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white inline-flex items-center justify-center transition-colors"
                            title="Decline"
                        >
                            <PhoneOff class="w-5 h-5" />
                        </button>
                        <button
                            @click="engine.answer()"
                            class="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center justify-center transition-colors"
                            title="Answer"
                        >
                            <Phone class="w-5 h-5" />
                        </button>
                    </template>

                    <template v-else>
                        <button
                            @click="engine.toggleMute()"
                            :title="call.muted ? 'Unmute' : 'Mute'"
                            class="w-12 h-12 rounded-full inline-flex items-center justify-center transition-colors"
                            :class="call.muted ? 'bg-white text-black' : 'bg-white/15 text-white hover:bg-white/25'"
                        >
                            <component :is="call.muted ? 'MicOff' : 'Mic'" class="w-5 h-5" />
                        </button>

                        <button
                            v-if="call.withVideo"
                            @click="engine.toggleCamera()"
                            :title="call.cameraOff ? 'Turn camera on' : 'Turn camera off'"
                            class="w-12 h-12 rounded-full inline-flex items-center justify-center transition-colors"
                            :class="call.cameraOff ? 'bg-white text-black' : 'bg-white/15 text-white hover:bg-white/25'"
                        >
                            <component :is="call.cameraOff ? 'VideoOff' : 'Video'" class="w-5 h-5" />
                        </button>

                        <button
                            @click="engine.hangUp()"
                            class="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white inline-flex items-center justify-center transition-colors"
                            title="Hang up"
                        >
                            <PhoneOff class="w-5 h-5" />
                        </button>
                    </template>
                </div>
            </div>
        </teleport>
    </div>
</template>
