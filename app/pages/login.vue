<template>
  <div class="auth">
    <div class="card">
      <h1>Sign in</h1>
      <p class="muted">Welcome back. Please enter your details.</p>

      <form @submit.prevent="onSubmit" class="form">
        <label>
          Email
          <input v-model.trim="email" type="email" autocomplete="email" required />
        </label>

        <label>
          Password
          <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              required
          />
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <button class="btn" type="submit" :disabled="loading">
          {{ loading ? "Signing in..." : "Sign in" }}
        </button>

        <p class="muted small">
          Don’t have an account?
          <NuxtLink to="/register">Create one</NuxtLink>
        </p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
//definePageMeta({ middleware: "guest", layout: "default" }); // change layout if you want a blank auth layout

import { ref } from "vue";
//const { login } = useAuth();

const email = ref("");
const password = ref("");
const loading = ref(false);
const error = ref<string | null>(null);

async function onSubmit() {
  error.value = null;
  loading.value = true;
  try {
    //await login(email.value, password.value);
  } catch (e: any) {
    // Nuxt $fetch errors usually have e.data?.message
    error.value = e?.data?.message || e?.message || "Unable to sign in.";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth {
  min-height: calc(100vh - 56px);
  display: grid;
  place-items: center;
  padding: var(--s-6);
}

.card {
  width: min(420px, 100%);
  border: 1px solid var(--border, rgba(0,0,0,.12));
  border-radius: 12px;
  padding: var(--s-6);
  background: var(--surface, #fff);
}

h1 { margin: 0 0 var(--s-2); font-size: 1.4rem; }
.muted { margin: 0 0 var(--s-5); opacity: 0.75; }
.small { margin-top: var(--s-4); font-size: 0.95rem; }

.form { display: grid; gap: var(--s-4); }

label { display: grid; gap: var(--s-2); font-size: 0.95rem; }
input {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border, rgba(0,0,0,.18));
  outline: none;
}
input:focus { border-color: rgba(0,0,0,.35); }

.btn {
  padding: 10px 12px;
  border-radius: 10px;
  border: 0;
  cursor: pointer;
  font-weight: 600;
}

.error { color: #b42318; margin: 0; }
</style>
