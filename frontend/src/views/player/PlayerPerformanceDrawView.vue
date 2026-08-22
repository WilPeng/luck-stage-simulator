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

    <!-- 已抽取结果（选手不可重新抽取，需管理员代改） -->
    <div v-else-if="myValue !== null" class="result-card">
      <div class="result-icon">✨</div>
      <div class="result-title">你的发挥值</div>
      <div class="result-value" :class="valueClass">{{ myValue }}</div>
      <div class="result-text">{{ resultText }}</div>
    </div>

    <!-- 抽取面板 -->
    <div v-else class="draw-panel">
      <div class="mode-tabs">
        <span class="mode-label">{{ modeLabel }}</span>
      </div>

      <!-- 老虎机模式：纯随机 -->
      <div v-if="mode === 'random'" class="slot-machine">
        <div class="slot-display">{{ displayValue }}</div>
        <t-button
          theme="primary"
          size="large"
          :loading="drawing"
          :disabled="drawing"
          @click="doDraw"
        >
          {{ drawing ? '抽取中...' : '开始抽取' }}
        </t-button>
        <p class="hint">纯随机抽取，结果完全看运气</p>
      </div>

      <!-- 指针模式：横向长条指针快速左右移动（中心最高20，两端-10） -->
      <div v-else-if="mode === 'pointer'" class="pointer-mode">
        <div class="pointer-track-wrap">
          <!-- 刻度标签 -->
          <div class="track-labels">
            <span class="track-label end">-10</span>
            <span class="track-label mid">20</span>
            <span class="track-label end">-10</span>
          </div>
          <!-- 长条轨道 -->
          <div class="pointer-track" @click="stopPointer">
            <!-- 中轴与刻度线 -->
            <div class="track-line"></div>
            <div class="track-mid-marker"></div>
            <!-- 指针 -->
            <div class="track-pointer" :style="{ left: pointerPos + '%' }">
              <div class="pointer-head"></div>
            </div>
          </div>
        </div>
        <div class="pointer-value" :class="pointerValueClass">{{ displayValue }}</div>
        <div class="pointer-tip" v-if="pointerRunning">指针快速移动中，点击轨道或按钮停止锁定结果！</div>
        <t-button
          v-if="!pointerRunning"
          theme="primary"
          size="large"
          @click="startPointer"
        >
          开始移动
        </t-button>
        <t-button
          v-else
          theme="danger"
          size="large"
          @click="stopPointer"
        >
          🛑 停止
        </t-button>
        <p class="hint">指针移动飞快，越靠近中心发挥值越高，在合适位置点击停止</p>
      </div>

      <!-- 手速模式：限定时间内连击 -->
      <div v-else-if="mode === 'speed'" class="speed-mode">
        <div class="speed-status">
          <span class="speed-time">⏱️ {{ speedRemaining }}s</span>
          <span class="speed-count">👆 {{ speedClicks }} 次</span>
        </div>
        <div class="speed-tip" v-if="!speedRunning">
          限时 {{ SPEED_DURATION }} 秒疯狂点击，点击越多发挥值越高！
        </div>
        <div class="speed-tip active" v-else>快点击！时间还剩 {{ speedRemaining.toFixed(1) }} 秒</div>
        <t-button
          v-if="!speedRunning"
          theme="primary"
          size="large"
          @click="startSpeed"
        >
          🚀 开始手速挑战
        </t-button>
        <div v-else class="speed-hit-zone" @click="addSpeedClick">
          <span class="hit-icon">👆</span>
          <span class="hit-text">点我！</span>
        </div>
      </div>

      <!-- 策略模式：3 个风险档位 -->
      <div v-else-if="mode === 'strategy'" class="strategy-mode">
        <div class="strategy-tip">
          🧠 选择你的策略档位，结果在该档位范围内随机（高回报高风险）
        </div>
        <div class="strategy-cards">
          <div
            v-for="tier in strategyTiers"
            :key="tier.key"
            class="strategy-card"
            :class="{ selected: selectedTier === tier.key }"
            @click="selectTier(tier.key)"
          >
            <span class="tier-icon">{{ tier.icon }}</span>
            <span class="tier-name">{{ tier.name }}</span>
            <span class="tier-range">{{ tier.rangeText }}</span>
            <span class="tier-risk" :class="tier.risk">{{ tier.riskText }}</span>
          </div>
        </div>
        <t-button
          theme="primary"
          size="large"
          :disabled="!selectedTier"
          @click="confirmStrategy"
        >
          确认选择并抽取
        </t-button>
      </div>

      <!-- 反应力模式：等待变灯后点击 -->
      <div v-else class="reflex-mode">
        <div class="reflex-stage" :class="reflexStage" @click="handleReflexClick">
          <div class="reflex-icon">{{ reflexIcon }}</div>
          <div class="reflex-text">{{ reflexText }}</div>
        </div>
        <t-button
          v-if="reflexStage === 'idle'"
          theme="primary"
          size="large"
          @click="startReflex"
        >
          🔴 开始反应测试
        </t-button>
        <t-button
          v-else-if="reflexStage === 'ready'"
          theme="success"
          size="large"
          @click="handleReflexClick"
        >
          点这里（变绿后点击）！
        </t-button>
      </div>

      <p class="hint">发挥值将用于公演结算，范围 -10 ~ 20</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useAuthStore } from '../../stores/authStore'
