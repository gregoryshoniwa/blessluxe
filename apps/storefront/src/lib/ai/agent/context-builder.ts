import type { AgentContext, CustomerProfile } from '../types';
import { LUXE_BASE_PROMPT } from '../config';

export class ContextBuilder {
  buildSystemPrompt(profile: CustomerProfile | null, context: AgentContext): string {
    let prompt = LUXE_BASE_PROMPT;

    if (profile) {
      const stats = profile.interactionStats;
      prompt += `\n\n## CUSTOMER PROFILE
Name: ${profile.firstName} ${profile.lastName}
Email: ${profile.email || '(on file)'}
Member since: ${profile.memberSince}
Loyalty tier: ${profile.loyaltyTier || 'Standard'}

## STYLE PREFERENCES (learned over time)
${profile.styleProfile || 'Still learning their preferences'}
Favorite colors: ${profile.favoriteColors?.join(', ') || 'Unknown'}
Preferred styles: ${profile.favoriteStyles?.join(', ') || 'Unknown'}
Preferred fits: ${profile.preferredFits?.join(', ') || 'Unknown'}
Avoided styles: ${profile.avoidedStyles?.join(', ') || 'None noted'}
Sizes: Top ${profile.topSize || '?'}, Bottom ${profile.bottomSize || '?'}, Dress ${profile.dressSize || '?'}, Shoe ${profile.shoeSize || '?'}
Budget range: $${profile.typicalBudgetMin ?? '?'} – $${profile.typicalBudgetMax ?? '?'}
Favorite categories: ${profile.preferredCategories?.join(', ') || 'Unknown'}
Favorite brands: ${profile.favoriteBrands?.join(', ') || 'Unknown'}

## PURCHASE & ORDERS
Total orders (record): ${profile.totalOrders ?? 0}
Last purchase: ${profile.lastPurchaseDate || 'Unknown'}
${profile.purchaseHistorySummary ? `Recent orders / items:\n${profile.purchaseHistorySummary}` : 'No recent order line items on file yet.'}

## ON-SITE BEHAVIOR (signals)
${stats ? `Views: ${stats.totalViews}, Searches: ${stats.totalSearches}, Cart adds: ${stats.totalCartAdds}, Purchases logged: ${stats.totalPurchases}` : 'No interaction stats yet.'}
${profile.recentSearches?.length ? `Recent searches: ${profile.recentSearches.join('; ')}` : ''}

## PRIOR CHAT SESSIONS (summaries when available)
${profile.priorConversationSummaries?.length ? profile.priorConversationSummaries.map((s) => `- ${s}`).join('\n') : 'No archived session summaries yet.'}

## PERSONALIZATION NOTES
- Address them by name (${profile.firstName}) when natural — if they ask what their name is, answer with **${profile.firstName}** (from their account).
- Reference past orders and searches when relevant — do not invent orders
- They prefer ${profile.favoriteStyles?.[0] || 'varied'} styles; colors: ${profile.favoriteColors?.[0] || 'neutral tones'}
- Recommend items in their size range; respect typical budget unless they ask otherwise`;
    } else if (context.isAuthenticated && context.customerId) {
      prompt += `\n\n## SIGNED-IN CUSTOMER (profile still loading)
The customer is logged in to BLESSLUXE (account id: ${context.customerId}). Rich profile rows may still be loading — still **do not** treat them as a guest.
- If they ask for their name and you do not see CUSTOMER PROFILE above yet, say you’re loading their account context and suggest they send another message, or give first name only if it appeared in recent chat history
- You may send account emails when tools succeed; if a tool says they must log in, suggest refreshing the page`;
    } else {
      prompt += `\n\n## GUEST CUSTOMER
This customer is not logged in.
- Encourage them to create an account for personalized recommendations
- Ask about their preferences naturally during conversation
- Remember preferences within this session only`;
    }

    prompt += `\n\n## CURRENT CONTEXT
Page: ${context.currentPage || 'Unknown'}
Cart items: ${context.cartItems?.length || 0}
Recently viewed: ${context.recentlyViewed?.map((p) => p.title).join(', ') || 'None'}`;

    return prompt;
  }
}
