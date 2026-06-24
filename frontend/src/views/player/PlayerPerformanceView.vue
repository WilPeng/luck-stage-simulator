<template>
  <div class="perf-page">
    <!-- ===== 等待管理员开启公演 ===== -->
    <div v-if="!started && !hasDrawn" class="waiting-stage">
      <div class="waiting-glow"></div>
      <div class="waiting-icon">🎭</div>
      <h2>公演尚未开始</h2>
      <p>等待管理员开启本轮公演</p>
      <div class="waiting-dots"><span></span><span></span><span></span></div>
    </div>

    <!-- ===== 管理员已开启，准备抽取发挥值 ===== -->
    <div v-if="started && !hasDrawn" class="draw-stage">
      <div class="stage-badge">🌟 公演已开启</div>
      <div class="draw-area">
        <div class="draw-icon">⚡</div>
        <h2>抽取你的发挥值</h2>
        <p class="draw-hint">发挥值影响你的公演最终得分</p>

        <!-- 抽取按钮 -->
        <button v-if="!drawing && !revealed" class="draw-btn" @click="doDraw">
          🎲 抽取发挥值
        </button>

        <!-- 抽取动画中 -->
        <div v-if="drawing" class="slot-machine">
          <div class="slot-numbers">
            <span
              v-for="n in slotNumbers"
              :key="n"
              class="slot-num"
              :class="{ active: n === currentSlot }"
            >{{ n }}</span>
          </div>
        </div>

        <!-- 动画结束，展示结果 -->
        <div v-if="revealed" class="result-reveal" @animationend="onRevealEnd">
          <div class="result-glow" :class="resultLevel"></div>
          <div class="result-value" :class="resultLevel">{{ drawValue }}</div>
          <div class="result-label" :class="resultLevel">{{ resultText }}</div>
          <div class="result-bar">
            <div class="bar-fill" :class="resultLevel" :style="{ width: barWidth + '%' }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 已抽取，显示结果 ===== -->
    <div v-if="hasDrawn" class="results-stage">
      <div class="results-header">
        <h1>公演结果</h1>
        <p class="subtitle">第{{ currentRound }}公演 · 你的发挥值已确定</p>
      </div>

      <!-- 发挥值展示 -->
      <div class="perf-card">
        <span class="perf-label">你的发挥值</span>
        <span class="perf-value" :class="resultLevel">{{ drawValue }}</span>
        <span class="perf-text" :class="resultLevel">{{ resultText }}</span>
      </div>

      <!-- 所有结果（原页面内容简化） -->
      <div class="results-preview">
        <div v-if="teamResult" class="info-card">
          <span class="info-label">{{ teamResult.teamName }}</span>
          <span class="info-value">{{ teamResult.finalVotes }}票 · 第{{ teamResult.rank }}名</span>
        </div>
        <div v-if="!teamResult" class="info-card dim">
          <span>等待公演结算</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/authStore'
import { useTeamStore } from '../../stores/teamStore'
import { usePerformanceStore } from '../../stores/performanceStore'
import { playerGeneratePerformance, getPlayerPerformanceStatus } from '../../services/api'
import { savePlayerStatuses, loadPlayerStatuses } from '../../services/performanceService'
import { MessagePlugin } from 'tdesign-vue-next'

const route = useRoute()
const authStore = useAuthStore()
const teamStore = useTeamStore()
const performanceStore = usePerformanceStore()

const currentRound = computed(() => Number(route.params.round) || 1)
const currentUser = computed(() => authStore.currentUser)

const roundId = computed(() => `round-${currentRound.value}`)

// 状态
const started = ref(false)
const hasDrawn = ref(false)
const drawing = ref(false)
const revealed = ref(false)
const drawValue = ref(0)

// 老虎机动画
const slotNumbers = [-20, -15, -10, -5, -3, -1, 0, 2, 4, 6, 8, 10, 12, 15, 18, 20, 25, 30, 35, 40]
const currentSlot = ref(0)
let slotTimer: number | null = null

// 结果等级
const resultLevel = computed(() => {
  const v = drawValue.value
  if (v >= 30) return 'legendary'
  if (v >= 18) return 'epic'
  if (v >= 8) return 'rare'
  if (v >= 0) return 'normal'
  if (v >= -10) return 'poor'
  return 'disaster'
})

