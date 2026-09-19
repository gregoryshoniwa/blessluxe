<script>
import { api } from '../../lib/api.js';
import { ArrowRight, CheckCircle2, MapPin, User, LoaderCircle, Check, X } from 'lucide-vue-next';

export default {
    name: 'AffiliateApply',
    components: { ArrowRight, CheckCircle2, MapPin, User, LoaderCircle, Check, X },
    data() {
        return {
            // Name and email come from the account — asking a signed-in person to
            // retype what we already hold is friction, and lets the two disagree.
            // The only thing we can't know: what they want to be called.
            form: { code: '' },
            // Live availability, the way a username field behaves.
            codeState: 'idle', // idle | checking | available | taken
            codeReason: '',
            codeSuggestions: [],
            codeTimer: null,
            eligibility: null,
            loading: true,
            submitting: false,
            error: '',
            success: null,
        };
    },
    computed: {
        signedIn() { return !!this.eligibility?.signed_in; },
        customer() { return this.eligibility?.customer || null; },
        needsAddress() { return this.signedIn && !this.eligibility?.has_address; },
        alreadyApplied() { return !!this.eligibility?.already_applied; },
        canApply() { return !!this.eligibility?.eligible; },
        // Both must hold: eligible to apply at all, and the code is theirs to take.
        canSubmit() { return this.canApply && this.codeState === 'available' && !this.submitting; },
        addressLines() {
            const a = this.eligibility?.address;
            if (!a) return [];
            return [
                [a.first_name, a.last_name].filter(Boolean).join(' '),
                a.line1, a.line2,
                [a.city, a.region, a.postal_code].filter(Boolean).join(', '),
                a.country,
            ].filter(Boolean);
        },
    },
    async mounted() { await this.loadEligibility(); },
    beforeUnmount() { clearTimeout(this.codeTimer); },
    methods: {
        /** Normalise as they type so what they see is what gets reserved. */
        onCodeInput(e) {
            this.form.code = (e.target.value || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
            this.codeSuggestions = [];

            clearTimeout(this.codeTimer);

            if (!this.form.code) {
                this.codeState = 'idle';
                this.codeReason = '';
                return;
            }

            this.codeState = 'checking';
            // Debounced so a normal typing speed doesn't fire a request per keystroke.
            this.codeTimer = setTimeout(this.checkCode, 350);
        },
        async checkCode() {
            const asked = this.form.code;
            try {
                const d = await api.get(`/api/store/affiliate/code-available?code=${encodeURIComponent(asked)}`);
                // A slower earlier request must not overwrite a newer answer.
                if (asked !== this.form.code) return;

                this.codeState = d.available ? 'available' : 'taken';
                this.codeReason = d.reason || '';
                this.codeSuggestions = d.suggestions || [];
            } catch {
                if (asked !== this.form.code) return;
                this.codeState = 'idle';
                this.codeReason = '';
            }
        },
        useSuggestion(s) {
            this.form.code = s;
            this.codeSuggestions = [];
            this.codeState = 'checking';
            this.checkCode();
        },
        async loadEligibility() {
            this.loading = true;
            try {
                this.eligibility = await api.get('/api/store/affiliate/eligibility');
            } catch {
                this.eligibility = { signed_in: false, eligible: false, reason: 'sign_in_required' };
            } finally { this.loading = false; }
        },
        async submit() {
            this.submitting = true;
            this.error = '';
            this.success = null;
            try {
                const d = await api.post('/api/store/affiliate/apply', this.form);
                this.success = d.affiliate;
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not submit your application.';

                // Someone may have taken the code between the live check and
                // submitting — the server is the authority, so reflect that.
                if (e.payload?.reason === 'code_unavailable') {
                    this.codeState = 'taken';
                    this.codeSuggestions = e.payload.suggestions || [];
                } else if (e.status === 401 || e.status === 422) {
                    await this.loadEligibility();
                }
            } finally { this.submitting = false; }
        },
    },
};
</script>

<template>
    <div class="max-w-[700px] mx-auto px-[5%] py-12 min-h-[60vh]">
        <header class="text-center mb-10">
            <p class="font-script text-3xl text-gold">Affiliate</p>
            <h1 class="font-display text-3xl md:text-4xl tracking-widest uppercase">Apply</h1>
        </header>

        <div v-if="success" class="text-center bg-emerald-50 border border-emerald-200 p-8">
            <CheckCircle2 class="w-12 h-12 mx-auto text-emerald-600 mb-4" />
            <h2 class="font-display text-2xl mb-3">Application received</h2>
            <p class="text-sm text-black/65 mb-4">
                Thank you{{ customer?.first_name ? ', ' + customer.first_name : '' }}. We'll review your application within a couple of business days
                and email you at <strong>{{ success.email }}</strong>.
            </p>
            <!-- No code is promised before a decision is made. -->
            <p class="text-sm text-black/65">
                We've held <span class="font-mono font-semibold text-gold-dark">{{ success.code }}</span> for you.
                It goes live the moment you're approved.
            </p>
            <router-link to="/shop" class="inline-block mt-6 bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Continue shopping
            </router-link>
        </div>

        <div v-else-if="loading" class="animate-pulse space-y-3">
            <div class="h-24 bg-cream-dark/60" />
            <div class="h-40 bg-cream-dark/40" />
        </div>

        <!-- An affiliate account IS a customer account, so signing in comes first. -->
        <div v-else-if="!signedIn" class="bg-white border border-gold/15 p-8 text-center">
            <User class="w-10 h-10 mx-auto text-gold mb-4" />
            <h2 class="font-display text-xl tracking-widest uppercase mb-2">Sign in to apply</h2>
            <p class="text-sm text-black/65 mb-6 max-w-sm mx-auto">
                Your affiliate account is tied to your BLESSLUXE account — that's how you'll reach your
                dashboard and how we pay your commission.
            </p>
            <router-link
                to="/account/login?next=/affiliate/apply"
                class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors"
            >
                Sign in
            </router-link>
            <p class="text-xs text-black/55 mt-4">
                No account? <router-link to="/account/signup?next=/affiliate/apply" class="text-gold-dark underline">Create one</router-link>
            </p>
        </div>

        <!-- Already in the programme: send them where they need to go. -->
        <div v-else-if="alreadyApplied" class="bg-white border border-gold/15 p-8 text-center">
            <CheckCircle2 class="w-10 h-10 mx-auto text-emerald-600 mb-4" />
            <h2 class="font-display text-xl tracking-widest uppercase mb-2">
                {{ eligibility.existing.status === 'pending' ? 'Application received' : "You're already an affiliate" }}
            </h2>
            <p v-if="eligibility.existing.code" class="text-sm text-black/65 mb-2">
                Your code is <span class="font-mono font-semibold text-gold-dark">{{ eligibility.existing.code }}</span>.
            </p>
            <p v-if="eligibility.existing.status === 'pending'" class="text-sm text-black/55">
                We review every application by hand — usually within 1–2 business days.
                Your share code arrives with the approval email.
            </p>
            <router-link
                v-else
                :to="`/affiliate/${eligibility.existing.code}/dashboard`"
                class="inline-block mt-6 bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors"
            >
                Open your dashboard
            </router-link>
        </div>

        <form v-else @submit.prevent="submit" class="bg-white border border-gold/15 p-8 space-y-4">
            <p class="text-xs text-black/65 mb-4">
                We review every application by hand — usually within 1–2 business days.
                Once approved, you'll get a dashboard, a shareable link, and 10% on every sale.
            </p>

            <!-- We already know who they are; show it rather than ask again. -->
            <div class="bg-cream-dark/40 border border-gold/15 p-4">
                <p class="text-[10px] tracking-widest uppercase text-black/55 mb-1">Applying as</p>
                <p class="text-sm">{{ [customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email }}</p>
                <p class="text-xs text-black/55">{{ customer.email }}</p>
            </div>

            <!-- Commission has to be paid somewhere; chasing it after approval is
                 worse than asking for it now. -->
            <div
                class="border p-4"
                :class="needsAddress ? 'bg-amber-50 border-amber-300' : 'bg-cream-dark/40 border-gold/15'"
            >
                <p class="text-[10px] tracking-widest uppercase mb-1 inline-flex items-center gap-1"
                   :class="needsAddress ? 'text-amber-800' : 'text-black/55'">
                    <MapPin class="w-3 h-3" /> Payout address
                </p>
                <template v-if="needsAddress">
                    <p class="text-sm text-amber-900 mb-3">
                        <template v-if="eligibility.reason === 'address_incomplete'">
                            Your saved address is missing a recipient name or phone number — a courier needs both.
                            Add them and we can pay your commission there.
                        </template>
                        <template v-else>
                            Add an address to your account first — we need somewhere to send your commission.
                        </template>
                    </p>
                    <router-link
                        to="/account?tab=addresses"
                        class="text-[10px] tracking-widest uppercase bg-gold text-white px-4 py-2 inline-block hover:bg-gold-dark transition-colors"
                    >
                        {{ eligibility.reason === 'address_incomplete' ? 'Complete your address →' : 'Add an address →' }}
                    </router-link>
                </template>
                <template v-else>
                    <p v-for="(line, i) in addressLines" :key="i" class="text-sm text-black/75">{{ line }}</p>
                    <router-link to="/account?tab=addresses" class="text-[10px] tracking-widest uppercase text-black/45 hover:text-gold mt-2 inline-block">
                        Change
                    </router-link>
                </template>
            </div>

            <!-- Choose your own code, checked live. It's reserved the moment you
                 apply, so an "available" tick is a promise we keep. -->
            <div>
                <label class="block text-[10px] tracking-widest uppercase text-black/55 mb-2">Choose your code</label>
                <div class="relative">
                    <span class="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/35 font-mono pointer-events-none">
                        blessluxe.com/affiliate/shop/
                    </span>
                    <input
                        :value="form.code"
                        @input="onCodeInput"
                        type="text"
                        required
                        :maxlength="20"
                        placeholder="YOURNAME"
                        autocapitalize="characters"
                        autocomplete="off"
                        spellcheck="false"
                        class="w-full border px-4 py-3 font-mono uppercase tracking-wider transition-colors pl-[16.5rem] pr-12"
                        :class="{
                            'border-black/15': codeState === 'idle' || codeState === 'checking',
                            'border-emerald-500': codeState === 'available',
                            'border-red-400': codeState === 'taken',
                        }"
                    />
                    <span class="absolute right-4 top-1/2 -translate-y-1/2">
                        <LoaderCircle v-if="codeState === 'checking'" class="w-4 h-4 animate-spin text-black/30" />
                        <Check v-else-if="codeState === 'available'" class="w-4 h-4 text-emerald-600" />
                        <X v-else-if="codeState === 'taken'" class="w-4 h-4 text-red-500" />
                    </span>
                </div>

                <p v-if="codeState === 'available'" class="text-[10px] tracking-widest uppercase text-emerald-700 mt-2">
                    {{ form.code }} is yours
                </p>
                <p v-else-if="codeState === 'taken'" class="text-xs text-red-600 mt-2">{{ codeReason }}</p>
                <p v-else class="text-[10px] tracking-widest uppercase text-black/45 mt-2">
                    Letters, numbers, dashes and underscores · 3–20 characters
                </p>

                <div v-if="codeSuggestions.length" class="flex flex-wrap gap-2 mt-2">
                    <button
                        v-for="s in codeSuggestions"
                        :key="s"
                        type="button"
                        @click="useSuggestion(s)"
                        class="font-mono text-xs border border-gold/40 text-gold-dark px-3 py-1 hover:bg-gold/10 transition-colors"
                    >
                        {{ s }}
                    </button>
                </div>
            </div>

            <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

            <button
                type="submit"
                :disabled="!canSubmit"
                class="w-full bg-gold text-white py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
                <LoaderCircle v-if="submitting" class="w-4 h-4 animate-spin" />
                {{ submitting ? 'Submitting' : (needsAddress ? 'Add an address to continue' : (codeState !== 'available' ? 'Choose an available code' : 'Submit application')) }}
                <ArrowRight v-if="!submitting && canSubmit" class="w-4 h-4" />
            </button>
        </form>
    </div>
</template>
