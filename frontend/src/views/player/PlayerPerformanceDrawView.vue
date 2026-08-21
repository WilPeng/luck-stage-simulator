<template>
  <div class="player-draw">
    <div class="page-header">
      <h1>🎲 抽取发挥值</h1>
      <p class="subtitle">第{{ currentRound }}公演 · 抽取你的公演发挥值（-10 ~ 20）</p>
    </div>

    <!-- 未开放 -->
    <div v-if="!isReleased" class="locked-panel">
      <div class="locked-icon">🔒</div>
      <h3>发挥值抽取尚未开放</h3>
      <p>请等待管理员在并发行动中心开放"发挥值抽取"</p>
    </div>

    <!-- 已抽取结果 -->
    <div v-else-if="myValue !== null" class="result-card">
      <div class="result-icon">✨</div>
      <div class="result-title">你的发挥值</div>
      <div class="result-value" :class="valueClass">{{ myValue }}</div>
      <div class="result-text">{{ resultText }}</div>
      <t-button variant="outline" size="small" @click="resetDraw">重新抽取</t-button>
    </div>

    <!-- 抽取面板 -->
    <div v-else class="draw-panel">
      <div class="mode-tabs">
        <span class="mode-label">抽取方式：{{ mode === 'random' ? '🎰 随机老虎机' : '🎯 摆动指针' }}</span>
      </div>

      <!-- 老虎机模式 -->
      <div v-if="mode === 'random'" class="slot-machine">
        <div class="slot-display">{{ displayValue }}</div>
        <t-button theme="primary" size="large" :loading="drawing" @click="doDraw">
          {{ drawing ? '抽取中...' : '开始抽取' }}
        </t-button>
      </div>

      <!-- 指针模式 -->
      <div v-else class="pointer-mode">
        <div class="pointer-scale">
          <div class="pointer-tick" v-for="v in pointerValues" :key="v" :class="{ active: displayValue === v }">
            {{ v }}
          </div>
        </div>
        <t-button theme="primary" size="large" :loading="pointerRunning" @click="togglePointer">
          {{ pointerRunning ? '停止' : '开始摆动' }}
        </t-button>
      </div>

      <p class="hint">发挥值将用于公演结算，范围 -10 ~ 20</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useAuthStore } from '../../stores/authStore'
import { getPlayerPerformanceStatus, savePerformancePlayerStatus, getPerformanceRoundStatus, getConcurrentReleaseStatus } from '../../services/api'

const route = useRoute()
const authStore = useAuthStore()

const currentRound = computed(() => parseInt(route.params.round as string, 10) || 1)
const mode = ref<'random' | 'pointer'>('random')
const drawing = ref(false)
const displayValue = ref(0)
const myValue = ref<number | null>(null)
const isReleased = ref(false)

const slotValues = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
const pointerValues = [-10, -5, 0, 5, 10, 15, 20]
let slotTimer: number | undefined
let pointerFrame = 0
let pointerRunning = ref(false)

const resultText = computed(() => {
  if (myValue.value === null) return ''
  const v = myValue.value
  if (v >= 15) return '超常发挥！'
  if (v >= 5) return '发挥出色'
  if (v >= -2) return '发挥正常'
  if (v >= -7) return '略有失误'
  return '发挥失常'
})

const valueClass = computed(() => {
  const v = myValue.value ?? 0
  if (v >= 10) return 'high'
  if (v >= 0) return 'good'
  return 'low'
})

function doDraw() {
  if (drawing.value) return
  drawing.value = true
  let count = 0
  slotTimer = window.setInterval(() => {
    displayValue.value = slotValues[Math.floor(Math.random() * slotValues.length)]
    count++
    if (count >= 20) {
      if (slotTimer) window.clearInterval(slotTimer)
      finishDraw(displayValue.value)
    }
  }, 80)
}

function togglePointer() {
  if (pointerRunning.value) {
    pointerRunning.value = false
    if (pointerFrame) cancelAnimationFrame(pointerFrame)
    finishDraw(displayValue.value)
    return
  }
  pointerRunning.value = true
  const step = () => {
    displayValue.value = pointerValues[Math.floor(Math.random() * pointerValues.length)]
    pointerFrame = requestAnimationFrame(step)
  }
  pointerFrame = requestAnimationFrame(step)
}

async function finishDraw(value: number) {
  drawing.value = false
  pointerRunning.value = false
  myValue.value = value
  try {
    await savePerformancePlayerStatus(`round-${currentRound.value}`, [
      { playerId: authStore.currentUser?.id || '', performanceValue: value }
    ])
    MessagePlugin.success(`已保存发挥值 ${value}`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '保存失败')
  }
}

function resetDraw() {
  myValue.value = null
  displayValue.value = 0
}

onMounted(async () => {
  try {
    const roundId = `round-${currentRound.value}`
    // 读取释放状态与抽取方式（由管理员端设定）
    const [release, roundStatus] = await Promise.all([
      getConcurrentReleaseStatus(roundId).catch(() => null),
      getPerformanceRoundStatus(roundId).catch(() => null)
    ])
    isReleased.value = !!release?.performanceReleased
    if (roundStatus?.generationMode === 'random' || roundStatus?.generationMode === 'pointer') {
      mode.value = roundStatus.generationMode
    }
    if (!isReleased.value) return
    const status = await getPlayerPerformanceStatus(roundId)
    const me = status?.players?.find(p => p.playerId === authStore.currentUser?.id)
    if (me?.generated && me.performanceValue !== null) {
      myValue.value = me.performanceValue
    }
  } catch {
    // ignore
  }
})
</script>

<style lang="scss" scoped>
.player-draw {
  padding: 16px;
  min-height: 100%;
}

.page-header {
  margin-bottom: 20px;

  h1 {
    margin: 0 0 6px;
    font-size: 22px;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0;
    font-size: 13px;
    color: var(--text-secondary);
  }
}

.draw-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  max-width: 520px;
  margin: 0 auto;
}

.mode-tabs {
  width: 100%;
  display: flex;
  justify-content: center;

  .mode-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
  }
}

.locked-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 520px;
  margin: 0 auto;
  text-align: center;

  .locked-icon {
    font-size: 48px;
  }

  h3 {
    font-size: 18px;
    margin: 0;
  }

  p {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
  }
}

.slot-machine {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;

  .slot-display {
    font-size: 72px;
    font-weight: 800;
    color: #0052d9;
    min-width: 120px;
    text-align: center;
  }
}

.pointer-mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;

  .pointer-scale {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;

    .pointer-tick {
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      font-size: 14px;
      font-weight: 600;

      &.active {
        background: #0052d9;
        color: #fff;
        border-color: #0052d9;
      }
    }
  }
}

.hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
}

.result-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 420px;
  margin: 0 auto;

  .result-icon {
    font-size: 40px;
  }

  .result-title {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .result-value {
    font-size: 64px;
    font-weight: 800;

    &.high {
      color: #2ba471;
    }

    &.good {
      color: #0052d9;
    }

    &.low {
      color: #e74c3c;
    }
  }

  .result-text {
    font-size: 14px;
    color: var(--text-primary);
    margin-bottom: 8px;
  }
}
</style>
