<script>
import { Instagram, Facebook, Youtube } from 'lucide-vue-next';

/** The network's mark. Lucide carries three of the four; TikTok's note is drawn here. */
export default {
    name: 'SocialIcon',
    components: { Instagram, Facebook, Youtube },
    props: { network: { type: String, required: true } },
};
</script>

<template>
    <Instagram v-if="network === 'instagram'" />
    <Facebook v-else-if="network === 'facebook'" />
    <Youtube v-else-if="network === 'youtube'" />
    <svg v-else-if="network === 'tiktok'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.6 5.8a4.8 4.8 0 0 1-1-.1v6.9a6.3 6.3 0 1 1-6.3-6.3c.3 0 .7 0 1 .1v3.3a3.1 3.1 0 1 0 2.2 3V1h3.2a4.8 4.8 0 0 0 4.3 4.5v3.3a8 8 0 0 1-3.4-.8V5.8Z" />
    </svg>
</template>
