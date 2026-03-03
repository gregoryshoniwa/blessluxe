import type { CustomerPreferences, ExtractedPreferences } from '../types';
import { query, queryOne } from '@/lib/db';

export class PreferenceStore {
  async get(customerId: string): Promise<CustomerPreferences | null> {
    const row = await queryOne<PreferenceRow>(
      `SELECT * FROM ai_customer_preferences WHERE customer_id = $1`,
      [customerId]
    );
    return row ? mapRow(row) : null;
  }

  async upsert(customerId: string, updates: Partial<CustomerPreferences>): Promise<CustomerPreferences> {
    const current = (await this.get(customerId)) ?? { customerId };
    const merged = { ...current, ...updates, customerId };

    await query(
      `INSERT INTO ai_customer_preferences (
         customer_id, favorite_colors, favorite_styles, preferred_fits, avoided_styles,
         top_size, bottom_size, dress_size, shoe_size,
         price_sensitivity, typical_budget_min, typical_budget_max,
         preferred_categories, favorite_brands, purchase_occasions,
         preferred_contact, notification_frequency, style_profile,
         recommendations_accuracy, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now())
       ON CONFLICT (customer_id) DO UPDATE SET
         favorite_colors = EXCLUDED.favorite_colors,
         favorite_styles = EXCLUDED.favorite_styles,
         preferred_fits = EXCLUDED.preferred_fits,
         avoided_styles = EXCLUDED.avoided_styles,
         top_size = EXCLUDED.top_size,
         bottom_size = EXCLUDED.bottom_size,
         dress_size = EXCLUDED.dress_size,
         shoe_size = EXCLUDED.shoe_size,
         price_sensitivity = EXCLUDED.price_sensitivity,
         typical_budget_min = EXCLUDED.typical_budget_min,
         typical_budget_max = EXCLUDED.typical_budget_max,
         preferred_categories = EXCLUDED.preferred_categories,
         favorite_brands = EXCLUDED.favorite_brands,
         purchase_occasions = EXCLUDED.purchase_occasions,
         preferred_contact = EXCLUDED.preferred_contact,
         notification_frequency = EXCLUDED.notification_frequency,
         style_profile = EXCLUDED.style_profile,
         recommendations_accuracy = EXCLUDED.recommendations_accuracy,
         updated_at = now()`,
      [
        merged.customerId,
        merged.favoriteColors ?? [],
        merged.favoriteStyles ?? [],
        merged.preferredFits ?? [],
        merged.avoidedStyles ?? [],
        merged.topSize ?? null,
        merged.bottomSize ?? null,
        merged.dressSize ?? null,
        merged.shoeSize ?? null,
        merged.priceSensitivity ?? null,
        merged.typicalBudgetMin ?? null,
        merged.typicalBudgetMax ?? null,
        merged.preferredCategories ?? [],
        merged.favoriteBrands ?? [],
        merged.purchaseOccasions ?? [],
        merged.preferredContact ?? null,
        merged.notificationFrequency ?? null,
        merged.styleProfile ?? null,
        merged.recommendationsAccuracy ?? 0.5,
      ]
    );

    return merged;
  }

  async mergeExtracted(customerId: string, extracted: ExtractedPreferences): Promise<CustomerPreferences> {
    const current = await this.get(customerId);
    const updates: Partial<CustomerPreferences> = {};

    if (extracted.colors?.length) {
      updates.favoriteColors = mergeArrays(current?.favoriteColors, extracted.colors);
    }
    if (extracted.styles?.length) {
      updates.favoriteStyles = mergeArrays(current?.favoriteStyles, extracted.styles);
    }
    if (extracted.fits?.length) {
      updates.preferredFits = mergeArrays(current?.preferredFits, extracted.fits);
    }
    if (extracted.avoidances?.length) {
      updates.avoidedStyles = mergeArrays(current?.avoidedStyles, extracted.avoidances);
    }
    if (extracted.categories?.length) {
      updates.preferredCategories = mergeArrays(current?.preferredCategories, extracted.categories);
    }
    if (extracted.occasions?.length) {
      updates.purchaseOccasions = mergeArrays(current?.purchaseOccasions, extracted.occasions);
    }
    if (extracted.sizes) {
      if (extracted.sizes.top) updates.topSize = extracted.sizes.top;
      if (extracted.sizes.bottom) updates.bottomSize = extracted.sizes.bottom;
      if (extracted.sizes.dress) updates.dressSize = extracted.sizes.dress;
      if (extracted.sizes.shoe) updates.shoeSize = extracted.sizes.shoe;
    }
    if (extracted.budget) {
      if (extracted.budget.min != null) updates.typicalBudgetMin = extracted.budget.min;
      if (extracted.budget.max != null) updates.typicalBudgetMax = extracted.budget.max;
    }

    return this.upsert(customerId, updates);
  }

  async updateRecommendationAccuracy(customerId: string, delta: number): Promise<void> {
    const current = await this.get(customerId);
    const accuracy = current?.recommendationsAccuracy ?? 0.5;
    const clamped = Math.max(0, Math.min(1, accuracy + delta));
    await this.upsert(customerId, { recommendationsAccuracy: clamped });
  }
}

function mergeArrays(existing?: string[], incoming?: string[]): string[] {
  return [...new Set([...(existing ?? []), ...(incoming ?? [])])];
}

interface PreferenceRow {
  customer_id: string;
  favorite_colors: string[];
  favorite_styles: string[];
  preferred_fits: string[];
  avoided_styles: string[];
  top_size: string | null;
  bottom_size: string | null;
  dress_size: string | null;
  shoe_size: string | null;
  price_sensitivity: string | null;
  typical_budget_min: string | null;
  typical_budget_max: string | null;
  preferred_categories: string[];
  favorite_brands: string[];
  purchase_occasions: string[];
  preferred_contact: string | null;
  notification_frequency: string | null;
  style_profile: string | null;
  recommendations_accuracy: string | null;
}

function mapRow(r: PreferenceRow): CustomerPreferences {
  return {
    customerId: r.customer_id,
    favoriteColors: r.favorite_colors,
    favoriteStyles: r.favorite_styles,
    preferredFits: r.preferred_fits,
    avoidedStyles: r.avoided_styles,
    topSize: r.top_size ?? undefined,
    bottomSize: r.bottom_size ?? undefined,
    dressSize: r.dress_size ?? undefined,
    shoeSize: r.shoe_size ?? undefined,
    priceSensitivity: r.price_sensitivity ?? undefined,
    typicalBudgetMin: r.typical_budget_min ? Number(r.typical_budget_min) : undefined,
    typicalBudgetMax: r.typical_budget_max ? Number(r.typical_budget_max) : undefined,
    preferredCategories: r.preferred_categories,
    favoriteBrands: r.favorite_brands,
    purchaseOccasions: r.purchase_occasions,
    preferredContact: r.preferred_contact ?? undefined,
    notificationFrequency: r.notification_frequency ?? undefined,
    styleProfile: r.style_profile ?? undefined,
    recommendationsAccuracy: r.recommendations_accuracy ? Number(r.recommendations_accuracy) : undefined,
  };
}
