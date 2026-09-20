<script>
import { api } from '../../../lib/api.js';
import { toast } from '../../../lib/dialog.js';
import { resizeImage } from '../../../lib/image-resize.js';
import { hiveStore } from '../../hive-store.js';
import { X, Camera, LoaderCircle, Check, UserRound } from 'lucide-vue-next';

/** Edit my page: photo, name, @handle, city, bio. */
export default {
    name: 'PageEditor',
    components: { X, Camera, LoaderCircle, Check, UserRound },
    emits: ['close', 'saved'],
    data() {
        const me = hiveStore.state.me || {};
        return {
            form: { display_name: me.display_name || '', handle: me.handle || '', city: me.city || '', bio: me.bio || '' },
            original: me.handle,
            avatarFile: null,
            avatarUrl: me.avatar_url || null,
            handleState: null,     // null | 'checking' | 'ok' | <problem text>
            timer: null,
            saving: false,
            errors: {},
        };
    },
    watch: {
        'form.handle'(v) {
            clearTimeout(this.timer);
            if (!v || v.toLowerCase() === this.original) { this.handleState = null; return; }
            this.handleState = 'checking';
            this.timer = setTimeout(this.checkHandle, 350);
        },
    },
    mounted() { document.body.style.overflow = 'hidden'; },
    beforeUnmount() {
        document.body.style.overflow = '';
        clearTimeout(this.timer);
        if (this.avatarFile) URL.revokeObjectURL(this.avatarUrl);
    },
    methods: {
        async checkHandle() {
            const asked = this.form.handle;
            try {
                const d = await api.get(`/api/account/hive/handle-available?handle=${encodeURIComponent(asked)}`);
                if (asked !== this.form.handle) return;
                this.handleState = d.available ? 'ok' : d.problem;
            } catch { this.handleState = null; }
        },
        async pickAvatar(e) {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (this.avatarFile) URL.revokeObjectURL(this.avatarUrl);
            this.avatarFile = await resizeImage(f, { max: 512 });
            this.avatarUrl = URL.createObjectURL(this.avatarFile);
        },
        async save() {
            if (this.saving) return;
            this.saving = true;
            this.errors = {};
            const form = new FormData();
            Object.entries(this.form).forEach(([k, v]) => form.append(k, v ?? ''));
            if (this.avatarFile) form.append('avatar', this.avatarFile);
            try {
                const d = await api.post('/api/account/hive/me', form);
                hiveStore.setMe(d.me);
                toast('Page updated');
                this.$emit('saved', d.me);
            } catch (e) {
                this.errors = e.payload?.errors || { _: [e.payload?.error || 'That didn’t save. Try again.'] };
            } finally {
                this.saving = false;
            }
        },
    },
};
</script>

<template>
    <div class="fixed inset-0 z-[90] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Edit your page">
        <div class="absolute inset-0 bg-black/50" @click="$emit('close')"></div>
        <form @submit.prevent="save" class="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col shadow-2xl">
            <header class="flex items-center justify-between px-5 py-3.5 border-b border-black/8 flex-shrink-0">
                <h2 class="font-display text-lg tracking-widest uppercase">Your page</h2>
                <button type="button" @click="$emit('close')" class="w-11 h-11 -mr-3 inline-flex items-center justify-center text-black/45 hover:text-black" aria-label="Close"><X class="w-5 h-5" /></button>
            </header>

            <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 space-y-4">
                <label class="flex items-center gap-4 cursor-pointer">
                    <span class="relative w-20 h-20 rounded-full overflow-hidden bg-cream-dark flex items-center justify-center border border-gold/25 flex-shrink-0">
                        <img v-if="avatarUrl" :src="avatarUrl" alt="" class="w-full h-full object-cover" />
                        <UserRound v-else class="w-8 h-8 text-black/25" />
                        <span class="absolute inset-x-0 bottom-0 bg-black/55 text-white flex justify-center py-1"><Camera class="w-3.5 h-3.5" /></span>
                    </span>
                    <span class="text-sm text-gold-dark">Change photo</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="pickAvatar" />
                </label>
                <p v-if="errors.avatar" class="text-[11px] text-red-600">{{ errors.avatar[0] }}</p>

                <label class="block">
                    <span class="block text-xs text-black/60 mb-1">Name</span>
                    <input v-model.trim="form.display_name" maxlength="60" required class="w-full border border-black/12 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold" />
                    <span v-if="errors.display_name" class="block text-[11px] text-red-600 mt-1">{{ errors.display_name[0] }}</span>
                </label>

                <label class="block">
                    <span class="block text-xs text-black/60 mb-1">Your link</span>
                    <span class="flex items-center border border-black/12 rounded-lg focus-within:border-gold overflow-hidden">
                        <span class="pl-3 text-sm text-black/40 whitespace-nowrap">blessluxe.com/@</span>
                        <input v-model.trim="form.handle" maxlength="30" autocapitalize="none" autocomplete="off" spellcheck="false" class="flex-1 min-w-0 px-1 py-2.5 text-sm focus:outline-none" />
                        <LoaderCircle v-if="handleState === 'checking'" class="w-4 h-4 mr-3 animate-spin text-black/30" />
                        <Check v-else-if="handleState === 'ok'" class="w-4 h-4 mr-3 text-green-600" />
                    </span>
                    <span v-if="errors.handle || (handleState && handleState !== 'ok' && handleState !== 'checking')" class="block text-[11px] text-red-600 mt-1">{{ errors.handle?.[0] || handleState }}</span>
                    <span v-else class="block text-[11px] text-black/40 mt-1">Letters, numbers, dots and underscores. Changing it breaks links you've already shared.</span>
                </label>

                <label class="block">
                    <span class="block text-xs text-black/60 mb-1">City</span>
                    <input v-model.trim="form.city" maxlength="60" placeholder="Harare" class="w-full border border-black/12 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold" />
                </label>

                <label class="block">
                    <span class="block text-xs text-black/60 mb-1">Bio</span>
                    <textarea v-model="form.bio" rows="3" maxlength="200" placeholder="Your style in a line or two" class="w-full border border-black/12 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold resize-none"></textarea>
                    <span class="block text-right text-[10px] text-black/35">{{ form.bio.length }}/200</span>
                </label>

                <p v-if="errors._" class="text-sm text-red-600" role="alert">{{ errors._[0] }}</p>
            </div>

            <footer class="px-5 py-3.5 border-t border-black/8 flex-shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                <button type="submit" :disabled="saving || handleState === 'checking'" class="w-full bg-gold text-white py-3.5 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2">
                    <LoaderCircle v-if="saving" class="w-4 h-4 animate-spin" /> Save
                </button>
            </footer>
        </form>
    </div>
</template>