import { getPlayerPerformanceStatus, savePerformancePlayerStatus, getPerformanceRoundStatus, getConcurrentReleaseStatus } from '../../services/api'

const route = useRoute()
const authStore = useAuthStore()

const currentRound = computed(() => parseInt(route.params.round as string, 10) || 1)
const mode = ref<'random' | 'pointer' | 'speed' | 'strategy' | 'reflex'>('random')
const drawing = ref(false)
const displayValue = ref(0)
const myValue = ref<number | null>(null)
const isReleased = ref(false)

const slotValues = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
let slotTimer: number | undefined
let pointerFrame = 0
const pointerRunning = ref(false)
let pointerPos = 50             // 指针位置（0-100%，0=最左，100=最右）
let pointerDir = 1              // 指针移动方向（1=向右，-1=向左）
let lastFrameTime = 0

// 指针位置（0-100%）→ 发挥值：抛物线，中心(50%)最高20，两端(0/100%)最低-10
function posToValue(pos: number): number {
  const ratio = pos / 100                        // 0 ~ 1
  const centerDist = Math.abs(ratio - 0.5) * 2   // 0(中心) ~ 1(两端)
  const value = 20 - 30 * centerDist * centerDist
  return Math.max(-10, Math.min(20, Math.round(value)))
}

const pointerValueClass = computed(() => {
  const v = displayValue.value
  if (v >= 10) return 'high'
  if (v >= 0) return 'good'
  return 'low'
})

// ===== 手速模式 =====
const SPEED_DURATION = 10
const speedRunning = ref(false)
const speedClicks = ref(0)
const speedRemaining = ref(SPEED_DURATION)
let speedTimer: number | undefined

// ===== 策略模式 =====
const strategyTiers = [
  { key: 'safe', icon: '🛡️', name: '稳健', rangeText: '-5 ~ +8', risk: 'low', riskText: '低风险' },
  { key: 'balanced', icon: '⚖️', name: '均衡', rangeText: '-8 ~ +12', risk: 'mid', riskText: '中风险' },
  { key: 'gamble', icon: '🎰', name: '豪赌', rangeText: '-10 ~ +20', risk: 'high', riskText: '高风险高回报' }
]
const selectedTier = ref<string | null>(null)

// ===== 反应力模式 =====
const reflexStage = ref<'idle' | 'waiting' | 'ready' | 'done'>('idle')
let reflexTimer: number | undefined
let reflexStartTime = 0
let reflexResultMs = 0

const modeLabel = computed(() => {
  const map: Record<string, string> = {
    random: '🎰 随机老虎机（纯随机）',
    pointer: '🎯 摆动指针（反应与时机）',
    speed: '⚡ 手速挑战（快速连击）',
    strategy: '🧠 策略抉择（风险权衡）',
    reflex: '🔴 反应力测试（变灯点击）'
  }
  return map[mode.value] || mode.value
})

const reflexIcon = computed(() => {
  const map: Record<string, string> = { idle: '🔴', waiting: '🟡', ready: '🟢', done: '✅' }
  return map[reflexStage.value]
})

const reflexText = computed(() => {
  const map: Record<string, string> = {
    idle: '点击开始，等待变绿',
    waiting: '等待变绿...',
    ready: '快点击！',
    done: `反应 ${reflexResultMs}ms`
  }
  return map[reflexStage.value]
})

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

// 指针模式：指针在横向长条上高速往返移动（约 0.25 秒一个来回，飞快）
function startPointer() {
  if (pointerRunning.value) return
  pointerRunning.value = true
  pointerPos = 50
  pointerDir = 1
  lastFrameTime = performance.now()
  displayValue.value = posToValue(50)

  const speed = 400            // 百分比/秒（非常快：0→100% 仅 0.25 秒）
  const step = (now: number) => {
    const dt = (now - lastFrameTime) / 1000
    lastFrameTime = now
    pointerPos += pointerDir * speed * dt
    if (pointerPos >= 100) {
      pointerPos = 100
      pointerDir = -1
    } else if (pointerPos <= 0) {
      pointerPos = 0
      pointerDir = 1
    }
    displayValue.value = posToValue(pointerPos)
    if (pointerRunning.value) {
      pointerFrame = requestAnimationFrame(step)
    }
  }
  pointerFrame = requestAnimationFrame(step)
}

