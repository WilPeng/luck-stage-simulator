<template>
  <div class="perf-page">
    <!-- ===== Phase 0: 公演还未开始 ===== -->
    <div v-if="phase === 0" class="locked-stage">
      <div class="locked-glow"></div>
      <div class="locked-icon">🔒</div>
      <h2>第{{ currentRound }}公演</h2>
      <p>公演还未开始，请等待管理员进入公演管理</p>
      <div class="waiting-dots"><span></span><span></span><span></span></div>
    </div>

    <!-- ===== Phase 1: 等待管理员开启公演 ===== -->
    <div v-else-if="phase === 1" class="waiting-stage">
      <div class="waiting-glow"></div>
      <div class="waiting-icon">🎭</div>
      <h2>公演尚未开启</h2>
      <p>当前管理员还未开始公演，请耐心等待</p>
      <div class="waiting-dots"><span></span><span></span><span></span></div>
    </div>

    <!-- ===== Phase 2: 抽取发挥值 ===== -->
    <div v-else-if="phase === 2 && !hasDrawn" class="draw-stage">
      <div class="stage-badge">🌟 公演已开启</div>
      <div class="draw-area">
        <div class="draw-icon">⚡</div>
        <h2>抽取你的发挥值</h2>
        <p class="draw-hint">发挥值影响你的公演最终得分</p>
        <button v-if="!drawing && !revealed" class="draw-btn" @click="doDraw">🎲 抽取发挥值</button>
        <div v-if="drawing" class="slot-machine">
          <div class="slot-numbers">
            <span v-for="n in slotNumbers" :key="n" class="slot-num" :class="{ active: n === currentSlot }">{{ n }}</span>
          </div>
        </div>
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

    <!-- ===== Phase 2/3/4/5: 已抽取，显示结果页 ===== -->
    <div v-else class="results-stage">
      <div class="results-header">
        <h1>第{{ currentRound }}公演·公演结果</h1>
        <p class="subtitle" v-if="phase === 2">发挥值已确定，等待公演结算</p>
        <p class="subtitle" v-else-if="phase === 3">结算已完成</p>
        <p class="subtitle" v-else-if="phase === 4 && !showRanking">大众评审投票已公布</p>
        <p class="subtitle" v-else>最终结果已公布</p>
      </div>

      <!-- 发挥值展示 -->
      <div class="perf-card">
        <span class="perf-label">你的发挥值</span>
        <span class="perf-value" :class="resultLevel">{{ drawValue }}</span>
        <span class="perf-text" :class="resultLevel">{{ resultText }}</span>
      </div>

      <!-- 队伍成绩 -->
      <div class="results-preview">
        <div v-if="teamResult" class="info-card">
          <span class="info-label">{{ teamResult.teamName }}</span>
          <span class="info-value">{{ teamResult.finalVotes }}票·第{{ teamResult.rank }}名</span>
        </div>
        <div v-if="!teamResult && phase >= 3" class="info-card dim"><span>等待队伍揭晓</span></div>
        <div v-if="!teamResult && phase < 3" class="info-card dim"><span>等待公演结算</span></div>
      </div>

      <!-- ===== 得分计算详情 ===== -->
      <div v-if="scoreBreakdown && phase >= 3" class="score-detail-section">
        <div class="section-title-bar">
          <span class="section-icon">📊</span>
          <span>得分计算详情</span>
        </div>

        <!-- 个人得分拆解 -->
        <div class="detail-block">
          <div class="detail-block-title">① 个人得分</div>
          <table class="breakdown-table">
            <tr>
              <td class="label">选手属性</td>
              <td class="value">声乐 {{ scoreBreakdown.attrs.vocal }} · 舞蹈 {{ scoreBreakdown.attrs.dance }} · 魅力 {{ scoreBreakdown.attrs.charm }}</td>
            </tr>
            <tr>
              <td class="label">歌曲权重</td>
              <td class="value">声乐 {{ (scoreBreakdown.songWeights.vocal * 100).toFixed(0) }}% · 舞蹈 {{ (scoreBreakdown.songWeights.dance * 100).toFixed(0) }}% · 魅力 {{ (scoreBreakdown.songWeights.charm * 100).toFixed(0) }}%</td>
            </tr>
            <tr class="formula-row">
              <td class="label">属性分</td>
              <td class="value formula">
                {{ scoreBreakdown.attrs.vocal }}×{{ (scoreBreakdown.songWeights.vocal * 100).toFixed(0) }}%
                + {{ scoreBreakdown.attrs.dance }}×{{ (scoreBreakdown.songWeights.dance * 100).toFixed(0) }}%
                + {{ scoreBreakdown.attrs.charm }}×{{ (scoreBreakdown.songWeights.charm * 100).toFixed(0) }}%
                = <strong>{{ scoreBreakdown.attrScore }}</strong>
              </td>
            </tr>
            <tr>
              <td class="label">难度系数</td>
              <td class="value">1 - ({{ scoreBreakdown.difficulty }} - 1) × 0.1 = <strong>{{ scoreBreakdown.difficultyFactor }}</strong></td>
            </tr>
            <tr>
              <td class="label">发挥加分</td>
              <td class="value">{{ scoreBreakdown.perfValue }} × 2 = <strong>{{ scoreBreakdown.performanceBonus > 0 ? '+' : '' }}{{ scoreBreakdown.performanceBonus }}</strong></td>
            </tr>
            <tr class="formula-row">
              <td class="label">原始分</td>
              <td class="value formula">
                {{ scoreBreakdown.attrScore }} × {{ scoreBreakdown.difficultyFactor }} + {{ scoreBreakdown.performanceBonus }}
                = <strong>{{ scoreBreakdown.rawScore }}</strong>
              </td>
            </tr>
            <tr class="result-row">
              <td class="label">最终得分</td>
              <td class="value highlight">截断 0~120 → <strong>{{ scoreBreakdown.finalScore }}分</strong></td>
            </tr>
          </table>
        </div>

        <!-- 队伍得分拆解 -->
        <div class="detail-block">
          <div class="detail-block-title">② 团队得分 & 最终票数</div>
          <table class="breakdown-table">
            <tr>
              <td class="label">团队平均分</td>
              <td class="value">round(所有成员个人分平均值) = <strong>{{ scoreBreakdown.teamScore }}分</strong></td>
            </tr>
            <tr>
              <td class="label">基础票数</td>
              <td class="value">500</td>
            </tr>
            <tr>
              <td class="label">团队得分加成</td>
              <td class="value">{{ scoreBreakdown.teamScore }} × 3 = <strong>+{{ scoreBreakdown.teamScore * 3 }}</strong></td>
            </tr>
            <tr>
              <td class="label">平均魅力加成</td>
              <td class="value">魅力平均值 {{ scoreBreakdown.avgCharm }} → <strong>+{{ scoreBreakdown.avgCharm }}</strong></td>
            </tr>
            <tr class="result-row">
              <td class="label">最终票数</td>
              <td class="value highlight">500 + {{ scoreBreakdown.teamScore }}×3 + {{ scoreBreakdown.avgCharm }} = <strong>{{ scoreBreakdown.finalVotes }}票</strong></td>
            </tr>
          </table>
        </div>
      </div>

      <!-- ===== 大众评审席（1000座）===== -->
      <div v-if="showSeats" class="audience-seats-section">
        <div class="section-title-bar">
          <span class="section-icon">🎭</span>
          <span>大众评审席（1000座）</span>
        </div>
        <div class="seats-toolbar">
          <span class="seats-info">总座位：1000</span>
          <span class="seats-info voted-count">已投票：{{ votedSeatCount }}</span>
          <span class="seats-tip">点击已投票座位查看详情</span>
        </div>
        <div class="seats-grid">
          <div
            v-for="seat in seats"
            :key="seat.id"
            class="seat-item"
            :class="{ voted: seat.voted, selected: selectedSeat === seat.seatNumber }"
            @click="handleSeatClick(seat)"
          >
            <span class="seat-icon">{{ seat.voted ? '🎭' : '🪑' }}</span>
          </div>
        </div>

        <!-- 座位投票详情弹窗（只读） -->
        <t-dialog
          v-model:visible="detailVisible"
          :header="`${selectedSeatNumber}号大众评审投票详情`"
          width="420px"
          :destroy-on-close="true"
          :footer="false"
        >
          <div v-if="seatDetailLoading" class="detail-loading">加载中...</div>
          <div v-else-if="seatDetailVotes.length === 0" class="detail-empty">该评审尚未投票</div>
          <div v-else class="seat-detail-list">
            <div
              v-for="vote in seatDetailVotes"
              :key="vote.voteOrder"
              class="seat-detail-item"
            >
              <span class="vote-order">第{{ vote.voteOrder }}票</span>
              <span class="vote-player">{{ vote.playerName }}</span>
            </div>
          </div>
        </t-dialog>
      </div>

      <!-- ===== 个人喜爱度排名 ===== -->
      <div v-if="showRanking" class="audience-section">
        <div class="section-title-bar">
          <span class="section-icon">❤️</span>
          <span>个人喜爱度排名</span>
        </div>
        <div class="my-rank-card">
          <div class="rank-number" :class="rankClass">{{ myAudienceRanking?.rank }}</div>
          <div class="rank-detail">
            <span class="rank-label">你的喜爱度排名</span>
            <span class="rank-votes">{{ myAudienceRanking?.votes || 0 }}票</span>
          </div>
        </div>
        <div class="rank-list">
          <div
            v-for="item in audienceRankings"
            :key="item.playerId"
            class="rank-item"
            :class="{ 'is-me': item.playerId === currentUser?.id }"
          >
            <span class="rank-pos">{{ item.rank }}</span>
            <span class="rank-name">{{ item.playerName }}</span>
            <div class="rank-bar-track">
              <div class="rank-bar-fill" :style="{ width: (item.votes / maxVotes) * 100 + '%' }"></div>
            </div>
            <span class="rank-vote-count">{{ item.votes || 0 }}票</span>
          </div>
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
import {
  getPlayerPerformanceStatus, getAudienceFinalRanking,
  getPerformanceRoundStatus, getPlayerAudienceSeats,
  getPlayerAudienceSeatDetail, savePerformancePlayerStatus
} from '../../services/api'
import { savePlayerStatuses, loadPlayerStatuses } from '../../services/performanceService'
import type { AudienceSeat } from '../../types/performance'

