<template>
  <div class="match-answer" :class="{ disabled }">
    <div v-for="(left, li) in leftItems" :key="li" class="match-row">
      <div class="match-left">{{ left }}</div>
      <span class="match-arrow">→</span>
      <select
        class="match-select"
        :value="selected[li] ?? ''"
        :disabled="disabled"
        @change="onChange(li, $event)"
      >
        <option value="">请选择</option>
        <option
          v-for="(right, ri) in rightItems"
          :key="ri"
          :value="ri"
          :disabled="isUsedByOther(ri, li)"
        >{{ right }}</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  leftItems: string[]
  rightItems: string[]
  disabled?: boolean
}>(), {
  modelValue: '',
  disabled: false
})

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const selected = computed<Record<string, number>>(() => {
  try {
    const parsed = JSON.parse(props.modelValue || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
})

function isUsedByOther(rightIndex: number, leftIndex: number): boolean {
  return Object.entries(selected.value).some(
    ([key, value]) => Number(key) !== leftIndex && Number(value) === rightIndex
  )
}

function onChange(leftIndex: number, event: Event) {
  const raw = (event.target as HTMLSelectElement).value
  const next: Record<string, number> = { ...selected.value }
  if (raw === '') delete next[leftIndex]
  else next[leftIndex] = Number(raw)
  emit('update:modelValue', JSON.stringify(next))
}
</script>

<style scoped>
.match-answer { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.match-row { display: flex; align-items: center; gap: 10px; }
.match-left { flex: 1; min-width: 0; padding: 10px 12px; background: #17112a; border: 1px solid #b39bff22; border-radius: 8px; color: #ece7fb; font-size: 14px; word-break: break-word; }
.match-arrow { color: #b39bff; font-size: 16px; flex-shrink: 0; }
.match-select { flex: 1; min-width: 0; padding: 10px 12px; background: #17112a; border: 1px solid #b39bff33; border-radius: 8px; color: #ece7fb; font-size: 14px; outline: none; cursor: pointer; }
.match-select:focus { border-color: #b39bff; }
.match-select:disabled { opacity: 0.4; cursor: not-allowed; }
.match-answer.disabled { opacity: 0.6; }
@media (max-width: 480px) {
  .match-row { flex-direction: column; align-items: stretch; }
  .match-arrow { text-align: center; }
}
</style>
