# Payment acceptance marks

Shown on the checkout's payment options. Displaying a provider's mark to say
we accept it is ordinary nominative use; these are sized by height in CSS, are
never recoloured, and nothing here is hot-linked from a third party.

| File | Where it came from |
|---|---|
| `visa.svg` | Visa's 2021 wordmark, the single-path SVG from Wikimedia Commons (a typographic logo, public domain). |
| `mastercard.svg` | Drawn here from the symbol's geometry — two equal circles overlapping, in Mastercard's colours (`#EB001B`, `#F79E1B`, lens `#FF5F00`). |
| `ecocash.svg` | Wordmark set in the system's bold sans, in EcoCash's own blue `#075CA8` and red `#EB2528` (sampled from their mark). EcoCash publish no open asset — if they send you an official SVG, drop it in here and nothing else changes. |

Adding another (OneMoney, InnBucks, ZIPIT): put `<method>.svg` here and add the
method to `MARKS` in `resources/js/lib/payment-marks.js` — the payment step and
the waiting page both read it, so one line covers both. A method with no file
falls back to its line icon, so a missing logo is never a broken image.
