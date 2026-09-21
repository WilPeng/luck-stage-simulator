<template>
  <div class="admin-performance">
  <div class="page-header">
    <h1>第{{ currentRoundNumber }}次公演结算中心</h1>
    <div class="page-tabs">
      <t-tabs v-model="activeTab" @change="handleTabChange">
        <t-tab-panel value="settlement" label="公演结算">
          <!-- ==================== 阶段二：公演结算 ==================== -->
          <div class="step-section">
            <!-- 结算参数配置：展示参考统计 + 得票率除数 -->
            <div class="settle-config-card" v-if="!hasCalculated">
              <div class="config-title">🎯 结算参数</div>
              <div class="config-stats">
                <div class="config-stat-item">
                  <span class="stat-value">{{ avgCharm }}</span>
                  <span class="stat-label">当前所有玩家平均魅力</span>
                </div>
                <div class="config-stat-item">
                  <span class="stat-value">{{ estTeamScore }}</span>
                  <span class="stat-label">队伍得分大致平均（估算）</span>
                </div>
              </div>
              <div class="config-row">
                <span class="config-row-label">队伍得票率除数（原为150）</span>
                <t-input-number
                  v-model="yesRateDenominator"
                  :min="1"
                  :max="10000"
                  theme="column"
                  style="width: 140px"
                />
                <t-button
                  theme="primary"
                  variant="outline"
                  size="small"
                  :loading="savingConfig"
                  @click="handleSaveConfig"
                >
                  保存
                </t-button>
              </div>
              <p class="config-hint">
                队伍得票率 = (队伍得分 + 平均魅力×0.5) / 除数。除数越大，得票率越低；请根据上方参考值调整。
              </p>
            </div>

            <!-- 3.4 团队评级规则 -->
            <div class="settle-config-card">
              <div class="config-title">🧩 团队评级规则（按顺序判定，首个满足即生效）</div>
              <div class="rule-rows">
                <div v-for="(r, i) in teamRules" :key="i" class="rule-block">
                  <div class="rule-line1">
                    <span class="rule-idx">规则 {{ i + 1 }}</span>
                    <t-select v-model="r.combine" size="small" style="width: 150px">
                      <t-option value="all" label="全部满足 (AND)" />
                      <t-option value="any" label="满足任一 (OR)" />
                    </t-select>
                    <span>→ 团队评级</span>
                    <t-select v-model="r.teamRating" size="small" style="width: 90px">
                      <t-option v-for="rt in ['S','A','B','C','D']" :key="rt" :value="rt" :label="rt" />
                    </t-select>
                    <button class="bb-btn bb-btn-xs" @click="moveRule(i,-1)" :disabled="i===0">↑</button>
                    <button class="bb-btn bb-btn-xs" @click="moveRule(i,1)" :disabled="i===teamRules.length-1">↓</button>
                    <button class="bb-btn bb-btn-xs bb-btn-danger" @click="teamRules.splice(i,1)">删除规则</button>
                  </div>
                  <div class="rule-conds">
                    <div v-for="(c, ci) in r.conditions" :key="ci" class="rule-cond">
                      <t-select v-model="c.metric" size="small" style="width: 160px">
                        <t-option value="countRating" label="某评级人数" />
                        <t-option value="teamScore" label="团队总分" />
                        <t-option value="avgCharm" label="队伍平均魅力" />
                        <t-option value="avgPerformance" label="平均发挥成绩" />
                        <t-option value="avgVocal" label="队伍平均声乐" />
                        <t-option value="avgDance" label="队伍平均舞蹈" />
                      </t-select>
                      <t-select v-if="c.metric === 'countRating'" v-model="c.ratings" multiple size="small" style="width: 180px">
                        <t-option v-for="rt in ['S','A','B','C','D']" :key="rt" :value="rt" :label="rt" />
                      </t-select>
                      <t-select v-model="c.op" size="small" style="width: 90px">
                        <t-option value=">=" label="≥" />
                        <t-option value="<=" label="≤" />
                        <t-option value=">" label="＞" />
                        <t-option value="<" label="＜" />
                        <t-option value="=" label="＝" />
                      </t-select>
                      <input class="rule-count" type="number" v-model.number="c.value" />
                      <button class="bb-btn bb-btn-xs bb-btn-danger" @click="r.conditions.splice(ci,1)">✕</button>
                    </div>
                    <button class="bb-btn bb-btn-xs" @click="addCondition(r)">+ 条件</button>
                  </div>
                </div>
              </div>
              <t-space>
                <t-button size="small" variant="outline" @click="addRule">+ 新增规则</t-button>
                <t-button size="small" theme="primary" :loading="savingRules" @click="saveRules">保存规则</t-button>
              </t-space>
              <p class="config-hint">每条规则由若干条件组成，选择「全部满足(AND)」或「满足任一(OR)」；条件为空表示兜底。规则按顺序判定，首个满足即生效。评级对应：S超级完美 / A完美 / B正常 / C翻车 / D惨不忍睹。</p>
            </div>

            <!-- 3.3 个人掷骰情况（管理员可代理掷骰） -->
            <div class="settle-config-card">
              <div class="config-title">🎲 个人评级掷骰情况</div>
              <t-space style="margin-bottom: 10px">
                <t-button size="small" variant="outline" :loading="ratingsLoading" @click="loadRatings">刷新</t-button>
                <t-button size="small" theme="primary" variant="outline" :loading="rollingAll" @click="rollAllPending">为未投掷选手代理掷骰</t-button>
                <span class="config-hint">已投掷 {{ ratingList.filter(r => r.rating).length }} / {{ ratingList.length }}</span>
              </t-space>
              <div class="rating-table">
                <div class="rt-header">
                  <span>选手</span><span>队伍</span><span>歌曲</span><span>难度</span><span>风险值</span><span>评级权重</span><span>状态</span><span>评级</span><span>点数</span><span>操作</span>
                </div>
                <div v-for="r in pagedRatingList" :key="r.playerId" class="rt-row">
                  <span class="rt-name">{{ r.playerName }}</span>
                  <span>{{ r.teamName || '-' }}</span>
                  <span>{{ r.songName || '-' }}</span>
                  <span>{{ r.difficulty ?? '-' }}</span>
                  <span>{{ r.risk ?? '-' }}</span>
                  <span class="rt-weights">{{ ratingWeightsText(r) }}</span>
                  <span :class="r.rating ? 'done-text' : 'pending-text'">{{ r.rating ? '已投掷' : (r.hasTeam && r.hasSong ? '未投掷' : '未分组/未选歌') }}</span>
                  <span>{{ r.rating || '-' }}</span>
                  <span>{{ r.ratingRoll ?? '-' }}</span>
                  <span>
                    <t-button size="small" theme="primary" variant="outline" :disabled="!r.hasTeam || !r.hasSong" @click="proxyRoll(r)">
                      {{ r.rating ? '重掷' : '代理掷骰' }}
                    </t-button>
                  </span>
                </div>
                <div v-if="ratingList.length === 0" class="rt-empty">暂无选手数据</div>
              </div>
              <div v-if="ratingTotalPages > 1" class="rt-pager">
                <t-pagination v-model="ratingPage" :total="ratingList.length" :page-size="ratingPageSize" theme="simple" />
              </div>
            </div>

            <div class="action-section">
              <t-button
                theme="danger"
                size="large"
                block
                :loading="calculating"
                :disabled="hasCalculated"
                @click="handleCalculate"
              >
                {{ hasCalculated ? '已结算' : '开始公演结算' }}
              </t-button>
            </div>

            <!-- 队伍总览 -->
            <div class="teams-section">
              <h2>队伍总览</h2>
              <div class="teams-table">
                <div class="table-header">
                  <span>队伍</span>
                  <span>歌曲</span>
                  <span>人数</span>
                  <span>状态</span>
                  <span>操作</span>
                </div>
                <div
                  v-for="team in teamPerformanceResults"
                  :key="team.teamId"
                  class="table-row"
                >
                  <span class="team-name">{{ team.teamName }}</span>
                  <span class="song-name">{{ team.songName }}</span>
                  <span class="member-count">{{ team.memberCount }}人</span>
                  <t-tag :theme="team.status === 'confirmed' ? 'success' : 'warning'" variant="light" size="small">
                    {{ team.status === 'confirmed' ? '已揭晓' : '待揭晓' }}
                  </t-tag>
                  <t-button
                    v-if="team.status !== 'confirmed'"
                    size="small"
                    theme="primary"
                    @click="handleRevealTeam(team)"
                  >
                    揭晓
                  </t-button>
                  <span v-else class="done-text">✓</span>
                </div>
              </div>
            </div>

            <!-- 团队得票揭晓（网格布局：每行多个团队，逐个揭晓百/十/个位） -->
            <div class="teams-section vote-reveal-section">
              <h2>团队得票揭晓</h2>
              <div class="vote-teams-grid">
                <div v-for="team in teamPerformanceResults" :key="'vr-' + team.teamId" class="vote-team-card">
                  <span class="vt-name">{{ team.teamName }}<template v-if="team.songName">《{{ team.songName }}》</template></span>
                  <VoteRevealDigits
                    :votes="team.finalVotes || 0"
                    :reveal="{ hundreds: !!team.revealHundreds, tens: !!team.revealTens, units: !!team.revealUnits }"
                  />
                  <div class="vt-btns">
                    <t-button size="small" variant="outline" :disabled="!!team.revealHundreds" @click="handleRevealDigit(team, 'hundreds')">揭晓百位</t-button>
                    <t-button size="small" variant="outline" :disabled="!!team.revealTens" @click="handleRevealDigit(team, 'tens')">揭晓十位</t-button>
                    <t-button size="small" variant="outline" :disabled="!!team.revealUnits" @click="handleRevealDigit(team, 'units')">揭晓个位</t-button>
                  </div>
                </div>
                <div v-if="teamPerformanceResults.length === 0" class="info-card dim"><span>等待公演结算</span></div>
              </div>
            </div>

    <!-- 已揭晓队伍详情（内联卡片，可点叉关闭；每次揭晓追加一张，最新在最前） -->
    <div
      v-for="revealDialogTeam in selectedTeamForReveal"
      :key="revealDialogTeam.teamId"
      class="detail-section reveal-inline-card"
    >
      <div class="reveal-card-head">
        <h2>{{ revealDialogTeam.teamName }} — 结算详情</h2>
        <span class="close-detail" @click="closeRevealCard(revealDialogTeam.teamId)">✕</span>
      </div>
      <div class="team-detail">
          <div class="detail-item">
            <span class="detail-label">歌曲</span>
            <span class="detail-value">{{ revealDialogTeam.songName }}</span>
          </div>
          <div class="detail-item team-rating-block">
            <span class="detail-label">团队综合评级</span>
            <div class="team-rating-display">
              <t-tag :theme="getRatingTheme(revealDialogTeam.teamRating)" size="large" class="team-rating-tag">
                {{ revealDialogTeam.teamRating }} · {{ revealDialogTeam.teamRatingText }}
              </t-tag>
            </div>
          </div>
          <!-- 成员舞台评级与计算过程（合并） -->
          <div class="detail-item calc-process-block">
            <span class="detail-label">成员舞台评级与计算过程</span>
            <div class="calc-process">
              <div
                v-for="p in getTeamPlayers(revealDialogTeam)"
                :key="'calc-' + p.playerId"
                class="calc-line member-calc"
                @click="togglePlayerExpanded(p.playerId)"
              >
                <div class="mc-head">
                  <strong>{{ p.playerName }}</strong>
                  <t-tag :theme="getRatingTheme(p.stageRating)" size="small" class="rating-tag">{{ p.stageRating }} · {{ p.stageRatingText }}</t-tag>
                  <span v-if="p.ratingRoll != null" class="roll-text">骰子 {{ p.ratingRoll }} 点</span>
                  <span class="expand-icon">{{ expandedPlayers.has(p.playerId) ? '▲' : '▼' }}</span>
                </div>
                <div v-if="expandedPlayers.has(p.playerId)" class="mc-detail">
                  主属性 {{ ratingAttrLabel(p.ratingMainAttr) }} · 难度 {{ p.ratingDifficulty || 0 }} 面骰 · 风险值 {{ p.ratingRisk || 0 }} · 主属性基准 {{ p.ratingMainBase || 0 }}
                  ｜超出基准 {{ p.ratingExcess || 0 }}（{{ p.ratingSteps || 0 }}×风险值）→ A面 {{ p.ratingFaces?.a ?? 0 }} / B面 {{ p.ratingFaces?.b ?? 0 }} / C面 {{ p.ratingFaces?.c ?? 0 }}
                  <template v-if="(p.ratingDeficit || 0) > 0">｜未达标差值 {{ p.ratingDeficit }}（{{ p.ratingDeficitSteps }}×风险值）→ D面 {{ p.ratingFaces?.d ?? 0 }}</template>
                </div>
              </div>
              <div class="calc-line team">{{ teamRuleProcess(revealDialogTeam) }}</div>
            </div>
          </div>
          <!-- 大众评审得票率计算过程 -->
          <div class="detail-item calc-process-block">
            <span class="detail-label">大众评审得票率计算过程</span>
            <div class="calc-process">
              <div class="calc-line">队内发挥后魅力均值 = {{ round2(revealDialogTeam.avgCharmPerf) }}</div>
              <div class="calc-line">队内发挥后最高魅力 = {{ round2(revealDialogTeam.maxCharmPerf) }}</div>
              <div class="calc-line">全体发挥后最高魅力 = {{ round2(revealDialogTeam.globalMaxCharmPerf) }}</div>
              <div class="calc-line">团队评级权重（{{ revealDialogTeam.teamRating }}）= {{ revealDialogTeam.teamRatingWeight }}</div>
              <div class="calc-line team">
                得票率 = ({{ round2(revealDialogTeam.avgCharmPerf) }} + {{ round2(revealDialogTeam.maxCharmPerf) }})
                ÷ (2 × {{ round2(revealDialogTeam.globalMaxCharmPerf) }})
                × {{ revealDialogTeam.teamRatingWeight ?? 1 }}
                = {{ yesRatePct(revealDialogTeam) }}%
              </div>
            </div>
          </div>

          <!-- 大众评审投票矩阵 -->
          <div class="detail-item audience-matrix-block">
            <div class="matrix-header">
              <span class="detail-label">大众评审投票矩阵</span>
              <span class="matrix-stat">
                投 YES：{{ teamAudienceMatrices[revealDialogTeam.teamId]?.filter(s => s.votedYes).length || 0 }} / {{ teamAudienceMatrices[revealDialogTeam.teamId]?.length || 1000 }}
              </span>
            </div>
            <div v-if="loadingTeamMatrix[revealDialogTeam.teamId]" class="matrix-loading">
              <t-loading size="small" text="加载评审矩阵中..." />
            </div>
            <div v-else-if="!teamAudienceMatrices[revealDialogTeam.teamId]?.length" class="matrix-empty">
              暂无大众评审投票记录
            </div>
            <div v-else class="audience-matrix">
              <div
                v-for="seat in teamAudienceMatrices[revealDialogTeam.teamId]"
                :key="`${revealDialogTeam.teamId}-${seat.seatNumber}`"
                class="matrix-seat"
                :class="{ yes: seat.votedYes }"
              >
                <t-tooltip placement="top">
                  <template #content>
                    <div>{{ seat.seatNumber }}号 · {{ seat.name || '未知评审' }}</div>
                    <div style="font-size:12px;opacity:0.8">{{ seat.gender }} · {{ seat.age }}岁 · {{ seat.occupation }}</div>
                    <div style="font-size:12px;opacity:0.8">{{ seat.votedYes ? '投了 YES' : '未投 YES' }}</div>
                  </template>
                  <div class="seat-inner">
                    <div class="seat-name">{{ seat.name || '未知' }}</div>
                    <div class="seat-gender-age">{{ seat.gender }} {{ seat.age }}岁</div>
                    <div class="seat-occupation">{{ seat.occupation }}</div>
                  </div>
                </t-tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>

            <!-- 团队排名 -->
            <div v-if="allTeamsRevealed" class="ranking-section">
              <h2>最终排名</h2>
              <div class="ranking-list">
                <div v-for="team in sortedTeamResults" :key="team.teamId" class="ranking-item">
                  <span class="rank">{{ team.rank }}</span>
                  <span class="team-name">{{ team.teamName }}</span>
                  <span class="score">{{ team.finalVotes }}分</span>
                </div>
              </div>
            </div>
          </div>
        </t-tab-panel>

        <t-tab-panel value="audience-vote" label="喜爱度票数">
          <!-- ==================== 阶段三：喜爱度票数 ==================== -->
          <div class="step-section">
            <AudienceVoteView :round-id="currentRoundIdComputed" embedded @release="handleAudienceVoteReleased" />
          </div>
        </t-tab-panel>

        <t-tab-panel value="elimination" label="淘汰阶段">
          <!-- ==================== 阶段四：淘汰阶段 ==================== -->
          <div class="step-section">
            <div class="elimination-placeholder" style="text-align: center; padding: 40px;">
              <p>淘汰阶段将在喜爱度票数公布后进行</p>
              <t-button theme="primary" @click="handleGoToEliminationPage">
                进入淘汰阶段页面
              </t-button>
            </div>
          </div>
        </t-tab-panel>
      </t-tabs>
    </div>
  </div>
