<script>
import { siteLinks } from '../site-links.js';
import { api } from '../../lib/api.js';
import SocialIcon from './SocialIcon.vue';
export default {
    name: 'StoreFooter',
    components: { SocialIcon },
    data() {
        return {
            year: new Date().getFullYear(),
            nav: siteLinks.state,
            // Only the Shop column is fixed; Help and Company are whatever staff
            // have switched on, since most of those pages don't exist yet.
            shopSection: [
                { label: 'New Arrivals', href: '/shop?new=1' },
                { label: 'Women', href: '/shop?heading=women' },
                { label: 'Men', href: '/shop?heading=men' },
                { label: 'Children', href: '/shop?heading=children' },
                { label: 'Sale', href: '/shop?sale=true' },
            ],
            info: {},                 // staff-entered at /admin/content → Contact details
        };
    },
    computed: {
        /** Only the networks with a link filled in; a dead icon is worse than none. */
        socials() {
            return [
                { key: 'instagram', label: 'Instagram', href: this.info.instagram },
                { key: 'facebook',  label: 'Facebook',  href: this.info.facebook },
                { key: 'tiktok',    label: 'TikTok',    href: this.info.tiktok },
                { key: 'youtube',   label: 'YouTube',   href: this.info.youtube },
            ].filter((s) => s.href);
        },
        /** Shop, then whichever of Help and Company have anything in them. */
        footerSections() {
            return [
                { title: 'Shop', links: this.shopSection },
                { title: 'Help', links: this.nav.help },
                { title: 'Company', links: this.nav.company },
            ].filter((s) => s.links.length);
        },
    },
    async mounted() {
        siteLinks.load();
        try { this.info = (await api.get('/api/store/shop-info')).info || {}; } catch { /* icons simply stay off */ }
    },
};
</script>

<template>
    <footer class="bg-black text-white mt-20">
        <div class="max-w-[1600px] mx-auto px-[5%] py-16">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                <div class="lg:col-span-1">
                    <img
                        src="/logo-header.png"
                        alt="BLESSLUXE"
                        class="h-12 w-auto brightness-0 invert mb-6"
                    />
                    <p class="text-white/70 text-sm leading-relaxed mb-6">
                        Curating luxury fashion for the modern woman. Embrace elegance,
                        embody confidence, experience BLESSLUXE.
                    </p>
                    <div class="flex gap-3">
                        <a
                            v-for="s in socials"
                            :key="s.key"
                            :href="s.href"
                            target="_blank"
                            rel="noopener noreferrer"
                            :title="s.label"
                            :aria-label="s.label"
                            class="w-10 h-10 border border-white/30 rounded-full flex items-center justify-center hover:bg-gold hover:border-gold transition-all hover:-translate-y-1"
                        >
                            <SocialIcon :network="s.key" class="w-4 h-4" />
                        </a>
                    </div>
                </div>
                <div v-for="section in footerSections" :key="section.title">
                    <h4 class="font-display text-sm tracking-widest uppercase text-gold mb-6">
                        {{ section.title }}
                    </h4>
                    <ul class="space-y-0 sm:space-y-3">
                        <li v-for="link in section.links" :key="link.href">
                            <a :href="link.href" class="block py-3 sm:py-0 sm:inline text-white/70 text-sm hover:text-gold transition-colors">
                                {{ link.label }}
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
        <div class="border-t border-white/10">
            <div class="max-w-[1600px] mx-auto px-[5%] py-6 text-center">
                <p class="text-white/50 text-sm">
                    © {{ year }} BLESSLUXE. All rights reserved.
                </p>
            </div>
        </div>
    </footer>
</template>
