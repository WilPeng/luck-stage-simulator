<template>
  <div class="lv-avatar" :class="[sizeClass, { clickable: !!clickable }]" @click="$emit('click')">
    <img v-if="avatarUrl" :src="avatarUrl" :alt="name" class="avatar-img" @error="onError" />
    <span v-else class="avatar-fallback">{{ name?.[0] || '?' }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { lvGetAvatarUrl } from '../../services/lovevarietyApi'

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
  return lvGetAvatarUrl(props.avatar)
})

const sizeClass = computed(() => `size-${props.size}`)

function onError() {
  imgError.value = true
}
</script>

<style scoped>
.lv-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; overflow: hidden; flex-shrink: 0;
  background: linear-gradient(135deg, #ff69b4, #ff1493);
}
.lv-avatar.clickable { cursor: pointer; }
.lv-avatar.size-sm { width: 28px; height: 28px; min-width: 28px; }
.lv-avatar.size-sm .avatar-fallback { font-size: 11px; }
.lv-avatar.size-md { width: 36px; height: 36px; min-width: 36px; }
.lv-avatar.size-md .avatar-fallback { font-size: 14px; }
.lv-avatar.size-lg { width: 48px; height: 48px; min-width: 48px; }
.lv-avatar.size-lg .avatar-fallback { font-size: 18px; }
.avatar-img { width: 100%; height: 100%; object-fit: cover; }
.avatar-fallback { color: #fff; font-weight: 600; user-select: none; }
</style>
