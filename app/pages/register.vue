<template>
  <div class="auth">
    <div class="card">
      <h1>Create account</h1>
      <p class="muted">Enter your details to get started.</p>

      <form @submit.prevent="onSubmit" class="form">
        <label>
          Name
          <input v-model.trim="name" type="text" autocomplete="name" required />
        </label>

        <label>
          Email
          <input v-model.trim="email" type="email" autocomplete="email" required />
        </label>

        <label>
          Password
          <input
              v-model="password"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
          />
        </label>

        <label>
          Confirm password
          <input
              v-model="confirm"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
          />
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <button class="btn" type="submit" :disabled="loading">
          {{ loading ? "Creating..." : "Create account" }}
        </button>

        <p class="muted small">
          Already have an account?
          <NuxtLink to="/login">Sign in</NuxtLink>
        </p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
//definePageMeta({ middleware: "guest", layout: "default" });

import { ref } from "vue";
//const { register } = useAuth();

const name = ref("");
const email = ref("");
const password = ref("");
const confirm = ref("");
const loading = ref(false);
const error = ref<string | null>(null);

async function onSubmit() {
  error.value = null;

  if (password.value !== confirm.value) {
    error.value = "Passwords do not match.";
    return;
  }

  loading.value = true;
  try {
    //await register(name.value, email.value, password.value);
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || "Unable to register.";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
/* reuse same styles as login */
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
