'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { applyAgentUiUpdates } from '@/lib/apply-agent-ui-updates';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  RotateCcw,
  Loader2,
  ExternalLink,
  Radio,
} from 'lucide-react';
import { useAgentChatStore } from '@/stores/agent-chat';
import { useCartStore } from '@/stores/cart';
import { useGeminiLive } from '@/hooks/useGeminiLive';
import type { ChatMessage, ProductSummary } from '@/lib/ai/types';
import { cn } from '@/lib/utils';
import Image from 'next/image';

function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <a
      href={`/shop/${product.handle}`}
      className="flex gap-3 p-3 rounded-lg bg-white border border-gold/20 hover:border-gold/50 transition-colors group"
    >
      <div className="w-16 h-20 bg-cream rounded-md overflow-hidden flex-shrink-0 relative">
        {product.thumbnail ? (
          <Image src={product.thumbnail} alt={product.title} fill className="object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-cream to-blush" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-black truncate group-hover:text-gold transition-colors">
          {product.title}
        </p>
        <p className="text-xs text-black/60 line-clamp-1 mt-0.5">{product.description}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-sm font-semibold text-gold">${product.price.toFixed(2)}</span>
          {product.compareAtPrice && (
            <span className="text-xs text-black/40 line-through">${product.compareAtPrice.toFixed(2)}</span>
          )}
        </div>
        {!product.inStock && (
          <span className="text-xs text-red-500 mt-0.5 block">Out of stock</span>
        )}
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-black/20 group-hover:text-gold flex-shrink-0 mt-1 transition-colors" />
    </a>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      <div className={cn('max-w-[85%] space-y-2')}>
        <div
          className={cn(
            'px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
            isUser
              ? 'bg-gold text-white rounded-br-md'
              : 'bg-cream-dark/60 text-black rounded-bl-md'
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {message.products && message.products.length > 0 && (
          <div className="space-y-2">
            {message.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-cream-dark/60 px-4 py-3 rounded-2xl rounded-bl-md">
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-gold/60"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
          <span className="text-xs text-black/40 ml-1">LUXE is thinking...</span>
        </div>
      </div>
    </div>
  );
}

function ToolIndicator({ tools }: { tools: string[] }) {
  if (tools.length === 0) return null;

  const labels: Record<string, string> = {
    search_products: 'Searching products...',
    browse_website: 'Browsing...',
    manage_cart: 'Managing cart...',
    get_recommendations: 'Finding recommendations...',
    check_inventory: 'Checking stock...',
    view_product: 'Loading product...',
    check_order_status: 'Checking order...',
    send_email: 'Sending email...',
    set_reminder: 'Setting reminder...',
    apply_discount: 'Applying discount...',
    manage_wishlist: 'Updating wishlist...',
    create_order: 'Processing order...',
  };

  return (
    <div className="flex justify-start">
      <div className="bg-gold/10 border border-gold/20 px-3 py-2 rounded-xl text-xs text-gold flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin" />
        {labels[tools[0]] || 'Working on it...'}
      </div>
    </div>
  );
}

export default function AgentWidget() {
  const {
    messages,
    isOpen,
    isLoading,
    sessionId,
    voiceEnabled,
    suggestions,
    activeTools,
    error,
    toggle,
    setOpen,
    sendMessage,
    sendOpeningMessage,
    setVoiceEnabled,
    resetSession,
    setSessionId,
    replaceMessages,
    setError,
  } = useAgentChatStore();

  const {
    liveState,
    transcript,
    toggleLive,
    disconnect: disconnectLive,
    isConnected: isLiveConnected,
    isConnecting: isLiveConnecting,
  } = useGeminiLive();

  /** Must not use `getMergedItems()` from a selector — it returns a new array every time and triggers infinite re-renders. */
  const medusaLines = useCartStore((s) => s.medusaLines);
  const virtualLines = useCartStore((s) => s.virtualLines);
  const cartItems = useMemo(() => [...medusaLines, ...virtualLines], [medusaLines, virtualLines]);
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);

  const refreshCustomerId = useCallback(() => {
    fetch('/api/account/me', { cache: 'no-store', credentials: 'include' })
      .then((r) => r.json())
      .then((data: { customer?: { id?: unknown } | null }) => {
        const raw = data?.customer?.id;
        if (raw == null || raw === '') {
          setCustomerId(undefined);
          return;
        }
        setCustomerId(String(raw));
      })
      .catch(() => setCustomerId(undefined));
  }, []);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasLoadingRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const prevOpenRef = useRef(false);
  /** Apply cart / navigate instructions once per assistant message. */
  const appliedUiMessageIdsRef = useRef<Set<string>>(new Set());
  /** Avoid effect deps on disconnect (identity can change); always call latest. */
  const disconnectLiveRef = useRef(disconnectLive);
  disconnectLiveRef.current = disconnectLive;

  useEffect(() => {
    setMounted(true);
  }, []);

  /** End live when the panel opens — keep chat thread (memory is per customer in Postgres). */
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      disconnectLiveRef.current();
      useAgentChatStore.getState().setError(null);
      setInput('');
    }
    prevOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!customerId) return;
    const sid = `customer_${customerId}`;
    if (useAgentChatStore.getState().sessionId !== sid) {
      setSessionId(sid);
    }
  }, [customerId, setSessionId]);

  useEffect(() => {
    refreshCustomerId();
  }, [refreshCustomerId]);

  /** Re-sync after login / session cookie changes — mount alone misses client navigations without full reload. */
  useEffect(() => {
    if (isOpen) refreshCustomerId();
  }, [isOpen, refreshCustomerId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (messages.length === 0) appliedUiMessageIdsRef.current.clear();
  }, [messages.length]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || !last.uiUpdates?.length) return;
    if (appliedUiMessageIdsRef.current.has(last.id)) return;
    appliedUiMessageIdsRef.current.add(last.id);
    void applyAgentUiUpdates(last.uiUpdates);
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  /** After sending (Enter) or when a reply finishes loading, keep focus in the text field. */
  useEffect(() => {
    if (!isOpen) {
      wasLoadingRef.current = isLoading;
      return;
    }
    if (wasLoadingRef.current && !isLoading) {
      inputRef.current?.focus();
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, isOpen]);

  const sendContext = useCallback(() => {
    return {
      currentPage: typeof window !== 'undefined' ? window.location.pathname : '/',
      customerId,
      cart: cartItems,
    };
  }, [customerId, cartItems]);

  /** Load server history for signed-in users, then LUXE opens the thread (text) when not in an active voice session. */
  useEffect(() => {
    if (!isOpen) return;
    if (voiceEnabled && isLiveConnected) return;

    let cancelled = false;
    void (async () => {
      if (customerId) {
        try {
          const res = await fetch('/api/agent/history', { credentials: 'include', cache: 'no-store' });
          const data = (await res.json()) as {
            messages?: Array<ChatMessage & { createdAt?: string }>;
            sessionId?: string | null;
          };
          if (cancelled) return;
          if (data.sessionId) setSessionId(data.sessionId);
          if (data.messages?.length) {
            replaceMessages(
              data.messages.map((m) => ({
                ...m,
                createdAt: new Date(m.createdAt ?? Date.now()),
              }))
            );
          }
        } catch {
          /* ignore */
        }
      }

      if (cancelled) return;
      const st = useAgentChatStore.getState();
      if (st.messages.length > 0 || st.isLoading) return;
      await sendOpeningMessage(sendContext());
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    customerId,
    voiceEnabled,
    isLiveConnected,
    sessionId,
    replaceMessages,
    setSessionId,
    sendOpeningMessage,
    sendContext,
  ]);

  const handleReset = useCallback(() => {
    resetSession();
    void sendOpeningMessage(sendContext()).finally(() => {
      inputRef.current?.focus();
    });
  }, [resetSession, sendOpeningMessage, sendContext]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    void sendMessage(trimmed, sendContext()).finally(() => {
      inputRef.current?.focus();
    });
  }, [input, isLoading, sendMessage, sendContext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isLoading) return;
    void sendMessage(suggestion, sendContext()).finally(() => {
      inputRef.current?.focus();
    });
  };

  if (!mounted) return null;

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggle}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gold text-white rounded-full shadow-lg shadow-gold/25 flex items-center justify-center hover:bg-gold-dark transition-colors"
            aria-label="Open chat assistant"
          >
            <Sparkles className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-6 right-6 z-50 w-[380px] h-[600px] max-h-[calc(100vh-3rem)] bg-white rounded-2xl shadow-2xl shadow-black/15 flex flex-col overflow-hidden border border-gold/10 sm:w-[380px] sm:h-[600px] max-sm:inset-0 max-sm:w-full max-sm:h-full max-sm:rounded-none max-sm:bottom-0 max-sm:right-0"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gold to-gold-dark text-white flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm tracking-wider">LUXE</h3>
                  <p className="text-[10px] text-white/70 font-light">
                    {isLiveConnected ? 'Voice Session Active' : 'Personal Shopping Assistant'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                  className="p-1.5 rounded-full hover:bg-white/15 transition-colors"
                  title={voiceEnabled ? 'Disable voice' : 'Enable voice'}
                >
                  {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleReset}
                  className="p-1.5 rounded-full hover:bg-white/15 transition-colors"
                  title="New conversation"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-full hover:bg-white/15 transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 && isLoading && <TypingIndicator />}

              {messages.length === 0 && !isLoading && isLiveConnected && <TypingIndicator />}

              {messages.length === 0 && !isLoading && !isLiveConnected && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-8 h-8 text-gold" />
                  </div>
                  <h4 className="font-display text-base tracking-wider text-black mb-1">
                    Welcome to BLESSLUXE
                  </h4>
                  <p className="text-xs text-black/50 max-w-[250px] mx-auto">
                    I&apos;m LUXE, your personal shopping assistant. I can help you find the perfect outfit, track orders, and more.
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              <ToolIndicator tools={activeTools} />
              {isLoading && <TypingIndicator />}

              {/* Error display */}
              {(error || liveState === 'error') && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="max-w-[90%] bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-xs space-y-1">
                    <p className="font-medium">Connection Error</p>
                    <p>{error || 'Voice connection failed. Please try again.'}</p>
                    <button
                      onClick={() => setError(null)}
                      className="text-red-500 hover:text-red-700 underline text-[10px]"
                    >
                      Dismiss
                    </button>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && !isLoading && (
              <div className="px-4 pb-2 flex gap-2 flex-wrap">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-gold/30 text-gold hover:bg-gold/5 transition-colors whitespace-nowrap"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Live transcript */}
            {isLiveConnected && transcript && (
              <div className="px-4 pb-1">
                <div className="text-xs text-black/40 italic truncate">
                  {transcript}...
                </div>
              </div>
            )}

            {/* Input — wide text field; mic + send only */}
            <div className="px-3 py-2.5 border-t border-black/5 flex-shrink-0 bg-white">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex-1 min-w-0 flex items-center bg-[#f7f5f2] rounded-xl px-3.5 py-2.5 border border-transparent focus-within:border-gold/30 focus-within:bg-white transition-all">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isLiveConnected ? 'Speak or type...' : 'Ask LUXE anything...'}
                    className="w-full min-w-0 bg-transparent text-sm outline-none focus:outline-none focus-visible:outline-none placeholder:text-black/30"
                    style={{ outline: 'none', boxShadow: 'none' }}
                    disabled={isLoading}
                  />
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={toggleLive}
                    disabled={isLiveConnecting}
                    className={cn(
                      'p-2 rounded-xl transition-all relative',
                      isLiveConnected
                        ? 'bg-red-500 text-white shadow-sm shadow-red-200'
                        : isLiveConnecting
                          ? 'bg-gold/40 text-white'
                          : 'bg-[#f7f5f2] text-black/40 hover:text-gold hover:bg-gold/10'
                    )}
                    title={
                      isLiveConnected
                        ? 'End voice session'
                        : isLiveConnecting
                          ? 'Connecting...'
                          : 'Start live voice'
                    }
                  >
                    {isLiveConnecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isLiveConnected ? (
                      <MicOff className="w-4 h-4" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                    {isLiveConnected && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className={cn(
                      'p-2 rounded-xl transition-all',
                      input.trim() && !isLoading
                        ? 'bg-gold text-white hover:bg-gold-dark shadow-sm shadow-gold/20'
                        : 'bg-[#f7f5f2] text-black/20'
                    )}
                    title="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isLiveConnected && (
                <div className="flex items-center justify-center gap-1 mt-2">
                  <Radio className="w-3 h-3 text-red-500 animate-pulse" />
                  <span className="text-[10px] text-red-500 font-medium tracking-wider uppercase">Live</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
