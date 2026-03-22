import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { INVOICE_COMPANY_LINES, INVOICE_VAT_RATE } from "@/config/invoice-brand";
import type { InvoiceLogoLoad } from "@/lib/load-invoice-logo";

export type InvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type InvoicePayload = {
  orderNumber: string;
  issuedAt: Date;
  status: string;
  currencyCode: string;
  total: number;
  billToName: string;
  billToEmail: string;
  lines: InvoiceLine[];
};

/** Brand palette (matches packages/config tailwind gold / cream) */
const GOLD = rgb(201 / 255, 168 / 255, 76 / 255);
const GOLD_DARK = rgb(184 / 255, 134 / 255, 11 / 255);
const CREAM_BG = rgb(253 / 255, 248 / 255, 243 / 255);
const TEXT = rgb(0.12, 0.12, 0.12);
const TEXT_MUTED = rgb(0.42, 0.42, 0.42);
const BORDER = rgb(0.88, 0.86, 0.82);
const TABLE_HEAD = rgb(0.96, 0.95, 0.93);
const TABLE_ALT = rgb(0.995, 0.993, 0.99);

const A4: [number, number] = [595.28, 841.89];

function currencyLabel(code: string) {
  return code.trim().toUpperCase() || "USD";
}

function safeDate(d: Date): Date {
  return Number.isFinite(d.getTime()) ? d : new Date();
}

function splitWordsToLines(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawRight(
  page: PDFPage,
  text: string,
  xRight: number,
  yBaseline: number,
  size: number,
  font: PDFFont,
  color = TEXT
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: xRight - w, y: yBaseline, size, font, color });
}

