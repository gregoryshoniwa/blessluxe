'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { GeminiLiveState, GeminiLiveCallbacks } from '@/lib/ai/voice/gemini-live';
import { useAgentChatStore } from '@/stores/agent-chat';
import type { ChatMessage } from '@/lib/ai/types';

export function useGeminiLive() {
  const [liveState, setLiveState] = useState<GeminiLiveState>('disconnected');
  const [transcript, setTranscript] = useState('');
  const [responseText, setResponseText] = useState('');
  const clientRef = useRef<import('@/lib/ai/voice/gemini-live').GeminiLiveClient | null>(null);
  const { addMessage, setListening, setSpeaking } = useAgentChatStore();

  const connect = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY;
    if (!apiKey) {
      console.error('[GeminiLive] NEXT_PUBLIC_GOOGLE_AI_API_KEY is not set');
      return;
    }

    // Dynamic import to keep the module client-only
    const { GeminiLiveClient } = await import('@/lib/ai/voice/gemini-live');

    const callbacks: GeminiLiveCallbacks = {
      onStateChange: (state) => {
        setLiveState(state);
        if (state === 'connected') setListening(true);
        if (state === 'disconnected' || state === 'error') {
          setListening(false);
          setSpeaking(false);
        }
      },
      onTranscript: (text, isFinal) => {
        setTranscript(text);
        if (isFinal && text.trim()) {
          const msg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text,
            createdAt: new Date(),
          };
          addMessage(msg);
          setTranscript('');
        }
      },
      onResponseText: (text) => {
        setResponseText((prev) => prev + text);
      },
      onAudioChunk: () => {
        setSpeaking(true);
      },
      onToolCall: (name) => {
        const { addActiveTool } = useAgentChatStore.getState();
        addActiveTool(name);
      },
      onToolResult: (name, result) => {
        const { removeActiveTool } = useAgentChatStore.getState();
        removeActiveTool(name);
      },
      onInterrupted: () => {
        setSpeaking(false);
      },
      onError: (error) => {
        console.error('[GeminiLive] Error:', error);
        const { setError } = useAgentChatStore.getState();
        setError(error.message);
      },
    };

    const client = new GeminiLiveClient(
      {
        apiKey,
        context: {
          sessionId: useAgentChatStore.getState().sessionId,
          isAuthenticated: false,
        },
      },
      callbacks
    );

    clientRef.current = client;
    await client.connect();
  }, [addMessage, setListening, setSpeaking]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }

    // Save the accumulated response as an assistant message
    if (responseText.trim()) {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: responseText.trim(),
        createdAt: new Date(),
      };
      addMessage(msg);
      setResponseText('');
    }
  }, [addMessage, responseText]);

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

  // Clean up on unmount
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
