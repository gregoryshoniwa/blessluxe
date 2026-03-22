import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage, ProductSummary, AgentResponse, UIUpdate } from '@/lib/ai/types';
import type { CartItem } from '@/stores/cart';

interface AgentChatState {
  messages: ChatMessage[];
  isOpen: boolean;
  isLoading: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  voiceEnabled: boolean;
  sessionId: string;
  activeTools: string[];
  suggestions: string[];
  error: string | null;

  // Actions
  setOpen: (open: boolean) => void;
  toggle: () => void;
  addMessage: (message: ChatMessage) => void;
  setLoading: (loading: boolean) => void;
  setListening: (listening: boolean) => void;
  setSpeaking: (speaking: boolean) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setSuggestions: (suggestions: string[]) => void;
  addActiveTool: (toolName: string) => void;
  removeActiveTool: (toolName: string) => void;
  clearActiveTools: () => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  resetSession: () => void;
  setSessionId: (sessionId: string) => void;
  replaceMessages: (messages: ChatMessage[]) => void;

  // Async actions (call the API)
  sendMessage: (
    text: string,
    context?: {
      currentPage?: string;
      customerId?: string;
      cart?: CartItem[];
      recentlyViewed?: ProductSummary[];
    }
  ) => Promise<void>;
  /** LUXE speaks first — no user bubble (opening turn). */
  sendOpeningMessage: (context?: {
    currentPage?: string;
    customerId?: string;
    cart?: CartItem[];
    recentlyViewed?: ProductSummary[];
  }) => Promise<void>;
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export const useAgentChatStore = create<AgentChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      isOpen: false,
      isLoading: false,
      isListening: false,
      isSpeaking: false,
      voiceEnabled: false,
      sessionId: generateSessionId(),
      activeTools: [],
      suggestions: ['Show me new arrivals', "What's trending?", 'Help me find an outfit'],
      error: null,

      setOpen: (open) => set({ isOpen: open }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),

      addMessage: (message) =>
        set((s) => ({ messages: [...s.messages, message] })),

      setLoading: (loading) => set({ isLoading: loading }),
      setListening: (listening) => set({ isListening: listening }),
      setSpeaking: (speaking) => set({ isSpeaking: speaking }),
      setVoiceEnabled: (enabled) => set({ voiceEnabled: enabled }),
      setSuggestions: (suggestions) => set({ suggestions }),
      addActiveTool: (toolName) =>
        set((s) => ({ activeTools: [...s.activeTools, toolName] })),
      removeActiveTool: (toolName) =>
        set((s) => ({ activeTools: s.activeTools.filter((t) => t !== toolName) })),
      clearActiveTools: () => set({ activeTools: [] }),
      setError: (error) => set({ error }),
      clearMessages: () =>
        set({ messages: [], suggestions: ['Show me new arrivals', "What's trending?", 'Help me find an outfit'] }),

      setSessionId: (sessionId) => set({ sessionId }),

      replaceMessages: (messages) =>
        set({
          messages: messages.map((m) => ({
            ...m,
            createdAt:
              m.createdAt instanceof Date ? m.createdAt : new Date(String(m.createdAt)),
          })),
        }),

      resetSession: () => {
        const s = get();
        if (s.sessionId.startsWith('customer_')) {
          void fetch('/api/agent/history', { method: 'DELETE', credentials: 'include' }).catch(() => {});
          set({
            messages: [],
            sessionId: s.sessionId,
            activeTools: [],
            suggestions: ['Show me new arrivals', "What's trending?", 'Help me find an outfit'],
            error: null,
            isLoading: false,
            isListening: false,
            isSpeaking: false,
          });
        } else {
          set({
            messages: [],
            sessionId: generateSessionId(),
            activeTools: [],
            suggestions: ['Show me new arrivals', "What's trending?", 'Help me find an outfit'],
            error: null,
            isLoading: false,
            isListening: false,
            isSpeaking: false,
          });
        }
      },

      sendMessage: async (text, context) => {
        const state = get();

        const userMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: text,
          createdAt: new Date(),
        };

        set((s) => ({
          messages: [...s.messages, userMessage],
          isLoading: true,
          error: null,
          suggestions: [],
        }));

        try {
          const recentMessages = state.messages.slice(-40).map((m) => ({
            role: m.role === 'assistant' ? 'model' : m.role,
            content: m.content,
          }));

          const res = await fetch('/api/agent', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              sessionId: state.sessionId,
              messages: recentMessages,
              currentPage: context?.currentPage || (typeof window !== 'undefined' ? window.location.pathname : '/'),
              customerId: context?.customerId,
              cart: context?.cart ?? [],
              recentlyViewed: context?.recentlyViewed ?? [],
            }),
          });

          if (!res.ok) throw new Error(`Request failed: ${res.status}`);

          const data: AgentResponse = await res.json();

          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: data.text,
            products: data.products,
            suggestions: data.suggestions,
            uiUpdates: data.uiUpdates,
            createdAt: new Date(),
          };

          set((s) => ({
            messages: [...s.messages, assistantMessage],
            isLoading: false,
            suggestions: data.suggestions || [],
          }));
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Something went wrong';

          const errorMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: "I'm sorry, I encountered an issue. Please try again. ✨",
            createdAt: new Date(),
          };

          set((s) => ({
            messages: [...s.messages, errorMessage],
            isLoading: false,
            error: errorMsg,
          }));
        }
      },

      sendOpeningMessage: async (context) => {
        const state = get();
        if (state.messages.length > 0 || state.isLoading) return;

        set({ isLoading: true, error: null });

        try {
          const res = await fetch('/api/agent', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              opening: true,
              sessionId: state.sessionId,
              messages: [],
              currentPage: context?.currentPage || (typeof window !== 'undefined' ? window.location.pathname : '/'),
              customerId: context?.customerId,
              cart: context?.cart ?? [],
              recentlyViewed: context?.recentlyViewed ?? [],
            }),
          });

          if (!res.ok) throw new Error(`Request failed: ${res.status}`);

          const data: AgentResponse = await res.json();

          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: data.text,
            products: data.products,
            suggestions: data.suggestions,
            uiUpdates: data.uiUpdates,
            createdAt: new Date(),
          };

          set((s) => ({
            messages: [...s.messages, assistantMessage],
            isLoading: false,
            suggestions: data.suggestions || [],
          }));
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Something went wrong';

          const fallback: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content:
              "Hello! ✨ I'm LUXE, your personal shopping assistant at BLESSLUXE. How can I help you today?",
            createdAt: new Date(),
          };

          set((s) => ({
            messages: [...s.messages, fallback],
            isLoading: false,
            error: errorMsg,
            suggestions: ['Show me new arrivals', "What's trending?", 'Help me find an outfit'],
          }));
        }
      },
    }),
    {
      name: 'blessluxe-agent-chat-v3',
      partialize: (state) => ({
        voiceEnabled: state.voiceEnabled,
        sessionId: state.sessionId,
        messages: state.messages.slice(-80),
      }),
    }
  )
);
