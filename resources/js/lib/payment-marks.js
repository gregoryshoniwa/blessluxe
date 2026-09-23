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
