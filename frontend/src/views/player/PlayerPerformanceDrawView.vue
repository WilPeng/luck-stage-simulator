<template>
  <div class="player-draw">
    <div class="page-header">
      <h1>🎲 抽取发挥值</h1>
      <p class="subtitle">第{{ currentRound }}公演 · 抽取你的公演发挥值（-10 ~ 20）</p>
    </div>

    <!-- 已抽取结果（选手不可重新抽取，需管理员代改） -->
    <div v-if="myValue !== null" class="result-card">
      <div class="result-icon">✨</div>
      <div class="result-title">你的发挥值</div>
      <div class="result-value" :class="valueClass">{{ myValue }}</div>
      <div class="result-text">{{ resultText }}</div>
      <p class="result-tip">本轮发挥值已生成，进入公演后将用于结算</p>
    </div>

    <!-- 未开放且未生成 -->
    <div v-else-if="!isReleased" class="locked-panel">
      <div class="locked-icon">🔒</div>
      <h3>发挥值抽取尚未开放</h3>
      <p>请等待管理员在并发行动中心开放"发挥值抽取"</p>
    </div>

    <!-- 抽取面板（未生成且已开放） -->
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

      <!-- 指针模式：完整数字刻度（-10~20）指针快速摆动 -->
      <div v-else-if="mode === 'pointer'" class="pointer-mode">
        <div class="pointer-scale" @click="stopPointer">
          <!-- 刻度 -->
          <div class="pointer-scale-track">
            <div
              v-for="v in pointerValues"
              :key="v"
              class="pointer-tick"
              :class="{ major: v % 5 === 0, active: displayValue === v }"
            >
              <span class="tick-line"></span>
              <span class="tick-label">{{ v }}</span>
            </div>
          </div>
          <!-- 指针 -->
          <div class="pointer-cursor" :style="{ left: pointerPos + '%' }">
            <div class="cursor-head"></div>
            <div class="cursor-value">{{ displayValue }}</div>
          </div>
        </div>
        <div class="pointer-tip" v-if="pointerRunning">指针快速移动中，点击轨道或按钮停止锁定结果！</div>
        <t-button
          v-if="!pointerRunning"
          theme="primary"
          size="large"
          @click="startPointer"
        >
          开始摆动
        </t-button>
        <t-button
          v-else
          theme="danger"
          size="large"
          @click="stopPointer"
        >
          🛑 停下
        </t-button>
        <p class="hint">指针在 -10 ~ 20 之间快速摆动，在合适数字出现时立刻停下</p>
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
      <div v-else-if="mode === 'reflex'" class="reflex-mode">
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

      <!-- 记忆模式：翻牌配对 -->
      <div v-else-if="mode === 'memory'" class="memory-mode">
        <div class="memory-status">
          <span>配对 {{ memoryMatched }}/{{ memoryPairs }} 对</span>
          <span>翻牌 {{ memoryFlips }} 次</span>
        </div>
        <div class="memory-tip">找出所有相同的数字配对，翻牌越少发挥值越高！</div>
        <div class="memory-grid" :class="{ ended: memoryEnded }">
          <div
            v-for="(card, idx) in memoryCards"
            :key="idx"
            class="memory-card"
            :class="{ flipped: card.flipped, matched: card.matched }"
            @click="flipMemoryCard(idx)"
          >
            <span class="card-face">{{ card.flipped || card.matched ? card.value : '?' }}</span>
          </div>
        </div>
        <t-button
          v-if="!memoryStarted"
          theme="primary"
          size="large"
          @click="startMemory"
        >
          🃏 开始记忆挑战
        </t-button>
        <t-button
          v-else-if="memoryEnded"
          theme="success"
          size="large"
          @click="finishMemory"
        >
          查看发挥值结果
        </t-button>
      </div>

      <!-- 数字炸弹模式：缩小范围猜数字 -->
      <div v-else class="bomb-mode">
        <div class="bomb-status">
          <span>范围：{{ bombLow }} ~ {{ bombHigh }}</span>
          <span>剩余 {{ bombAttempts }} 次机会</span>
        </div>
        <div class="bomb-tip" v-if="!bombEnded">每次输入一个数字，猜中炸弹则中招！范围越小发挥值越高</div>
        <div class="bomb-result" v-else>
          <span class="bomb-icon">💣</span>
          <span>炸弹藏在 {{ bombTarget }}，你用 {{ BOMB_ATTEMPTS - bombAttempts }} 次逼近</span>
        </div>
        <div class="bomb-input-row">
          <t-input-number
            v-model="bombGuess"
            :min="bombLow"
            :max="bombHigh"
            :disabled="bombEnded"
            style="width: 140px"
          />
          <t-button
            theme="primary"
            :disabled="bombEnded || bombGuess === null || bombGuess < bombLow || bombGuess > bombHigh"
            @click="submitBombGuess"
          >
            猜！
          </t-button>
        </div>
        <div class="bomb-guesses" v-if="bombGuesses.length">
          <span
            v-for="(g, i) in bombGuesses"
            :key="i"
            class="bomb-guess-tag"
            :class="{ hit: g === bombTarget }"
          >
            {{ g }}
          </span>
        </div>
        <t-button
          v-if="!bombStarted"
          theme="primary"
          size="large"
          @click="startBomb"
        >
          💣 开始数字炸弹
        </t-button>
        <t-button
          v-else-if="bombEnded"
          theme="success"
          size="large"
          @click="finishBomb"
        >
          查看发挥值结果
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
const mode = ref<'random' | 'pointer' | 'speed' | 'strategy' | 'reflex' | 'memory' | 'bomb'>('random')
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

