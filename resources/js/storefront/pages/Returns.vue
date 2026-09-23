<script>
import { api } from '../../lib/api.js';
import { authStore } from '../auth-store.js';
import { RotateCcw, Clock, PackageCheck, CreditCard, HelpCircle } from 'lucide-vue-next';

/**
 * The returns policy, written to be read by someone deciding whether to buy —
 * Baymard's research puts an unclear returns policy among the top reasons a
 * basket is abandoned, so this says the window, the conditions and who pays in
 * the first screen rather than burying them in prose.
 *
 * Every number here comes from the SERVER (`/api/store/shop-info`), which reads
 * them off the same constants the code enforces. A policy page that states a
 * rule the software doesn't keep is worse than no page.
 */
export default {
    name: 'ReturnsPage',
    components: { RotateCcw, Clock, PackageCheck, CreditCard, HelpCircle },
    data() {
        return { policy: null, info: {}, auth: authStore.state };
    },
    computed: {
        days() { return this.policy?.return_window_days ?? 30; },
        signedIn() { return this.auth.signedIn; },
    },
    async mounted() {
        try {
            const d = await api.get('/api/store/shop-info');
            this.policy = d.policy;
            this.info = d.info || {};
        } catch { /* the page still reads correctly on its defaults */ }
    },
};
</script>

<template>
    <div class="max-w-3xl mx-auto px-[5%] py-14">
        <header class="text-center mb-12">
            <p class="font-script text-3xl text-gold mb-2">Shop with confidence</p>
            <h1 class="font-display text-4xl tracking-widest uppercase">Returns</h1>
        </header>

        <!-- The three things every shopper wants before they read a word. -->
        <div class="grid sm:grid-cols-3 gap-4 mb-12">
            <div class="border border-gold/20 bg-cream-dark/30 p-5 text-center">
                <Clock class="w-5 h-5 text-gold mx-auto mb-2" />
                <p class="font-display text-2xl">{{ days }} days</p>
                <p class="text-xs text-black/55 mt-1">from the day you paid</p>
            </div>
            <div class="border border-gold/20 bg-cream-dark/30 p-5 text-center">
                <PackageCheck class="w-5 h-5 text-gold mx-auto mb-2" />
                <p class="font-display text-2xl">Unworn</p>
                <p class="text-xs text-black/55 mt-1">tags on, as it arrived</p>
            </div>
            <div class="border border-gold/20 bg-cream-dark/30 p-5 text-center">
                <CreditCard class="w-5 h-5 text-gold mx-auto mb-2" />
                <p class="font-display text-2xl">Full refund</p>
                <p class="text-xs text-black/55 mt-1">to how you paid</p>
            </div>
        </div>

        <section class="prose-blessluxe space-y-8 text-sm leading-relaxed text-black/75">
            <div>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">How to return something</h2>
                <ol class="space-y-3 list-decimal pl-5">
                    <li>Open <router-link to="/account?tab=returns" class="text-gold-dark underline underline-offset-4">your account → Returns</router-link> and choose the order.</li>
                    <li>Pick the pieces and how many of each you're sending back, and tell us why. A reason helps us fix what went wrong — it doesn't affect whether we accept it.</li>
                    <li>We review it and reply. Once approved, you'll be told where to bring the piece or how to send it.</li>
                    <li>When it reaches us and matches the condition below, the refund is made.</li>
                </ol>
                <p class="mt-4">
                    <router-link v-if="signedIn" to="/account?tab=returns" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">Start a return</router-link>
                    <router-link v-else to="/account/login?next=/account%3Ftab%3Dreturns" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">Sign in to start a return</router-link>
                </p>
            </div>

            <div>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">What we can take back</h2>
                <p>Within {{ days }} days of paying, a piece can come back if it is unworn and unwashed, with its tags still attached, and in the condition it reached you — including its packaging where that's part of the piece.</p>
                <p class="mt-3">We can't accept anything that has been worn, altered or washed, nor pierced jewellery, swimwear without its hygiene seal, or anything made or ordered to your measurements. Those aren't there to catch anyone out — they're pieces we can't sell again.</p>
                <p class="mt-3">If something arrives damaged, faulty or not what you ordered, none of the above applies. Tell us and we'll put it right at our cost.</p>
            </div>

            <div>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">Refunds</h2>
                <p>An approved return is refunded in full to the way you paid — the same wallet or card. Your bank or mobile money provider decides how quickly it appears, usually within a few working days of us sending it.</p>
                <p class="mt-3">Any Bees you spent on the order come back to your balance, and Bees you earned from it come off again. A charge added by your payment provider for making the payment isn't ours and isn't refundable by us.</p>
            </div>

            <div>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">Exchanges and delivery costs</h2>
                <p>For a different size or colour, return the piece and place a new order — it's quicker than an exchange, and it holds the size for you rather than hoping it's still there when yours arrives.</p>
                <p class="mt-3">Getting the piece back to us is yours to arrange unless it was faulty or wrong, in which case it's ours. A courier fee you paid to bring an imported piece into the country covers a journey already made, so it can't come back with the garment.</p>
            </div>

            <div>
                <h2 class="font-display text-lg tracking-widest uppercase text-black mb-3">Series</h2>
                <p>A series is ordered once every size is claimed, so a piece from one can be returned like any other — but only after it reaches you, not while the series is still filling. If a series is cancelled before it ships, everyone who claimed a size is refunded in full.</p>
            </div>

            <div class="border-t border-gold/15 pt-6 flex items-start gap-3">
                <HelpCircle class="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
                <p>
                    Anything here you're unsure about, ask before you buy rather than after —
                    <router-link to="/contact" class="text-gold-dark underline underline-offset-4">get in touch</router-link>.
                    Nothing on this page takes away any right you have under Zimbabwean consumer law.
                </p>
            </div>
        </section>
    </div>
</template>
