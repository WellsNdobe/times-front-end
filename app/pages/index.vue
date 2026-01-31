<script setup lang="ts">
const { isAuthed } = useAuth()

if (isAuthed.value) {
  await navigateTo('/dashboard')
} else {
  await navigateTo('/login')
}
</script>

<template>
  <div />
</template>
