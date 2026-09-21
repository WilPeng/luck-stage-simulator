<template>
  <div class="vote-reveal-digits">
    <div
      v-for="(d, i) in display"
      :key="i"
      class="digit-slot"
      :class="{ rolling: rollingFlags[i] }"
    >
      <span class="digit-num">{{ d }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{
  votes: number
  reveal?: Record<string, boolean>
  digits?: number
}>()

const positions = ['hundreds', 'tens', 'units']
const length = props.digits ?? 3

const display = ref<number[]>(Array.from({ length }, () => Math.floor(Math.random() * 10)))
const rollingFlags = ref<boolean[]>(Array.from({ length }, () => true))
const intervals: (number | undefined)[] = Array.from({ length }, () => undefined)

function targetDigit(index: number): number {
  const s = String(Math.max(0, Math.floor(props.votes || 0))).padStart(length, '0')
  return Number(s[index] || '0')
}

function isRevealed(index: number): boolean {
  const pos = positions[index]
  return !!(props.reveal && props.reveal[pos])
}

function roll(index: number) {
  rollingFlags.value[index] = true
  if (intervals[index]) return
  intervals[index] = window.setInterval(() => {
    const next = [...display.value]
    next[index] = Math.floor(Math.random() * 10)
    display.value = next
  }, 70)
}

function stop(index: number) {
  if (intervals[index]) {
    clearInterval(intervals[index])
    intervals[index] = undefined
  }
  const target = targetDigit(index)
  let count = 0
  const total = 12
  const decel = () => {
    const next = [...display.value]
    if (count >= total) {
      next[index] = target
      display.value = next
      rollingFlags.value[index] = false
      return
    }
    next[index] = Math.floor(Math.random() * 10)
    display.value = next
    count++
    window.setTimeout(decel, 55 + count * 30)
  }
  decel()
}

onMounted(() => {
  for (let i = 0; i < length; i++) {
    if (isRevealed(i)) {
      const next = [...display.value]
      next[i] = targetDigit(i)
      display.value = next
      rollingFlags.value[i] = false
    } else {
      roll(i)
    }
  }
})

watch(() => props.reveal, () => {
  for (let i = 0; i < length; i++) {
    if (isRevealed(i) && rollingFlags.value[i]) stop(i)
  }
}, { deep: true })

onBeforeUnmount(() => {
  intervals.forEach(t => { if (t) clearInterval(t) })
})
</script>

<style scoped>
.vote-reveal-digits { display: inline-flex; gap: 6px; }
.digit-slot {
  width: 44px; height: 60px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 10px;
  background: linear-gradient(180deg, #1f2740, #0e1320);
  border: 1px solid rgba(255, 215, 0, 0.25);
  box-shadow: inset 0 0 12px rgba(255, 215, 0, 0.08);
  overflow: hidden;
}
.digit-slot .digit-num {
  font-size: 34px; font-weight: 900;
  color: #ffd700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.digit-slot.rolling .digit-num { opacity: 0.85; filter: blur(0.4px); }
</style>