</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { usePerformanceStore } from '../../stores/performanceStore'
import { useSeasonStore } from '../../stores/seasonStore'
import { useTeamStore } from '../../stores/teamStore'
import { useSongStore } from '../../stores/songStore'
import { usePlayerStore } from '../../stores/playerStore'
import { calculatePerformanceResults } from '../../utils/performanceCalculator'
import { saveRevealedTeams, loadRevealedTeams } from '../../services/performanceService'
import type { PlayerStatus } from '../../services/performanceService'
import type { TeamAudienceMatrixSeat, PerformanceGenerationMode } from '../../types/performance'
import { setPerformanceGenerationMode, getTeamRatingRules, updateTeamRatingRules, getRatingOverview, adminRollRating, revealVoteDigit } from '../../services/api'
import VoteRevealDigits from '../../components/common/VoteRevealDigits.vue'
import AudienceVoteView from './AudienceVoteView.vue'

const router = useRouter()
const route = useRoute()
const performanceStore = usePerformanceStore()
const seasonStore = useSeasonStore()
const teamStore = useTeamStore()
const songStore = useSongStore()
const playerStore = usePlayerStore()

// ==================== 阶段状态 ====================
const activeTab = ref('settlement') // 'settlement'=公演结算, 'audience-vote'=喜爱度票数, 'elimination'=淘汰（发挥值已独立为单独页面）

