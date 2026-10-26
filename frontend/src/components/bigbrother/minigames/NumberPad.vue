<template>
  <div class="number-pad">
    <div class="np-total" :class="{ zero: value === 0 }">{{ value }}</div>
    <div class="np-buttons">
      <button class="np-btn" @click="add(100)">+100</button>
      <button class="np-btn" @click="add(10)">+10</button>
      <button class="np-btn" @click="add(5)">+5</button>
      <button class="np-btn" @click="add(1)">+1</button>
      <button class="np-btn np-reset" @click="reset">重置为0</button>
    </div>
    <button class="np-confirm" :disabled="disabled" @click="confirm">
      {{ confirmText }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number
  disabled?: boolean
  confirmText?: string
  min?: number
  max?: number
}>(), {
  disabled: false,
  confirmText: '确定',
  min: 0,
  max: 999999
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void
  (e: 'submit', v: number): void
}>()

const value = computed(() => Number(props.modelValue) || 0)

function add(n: number) {
  if (props.disabled) return
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, value.value + n)))
}
function reset() {
  if (props.disabled) return
  emit('update:modelValue', 0)
}
function confirm() {
  if (props.disabled) return
  emit('submit', value.value)
}
</script>

<style scoped>
.number-pad { display: flex; flex-direction: column; gap: 12px; }
.np-total { font-size: 40px; font-weight: 700; color: #b39bff; text-align: center; background: #17112a; border: 1px solid #b39bff33; border-radius: 10px; padding: 10px; letter-spacing: 2px; }
.np-total.zero { color: #556; }
.np-buttons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.np-btn { padding: 14px 0; font-size: 18px; font-weight: 600; border: 1px solid #b39bff44; border-radius: 8px; background: #17112a44; color: #b39bff; cursor: pointer; transition: all 0.15s; }
.np-btn:hover { background: #b39bff22; }
.np-reset { grid-column: span 1; border-color: #e6c98844; color: #e6c988; }
.np-reset:hover { background: #e6c98822; }
.np-confirm { padding: 14px; font-size: 16px; font-weight: 700; border: 1px solid #b39bff; border-radius: 8px; background: #b39bff33; color: #b39bff; cursor: pointer; }
.np-confirm:hover:not(:disabled) { background: #b39bff55; }
.np-confirm:disabled { opacity: 0.4; cursor: not-allowed; }
@media (max-width: 480px) {
  .np-total { font-size: 32px; padding: 8px; }
  .np-buttons { gap: 6px; }
}
</style>
