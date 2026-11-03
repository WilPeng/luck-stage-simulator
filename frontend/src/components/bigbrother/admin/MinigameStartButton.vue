<template>
  <div class="msb-wrap">
    <button type="button" class="msb-main" :disabled="disabled" @click.stop="open = !open">
      {{ label }}
    </button>
    <div v-if="open" class="msb-menu" @click.stop>
      <button type="button" class="msb-item" @click="choose(10)">⏱ 10 秒倒计时开始</button>
      <button type="button" class="msb-item" @click="choose(30)">⏱ 30 秒倒计时开始</button>
      <button type="button" class="msb-item" @click="choose(0)">⚡ 直接开始</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

withDefaults(defineProps<{ label?: string; disabled?: boolean }>(), {
  label: '▶ 开始比赛',
  disabled: false
})
const emit = defineEmits<{ (e: 'start', countdownSeconds: number): void }>()

const open = ref(false)

function choose(countdownSeconds: number) {
  open.value = false
  emit('start', countdownSeconds)
}

function onDocClick() {
  open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<style scoped>
.msb-wrap { position: relative; display: inline-block; }
.msb-main { background: #b39bff22; border: 1px solid #b39bff; color: #b39bff; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.msb-main:hover:not(:disabled) { background: #b39bff33; }
.msb-main:disabled { opacity: 0.5; cursor: not-allowed; }
.msb-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 100; min-width: 180px; padding: 6px; background: #221640; border: 1px solid #b39bff55; border-radius: 8px; box-shadow: 0 8px 24px #00000066; display: flex; flex-direction: column; gap: 4px; }
.msb-item { text-align: left; background: transparent; border: none; color: #cfc4ea; padding: 9px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; white-space: nowrap; }
.msb-item:hover { background: #b39bff22; color: #ece7fb; }
</style>
