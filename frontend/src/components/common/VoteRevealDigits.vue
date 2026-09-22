<template>
  <div class="vote-reveal-digits">
    <div
      v-for="(d, i) in display"
      :key="i"
      class="digit-slot"
      :class="{ rolling: rollingFlags[i], settled: settledFlags[i] }"
    >
      <div class="digit-reel">
        <span class="digit-num">{{ d }}</span>
      </div>
      <span class="digit-gloss" />
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
const settledFlags = ref<boolean[]>(Array.from({ length }, () => false))
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
  settledFlags.value[index] = false
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
  const total = 14
  const decel = () => {
    const next = [...display.value]
    if (count >= total) {
      next[index] = target
      display.value = next
      rollingFlags.value[index] = false
      settledFlags.value[index] = true
      window.setTimeout(() => { settledFlags.value[index] = false }, 900)
      return
    }
    next[index] = Math.floor(Math.random() * 10)
    display.value = next
    count++
    window.setTimeout(decel, 50 + count * 32)
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
.vote-reveal-digits {
  display: inline-flex;
  gap: 6px;
  padding: 6px;
  border-radius: 12px;
  background: radial-gradient(circle at 50% 0%, rgba(255, 215, 0, 0.12), rgba(0, 0, 0, 0) 70%);
}
.digit-slot {
  position: relative;
  width: 42px;
  height: 58px;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(180deg, #232b47 0%, #10162a 55%, #05070f 100%);
  border: 1px solid rgba(255, 215, 0, 0.28);
  box-shadow:
    inset 0 2px 6px rgba(0, 0, 0, 0.7),
    inset 0 -2px 6px rgba(0, 0, 0, 0.5),
    0 2px 10px rgba(0, 0, 0, 0.35);
}
.digit-reel {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.digit-num {
  font-size: 34px;
  font-weight: 900;
  line-height: 1;
  color: #ffe066;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.55), 0 1px 0 rgba(0, 0, 0, 0.6);
}
.digit-gloss {
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 42%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0));
  pointer-events: none;
}
/* 滚动中：轻微模糊 + 上下抖动，模拟转轮 */
.digit-slot.rolling .digit-num {
  opacity: 0.9;
  filter: blur(0.5px);
  animation: reelSpin 0.14s linear infinite;
}
@keyframes reelSpin {
  0% { transform: translateY(-9%); }
  50% { transform: translateY(9%); }
  100% { transform: translateY(-9%); }
}
/* 锁定：金色闪光 + 回弹 */
.digit-slot.settled {
  animation: lockPop 0.5s cubic-bezier(0.2, 1.6, 0.4, 1);
}
.digit-slot.settled::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, rgba(255, 215, 0, 0.65), rgba(255, 215, 0, 0) 70%);
  animation: lockFlash 0.8s ease-out forwards;
  pointer-events: none;
}
.digit-slot.settled .digit-num { color: #fff; text-shadow: 0 0 16px rgba(255, 215, 0, 0.95); }
@keyframes lockPop {
  0% { transform: scale(1.25); }
  60% { transform: scale(0.94); }
  100% { transform: scale(1); }
}
@keyframes lockFlash {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
</style>
