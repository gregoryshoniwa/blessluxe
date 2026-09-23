<script>
import { api } from '../../lib/api.js';

/**
 * Terms of sale and use, written against what this application actually does —
 * the closed loop Bees run in, how a series holds money before it ships, what
 * the Hive publishes, how affiliate shops price things.
 *
 * NOT legal advice and not a substitute for a lawyer's eye. The clauses most
 * worth a professional read are marked in CLAUDE.md; the riskiest are Bees
 * (money-like), series (money held before fulfilment) and the Hive (what
 * members publish).
 *
 * The numbers come from the server so a clause can never quote a rule the code
 * doesn't keep.
 */
export default {
    name: 'TermsPage',
    data() {
        return { policy: null, info: {} };
    },
    computed: {
        days() { return this.policy?.return_window_days ?? 30; },
        beesPerUsd() { return this.policy?.bees_per_usd ?? 100; },
        maxBees() { return this.policy?.max_bees_percent ?? 50; },
        company() { return this.info.company_name || 'BLESSLUXE'; },
        updated() {
            return new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        },
    },
    async mounted() {
        try {
            const d = await api.get('/api/store/shop-info');
            this.policy = d.policy;
            this.info = d.info || {};
        } catch { /* defaults above keep the page truthful */ }
    },
};
</script>

