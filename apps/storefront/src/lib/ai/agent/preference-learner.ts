import type { AgentResponse, ExtractedPreferences } from '../types';
import { PreferenceStore } from '../memory/preference-store';

export class PreferenceLearner {
  private store = new PreferenceStore();

  async learn(customerId: string, userMessage: string, response: AgentResponse): Promise<void> {
    const extracted = this.extractFromConversation(userMessage, response.text);
    if (extracted) {
      await this.store.mergeExtracted(customerId, extracted);
    }
  }

  /**
   * Simple rule-based extraction. In production, call an LLM with a structured
   * output schema instead of regex.
   */
  private extractFromConversation(
    userMessage: string,
    _assistantResponse: string
  ): ExtractedPreferences | null {
    const text = userMessage.toLowerCase();
    const result: ExtractedPreferences = {};
    let found = false;

    // Colors
    const colorKeywords = ['red', 'blue', 'green', 'black', 'white', 'pink', 'gold', 'cream', 'blush', 'navy', 'beige', 'burgundy'];
    const mentionedColors = colorKeywords.filter((c) => text.includes(c));
    if (mentionedColors.length) { result.colors = mentionedColors; found = true; }

    // Styles
    const styleKeywords = ['casual', 'formal', 'bohemian', 'boho', 'minimalist', 'classic', 'modern', 'vintage', 'elegant', 'sporty', 'romantic'];
    const mentionedStyles = styleKeywords.filter((s) => text.includes(s));
    if (mentionedStyles.length) { result.styles = mentionedStyles; found = true; }

    // Fits
    const fitKeywords = ['loose', 'fitted', 'oversized', 'slim', 'relaxed', 'tailored'];
    const mentionedFits = fitKeywords.filter((f) => text.includes(f));
    if (mentionedFits.length) { result.fits = mentionedFits; found = true; }

    // Sizes
    const sizeMap: Record<string, string> = {};
    const sizeMatch = text.match(/size\s+(xs|s|m|l|xl|xxl|\d{1,2})/i);
    if (sizeMatch) { sizeMap.dress = sizeMatch[1].toUpperCase(); found = true; }
    if (Object.keys(sizeMap).length) result.sizes = sizeMap;

    // Budget
    const budgetMatch = text.match(/(?:under|below|max|budget)\s*\$?\s*(\d+)/i);
    if (budgetMatch) { result.budget = { max: parseInt(budgetMatch[1], 10) }; found = true; }
    const budgetMinMatch = text.match(/(?:at least|above|min)\s*\$?\s*(\d+)/i);
    if (budgetMinMatch) { result.budget = { ...result.budget, min: parseInt(budgetMinMatch[1], 10) }; found = true; }

    // Occasions
    const occasionKeywords = ['work', 'date', 'date-night', 'wedding', 'party', 'vacation', 'beach', 'office', 'brunch', 'evening'];
    const mentionedOccasions = occasionKeywords.filter((o) => text.includes(o));
    if (mentionedOccasions.length) { result.occasions = mentionedOccasions; found = true; }

    // Categories
    const categoryKeywords = ['dress', 'dresses', 'top', 'tops', 'skirt', 'skirts', 'pants', 'trousers', 'accessories', 'bags', 'jewelry'];
    const mentionedCats = categoryKeywords.filter((c) => text.includes(c));
    if (mentionedCats.length) { result.categories = mentionedCats; found = true; }

    return found ? result : null;
  }

  async trackRecommendationOutcome(
    customerId: string,
    _productId: string,
    outcome: 'viewed' | 'added_to_cart' | 'purchased' | 'ignored'
  ): Promise<void> {
    const weights: Record<string, number> = {
      viewed: 0.01,
      added_to_cart: 0.03,
      purchased: 0.05,
      ignored: -0.01,
    };
    await this.store.updateRecommendationAccuracy(customerId, weights[outcome] ?? 0);
  }
}
