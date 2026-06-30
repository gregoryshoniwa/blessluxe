<script>
export default {
    name: 'StoreFooter',
    data() {
        return {
            year: new Date().getFullYear(),
            footerSections: [
                {
                    title: 'Shop',
                    links: [
                        { label: 'New Arrivals', href: '/shop?new=true' },
                        { label: 'Women', href: '/shop?category=women' },
                        { label: 'Men', href: '/shop?category=men' },
                        { label: 'Children', href: '/shop?category=children' },
                        { label: 'Sale', href: '/shop?sale=true' },
                    ],
                },
                {
                    title: 'Help',
                    links: [
                        { label: 'FAQ', href: '/faq' },
                        { label: 'Shipping', href: '/help/shipping' },
                        { label: 'Returns', href: '/help/returns' },
                        { label: 'Size Guide', href: '/help/sizing' },
                        { label: 'Contact', href: '/contact' },
                    ],
                },
                {
                    title: 'Company',
                    links: [
                        { label: 'About', href: '/about' },
                        { label: 'Sustainability', href: '/sustainability' },
                        { label: 'Careers', href: '/careers' },
                        { label: 'Press', href: '/press' },
                    ],
                },
            ],
            socials: [
                { label: 'Instagram', href: 'https://instagram.com/blessluxe' },
                { label: 'Facebook', href: 'https://facebook.com/blessluxe' },
                { label: 'Twitter', href: 'https://twitter.com/blessluxe' },
                { label: 'YouTube', href: 'https://youtube.com/blessluxe' },
            ],
        };
    },
};
</script>

<template>
    <footer class="bg-black text-white mt-20">
        <div class="max-w-[1400px] mx-auto px-[5%] py-16">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                <div class="lg:col-span-1">
                    <img
                        src="/logo.png"
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
                            :key="s.label"
                            :href="s.href"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="w-10 h-10 border border-white/30 rounded-full flex items-center justify-center hover:bg-gold hover:border-gold transition-all hover:-translate-y-1 text-[10px] tracking-widest uppercase"
                        >
                            {{ s.label.charAt(0) }}
                        </a>
                    </div>
                </div>
                <div v-for="section in footerSections" :key="section.title">
                    <h4 class="font-display text-sm tracking-widest uppercase text-gold mb-6">
                        {{ section.title }}
                    </h4>
                    <ul class="space-y-3">
                        <li v-for="link in section.links" :key="link.href">
                            <a :href="link.href" class="text-white/70 text-sm hover:text-gold transition-colors">
                                {{ link.label }}
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
        <div class="border-t border-white/10">
            <div class="max-w-[1400px] mx-auto px-[5%] py-6 text-center">
                <p class="text-white/50 text-sm">
                    © {{ year }} BLESSLUXE. All rights reserved.
                </p>
            </div>
        </div>
    </footer>
</template>
