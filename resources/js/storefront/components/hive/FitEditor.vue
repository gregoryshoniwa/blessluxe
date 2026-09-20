<script>
import { api } from '../../../lib/api.js';
import { toast } from '../../../lib/dialog.js';
import { hiveStore } from '../../hive-store.js';
import { Lock, Users, Globe, LoaderCircle, Ruler } from 'lucide-vue-next';

const SHAPE_HELP = {
    pear: 'Hips wider than bust',
    hourglass: 'Bust and hips similar, defined waist',
    apple: 'Fuller through the middle',
    rectangle: 'Bust, waist and hips similar',
    inverted: 'Shoulders or bust wider than hips',
};

/**
 * My fit: measurements, the sizes I actually wear, and WHO may use them.
 *
 * The privacy choice is the first thing on the form, not a setting buried
 * under it — nobody should type their waist size before knowing who sees it.
 */
export default {
    name: 'FitEditor',
    components: { Lock, Users, Globe, LoaderCircle, Ruler },
    emits: ['saved'],
    data() {
        return {
            hive: hiveStore.state,
            form: this.blank(),
            saving: false,
            errors: {},
            SHAPE_HELP,
            sharing: [
                { key: 'private', icon: 'Lock',  label: 'Only me',        text: 'Nobody sees anything. You also won’t be matched with fit twins.' },
                { key: 'twins',   icon: 'Users', label: 'Fit twins',      text: 'Used to find people built like you. They see a match % and the sizes you wear — never your measurements.' },
                { key: 'public',  icon: 'Globe', label: 'On my page',     text: 'Your measurements and sizes are shown on your page. Useful if you review or sell.' },
            ],
            measures: [
                { key: 'height_cm', label: 'Height' },
                { key: 'bust_cm',   label: 'Bust' },
                { key: 'waist_cm',  label: 'Waist' },
                { key: 'hips_cm',   label: 'Hips' },
            ],
            sizes: [
                { key: 'size_top',    label: 'Tops',    ph: 'M / 12' },
                { key: 'size_bottom', label: 'Bottoms', ph: '34 / 14' },
                { key: 'size_dress',  label: 'Dresses', ph: '12' },
                { key: 'size_shoe',   label: 'Shoes',   ph: '6' },
            ],
        };
    },
    created() { this.fill(); },
    watch: { 'hive.me'() { if (!this.saving) this.fill(); } },
    methods: {
        blank() {
            return { fit_visibility: 'private', height_cm: '', bust_cm: '', waist_cm: '', hips_cm: '', body_shape: '', size_top: '', size_bottom: '', size_dress: '', size_shoe: '' };
        },
        fill() {
            const me = this.hive.me;
            if (!me) return;
            const f = this.blank();
            Object.keys(f).forEach((k) => { if (me.fit?.[k] != null) f[k] = me.fit[k]; });
            f.fit_visibility = me.fit_visibility || 'private';
            this.form = f;
        },
        async save() {
            this.saving = true;
            this.errors = {};
            const body = {};
            Object.entries(this.form).forEach(([k, v]) => { body[k] = v === '' ? null : v; });
            try {
                const d = await api.put('/api/account/hive/me', body);
                hiveStore.setMe(d.me);
                toast('Fit saved');
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
    <form @submit.prevent="save" class="space-y-7">
        <!-- Who sees this — first, on purpose. -->
        <fieldset>
            <legend class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-2.5">Who can use your fit</legend>
            <div class="grid gap-2 sm:grid-cols-3">
                <label
                    v-for="s in sharing"
                    :key="s.key"
                    :class="['flex sm:flex-col gap-3 sm:gap-2 p-3.5 rounded-xl border cursor-pointer transition-colors', form.fit_visibility === s.key ? 'border-gold bg-cream' : 'border-black/10 hover:border-black/25']"
                >
                    <input v-model="form.fit_visibility" type="radio" :value="s.key" class="sr-only" />
                    <component :is="s.icon" :class="['w-5 h-5 flex-shrink-0', form.fit_visibility === s.key ? 'text-gold-dark' : 'text-black/40']" />
                    <span>
                        <span class="block text-sm font-medium">{{ s.label }}</span>
                        <span class="block text-xs text-black/55 leading-relaxed mt-0.5">{{ s.text }}</span>
                    </span>
                </label>
            </div>
        </fieldset>

        <fieldset>
            <legend class="flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-black/45 mb-2.5"><Ruler class="w-3.5 h-3.5" /> Measurements · cm</legend>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label v-for="m in measures" :key="m.key" class="block">
                    <span class="block text-xs text-black/60 mb-1">{{ m.label }}</span>
                    <input v-model.number="form[m.key]" type="number" inputmode="numeric" min="40" max="230" placeholder="—" class="w-full border border-black/12 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold" />
                    <span v-if="errors[m.key]" class="block text-[11px] text-red-600 mt-1">{{ errors[m.key][0] }}</span>
                </label>
            </div>
            <p class="text-[11px] text-black/45 mt-2 leading-relaxed">Measure over light clothing with a soft tape. Bust and hips at the fullest part, waist at the narrowest. Two of the three is enough to find fit twins.</p>
        </fieldset>

        <fieldset>
            <legend class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-2.5">Body shape</legend>
            <div class="flex flex-wrap gap-2">
                <button
                    v-for="s in hive.options.shapes"
                    :key="s"
                    type="button"
                    @click="form.body_shape = form.body_shape === s ? '' : s"
                    :title="SHAPE_HELP[s]"
                    :class="['px-3.5 py-2 rounded-full text-xs capitalize transition-colors', form.body_shape === s ? 'bg-gold text-white' : 'bg-black/5 text-black/65 hover:bg-black/10']"
                >
                    {{ s === 'inverted' ? 'Inverted triangle' : s }}
                </button>
            </div>
            <p v-if="form.body_shape" class="text-[11px] text-black/50 mt-2">{{ SHAPE_HELP[form.body_shape] }}</p>
        </fieldset>

        <fieldset>
            <legend class="text-[10px] tracking-[0.2em] uppercase text-black/45 mb-2.5">Sizes you usually wear</legend>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label v-for="s in sizes" :key="s.key" class="block">
                    <span class="block text-xs text-black/60 mb-1">{{ s.label }}</span>
                    <input v-model.trim="form[s.key]" maxlength="12" :placeholder="s.ph" class="w-full border border-black/12 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold" />
                </label>
            </div>
        </fieldset>

        <p v-if="errors._" class="text-sm text-red-600" role="alert">{{ errors._[0] }}</p>

        <button type="submit" :disabled="saving" class="w-full sm:w-auto bg-gold text-white px-10 py-3.5 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2">
            <LoaderCircle v-if="saving" class="w-4 h-4 animate-spin" /> Save my fit
        </button>
    </form>
</template>
