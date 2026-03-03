import type { AgentContext, CustomerProfile } from '../types';
import { LUXE_BASE_PROMPT } from '../config';

export class ContextBuilder {
  buildSystemPrompt(profile: CustomerProfile | null, context: AgentContext): string {
    let prompt = LUXE_BASE_PROMPT;

    if (profile) {
      prompt += `\n\n## CUSTOMER PROFILE
Name: ${profile.firstName} ${profile.lastName}
Email: ${profile.email}
Member since: ${profile.memberSince}
Loyalty tier: ${profile.loyaltyTier || 'Standard'}

## STYLE PREFERENCES
${profile.styleProfile || 'Still learning their preferences'}
Favorite colors: ${profile.favoriteColors?.join(', ') || 'Unknown'}
Preferred styles: ${profile.favoriteStyles?.join(', ') || 'Unknown'}
Preferred fits: ${profile.preferredFits?.join(', ') || 'Unknown'}
Avoided styles: ${profile.avoidedStyles?.join(', ') || 'None noted'}
Sizes: Top ${profile.topSize || '?'}, Bottom ${profile.bottomSize || '?'}, Dress ${profile.dressSize || '?'}, Shoe ${profile.shoeSize || '?'}
Budget range: $${profile.typicalBudgetMin ?? '?'} – $${profile.typicalBudgetMax ?? '?'}

## SHOPPING HISTORY
Total orders: ${profile.totalOrders ?? 0}
Favorite categories: ${profile.preferredCategories?.join(', ') || 'Unknown'}
Favorite brands: ${profile.favoriteBrands?.join(', ') || 'Unknown'}
Last purchase: ${profile.lastPurchaseDate || 'Unknown'}

## PERSONALIZATION NOTES
- Address them by name (${profile.firstName})
- They prefer ${profile.favoriteStyles?.[0] || 'classic'} styles
- Their favorite colors are ${profile.favoriteColors?.[0] || 'neutral tones'}
- Recommend items in their size range
- Stay within their typical budget unless they ask for splurges`;
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
