'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { GeminiLiveState, GeminiLiveCallbacks } from '@/lib/ai/voice/gemini-live';
import { useAgentChatStore } from '@/stores/agent-chat';
import type { ChatMessage } from '@/lib/ai/types';

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
    try {
      const r = await fetch('/api/account/me', { cache: 'no-store', credentials: 'include' });
      const data = (await r.json()) as { customer?: { id?: unknown } | null };
      const raw = data?.customer?.id;
      if (raw != null && raw !== '') customerId = String(raw);
    } catch {
      /* stay guest */
    }

    const client = new GeminiLiveClient(
      {
        apiKey,
        context: {
          sessionId,
          customerId,
          isAuthenticated: Boolean(customerId),
        },
      },
      callbacks
    );

    clientRef.current = client;
    await client.connect();
  }, [flushAssistantMessage]);

  const disconnect = useCallback(() => {
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
