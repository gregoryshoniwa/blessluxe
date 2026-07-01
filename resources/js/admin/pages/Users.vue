<script>
import { api } from '../../lib/api.js';

export default {
    name: 'AdminUsers',
    data() {
        return {
            users: [],
            loading: true,
            error: '',
            editing: null,
            form: this.blank(),
            busy: false,
        };
    },
    async mounted() { await this.load(); },
    methods: {
        blank() { return { name: '', email: '', password: '', role: 'admin', is_active: true }; },
        async load() {
            this.loading = true;
            this.error = '';
            try {
                const r = await api.get('/api/admin/users');
                this.users = r.users || [];
            } catch (e) {
                this.error = e.payload?.error || 'Could not load users.';
            } finally {
                this.loading = false;
            }
        },
        startAdd() { this.editing = 'new'; this.form = this.blank(); },
        startEdit(u) {
            this.editing = u.id;
            this.form = { name: u.name, email: u.email, password: '', role: u.role, is_active: u.is_active };
        },
        cancel() { this.editing = null; },
        async save() {
            this.busy = true;
            this.error = '';
            try {
                const payload = { ...this.form };
                if (this.editing !== 'new' && !payload.password) delete payload.password;
                if (this.editing === 'new') await api.post('/api/admin/users', payload);
                else await api.put(`/api/admin/users/${this.editing}`, payload);
                this.editing = null;
                await this.load();
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not save user.';
            } finally {
                this.busy = false;
            }
        },
        async remove(u) {
            if (!confirm(`Delete admin user ${u.email}?`)) return;
            try {
                await api.del(`/api/admin/users/${u.id}`);
                await this.load();
            } catch (e) {
                alert(e.payload?.error || 'Could not delete user.');
            }
        },
    },
};
</script>

<template>
    <div class="px-8 py-8 max-w-[1100px]">
        <header class="mb-6 flex items-end justify-between">
            <div>
                <h1 class="text-3xl font-serif">Admin users</h1>
                <p class="text-sm text-zinc-500 mt-1">Manage who can access the BLESSLUXE admin.</p>
            </div>
            <button v-if="!editing" @click="startAdd" class="bg-black text-white px-5 py-2 text-xs tracking-widest uppercase hover:bg-gold transition-colors">
                + Add user
            </button>
        </header>

        <p v-if="error" class="mb-4 p-3 bg-red-50 border border-red-200 text-sm text-red-700">{{ error }}</p>

        <form v-if="editing" @submit.prevent="save" class="bg-zinc-50 border border-zinc-200 p-5 mb-6 space-y-3">
            <h2 class="text-sm tracking-widest uppercase">{{ editing === 'new' ? 'New user' : 'Edit user' }}</h2>
            <div class="grid grid-cols-2 gap-3">
                <input v-model="form.name" placeholder="Full name" required class="border border-zinc-300 px-3 py-2 text-sm" />
                <input v-model="form.email" type="email" placeholder="Email" required class="border border-zinc-300 px-3 py-2 text-sm" />
                <input v-model="form.password" type="password" :placeholder="editing === 'new' ? 'Password (min 8)' : 'New password (blank to keep)'" :required="editing === 'new'" minlength="8" class="border border-zinc-300 px-3 py-2 text-sm" />
                <select v-model="form.role" class="border border-zinc-300 px-3 py-2 text-sm bg-white">
                    <option value="admin">Admin (full access)</option>
                    <option value="staff">Staff (view-only — reserved)</option>
                </select>
            </div>
            <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" v-model="form.is_active" /> Active (can sign in)
            </label>
            <div class="flex gap-2">
                <button type="submit" :disabled="busy" class="bg-black text-white px-5 py-2 text-xs tracking-widest uppercase hover:bg-gold disabled:opacity-50">
                    {{ busy ? 'Saving…' : 'Save user' }}
                </button>
                <button type="button" @click="cancel" class="px-5 py-2 text-xs tracking-widest uppercase text-zinc-500 hover:text-black">Cancel</button>
            </div>
        </form>

        <div v-if="loading" class="text-sm text-zinc-500">Loading…</div>
        <table v-else class="w-full text-sm bg-white border border-zinc-200">
            <thead class="text-[10px] tracking-widest uppercase text-zinc-500">
                <tr class="border-b border-zinc-200">
                    <th class="py-2 px-3 text-left">Name</th>
                    <th class="py-2 px-3 text-left">Email</th>
                    <th class="py-2 px-3 text-left">Role</th>
                    <th class="py-2 px-3 text-left">Active</th>
                    <th class="py-2 px-3"></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="u in users" :key="u.id" class="border-b border-zinc-100">
                    <td class="py-2 px-3">{{ u.name }}</td>
                    <td class="py-2 px-3 font-mono text-xs">{{ u.email }}</td>
                    <td class="py-2 px-3 capitalize">{{ u.role }}</td>
                    <td class="py-2 px-3">
                        <span :class="['text-[10px] tracking-widest uppercase px-2 py-0.5', u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500']">
                            {{ u.is_active ? 'Yes' : 'No' }}
                        </span>
                    </td>
                    <td class="py-2 px-3 text-right space-x-3">
                        <button @click="startEdit(u)" class="text-xs tracking-widest uppercase text-zinc-600 hover:text-black">Edit</button>
                        <button @click="remove(u)" class="text-xs tracking-widest uppercase text-zinc-400 hover:text-red-600">Delete</button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>
