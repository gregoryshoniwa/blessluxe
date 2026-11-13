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
 * A gateway's own logo, for a HOSTED gateway — one checkout option that covers
 * several ways of paying, chosen on the gateway's page. Its artwork carries its
 * own background (BlessedPay's is black), so it is shown as a plate and never
 * recoloured. A gateway with no entry returns null and keeps its line icon.
 */
const GATEWAY_MARKS = {
    blessedpay: { src: '/payments/blessedpay.png', alt: 'BlessedPay', width: 846, height: 198 },
};

export function gatewayMark(gateway) {
    return GATEWAY_MARKS[gateway] || null;
}
