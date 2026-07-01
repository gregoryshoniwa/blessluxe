<script>
import { api } from '../../lib/api.js';
import IconButton from '../components/IconButton.vue';
import { Pencil, Trash2, Plus, Image as ImageIcon, Upload } from 'lucide-vue-next';

export default {
    name: 'AdminContent',
    components: { IconButton, Pencil, Trash2, Plus, ImageIcon, Upload },
    data() {
        return {
            tab: 'hero',
            announcements: [],
            loading: true,
            showForm: false,
            editingId: null,
            form: this.emptyForm(),
            file: null,
            saving: false,
            error: '',
        };
    },
    computed: {
        forTab() {
            return this.announcements.filter((a) => a.position === this.tab);
        },
    },
    mounted() { this.fetchAll(); },
    methods: {
        emptyForm() {
            return {
                position: 'hero', media_type: 'image', media_url: '',
                poster_url: '', heading: '', subheading: '', cta_label: '', cta_href: '',
                text_align: 'center', sort_order: 0, is_active: true,
                starts_at: '', ends_at: '',
            };
        },
        async fetchAll() {
            this.loading = true;
            try {
                const d = await api.get('/api/admin/announcements');
                this.announcements = d.announcements;
            } finally { this.loading = false; }
        },
        startNew() {
            this.editingId = null;
            this.form = this.emptyForm();
            this.form.position = this.tab;
            this.form.sort_order = (this.forTab.at(-1)?.sort_order ?? 0) + 1;
            this.file = null;
            this.showForm = true; this.error = '';
        },
        startEdit(a) {
            this.editingId = a.id;
            this.form = {
                ...a,
                starts_at: a.starts_at?.slice(0, 16) || '',
                ends_at:   a.ends_at?.slice(0, 16)   || '',
            };
            this.file = null;
            this.showForm = true; this.error = '';
        },
        cancel() { this.showForm = false; this.error = ''; },
        async save() {
            this.saving = true; this.error = '';
            try {
                const fd = new FormData();
                for (const [k, v] of Object.entries(this.form)) {
                    if (v === null || v === undefined || v === '') continue;
                    fd.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : v);
                }
                if (this.file) fd.append('media_file', this.file);
                // Laravel doesn't honour FormData for PUT — use POST + _method override.
                if (this.editingId) fd.append('_method', 'PUT');
                const path = this.editingId
                    ? `/api/admin/announcements/${this.editingId}`
                    : '/api/admin/announcements';
                await api.post(path, fd);
                this.showForm = false;
                await this.fetchAll();
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not save.';
            } finally { this.saving = false; }
        },
        async remove(a) {
            if (!confirm(`Delete this ${a.position} slide?`)) return;
            await api.del(`/api/admin/announcements/${a.id}`);
            await this.fetchAll();
        },
        fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString() : '—'; },
    },
};
</script>

