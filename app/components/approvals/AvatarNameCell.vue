<script setup lang="ts">
const props = defineProps<{
    name: string
    subtitle?: string
}>()

const initials = computed(() => {
    const parts = props.name.split(" ").filter(Boolean)
    if (!parts.length) return "?"
    return parts
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("")
})
</script>

<template>
    <div class="avatar-cell">
        <span class="avatar-cell__avatar" aria-hidden="true">{{ initials }}</span>
        <div class="avatar-cell__content">
            <span class="avatar-cell__name">{{ name }}</span>
            <span v-if="subtitle" class="avatar-cell__subtitle">{{ subtitle }}</span>
        </div>
    </div>
</template>

<style scoped>
.avatar-cell {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    min-width: 0;
}

.avatar-cell__avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    background: linear-gradient(135deg, var(--primary-soft), #fce7dc);
    color: var(--text-1);
    font-size: 0.8rem;
    font-weight: 700;
    border: 1px solid rgba(15, 118, 110, 0.12);
}

.avatar-cell__content {
    min-width: 0;
    display: grid;
    gap: 2px;
}

.avatar-cell__name {
    font-weight: 700;
    color: var(--text-1);
}

.avatar-cell__subtitle {
    color: var(--text-2);
    font-size: 0.82rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