function handleTabChange(value: string) {
  console.log('[Performance] Tab changed to:', value)
  // 可以在这里添加 tab 切换时的逻辑
}

// ==================== 轮次 ====================
const currentRoundNumber = computed(() => {
  const routeRound = Number(route.params.round)
  return routeRound || seasonStore.currentRoundNumber
})

const currentRoundIdComputed = computed(() => {
  return `round-${currentRoundNumber.value}`
})

// ==================== 阶段一：选手发挥 ====================
const performanceStarted = ref<boolean | null>(null) // null = 未确认，false = 未开启，true = 已开启
const generationMode = ref<PerformanceGenerationMode>('random')
const playerStatuses = ref<any[]>([])
const playerPage = ref(1)
const generatingPlayerId = ref('')
const bulkGenerating = ref(false)
const revokingPlayerId = ref('')
const bulkRevoking = ref(false)
// 勾选撤回的选手
const selectedRevokeIds = ref<string[]>([])

const generatedPlayers = computed(() => playerStatuses.value.filter((p: any) => p.generated))

// 从队伍数据中提取所有选手
const allPlayers = computed(() => {
  const players: any[] = []
  for (const team of teamStore.teams) {
    if (team.members) {
      for (const member of team.members) {
        players.push({
          playerId: member.playerId,
          playerName: member.player?.name || '未知',
          teamId: team.id,
          teamName: team.name,
          generated: false,
          performanceValue: null
        })
      }
    }
  }
  return players
})

const generatedCount = computed(() => playerStatuses.value.filter((p: any) => p.generated).length)

const pagedPlayers = computed(() => {
  const start = (playerPage.value - 1) * 5
  return playerStatuses.value.slice(start, start + 5)
})

// 初始化选手状态（从后端获取或新建）
async function initPlayerStatuses() {
  const roundId = currentRoundIdComputed.value
  try {
    const { getPlayerPerformanceStatus } = await import('../../services/api')
    const result = await getPlayerPerformanceStatus(roundId)
    if (result.generationMode) {
      generationMode.value = result.generationMode
    }
    if (result.players?.length > 0) {
      playerStatuses.value = result.players
      performanceStarted.value = result.started || false
      return
    }
  } catch (_) {}
  // 后端无数据，新建空状态
  playerStatuses.value = allPlayers.value.map((p: any) => ({
    ...p,
    generated: false,
    performanceValue: null
  }))
}