const resultText = computed(() => {
  const v = drawValue.value
  if (v >= 30) return '超神发挥！'
  if (v >= 18) return '超常发挥！'
  if (v >= 8) return '表现出色'
  if (v >= 0) return '稳定发挥'
  if (v >= -10) return '略有失误'
  return '严重失误'
})

const barWidth = computed(() => ((drawValue.value + 20) / 60) * 100)

// 队伍结果
const currentTeam = computed(() => teamStore.getTeamById(currentUser.value?.teamId || ''))
const teamResult = computed(() =>
  performanceStore.teamPerformanceResults.find(t => t.teamId === currentTeam.value?.id)
)

// 抽取发挥值
async function doDraw() {
  if (drawing.value) return
  drawing.value = true
  revealed.value = false

  // 老虎机滚动
  let ticks = 0
  const maxTicks = 20
  slotTimer = window.setInterval(() => {
    currentSlot.value = Math.floor(Math.random() * slotNumbers.length)
    ticks++
    if (ticks >= maxTicks) {
      if (slotTimer !== null) clearInterval(slotTimer)
      finishDraw()
    }
  }, 80)
}

// 老虎机滚动结束，调用后端生成发挥值
async function finishDraw() {
  const uid = currentUser.value?.id || ''
  let value: number

  try {
    // 调后端 API
    const res = await playerGeneratePerformance({
      roundId: roundId.value,
      playerId: uid
    })
    value = res.performanceValue
  } catch {
    // 后端失败时本地随机生成作为兜底
    value = Math.floor(Math.random() * 61) - 20
  }

  drawValue.value = value
  revealed.value = true
  drawing.value = false

  // 同步保存到 localStorage（兜底 + 缓存）
  const statuses = loadPlayerStatuses(roundId.value)
  const idx = statuses.findIndex(s => s.playerId === uid)
  const entry = {
    playerId: uid,
    playerName: currentUser.value?.name || '',
    teamId: currentUser.value?.teamId || '',
    teamName: currentTeam.value?.name || '',
    generated: true,
    performanceValue: value
  }
  if (idx >= 0) statuses[idx] = entry
  else statuses.push(entry)
  savePlayerStatuses(roundId.value, statuses)

  hasDrawn.value = true
}

// 动画结束回调，无操作
function onRevealEnd() {}

onMounted(async () => {
  const uid = currentUser.value?.id
  if (!uid) return

  // 1. 先从 localStorage 快速恢复（同 tab 会话期间）
  try {
    const { loadPlayerStatuses } = await import('../../services/performanceService')
    const saved = loadPlayerStatuses(roundId.value).find((p: any) => p.playerId === uid)
    if (saved?.generated && saved?.performanceValue !== null) {
      hasDrawn.value = true
      drawValue.value = saved.performanceValue
      revealed.value = true
    }
  } catch { /* ignore */ }

  // 2. 从后端检查公演状态 + 发挥值（覆盖 localStorage）
  try {
    const status = await getPlayerPerformanceStatus(roundId.value)
    started.value = status.started
    const myStatus = (status.players || []).find((p: any) =>
      p.playerId === uid || (p as any).player_id === uid
    )
    if (myStatus?.generated && myStatus?.performanceValue !== null) {
      hasDrawn.value = true
      drawValue.value = myStatus.performanceValue
      revealed.value = true
    } else if (myStatus?.performance_value !== undefined) {
      // 兼容 snake_case
      hasDrawn.value = true
      drawValue.value = myStatus.performance_value
      revealed.value = true
    }
  } catch {
    started.value = false
  }

  // 3. 加载队伍和结果数据
  await Promise.all([
    teamStore.fetchTeams(roundId.value),
    performanceStore.fetchPlayerPerformanceResults(String(currentRound.value))
  ])
})
</script>

<style lang="scss" scoped>
.perf-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 50%, #0a0a2a 100%);
  padding: 20px;
}