// 指针刻度：-10 ~ 20 完整数字，均匀分布
const pointerValues = Array.from({ length: 31 }, (_, i) => i - 10)

// 指针位置（0-100%）→ 发挥值：线性映射，最左 -10，最右 20
function posToValue(pos: number): number {
  const ratio = Math.max(0, Math.min(100, pos)) / 100   // 0 ~ 1
  const value = -10 + ratio * 30
  return Math.max(-10, Math.min(20, Math.round(value)))
}

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
    reflex: '🔴 反应力测试（变灯点击）',
    memory: '🃏 记忆配对（翻牌找相同）',
    bomb: '💣 数字炸弹（缩小范围）'
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

  // 指针速度：快慢交替，反弹时随机变化，让停下时机更难预测（更灵活）
  let speed = 300            // 初始百分比/秒
  const step = (now: number) => {
    const dt = (now - lastFrameTime) / 1000
    lastFrameTime = now
    pointerPos += pointerDir * speed * dt
    if (pointerPos >= 100) {
      pointerPos = 100
      pointerDir = -1
      speed = 200 + Math.random() * 250       // 反弹后随机 200~450
    } else if (pointerPos <= 0) {
      pointerPos = 0
      pointerDir = 1
      speed = 200 + Math.random() * 250
    }
    displayValue.value = posToValue(pointerPos)
    if (pointerRunning.value) {
      pointerFrame = requestAnimationFrame(step)
    }
  }
  pointerFrame = requestAnimationFrame(step)
}

// 停止指针：锁定当前位置对应的发挥值并保存
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

// ===== 记忆模式：翻牌配对，翻牌次数越少发挥值越高 =====
const MEMORY_PAIRS = 6                       // 6 对（12 张牌）
const memoryStarted = ref(false)
const memoryEnded = ref(false)
const memoryCards = ref<{ value: number; flipped: boolean; matched: boolean }[]>([])
const memoryFlips = ref(0)
const memoryMatched = ref(0)
const memoryPairs = MEMORY_PAIRS
let firstFlipIdx: number | null = null
let memoryLock = false

function startMemory() {
  const values = Array.from({ length: MEMORY_PAIRS }, (_, i) => i)
  const deck = [...values, ...values].sort(() => Math.random() - 0.5)
  memoryCards.value = deck.map(v => ({ value: v, flipped: false, matched: false }))
  memoryStarted.value = true
  memoryEnded.value = false
  memoryFlips.value = 0
  memoryMatched.value = 0
  firstFlipIdx = null
}

