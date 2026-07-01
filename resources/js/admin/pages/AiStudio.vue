<script>
import { api } from '../../lib/api.js';

export default {
    name: 'AdminAiStudio',
    data() {
        return {
            prompt: '',
            suggestion: null,
            suggestForm: {
                context_kind: 'product_image',
                pose_hint: '',
                subject: { gender: 'woman', age_range: '20-30', ethnicity: '', description: '' },
                product: { title: '', description: '' },
            },
            suggestBusy: false,
            generateBusy: false,
            error: '',
            image: null,
            history: JSON.parse(localStorage.getItem('luxe_ai_studio_history') || '[]'),
        };
    },
    methods: {
        async suggest() {
            this.suggestBusy = true;
            this.error = '';
            try {
                const r = await api.post('/api/admin/ai/suggest-prompt', this.suggestForm);
                this.suggestion = r;
                if (r.prompt) this.prompt = r.prompt;
            } catch (e) {
                this.error = e.payload?.error || 'Could not suggest a prompt.';
            } finally {
                this.suggestBusy = false;
            }
        },
        async generate() {
            if (!this.prompt.trim()) {
                this.error = 'Write a prompt first.';
                return;
            }
            this.generateBusy = true;
            this.error = '';
            try {
                const r = await api.post('/api/admin/ai/generate-image', { prompt: this.prompt });
                this.image = r.url;
                this.history.unshift({ prompt: this.prompt, url: r.url, at: new Date().toISOString() });
                this.history = this.history.slice(0, 12);
                localStorage.setItem('luxe_ai_studio_history', JSON.stringify(this.history));
            } catch (e) {
                this.error = e.payload?.error || 'Could not generate the image.';
            } finally {
                this.generateBusy = false;
            }
        },
    },
};
</script>

<template>
    <div class="px-8 py-8 max-w-[1400px]">
        <header class="mb-6">
            <h1 class="text-3xl font-serif">AI Studio</h1>
            <p class="text-sm text-zinc-500 mt-1">Prompt the LUXE creative director, then render with Nano Banana.</p>
        </header>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Suggest -->
            <section class="lg:col-span-1 bg-zinc-50 border border-zinc-200 p-5 space-y-3">
                <h2 class="text-sm tracking-widest uppercase font-semibold">1 · Brief LUXE</h2>
                <label class="block text-xs">
                    <span class="text-[10px] tracking-widest uppercase text-zinc-500">Kind</span>
                    <select v-model="suggestForm.context_kind" class="block w-full border border-zinc-300 px-3 py-2 text-sm bg-white mt-1">
                        <option value="product_image">Product image</option>
                        <option value="model_image">Model image</option>
                        <option value="product_video">Product video</option>
                        <option value="model_video">Model video</option>
                    </select>
                </label>
                <input v-model="suggestForm.pose_hint" placeholder="Pose hint (front three-quarter…)" class="block w-full border border-zinc-300 px-3 py-2 text-sm" />
                <input v-model="suggestForm.subject.gender" placeholder="Subject gender" class="block w-full border border-zinc-300 px-3 py-2 text-sm" />
                <input v-model="suggestForm.subject.age_range" placeholder="Subject age range" class="block w-full border border-zinc-300 px-3 py-2 text-sm" />
                <input v-model="suggestForm.subject.ethnicity" placeholder="Subject ethnicity (optional)" class="block w-full border border-zinc-300 px-3 py-2 text-sm" />
                <input v-model="suggestForm.product.title" placeholder="Product title (optional)" class="block w-full border border-zinc-300 px-3 py-2 text-sm" />
                <textarea v-model="suggestForm.product.description" placeholder="Product details (optional)" rows="2" class="block w-full border border-zinc-300 px-3 py-2 text-sm"></textarea>
                <button @click="suggest" :disabled="suggestBusy" class="w-full bg-black text-white px-5 py-2 text-xs tracking-widest uppercase hover:bg-gold transition-colors disabled:opacity-50">
                    {{ suggestBusy ? 'Briefing…' : '✨ Brief LUXE' }}
                </button>
                <div v-if="suggestion" class="mt-3 text-xs space-y-1 text-zinc-700">
                    <p v-if="suggestion.pose"><span class="text-zinc-500 uppercase tracking-widest text-[9px]">Pose</span> {{ suggestion.pose }}</p>
                    <p v-if="suggestion.angle"><span class="text-zinc-500 uppercase tracking-widest text-[9px]">Angle</span> {{ suggestion.angle }}</p>
                    <p v-if="suggestion.lighting"><span class="text-zinc-500 uppercase tracking-widest text-[9px]">Lighting</span> {{ suggestion.lighting }}</p>
                    <p v-if="suggestion.backdrop"><span class="text-zinc-500 uppercase tracking-widest text-[9px]">Backdrop</span> {{ suggestion.backdrop }}</p>
                </div>
            </section>

            <!-- Prompt + render -->
            <section class="lg:col-span-2 bg-white border border-zinc-200 p-5 space-y-3">
                <h2 class="text-sm tracking-widest uppercase font-semibold">2 · Render with Nano Banana</h2>
                <textarea v-model="prompt" rows="8" placeholder="Edit or paste a prompt then render…" class="block w-full border border-zinc-300 px-3 py-2 text-sm font-mono"></textarea>
                <button @click="generate" :disabled="generateBusy" class="bg-gradient-to-r from-amber-500 to-amber-700 text-white px-5 py-2 text-xs tracking-widest uppercase disabled:opacity-50">
                    {{ generateBusy ? 'Rendering…' : 'Generate image' }}
                </button>
                <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
                <div v-if="image" class="mt-4">
                    <img :src="image" alt="Generated" class="max-w-full border border-zinc-300" />
                    <p class="text-xs text-zinc-500 mt-1"><a :href="image" target="_blank" class="underline">Open full-size</a></p>
                </div>
            </section>
        </div>

        <!-- History -->
        <section v-if="history.length" class="mt-8 border border-zinc-200 p-5">
            <h2 class="text-sm tracking-widest uppercase font-semibold mb-3">History (this browser)</h2>
            <div class="grid grid-cols-3 md:grid-cols-6 gap-3">
                <button v-for="(h, idx) in history" :key="idx" @click="image = h.url; prompt = h.prompt" class="block group">
                    <img :src="h.url" :alt="'Run ' + idx" class="w-full aspect-square object-cover border border-zinc-200 group-hover:border-gold transition-colors" />
                </button>
            </div>
        </section>
    </div>
</template>
