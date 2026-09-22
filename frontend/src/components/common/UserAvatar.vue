<template>
  <img v-if="src" :src="src" :alt="name || ''" class="ua-img" />
  <span v-else class="ua-icon">{{ icon }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getAvatarUrl } from '../../services/api'

const props = defineProps<{ name?: string; avatar?: string }>()
const src = computed(() => getAvatarUrl(props.avatar))
const icon = computed(() => {
  const n = (props.name || '').trim()
  return n ? n.slice(0, 1) : '👤'
})
</script>

<style scoped>
.ua-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }
.ua-icon { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-weight: 700; }
</style>