function flipMemoryCard(idx: number) {
  if (memoryLock || memoryEnded.value || !memoryStarted.value) return
  const card = memoryCards.value[idx]
  if (card.flipped || card.matched) return

  card.flipped = true
  memoryFlips.value++

  if (firstFlipIdx === null) {
    firstFlipIdx = idx
    return
  }

  const second = idx
  const first = firstFlipIdx
  firstFlipIdx = null
  memoryLock = true

  if (memoryCards.value[first].value === memoryCards.value[second].value) {
    memoryCards.value[first].matched = true
    memoryCards.value[second].matched = true
    memoryMatched.value++
    memoryLock = false
    if (memoryMatched.value >= MEMORY_PAIRS) {
      memoryEnded.value = true
    }
  } else {
    setTimeout(() => {
      memoryCards.value[first].flipped = false
      memoryCards.value[second].flipped = false
      memoryLock = false
    }, 800)
  }
}

function finishMemory() {
  // 翻牌越少发挥值越高：8次内配对完为高手
  const ratio = memoryFlips.value / (MEMORY_PAIRS * 2)   // 下限 1（全部一次配中）
  let min = -10, max = 5
  if (ratio <= 1.5) { min = 10; max = 20 }
  else if (ratio <= 2) { min = 0; max = 15 }
  else if (ratio <= 2.5) { min = -5; max = 10 }
  const value = Math.floor(Math.random() * (max - min + 1)) + min
  finishDraw(value)
}

// ===== 数字炸弹模式：猜数字缩小范围，逼近越多发挥值越高 =====
const BOMB_ATTEMPTS = 8
const bombStarted = ref(false)
const bombEnded = ref(false)
const bombTarget = ref(0)
const bombLow = ref(-10)
const bombHigh = ref(20)
const bombAttempts = ref(BOMB_ATTEMPTS)
const bombGuess = ref<number | null>(null)
const bombGuesses = ref<number[]>([])

function startBomb() {
  bombStarted.value = true
  bombEnded.value = false
  bombTarget.value = Math.floor(Math.random() * 31) - 10   // -10 ~ 20
  bombLow.value = -10
  bombHigh.value = 20
  bombAttempts.value = BOMB_ATTEMPTS
  bombGuess.value = null
  bombGuesses.value = []
}

function submitBombGuess() {
  if (bombEnded.value || bombGuess.value === null) return
  const g = bombGuess.value
  if (g < bombLow.value || g > bombHigh.value) return

  bombGuesses.value.push(g)
  if (g === bombTarget.value) {
    // 猜中炸弹，中招
    bombEnded.value = true
    return
  }
  // 缩小范围
  if (g < bombTarget.value) bombLow.value = Math.max(bombLow.value, g + 1)
  else bombHigh.value = Math.min(bombHigh.value, g - 1)
  bombAttempts.value--
  bombGuess.value = null
  if (bombAttempts.value <= 0 || bombLow.value >= bombHigh.value) {
    bombEnded.value = true
  }
}

function finishBomb() {
  const narrowed = (20 - (-10)) - (bombHigh.value - bombLow.value)   // 初始31 → 当前范围差值，越大说明逼近越多
  let min = -10, max = 5
  if (narrowed >= 25) { min = 10; max = 20 }
  else if (narrowed >= 18) { min = 0; max = 15 }
  else if (narrowed >= 10) { min = -5; max = 10 }
  const value = Math.floor(Math.random() * (max - min + 1)) + min
  finishDraw(value)
}

