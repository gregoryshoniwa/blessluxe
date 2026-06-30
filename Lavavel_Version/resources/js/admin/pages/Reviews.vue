<script>
import { api } from '../../lib/api.js';
import IconButton from '../components/IconButton.vue';
import { Check, X, MessageSquareReply } from 'lucide-vue-next';

export default {
    name: 'AdminReviews',
    components: { IconButton, Check, X, MessageSquareReply },
    data() {
        return {
            reviews: [], pagination: null, loading: true,
            statusFilter: '', q: '', page: 1,
            replying: null, response: '',
            saving: false, error: '',
        };
    },
    mounted() { this.fetchAll(); },
    methods: {
        async fetchAll() {
            this.loading = true;
            try {
                const params = new URLSearchParams({ page: this.page, limit: 25 });
                if (this.q) params.set('q', this.q);
                if (this.statusFilter) params.set('status', this.statusFilter);
                const data = await api.get(`/api/admin/reviews?${params}`);
                this.reviews = data.reviews || [];
                this.pagination = data.pagination;
            } finally { this.loading = false; }
        },
        async setStatus(r, status) {
            try {
                await api.put(`/api/admin/reviews/${r.id}`, { status });
                r.status = status;
            } catch (e) { alert(e.payload?.error || 'Could not update.'); }
        },
        startReply(r) {
            this.replying = r; this.response = r.admin_response || ''; this.error = '';
        },
        cancelReply() { this.replying = null; },
        async saveReply() {
            this.saving = true; this.error = '';
            try {
                await api.put(`/api/admin/reviews/${this.replying.id}`, { admin_response: this.response });
                this.replying.admin_response = this.response;
                this.cancelReply();
            } catch (e) {
                this.error = e.payload?.error || 'Could not save reply.';
            } finally { this.saving = false; }
        },
    },
};
</script>

<template>
    <div>
        <header class="flex items-center justify-between mb-8">
            <div>
                <p class="text-xs tracking-widest uppercase text-zinc-500">Moderation</p>
                <h1 class="text-2xl font-semibold">Reviews</h1>
            </div>
        </header>

        <div class="mb-4 flex gap-2 items-center">
            <input v-model="q" @keyup.enter="page = 1; fetchAll()" placeholder="Search title, content or email…" class="border border-zinc-300 px-3 py-2 text-sm w-72" />
            <select v-model="statusFilter" @change="page = 1; fetchAll()" class="border border-zinc-300 px-3 py-2 text-sm">
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
            </select>
            <button @click="page = 1; fetchAll()" class="border border-zinc-300 px-4 py-2 text-xs tracking-widest uppercase hover:bg-zinc-100">Search</button>
        </div>

        <div v-if="replying" class="bg-white border border-gold/30 p-5 mb-6">
            <h2 class="font-semibold mb-1">Reply to {{ replying.customer_name || replying.customer_email }}</h2>
            <p class="text-xs text-zinc-500 mb-3 italic">"{{ replying.content }}"</p>
            <textarea v-model="response" rows="3" class="w-full border border-zinc-300 px-3 py-2" placeholder="Your response…"></textarea>
            <p v-if="error" class="text-sm text-red-600 mt-3">{{ error }}</p>
            <div class="flex justify-end gap-2 mt-4">
                <button @click="cancelReply" class="px-4 py-2 text-xs tracking-widest uppercase text-zinc-600">Cancel</button>
                <button @click="saveReply" :disabled="saving" class="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark disabled:opacity-50">
                    {{ saving ? 'Saving…' : 'Save Reply' }}
                </button>
            </div>
        </div>

        <div class="bg-white border border-zinc-200">
            <table class="w-full text-sm">
                <thead class="bg-zinc-50 text-xs tracking-widest uppercase text-zinc-500">
                    <tr>
                        <th class="px-5 py-3 text-left">Product</th>
                        <th class="px-5 py-3 text-left">Rating</th>
                        <th class="px-5 py-3 text-left">Customer</th>
                        <th class="px-5 py-3 text-left">Review</th>
                        <th class="px-5 py-3 text-left">Status</th>
                        <th class="px-5 py-3"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">Loading…</td></tr>
                    <tr v-else-if="!reviews.length"><td colspan="6" class="px-5 py-8 text-center text-zinc-400">No reviews match.</td></tr>
                    <tr v-for="r in reviews" :key="r.id" class="border-t border-zinc-100">
                        <td class="px-5 py-3 text-xs">{{ r.product_title }}</td>
                        <td class="px-5 py-3">{{ '★'.repeat(r.rating) }}<span class="text-zinc-300">{{ '★'.repeat(5 - r.rating) }}</span></td>
                        <td class="px-5 py-3 text-xs">{{ r.customer_name || r.customer_email || '—' }}</td>
                        <td class="px-5 py-3">
                            <p class="font-medium text-xs">{{ r.title }}</p>
                            <p class="text-xs text-zinc-600 line-clamp-2">{{ r.content }}</p>
                            <p v-if="r.admin_response" class="text-xs text-gold-dark mt-1 italic">↪ {{ r.admin_response }}</p>
                        </td>
                        <td class="px-5 py-3">
                            <span :class="['text-xs px-2 py-0.5 rounded', {
                                'bg-amber-100 text-amber-700': r.status === 'pending',
                                'bg-emerald-100 text-emerald-700': r.status === 'approved',
                                'bg-red-100 text-red-700': r.status === 'rejected',
                            }]">{{ r.status }}</span>
                        </td>
                        <td class="px-5 py-3 text-right">
                            <div class="inline-flex items-center gap-1">
                                <IconButton v-if="r.status !== 'approved'" label="Approve review" tone="positive" @click="setStatus(r, 'approved')">
                                    <Check class="w-4 h-4" />
                                </IconButton>
                                <IconButton v-if="r.status !== 'rejected'" label="Reject review" tone="danger" @click="setStatus(r, 'rejected')">
                                    <X class="w-4 h-4" />
                                </IconButton>
                                <IconButton label="Reply" @click="startReply(r)">
                                    <MessageSquareReply class="w-4 h-4" />
                                </IconButton>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-if="pagination && pagination.last_page > 1" class="flex items-center justify-between mt-4 text-sm">
            <p class="text-zinc-500">Page {{ pagination.page }} of {{ pagination.last_page }} · {{ pagination.total }} reviews</p>
            <div class="flex gap-2">
                <button :disabled="pagination.page <= 1" @click="page--; fetchAll()" class="border border-zinc-300 px-3 py-1 disabled:opacity-40">Prev</button>
                <button :disabled="pagination.page >= pagination.last_page" @click="page++; fetchAll()" class="border border-zinc-300 px-3 py-1 disabled:opacity-40">Next</button>
            </div>
        </div>
    </div>
</template>
