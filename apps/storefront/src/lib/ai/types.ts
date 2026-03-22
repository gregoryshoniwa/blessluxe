import type { CartItem } from '@/stores/cart';

// ─── Agent Context ───────────────────────────────────────────────
export interface AgentContext {
  customerId?: string;
  sessionId: string;
  isAuthenticated: boolean;
  currentPage?: string;
  cartItems?: CartItem[];
  recentlyViewed?: ProductSummary[];
}

// ─── Agent I/O ───────────────────────────────────────────────────
export interface AgentInput {
  text?: string;
  audio?: ArrayBuffer;
  context: AgentContext;
  /** Client-side turns when the DB has no messages yet for this session. */
  clientMessageHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** First turn when the chat opens — LUXE speaks first (no user bubble). */
  opening?: boolean;
}

export interface AgentResponse {
  text: string;
  audio?: string; // base64
  actions?: AgentAction[];
  suggestions?: string[];
  products?: ProductSummary[];
  uiUpdates?: UIUpdate[];
}

export interface AgentAction {
  type: 'navigate' | 'add_to_cart' | 'open_product' | 'apply_discount' | 'scroll';
  payload: Record<string, unknown>;
}

export interface UIUpdate {
  type:
    | 'navigate'
    | 'scroll'
    | 'click'
    | 'show_products'
    | 'back'
    | 'forward'
    | 'add_to_cart'
    | 'remove_from_cart'
    | 'update_cart_quantity'
    | 'clear_cart';
  payload: Record<string, unknown>;
}

// ─── Messages ────────────────────────────────────────────────────
export type MessageRole = 'user' | 'assistant' | 'tool' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolCallResult[];
  products?: ProductSummary[];
  suggestions?: string[];
  uiUpdates?: UIUpdate[];
  createdAt: Date;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  toolCallId: string;
  name: string;
  result: ToolResult;
}

// ─── Tools ───────────────────────────────────────────────────────
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };
}

export interface ToolParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameterSchema;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  uiAction?: UIUpdate;
}

// ─── Products ────────────────────────────────────────────────────
export interface ProductSummary {
  id: string;
  handle: string;
  title: string;
  description?: string;
  thumbnail?: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  category?: string;
  tags?: string[];
  variants?: VariantSummary[];
  inStock: boolean;
}

export interface VariantSummary {
  id: string;
  title: string;
  sku?: string;
  price: number;
  inventoryQuantity: number;
  options: Record<string, string>;
}

// ─── Customer Profile ────────────────────────────────────────────
export interface CustomerProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  memberSince: string;
  loyaltyTier?: string;

  // Style
  styleProfile?: string;
  favoriteColors?: string[];
  favoriteStyles?: string[];
  preferredFits?: string[];
  avoidedStyles?: string[];

  // Sizes
  topSize?: string;
  bottomSize?: string;
  dressSize?: string;
  shoeSize?: string;

  // Budget
  priceSensitivity?: string;
  typicalBudgetMin?: number;
  typicalBudgetMax?: number;

  // Behaviour
  preferredCategories?: string[];
  favoriteBrands?: string[];
  purchaseOccasions?: string[];
  totalOrders?: number;
  lastPurchaseDate?: string;
  /** Formatted recent orders + line items for the system prompt */
  purchaseHistorySummary?: string;
  /** Distinct product titles from recent orders */
  recentProductTitles?: string[];
  /** Recent on-site searches (from ai_customer_interactions) */
  recentSearches?: string[];
  interactionStats?: {
    totalViews: number;
    totalSearches: number;
    totalCartAdds: number;
    totalPurchases: number;
  };
  /** Summaries from past ai_conversations rows, when present */
  priorConversationSummaries?: string[];

  // Communication
  preferredContact?: string;
  notificationFrequency?: string;
  recommendationsAccuracy?: number;
}

// ─── Memory ──────────────────────────────────────────────────────
export interface Memory {
  content: string;
  relevance: number;
  type: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  customerId?: string;
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  summary?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  topics?: string[];
  productsDiscussed?: string[];
}

export interface CustomerInteraction {
  id: string;
  customerId: string;
  interactionType: string;
  productId?: string;
  category?: string;
  searchQuery?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ─── Preferences ─────────────────────────────────────────────────
export interface ExtractedPreferences {
  colors?: string[];
  styles?: string[];
  fits?: string[];
  avoidances?: string[];
  sizes?: { top?: string; bottom?: string; dress?: string; shoe?: string };
  budget?: { min?: number; max?: number };
  occasions?: string[];
  categories?: string[];
}

export interface CustomerPreferences {
  customerId: string;
  favoriteColors?: string[];
  favoriteStyles?: string[];
  preferredFits?: string[];
  avoidedStyles?: string[];
  topSize?: string;
  bottomSize?: string;
  dressSize?: string;
  shoeSize?: string;
  priceSensitivity?: string;
  typicalBudgetMin?: number;
  typicalBudgetMax?: number;
  preferredCategories?: string[];
  favoriteBrands?: string[];
  purchaseOccasions?: string[];
  preferredContact?: string;
  notificationFrequency?: string;
  styleProfile?: string;
  recommendationsAccuracy?: number;
}

// ─── Events / Subscriptions ──────────────────────────────────────
export type EventType =
  | 'price_drop'
  | 'back_in_stock'
  | 'sale_start'
  | 'new_arrival'
  | 'restock_reminder'
  | 'event_reminder'
  | 'wishlist_sale'
  | 'cart_reminder';

export type NotificationChannel = 'push' | 'email' | 'sms';

export interface EventSubscription {
  id: string;
  customerId: string;
  eventType: EventType;
  targetId?: string;
  targetType?: 'product' | 'category' | 'brand' | 'style';
  conditions?: Record<string, unknown>;
  channel: NotificationChannel;
  active: boolean;
  triggeredCount: number;
  lastTriggeredAt?: string;
}

export interface Reminder {
  id: string;
  customerId: string;
  message: string;
  context?: Record<string, unknown>;
  scheduledFor: string;
  channel: NotificationChannel;
  status: 'pending' | 'sent' | 'cancelled';
}

// ─── Streaming ───────────────────────────────────────────────────
export type StreamEventType = 'token' | 'tool_start' | 'tool_result' | 'audio' | 'complete' | 'error';

export interface StreamEvent {
  type: StreamEventType;
  data: unknown;
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onToolStart?: (tool: { name: string; arguments: Record<string, unknown> }) => void;
  onToolResult?: (result: ToolCallResult) => void;
  onAudioChunk?: (chunk: string) => void;
  onComplete?: (response: AgentResponse) => void;
  onError?: (error: Error) => void;
}
