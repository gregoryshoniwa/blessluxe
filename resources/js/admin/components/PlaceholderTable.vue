<script>
export default {
    name: 'PlaceholderTable',
    props: {
        title:    { type: String, required: true },
        subtitle: { type: String, default: '' },
        columns:  { type: Array,  required: true },
        ctaLabel: { type: String, default: 'New Item' },
        milestone: { type: String, default: 'Milestone 6' },
    },
};
</script>

<template>
    <div>
        <header class="flex items-center justify-between mb-8">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">{{ subtitle }}</p>
                <h1 class="text-2xl font-semibold">{{ title }}</h1>
            </div>
            <button class="bg-gold text-white px-5 py-2 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                {{ ctaLabel }}
            </button>
        </header>
        <div class="bg-white border border-zinc-200 overflow-hidden">
            <table class="w-full text-sm">
                <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                    <tr>
                        <th v-for="col in columns" :key="col" class="px-5 py-3 text-left font-medium">{{ col }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td :colspan="columns.length" class="px-5 py-12 text-center text-zinc-400">
                            Live data lands in {{ milestone }}.
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
