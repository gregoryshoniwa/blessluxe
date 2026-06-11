/**
 * Paynow web-integration helpers.
 *
 * The flow:
 *   1. POST /interface/initiatetransaction  → { browserurl, pollurl, hash }
 *   2. Redirect customer to browserurl. They pay.
 *   3. Paynow POSTs status to our resulturl (IPN). We verify hash + persist.
 *   4. Paynow redirects customer back to our returnurl. We finalise the order.
 *   5. Optionally POST {} to pollurl to re-fetch the current status.
 *
 * Hash spec (https://developers.paynow.co.zw/docs/paynow/generating_hash/):
 *   - Concatenate the URL-decoded VALUES of every field except `hash`
 *     in the order they appear in the request.
 *   - Append the integration key.
 *   - SHA512, uppercase hex.
 */

import crypto from "node:crypto";

const PAYNOW_INITIATE_URL = "https://www.paynow.co.zw/interface/initiatetransaction";

export interface PaynowConfig {
  integrationId: string;
  integrationKey: string;
  /** Public-internet URL Paynow POSTs to with status updates. */
  resultUrl: string;
  /** Storefront URL Paynow redirects the customer back to. */
  returnUrl: string;
}

export interface InitiateInput {
  reference: string;
  amount: number;          // major units (USD), to two decimal places
  additionalInfo?: string;
  authEmail?: string;
  authPhone?: string;
  authName?: string;
}

export interface InitiateOk {
  ok: true;
  browserUrl: string;
  pollUrl: string;
  raw: string;
}

export interface InitiateErr {
  ok: false;
  error: string;
  raw: string;
}

/** Build the SHA512 hash over an ordered map of fields. */
export function computeHash(
  fields: Array<[string, string]>,
  integrationKey: string
): string {
  let concatenated = "";
  for (const [key, value] of fields) {
    if (key.toLowerCase() === "hash") continue;
    concatenated += value;
  }
  concatenated += integrationKey;
  return crypto
    .createHash("sha512")
    .update(concatenated, "utf8")
    .digest("hex")
    .toUpperCase();
}

/**
 * Verify the hash on a Paynow inbound message. `params` is the parsed
 * URL-decoded payload. The fields are concatenated in the order they appear.
 */
export function verifyHash(
  params: Record<string, string>,
  integrationKey: string
): boolean {
  const provided = params.hash || params.Hash || "";
  if (!provided) return false;
  // Paynow's docs show concat in message order. We preserve insertion order
  // of Object.entries (V8 keeps it for string keys).
  const ordered: Array<[string, string]> = Object.entries(params).map(
    ([k, v]) => [k, v]
  );
  const expected = computeHash(ordered, integrationKey);
  return expected === provided.toUpperCase();
}

/** Parse a Paynow response body — URL-encoded form, status terminator first. */
export function parseFormBody(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq);
    const value = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " "));
    out[key.toLowerCase()] = value;
  }
  return out;
}

/** POST the initiate-transaction request and parse the response. */
export async function initiateTransaction(
  config: PaynowConfig,
  input: InitiateInput
): Promise<InitiateOk | InitiateErr> {
  // Field order is significant for hashing.
  const fields: Array<[string, string]> = [
    ["id", config.integrationId],
    ["reference", input.reference],
    ["amount", input.amount.toFixed(2)],
    ["additionalinfo", input.additionalInfo || ""],
    ["returnurl", config.returnUrl],
    ["resulturl", config.resultUrl],
  ];
  if (input.authEmail) fields.push(["authemail", input.authEmail]);
  if (input.authPhone) fields.push(["authphone", input.authPhone]);
  if (input.authName) fields.push(["authname", input.authName]);
  fields.push(["status", "Message"]);
  fields.push(["hash", computeHash(fields, config.integrationKey)]);

  const body = fields
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const res = await fetch(PAYNOW_INITIATE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  const parsed = parseFormBody(text);

  if ((parsed.status || "").toLowerCase() === "error") {
    return { ok: false, error: parsed.error || "Paynow returned an error", raw: text };
  }
  if (!verifyHash(parsed, config.integrationKey)) {
    return { ok: false, error: "Paynow response hash failed to verify", raw: text };
  }
  if (!parsed.browserurl || !parsed.pollurl) {
    return { ok: false, error: "Paynow response missing browserurl/pollurl", raw: text };
  }
  return {
    ok: true,
    browserUrl: parsed.browserurl,
    pollUrl: parsed.pollurl,
    raw: text,
  };
}

/** POST an empty body to a poll URL and parse the status response. */
export async function pollStatus(
  pollUrl: string,
  integrationKey: string
): Promise<{ ok: true; data: Record<string, string>; raw: string } | { ok: false; error: string; raw: string }> {
  const res = await fetch(pollUrl, { method: "POST" });
  const text = await res.text();
  const parsed = parseFormBody(text);
  if ((parsed.status || "").toLowerCase() === "error") {
    return { ok: false, error: parsed.error || "Poll failed", raw: text };
  }
  if (!verifyHash(parsed, integrationKey)) {
    return { ok: false, error: "Poll response hash failed to verify", raw: text };
  }
  return { ok: true, data: parsed, raw: text };
}

/**
 * Classify a raw Paynow status into our payment_session statuses.
 * Reference: https://developers.paynow.co.zw/docs/paynow/status_update/
 */
export function classifyStatus(
  raw: string
): "paid" | "pending" | "failed" | "cancelled" {
  const s = (raw || "").trim().toLowerCase();
  if (s === "paid" || s === "awaiting delivery" || s === "delivered") {
    return "paid";
  }
  if (s === "cancelled" || s === "refunded" || s === "disputed") {
    return "cancelled";
  }
  if (s === "created" || s === "sent") return "pending";
  return "failed";
}

/** Read configuration from environment variables. Throws if any are missing. */
export function loadConfig(): PaynowConfig {
  const id = (process.env.PAYNOW_INTEGRATION_ID || "").trim();
  const key = (process.env.PAYNOW_INTEGRATION_KEY || "").trim();
  const resultUrl = (process.env.PAYNOW_RESULT_URL || "").trim();
  const returnUrl = (process.env.PAYNOW_RETURN_URL || "").trim();
  if (!id || !key) throw new Error("PAYNOW_INTEGRATION_ID and PAYNOW_INTEGRATION_KEY are required");
  if (!resultUrl || !returnUrl) {
    throw new Error("PAYNOW_RESULT_URL and PAYNOW_RETURN_URL must be set to publicly reachable URLs");
  }
  return {
    integrationId: id,
    integrationKey: key,
    resultUrl,
    returnUrl,
  };
}
