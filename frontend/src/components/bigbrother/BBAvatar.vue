<template>
  <div class="bb-avatar" :class="[sizeClass, { clickable: !!clickable }]" @click="$emit('click')">
    <img v-if="avatarUrl" :src="avatarUrl" :alt="name" class="avatar-img" @error="onError" />
    <span v-else class="avatar-fallback">{{ name?.[0] || '?' }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { bbGetAvatarUrl } from '../../services/bbApi'

const props = withDefaults(defineProps<{
  name: string
  avatar?: string | null
  size?: 'sm' | 'md' | 'lg'
  clickable?: boolean
}>(), { size: 'md' })

defineEmits<{ click: [] }>()

const imgError = ref(false)
const avatarUrl = computed(() => {
  if (imgError.value) return undefined
  return bbGetAvatarUrl(props.avatar)
})

const sizeClass = computed(() => `size-${props.size}`)

function onError() {
  imgError.value = true
}
</script>

<style scoped>
.bb-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; overflow: hidden; flex-shrink: 0;
  background: linear-gradient(135deg, #00ff88, #00cc66);
}
.bb-avatar.clickable { cursor: pointer; }
.bb-avatar.size-sm { width: 28px; height: 28px; min-width: 28px; }
.bb-avatar.size-sm .avatar-fallback { font-size: 11px; }
.bb-avatar.size-md { width: 36px; height: 36px; min-width: 36px; }
.bb-avatar.size-md .avatar-fallback { font-size: 14px; }
.bb-avatar.size-lg { width: 48px; height: 48px; min-width: 48px; }
.bb-avatar.size-lg .avatar-fallback { font-size: 18px; }
.avatar-img { width: 100%; height: 100%; object-fit: cover; }
.avatar-fallback { color: #1a1a3e; font-weight: 600; user-select: none; }
</style>
