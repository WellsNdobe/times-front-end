<script setup lang="ts">
definePageMeta({ layout: "auth", middleware: "guest" })

import { computed, ref } from "vue"

const { register } = useAuth()

const firstName = ref("")
const lastName = ref("")
const email = ref("")
const password = ref("")
const confirm = ref("")
const organizationName = ref("")

const step = ref<1 | 2>(1)
const registerLoading = ref(false)
const error = ref<string | null>(null)

const accountReady = computed(
  () =>
    firstName.value.trim() &&
    lastName.value.trim() &&
    email.value.trim() &&
    password.value &&
    confirm.value
)

async function onCreateAccount() {
  error.value = null

  if (password.value !== confirm.value) {
    error.value = "Passwords do not match."
    return
  }

  step.value = 2
}

async function onCompleteRegistration() {
  error.value = null
  registerLoading.value = true
  try {
    await register(
      email.value,
      password.value,
      firstName.value,
      lastName.value,
      organizationName.value.trim()
    )
  } catch (e: any) {
    error.value = e?.data || e?.data?.message || e?.message || "Unable to complete registration."
  } finally {
    registerLoading.value = false
  }
}
</script>

<template>
  <div class="register-shell">
    <aside class="register-marketing">
      <h1>
        Automate your <span>Timesheets</span>
      </h1>
      <p class="quote">
        "Times has made our weekly submissions painless. Our team tracks time faster, and managers can approve with confidence."
      </p>
      <p class="quote-author">Daniel Ndobe <em>Invoke Solutions</em></p>

      <div class="trusted">
        <p>Trusted by</p>
        <div class="logos">
          <span>Invoke Solutions</span>
        </div>
      </div>
    </aside>

    <section class="card">
      <div class="tabs" role="tablist" aria-label="Registration steps">
        <button class="tab" :class="{ 'tab--active': step === 1 }" type="button" role="tab" :aria-selected="step === 1">
          1. Account
        </button>
        <button class="tab" :class="{ 'tab--active': step === 2 }" type="button" role="tab" :aria-selected="step === 2">
          2. Organization
        </button>
      </div>

      <form v-if="step === 1" @submit.prevent="onCreateAccount" class="form" aria-label="Create account form">
        <h2>Create your account</h2>
        <p class="muted">Start your free setup in less than a minute.</p>

        <label>
          First name
          <input v-model.trim="firstName" type="text" autocomplete="given-name" required />
        </label>

        <label>
          Last name
          <input v-model.trim="lastName" type="text" autocomplete="family-name" required />
        </label>

        <label>
          Email
          <input v-model.trim="email" type="email" autocomplete="email" required />
        </label>

        <label>
          Password
          <input v-model="password" type="password" autocomplete="new-password" minlength="8" required />
        </label>

        <label>
          Confirm password
          <input v-model="confirm" type="password" autocomplete="new-password" minlength="8" required />
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <button class="btn" type="submit" :disabled="!accountReady">
          Next
        </button>

        <p class="muted small">
          Already have an account?
          <NuxtLink to="/login">Sign in</NuxtLink>
        </p>
      </form>

      <form v-else @submit.prevent="onCompleteRegistration" class="form" aria-label="Create organization form">
        <h2>Create your organization</h2>
        <p class="muted">Set up your workspace. You can invite your team later.</p>

        <label>
          Organization name
          <input v-model.trim="organizationName" type="text" autocomplete="organization" required />
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <button class="btn" type="submit" :disabled="registerLoading || !organizationName.trim()">
          {{ registerLoading ? "Creating workspace..." : "Finish setup" }}
        </button>
      </form>

      <p class="form-logo">TIMES</p>
    </section>
  </div>
</template>

<style scoped>
.register-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr min(520px, 100%);
  background: radial-gradient(circle at 1px 1px, rgba(12, 29, 54, 0.08) 1px, transparent 0);
  background-size: 26px 26px;
}

.register-marketing {
  padding: clamp(2rem, 6vw, 6rem);
  display: grid;
  gap: 1.5rem;
  align-content: center;
}

.register-marketing h1 {
  margin: 0;
  font-size: clamp(2rem, 3vw, 3.2rem);
  line-height: 1.1;
}

.register-marketing h1 span {
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

.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.tab {
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.14));
  border-radius: 999px;
  background: #fff;
  color: var(--text-2, #475467);
  font-weight: 600;
}

.tab--active {
  border-color: #1f73b7;
  background: rgba(31, 115, 183, 0.1);
  color: #184f7b;
}

.form {
  display: grid;
  gap: 0.9rem;
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

.error {
  margin: 0;
  color: #b42318;
}

.form-logo {
  margin: 1.25rem 0 0;
  text-align: center;
  letter-spacing: 0.2em;
  font-weight: 800;
  color: #183b56;
}

@media (max-width: 980px) {
  .register-shell {
    grid-template-columns: 1fr;
    gap: 1.25rem;
    padding: 1rem;
  }

  .register-marketing {
    padding: 1rem;
    align-content: start;
  }
}
</style>
