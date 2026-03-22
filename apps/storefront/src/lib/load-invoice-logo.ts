import { readFile } from "fs/promises";
import path from "path";
import { INVOICE_LOGO_FILENAMES } from "@/config/invoice-brand";

export type InvoiceLogoLoad = { bytes: Uint8Array; isJpeg: boolean };

/** First matching file under `public/` (dev + Docker standalone paths). */
export async function loadInvoiceLogoBytes(): Promise<InvoiceLogoLoad | null> {
  const dirs = [
    (name: string) => path.join(process.cwd(), "public", name),
    (name: string) => path.join(process.cwd(), "apps", "storefront", "public", name),
  ];
  for (const name of INVOICE_LOGO_FILENAMES) {
    for (const toPath of dirs) {
      try {
        const buf = await readFile(toPath(name));
        const lower = name.toLowerCase();
        const isJpeg = lower.endsWith(".jpg") || lower.endsWith(".jpeg");
        return { bytes: new Uint8Array(buf), isJpeg };
      } catch {
        /* try next */
      }
    }
  }
  return null;
}
