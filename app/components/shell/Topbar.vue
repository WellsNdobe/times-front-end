<template>
  <header class="topbar">
    <!-- Mobile hamburger -->
    <button class="icon-btn" @click="$emit('open-mobile')" aria-label="Open navigation">
      ☰
    </button>

    <div class="topbar__title">{{ title }}</div>

    <div class="topbar__actions">
      <button class="btn btn-secondary">My Profile</button>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  title: string
}>()

defineEmits<{
  (e: 'open-mobile'): void
}>()
</script>

<style scoped>
/* Topbar only in main column */
.topbar {
  grid-area: topbar;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--s-4);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.topbar__title {
  font-weight: 700;
  color: var(--text-1);
}

/* Reuse icon-btn styling */
.icon-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 8px;
  border-radius: var(--r-sm);
}
.icon-btn:hover {
  background: var(--surface-2);
}
</style>