function drawFallbackLogo(
  p: PDFPage,
  logoX: number,
  logoY: number,
  logoSize: number,
  fontBold: PDFFont
) {
  p.drawRectangle({
    x: logoX,
    y: logoY,
    width: logoSize,
    height: logoSize,
    color: GOLD,
    borderColor: GOLD_DARK,
    borderWidth: 0.5,
  });
  const bl = "BL";
  const blSize = Math.min(24, logoSize * 0.33);
  const blW = fontBold.widthOfTextAtSize(bl, blSize);
  p.drawText(bl, {
    x: logoX + (logoSize - blW) / 2,
    y: logoY + logoSize / 2 - blSize / 3,
    size: blSize,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
}

async function drawHeaderBand(
  pdfDoc: PDFDocument,
  p: PDFPage,
  logo: InvoiceLogoLoad | null | undefined,
  font: PDFFont,
  fontBold: PDFFont,
  margin: number,
  width: number,
  height: number
): Promise<number> {
  const top = height - margin;
  const bandH = 112;
  const bandBottom = top - bandH;

  p.drawRectangle({
    x: margin,
    y: bandBottom,
    width: width - 2 * margin,
    height: bandH,
    color: CREAM_BG,
    borderColor: BORDER,
    borderWidth: 0.75,
  });

  const goldBarW = 4;
  p.drawRectangle({
    x: margin,
    y: bandBottom,
    width: goldBarW,
    height: bandH,
    color: GOLD,
  });

  const logoSize = 72;
  const logoX = margin + 16;
  const logoY = bandBottom + (bandH - logoSize) / 2;

  if (logo?.bytes?.length) {
    try {
      const image = logo.isJpeg
        ? await pdfDoc.embedJpg(logo.bytes)
        : await pdfDoc.embedPng(logo.bytes);
      const scale = logoSize / image.height;
      const logoDrawW = image.width * scale;
      p.drawImage(image, {
        x: logoX,
        y: logoY,
        width: logoDrawW,
        height: logoSize,
      });
    } catch {
      drawFallbackLogo(p, logoX, logoY, logoSize, fontBold);
    }
  } else {
    drawFallbackLogo(p, logoX, logoY, logoSize, fontBold);
  }

  const addrRight = width - margin - 12;
  const addrSize = 8;
  const lineH = 11;
  let addrY = bandBottom + 68;
  for (const line of INVOICE_COMPANY_LINES) {
    const lw = font.widthOfTextAtSize(line, addrSize);
    p.drawText(line, { x: addrRight - lw, y: addrY, size: addrSize, font, color: TEXT });
    addrY -= lineH;
  }

  const lineY = bandBottom - 6;
  p.drawLine({
    start: { x: margin, y: lineY },
    end: { x: width - margin, y: lineY },
    thickness: 1.25,
    color: GOLD,
  });

  return lineY;
}

function drawInvoiceMetaSection(
  p: PDFPage,
  lineY: number,
  orderNumber: string,
  dateStr: string,
  font: PDFFont,
  fontBold: PDFFont,
  margin: number,
  width: number
): number {
  const metaH = 44;
  const metaBottom = lineY - 8 - metaH;
  p.drawRectangle({
    x: margin,
    y: metaBottom,
    width: width - 2 * margin,
    height: metaH,
    color: rgb(1, 1, 1),
    borderColor: BORDER,
    borderWidth: 0.75,
  });

  const mid = margin + (width - 2 * margin) / 2;
  const ty = metaBottom + 26;
  const label1 = "Invoice number";
  const val1 = orderNumber;
  p.drawText(label1, { x: margin + 14, y: ty, size: 8, font: fontBold, color: TEXT_MUTED });
  p.drawText(val1, { x: margin + 14, y: ty - 14, size: 11, font: fontBold, color: TEXT });

  const label2 = "Invoice date";
  p.drawText(label2, { x: mid + 8, y: ty, size: 8, font: fontBold, color: TEXT_MUTED });
  p.drawText(dateStr, { x: mid + 8, y: ty - 14, size: 10, font, color: TEXT });

  return metaBottom;
}

/** pdf-lib embeds fonts — safe for Next.js bundle + standalone Docker. */
export async function buildInvoicePdfBuffer(
  payload: InvoicePayload,
  options?: { logo?: InvoiceLogoLoad | null }
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const cur = currencyLabel(payload.currencyCode);
  const issued = safeDate(payload.issuedAt);
  const dateStr = issued.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  const gross = payload.total;
  const net = Math.round((gross / (1 + INVOICE_VAT_RATE)) * 100) / 100;
  const vatAmount = Math.round((gross - net) * 100) / 100;

  const margin = 40;
  const col = {
    descLeft: margin,
    descRight: 302,
    qtyRight: 348,
    unitRight: 448,
    amtRight: 555,
  };
  const descWidth = col.descRight - col.descLeft;

  let page = pdfDoc.addPage(A4);
  let { width, height } = page.getSize();

  const logo = options?.logo;

  let lineY = await drawHeaderBand(pdfDoc, page, logo, font, fontBold, margin, width, height);
  const metaBottom = drawInvoiceMetaSection(
    page,
    lineY,
    payload.orderNumber,
    dateStr,
    font,
    fontBold,
    margin,
    width
  );

  const gap = 12;
  const half = (width - 2 * margin - gap) / 2;
  const billBoxH = 78;
  const billTop = metaBottom - gap;
  const billBottom = billTop - billBoxH;

  page.drawRectangle({
    x: margin,
    y: billBottom,
    width: half,
    height: billBoxH,
    color: rgb(1, 1, 1),
    borderColor: BORDER,
    borderWidth: 0.75,
  });

  page.drawRectangle({
    x: margin + half + gap,
    y: billBottom,
    width: half,
    height: billBoxH,
    color: rgb(1, 1, 1),
    borderColor: BORDER,
    borderWidth: 0.75,
  });

  const boxPad = 12;
  const bx = margin + boxPad;
  const billTopY = billBottom + billBoxH;
  let by = billTopY - boxPad - 10;
  page.drawText("Bill to", { x: bx, y: by, size: 8, font: fontBold, color: TEXT_MUTED });
  by -= 16;
  page.drawText(payload.billToName || "—", { x: bx, y: by, size: 11, font: fontBold, color: TEXT });
  by -= 14;
  page.drawText(payload.billToEmail || "—", { x: bx, y: by, size: 9, font, color: TEXT });

  const ox = margin + half + gap + boxPad;
  let oy = billTopY - boxPad - 10;
  page.drawText("Order details", { x: ox, y: oy, size: 8, font: fontBold, color: TEXT_MUTED });
  oy -= 16;
  page.drawText(`Status: ${payload.status}`, { x: ox, y: oy, size: 9, font, color: TEXT });
  oy -= 13;
  page.drawText(`Currency: ${cur}`, { x: ox, y: oy, size: 9, font, color: TEXT });

  const lineItemsBaseline = billBottom - 26;
  page.drawText("Line items", { x: margin, y: lineItemsBaseline, size: 10, font: fontBold, color: TEXT });
  const note = "All unit and line amounts include 15% VAT.";
  const noteW = font.widthOfTextAtSize(note, 7.5);
  page.drawText(note, {
    x: margin + (width - 2 * margin) - noteW,
    y: lineItemsBaseline - 12,
    size: 7.5,
    font,
    color: TEXT_MUTED,
  });

  const headerH = 22;
  const headerBottom = lineItemsBaseline - 6 - headerH - 10;

  page.drawRectangle({
    x: margin,
    y: headerBottom,
    width: width - 2 * margin,
    height: headerH,
    color: TABLE_HEAD,
    borderColor: BORDER,
    borderWidth: 0.75,
  });
  const ty = headerBottom + 7;
  page.drawText("Description", { x: col.descLeft + 6, y: ty, size: 8.5, font: fontBold, color: TEXT });
  drawRight(page, "Qty", col.qtyRight - 4, ty, 8.5, fontBold);
  drawRight(page, `Unit (${cur})`, col.unitRight - 4, ty, 8.5, fontBold);
  drawRight(page, `Amount (${cur})`, col.amtRight - 4, ty, 8.5, fontBold);

  let rowTop = headerBottom;
  const rowPad = 6;
  const bodySize = 9;
  const lineH = 11;
  const minY = margin + 130;

  const headerHTable = headerH;

  const drawRow = (
    p: PDFPage,
    descLines: string[],
    qty: string,
    unit: string,
    amt: string,
    rowIndex: number,
    top: number
  ): number => {
    const rowBodyH = Math.max(28, descLines.length * lineH + rowPad * 2);
    const rowBottom = top - rowBodyH;

    p.drawRectangle({
      x: margin,
      y: rowBottom,
      width: width - 2 * margin,
      height: rowBodyH,
      color: rowIndex % 2 === 0 ? rgb(1, 1, 1) : TABLE_ALT,
      borderColor: BORDER,
      borderWidth: 0.4,
    });

    const vDesc = col.descRight;
    const vQty = col.qtyRight;
    const vUnit = col.unitRight;
    p.drawLine({
      start: { x: vDesc, y: rowBottom },
      end: { x: vDesc, y: top },
      thickness: 0.35,
      color: BORDER,
    });
    p.drawLine({
      start: { x: vQty, y: rowBottom },
      end: { x: vQty, y: top },
      thickness: 0.35,
      color: BORDER,
    });
    p.drawLine({
      start: { x: vUnit, y: rowBottom },
      end: { x: vUnit, y: top },
      thickness: 0.35,
      color: BORDER,
    });

    let ly = top - rowPad - 9;
    for (const dl of descLines) {
      p.drawText(dl, { x: col.descLeft + 6, y: ly, size: bodySize, font, color: TEXT });
      ly -= lineH;
    }

    const midY = rowBottom + rowBodyH / 2 - 3;
    drawRight(p, qty, col.qtyRight - 4, midY, bodySize, font);
    drawRight(p, unit, col.unitRight - 4, midY, bodySize, font);
    drawRight(p, amt, col.amtRight - 4, midY, bodySize, fontBold);

    return rowBottom;
  };

  let rowIdx = 0;
  for (const line of payload.lines) {
    const descLines = splitWordsToLines(line.description, descWidth - 12, font, bodySize);
    const qty = String(line.quantity);
    const unit = line.unitPrice.toFixed(2);
    const amt = line.lineTotal.toFixed(2);

    const estH = Math.max(28, descLines.length * lineH + rowPad * 2);
    if (rowTop - estH < minY) {
      page = pdfDoc.addPage(A4);
      ({ width, height } = page.getSize());
      lineY = await drawHeaderBand(pdfDoc, page, logo, font, fontBold, margin, width, height);
      const contBaseline = lineY - 6 - 18;
      page.drawText("Line items (continued)", {
        x: margin,
        y: contBaseline,
        size: 10,
        font: fontBold,
        color: TEXT,
      });
      const hb = contBaseline - 6 - headerHTable;
      page.drawRectangle({
        x: margin,
        y: hb,
        width: width - 2 * margin,
        height: headerHTable,
        color: TABLE_HEAD,
        borderColor: BORDER,
        borderWidth: 0.75,
      });
      const tty = hb + 7;
      page.drawText("Description", { x: col.descLeft + 6, y: tty, size: 8.5, font: fontBold, color: TEXT });
      drawRight(page, "Qty", col.qtyRight - 4, tty, 8.5, fontBold);
      drawRight(page, `Unit (${cur})`, col.unitRight - 4, tty, 8.5, fontBold);
      drawRight(page, `Amount (${cur})`, col.amtRight - 4, tty, 8.5, fontBold);
      rowTop = hb;
    }

    rowTop = drawRow(page, descLines, qty, unit, amt, rowIdx, rowTop);
    rowIdx += 1;
  }

  let yAfterTable = rowTop - 22;

  const totalBoxW = 248;
  const totalBoxH = 108;
  const totalBoxLeft = width - margin - totalBoxW;

  if (yAfterTable - totalBoxH < margin + 40) {
    page = pdfDoc.addPage(A4);
    ({ width, height } = page.getSize());
    yAfterTable = height - margin - 40;
  }

  page.drawRectangle({
    x: totalBoxLeft,
    y: yAfterTable - totalBoxH,
    width: totalBoxW,
    height: totalBoxH,
    color: CREAM_BG,
    borderColor: GOLD,
    borderWidth: 1.25,
  });

  const tx = totalBoxLeft + 14;
  let tyb = yAfterTable - totalBoxH + 92;
  page.drawText("Subtotal (excl. VAT)", { x: tx, y: tyb, size: 9, font, color: TEXT_MUTED });
  drawRight(page, `${cur} ${net.toFixed(2)}`, totalBoxLeft + totalBoxW - 14, tyb, 9, font, TEXT);
  tyb -= 17;
  page.drawText("VAT @ 15%", { x: tx, y: tyb, size: 9, font, color: TEXT_MUTED });
  drawRight(page, `${cur} ${vatAmount.toFixed(2)}`, totalBoxLeft + totalBoxW - 14, tyb, 9, font, TEXT);
  tyb -= 22;
  page.drawLine({
    start: { x: tx, y: tyb + 6 },
    end: { x: totalBoxLeft + totalBoxW - 14, y: tyb + 6 },
    thickness: 0.5,
    color: BORDER,
  });
  tyb -= 4;
  page.drawText("Total (incl. VAT)", { x: tx, y: tyb, size: 10, font: fontBold, color: TEXT });
  drawRight(page, `${cur} ${gross.toFixed(2)}`, totalBoxLeft + totalBoxW - 14, tyb, 12, fontBold, GOLD_DARK);

  const foot = "Thank you for your purchase · BLESSLUXE";
  const fs = 8;
  const fw = font.widthOfTextAtSize(foot, fs);
  page.drawText(foot, {
    x: (width - fw) / 2,
    y: margin + 26,
    size: fs,
    font,
    color: TEXT_MUTED,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
