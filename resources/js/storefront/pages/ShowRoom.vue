<script>
import AvatarsPanel from '../components/showroom/AvatarsPanel.vue';
import GenerationsPanel from '../components/showroom/GenerationsPanel.vue';
import LogosPanel from '../components/showroom/LogosPanel.vue';
import MyProductsPanel from '../components/showroom/MyProductsPanel.vue';
import StudioPanel from '../components/showroom/StudioPanel.vue';

/**
 * Show Room — /showroom/:tab?
 *
 * Customer-facing creative space. Avatars is live (Nano Banana);
 * the other surfaces are placeholders until specced.
 */
export default {
    name: 'ShowRoomPage',
    components: { AvatarsPanel, GenerationsPanel, LogosPanel, MyProductsPanel, StudioPanel },
    data() {
        return {
            menu: [
                { id: 'avatars',     label: 'Avatars',     blurb: 'Your avatar collection.' },
                { id: 'logos',       label: 'Logos',       blurb: 'Your logos and brand marks.' },
                { id: 'my-products', label: 'My Products', blurb: 'Products you have staged in the Show Room.' },
                { id: 'studio',      label: 'Studio',      blurb: 'Compose and create new looks.' },
                { id: 'generations', label: 'Generations', blurb: 'Everything you have generated so far.' },
            ],
        };
    },
    computed: {
        activeTab() {
            const tab = this.$route.params.tab;
            return this.menu.some((m) => m.id === tab) ? tab : 'avatars';
        },
        activeItem() {
            return this.menu.find((m) => m.id === this.activeTab);
        },
    },
};
</script>

<template>
    <!-- Full-bleed workspace: the panels host large design grids, so the
         layout stretches edge-to-edge instead of the usual 1200px column. -->
    <div class="w-full px-4 md:px-8 py-8 min-h-[85vh]">
        <div class="mb-8 flex items-baseline gap-4">
            <div>
                <p class="font-script text-2xl text-gold leading-none">Create</p>
                <h1 class="font-display text-2xl md:text-3xl tracking-widest uppercase">Show Room</h1>
            </div>
        </div>

        <div class="flex flex-col md:flex-row gap-6 items-start">
            <!-- Slim side rail (sticky so it stays put while grids scroll) -->
            <aside class="w-full md:w-44 shrink-0 md:sticky md:top-24 flex md:flex-col gap-1 overflow-x-auto">
                <router-link
                    v-for="m in menu"
                    :key="m.id"
                    :to="`/showroom/${m.id}`"
                    :class="[
                        'block whitespace-nowrap px-4 py-3 text-xs tracking-widest uppercase transition-colors',
                        activeTab === m.id ? 'bg-gold text-white' : 'text-black/70 hover:bg-cream-dark',
                    ]"
                >
                    {{ m.label }}
                </router-link>
            </aside>

            <!-- Workspace panel — takes all remaining width -->
            <section class="flex-1 w-full min-w-0 bg-white border border-gold/10 p-6 md:p-8 min-h-[70vh]">
                <h2 class="font-display text-xl tracking-widest uppercase mb-2">{{ activeItem.label }}</h2>
                <p class="text-sm text-black/60 mb-8">{{ activeItem.blurb }}</p>

                <AvatarsPanel v-if="activeTab === 'avatars'" />
                <LogosPanel v-else-if="activeTab === 'logos'" />
                <MyProductsPanel v-else-if="activeTab === 'my-products'" />
                <StudioPanel v-else-if="activeTab === 'studio'" />
                <GenerationsPanel v-else-if="activeTab === 'generations'" />

                <div v-else class="border border-dashed border-gold/30 bg-cream/60 min-h-[52vh] flex flex-col items-center justify-center text-center">
                    <p class="font-script text-3xl text-gold mb-2">Coming soon</p>
                    <p class="text-sm text-black/55">{{ activeItem.label }} is being crafted — check back shortly.</p>
                </div>
            </section>
        </div>
    </div>
</template>