<template>
    <div>
        <header class="flex items-center justify-between mb-8">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">Storefront content</p>
                <h1 class="text-2xl font-semibold">Announcements & Hero Slides</h1>
            </div>
            <button @click="startNew" class="bg-gold text-white px-5 py-2 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark inline-flex items-center gap-2">
                <Plus class="w-4 h-4" /> New {{ tab === 'hero' ? 'Slide' : 'Bar' }}
            </button>
        </header>

        <div class="flex gap-1 mb-6 text-xs tracking-widest uppercase border-b border-zinc-200">
            <button @click="tab = 'hero'" :class="['px-4 py-2', tab === 'hero' ? 'border-b-2 border-gold text-gold' : 'text-zinc-500 hover:text-black']">Hero slides</button>
            <button @click="tab = 'top_bar'" :class="['px-4 py-2', tab === 'top_bar' ? 'border-b-2 border-gold text-gold' : 'text-zinc-500 hover:text-black']">Top bar</button>
        </div>

        <section v-if="showForm" class="bg-white border border-gold/30 p-5 mb-6">
            <h2 class="font-semibold mb-3">{{ editingId ? 'Edit slide' : 'New slide' }}</h2>
            <div class="grid grid-cols-2 gap-3">
                <select v-model="form.position" class="border border-zinc-300 px-3 py-2">
                    <option value="hero">Hero</option>
                    <option value="top_bar">Top bar</option>
                </select>
                <select v-model="form.media_type" class="border border-zinc-300 px-3 py-2">
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="gif">GIF</option>
                </select>
                <div class="col-span-2">
                    <label class="text-xs tracking-widest uppercase text-zinc-500 mb-1 block">Media URL or upload</label>
                    <input v-model="form.media_url" placeholder="https://… or /storage/announcements/…" class="border border-zinc-300 px-3 py-2 w-full font-mono text-xs" />
                    <label class="mt-1 inline-flex items-center gap-2 text-xs text-zinc-500 cursor-pointer">
                        <Upload class="w-3 h-3" /> Upload from disk
                        <input type="file" accept="image/*,video/*" class="hidden" @change="file = $event.target.files[0]" />
                        <span v-if="file" class="text-emerald-600">· {{ file.name }}</span>
                    </label>
                </div>
                <input v-model="form.heading" placeholder="Heading" class="border border-zinc-300 px-3 py-2 col-span-2" />
                <input v-model="form.subheading" placeholder="Subheading" class="border border-zinc-300 px-3 py-2 col-span-2" />
                <input v-model="form.cta_label" placeholder="CTA label (e.g. Shop Collection)" class="border border-zinc-300 px-3 py-2" />
                <input v-model="form.cta_href" placeholder="CTA link (e.g. /shop?heading=women)" class="border border-zinc-300 px-3 py-2" />
                <select v-model="form.text_align" class="border border-zinc-300 px-3 py-2">
                    <option value="left">Left aligned</option>
                    <option value="center">Centred</option>
                    <option value="right">Right aligned</option>
                </select>
                <input v-model.number="form.sort_order" type="number" placeholder="Sort order" class="border border-zinc-300 px-3 py-2" />
                <input v-model="form.starts_at" type="datetime-local" class="border border-zinc-300 px-3 py-2" />
                <input v-model="form.ends_at" type="datetime-local" class="border border-zinc-300 px-3 py-2" />
                <label class="col-span-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" v-model="form.is_active" /> Active
                </label>
            </div>
            <p v-if="error" class="text-sm text-red-600 mt-3">{{ error }}</p>
            <div class="flex justify-end gap-2 mt-4">
                <button @click="cancel" class="px-4 py-2 text-xs tracking-widest uppercase text-zinc-600">Cancel</button>
                <button @click="save" :disabled="saving" class="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50">
                    {{ saving ? 'Saving…' : 'Save' }}
                </button>
            </div>
        </section>

        <div v-if="loading" class="text-zinc-400 text-sm">Loading…</div>

        <div v-else-if="!forTab.length" class="bg-white border border-zinc-200 p-12 text-center text-zinc-400">
            No {{ tab === 'hero' ? 'hero slides' : 'top-bar messages' }} yet.
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div v-for="a in forTab" :key="a.id" class="bg-white border border-zinc-200 overflow-hidden">
                <div v-if="a.media_url" class="aspect-[16/7] bg-zinc-100 overflow-hidden">
                    <video v-if="a.media_type === 'video'" :src="a.media_url" :poster="a.poster_url" class="w-full h-full object-cover" muted loop />
                    <img v-else :src="a.media_url" :alt="a.heading || ''" class="w-full h-full object-cover object-top" />
                </div>
                <div class="p-4">
                    <div class="flex items-center gap-2 mb-2 flex-wrap">
                        <span class="text-[10px] tracking-widest uppercase bg-zinc-100 px-2 py-0.5">{{ a.position }}</span>
                        <span :class="['text-[10px] tracking-widest uppercase px-2 py-0.5', a.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600']">
                            {{ a.is_active ? 'active' : 'hidden' }}
                        </span>
                        <span class="text-[10px] text-zinc-500">#{{ a.sort_order }}</span>
                    </div>
                    <p class="font-medium">{{ a.heading || '(no heading)' }}</p>
                    <p class="text-xs text-zinc-500">{{ a.subheading || '—' }}</p>
                    <p v-if="a.cta_label" class="text-xs text-gold-dark mt-1">
                        {{ a.cta_label }}<span v-if="a.cta_href" class="text-zinc-400 ml-1 font-mono">→ {{ a.cta_href }}</span>
                    </p>
                    <p class="text-[10px] tracking-widest uppercase text-zinc-400 mt-2">
                        {{ a.starts_at ? `from ${fmtDate(a.starts_at)}` : '' }}
                        {{ a.ends_at ? `to ${fmtDate(a.ends_at)}` : '' }}
                    </p>
                    <div class="flex justify-end gap-1 mt-3">
                        <IconButton label="Edit slide" @click="startEdit(a)">
                            <Pencil class="w-4 h-4" />
                        </IconButton>
                        <IconButton label="Delete slide" tone="danger" @click="remove(a)">
                            <Trash2 class="w-4 h-4" />
                        </IconButton>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