// 停止指针：锁定当前位置（离中心距离）对应的发挥值并保存
function stopPointer() {
  if (!pointerRunning.value) return
  pointerRunning.value = false
  if (pointerFrame) cancelAnimationFrame(pointerFrame)
  const finalValue = posToValue(pointerPos)
  displayValue.value = finalValue
  finishDraw(finalValue)
}

// ===== 手速模式：限时连击，次数映射发挥值 =====
function startSpeed() {
  if (speedRunning.value) return
  speedRunning.value = true
  speedClicks.value = 0
  speedRemaining.value = SPEED_DURATION
  speedTimer = window.setInterval(() => {
    speedRemaining.value -= 0.1
    if (speedRemaining.value <= 0) {
      if (speedTimer) window.clearInterval(speedTimer)
      speedRunning.value = false
      finishSpeed()
    }
  }, 100)
}

function addSpeedClick() {
  if (!speedRunning.value) return
  speedClicks.value++
}

function finishSpeed() {
  // 点击次数 → 发挥值：每 3 次 +1，最高 +20，加少量随机抖动
  const base = Math.min(Math.floor(speedClicks.value / 3), 20)
  const value = Math.max(-10, Math.min(20, base + Math.floor(Math.random() * 3) - 1))
  finishDraw(value)
}

// ===== 策略模式：选择档位后在该范围随机 =====
function selectTier(key: string) {
  selectedTier.value = key
}

function confirmStrategy() {
  if (!selectedTier.value) return
  const tier = strategyTiers.find(t => t.key === selectedTier.value)
  if (!tier) return
  // 解析范围 [min, max]
  const [min, max] = tier.rangeText.split('~').map(s => parseInt(s.trim(), 10))
  const value = Math.floor(Math.random() * (max - min + 1)) + min
  finishDraw(value)
}

// ===== 反应力模式：等待随机变绿后点击，越快区间越高 =====
function startReflex() {
  reflexStage.value = 'waiting'
  const delay = 1000 + Math.random() * 3000
  reflexTimer = window.setTimeout(() => {
    reflexStage.value = 'ready'
    reflexStartTime = performance.now()
  }, delay)
}

function handleReflexClick() {
  if (reflexStage.value === 'waiting') {
    // 提前点击 = 抢跑，惩罚
    if (reflexTimer) window.clearTimeout(reflexTimer)
    reflexStage.value = 'done'
    const value = Math.max(-10, Math.floor(Math.random() * 11) - 10)  // -10 ~ 0
    finishDraw(value)
    return
  }
  if (reflexStage.value === 'ready') {
    reflexResultMs = Math.round(performance.now() - reflexStartTime)
    reflexStage.value = 'done'
    // 反应越快区间越高：<300ms → 10~20；<600ms → 0~15；<1000ms → -5~10；否则 -10~5
    let min = -10, max = 5
    if (reflexResultMs < 300) { min = 10; max = 20 }
    else if (reflexResultMs < 600) { min = 0; max = 15 }
    else if (reflexResultMs < 1000) { min = -5; max = 10 }
    const value = Math.floor(Math.random() * (max - min + 1)) + min
    finishDraw(value)
  }
}

