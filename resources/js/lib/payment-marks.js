/**
 * Acceptance marks, by the way of paying they stand for. Used on the payment
 * step and again on the waiting page, so a shopper sees the same mark from
 * choosing EcoCash to approving it.
 *
 * A method with no entry returns [], and every caller falls back to a line
 * icon or to nothing — a missing file is never a broken image. Files and
 * provenance: public/payments/README.md
 */
const MARKS = {
    ecocash: [{ src: '/payments/ecocash.svg', alt: 'EcoCash' }],
    card:    [{ src: '/payments/visa.svg', alt: 'Visa' }, { src: '/payments/mastercard.svg', alt: 'Mastercard' }],
};

export function marksFor(method) {
    return MARKS[method] || [];
}

/**
 * What a HOSTED gateway's checkout option wears — one option that covers
 * several ways of paying, chosen on the gateway's page. `logos` are shown
 * together on a black plate (they are gold artwork made for a dark ground, and
 * are never recoloured); `processedBy` is the line under the panel.
 *
 * BlessedPay shows the bank's marks for now (owner's choice, Nov 2026): the
 * shopper knows TN CyberTech Bank and CyberPay, and the EcoCash prompt and card
 * form are the bank's. BlessedPay's own logo is kept at /payments/blessedpay.png
 * for when that changes — swap `logos` and `processedBy` here and nothing else.
 *
 * A gateway with no entry returns null and keeps its line icon.
 */
const GATEWAY_MARKS = {
    blessedpay: {
        logos: [
            { src: '/payments/tncybertech.png', alt: 'TN CyberTech Bank', width: 720, height: 259 },
            { src: '/payments/cyberpay.png', alt: 'CyberPay', width: 466, height: 80 },
        ],
        processedBy: 'CyberPay and TN CyberTech Bank',
    },
};

export function gatewayMark(gateway) {
    return GATEWAY_MARKS[gateway] || null;
}
