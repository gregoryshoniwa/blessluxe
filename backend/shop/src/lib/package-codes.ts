/**
 * Tracking-code generator for `shop_package` and its items.
 *
 * Format follows industry conventions (UPS-style alphanumeric with a checksum):
 *
 *   Package:   BL-XXXX-XXXX-C       (10 char body + 1 Luhn check char)
 *   Sub-code:  BL-XXXX-XXXX-C-NN    (parent + 2-digit slot index)
 *
 * Crockford's Base32 is used for the body to avoid visual collisions
 * (no 0/O, 1/I/L, U/V) — easier to read off a printed label.
 */

import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32 (ambiguous chars dropped)
const BASE = ALPHABET.length;

/** Build a Luhn-mod-N check character over the given alphabet. */
function luhnCheck(body: string): string {
  // Standard Luhn-mod-N: from rightmost, double every other char's index, sum, mod base.
  let sum = 0;
  let alt = true;
  for (let i = body.length - 1; i >= 0; i--) {
    const idx = ALPHABET.indexOf(body[i]);
    if (idx < 0) return "0";
    let n = idx;
    if (alt) {
      n *= 2;
      if (n >= BASE) n = (n % BASE) + Math.floor(n / BASE);
    }
    sum += n;
    alt = !alt;
  }
  const check = (BASE - (sum % BASE)) % BASE;
  return ALPHABET[check];
}

function randomBody(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % BASE];
  }
  return out;
}

export function generatePackageCode(prefix = "BL"): string {
  const body = randomBody(8);
  const check = luhnCheck(body);
  // BL-XXXX-XXXX-C
  return `${prefix}-${body.slice(0, 4)}-${body.slice(4)}-${check}`;
}

export function generateSubCode(packageCode: string, index: number): string {
  return `${packageCode}-${String(index).padStart(2, "0")}`;
}

/**
 * Validates a package code's checksum. Useful when a tracking code is typed
 * by hand and we want to catch transcription errors before hitting the DB.
 */
export function isValidPackageCode(code: string): boolean {
  const parts = code.toUpperCase().split("-");
  if (parts.length < 4) return false;
  // Body = parts[1] + parts[2], check = parts[3]
  const body = parts[1] + parts[2];
  if (body.length < 4) return false;
  return luhnCheck(body) === parts[3];
}