async function finishDraw(value: number) {
  drawing.value = false
  pointerRunning.value = false
  if (pointerFrame) cancelAnimationFrame(pointerFrame)
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

onBeforeUnmount(() => {
  if (slotTimer) window.clearInterval(slotTimer)
  if (pointerFrame) cancelAnimationFrame(pointerFrame)
  if (speedTimer) window.clearInterval(speedTimer)
  if (reflexTimer) window.clearTimeout(reflexTimer)
})

onMounted(async () => {
  try {
    const roundId = `round-${currentRound.value}`
    // 读取释放状态与抽取方式（由管理员端设定）
    const [release, roundStatus] = await Promise.all([
      getConcurrentReleaseStatus(roundId).catch(() => null),
      getPerformanceRoundStatus(roundId).catch(() => null)
    ])
    isReleased.value = !!release?.performanceReleased
    const validModes = ['random', 'pointer', 'speed', 'strategy', 'reflex']
    if (roundStatus?.generationMode && validModes.includes(roundStatus.generationMode)) {
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

  .pointer-track-wrap {
    width: 100%;
    max-width: 420px;
  }

  // 刻度标签（两端-10，中心20）
  .track-labels {
    display: flex;
    justify-content: space-between;
    padding: 0 4px;
    margin-bottom: 6px;

    .track-label {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-secondary);

      &.mid {
        color: #0052d9;
        font-size: 15px;
      }
    }
  }

  // 长条轨道
  .pointer-track {
    position: relative;
    width: 100%;
    height: 56px;
    background: linear-gradient(to right, #ff6b6b 0%, #f39c12 25%, #2ba471 50%, #f39c12 75%, #ff6b6b 100%);
    border-radius: 12px;
    border: 2px solid var(--border-color);
    box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    overflow: hidden;
    user-select: none;
  }

  .track-line {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 2px;
    background: rgba(255, 255, 255, 0.4);
    transform: translateY(-50%);
  }

  .track-mid-marker {
    position: absolute;
    top: 0;
    left: 50%;
    width: 2px;
    height: 100%;
    background: rgba(255, 255, 255, 0.7);
    transform: translateX(-50%);
  }

  // 指针（在轨道上左右移动）
  .track-pointer {
    position: absolute;
    top: 0;
    width: 0;
    height: 100%;
    transform: translateX(-50%);
    z-index: 2;
    transition: none;

    .pointer-head {
      position: absolute;
      top: -4px;
      left: -8px;
      width: 16px;
      height: 64px;
      background: linear-gradient(to bottom, #e74c3c, #ff6b6b);
      border: 2px solid #fff;
      border-radius: 6px;
      box-shadow: 0 0 8px rgba(231, 76, 60, 0.7);
    }
  }

  .pointer-value {
    font-size: 48px;
    font-weight: 800;
    min-width: 80px;
    text-align: center;

    &.high { color: #2ba471; }
    &.good { color: #0052d9; }
    &.low { color: #e74c3c; }
  }

  .pointer-tip {
    font-size: 13px;
    color: #e74c3c;
    font-weight: 700;
  }
}

.hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
}

// ===== 手速模式 =====
.speed-mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;

  .speed-status {
    display: flex;
    gap: 24px;
    font-size: 20px;
    font-weight: 700;

    .speed-time { color: #f39c12; }
    .speed-count { color: #0052d9; }
  }

  .speed-tip {
    font-size: 13px;
    color: var(--text-secondary);

    &.active {
      color: #e74c3c;
      font-weight: 600;
      font-size: 16px;
    }
  }

  .speed-hit-zone {
    width: 220px;
    height: 180px;
    border-radius: 16px;
    background: linear-gradient(135deg, #ff6b6b, #ee5a24);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    transition: transform 0.05s;

    &:active {
      transform: scale(0.95);
    }

    .hit-icon {
      font-size: 56px;
    }

    .hit-text {
      font-size: 20px;
      font-weight: 800;
      color: #fff;
    }
  }
}

// ===== 策略模式 =====
.strategy-mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;

  .strategy-tip {
    font-size: 13px;
    color: var(--text-secondary);
    text-align: center;
  }

  .strategy-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    width: 100%;
  }

  .strategy-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px 10px;
    background: var(--bg-primary);
    border: 2px solid var(--border-color);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;

    &.selected {
      border-color: #0052d9;
      background: rgba(0, 82, 217, 0.08);
      transform: translateY(-2px);
    }

    .tier-icon {
      font-size: 32px;
    }

    .tier-name {
      font-size: 15px;
      font-weight: 700;
    }

    .tier-range {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .tier-risk {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 8px;

      &.low { background: rgba(39, 174, 96, 0.15); color: #27ae60; }
      &.mid { background: rgba(243, 156, 18, 0.15); color: #f39c12; }
      &.high { background: rgba(231, 76, 60, 0.15); color: #e74c3c; }
    }
  }
}

// ===== 反应力模式 =====
.reflex-mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;

  .reflex-stage {
    width: 240px;
    height: 180px;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;

    &.idle { background: rgba(231, 76, 60, 0.15); border: 2px solid #e74c3c; }
    &.waiting { background: rgba(243, 156, 18, 0.15); border: 2px solid #f39c12; }
    &.ready { background: rgba(39, 174, 96, 0.2); border: 2px solid #27ae60; }
    &.done { background: rgba(52, 152, 219, 0.15); border: 2px solid #3498db; }

    .reflex-icon {
      font-size: 48px;
    }

    .reflex-text {
      font-size: 14px;
      font-weight: 600;
    }
  }
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
