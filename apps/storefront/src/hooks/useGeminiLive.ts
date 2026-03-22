'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { GeminiLiveState, GeminiLiveCallbacks } from '@/lib/ai/voice/gemini-live';
import { LUXE_GEMINI_LIVE_CORE, LUXE_VOICE_OPENING_USER_TURN } from '@/lib/ai/config';
import { useAgentChatStore } from '@/stores/agent-chat';
import type { ChatMessage } from '@/lib/ai/types';

function buildGeminiLiveSystemInstruction(customer: Record<string, unknown> | null | undefined): string {
  const core = LUXE_GEMINI_LIVE_CORE;
  if (!customer?.id) {
    return (
      `## GUEST\n` +
        `Do not claim to know their name, email, or account unless they said it in this chat.\n\n` +
        core
    );
  }

  const firstName =
    (typeof customer.first_name === 'string' && customer.first_name.trim()) ||
    (typeof customer.full_name === 'string' && String(customer.full_name).split(/\s+/)[0]) ||
    'there';
  const lastName =
    (typeof customer.last_name === 'string' && customer.last_name.trim()) ||
    (typeof customer.full_name === 'string' && String(customer.full_name).split(/\s+/).slice(1).join(' ')) ||
    '';
  const email = typeof customer.email === 'string' ? customer.email : '';

  return (
    `## CUSTOMER PROFILE (BLESSLUXE account — same rules as text chat)\n` +
      `Name: ${firstName}${lastName ? ` ${lastName}` : ''}\n` +
      `Email: ${email}\n` +
      `You may greet by first name and answer "what's my name?" using the first name above. ` +
      `Do not refuse as "privacy" for data listed here — it is their session account context.\n\n` +
      core
  );
}

function getClientApiKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY;
  return typeof k === 'string' && k.trim().length > 0 ? k.trim() : undefined;
}

export function useGeminiLive() {
  const [liveState, setLiveState] = useState<GeminiLiveState>('disconnected');
  const [transcript, setTranscript] = useState('');
  const [responseText, setResponseText] = useState('');
  const clientRef = useRef<import('@/lib/ai/voice/gemini-live').GeminiLiveClient | null>(null);
  /** Accumulated assistant reply (ref avoids stale disconnect / turn-complete closures). */
  const responseTextRef = useRef('');
  /** One proactive voice greeting per Live session (delayed kickoff may retry while text opening finishes). */
  const voiceOpeningSentRef = useRef(false);

  /** Use getState() so this hook does not subscribe to the whole chat store (avoids callback churn + effect loops). */
  const flushAssistantMessage = useCallback(() => {
    const text = responseTextRef.current.trim();
    if (!text) return;
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: text,
      createdAt: new Date(),
    };
    useAgentChatStore.getState().addMessage(msg);
    responseTextRef.current = '';
    setResponseText('');
  }, []);

  const connect = useCallback(async () => {
    const apiKey = getClientApiKey();
    if (!apiKey) {
      console.error(
        '[GeminiLive] No API key: set NEXT_PUBLIC_GOOGLE_AI_API_KEY or GOOGLE_AI_API_KEY (next.config maps it for the client bundle).'
      );
      useAgentChatStore.getState().setError('Voice needs NEXT_PUBLIC_GOOGLE_AI_API_KEY (or GOOGLE_AI_API_KEY in Docker with next.config env).');
      return;
    }

    const { GeminiLiveClient } = await import('@/lib/ai/voice/gemini-live');

    const callbacks: GeminiLiveCallbacks = {
      onStateChange: (state) => {
        setLiveState(state);
        const chat = useAgentChatStore.getState();
        if (state === 'connected') chat.setListening(true);
        if (state === 'disconnected' || state === 'error') {
          chat.setListening(false);
          chat.setSpeaking(false);
        }
      },
      onTranscript: (text, isFinal) => {
        if (!isFinal) {
          setTranscript(text);
          return;
        }
        setTranscript('');
        if (text.trim()) {
          const msg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text.trim(),
            createdAt: new Date(),
          };
          useAgentChatStore.getState().addMessage(msg);
        }
      },
      onResponseText: (text) => {
        responseTextRef.current += text;
        setResponseText(responseTextRef.current);
      },
      onTurnComplete: () => {
        flushAssistantMessage();
        useAgentChatStore.getState().setSpeaking(false);
      },
      onAudioChunk: () => {
        useAgentChatStore.getState().setSpeaking(true);
      },
      onToolCall: (name) => {
        const { addActiveTool } = useAgentChatStore.getState();
        addActiveTool(name);
      },
      onToolResult: (name) => {
        const { removeActiveTool } = useAgentChatStore.getState();
        removeActiveTool(name);
      },
      onInterrupted: () => {
        useAgentChatStore.getState().setSpeaking(false);
      },
      onError: (error) => {
        console.error('[GeminiLive] Error:', error);
        const { setError } = useAgentChatStore.getState();
        setError(error.message);
      },
    };

    const { sessionId } = useAgentChatStore.getState();

    let customerId: string | undefined;
    let customerRow: Record<string, unknown> | null = null;
    try {
      const r = await fetch('/api/account/me', { cache: 'no-store', credentials: 'include' });
      const data = (await r.json()) as { customer?: Record<string, unknown> | null };
      const c = data?.customer;
      const raw = c?.id;
      if (raw != null && raw !== '') {
        customerId = String(raw);
        customerRow = c ?? null;
      }
    } catch {
      /* stay guest */
    }

    const systemInstruction = buildGeminiLiveSystemInstruction(customerRow);

    const client = new GeminiLiveClient(
      {
        apiKey,
        systemInstruction,
        context: {
          sessionId,
          customerId,
          isAuthenticated: Boolean(customerId),
        },
      },
      callbacks
    );

    clientRef.current = client;
    voiceOpeningSentRef.current = false;
    await client.connect();

    const tryKickoffVoiceOpening = () => {
      if (voiceOpeningSentRef.current) return;
      const live = clientRef.current;
      if (!live) return;
      const s = useAgentChatStore.getState();
      if (s.messages.length > 0 || s.isLoading) return;
      live.sendText(LUXE_VOICE_OPENING_USER_TURN);
      voiceOpeningSentRef.current = true;
    };

    // Setup + mic need a beat before the first client turn; retry while text opening is still loading.
    setTimeout(tryKickoffVoiceOpening, 350);
    setTimeout(tryKickoffVoiceOpening, 1100);
    setTimeout(tryKickoffVoiceOpening, 2200);
  }, [flushAssistantMessage]);

  const disconnect = useCallback(() => {
    voiceOpeningSentRef.current = false;
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    flushAssistantMessage();
  }, [flushAssistantMessage]);

  const sendText = useCallback((text: string) => {
    clientRef.current?.sendText(text);
  }, []);

  const toggleLive = useCallback(async () => {
    if (liveState === 'connected') {
      disconnect();
    } else {
      await connect();
    }
  }, [liveState, connect, disconnect]);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  return {
    liveState,
    transcript,
    responseText,
    connect,
    disconnect,
    sendText,
    toggleLive,
    isConnected: liveState === 'connected',
    isConnecting: liveState === 'connecting',
  };
}
