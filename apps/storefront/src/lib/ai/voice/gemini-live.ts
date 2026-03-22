/**
 * Google Gemini Live API integration for real-time speech-to-speech.
 *
 * Uses a WebSocket connection to stream audio bidirectionally:
 *   Mic (PCM 16kHz) ──→ WebSocket ──→ Gemini ──→ WebSocket ──→ Speaker (PCM 24kHz)
 *
 * The model can also invoke BLESSLUXE tools (search, cart, etc.) via function
 * calling, so voice commands are handled identically to text commands.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/live
 */

import { executeVoiceTool, getVoiceToolDefinitions } from '../tools/voice-tools';
import type { AgentContext, ToolDefinition } from '../types';

// ─── Types ───────────────────────────────────────────────────────
export type GeminiLiveState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface GeminiLiveCallbacks {
  onStateChange?: (state: GeminiLiveState) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onResponseText?: (text: string) => void;
  /** Model finished a spoken/text turn — flush accumulated assistant text to chat. */
  onTurnComplete?: () => void;
  onAudioChunk?: (pcm24k: ArrayBuffer) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: unknown) => void;
  onError?: (error: Error) => void;
  onInterrupted?: () => void;
}

interface GeminiLiveConfig {
  apiKey: string;
  model?: string;
  systemInstruction?: string;
  voiceName?: string;
  context?: AgentContext;
}