async function finishDraw(value: number) {
  drawing.value = false
  pointerRunning.value = false
  if (pointerFrame) cancelAnimationFrame(pointerFrame)
  if (speedTimer) window.clearInterval(speedTimer)
  if (reflexTimer) window.clearTimeout(reflexTimer)
  speedRunning.value = false
  try {
    await savePerformancePlayerStatus(`round-${currentRound.value}`, [
      { playerId: authStore.currentUser?.id || '', performanceValue: value }
    ])
    // 保存成功后才锁定发挥值（一轮只能抽一次）
    myValue.value = value
    MessagePlugin.success(`已保存发挥值 ${value}，本轮不可重复抽取`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '保存失败，请重试')
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
    // 1. 先请求本轮是否已生成发挥值
    const status = await getPlayerPerformanceStatus(roundId).catch(() => null)
    const me = status?.players?.find(p => p.playerId === authStore.currentUser?.id)
    if (me?.generated && me.performanceValue !== null) {
      // 已生成：只显示发挥值，不再显示抽取界面
      myValue.value = me.performanceValue
      return
    }

    // 2. 未生成：读取释放状态与抽取方式（由管理员端设定），判断是否显示抽取界面
    const [release, roundStatus] = await Promise.all([
      getConcurrentReleaseStatus(roundId).catch(() => null),
      getPerformanceRoundStatus(roundId).catch(() => null)
    ])
    isReleased.value = !!release?.performanceReleased
    const validModes = ['random', 'pointer', 'speed', 'strategy', 'reflex', 'memory', 'bomb']
    if (roundStatus?.generationMode && validModes.includes(roundStatus.generationMode)) {
      mode.value = roundStatus.generationMode
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

  // 刻度面板（-10 ~ 20 完整数字）
  .pointer-scale {
    position: relative;
    width: 100%;
    max-width: 620px;
    margin: 8px auto 0;
    padding: 30px 12px 14px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    cursor: pointer;
    user-select: none;
  }

  .pointer-scale-track {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    height: 42px;
    position: relative;
  }

  .pointer-tick {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    min-width: 0;

    .tick-line {
      width: 1px;
      height: 8px;
      background: var(--text-muted);
      opacity: 0.5;
      transition: all 0.08s;
    }

    .tick-label {
      font-size: 9px;
      color: var(--text-tertiary);
      margin-top: 4px;
      white-space: nowrap;
      transition: all 0.08s;
    }

    &.major {
      .tick-line {
        width: 2px;
        height: 14px;
        background: var(--text-secondary);
        opacity: 0.8;
      }

      .tick-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-primary);
      }
    }

    &.active {
      .tick-line {
        width: 3px;
        height: 18px;
        background: #ffd700;
        opacity: 1;
      }

      .tick-label {
        font-size: 13px;
        font-weight: 800;
        color: #ffd700;
        transform: scale(1.25);
      }
    }
  }

  // 指针（金色）
  .pointer-cursor {
    position: absolute;
    top: 0;
    left: 0;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    transition: left 0.02s linear;
    z-index: 2;
    pointer-events: none;

    .cursor-head {
      width: 0;
      height: 0;
      border-left: 10px solid transparent;
      border-right: 10px solid transparent;
      border-top: 14px solid #ffd700;
      filter: drop-shadow(0 2px 4px rgba(255, 215, 0, 0.4));
    }

    .cursor-value {
      margin-top: 2px;
      padding: 2px 10px;
      background: rgba(255, 215, 0, 0.15);
      border: 1px solid rgba(255, 215, 0, 0.3);
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      color: #ffd700;
      min-width: 32px;
      text-align: center;
    }
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

// ===== 记忆模式 =====
.memory-mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;

  .memory-status {
    display: flex;
    gap: 24px;
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .memory-tip {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .memory-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    width: 100%;
    max-width: 360px;
    opacity: 1;
    transition: opacity 0.3s;

    &.ended {
      opacity: 0.85;
    }
  }

  .memory-card {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-primary);
    border: 2px solid var(--border-color);
    border-radius: 10px;
    cursor: pointer;
    font-size: 22px;
    font-weight: 800;
    color: var(--text-tertiary);
    transition: all 0.2s;
    user-select: none;

    &:hover:not(.flipped):not(.matched) {
      border-color: #0052d9;
      transform: translateY(-2px);
    }

    &.flipped,
    &.matched {
      background: rgba(0, 82, 217, 0.1);
      border-color: #0052d9;
      color: #0052d9;
    }

    &.matched {
      background: rgba(39, 174, 96, 0.15);
      border-color: #27ae60;
      color: #27ae60;
      cursor: default;
    }
  }
}

// ===== 数字炸弹模式 =====
.bomb-mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;

  .bomb-status {
    display: flex;
    gap: 24px;
    font-size: 16px;
    font-weight: 700;
  }

  .bomb-tip {
    font-size: 13px;
    color: var(--text-secondary);
    text-align: center;
  }

  .bomb-result {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);

    .bomb-icon {
      font-size: 24px;
    }
  }

  .bomb-input-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .bomb-guesses {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: center;
    max-width: 100%;
  }

  .bomb-guess-tag {
    padding: 4px 10px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);

    &.hit {
      background: rgba(231, 76, 60, 0.15);
      border-color: #e74c3c;
      color: #e74c3c;
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

  .result-tip {
    font-size: 11px;
    color: var(--text-tertiary);
    margin: 0;
  }
}
</style>
