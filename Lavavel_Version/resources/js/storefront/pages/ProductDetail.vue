<script>
export default {
    name: 'ProductDetailPage',
    data() {
        return {
            selectedSize: 'M',
            selectedColor: 'rose',
            quantity: 1,
            sizes: ['XS','S','M','L','XL'],
            colors: [
                { id: 'rose',  hex: '#D9536F', label: 'Rose Garden' },
                { id: 'cream', hex: '#F5EDE3', label: 'Cream' },
                { id: 'black', hex: '#111',    label: 'Onyx' },
            ],
        };
    },
    computed: {
        handle() {
            return this.$route.params.handle;
        },
        selectedColorLabel() {
            return this.colors.find(c => c.id === this.selectedColor)?.label || '';
        },
    },
    methods: {
        addToCart() {
            // Wired up in Milestone 5 (cart store + API)
            alert(`Add ${this.handle} (${this.selectedColorLabel} / ${this.selectedSize}) × ${this.quantity} — to be implemented.`);
        },
    },
};
</script>

<template>
    <div class="max-w-[1400px] mx-auto px-[5%] py-12">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div class="aspect-[3/4] bg-gradient-to-br from-cream-dark to-blush" />
            <div>
                <p class="text-xs tracking-widest uppercase text-black/55 mb-2">{{ handle }}</p>
                <h1 class="font-display text-3xl md:text-4xl mb-3">Sample Product</h1>
                <p class="text-2xl text-gold-dark mb-6">$349.00</p>
                <p class="text-sm text-black/70 leading-relaxed mb-8">
                    Lorem ipsum dolor sit amet. Product copy lands here once the catalogue read paths
                    come online.
                </p>

                <div class="mb-5">
                    <p class="text-xs tracking-widest uppercase text-black/55 mb-2">Color · {{ selectedColorLabel }}</p>
                    <div class="flex gap-2">
                        <button
                            v-for="c in colors"
                            :key="c.id"
                            :class="[
                                'w-9 h-9 rounded-full border-2',
                                selectedColor === c.id ? 'border-gold' : 'border-transparent',
                            ]"
                            :style="{ backgroundColor: c.hex }"
                            @click="selectedColor = c.id"
                            :aria-label="c.label"
                        />
                    </div>
                </div>

                <div class="mb-6">
                    <p class="text-xs tracking-widest uppercase text-black/55 mb-2">Size</p>
                    <div class="flex flex-wrap gap-2">
                        <button
                            v-for="s in sizes"
                            :key="s"
                            :class="[
                                'border px-4 py-2 text-sm transition-colors',
                                selectedSize === s ? 'border-gold text-gold' : 'border-black/15 hover:border-gold',
                            ]"
                            @click="selectedSize = s"
                        >
                            {{ s }}
                        </button>
                    </div>
                </div>

                <div class="flex items-center gap-3 mb-8">
                    <div class="flex border border-black/15">
                        <button @click="quantity = Math.max(1, quantity - 1)" class="px-3 py-2 hover:bg-cream-dark">−</button>
                        <span class="px-4 py-2 min-w-[40px] text-center">{{ quantity }}</span>
                        <button @click="quantity++" class="px-3 py-2 hover:bg-cream-dark">+</button>
                    </div>
                </div>

                <button
                    @click="addToCart"
                    class="w-full bg-gold text-white py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors"
                >
                    Add to Bag
                </button>
            </div>
        </div>
    </div>
</template>
