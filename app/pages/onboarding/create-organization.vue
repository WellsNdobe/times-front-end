<script setup lang="ts">
definePageMeta({ layout: "auth", middleware: "auth" })

import { ref, onMounted } from "vue"
import { organizationsApi } from "~/api/organizationsApi"
import { toUiError, type UiError } from "~/utils/errorMessages"

const name = ref("")
const loading = ref(false)
const error = ref<UiError | null>(null)

onMounted(async () => {
  try {
    const orgs = await organizationsApi.getMine()
    if (orgs?.length) await navigateTo("/dashboard")
  } catch {
    // No orgs or error – stay on create-organization
  }
})

async function onSubmit() {
  error.value = null
  loading.value = true
  try {
    await organizationsApi.create({ name: name.value.trim() })
    await navigateTo("/dashboard")
  } catch (e) {
    console.error("Create organization error:", e)
    error.value = toUiError(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth">
    <div class="card">
      <h1>Create your organization</h1>
      <p class="muted">You need an organization to use Times. Create one to continue.</p>

      <form @submit.prevent="onSubmit" class="form">
        <label>
          Organization name
          <input v-model.trim="name" type="text" autocomplete="organization" required />
        </label>

        <div v-if="error" class="alert" role="alert" aria-live="polite">
          <div class="alert__title">{{ error.title }}</div>
          <div class="alert__msg">{{ error.message }}</div>
        </div>

        <button class="btn btn-primary" type="submit" :disabled="loading">
          {{ loading ? "Creating…" : "Create organization" }}
        </button>
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
  border: 1px solid var(--border, rgba(0, 0, 0, 0.12));
  border-radius: 12px;
  padding: var(--s-6);
  background: var(--surface, #fff);
}
h1 {
  margin: 0 0 var(--s-2);
  font-size: 1.4rem;
}
.muted {
  margin: 0 0 var(--s-5);
  opacity: 0.75;
}
.form {
  display: grid;
  gap: var(--s-4);
}
label {
  display: grid;
  gap: var(--s-2);
  font-size: 0.95rem;
}
input {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.18));
  outline: none;
}
input:focus {
  border-color: rgba(0, 0, 0, 0.35);
}
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