// 持久化当前选手状态到后端+localStorage兜底
async function persistPlayerStatuses() {
  const roundId = currentRoundIdComputed.value
  if (!roundId) return
  // 先写入 localStorage 兜底（不管后端是否成功）
  try {
    const { savePlayerStatuses } = await import('../../services/performanceService')
    savePlayerStatuses(roundId, playerStatuses.value.map((p: any) => ({
      playerId: p.playerId,
      playerName: p.playerName,
      teamId: p.teamId,
      teamName: p.teamName,
      generated: p.generated || p.performanceValue !== null,
      performanceValue: p.performanceValue
    })))
  } catch { /* 静默 */ }
  // 再尝试同步到后端
  try {
    const { savePerformancePlayerStatus } = await import('../../services/api')
    const players = playerStatuses.value.map((p: any) => ({
      playerId: p.playerId,
      performanceValue: p.performanceValue
    }))
    await savePerformancePlayerStatus(roundId, players)
  } catch (e: any) {
    console.error('[Performance] 保存选手状态到后端失败:', e.message)
  }
}

// 切换生成方式
async function handleGenerationModeChange(value: string | number | boolean) {
  const mode = value as PerformanceGenerationMode
  generationMode.value = mode
  try {
    await setPerformanceGenerationMode(currentRoundIdComputed.value, mode)
    MessagePlugin.success(`已切换到${mode === 'random' ? '随机生成' : '互动小游戏'}模式`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '切换生成方式失败')
  }
}

// 管理员开启公演
async function handleStartPerformance() {
  try {
    const { startPerformance, getPlayerPerformanceStatus } = await import('../../services/api')
    await startPerformance(currentRoundIdComputed.value || `round-${currentRound.value}`, generationMode.value)
    performanceStarted.value = true

    // 开启前先拉取一次最新状态，避免覆盖选手已生成的数据
    try {
      const result = await getPlayerPerformanceStatus(currentRoundIdComputed.value)
      if (result.players?.length > 0) {
        playerStatuses.value = result.players
      }
    } catch { /* 无数据时保持当前状态 */ }

    persistPlayerStatuses()
    MessagePlugin.success('公演已开启，选手可以开始操作')
  } catch (e: any) {
    MessagePlugin.error(e.message || '开启公演失败')
  }
}

// 为单个选手生成随机发挥值
function generateRandomValue(): number {
  return Math.floor(Math.random() * 31) - 10 // -10 ~ 20
}

function handleGeneratePlayer(player: any) {
  generatingPlayerId.value = player.playerId
  setTimeout(() => {
    const idx = playerStatuses.value.findIndex((p: any) => p.playerId === player.playerId)
    if (idx !== -1) {
      playerStatuses.value[idx].generated = true
      playerStatuses.value[idx].performanceValue = generateRandomValue()
    }
    generatingPlayerId.value = ''
    persistPlayerStatuses()
  }, 300)
}

function handleGenerateAll() {
  bulkGenerating.value = true
  setTimeout(() => {
    for (const p of playerStatuses.value) {
      if (!p.generated) {
        p.generated = true
        p.performanceValue = generateRandomValue()
      }
    }
    persistPlayerStatuses()
    bulkGenerating.value = false
    MessagePlugin.success('已为所有选手生成发挥值')
  }, 500)
}

// 撤回单个选手发挥值（清除本地 + 后端）
async function handleRevokePlayer(player: any) {
  revokingPlayerId.value = player.playerId
  try {
    const roundId = currentRoundIdComputed.value
    if (roundId) {
      const { revokePlayerPerformance } = await import('../../services/api')
      await revokePlayerPerformance(roundId, [player.playerId])
    }
    const idx = playerStatuses.value.findIndex((p: any) => p.playerId === player.playerId)
    if (idx !== -1) {
      playerStatuses.value[idx].generated = false
      playerStatuses.value[idx].performanceValue = null
    }
    // 同步清除 localStorage
    const uid = player.playerId
    const { loadPlayerStatuses, savePlayerStatuses } = await import('../../services/performanceService')
    const statuses = loadPlayerStatuses(`round-${currentRoundNumber.value}`)
    const filtered = statuses.filter((s: any) => s.playerId !== uid)
    savePlayerStatuses(`round-${currentRoundNumber.value}`, filtered)
    MessagePlugin.success(`已撤回 ${player.playerName || '该选手'} 的发挥值`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '撤回失败')
  } finally {
    revokingPlayerId.value = ''
  }
}

// 撤回所选选手发挥值（批量）
async function handleRevokeSelected() {
  if (selectedRevokeIds.value.length === 0) {
    MessagePlugin.warning('请先勾选要撤回的选手')
    return
  }
  const ok = window.confirm(`确定撤回所选 ${selectedRevokeIds.value.length} 位选手的发挥值吗？`)
  if (!ok) return
  bulkRevoking.value = true
  try {
    const roundId = currentRoundIdComputed.value
    if (roundId) {
      const { revokePlayerPerformance } = await import('../../services/api')
      await revokePlayerPerformance(roundId, selectedRevokeIds.value)
    }
    const idSet = new Set(selectedRevokeIds.value)
    for (const p of playerStatuses.value) {
      if (idSet.has(p.playerId)) {
        p.generated = false
        p.performanceValue = null
      }
    }
    // 同步清除 localStorage
    const { loadPlayerStatuses, savePlayerStatuses } = await import('../../services/performanceService')
    const statuses = loadPlayerStatuses(`round-${currentRoundNumber.value}`)
    const filtered = statuses.filter((s: any) => !idSet.has(s.playerId))
    savePlayerStatuses(`round-${currentRoundNumber.value}`, filtered)
    selectedRevokeIds.value = []
    MessagePlugin.success(`已撤回 ${idSet.size} 位选手的发挥值`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '批量撤回失败')
  } finally {
    bulkRevoking.value = false
  }
}

// 撤回全部选手发挥值
async function handleRevokeAll() {
  if (generatedCount.value === 0) {
    MessagePlugin.warning('暂无已生成的发挥值')
    return
  }
  const ok = window.confirm(`确定撤回全部 ${generatedCount.value} 位选手的发挥值吗？此操作不可撤销。`)
  if (!ok) return
  bulkRevoking.value = true
  try {
    const roundId = currentRoundIdComputed.value
    if (roundId) {
      const { revokePlayerPerformance } = await import('../../services/api')
      await revokePlayerPerformance(roundId)
    }
    for (const p of playerStatuses.value) {
      p.generated = false
      p.performanceValue = null
    }
    const { savePlayerStatuses } = await import('../../services/performanceService')
    savePlayerStatuses(`round-${currentRoundNumber.value}`, [])
    selectedRevokeIds.value = []
    MessagePlugin.success('已撤回全部选手的发挥值')
  } catch (e: any) {
    MessagePlugin.error(e.message || '撤回全部失败')
  } finally {
    bulkRevoking.value = false
  }
}

function toggleRevokeSelect(playerId: string) {
  const idx = selectedRevokeIds.value.indexOf(playerId)
  if (idx >= 0) selectedRevokeIds.value.splice(idx, 1)
  else selectedRevokeIds.value.push(playerId)
}

function toggleSelectAllRevoke(checked: boolean) {
  if (checked) {
    selectedRevokeIds.value = generatedPlayers.value.map((p: any) => p.playerId)
  } else {
    selectedRevokeIds.value = []
  }
}

function handleGoToSettlement() {
  activeTab.value = 'settlement'
}

// ==================== 阶段二：公演结算 ====================
const calculating = ref(false)
const selectedTeamForReveal = ref<any[]>([])
function closeRevealCard(teamId: string) {
  selectedTeamForReveal.value = selectedTeamForReveal.value.filter((t: any) => t.teamId !== teamId)
}

