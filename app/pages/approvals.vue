<script setup lang="ts">
definePageMeta({ middleware: ["auth", "require-organization"] })
</script>

<template>
  <section class="card" style="padding: var(--s-5);">
    <h1 style="margin: 0 0 var(--s-3) 0;">Approvals</h1>
    <p style="margin: 0; color: var(--text-2);">Timesheet approvals will go here.</p>
  </section>
</template>