// ===== 等待阶段 =====
.waiting-stage {
  text-align: center;
  position: relative;
  .waiting-glow {
    position: absolute; top: 50%; left: 50%;
    width: 300px; height: 300px;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle, rgba(162,155,254,0.1) 0%, transparent 70%);
  }
  .waiting-icon { font-size: 80px; margin-bottom: 20px; animation: float 3s ease-in-out infinite; }
  h2 { font-size: 24px; font-weight: 700; margin: 0 0 10px; }
  p { color: rgba(255,255,255,0.4); font-size: 14px; margin: 0; }
  .waiting-dots {
    display: flex; gap: 8px; justify-content: center; margin-top: 24px;
    span {
      width: 8px; height: 8px; border-radius: 50%;
      background: rgba(162,155,254,0.3);
      animation: dotBounce 1.4s ease-in-out infinite;
      &:nth-child(2) { animation-delay: 0.2s; }
      &:nth-child(3) { animation-delay: 0.4s; }
    }
  }
}

// ===== 抽取阶段 =====
.draw-stage {
  text-align: center;
  width: 100%; max-width: 420px;
}
.stage-badge {
  display: inline-flex; padding: 6px 20px;
  background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.3);
  border-radius: 20px; font-size: 14px; font-weight: 600; color: #ffd700;
  margin-bottom: 32px;
}
.draw-area {
  .draw-icon { font-size: 64px; margin-bottom: 16px; }
  h2 { font-size: 22px; font-weight: 700; margin: 0 0 8px; }
  .draw-hint { color: rgba(255,255,255,0.4); font-size: 13px; margin: 0 0 28px; }
}

// 抽取按钮
.draw-btn {
  padding: 16px 48px; font-size: 18px; font-weight: 700;
  background: linear-gradient(135deg, #ffd700, #ff6b6b);
  border: none; border-radius: 14px; color: #fff; cursor: pointer;
  transition: all 0.25s ease; letter-spacing: 1px;
  box-shadow: 0 6px 25px rgba(255,215,0,0.25);
  &:hover { transform: translateY(-3px); box-shadow: 0 10px 35px rgba(255,215,0,0.35); }
  &:active { transform: translateY(0); }
}

// 老虎机
.slot-machine {
  margin: 20px 0;
}
.slot-numbers {
  display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;
  max-width: 320px; margin: 0 auto;
}
.slot-num {
  width: 42px; height: 42px; display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; font-size: 16px; font-weight: 700; color: rgba(255,255,255,0.3);
  transition: all 0.05s;
  &.active {
    background: linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,107,107,0.12));
    border-color: rgba(255,215,0,0.4); color: #ffd700;
    transform: scale(1.15);
    box-shadow: 0 0 15px rgba(255,215,0,0.2);
  }
}

