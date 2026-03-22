/**
 * Long-term memory surface area for the **text** shopping agent (Gemini + tools + Postgres).
 * Voice (Gemini Live) uses `voice/gemini-live.ts` and does not depend on this module.
 *
 * Prefer `loadCustomerProfileForAgent` for enriched logged-in context; stores are used directly
 * from `ShoppingAgent` for persistence and vector search.
 */
export { ConversationStore } from '../memory/conversation-store';
export { PreferenceStore } from '../memory/preference-store';
export { VectorStore } from '../memory/vector-store';
export { InteractionStore } from '../memory/interaction-store';
export { loadCustomerProfileForAgent } from './customer-intelligence';
