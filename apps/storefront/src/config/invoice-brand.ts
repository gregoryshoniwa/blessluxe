/**
 * Company details shown on PDF invoices (edit to match your business).
 * Right-aligned in the header; PO Box and contact lines as needed.
 */
export const INVOICE_COMPANY_LINES = [
  "BLESSLUXE (Pvt) Ltd",
  "P.O. Box [number], Harare",
  "Zimbabwe",
  "Tel: +263 77 000 0000",
  "WhatsApp: +263 77 000 0000",
  "info@blessluxe.com",
] as const;

/** VAT is included in all displayed unit and line amounts (tax-inclusive pricing). */
export const INVOICE_VAT_RATE = 0.15;

/**
 * Tried in order under `apps/storefront/public/`.
 * The storefront already ships `logo.png`; optional overrides: `blessluxe-logo.png` / `.jpg`.
 */
export const INVOICE_LOGO_FILENAMES = [
  "logo.png",
  "blessluxe-logo.png",
  "blessluxe-logo.jpg",
] as const;