// ─── Helpers ─────────────────────────────────────────────────────
function toolDefsToGeminiFormat(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

function float32ToPcm16(float32: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ─── Gemini Live Client ──────────────────────────────────────────
export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private micMuteGain: GainNode | null = null;
  private playbackContext: AudioContext | null = null;
  /** Schedule PCM chunks back-to-back on the audio clock (avoids gaps/crackling from await-per-chunk). */
  private nextPlaybackTime = 0;
  private activePlaybackSources: AudioBufferSourceNode[] = [];
  /** Latest cumulative user speech from input transcription; flushed to chat on turnComplete. */
  private pendingUserTranscript = '';
  private state: GeminiLiveState = 'disconnected';
  private callbacks: GeminiLiveCallbacks;
  private config: GeminiLiveConfig;
  private agentContext: AgentContext;

  constructor(config: GeminiLiveConfig, callbacks: GeminiLiveCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.agentContext = config.context ?? {
      sessionId: `live_${Date.now()}`,
      isAuthenticated: false,
    };
  }

  // ── Connect ─────────────────────────────────────────────────
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') return;

    this.setState('connecting');

    try {
      const model = this.config.model || 'gemini-2.5-flash-native-audio-preview-12-2025';
      const wsUrl =
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent` +
        `?key=${this.config.apiKey}`;

      console.log('[GeminiLive] Connecting to:', wsUrl.replace(/key=.*/, 'key=***'));
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[GeminiLive] WebSocket connected, sending setup...');
        this.sendSetup(model);
        this.setState('connected');
        this.startMicrophone();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (event) => {
        console.error('[GeminiLive] WebSocket error:', event);
        this.callbacks.onError?.(new Error('WebSocket connection error'));
        this.setState('error');
      };

      this.ws.onclose = (event) => {
        console.log('[GeminiLive] WebSocket closed:', event.code, event.reason);
        if (event.code !== 1000 && event.code !== 1005) {
          this.callbacks.onError?.(
            new Error(`Connection closed: ${event.reason || `code ${event.code}`}`)
          );
        }
        this.setState('disconnected');
        this.stopMicrophone();
      };
    } catch (err) {
      this.callbacks.onError?.(err instanceof Error ? err : new Error('Failed to connect'));
      this.setState('error');
    }
  }

  // ── Disconnect ──────────────────────────────────────────────
  disconnect(): void {
    this.pendingUserTranscript = '';
    this.stopMicrophone();
    this.stopPlayback();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  // ── Send text message ───────────────────────────────────────
  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true,
        },
      })
    );
  }

  // ── Setup message ───────────────────────────────────────────
  private sendSetup(model: string): void {
    if (!this.ws) return;
    console.log('[GeminiLive] Sending setup for model:', model);

    const tools = getVoiceToolDefinitions();

    const setupMessage = {
      setup: {
        model: `models/${model}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.config.voiceName || 'Aoede',
              },
            },
          },
        },
        /** Setup-level flags (see BidiGenerateContentSetup) — enables input/output speech transcriptions for the chat UI. */
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: {
          parts: [
            {
              text:
                this.config.systemInstruction ||
                `You are LUXE, the AI shopping assistant for BLESSLUXE, a premium women's fashion boutique. ` +
                  `You are warm, sophisticated, and genuinely helpful. You speak elegantly but naturally. ` +
                  `You can search products, manage the cart, check orders, and give personalized recommendations. ` +
                  `You cannot send email via voice — if the customer asks, tell them to use the text chat. ` +
                  `Keep responses concise for voice — 1-3 sentences unless the customer asks for detail. ` +
                  `Important: In voice mode, never emit internal planning, reasoning, stage directions, or meta-commentary ` +
                  `in any text field — only speak aloud the words you want the customer to hear, as natural dialogue.`,
            },
          ],
        },
        tools: [{ functionDeclarations: toolDefsToGeminiFormat(tools) }],
      },
    };

    this.ws.send(JSON.stringify(setupMessage));
  }

  // ── Handle incoming messages ────────────────────────────────
  private async handleMessage(raw: string | Blob): Promise<void> {
    let data: string;
    if (raw instanceof Blob) {
      data = await raw.text();
    } else {
      data = raw;
    }

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data);
    } catch {
      console.warn('[GeminiLive] Non-JSON message:', data.slice(0, 200));
      return;
    }

    // Log message type (but not audio data which is huge)
    const msgKeys = Object.keys(msg);
    if (!msgKeys.includes('serverContent') || !(msg.serverContent as Record<string, unknown>)?.modelTurn) {
      console.log('[GeminiLive] Message:', msgKeys.join(', '), JSON.stringify(msg).slice(0, 300));
    }

    const serverContent = msg.serverContent as Record<string, unknown> | undefined;
    const toolCall = msg.toolCall as Record<string, unknown> | undefined;

    // Handle interruption
    if (serverContent?.interrupted) {
      this.stopScheduledPlayback();
      this.callbacks.onInterrupted?.();
      return;
    }

    // Handle model audio turn — do NOT forward part.text to the chat; it often contains chain-of-thought /
    // "thought" lines. Chat copy comes from outputTranscription (what was spoken) only.
    if (serverContent?.modelTurn) {
      const modelTurn = serverContent.modelTurn as { parts?: Array<Record<string, unknown>> };
      for (const part of modelTurn.parts ?? []) {
        if (part.inlineData) {
          const inlineData = part.inlineData as { data?: string; mimeType?: string };
          if (inlineData.data) {
            const audioBuffer = base64ToArrayBuffer(inlineData.data);
            this.callbacks.onAudioChunk?.(audioBuffer);
            this.schedulePcmChunk(audioBuffer);
          }
        }
      }
    }

    // Input speech → live preview + buffer; committed to chat on turnComplete
    if (serverContent?.inputTranscription) {
      const transcript = serverContent.inputTranscription as { text?: string };
      if (transcript.text) {
        this.pendingUserTranscript = transcript.text;
        this.callbacks.onTranscript?.(transcript.text, false);
      }
    }

    // What the model actually said (for chat transcript) — not modelTurn text parts
    if (serverContent?.outputTranscription) {
      const transcript = serverContent.outputTranscription as { text?: string };
      if (transcript.text) {
        this.callbacks.onResponseText?.(transcript.text);
      }
    }

    // After modelTurn / transcriptions — same message often includes turnComplete last
    if (serverContent?.turnComplete) {
      const u = this.pendingUserTranscript.trim();
      if (u) {
        this.callbacks.onTranscript?.(u, true);
        this.pendingUserTranscript = '';
      }
      this.callbacks.onTurnComplete?.();
    }

    // Handle tool/function calls
    if (toolCall) {
      const functionCalls = (toolCall.functionCalls ?? []) as Array<{
        id?: string;
        name: string;
        args: Record<string, unknown>;
      }>;

      const functionResponses: Array<{ id?: string; name: string; response: unknown }> = [];

      for (const fc of functionCalls) {
        this.callbacks.onToolCall?.(fc.name, fc.args);

        const result = await executeVoiceTool(fc.name, fc.args, this.agentContext);
        this.callbacks.onToolResult?.(fc.name, result);

        functionResponses.push({
          id: fc.id,
          name: fc.name,
          response: { output: result },
        });
      }

      // Send tool results back
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            toolResponse: { functionResponses },
          })
        );
      }
    }
  }

  // ── Microphone ──────────────────────────────────────────────
  private async startMicrophone(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // ScriptProcessorNode is deprecated but widely supported;
      // AudioWorklet would be the modern replacement.
      this.scriptProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = float32ToPcm16(inputData);
        const base64 = arrayBufferToBase64(pcm16);

        this.ws.send(
          JSON.stringify({
            realtimeInput: {
              mediaChunks: [
                {
                  data: base64,
                  mimeType: 'audio/pcm;rate=16000',
                },
              ],
            },
          })
        );
      };

      source.connect(this.scriptProcessor);
      // Keep the graph “live” without routing mic to speakers (avoids echo / feedback).
      this.micMuteGain = this.audioContext.createGain();
      this.micMuteGain.gain.value = 0;
      this.scriptProcessor.connect(this.micMuteGain);
      this.micMuteGain.connect(this.audioContext.destination);
    } catch (err) {
      this.callbacks.onError?.(
        err instanceof Error ? err : new Error('Microphone access denied')
      );
    }
  }

  private stopMicrophone(): void {
    this.scriptProcessor?.disconnect();
    this.scriptProcessor = null;
    this.micMuteGain?.disconnect();
    this.micMuteGain = null;
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
    this.audioContext?.close();
    this.audioContext = null;
  }

  // ── Playback (scheduled, gapless) ───────────────────────────
  private schedulePcmChunk(chunk: ArrayBuffer): void {
    if (!this.playbackContext) {
      this.playbackContext = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = this.playbackContext;
    void ctx.resume();

    const int16 = new Int16Array(chunk);
    if (int16.length === 0) return;

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const start = Math.max(now + 0.01, this.nextPlaybackTime);
    this.nextPlaybackTime = start + audioBuffer.duration;

    this.activePlaybackSources.push(source);
    source.onended = () => {
      const idx = this.activePlaybackSources.indexOf(source);
      if (idx >= 0) this.activePlaybackSources.splice(idx, 1);
    };

    try {
      source.start(start);
    } catch (e) {
      console.warn('[GeminiLive] AudioBufferSource.start failed:', e);
    }
  }

  private stopScheduledPlayback(): void {
    for (const s of [...this.activePlaybackSources]) {
      try {
        s.stop(0);
      } catch {
        /* already stopped */
      }
    }
    this.activePlaybackSources = [];
    if (this.playbackContext) {
      this.nextPlaybackTime = this.playbackContext.currentTime;
    } else {
      this.nextPlaybackTime = 0;
    }
  }

  private stopPlayback(): void {
    this.stopScheduledPlayback();
    this.playbackContext?.close().catch(() => {});
    this.playbackContext = null;
    this.nextPlaybackTime = 0;
  }

  // ── State ───────────────────────────────────────────────────
  private setState(state: GeminiLiveState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  getState(): GeminiLiveState {
    return this.state;
  }
}