// 逐位揭晓队伍票数（百/十/个）
async function handleRevealDigit(team: any, digit: string) {
  try {
    await revealVoteDigit(currentRoundIdComputed.value, team.teamId, digit as any, true)
    const key = digit === 'hundreds' ? 'revealHundreds' : digit === 'tens' ? 'revealTens' : 'revealUnits'
    team[key] = true
    performanceStore.teamPerformanceResults = [...performanceStore.teamPerformanceResults]
  } catch (e: any) {
    MessagePlugin.error(e?.message || '揭晓失败')
  }
}
const allTeamsRevealed = ref(false)
// 展开的选手公式详情（使用 Set 避免依赖动态属性）
const expandedPlayers = reactive(new Set<string>())
function togglePlayerExpanded(playerId: string) {
  if (expandedPlayers.has(playerId)) expandedPlayers.delete(playerId)
  else expandedPlayers.add(playerId)
}
// 获取队伍的成员列表（兼容 playerPerformances 和 memberPerformances 两种字段名）
function getTeamPlayers(team: any): any[] {
  return team?.playerPerformances || team?.memberPerformances || []
}

const teamPerformanceResults = computed(() => performanceStore.teamPerformanceResults)
// 最终排名：按 rank（公演名次）升序展示
const sortedTeamResults = computed(() =>
  [...performanceStore.teamPerformanceResults].sort((a: any, b: any) => (a.rank || 999) - (b.rank || 999))
)
const hasCalculated = computed(() => teamPerformanceResults.value.length > 0)

// ===== 结算参数：队伍得票率除数 + 参考统计 =====
const yesRateDenominator = ref<number>(150)
const savingConfig = ref(false)

// ===== 3.4 团队评级规则 =====
const teamRules = ref<any[]>([])
const savingRules = ref(false)

// 归一化规则（兼容旧 {count,ratings} 结构）
function normalizeFrontRule(raw: any): any {
  if (Array.isArray(raw?.conditions)) {
    return { combine: raw.combine || 'all', teamRating: raw.teamRating || 'B', conditions: raw.conditions.map((c: any) => ({ ...c })) }
  }
  const cnt = Number(raw?.count) || 0
  return {
    combine: 'all',
    teamRating: raw?.teamRating || 'B',
    conditions: cnt > 0 ? [{ metric: 'countRating', ratings: raw.ratings || [], op: '>=', value: cnt }] : []
  }
}

async function loadRules() {
  try {
    const res: any = await getTeamRatingRules()
    teamRules.value = (res?.rules || []).map(normalizeFrontRule)
  } catch { /* ignore */ }
}
function addCondition(rule: any) {
  if (!Array.isArray(rule.conditions)) rule.conditions = []
  rule.conditions.push({ metric: 'countRating', ratings: ['C'], op: '>=', value: 1 })
}
function addRule() {
  teamRules.value.push({ combine: 'all', teamRating: 'C', conditions: [{ metric: 'countRating', ratings: ['C'], op: '>=', value: 1 }] })
}
function moveRule(i: number, dir: -1 | 1) {
  const t = i + dir
  if (t < 0 || t >= teamRules.value.length) return
  const a = [...teamRules.value]; [a[i], a[t]] = [a[t], a[i]]; teamRules.value = a
}
async function saveRules() {
  savingRules.value = true
  try {
    const payload = teamRules.value.map(r => ({
      combine: r.combine || 'all',
      teamRating: r.teamRating || 'B',
      conditions: (r.conditions || []).map((c: any) => ({
        metric: c.metric,
        ratings: c.metric === 'countRating' ? (c.ratings || []) : [],
        op: c.op || '>=',
        value: Number(c.value) || 0
      }))
    }))
    await updateTeamRatingRules(payload)
    MessagePlugin.success('团队评级规则已保存')
  } catch (e: any) { MessagePlugin.error(e?.message || '保存失败') } finally { savingRules.value = false }
}

// ===== 3.3 个人掷骰情况（管理员代理投掷） =====
const ratingList = ref<any[]>([])
const ratingsLoading = ref(false)
const rollingAll = ref(false)

async function loadRatings() {
  ratingsLoading.value = true
  try {
    const res: any = await getRatingOverview(currentRoundIdComputed.value)
    ratingList.value = res?.list || []
  } catch (e: any) {
    MessagePlugin.error(e?.message || '加载掷骰情况失败')
  } finally {
    ratingsLoading.value = false
  }
}

async function proxyRoll(r: any) {
  try {
    await adminRollRating(r.playerId, currentRoundIdComputed.value)
    await loadRatings()
    MessagePlugin.success(`${r.playerName} 已代理掷骰`)
  } catch (e: any) {
    MessagePlugin.error(e?.message || '代理掷骰失败')
  }
}

async function rollAllPending() {
  const pending = ratingList.value.filter(r => !r.rating && r.hasTeam && r.hasSong)
  if (!pending.length) { MessagePlugin.info('没有可代理掷骰的选手'); return }
  rollingAll.value = true
  let ok = 0
  for (const r of pending) {
    try { await adminRollRating(r.playerId, currentRoundIdComputed.value); ok++ } catch { /* skip */ }
  }
  rollingAll.value = false
  await loadRatings()
  MessagePlugin.success(`已为 ${ok} 位选手代理掷骰`)
}

// ===== 个人掷骰表分页 =====
const ratingPage = ref(1)
const ratingPageSize = ref(20)
const ratingTotalPages = computed(() => Math.max(1, Math.ceil(ratingList.value.length / ratingPageSize.value)))
const pagedRatingList = computed(() => {
  const start = (ratingPage.value - 1) * ratingPageSize.value
  return ratingList.value.slice(start, start + ratingPageSize.value)
})
function ratingWeightsText(r: any): string {
  const f = r?.faces
  if (!f || !f.faces) return '-'
  const total = f.faces.total || 1
  const pct = (n: number) => Math.round((n / total) * 100)
  const parts = [`A ${pct(f.faces.a)}%`, `B ${pct(f.faces.b)}%`, `C ${pct(f.faces.c)}%`]
  if ((f.faces.d || 0) > 0) parts.push(`D ${pct(f.faces.d)}%`)
  let text = parts.join(' / ')
  if (f.deficit > 0) text += `（差值 ${f.deficit}）`
  return text
}

// 当前所有选手的平均魅力（参考）
const avgCharm = computed(() => {
  const users = playerStore.users.filter((u: any) => u.role !== 'admin' && u.status !== 'eliminated')
  if (users.length === 0) return 0
  const sum = users.reduce((s: number, u: any) => s + (u.attributes?.charm || 0), 0)
  return Math.round(sum / users.length)
})

// 队伍得分大致的平均数（结算前预估：按 3:3:3 权重 + 难度系数0.8 估算属性分）
const estTeamScore = computed(() => {
  const users = playerStore.users.filter((u: any) => u.role !== 'admin' && u.status !== 'eliminated')
  if (users.length === 0) return 0
  const scores = users.map((u: any) => {
    const attr = u.attributes || { vocal: 30, dance: 30, charm: 30 }
    const attrScore = (attr.vocal || 0) * (1/3) + (attr.dance || 0) * (1/3) + (attr.charm || 0) * (1/3)
    const difficultyFactor = 0.8
    return Math.max(0, Math.min(120, Math.round(attrScore * difficultyFactor)))
  })
  return Math.round(scores.reduce((s: number, v: number) => s + v, 0) / scores.length)
})

