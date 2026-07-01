/**
 * Google Gemini Live API client (real-time voice).
 *
 * WebSocket → bidirectional audio:
 *   Mic (PCM 16kHz) → ws → Gemini → ws → Speaker (PCM 24kHz)
 *
 * Tool calls bubble up via `onToolCall`, get executed by Laravel
 * (POST /api/store/agent/execute-tool), and the result is fed back to
 * Gemini through `toolResponse`. Mirrors the Next.js GeminiLiveClient
 * 1:1 so the chat behaviour matches.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/live
 */

const WS_BASE =
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

function float32ToPcm16(float32) {
    const buf = new ArrayBuffer(float32.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buf;
}

function abToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function base64ToAb(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

export class GeminiLiveClient {
    constructor(config, callbacks) {
        this.config = config; // { apiKey, model, systemInstruction, tools, executeTool }
        this.callbacks = callbacks || {};
        this.ws = null;
        this.state = 'disconnected';
        this.mediaStream = null;
        this.audioContext = null;
        this.scriptProcessor = null;
        this.micMuteGain = null;
        this.playbackContext = null;
        this.nextPlaybackTime = 0;
        this.activeSources = [];
        this.pendingUserTranscript = '';
    }

    async connect() {
        if (this.state === 'connected' || this.state === 'connecting') return;
        this.setState('connecting');
        try {
            const model = this.config.model || 'gemini-2.5-flash-native-audio-preview-12-2025';
            const url = `${WS_BASE}?key=${this.config.apiKey}`;
            this.ws = new WebSocket(url);
            this.ws.onmessage = (e) => this.handleMessage(e.data);
            this.ws.onclose = (e) => {
                if (e.code !== 1000 && e.code !== 1005) {
                    this.callbacks.onError?.(new Error(`Live closed: ${e.reason || 'code ' + e.code}`));
                }
                this.setState('disconnected');
                this.stopMicrophone();
            };
            await new Promise((resolve, reject) => {
                this.ws.onopen = () => {
                    this.sendSetup(model);
                    this.setState('connected');
                    this.startMicrophone();
                    resolve();
                };
                this.ws.onerror = () => {
                    this.callbacks.onError?.(new Error('WebSocket error'));
                    this.setState('error');
                    reject(new Error('WebSocket error'));
                };
            });
        } catch (err) {
            this.callbacks.onError?.(err);
            this.setState('error');
        }
    }

    disconnect() {
        this.pendingUserTranscript = '';
        this.stopMicrophone();
        this.stopPlayback();
        if (this.ws) { this.ws.close(); this.ws = null; }
        this.setState('disconnected');
    }

    sendText(text) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        this.ws.send(JSON.stringify({
            clientContent: {
                turns: [{ role: 'user', parts: [{ text }] }],
                turnComplete: true,
            },
        }));
        return true;
    }

    sendSetup(model) {
        if (!this.ws) return;
        const tools = this.config.tools || [];
        const payload = {
            setup: {
                model: `models/${model}`,
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.config.voiceName || 'Aoede' } } },
                },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction: { parts: [{ text: this.config.systemInstruction || '' }] },
                tools: tools.length ? [{ functionDeclarations: tools }] : [],
            },
        };
        this.ws.send(JSON.stringify(payload));
    }

    async handleMessage(raw) {
        let data = raw instanceof Blob ? await raw.text() : raw;
        let msg;
        try { msg = JSON.parse(data); } catch { return; }

        if (msg.setupComplete || msg.setup_complete) {
            this.callbacks.onSetupComplete?.();
        }
        const sc = msg.serverContent;
        if (sc?.interrupted) {
            this.stopScheduledPlayback();
            this.callbacks.onInterrupted?.();
            return;
        }
        if (sc?.modelTurn) {
            for (const part of sc.modelTurn.parts || []) {
                if (part.inlineData?.data) {
                    const buf = base64ToAb(part.inlineData.data);
                    this.callbacks.onAudioChunk?.(buf);
                    this.schedulePcmChunk(buf);
                }
            }
        }
        if (sc?.inputTranscription?.text) {
            this.pendingUserTranscript = sc.inputTranscription.text;
            this.callbacks.onTranscript?.(sc.inputTranscription.text, false);
        }
        if (sc?.outputTranscription?.text) {
            this.callbacks.onResponseText?.(sc.outputTranscription.text);
        }
        if (sc?.turnComplete) {
            const u = this.pendingUserTranscript.trim();
            if (u) { this.callbacks.onTranscript?.(u, true); this.pendingUserTranscript = ''; }
            this.callbacks.onTurnComplete?.();
        }

        if (msg.toolCall) {
            const calls = msg.toolCall.functionCalls || [];
            const responses = [];
            for (const fc of calls) {
                this.callbacks.onToolCall?.(fc.name, fc.args);
                let result;
                try {
                    result = await this.config.executeTool(fc.name, fc.args);
                } catch (e) {
                    result = { success: false, error: e?.message || 'Tool failed' };
                }
                this.callbacks.onToolResult?.(fc.name, result);
                responses.push({ id: fc.id, name: fc.name, response: { output: result } });
            }
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
            }
        }
    }

    async startMicrophone() {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
            });
            this.audioContext = new AudioContext({ sampleRate: 16000 });
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.scriptProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);
            this.scriptProcessor.onaudioprocess = (e) => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
                const pcm = float32ToPcm16(e.inputBuffer.getChannelData(0));
                const b64 = abToBase64(pcm);
                this.ws.send(JSON.stringify({
                    realtimeInput: { mediaChunks: [{ data: b64, mimeType: 'audio/pcm;rate=16000' }] },
                }));
            };
            source.connect(this.scriptProcessor);
            this.micMuteGain = this.audioContext.createGain();
            this.micMuteGain.gain.value = 0;
            this.scriptProcessor.connect(this.micMuteGain);
            this.micMuteGain.connect(this.audioContext.destination);
        } catch (err) {
            this.callbacks.onError?.(err);
        }
    }

    stopMicrophone() {
        this.scriptProcessor?.disconnect();
        this.scriptProcessor = null;
        this.micMuteGain?.disconnect();
        this.micMuteGain = null;
        this.mediaStream?.getTracks().forEach((t) => t.stop());
        this.mediaStream = null;
        this.audioContext?.close().catch(() => {});
        this.audioContext = null;
    }

    schedulePcmChunk(chunk) {
        if (!this.playbackContext) this.playbackContext = new AudioContext({ sampleRate: 24000 });
        const ctx = this.playbackContext;
        ctx.resume().catch(() => {});
        const int16 = new Int16Array(chunk);
        if (int16.length === 0) return;
        const f32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
        const buf = ctx.createBuffer(1, f32.length, 24000);
        buf.copyToChannel(f32, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        const now = ctx.currentTime;
        const start = Math.max(now + 0.01, this.nextPlaybackTime);
        this.nextPlaybackTime = start + buf.duration;
        this.activeSources.push(src);
        src.onended = () => {
            const idx = this.activeSources.indexOf(src);
            if (idx >= 0) this.activeSources.splice(idx, 1);
        };
        try { src.start(start); } catch { /* ignore */ }
    }

    stopScheduledPlayback() {
        for (const s of [...this.activeSources]) {
            try { s.stop(0); } catch { /* already stopped */ }
        }
        this.activeSources = [];
        this.nextPlaybackTime = this.playbackContext?.currentTime || 0;
    }

    stopPlayback() {
        this.stopScheduledPlayback();
        this.playbackContext?.close().catch(() => {});
        this.playbackContext = null;
        this.nextPlaybackTime = 0;
    }

    setState(s) { this.state = s; this.callbacks.onStateChange?.(s); }
}
