/**
 * Affiliate attribution cookies (storefront).
 *
 * - `affiliate_ref`: legacy / marketing ref from `?ref=` or affiliate shop (not used alone for commission).
 * - `affiliate_commission_ref`: set only while the customer is in an affiliate-shop context; cleared when
 *   they browse the main storefront so checkout from `/shop` does not earn commission.
 */
export const AFFILIATE_REF_COOKIE = "affiliate_ref";
export const AFFILIATE_COMMISSION_COOKIE = "affiliate_commission_ref";

/** ~30 days, matches affiliate shop client cookie max-age */
export const COMMISSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * When `affiliate_commission_ref` matches the affiliate on attributed cart lines,
 * commission uses this rate (own affiliate shop). Otherwise the affiliate's DB
 * `commission_rate` applies (e.g. 10% for other referral paths).
 */
export const AFFILIATE_OWN_PAGE_COMMISSION_PERCENT = 5;

/**
 * Paths where we clear commission eligibility (main shop / discovery, not cart or checkout).
 */
export function shouldClearAffiliateCommissionCookie(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/shop" || pathname.startsWith("/shop/")) return true;
  if (pathname === "/wishlist" || pathname.startsWith("/wishlist/")) return true;
  return false;
}
