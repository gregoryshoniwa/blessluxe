import { v4 as uuid } from "uuid";
import pool from "./pool.ts";

/**
 * Best-practice starter FAQ for a luxury clothing e-commerce site, covering:
 * payments, delivery, products, returns/support, packaging, and accounts.
 * Admin can edit or remove these from /admin/faq.
 *
 * Seeded ONLY if shop_faq is empty so we don't overwrite admin edits on
 * subsequent migrations.
 */
interface FaqSeed {
  question: string;
  answer: string;
  category: string;
}

const FAQS: FaqSeed[] = [
  // ── Payments ────────────────────────────────────────────────────────────
  {
    category: "Payments",
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit and debit cards (Visa, Mastercard, American Express, Discover), plus Apple Pay and Google Pay where supported. All transactions are encrypted and processed through PCI-DSS compliant providers.",
  },
  {
    category: "Payments",
    question: "Is my payment information secure?",
    answer:
      "Yes. We never store full card numbers on our servers. Payment details are tokenised by our payment processor and protected by 3D Secure where required. Your data is encrypted in transit using TLS 1.3.",
  },
  {
    category: "Payments",
    question: "When will my card be charged?",
    answer:
      "Your card is charged at the moment you place the order. If we cannot fulfil any part of your order, you will be refunded for the affected items within 5–10 business days.",
  },
  {
    category: "Payments",
    question: "Do you offer instalment or buy-now-pay-later options?",
    answer:
      "We are working on bringing instalment options to selected regions. Sign up to our newsletter to be the first to know when they launch in your country.",
  },
  {
    category: "Payments",
    question: "Why was my payment declined?",
    answer:
      "Common reasons include: incorrect billing address, insufficient funds, 3D Secure verification failure, or your bank flagging the transaction as unusual. Contact your bank first, then reach out to us at hello@blessluxe.com if the issue persists.",
  },
  {
    category: "Payments",
    question: "Which currencies can I shop in?",
    answer:
      "Prices are shown in the currency configured for your region. We support USD, GBP, EUR, and ZAR at launch. Your final charge will appear in the selected currency.",
  },

  // ── Delivery ────────────────────────────────────────────────────────────
  {
    category: "Delivery",
    question: "How long does delivery take?",
    answer:
      "Standard delivery: 5–7 business days. Express delivery: 2–3 business days. International orders: 7–14 business days depending on destination. You will receive a tracking link by email as soon as your package ships.",
  },
  {
    category: "Delivery",
    question: "How much does shipping cost?",
    answer:
      "Shipping is calculated at checkout based on destination and weight. Orders above the free-shipping threshold for your region ship free. Express upgrades are available for a flat fee.",
  },
  {
    category: "Delivery",
    question: "Do you ship internationally?",
    answer:
      "Yes — we ship to a curated list of countries. If you don't see your country at checkout we're not currently available there, but you can sign up to our waitlist on the home page.",
  },
  {
    category: "Delivery",
    question: "How do I track my order?",
    answer:
      "Every order receives a unique tracking code (e.g. BL-XXXX-XXXX-X). Visit /track/<code> or your account's Tracking tab to see live status: order received, label printed, picked, packed, shipped, in transit, out for delivery, delivered.",
  },
  {
    category: "Delivery",
    question: "Are duties and taxes included?",
    answer:
      "For most domestic shipments, taxes are included at checkout. For international orders, import duties and local taxes are the recipient's responsibility and are collected by the carrier on delivery.",
  },
  {
    category: "Delivery",
    question: "What if I'm not home when my parcel arrives?",
    answer:
      "Our couriers will attempt redelivery, leave it with a neighbour, or hold it at a local pickup point depending on your destination. You can track the parcel and reschedule via the courier link in your shipping email.",
  },

  // ── Products & Sizing ───────────────────────────────────────────────────
  {
    category: "Products",
    question: "How do your sizes run?",
    answer:
      "Our pieces are designed to fit true to size. Each product page lists a size-and-fit note plus the model's measurements for reference. If you are between sizes we recommend sizing up for relaxed pieces and sizing down for fitted styles.",
  },
  {
    category: "Products",
    question: "What materials do you use?",
    answer:
      "We work with natural and high-quality blended fabrics — linen, cotton, silk, wool, and ethically-sourced leathers. Detailed composition is listed on every product page under 'Description'.",
  },
  {
    category: "Products",
    question: "How should I care for my BlessLuxe pieces?",
    answer:
      "Always follow the care label inside each garment. As a rule: dry clean tailored and embellished pieces, hand-wash silk in cold water, and machine-wash cottons on a gentle cycle. Store in a cool, dry place away from direct sunlight.",
  },
  {
    category: "Products",
    question: "Will out-of-stock items be restocked?",
    answer:
      "Popular pieces are restocked when fabric and atelier capacity allow. Click 'Notify me' on a sold-out variant to be the first to know when it returns.",
  },
  {
    category: "Products",
    question: "Are your products handmade?",
    answer:
      "Many of our signature pieces are hand-finished by our atelier partners. We mark these as 'Atelier-crafted' on the product page. Production runs are kept intentionally small to preserve quality and exclusivity.",
  },

  // ── Returns & Support ───────────────────────────────────────────────────
  {
    category: "Returns & Support",
    question: "What is your return policy?",
    answer:
      "You may return unworn, unwashed items in their original packaging within 14 days of receipt for a full refund or store credit. Sale items and final-sale pieces are non-returnable unless faulty.",
  },
  {
    category: "Returns & Support",
    question: "How do I return an item?",
    answer:
      "Log in to your account, open the Transactions tab, choose the order, and click 'Request return'. We will email you a prepaid label (where available) and instructions for repackaging.",
  },
  {
    category: "Returns & Support",
    question: "When will I receive my refund?",
    answer:
      "Refunds are processed within 5 business days of receiving your return. The amount appears on your statement 5–10 business days later, depending on your bank.",
  },
  {
    category: "Returns & Support",
    question: "Can I exchange for a different size or colour?",
    answer:
      "We do not offer direct exchanges. Please return the original item and place a new order for the size or colour you want — this is the fastest way to secure the new piece before it sells out.",
  },
  {
    category: "Returns & Support",
    question: "My item arrived damaged or faulty — what do I do?",
    answer:
      "We're sorry. Email hello@blessluxe.com within 48 hours of delivery with your order number and a photo of the issue. We will arrange a replacement or full refund including return shipping at no cost to you.",
  },
  {
    category: "Returns & Support",
    question: "How can I contact customer support?",
    answer:
      "Email hello@blessluxe.com — we aim to reply within 1 business day. You can also open a support ticket from your account's Tickets tab.",
  },

  // ── Packaging & Gifts ──────────────────────────────────────────────────
  {
    category: "Packaging & Gifts",
    question: "How are orders packaged?",
    answer:
      "Each order is wrapped in acid-free tissue, sealed with our signature ribbon, and placed in a recycled-content keepsake box. Outer mailers are paper-based and fully recyclable.",
  },
  {
    category: "Packaging & Gifts",
    question: "Is your packaging sustainable?",
    answer:
      "Yes. We use FSC-certified paper, soy-based inks, and water-based adhesives. Plastic-free packaging is part of our sustainability commitment.",
  },
  {
    category: "Packaging & Gifts",
    question: "Can I send a piece as a gift?",
    answer:
      "Absolutely. At checkout, tick 'This is a gift' to hide pricing on the receipt and include a handwritten note. You can also add complimentary gift wrap on eligible items.",
  },
  {
    category: "Packaging & Gifts",
    question: "Do you offer gift cards?",
    answer:
      "Digital gift cards in any amount are available from our home page and never expire. They arrive instantly via email with a personalised message.",
  },

  // ── Account & Loyalty ──────────────────────────────────────────────────
  {
    category: "Account & Loyalty",
    question: "Do I need an account to shop?",
    answer:
      "No — guest checkout is available. Creating an account is faster for future orders and gives you access to order tracking, returns, and our Bits loyalty rewards.",
  },
  {
    category: "Account & Loyalty",
    question: "What are Bits and how do I earn them?",
    answer:
      "Bits are our loyalty currency. You earn Bits with every order and by leaving approved product reviews. Bits can be redeemed at checkout for a discount on future orders.",
  },
  {
    category: "Account & Loyalty",
    question: "I forgot my password — how do I reset it?",
    answer:
      "Click 'Forgot password' on the sign-in page and enter the email on your account. You'll receive a reset link within a few minutes. The link expires after 60 minutes for your security.",
  },
];

export async function seedFaqs(): Promise<void> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM shop_faq`
  );
  if (Number(rows[0]?.count || 0) > 0) return;
  console.log(`Seeding ${FAQS.length} starter FAQs...`);
  const values: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  FAQS.forEach((f, idx) => {
    values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
    params.push(
      `faq_${uuid().replace(/-/g, "")}`,
      f.question,
      f.answer,
      f.category,
      idx,
      true
    );
  });
  await pool.query(
    `INSERT INTO shop_faq (id, question, answer, category, sort_order, is_active)
     VALUES ${values.join(", ")}
     ON CONFLICT DO NOTHING`,
    params
  );
}
