<script setup lang="ts">
definePageMeta({ middleware: ["auth", "require-organization"] })
</script>

<template>
  <section class="card" style="padding: var(--s-5);">
    <h1 style="margin: 0 0 var(--s-3) 0;">Team</h1>
    <p style="margin: 0; color: var(--text-2);">Team members will be listed here.</p>
  </section>
</template>
