<template>
  <label
    class="bb-upload-box"
    :class="{ dragging, busy }"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <input type="file" :accept="accept" hidden :disabled="busy" @change="onChange" />
    <span class="ub-icon">{{ busy ? '⏳' : icon }}</span>
    <span class="ub-label">{{ busy ? busyText : label }}</span>
    <span v-if="hint && !busy" class="ub-hint">{{ hint }}</span>
  </label>
</template>

<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{
  accept?: string
  label?: string
  hint?: string
  icon?: string
  busy?: boolean
  busyText?: string
}>(), {
  accept: 'image/*',
  label: '点击或拖拽上传',
  hint: '',
  icon: '📁',
  busy: false,
  busyText: '上传中…'
})

const emit = defineEmits<{ (e: 'file', file: File): void }>()

const dragging = ref(false)

function pick(file: File | null | undefined) {
  if (!file) return
  emit('file', file)
}

function onChange(e: Event) {
  const input = e.target as HTMLInputElement
  pick(input.files && input.files[0])
  input.value = ''
}

function onDrop(e: DragEvent) {
  dragging.value = false
  pick(e.dataTransfer?.files && e.dataTransfer.files[0])
}
</script>

<style scoped>
.bb-upload-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 22px 16px;
  border: 2px dashed #00ff8855;
  border-radius: 12px;
  background: #0a1a10;
  color: #cfe3ff;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}
.bb-upload-box:hover, .bb-upload-box.dragging { border-color: #00ff88; background: #00ff8810; }
.bb-upload-box.busy { opacity: 0.7; cursor: progress; }
.ub-icon { font-size: 28px; }
.ub-label { font-size: 14px; font-weight: 600; color: #00ff88; }
.ub-hint { font-size: 12px; color: #8a8aa5; }
</style>
