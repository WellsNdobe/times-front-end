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
    console.error("Login error:", e)
    error.value = toUiError(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-shell">
    <aside class="login-marketing">
      <h1>
        Automate your <span>Timesheets</span>
      </h1>
      <p class="quote">
        "Times has made our weekly submissions painless. Our team tracks time faster, and managers can approve with confidence."
      </p>
      <p class="quote-author">Daniel Ndobe <em>Invoke Solutions</em></p>

      <div class="trusted">
        <p>Trusted by world-class companies</p>
        <div class="logos">
          <span>Manpower</span>
          <span>TypeFox</span>
          <span>Invoke Solutions</span>
          <span>IMPARTNER</span>
        </div>
      </div>
    </aside>

    <section class="card">
      <h2>Sign in</h2>
      <p class="muted">Welcome back. Continue to your workspace.</p>

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

        <button class="btn" type="submit" :disabled="loading">
          {{ loading ? "Signing in..." : "Sign in" }}
        </button>

        <p class="muted small">
          Don't have an account?
          <NuxtLink to="/register">Create one</NuxtLink>
        </p>
      </form>

      <p class="form-logo">TIMES</p>
    </section>
  </div>
</template>

<style scoped>
.login-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr min(520px, 100%);
  background: radial-gradient(circle at 1px 1px, rgba(12, 29, 54, 0.08) 1px, transparent 0);
  background-size: 26px 26px;
}

.login-marketing {
  padding: clamp(2rem, 6vw, 6rem);
  display: grid;
  gap: 1.5rem;
  align-content: center;
}

.login-marketing h1 {
  margin: 0;
  font-size: clamp(2rem, 3vw, 3.2rem);
  line-height: 1.1;
}

.login-marketing h1 span {
  color: #2ca876;
}

.quote {
  margin: 0;
  max-width: 40ch;
  font-size: 1.15rem;
  color: var(--text, #0f172a);
}

.quote-author {
  margin: 0;
  font-weight: 700;
}

.quote-author em {
  display: block;
  font-weight: 500;
  font-style: italic;
  color: var(--text-2, #475467);
}

.trusted {
  margin-top: 2rem;
  color: var(--text-2, #475467);
}

.logos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
  font-weight: 700;
}

.card {
  align-self: center;
  justify-self: center;
  width: min(520px, calc(100% - 2rem));
  border: 1px solid var(--border, rgba(0, 0, 0, 0.12));
  border-radius: 16px;
  padding: 1.5rem;
  background: var(--surface, #fff);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.1);
}

h2 {
  margin: 0;
}

.muted {
  margin: 0;
  color: var(--text-2, #475467);
}

.small {
  margin-top: 0.25rem;
  font-size: 0.95rem;
}

.form {
  margin-top: 1rem;
  display: grid;
  gap: 0.9rem;
}

label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.95rem;
  font-weight: 600;
}

input {
  padding: 0.68rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.16));
  outline: none;
}

input:focus {
  border-color: #5aa2d8;
  box-shadow: 0 0 0 3px rgba(90, 162, 216, 0.2);
}

.btn {
  margin-top: 0.35rem;
  padding: 0.7rem 0.8rem;
  border-radius: 10px;
  border: 0;
  background: #76add4;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.alert {
  border: 1px solid #f0c3bf;
  background: #fff3f2;
  border-radius: 10px;
  padding: 0.7rem;
}

.alert__title {
  font-weight: 700;
  margin-bottom: 4px;
  color: #b42318;
}

.alert__msg {
  color: #5f2b25;
}

.form-logo {
  margin: 1.25rem 0 0;
  text-align: center;
  letter-spacing: 0.2em;
  font-weight: 800;
  color: #183b56;
}

@media (max-width: 980px) {
  .login-shell {
    grid-template-columns: 1fr;
    gap: 1.25rem;
    padding: 1rem;
  }

  .login-marketing {
    padding: 1rem;
    align-content: start;
  }
}
</style>
