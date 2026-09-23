<script>
import { api } from '../../lib/api.js';
import { Mail, MessageCircle, Phone, MapPin, Clock, Instagram, Facebook, Youtube } from 'lucide-vue-next';

/**
 * How to reach a person. Built on what the research agrees on: offer the
 * channels people already use rather than one form, say how long a reply takes,
 * and put the answers to the common questions in front of the form so most
 * people never need it.
 *
 * Every detail comes from `/api/store/shop-info`, which staff fill in at
 * /admin/content. A channel nobody has filled in is not offered — a phone
 * number that rings out is worse than no phone number.
 */
export default {
    name: 'ContactPage',
    components: { Mail, MessageCircle, Phone, MapPin, Clock, Instagram, Facebook, Youtube },
    data() {
        return { info: {}, loading: true };
    },
    computed: {
        whatsappHref() {
            const n = (this.info.whatsapp || '').replace(/[^\d]/g, '');

            return n ? `https://wa.me/${n}` : null;
        },
        hasAny() {
            return !!(this.info.email || this.info.whatsapp || this.info.phone || this.info.address);
        },
    },
    async mounted() {
        try {
            this.info = (await api.get('/api/store/shop-info')).info || {};
        } catch { /* fall through to the quiet state below */ }
        finally { this.loading = false; }
    },
};
</script>

<template>
    <div class="max-w-3xl mx-auto px-[5%] py-14">
        <header class="text-center mb-10">
            <p class="font-script text-3xl text-gold mb-2">We'd love to hear from you</p>
            <h1 class="font-display text-4xl tracking-widest uppercase">Contact</h1>
            <p v-if="info.response" class="flex items-center justify-center gap-2 text-sm text-black/60 mt-4">
                <Clock class="w-4 h-4 text-gold" /> {{ info.response }}
            </p>
        </header>

        <p v-if="loading" class="text-center text-xs tracking-widest uppercase text-black/45 py-10 animate-pulse">Loading</p>

        <template v-else>
            <!-- The channels themselves, biggest first. -->
            <div v-if="hasAny" class="grid sm:grid-cols-2 gap-4 mb-12">
                <a
                    v-if="whatsappHref"
                    :href="whatsappHref"
                    target="_blank"
                    rel="noopener"
                    class="flex items-start gap-4 border border-gold/20 bg-cream-dark/30 p-5 hover:border-gold transition-colors"
                >
                    <MessageCircle class="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
                    <span>
                        <span class="block font-display text-base">WhatsApp</span>
                        <span class="block text-sm text-black/60 mt-0.5">{{ info.whatsapp }}</span>
                        <span class="block text-xs text-black/45 mt-1">Quickest for anything about an order</span>
                    </span>
                </a>

                <a
                    v-if="info.email"
                    :href="`mailto:${info.email}`"
                    class="flex items-start gap-4 border border-gold/20 bg-cream-dark/30 p-5 hover:border-gold transition-colors"
                >
                    <Mail class="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
                    <span>
                        <span class="block font-display text-base">Email</span>
                        <span class="block text-sm text-black/60 mt-0.5 break-all">{{ info.email }}</span>
                        <span class="block text-xs text-black/45 mt-1">Best when you need to send photos</span>
                    </span>
                </a>

                <a
                    v-if="info.phone"
                    :href="`tel:${info.phone.replace(/\s/g, '')}`"
                    class="flex items-start gap-4 border border-gold/20 bg-cream-dark/30 p-5 hover:border-gold transition-colors"
                >
                    <Phone class="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
                    <span>
                        <span class="block font-display text-base">Phone</span>
                        <span class="block text-sm text-black/60 mt-0.5">{{ info.phone }}</span>
                        <span class="block text-xs text-black/45 mt-1">{{ info.hours || 'During opening hours' }}</span>
                    </span>
                </a>

                <div v-if="info.address" class="flex items-start gap-4 border border-gold/20 bg-cream-dark/30 p-5">
                    <MapPin class="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
                    <span>
                        <span class="block font-display text-base">Collections</span>
                        <span class="block text-sm text-black/60 mt-0.5 whitespace-pre-line">{{ info.address }}</span>
                        <span v-if="info.hours" class="block text-xs text-black/45 mt-1">{{ info.hours }}</span>
                    </span>
                </div>
            </div>

            <!-- Nothing filled in yet: say so plainly rather than show an empty page. -->
            <div v-else class="text-center py-10 mb-10">
                <p class="text-sm text-black/60">Our contact details are being updated. In the meantime, send us a message on social and we'll come straight back to you.</p>
            </div>

            <!-- Most questions are already answered somewhere; send people there first. -->
            <section class="border-t border-gold/15 pt-8">
                <h2 class="font-display text-lg tracking-widest uppercase mb-4">Before you write</h2>
                <ul class="space-y-3 text-sm text-black/75">
                    <li>
                        <strong class="font-medium">Where is my order?</strong> —
                        <router-link to="/track" class="text-gold-dark underline underline-offset-4">track it here</router-link>
                        with the code from your confirmation email, or open
                        <router-link to="/account" class="text-gold-dark underline underline-offset-4">your account</router-link>.
                    </li>
                    <li>
                        <strong class="font-medium">Can I send something back?</strong> —
                        <router-link to="/help/returns" class="text-gold-dark underline underline-offset-4">yes, within 30 days</router-link>, and you can start it yourself.
                    </li>
                    <li>
                        <strong class="font-medium">A payment didn't go through</strong> — nothing is charged unless the payment completes. Try again, and tell us the reference if it keeps failing.
                    </li>
                    <li>
                        <strong class="font-medium">Something else?</strong> — the
                        <router-link to="/faq" class="text-gold-dark underline underline-offset-4">questions page</router-link>
                        covers sizing, delivery and Bees.
                    </li>
                </ul>
            </section>

            <section class="border-t border-gold/15 mt-8 pt-8">
                <h2 class="font-display text-lg tracking-widest uppercase mb-4">Find us</h2>
                <div class="flex flex-wrap gap-5 text-sm">
                    <a href="https://instagram.com/blessluxe" target="_blank" rel="noopener" class="inline-flex items-center gap-2 min-h-11 text-black/65 hover:text-gold transition-colors">
                        <Instagram class="w-4 h-4" /> Instagram
                    </a>
                    <a href="https://facebook.com/blessluxe" target="_blank" rel="noopener" class="inline-flex items-center gap-2 min-h-11 text-black/65 hover:text-gold transition-colors">
                        <Facebook class="w-4 h-4" /> Facebook
                    </a>
                    <a href="https://youtube.com/blessluxe" target="_blank" rel="noopener" class="inline-flex items-center gap-2 min-h-11 text-black/65 hover:text-gold transition-colors">
                        <Youtube class="w-4 h-4" /> YouTube
                    </a>
                </div>
            </section>
        </template>
    </div>
</template>
