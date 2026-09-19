<script>
import { api } from '../../../lib/api.js';
import { confirmDialog, toast } from '../../../lib/dialog.js';

/**
 * Show Room → Avatars.
 *
 * Create: up to 5 selfies + optional style prompt → Nano Banana render.
 * Manage: grid of avatars; edit drawer (eye colour, hair, body type, style,
 * freeform instruction → re-render) and delete.
 */
export default {
    name: 'AvatarsPanel',
    data() {
        return {
            customer: undefined,        // undefined = loading, null = guest
            avatars: [],
            loadingList: true,

            // Creation form
            files: [],
            previews: [],
            form: { name: '', prompt: '' },
            creating: false,
            createError: '',
            showCreate: false,

            // Edit drawer
            editing: null,              // the avatar being edited
            editForm: this.blankEdit(),
            savingEdit: false,
            editError: '',
        };
    },
    async mounted() {
        try {
            const d = await api.get('/api/account/me');
            this.customer = d.customer || null;
        } catch {
            this.customer = null;
        }
        if (this.customer) await this.fetchAvatars();
        this.loadingList = false;
    },
    methods: {
        blankEdit() {
            return { name: '', eye_color: '', hair_color: '', body_type: '', style: '', instruction: '' };
        },
        async fetchAvatars() {
            try {
                const d = await api.get('/api/account/avatars');
                this.avatars = d.avatars || [];
            } catch { /* keep whatever we had */ }
        },
        pickFiles(e) {
            const incoming = Array.from(e.target.files || []).slice(0, 5 - this.files.length);
            for (const f of incoming) {
                this.files.push(f);
                this.previews.push(URL.createObjectURL(f));
            }
            e.target.value = '';
        },
        removeFile(i) {
            URL.revokeObjectURL(this.previews[i]);
            this.files.splice(i, 1);
            this.previews.splice(i, 1);
        },
        async create() {
            if (!this.files.length) { this.createError = 'Add at least one photo of yourself.'; return; }
            this.creating = true;
            this.createError = '';
            try {
                const fd = new FormData();
                if (this.form.name)   fd.append('name', this.form.name);
                if (this.form.prompt) fd.append('prompt', this.form.prompt);
                this.files.forEach((f) => fd.append('images[]', f));
                const d = await api.post('/api/account/avatars', fd);
                this.avatars.unshift(d.avatar);
                this.previews.forEach((p) => URL.revokeObjectURL(p));
                this.files = []; this.previews = [];
                this.form = { name: '', prompt: '' };
                this.showCreate = false;
            } catch (e) {
                this.createError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not create the avatar — please try again.';
            } finally {
                this.creating = false;
            }
        },
        startEdit(a) {
            this.editing = a;
            this.editForm = { ...this.blankEdit(), name: a.name || '' };
            this.editError = '';
        },
        closeEdit() { this.editing = null; this.editError = ''; },
        async applyEdit() {
            this.savingEdit = true;
            this.editError = '';
            try {
                const body = {
                    name: this.editForm.name,
                    instruction: this.editForm.instruction || null,
                    attributes: {
                        eye_color:  this.editForm.eye_color  || null,
                        hair_color: this.editForm.hair_color || null,
                        body_type:  this.editForm.body_type  || null,
                        style:      this.editForm.style      || null,
                    },
                };
                const d = await api.put(`/api/account/avatars/${this.editing.id}`, body);
                const idx = this.avatars.findIndex((x) => x.id === this.editing.id);
                if (idx >= 0) this.avatars[idx] = d.avatar;
                this.editing = d.avatar;
                this.editForm = { ...this.blankEdit(), name: d.avatar.name || '' };
            } catch (e) {
                this.editError = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not update the avatar.';
            } finally {
                this.savingEdit = false;
            }
        },
        async remove(a) {
            if (!await confirmDialog({ title: `Delete "${a.name || 'this avatar'}"? This cannot be undone.`, confirmLabel: 'Delete', tone: 'danger' })) return;
            try {
                await api.del(`/api/account/avatars/${a.id}`);
                this.avatars = this.avatars.filter((x) => x.id !== a.id);
                if (this.editing?.id === a.id) this.closeEdit();
            } catch (e) {
                toast(e.payload?.error || 'Could not delete the avatar.', { tone: 'error' });
            }
        },
        hasRenderChange() {
            const f = this.editForm;
            return !!(f.eye_color || f.hair_color || f.body_type || f.style || f.instruction);
        },
    },
};
</script>

