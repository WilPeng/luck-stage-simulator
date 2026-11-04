<template>
  <div v-if="url" class="media-player">
    <div v-if="label" class="mp-label">{{ label }}</div>
    <video
      v-if="kind === 'video'"
      :src="url"
      class="mp-el"
      controls
      preload="metadata"
      playsinline
      :autoplay="autoplay"
    ></video>
    <audio
      v-else
      :src="url"
      class="mp-el"
      controls
      preload="metadata"
      :autoplay="autoplay"
    ></audio>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface MediaInfo {
  url?: string
  kind?: 'audio' | 'video'
  name?: string
  playMode?: 'once' | 'free'
}

const props = withDefaults(defineProps<{
  media?: MediaInfo | null
  label?: string
  autoplay?: boolean
}>(), {
  media: null,
  label: '',
  autoplay: false
})

const url = computed(() => {
  const u = props.media?.url || ''
  if (!u) return ''
  if (/^https?:\/\//.test(u)) return u
  const base = ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || '/api'
  const root = base.replace(/\/api$/, '')
  return `${root}${u.startsWith('/') ? '' : '/'}${u}`
})

const kind = computed(() => props.media?.kind === 'video' ? 'video' : 'audio')
</script>

<style scoped>
.media-player { display: flex; flex-direction: column; gap: 6px; margin: 10px 0; }
.mp-label { font-size: 12px; color: #e6c988; word-break: break-all; }
.mp-el { width: 100%; max-height: 320px; border-radius: 8px; background: #000; }
audio.mp-el { background: transparent; }
</style>