// 加载已保存的除数配置
async function loadConfig() {
  try {
    const { getPerformanceRoundStatus } = await import('../../services/api')
    const res = await getPerformanceRoundStatus(currentRoundIdComputed.value)
    if (res?.yesRateDenominator) {
      yesRateDenominator.value = res.yesRateDenominator
    }
  } catch (_) { /* 保持默认 */ }
}

async function handleSaveConfig() {
  const denom = parseInt(String(yesRateDenominator.value))
  if (isNaN(denom) || denom < 1 || denom > 10000) {
    MessagePlugin.error('除数必须为 1-10000 之间的整数')
    return
  }
  savingConfig.value = true
  try {
    const { savePerformanceConfig } = await import('../../services/api')
    await savePerformanceConfig(currentRoundIdComputed.value, denom)
    MessagePlugin.success('结算参数已保存')
  } catch (e: any) {
    MessagePlugin.error(e.message || '保存失败')
  } finally {
    savingConfig.value = false
  }
}

// 各队的大众评审投票矩阵 { [teamId]: TeamAudienceMatrixSeat[] }
const teamAudienceMatrices = ref<Record<string, TeamAudienceMatrixSeat[]>>({})
const loadingTeamMatrix = ref<Record<string, boolean>>({})

async function handleCalculate() {
  if (!currentRoundIdComputed.value) return
  const dialog = DialogPlugin.confirm({
    header: '确认结算',
    body: '确定要开始公演结算吗？结算后将生成最终票数结果。',
    onConfirm: async () => {
      dialog.destroy()
      calculating.value = true
      try {
        const { calculatePerformance } = await import('../../services/api')
        const result = await calculatePerformance({
          roundId: currentRoundIdComputed.value,
          round: currentRoundNumber.value
        })
        performanceStore.teamPerformanceResults = result.teamResults || []
        performanceStore.playerPerformanceResults = result.playerResults || []
        MessagePlugin.success('公演结算完成')
      } catch (e: any) {
        MessagePlugin.error('公演结算失败: ' + (e.message || '后端接口异常'))
      } finally {
        calculating.value = false
      }
    }
  })
}

async function loadTeamAudienceMatrix(teamId: string) {
  if (!currentRoundIdComputed.value || !teamId) return
  if (teamAudienceMatrices.value[teamId]?.length) return

  loadingTeamMatrix.value[teamId] = true
  try {
    const { getTeamAudienceMatrix } = await import('../../services/api')
    const res = await getTeamAudienceMatrix(currentRoundIdComputed.value, teamId)
    if (res.success) {
      teamAudienceMatrices.value[teamId] = res.seats || []
    }
  } catch (e: any) {
    console.error('[Performance] 加载团队投票矩阵失败:', e.message)
  } finally {
    loadingTeamMatrix.value[teamId] = false
  }
}

async function handleRevealTeam(team: any) {
  // 追加一张可关闭的结算卡片（最新的在最前）
  if (!selectedTeamForReveal.value.find((t: any) => t.teamId === team.teamId)) {
    selectedTeamForReveal.value.unshift(team)
  }
  team.status = 'confirmed'
  performanceStore.teamPerformanceResults = [...performanceStore.teamPerformanceResults]

  allTeamsRevealed.value = performanceStore.teamPerformanceResults.every((t: any) => t.status === 'confirmed')

  // 加载该队的大众评审投票矩阵
  loadTeamAudienceMatrix(team.teamId)

  // 持久化已揭晓的队伍到后端（选手端据此逐步展示）
  try {
    const { revealTeam } = await import('../../services/api')
    await revealTeam(currentRoundIdComputed.value, team.teamId)
  } catch (e: any) {
    console.warn('持久化揭晓状态失败:', e.message)
  }

  // 本地 localStorage 兜底
  if (currentRoundIdComputed.value) {
    const revealed = teamPerformanceResults.value
      .filter((t: any) => t.status === 'confirmed')
      .map((t: any) => t.teamId)
    saveRevealedTeams(currentRoundIdComputed.value, revealed)
  }
}

function calcRawScore(p: any): number {
  return Math.round((p.attributeScore || 0) * (p.difficultyFactor || 0.8) + (p.performanceBonus || (p.performanceValue || 0) * 2))
}

function getRatingTheme(rating: string): string {
  const map: Record<string, string> = { S: 'success', A: 'primary', B: 'warning', C: 'default', D: 'danger' }
  return map[rating] || 'default'
}

// 按顺序判定并展示命中的团队评级规则（支持新结构：conditions + combine）
function evalCond(cond: any, ctx: any): boolean {
  const op = cond.op || '>='
  const value = Number(cond.value) || 0
  let actual = 0
  switch (cond.metric) {
    case 'countRating': actual = (ctx.memberRatings || []).filter((r: string) => (cond.ratings || []).includes(r)).length; break
    case 'teamScore': actual = ctx.teamScore ?? 0; break
    case 'avgCharm': actual = ctx.avgCharm ?? 0; break
    case 'avgPerformance': actual = ctx.avgPerformance ?? 0; break
    case 'avgVocal': actual = ctx.avgVocal ?? 0; break
    case 'avgDance': actual = ctx.avgDance ?? 0; break
    default: actual = 0
  }
  switch (op) {
    case '>=': return actual >= value
    case '<=': return actual <= value
    case '>': return actual > value
    case '<': return actual < value
    case '=': return actual === value
    default: return false
  }
}

function teamRuleProcess(team: any): string {
  const players = getTeamPlayers(team)
  const ctx: any = {
    memberRatings: players.map((p: any) => p.stageRating),
    teamScore: team?.teamScore ?? 0,
    avgPerformance: Math.round(players.reduce((s: number, p: any) => s + (p.performanceValue || 0), 0) / Math.max(1, players.length))
  }
  const rules = teamRules.value.length ? teamRules.value : [
    { count: 2, ratings: ['C'], teamRating: 'D' },
    { count: 1, ratings: ['C'], teamRating: 'C' },
    { count: 2, ratings: ['S'], teamRating: 'S' },
    { count: 2, ratings: ['S', 'A'], teamRating: 'A' },
    { count: 0, ratings: [], teamRating: 'B' }
  ]
  for (let i = 0; i < rules.length; i++) {
    const raw: any = rules[i]
    const rule = Array.isArray(raw.conditions)
      ? raw
      : {
          combine: 'all',
          teamRating: raw.teamRating,
          conditions: (Number(raw.count) > 0 ? [{ metric: 'countRating', ratings: raw.ratings || [], op: '>=', value: Number(raw.count) }] : [])
        }
    const conds = rule.conditions || []
    if (conds.length === 0) return `团队评级：命中第 ${i + 1} 条（兜底）→ ${rule.teamRating}`
    const results = conds.map((c: any) => evalCond(c, ctx))
    const matched = rule.combine === 'any' ? results.some(Boolean) : results.every(Boolean)
    if (matched) return `团队评级：命中第 ${i + 1} 条（${rule.combine === 'any' ? '满足任一' : '全部满足'}）→ ${rule.teamRating}`
  }
  return `团队评级：→ ${team.teamRating}`
}