const route = useRoute()
const authStore = useAuthStore()
const teamStore = useTeamStore()
const performanceStore = usePerformanceStore()

const currentRound = computed(() => Number(route.params.round) || 1)
const currentUser = computed(() => authStore.currentUser)
const roundId = computed(() => `round-${currentRound.value}`)

// ===== 轮次状态 =====
interface RoundStatus { started: boolean; settled: boolean; released: boolean; opened: boolean; seasonStage: string | null }
const roundStatus = ref<RoundStatus | null>(null)

const phase = computed(() => {
  if (!roundStatus.value) return -1
  const rs = roundStatus.value
  if (!rs.opened) return 0
  if (!rs.started) return 1
  if (rs.released) return 4 // 释放后→显示评审席
  if (rs.settled) return 3
  return 2
})

// 释放后始终显示大众评审席
const showSeats = computed(() => phase.value >= 4 && seatsLoaded.value)

// ===== 抽取状态 =====
const hasDrawn = ref(false)
const drawing = ref(false)
const revealed = ref(false)
const drawValue = ref(0)
const slotNumbers = [-10, -8, -6, -5, -3, -1, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
const currentSlot = ref(0)
let slotTimer: number | null = null

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
const barWidth = computed(() => ((drawValue.value + 10) / 30) * 100)

// ===== 队伍结果 =====
const currentTeam = computed(() => teamStore.getTeamById(currentUser.value?.teamId || ''))
const teamResult = computed(() =>
  performanceStore.teamPerformanceResults.find(t => t.teamId === currentTeam.value?.id)
)

// 当前选手的个人演出数据
const myPerformance = computed(() => {
  if (!teamResult.value) return null
  const perf = teamResult.value.playerPerformances?.find((p: any) => p.playerId === currentUser.value?.id)
  return perf || null
})

// 详细得分拆解（使用后端返回的真实数据）
const scoreBreakdown = computed(() => {
  const tr = teamResult.value
  const myPerf = myPerformance.value
  if (!tr || !myPerf) return null

  const attrs = currentUser.value?.attributes || { vocal: 0, dance: 0, charm: 0 }
  const sw = tr.songWeights || { vocal: 0.34, dance: 0.33, charm: 0.33 }

  // 使用后端返回的实际计算值
  const attrScore = myPerf.attributeScore ?? Math.round(attrs.vocal * sw.vocal + attrs.dance * sw.dance + attrs.charm * sw.charm)
  const difficultyFactor = myPerf.difficultyFactor ?? 0.80
  const perfValue = myPerf.performanceValue || 0
  const performanceBonus = myPerf.performanceBonus ?? (perfValue * 2)

  // 根据 difficultyFactor 反推难度等级
  const difficulty = Math.round(1 - (difficultyFactor - 1) / 0.1)

  // 原始分
  const rawScore = attrScore * difficultyFactor + performanceBonus

  // 最终分（优先用后端返回的）
  const finalScore = myPerf.playerScore || Math.round(Math.max(0, Math.min(120, rawScore)))

  const avgCharm = tr.teamAttributes?.charm || 0
  const teamScore = tr.teamScore || 0
  const finalVotes = tr.finalVotes || 0

  return {
    attrs,
    songWeights: sw,
    attrScore,
    difficulty,
    difficultyFactor,
    perfValue,
    performanceBonus,
    rawScore: +rawScore.toFixed(1),
    finalScore,
    teamScore,
    avgCharm,
    finalVotes
  }
})

// ===== 评审席 =====
const seats = ref<AudienceSeat[]>([])
const seatsLoaded = ref(false)
const selectedSeat = ref(0)
const detailVisible = ref(false)
const selectedSeatNumber = ref(0)
const seatDetailLoading = ref(false)
const seatDetailVotes = ref<{ voteOrder: number; playerName: string }[]>([])

const votedSeatCount = computed(() => seats.value.filter(s => s.voted).length)

async function fetchSeats() {
  try {
    const res = await getPlayerAudienceSeats(roundId.value)
    seats.value = res.seats || []
    seatsLoaded.value = true
  } catch {
    seatsLoaded.value = false
  }
}

async function handleSeatClick(seat: AudienceSeat) {
  if (!seat.voted) return
  selectedSeat.value = seat.seatNumber
  selectedSeatNumber.value = seat.seatNumber
  detailVisible.value = true
  seatDetailLoading.value = true
  seatDetailVotes.value = []
  try {
    const res = await getPlayerAudienceSeatDetail(roundId.value, seat.seatNumber)
    seatDetailVotes.value = res.detail?.votes?.map((v: any) => ({
      voteOrder: v.voteOrder,
      playerName: v.playerName || '未知选手'
    })) || []
  } catch {
    seatDetailVotes.value = []
  }
  seatDetailLoading.value = false
}

// ===== 个人喜爱度排名（Phase 5）=====
const audienceRankings = ref<any[]>([])
const myAudienceRanking = ref<{ rank: number; playerName: string; votes: number } | null>(null)

// 进入淘汰阶段后额外显示个人喜爱度排名（seasonStage 不再是 'performance'）
const showRanking = computed(() => {
  if (!roundStatus.value) return false
  return roundStatus.value.released && roundStatus.value.seasonStage !== 'performance' && audienceRankings.value.length > 0
})

const rankClass = computed(() => {
  const r = myAudienceRanking.value?.rank
  if (!r) return ''
  if (r === 1) return 'rank-gold'
  if (r === 2) return 'rank-silver'
  if (r === 3) return 'rank-bronze'
  if (r <= 5) return 'rank-top'
  return 'rank-normal'
})

const maxVotes = computed(() => {
  if (audienceRankings.value.length === 0) return 1
  return Math.max(...audienceRankings.value.map(r => r.votes || 0), 1)
})

async function fetchRankings() {
  try {
    const res = await getAudienceFinalRanking(roundId.value)
    if (res.released && res.rankings?.length > 0) {
      audienceRankings.value = res.rankings
      const uid = currentUser.value?.id
      const myRank = res.rankings.find((r: any) => r.playerId === uid)
      if (myRank) {
        myAudienceRanking.value = {
          rank: myRank.rank,
          playerName: myRank.playerName || currentUser.value?.name || '',
          votes: myRank.votes || 0
        }
      }
    }
  } catch { /* ignore */ }
}

// ===== 抽取发挥值 =====
async function doDraw() {
  if (drawing.value) return
  drawing.value = true
  revealed.value = false
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

async function finishDraw() {
  const uid = currentUser.value?.id || ''
  // 客户端生成随机发挥值（-10 ~ 20）
  const value = Math.floor(Math.random() * 31) - 10
  drawValue.value = value
  revealed.value = true
  drawing.value = false

  // 使用统一的 player-status/save 接口持久化
  try {
    await savePerformancePlayerStatus(roundId.value, [{ playerId: uid, performanceValue: value }])
  } catch (e: any) {
    console.warn('[Performance] 保存发挥值失败，仅本地存储:', e.message)
  }

  // 本地存储作为回退
  const statuses = loadPlayerStatuses(roundId.value)
  const idx = statuses.findIndex(s => s.playerId === uid)
  const entry = { playerId: uid, playerName: currentUser.value?.name || '', teamId: currentUser.value?.teamId || '', teamName: currentTeam.value?.name || '', generated: true, performanceValue: value }
  if (idx >= 0) statuses[idx] = entry
  else statuses.push(entry)
  savePlayerStatuses(roundId.value, statuses)
  hasDrawn.value = true
}

function onRevealEnd() {}

onMounted(async () => {
  const uid = currentUser.value?.id
  if (!uid) return

  // 1. 获取轮次状态
  try {
    const status = await getPerformanceRoundStatus(roundId.value)
    roundStatus.value = status
  } catch {
    roundStatus.value = { started: false, settled: false, released: false, opened: false, seasonStage: null }
  }

  // 2. 恢复 localStorage 发挥值
  try {
    const saved = loadPlayerStatuses(roundId.value).find((p: any) => p.playerId === uid)
    if (saved?.generated && saved?.performanceValue !== null) {
      hasDrawn.value = true
      drawValue.value = saved.performanceValue
      revealed.value = true
    }
  } catch { /* ignore */ }

  // 3. 从后端检查发挥值
  try {
    const status = await getPlayerPerformanceStatus(roundId.value)
    if (roundStatus.value && roundStatus.value.started !== status.started) {
      roundStatus.value.started = status.started
    }
    const myStatus = (status.players || []).find((p: any) => p.playerId === uid || (p as any).player_id === uid)
    if (myStatus?.generated && myStatus?.performanceValue !== null) {
      hasDrawn.value = true
      drawValue.value = myStatus.performanceValue
      revealed.value = true
    } else {
      // ★ 后端显示未生成 → 覆盖 localStorage 的旧数据 ★
      hasDrawn.value = false
      revealed.value = false
      drawValue.value = 0
      // 清理 localStorage 中该选手的旧数据
      const statuses = loadPlayerStatuses(roundId.value)
      const filtered = statuses.filter((s: any) => s.playerId !== uid)
      savePlayerStatuses(roundId.value, filtered)
    }
  } catch { /* ignore */ }

  // 4. 加载队伍和结果数据
  await Promise.all([
    teamStore.fetchTeams(roundId.value),
    performanceStore.fetchPlayerPerformanceResults(String(currentRound.value))
  ])

  // 5. 根据当前阶段预加载数据
  const rs = roundStatus.value
  if (rs?.released) {
    // 无论相位 4 还是 5，都加载评审席和排名
    await Promise.all([
      fetchSeats(),
      fetchRankings()
    ])
  }
})
</script>

<style scoped lang="scss">
.perf-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  // justify-content: center 在结果页用 flex-start
  color: #fff;
  background: #f5f7fa;
  padding: 20px;
  color: #333;
}

// ===== Phase 0 =====
.locked-stage { text-align: center; position: relative;
  .locked-glow { position: absolute; top: 50%; left: 50%; width: 300px; height: 300px; transform: translate(-50%, -50%); background: radial-gradient(circle, rgba(100,100,100,0.1) 0%, transparent 70%); }
  .locked-icon { font-size: 80px; margin-bottom: 20px; }
  h2 { font-size: 24px; font-weight: 700; margin: 0 0 10px; }
  p { color: rgba(255,255,255,0.4); font-size: 14px; margin: 0; }
}

// ===== Phase 1 =====
.waiting-stage { text-align: center; position: relative;
  .waiting-glow { position: absolute; top: 50%; left: 50%; width: 300px; height: 300px; transform: translate(-50%, -50%); background: radial-gradient(circle, rgba(162,155,254,0.1) 0%, transparent 70%); }
  .waiting-icon { font-size: 80px; margin-bottom: 20px; animation: float 3s ease-in-out infinite; }
  h2 { font-size: 24px; font-weight: 700; margin: 0 0 10px; }
  p { color: rgba(255,255,255,0.4); font-size: 14px; margin: 0; }
  .waiting-dots { display: flex; gap: 8px; justify-content: center; margin-top: 24px;
    span { width: 8px; height: 8px; border-radius: 50%; background: rgba(162,155,254,0.3); animation: dotBounce 1.4s ease-in-out infinite; &:nth-child(2) { animation-delay: 0.2s; } &:nth-child(3) { animation-delay: 0.4s; } }
  }
}

// ===== Phase 2 抽取 =====
.draw-stage { text-align: center; width: 100%; max-width: 420px; }
.stage-badge { display: inline-flex; padding: 6px 20px; background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.3); border-radius: 20px; font-size: 14px; font-weight: 600; color: #ffd700; margin-bottom: 32px; }
.draw-area {
  .draw-icon { font-size: 64px; margin-bottom: 16px; }
  h2 { font-size: 22px; font-weight: 700; margin: 0 0 8px; }
  .draw-hint { color: rgba(255,255,255,0.4); font-size: 13px; margin: 0 0 28px; }
}
.draw-btn { padding: 16px 48px; font-size: 18px; font-weight: 700; background: linear-gradient(135deg, #ffd700, #ff6b6b); border: none; border-radius: 14px; color: #fff; cursor: pointer; transition: all 0.25s ease; letter-spacing: 1px; box-shadow: 0 6px 25px rgba(255,215,0,0.25); &:hover { transform: translateY(-3px); box-shadow: 0 10px 35px rgba(255,215,0,0.35); } &:active { transform: translateY(0); } }
.slot-machine { margin: 20px 0; }
.slot-numbers { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; max-width: 320px; margin: 0 auto; }
.slot-num { width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; font-size: 16px; font-weight: 700; color: rgba(255,255,255,0.3); transition: all 0.05s;
  &.active { background: linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,107,107,0.12)); border-color: rgba(255,215,0,0.4); color: #ffd700; transform: scale(1.15); box-shadow: 0 0 15px rgba(255,215,0,0.2); }
}
.result-reveal { margin-top: 20px; position: relative; animation: revealIn 0.6s ease; }
.result-glow { position: absolute; top: 50%; left: 50%; width: 200px; height: 200px; transform: translate(-50%, -50%); border-radius: 50%;
  &.legendary { background: radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%); }
  &.epic { background: radial-gradient(circle, rgba(155,89,182,0.3) 0%, transparent 70%); }
  &.rare { background: radial-gradient(circle, rgba(52,152,219,0.2) 0%, transparent 70%); }
  &.normal { background: radial-gradient(circle, rgba(46,204,113,0.15) 0%, transparent 70%); }
  &.poor { background: radial-gradient(circle, rgba(231,76,60,0.15) 0%, transparent 70%); }
  &.disaster { background: radial-gradient(circle, rgba(139,0,0,0.2) 0%, transparent 70%); }
}
.result-value { font-size: 72px; font-weight: 800; line-height: 1; position: relative;
  &.legendary { color: #ffd700; text-shadow: 0 0 30px rgba(255,215,0,0.5); } &.epic { color: #9b59b6; text-shadow: 0 0 25px rgba(155,89,182,0.4); } &.rare { color: #3498db; text-shadow: 0 0 20px rgba(52,152,219,0.3); } &.normal { color: #2ecc71; } &.poor { color: #e67e22; } &.disaster { color: #8b0000; text-shadow: 0 0 15px rgba(139,0,0,0.3); }
}
.result-label { font-size: 18px; font-weight: 700; margin-top: 10px;
  &.legendary { color: #ffd700; } &.epic { color: #9b59b6; } &.rare { color: #3498db; } &.normal { color: #2ecc71; } &.poor { color: #e67e22; } &.disaster { color: #8b0000; }
}
.result-bar { height: 6px; background: rgba(255,255,255,0.08); border-radius: 4px; margin-top: 16px; overflow: hidden;
  .bar-fill { height: 100%; border-radius: 4px; transition: width 1s ease;
    &.legendary { background: linear-gradient(90deg, #ffd700, #ff6b6b); } &.epic { background: linear-gradient(90deg, #9b59b6, #8e44ad); } &.rare { background: linear-gradient(90deg, #3498db, #2980b9); } &.normal { background: linear-gradient(90deg, #2ecc71, #27ae60); } &.poor { background: linear-gradient(90deg, #e67e22, #d35400); } &.disaster { background: linear-gradient(90deg, #8b0000, #5a0000); }
  }
}

// ===== 结果页 (Phase 2-5) =====
.results-stage {
  width: 100%; max-width: 700px;
  padding-top: 20px;
  // 当有评审席网格时用 flex-start，不要垂直居中
  align-self: flex-start;
}
.results-header { margin-bottom: 20px; text-align: left;
  h1 { font-size: 24px; font-weight: 800; margin: 0 0 4px; letter-spacing: 1px; }
  .subtitle { color: rgba(255,255,255,0.45); margin: 0; font-size: 13px; }
}
.perf-card { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; margin-bottom: 16px;
  .perf-label { font-size: 14px; color: rgba(255,255,255,0.5); }
  .perf-value { font-size: 48px; font-weight: 800; line-height: 1;
    &.legendary { color: #ffd700; text-shadow: 0 0 20px rgba(255,215,0,0.3); } &.epic { color: #9b59b6; } &.rare { color: #3498db; } &.normal { color: #2ecc71; } &.poor { color: #e67e22; } &.disaster { color: #8b0000; }
  }
  .perf-text { font-size: 16px; font-weight: 600;
    &.legendary { color: #ffd700; } &.epic { color: #9b59b6; } &.rare { color: #3498db; } &.normal { color: #2ecc71; } &.poor { color: #e67e22; } &.disaster { color: #8b0000; }
  }
}
.info-card { padding: 12px 18px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; display: flex; justify-content: space-between; align-items: center;
  &.dim { justify-content: center; color: rgba(255,255,255,0.3); }
}

// ===== 通用区块标题 =====
.section-title-bar { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; margin: 20px 0 12px; color: rgba(255,255,255,0.9);
  .section-icon { font-size: 20px; }
}

// ===== 评审席 (Phase 4) =====
.audience-seats-section { margin-top: 8px; }
.seats-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap;
  .seats-info { font-size: 13px; color: rgba(255,255,255,0.5); }
  .voted-count { color: rgba(102,126,234,0.8); }
  .seats-tip { font-size: 12px; color: rgba(255,255,255,0.3); margin-left: auto; }
}
.seats-grid { display: grid; grid-template-columns: repeat(20, 1fr); gap: 4px; }
.seat-item { display: flex; align-items: center; justify-content: center; aspect-ratio: 1; cursor: default; border-radius: 4px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); transition: all 0.15s;
  .seat-icon { font-size: 14px; line-height: 1; }
  &.voted { background: rgba(102,126,234,0.12); border-color: rgba(102,126,234,0.25); cursor: pointer;
    &:hover { background: rgba(102,126,234,0.22); border-color: rgba(102,126,234,0.4); transform: scale(1.1); z-index: 1; }
  }
  &.selected { border-color: #667eea; box-shadow: 0 0 6px rgba(102,126,234,0.4); }
}

// 评审详情弹窗
.detail-loading, .detail-empty { padding: 24px; text-align: center; color: rgba(0,0,0,0.45); font-size: 14px; }
.seat-detail-list { display: flex; flex-direction: column; gap: 8px; }
.seat-detail-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: rgba(0,0,0,0.04); border-radius: 8px;
  .vote-order { font-size: 13px; color: rgba(0,0,0,0.55); min-width: 48px; }
  .vote-player { font-size: 14px; font-weight: 600; color: rgba(0,0,0,0.85); }
}

// ===== 个人喜爱度排名 (Phase 5) =====
.audience-section { margin-top: 8px; }
.my-rank-card { display: flex; align-items: center; gap: 16px; padding: 18px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; margin-bottom: 16px; }
.rank-number { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; flex-shrink: 0; background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.8);
  &.rank-gold { background: linear-gradient(135deg, #ffd700, #ffb300); color: #fff; }
  &.rank-silver { background: linear-gradient(135deg, #bdc3c7, #95a5a6); color: #fff; }
  &.rank-bronze { background: linear-gradient(135deg, #e67e22, #d35400); color: #fff; }
  &.rank-top { background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; }
}
.rank-detail { display: flex; flex-direction: column; gap: 4px;
  .rank-label { font-size: 14px; color: rgba(255,255,255,0.6); }
  .rank-votes { font-size: 18px; font-weight: 700; color: rgba(255,255,255,0.9); }
}
.rank-list { display: flex; flex-direction: column; gap: 6px; }
.rank-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 8px;
  &.is-me { background: rgba(102,126,234,0.12); border: 1px solid rgba(102,126,234,0.3); }
}
.rank-pos { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.5); width: 22px; text-align: center; }
.rank-name { font-size: 13px; color: rgba(255,255,255,0.8); width: 80px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-bar-track { flex: 1; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
.rank-bar-fill { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 3px; transition: width 0.5s; }
.rank-vote-count { font-size: 12px; color: rgba(255,255,255,0.5); width: 50px; text-align: right; flex-shrink: 0; }

// ===== 动画 =====
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes dotBounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.3; } 40% { transform: translateY(-12px); opacity: 1; } }
@keyframes revealIn { from { opacity: 0; transform: scale(0.5) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }

// ===== 移动端 =====
@media (max-width: 768px) {
  .perf-page { min-height: calc(100vh - 56px); padding: 12px; padding-bottom: 72px; }
  .locked-stage, .waiting-stage {
    .locked-glow, .waiting-glow { width: 200px; height: 200px; }
    .locked-icon, .waiting-icon { font-size: 60px; }
    h2 { font-size: 20px; }
  }
  .draw-stage .stage-badge { font-size: 12px; padding: 4px 16px; }
  .draw-area .draw-icon { font-size: 48px; } .draw-area h2 { font-size: 18px; }
  .draw-btn { padding: 14px 36px; font-size: 16px; }
  .slot-numbers { max-width: 280px; }
  .slot-num { width: 36px; height: 36px; font-size: 14px; }
  .result-value { font-size: 56px; }
  .result-label { font-size: 16px; }
  .results-stage { padding-top: 12px; }
  .results-header h1 { font-size: 20px; }
  .perf-card { padding: 20px; .perf-value { font-size: 40px; } }
  .seats-grid { grid-template-columns: repeat(15, 1fr); gap: 3px; }
  .seat-item .seat-icon { font-size: 12px; }
}
@media (max-width: 480px) {
  .perf-page { min-height: calc(100vh - 48px); padding: 10px; padding-bottom: 66px; }
  .result-value { font-size: 44px; }
  .perf-card { padding: 16px; .perf-value { font-size: 32px; } }
  .seats-grid { grid-template-columns: repeat(10, 1fr); gap: 2px; }
  .seat-item .seat-icon { font-size: 10px; }
}
// ===== 得分详情 =====
.score-detail-section {
  width: 100%;
  max-width: 700px;
  margin-top: 20px;
}

.section-title-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
  color: #ffd700;
}

.section-icon { font-size: 20px; }

.detail-block {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}

.detail-block-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255,255,255,0.7);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.breakdown-table {
  width: 100%;
  border-collapse: collapse;

  tr {
    border-bottom: 1px solid rgba(255,255,255,0.03);
  }

  tr:last-child { border-bottom: none; }

  td {
    padding: 8px 4px;
    font-size: 13px;
  }

  .label {
    color: rgba(255,255,255,0.45);
    white-space: nowrap;
    width: 90px;
    vertical-align: top;
  }

  .value {
    color: rgba(255,255,255,0.75);

    &.formula {
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 12px;
      color: rgba(255,255,255,0.65);
      line-height: 1.6;
    }

    strong {
      color: #fff;
      font-weight: 700;
    }

    &.highlight {
      strong {
        color: #ffd700;
        font-size: 15px;
      }
    }
  }

  .formula-row td { padding: 10px 4px; }

  .result-row td {
    padding: 10px 4px 6px;
    border-top: 1px solid rgba(255,215,0,0.2);
  }
}

.results-preview {
  width: 100%;
  max-width: 700px;
  margin-top: 20px;

  .info-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}

</style>