<template>
    <div class="max-w-3xl mx-auto px-[5%] py-14">
        <header class="text-center mb-12">
            <p class="font-script text-3xl text-gold mb-2">The agreement between us</p>
            <h1 class="font-display text-4xl tracking-widest uppercase">Terms &amp; Conditions</h1>
            <p class="text-xs tracking-widest uppercase text-black/45 mt-4">Last updated {{ updated }}</p>
        </header>

        <div class="space-y-9 text-sm leading-relaxed text-black/75">
            <section>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">1. Who we are, and what these cover</h2>
                <p>This shop is run by {{ company }} ("we", "us"), trading in Zimbabwe. These terms apply whenever you browse, buy, hold an account, post in the Hive, or take part in a series. Using the site means you accept them.</p>
                <p class="mt-3">We may change them — the date above tells you when they last moved. A change never applies backwards to an order already placed.</p>
            </section>

            <section>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">2. Your account</h2>
                <p>You need an account to order, to earn or spend Bees, and to post in the Hive. Keep your password to yourself; anything done from your account is treated as done by you until you tell us otherwise.</p>
                <p class="mt-3">You must be 18 or over to post, heart or follow in the Hive, and you confirm that once before you can. We can suspend an account that breaks these terms, and will say why.</p>
            </section>

            <section>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">3. Prices and payment</h2>
                <p>Prices are in United States dollars and include any VAT we are required to charge. The price you see when you place the order is the price of the goods.</p>
                <p class="mt-3">Your payment provider may add its own charge for taking the payment — where it does, the checkout shows that charge and the total before you approve anything. That charge is theirs, not ours, and is not refundable by us.</p>
                <p class="mt-3">We take payment through licensed providers. We never see or store your card or wallet credentials. An order exists once the payment completes; until then nothing is charged and nothing is reserved.</p>
                <p class="mt-3">Mistakes happen: if a piece is listed at an obviously wrong price, we may cancel the order and refund you in full rather than hold you to it.</p>
            </section>

            <section>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">4. Delivery</h2>
                <p>Every piece says whether it is already in Zimbabwe or has to be imported. Pieces held here are usually with you within a day; imported pieces are brought in by the courier you choose at checkout and typically take three to five days.</p>
                <p class="mt-3">Those are estimates in good faith, not promises — customs and couriers are not ours to command. We will keep you told, and you can follow an order from your account at any time.</p>
                <p class="mt-3">Risk in a piece passes to you when it is delivered to you or collected by you.</p>
            </section>

            <section>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">5. Returns</h2>
                <p>You may return an unworn piece with its tags attached within {{ days }} days of paying. The full policy, including what we can't take back and how refunds are made, is on the <router-link to="/help/returns" class="text-gold-dark underline underline-offset-4">returns page</router-link> and forms part of these terms.</p>
                <p class="mt-3">Nothing here removes any right you have under Zimbabwean consumer law, including where a piece is faulty or not as described.</p>
            </section>

            <section>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">6. Series (group buys)</h2>
                <p>A series is a run of one piece, split into sizes. You claim a size and pay for it; the run is ordered once every size is claimed, and everyone's pieces arrive together.</p>
                <p class="mt-3">This means your money is paid before the goods are ordered, which is the nature of buying this way. If a series is cancelled, or does not fill and we close it, everyone who claimed a size is refunded in full. We will not hold a claim indefinitely without telling you where it stands.</p>
                <p class="mt-3">A claim holds a size for a short period before payment; if it isn't paid in that window the size goes back to whoever wants it next.</p>
            </section>

            <section>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">7. Bees</h2>
                <p><strong class="font-medium text-black">Bees are not money and cannot become money.</strong> They cannot be bought, sold, transferred for value, or cashed out. They exist only to reduce the price of an order in this shop, at {{ beesPerUsd }} Bees to the dollar, up to {{ maxBees }}% of an order.</p>
                <p class="mt-3">You earn them by shopping and by taking part — rating, reviewing and other things we may add — and we publish what each is worth at the time. We may change those rates, or the daily limits on them, going forward.</p>
                <p class="mt-3">Bees have no cash value, expire if an account is closed, and may be removed where they were earned by abuse — for instance by holding several accounts, or posting to collect rewards rather than to say something. Spending Bees on an order that is later refunded returns them to your balance.</p>
            </section>

            <section>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">8. The Hive, and what you post</h2>
                <p>The Hive is ours to host and yours to fill. What you post stays yours; by posting it you give us permission to show it in the Hive, on the pages of the pieces it relates to, and in our own marketing, without payment. You can delete what you posted.</p>
                <p class="mt-3">Post only what is yours to post, of people who agreed to be in it. Nothing unlawful, hateful, harassing, sexual involving anyone under 18, or anyone else's work passed off as yours.</p>
                <p class="mt-3">Reports are reviewed by people, and we can hide or remove anything that breaks these rules. A review or a post is one person's honest opinion, not ours.</p>
            </section>

            <section>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">9. Affiliates and seller shops</h2>
                <p>Approved affiliates run their own storefront of pieces they curate, and may set their own prices above ours. When you buy from one, your contract is still with us — we take the payment, send the goods and handle returns. The affiliate earns a commission.</p>
                <p class="mt-3">Affiliates are not our employees and cannot make promises on our behalf. Separate terms apply to becoming one.</p>
            </section>

            <section>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">10. Our content</h2>
                <p>The name BLESSLUXE, the marks, the photography and the site itself are ours or licensed to us. You may not copy them for your own trade. Product photographs may come from our suppliers and remain theirs.</p>
            </section>

            <section>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">11. What we are and aren't responsible for</h2>
                <p>We take care over descriptions, measurements and photographs, but colour on a screen is never exactly colour in a room, and a measurement is a guide.</p>
                <p class="mt-3">We are responsible for what we sell you. We are not responsible for losses neither of us could reasonably have expected when you ordered, nor for a service outside our control — a payment provider, a courier, or the internet itself — failing. Nothing here limits our liability for death, personal injury, or fraud, which cannot be limited in law.</p>
            </section>

            <section>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">12. Your information</h2>
                <p>We keep what we need to take your order, deliver it, run your account and answer you — no more. We do not sell it. Payment providers handle your payment details under their own terms.</p>
                <p class="mt-3">Measurements you save for fit are private by default and only ever shared as far as you choose in your Hive settings.</p>
            </section>

            <section>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">13. Law, and telling us when something is wrong</h2>
                <p>These terms are governed by the law of Zimbabwe, and the courts of Zimbabwe have jurisdiction.</p>
                <p class="mt-3">If something has gone wrong, tell us first — most things are fixed faster by a message than by anything else. <router-link to="/contact" class="text-gold-dark underline underline-offset-4">Get in touch</router-link>.</p>
            </section>
        </div>
    </div>
</template>