function round2(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}
function ratingAttrLabel(a?: string): string {
  const m: Record<string, string> = { vocal: '🎤 声乐', dance: '💃 舞蹈', charm: '✨ 魅力' }
  return m[a || 'vocal'] || a || '—'
}
function yesRatePct(team: any): number {
  const r = Number(team?.audienceYesRate)
  return Number.isFinite(r) ? Math.round(r * 1000) / 10 : 0
}

function handleGoToAudienceVote() {
  activeTab.value = 'audience-vote'
}

const audienceVoteReleased = ref(false)

function handleAudienceVoteReleased() {
  audienceVoteReleased.value = true
}

async function handleGoToElimination() {
  try {
    await seasonStore.nextStage()
    MessagePlugin.success('已进入淘汰阶段')
    router.push(`/admin/round/${currentRoundNumber.value}/elimination`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '进入淘汰阶段失败')
  }
}

async function handleGoToEliminationPage() {
  try {
    await seasonStore.nextStage()
    MessagePlugin.success('已进入淘汰阶段')
    router.push(`/admin/round/${currentRoundNumber.value}/elimination`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '进入淘汰阶段失败')
  }
}

// ==================== 初始化 ====================
onMounted(async () => {
  const roundId = currentRoundIdComputed.value
  if (!seasonStore.season) {
    await seasonStore.fetchSeason()
  }
  await loadRules()
  await loadRatings()

  // 通知后端已进入公演管理页面
  try {
    const { openPerformance } = await import('../../services/api')
    await openPerformance(roundId)
  } catch (_) { /* 静默 */ }

  await Promise.all([
    teamStore.fetchTeams(roundId),
    songStore.fetchTeamSongs(roundId),
    playerStore.fetchAllUsers()
  ])

  // 从后端查询本轮是否已开启公演
  try {
    const { getPerformanceStarted } = await import('../../services/api')
    const started = await getPerformanceStarted(currentRoundNumber.value)
    performanceStarted.value = started
  } catch { /* 保持默认 false */ }

  // 挂载时初始化选手列表（从持久化恢复或新建）
  await initPlayerStatuses()

  // 加载结算参数（队伍得票率除数）
  await loadConfig()

  // 从后端获取结算结果
  if (performanceStore.teamPerformanceResults.length === 0) {
    try {
      await performanceStore.fetchAdminPerformanceResults(roundId)
    } catch (_) {}
  }

  // 判断当前阶段
  if (performanceStore.teamPerformanceResults.length > 0) {
    activeTab.value = 'settlement'
    // 恢复已揭晓的队伍
    const revealed = loadRevealedTeams(roundId)
    if (revealed.length > 0 && revealed.length === teamPerformanceResults.value.length) {
      allTeamsRevealed.value = true
    }
    // 预加载已揭晓队伍的投票矩阵
    for (const team of teamPerformanceResults.value) {
      if (team.status === 'confirmed') {
        loadTeamAudienceMatrix(team.teamId)
      }
    }
  }

  // 检查是否已有观众投票结果
  if (performanceStore.audienceVoteGenerated) {
    activeTab.value = 'audience-vote'
  }
})
</script>

<style lang="scss" scoped>
.admin-performance {
  padding: 16px;
  background: var(--bg-primary);
  min-height: 100vh;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 20px;

  h1 {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 12px 0;
  }

  .page-tabs {
    margin-bottom: 8px;
  }
}

.step-section {
  margin-top: 16px;
}

.overview-section {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(2,1fr);
  gap: 12px;
  margin-bottom: 12px;

  @media(min-width:768px) {
    grid-template-columns: repeat(4,1fr);
  }
}

.overview-item {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .label { font-size:12px; color: var(--text-secondary); }
  .value { font-size:18px; font-weight:600; color: var(--text-primary); }
}

.status-section {
  display: flex;
  align-items: center;
  gap: 12px;

  .generated-count {
    font-size:14px;
    color: var(--text-secondary);
  }
}

.generation-mode-section {
  margin-bottom: 16px;
  padding: 16px;
  background: var(--card-bg);
  border-radius: 12px;
  border: 1px solid var(--border-color);

  .mode-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 10px;
  }

  .mode-hint {
    margin-top: 10px;
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

.action-section {
  margin-bottom: 16px;
}

// 结算参数配置卡片
.settle-config-card {
  background: var(--card-bg);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;

  .config-title {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 12px;
  }

  .config-stats {
    display: flex;
    gap: 32px;
    margin-bottom: 14px;
    flex-wrap: wrap;

    .config-stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;

      .stat-value {
        font-size: 26px;
        font-weight: 800;
        color: #667eea;
      }

      .stat-label {
        font-size: 12px;
        color: var(--text-tertiary);
        margin-top: 2px;
      }
    }
  }

  .config-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;

    .config-row-label {
      font-size: 14px;
      font-weight: 500;
    }
  }

  .config-hint {
    font-size: 12px;
    color: var(--text-tertiary);
    margin: 10px 0 0;
  }
}

.player-table-card {
  border-radius: 12px;
  margin-bottom: 16px;
}