<template>
    <div>
        <!-- Guest gate -->
        <div v-if="customer === null" class="border border-dashed border-gold/30 bg-cream/60 py-16 text-center">
            <p class="font-script text-3xl text-gold mb-2">Your avatar awaits</p>
            <p class="text-sm text-black/60 mb-6">Sign in to create AI avatars of yourself — cartoon, editorial, alien, anything.</p>
            <router-link to="/account/login" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Sign in
            </router-link>
        </div>

        <template v-else-if="customer">
            <!-- Toolbar -->
            <div class="flex items-center justify-between mb-6">
                <p class="text-sm text-black/60">
                    Upload a few photos of yourself and describe any style — we'll craft an avatar that's unmistakably you.
                </p>
                <button
                    @click="showCreate = !showCreate"
                    class="shrink-0 ml-4 bg-gold text-white px-6 py-2.5 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors"
                >
                    {{ showCreate ? 'Close' : 'New Avatar' }}
                </button>
            </div>

            <!-- Creation form -->
            <div v-if="showCreate" class="border border-gold/20 bg-cream/40 p-6 mb-8">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                        <p class="text-xs tracking-widest uppercase text-black/55 mb-2">Your photos (1–5)</p>
                        <div class="flex flex-wrap gap-3">
                            <div v-for="(p, i) in previews" :key="p" class="relative w-20 h-24">
                                <img :src="p" class="w-full h-full object-cover border border-gold/20" alt="Upload preview" />
                                <button @click="removeFile(i)" class="absolute -top-2 -right-2 w-5 h-5 bg-black text-white text-xs leading-none rounded-full">×</button>
                            </div>
                            <label v-if="files.length < 5" class="w-20 h-24 border border-dashed border-gold/40 flex flex-col items-center justify-center cursor-pointer hover:bg-cream-dark/40 transition-colors">
                                <span class="text-2xl text-gold leading-none">+</span>
                                <span class="text-[9px] tracking-widest uppercase text-black/50 mt-1">Add</span>
                                <input type="file" accept="image/*" multiple class="hidden" @change="pickFiles" />
                            </label>
                        </div>
                        <p class="text-[11px] text-black/45 mt-2">Clear, well-lit photos of your face work best.</p>
                    </div>
                    <div class="space-y-3">
                        <input
                            v-model="form.name"
                            placeholder="Avatar name (e.g. Cartoon Me)"
                            class="w-full bg-white border border-gold/20 px-3 py-2.5 text-sm"
                        />
                        <textarea
                            v-model="form.prompt"
                            rows="4"
                            placeholder="Optional style — “an alien version of me”, “90s cartoon”, “vogue editorial in gold silk”…"
                            class="w-full bg-white border border-gold/20 px-3 py-2.5 text-sm resize-none"
                        ></textarea>
                        <p v-if="createError" class="text-sm text-red-600">{{ createError }}</p>
                        <button
                            @click="create"
                            :disabled="creating"
                            class="bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-60"
                        >
                            {{ creating ? 'Crafting your avatar…' : 'Create Avatar' }}
                        </button>
                        <p v-if="creating" class="text-[11px] text-black/45">This can take up to a minute — hang tight.</p>
                    </div>
                </div>
            </div>

            <!-- Grid -->
            <div v-if="loadingList" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                <div v-for="n in 5" :key="n" class="aspect-[3/4] bg-cream-dark animate-pulse" />
            </div>
            <div v-else-if="!avatars.length && !showCreate" class="border border-dashed border-gold/30 bg-cream/60 py-16 text-center">
                <p class="font-script text-3xl text-gold mb-2">No avatars yet</p>
                <p class="text-sm text-black/55">Tap “New Avatar” to create your first one.</p>
            </div>
            <div v-else class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                <div v-for="a in avatars" :key="a.id" class="group relative aspect-[3/4] overflow-hidden bg-cream-dark border border-gold/10">
                    <img v-if="a.image_url" :src="a.image_url" :alt="a.name" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10">
                        <p class="text-white text-sm font-medium truncate">{{ a.name }}</p>
                        <div class="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button @click="startEdit(a)" class="flex-1 bg-white/90 text-black text-[10px] tracking-widest uppercase py-1.5 hover:bg-gold hover:text-white transition-colors">Edit</button>
                            <button @click="remove(a)" class="flex-1 bg-white/20 text-white text-[10px] tracking-widest uppercase py-1.5 hover:bg-red-600 transition-colors">Delete</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Edit drawer -->
            <div v-if="editing" class="fixed inset-0 z-50 flex">
                <div class="flex-1 bg-black/40" @click="closeEdit"></div>
                <div class="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl p-6">
                    <div class="flex items-center justify-between mb-5">
                        <h3 class="font-display text-lg tracking-widest uppercase">Edit Avatar</h3>
                        <button @click="closeEdit" class="text-black/50 hover:text-black text-xl leading-none">×</button>
                    </div>

                    <div class="relative">
                        <img v-if="editing.image_url" :src="editing.image_url" :alt="editing.name" class="w-full aspect-[3/4] object-cover border border-gold/15 mb-5" />
                        <div v-if="savingEdit" class="absolute inset-0 mb-5 bg-white/70 flex items-center justify-center">
                            <p class="font-script text-2xl text-gold animate-pulse">Re-rendering…</p>
                        </div>
                    </div>

                    <div class="space-y-3">
                        <input v-model="editForm.name" placeholder="Name" class="w-full border border-gold/20 px-3 py-2.5 text-sm" />
                        <div class="grid grid-cols-2 gap-3">
                            <input v-model="editForm.eye_color"  placeholder="Eye colour"  class="border border-gold/20 px-3 py-2.5 text-sm" />
                            <input v-model="editForm.hair_color" placeholder="Hair colour" class="border border-gold/20 px-3 py-2.5 text-sm" />
                            <input v-model="editForm.body_type"  placeholder="Body type"   class="border border-gold/20 px-3 py-2.5 text-sm" />
                            <input v-model="editForm.style"      placeholder="Style"       class="border border-gold/20 px-3 py-2.5 text-sm" />
                        </div>
                        <textarea
                            v-model="editForm.instruction"
                            rows="3"
                            placeholder="Or describe any change — “give me silver space armour”, “softer smile”…"
                            class="w-full border border-gold/20 px-3 py-2.5 text-sm resize-none"
                        ></textarea>
                        <p v-if="editError" class="text-sm text-red-600">{{ editError }}</p>
                        <button
                            @click="applyEdit"
                            :disabled="savingEdit"
                            class="w-full bg-gold text-white py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-60"
                        >
                            {{ savingEdit ? 'Working…' : hasRenderChange() ? 'Apply & Re-render' : 'Save Name' }}
                        </button>
                        <button @click="remove(editing)" class="w-full border border-red-200 text-red-600 py-2.5 text-xs tracking-[0.3em] uppercase hover:bg-red-50 transition-colors">
                            Delete Avatar
                        </button>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
