<script>
import { siteLinks } from '../site-links.js';
/**
 * One line of the links people actually look for while shopping — the returns
 * policy, the size guide, how to reach us. The full black footer is the home
 * page's; everywhere else gets this, because those links have nowhere else to
 * live (the header carries none of them) and "what if it doesn't fit?" is
 * asked on a product page, not on the home page.
 */
export default {
    name: 'FooterSlim',
    data() {
        return { nav: siteLinks.state, year: new Date().getFullYear() };
    },
    computed: {
        // Help first, then company — only what staff have switched on. Most of
        // these point at pages that don't exist yet, so they stay off until
        // there's something on the other end.
        links() { return [...this.nav.help, ...this.nav.company]; },
    },
    mounted() { siteLinks.load(); },
};
</script>

<template>
    <footer v-if="links.length" class="border-t border-gold/15 mt-auto">
        <div class="max-w-[1400px] mx-auto px-[5%] py-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs text-black/55">
            <a
                v-for="l in links"
                :key="l.href"
                :href="l.href"
                class="min-h-11 inline-flex items-center hover:text-gold transition-colors"
            >
                {{ l.label }}
            </a>
            <span class="text-black/35">© {{ year }} BLESSLUXE</span>
        </div>
    </footer>
</template>