.table-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.player-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th, td {
    padding: 10px 8px;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
  }

  th {
    background: var(--table-header-bg);
    font-weight: 600;
    color: var(--text-primary);
  }

  .player-name { font-weight:600; }
  .team-name { color: var(--text-secondary); }

  .performance-value {
    .value {
      font-weight: 700;
      font-size: 15px;
      &.positive { color:#00a870; }
      &.negative { color:#e34d59; }
      &.pending { color: var(--text-tertiary); font-weight:400; }
    }
  }

  .done-text { color:#00a870; font-weight:700; }
}

.teams-section, .detail-section, .ranking-section {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);

  h2 { font-size:16px; font-weight:600; margin: 0 0 12px 0; }
}

.teams-table {
  .table-header {
    display: grid;
    grid-template-columns: 2fr 2fr 1fr 1fr 1fr;
    gap: 8px;
    padding: 12px;
    background: #f7f8fa;
    border-radius: 8px;
    margin-bottom: 8px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .table-row {
    display: grid;
    grid-template-columns: 2fr 2fr 1fr 1fr 1fr;
    gap: 8px;
    padding: 12px;
    border-radius: 8px;
    transition: background .2s;

    &:hover { background:#f7f8fa; }
    .team-name { font-weight:500; color: var(--text-primary); }
    .song-name { color: var(--text-secondary); }
    .member-count { color: var(--text-secondary); }
  }
}

.detail-section {
  margin-bottom: 20px;
  h2 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    .close-detail {
      font-size: 14px;
      color: var(--text-tertiary);
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 4px;
      &:hover { color: #e34d59; background: rgba(227,77,89,0.08); }
    }
  }
  .team-detail {
    .detail-item {
      margin-bottom: 16px;

      .detail-label { font-size:14px; font-weight:500; color: var(--text-secondary); display:block; margin-bottom:8px; }
      .detail-value { font-size:14px; color: var(--text-primary); }

      &.final {
        .final-score { font-size:28px; font-weight:700; color:#0052d9; }
      }
    }

    .member-ratings {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .member-rating-item {
        padding: 10px 12px;
        background: #f7f8fa;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.2s;

        &:hover { background: #e8eaf0; }

        .member-rating-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .member-name { flex:1; font-weight:500; }
        .member-score { font-weight:700; color:#0052d9; min-width:50px; text-align:right; }
        .rating-tag { min-width:100px; text-align:center; }
        .expand-icon { color: var(--text-tertiary); font-size: 10px; min-width: 16px; text-align: center; }

        .member-formula-detail {
          margin-top: 8px;
          padding: 8px 12px;
          background: rgba(0,0,0,0.03);
          border-radius: 6px;
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.8;
          font-family: 'Consolas', 'Courier New', monospace;

          div { margin-bottom: 4px; }
          div:last-child { margin-bottom: 0; }

          strong { color: var(--text-primary); }

          .result-line {
            margin-top: 6px;
            padding-top: 6px;
            border-top: 1px solid rgba(0,0,0,0.06);
            strong { color: #0052d9; font-size: 13px; }
          }
        }
      }
    }

    .detail-hint {
      font-size: 12px;
      color: var(--text-tertiary);
      font-weight: 400;
    }

    .team-rating-block {
      .team-rating-display {
        display: flex;
        align-items: center;
        gap: 16px;

        .team-rating-tag {
          font-size: 18px !important;
          padding: 6px 20px !important;
        }

        .team-score {
          font-size: 20px;
          font-weight: 700;
          color: #0052d9;
        }
      }
    }

    // 大众评审投票矩阵
    .audience-matrix-block {
      .matrix-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;

        .matrix-stat {
          font-size: 13px;
          color: var(--text-secondary);
        }
      }

      .matrix-loading,
      .matrix-empty {
        padding: 20px;
        text-align: center;
        color: var(--text-secondary);
        background: #f7f8fa;
        border-radius: 8px;
      }

      .audience-matrix {
        display: grid;
        grid-template-columns: repeat(20, 1fr);
        gap: 3px;
        max-height: 420px;
        overflow-y: auto;
        padding: 8px;
        background: #f7f8fa;
        border-radius: 8px;

        .matrix-seat {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          border: 1px solid #e5e6eb;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s ease;
          overflow: hidden;
          min-width: 0;

          .seat-inner {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0;
            line-height: 1.1;
            text-align: center;
            width: 100%;
            padding: 1px;
          }

          .seat-name {
            font-size: 8px;
            font-weight: 600;
            color: var(--text-primary);
            white-space: nowrap;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .seat-gender-age {
            font-size: 8px;
            font-weight: 600;
            color: #667eea;
            white-space: nowrap;
          }

          .seat-occupation {
            font-size: 7px;
            color: var(--text-tertiary);
            white-space: nowrap;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          &:hover {
            transform: scale(1.15);
            border-color: #0052d9;
            z-index: 1;
          }

          &.yes {
            background: #00a870;
            border-color: #00a870;

            .seat-name,
            .seat-gender-age,
            .seat-occupation {
              color: #ffffff;
            }
          }
        }
      }
    }
  }
}

.ranking-list {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .ranking-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: #f7f8fa;
    border-radius: 8px;

    .rank {
      width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
      background: #0052d9; color: #fff;
      border-radius: 50%;
      font-weight: 600; font-size: 14px;
    }

    .team-name { flex:1; font-size:14px; font-weight:500; color: var(--text-primary); }
    .score { font-size:15px; font-weight:700; color:#0052d9; }
  }
}

.rule-rows { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.rule-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
.rule-count { width: 72px; padding: 5px 8px; border: 1px solid var(--border-color, #ddd); border-radius: 6px; background: var(--bg-secondary, #fff); color: var(--text-primary, #333); font-size: 13px; }
.rule-count:focus { outline: none; border-color: #0052d9; }
.rule-block { border: 1px solid var(--border-color, #eee); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; background: var(--hover-bg); }
.rule-line1 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; margin-bottom: 6px; }
.rule-line1 .rule-idx { font-weight: 700; color: #0052d9; }
.rule-conds { display: flex; flex-direction: column; gap: 6px; padding-left: 12px; }
.rule-cond { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.bb-btn-xs { padding: 3px 10px; font-size: 12px; background: transparent; border: 1px solid #00ff8844; color: #00ff88; border-radius: 4px; cursor: pointer; }
.bb-btn-danger { border-color: #ff444466; color: #ff4444; }

.rating-table { border: 1px solid var(--border-color, #eee); border-radius: 8px; overflow: hidden; font-size: 13px; }
.rating-table .rt-header,
.rating-table .rt-row { display: grid; grid-template-columns: 1fr 0.9fr 1.1fr 0.5fr 0.6fr 1.6fr 0.9fr 0.5fr 0.5fr 1fr; align-items: center; gap: 8px; padding: 6px 10px; }
.rating-table .rt-header { background: var(--table-header-bg, #f7f8fa); font-weight: 600; }
.rating-table .rt-row { border-top: 1px solid var(--border-color, #f0f0f0); }
.rating-table .rt-name { font-weight: 600; }
.rating-table .rt-weights { font-size: 12px; color: #666; }
.rating-table .done-text { color: #00a870; }
.rating-table .pending-text { color: #e6a23c; }
.rating-table .rt-empty { padding: 12px; text-align: center; color: #999; }
.rt-pager { display: flex; justify-content: center; margin-top: 10px; }

.reveal-inline-card { margin-top: 16px; animation: revealIn 0.3s ease; }
.reveal-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.reveal-card-head h2 { font-size: 16px; margin: 0; }
.calc-process { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.calc-process .calc-line { font-size: 13px; color: var(--text-secondary); padding: 4px 8px; background: var(--hover-bg); border-radius: 6px; }
.calc-process .calc-line.team { font-weight: 700; color: var(--text-primary); }
.roll-text { font-size: 12px; color: var(--text-tertiary); }
.calc-process .member-calc { display: flex; flex-direction: column; gap: 3px; cursor: pointer; }
.calc-process .mc-head { display: flex; align-items: center; gap: 8px; }
.calc-process .mc-detail { font-size: 12px; color: var(--text-tertiary); }
.vote-reveal-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 6px; }
.vote-reveal-row .reveal-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.row-vote-reveal { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.row-vote-reveal .row-reveal-btns { display: flex; gap: 4px; }
.vote-reveal-section { margin: 16px 0; }
.vote-teams-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.vote-team-card { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px; border-radius: 10px; background: var(--card-bg, #fff); border: 1px solid var(--border-color, #eee); }
.vote-team-card .vt-name { font-size: 14px; font-weight: 700; }
.vote-team-card .vt-btns { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
@keyframes revealIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

.rank-segments { display: flex; flex-direction: column; gap: 8px; }
.rank-seg { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border: 1px solid var(--border-color, #eee); border-radius: 8px; }
.rank-seg .seg-title { min-width: 130px; font-weight: 600; font-size: 13px; }
.rank-seg .seg-bonus { font-weight: 400; color: #0052d9; font-size: 12px; }
.rank-seg .seg-members { display: flex; flex-wrap: wrap; gap: 6px; }
.rank-seg .seg-tag { padding: 2px 8px; background: var(--hover-bg, #f2f3f5); border-radius: 10px; font-size: 12px; }
.rank-seg .seg-empty { color: #999; font-size: 12px; }
</style>