// ===== 结果展示 =====
.result-reveal {
  margin-top: 20px; position: relative;
  animation: revealIn 0.6s ease;
}
.result-glow {
  position: absolute; top: 50%; left: 50%;
  width: 200px; height: 200px; transform: translate(-50%, -50%);
  border-radius: 50%;
  &.legendary { background: radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%); }
  &.epic { background: radial-gradient(circle, rgba(155,89,182,0.3) 0%, transparent 70%); }
    &.rare { background: radial-gradient(circle, rgba(52,152,219,0.2) 0%, transparent 70%); }
    &.normal { background: radial-gradient(circle, rgba(46,204,113,0.15) 0%, transparent 70%); }
    &.poor { background: radial-gradient(circle, rgba(231,76,60,0.15) 0%, transparent 70%); }
    &.disaster { background: radial-gradient(circle, rgba(139,0,0,0.2) 0%, transparent 70%); }
}
.result-value {
  font-size: 72px; font-weight: 800; line-height: 1; position: relative;
    &.legendary { color: #ffd700; text-shadow: 0 0 30px rgba(255,215,0,0.5); }
    &.epic { color: #9b59b6; text-shadow: 0 0 25px rgba(155,89,182,0.4); }
    &.rare { color: #3498db; text-shadow: 0 0 20px rgba(52,152,219,0.3); }
    &.normal { color: #2ecc71; }
    &.poor { color: #e67e22; }
    &.disaster { color: #8b0000; text-shadow: 0 0 15px rgba(139,0,0,0.3); }
  }
  .result-label {
    font-size: 18px; font-weight: 700; margin-top: 10px;
    &.legendary { color: #ffd700; }
    &.epic { color: #9b59b6; }
    &.rare { color: #3498db; }
    &.normal { color: #2ecc71; }
    &.poor { color: #e67e22; }
    &.disaster { color: #8b0000; }
  }
  .result-bar {
    height: 6px; background: rgba(255,255,255,0.08); border-radius: 4px;
    margin-top: 16px; overflow: hidden;
    .bar-fill {
      height: 100%; border-radius: 4px; transition: width 1s ease;
      &.legendary { background: linear-gradient(90deg, #ffd700, #ff6b6b); }
      &.epic { background: linear-gradient(90deg, #9b59b6, #8e44ad); }
      &.rare { background: linear-gradient(90deg, #3498db, #2980b9); }
      &.normal { background: linear-gradient(90deg, #2ecc71, #27ae60); }
      &.poor { background: linear-gradient(90deg, #e67e22, #d35400); }
      &.disaster { background: linear-gradient(90deg, #8b0000, #5a0000); }
    }
  }

// ===== 结果页 =====
.results-stage {
  width: 100%; max-width: 600px;
}
.results-header {
  margin-bottom: 24px; text-align: left;
  h1 { font-size: 26px; font-weight: 800; margin: 0 0 6px; letter-spacing: 1px; }
  .subtitle { color: rgba(255,255,255,0.45); margin: 0; font-size: 13px; }
}
.perf-card {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 32px; background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; margin-bottom: 20px;
  .perf-label { font-size: 14px; color: rgba(255,255,255,0.5); }
  .perf-value { font-size: 56px; font-weight: 800; line-height: 1;
    &.legendary { color: #ffd700; text-shadow: 0 0 20px rgba(255,215,0,0.3); }
    &.epic { color: #9b59b6; } &.rare { color: #3498db; }
    &.normal { color: #2ecc71; } &.poor { color: #e67e22; } &.disaster { color: #8b0000; }
  }
  .perf-text { font-size: 16px; font-weight: 600;
    &.legendary { color: #ffd700; } &.epic { color: #9b59b6; }
    &.rare { color: #3498db; } &.normal { color: #2ecc71; } &.poor { color: #e67e22; } &.disaster { color: #8b0000; }
  }
}
.info-card {
  padding: 14px 20px; background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;
  display: flex; justify-content: space-between; align-items: center;
  &.dim { justify-content: center; color: rgba(255,255,255,0.3); }
}

// ===== 动画 =====
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
@keyframes dotBounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
  40% { transform: translateY(-12px); opacity: 1; }
}
@keyframes revealIn {
  from { opacity: 0; transform: scale(0.5) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

// ===== 移动端适配 =====
@media (max-width: 768px) {
  .perf-page {
    min-height: calc(100vh - 56px);
    padding: 16px;
    padding-bottom: 72px; // 为底部 tab 栏留出空间
  }

  .waiting-stage {
    .waiting-glow {
      width: 200px;
      height: 200px;
    }
    .waiting-icon { font-size: 60px; }
    h2 { font-size: 20px; }
  }

  .draw-stage {
    .stage-badge {
      font-size: 12px;
      padding: 4px 16px;
    }
    .draw-area {
      .draw-icon { font-size: 48px; }
      h2 { font-size: 18px; }
    }
  }

  .draw-btn {
    padding: 14px 36px;
    font-size: 16px;
  }

  .slot-numbers {
    max-width: 280px;
  }
  .slot-num {
    width: 36px;
    height: 36px;
    font-size: 14px;
  }

  .result-value {
    font-size: 56px;
  }
  .result-label {
    font-size: 16px;
  }

  .results-stage {
    padding-bottom: 16px;
  }
  .results-header {
    h1 { font-size: 22px; }
  }
  .perf-card {
    padding: 24px;
    .perf-value { font-size: 44px; }
  }
}

@media (max-width: 480px) {
  .perf-page {
    min-height: calc(100vh - 48px);
    padding: 12px;
    padding-bottom: 66px;
  }

  .result-value {
    font-size: 44px;
  }

  .perf-card {
    padding: 20px;
    .perf-value { font-size: 36px; }
  }
}
</style>
