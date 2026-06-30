<script>
import { Sparkles, Wallet, Share2, TrendingUp, ArrowRight } from 'lucide-vue-next';

export default {
    name: 'AffiliateProgram',
    components: { Sparkles, Wallet, Share2, TrendingUp, ArrowRight },
};
</script>

<template>
    <div class="bg-cream">
        <!-- Hero -->
        <section class="relative bg-gradient-to-br from-cream via-blush to-cream-dark py-20 px-[5%] text-center">
            <p class="font-script text-3xl text-gold mb-3">Become an affiliate</p>
            <h1 class="font-display text-4xl md:text-6xl tracking-tight max-w-3xl mx-auto mb-6">
                Earn 10% on every BlessLuxe sale you bring in.
            </h1>
            <p class="text-base md:text-lg text-black/70 max-w-2xl mx-auto mb-10">
                Share what you love with your community. Every order that comes through your link puts pending commission on your dashboard the moment it's paid.
            </p>
            <router-link to="/affiliate/apply" class="inline-flex items-center gap-2 bg-gold text-white px-10 py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Apply now <ArrowRight class="w-4 h-4" />
            </router-link>
        </section>

        <!-- Three pillars -->
        <section class="max-w-[1200px] mx-auto px-[5%] py-16">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                <div>
                    <div class="w-12 h-12 mx-auto bg-gold/15 text-gold-dark rounded-full flex items-center justify-center mb-4">
                        <Share2 class="w-5 h-5" />
                    </div>
                    <h2 class="font-display text-lg tracking-widest uppercase mb-2">Share</h2>
                    <p class="text-sm text-black/65 leading-relaxed">
                        Pick a memorable code. Share your unique link in stories, lookbooks, or one-to-one chats.
                    </p>
                </div>
                <div>
                    <div class="w-12 h-12 mx-auto bg-gold/15 text-gold-dark rounded-full flex items-center justify-center mb-4">
                        <Wallet class="w-5 h-5" />
                    </div>
                    <h2 class="font-display text-lg tracking-widest uppercase mb-2">Earn</h2>
                    <p class="text-sm text-black/65 leading-relaxed">
                        Every order tagged to your link earns you 10% commission. See the running balance live in your dashboard.
                    </p>
                </div>
                <div>
                    <div class="w-12 h-12 mx-auto bg-gold/15 text-gold-dark rounded-full flex items-center justify-center mb-4">
                        <TrendingUp class="w-5 h-5" />
                    </div>
                    <h2 class="font-display text-lg tracking-widest uppercase mb-2">Get paid</h2>
                    <p class="text-sm text-black/65 leading-relaxed">
                        Payouts run on a regular cadence to your preferred method — EcoCash, OneMoney, or bank transfer.
                    </p>
                </div>
            </div>
        </section>

        <!-- FAQ -->
        <section class="max-w-[800px] mx-auto px-[5%] pb-20">
            <h2 class="font-display text-2xl tracking-widest uppercase text-center mb-8">FAQ</h2>
            <div class="space-y-3">
                <details class="border-b border-gold/15 py-3 group">
                    <summary class="cursor-pointer flex items-center justify-between list-none">
                        <span class="font-display text-base group-open:text-gold transition-colors">Who can apply?</span>
                        <span class="text-gold-dark text-xl group-open:rotate-45 transition-transform">+</span>
                    </summary>
                    <p class="text-sm text-black/65 mt-3 leading-relaxed">Anyone with an active audience — stylists, content creators, friends-of-the-brand. We review every application within a couple of business days.</p>
                </details>
                <details class="border-b border-gold/15 py-3 group">
                    <summary class="cursor-pointer flex items-center justify-between list-none">
                        <span class="font-display text-base group-open:text-gold transition-colors">Is there a minimum payout?</span>
                        <span class="text-gold-dark text-xl group-open:rotate-45 transition-transform">+</span>
                    </summary>
                    <p class="text-sm text-black/65 mt-3 leading-relaxed">No. Pending earnings settle on our regular payout cycle.</p>
                </details>
                <details class="border-b border-gold/15 py-3 group">
                    <summary class="cursor-pointer flex items-center justify-between list-none">
                        <span class="font-display text-base group-open:text-gold transition-colors">What if my customer returns their order?</span>
                        <span class="text-gold-dark text-xl group-open:rotate-45 transition-transform">+</span>
                    </summary>
                    <p class="text-sm text-black/65 mt-3 leading-relaxed">A refunded order cancels the pending commission for that sale.</p>
                </details>
            </div>

            <div class="text-center mt-12">
                <router-link to="/affiliate/apply" class="inline-flex items-center gap-2 bg-gold text-white px-10 py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                    Apply now <ArrowRight class="w-4 h-4" />
                </router-link>
            </div>
        </section>
    </div>
</template>
