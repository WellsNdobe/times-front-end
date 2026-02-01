<script setup lang="ts">
definePageMeta({ layout: "auth", middleware: "guest" })

import { ref } from "vue"
import { toUiError, type UiError } from "~/utils/errorMessages"

const { login } = useAuth()

const email = ref("")
const password = ref("")
const loading = ref(false)
const error = ref<UiError | null>(null)

async function onSubmit() {
  error.value = null
  loading.value = true
  try {
    await login(email.value, password.value)
  } catch (e) {
    console.error("Login error:", e) // dev-only detail
    error.value = toUiError(e)
  } finally {
    loading.value = false
  }
}
</script>

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
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>

        <div v-if="error" class="alert" role="alert" aria-live="polite">
          <div class="alert__title">{{ error.title }}</div>
          <div class="alert__msg">{{ error.message }}</div>
        </div>

        <button class="btn btn-primary" type="submit" :disabled="loading">
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
.alert {
  border: 1px solid var(--danger);
  background: var(--danger-soft);
  border-radius: var(--r-sm);
  padding: var(--s-3);
}
.alert__title {
  font-weight: 700;
  margin-bottom: 4px;
}
.alert__msg {
  color: var(--text-2);
}

</style>
