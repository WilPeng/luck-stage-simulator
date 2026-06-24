<template>
  <div class="admin-performance">
  <div class="page-header">
    <h1>第{{ currentRoundNumber }}次公演结算中心</h1>
    <div class="page-tabs">
      <t-tabs v-model="activeTab" @change="handleTabChange">
        <t-tab-panel value="player-status" label="选手发挥">
          <!-- ==================== 阶段一：选手发挥 ==================== -->
          <div class="step-section">
            <div class="overview-section">
              <div class="overview-grid">
                <div class="overview-item">
                  <span class="label">当前轮次</span>
                  <span class="value">第{{ currentRoundNumber }}次公演</span>
                </div>
                <div class="overview-item">
                  <span class="label">参与队伍</span>
                  <span class="value">{{ teamStore.teams.length }}支</span>
                </div>
                <div class="overview-item">
                  <span class="label">参与选手</span>
                  <span class="value">{{ allPlayers.length }}人</span>
                </div>
                <div class="overview-item">
                  <span class="label">歌曲数量</span>
                  <span class="value">{{ teamStore.teams.length }}首</span>
                </div>
              </div>
              <div class="status-section">
                <t-tag :theme="performanceStarted ? 'success' : 'warning'" variant="light">
                  {{ performanceStarted ? '公演已开启' : '未开始' }}
                </t-tag>
                <span class="generated-count" v-if="performanceStarted">
                  已生成：{{ generatedCount }} / {{ allPlayers.length }}
                </span>
              </div>
            </div>

            <div class="action-section">
              <t-button v-if="performanceStarted === false" theme="primary" size="large" block @click="handleStartPerformance">
                选手开始公演
              </t-button>
              <t-space v-else-if="performanceStarted === true" style="width:100%">
                <t-button theme="primary" :loading="bulkGenerating" @click="handleGenerateAll">
                  一键全部生成
                </t-button>
                <t-button theme="success" block :disabled="generatedCount < allPlayers.length" @click="activeTab = 'settlement'">
                  开始结算
                </t-button>
              </t-space>
            </div>

            <!-- 选手发挥表格 -->
            <t-card title="选手实时发挥" class="player-table-card">
              <div class="table-toolbar">
                <t-pagination
                  v-model="playerPage"
                  :total="allPlayers.length"
                  :page-size="5"
                  :show-jumper="true"
                  size="small"
                />
              </div>
              <table class="player-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>选手</th>
                    <th>队伍</th>
                    <th>发挥值</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(player, idx) in pagedPlayers" :key="player.playerId">
                    <td>{{ (playerPage - 1) * 5 + idx + 1 }}</td>
                    <td class="player-name">{{ player.playerName }}</td>
                    <td class="team-name">{{ player.teamName }}</td>
                    <td class="performance-value">
                      <span v-if="player.generated" :class="['value', player.performanceValue >= 0 ? 'positive' : 'negative']">
                        {{ player.performanceValue >= 0 ? '+' : '' }}{{ player.performanceValue }}
                      </span>
                      <span v-else class="value pending">{{ performanceStarted ? '待生成' : '—' }}</span>
                    </td>
                    <td>
                      <t-tag v-if="player.generated" theme="success" variant="light" size="small">已生成</t-tag>
                      <t-tag v-else-if="performanceStarted" theme="warning" variant="light" size="small">待生成</t-tag>
                      <t-tag v-else theme="default" variant="light" size="small">未开始</t-tag>
                    </td>
                    <td>
                      <t-button
                        v-if="!player.generated && performanceStarted"
                        size="small"
                        variant="outline"
                        :loading="generatingPlayerId === player.playerId"
                        @click="handleGeneratePlayer(player)"
                      >
                        代生成
                      </t-button>
                      <span v-else-if="player.generated" class="done-text">✓</span>
                      <span v-else class="pending-text">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </t-card>
          </div>
        </t-tab-panel>

        <t-tab-panel value="settlement" label="公演结算">
          <!-- ==================== 阶段二：公演结算 ==================== -->
          <div class="step-section">
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

            <!-- 选中队伍的详情 -->
            <div v-if="selectedTeamForReveal" class="detail-section">
              <h2>{{ selectedTeamForReveal.teamName }} — 结算详情</h2>
              <div class="team-detail">
                <div class="detail-item">
                  <span class="detail-label">歌曲</span>
                  <span class="detail-value">{{ selectedTeamForReveal.songName }}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">成员舞台评级</span>
                  <div class="member-ratings">
                    <div v-for="p in selectedTeamForReveal.playerPerformances" :key="p.playerId" class="member-rating-item">
                      <span class="member-name">{{ p.playerName }}</span>
                      <span class="member-score">{{ p.playerScore }}分</span>
                      <t-tag :theme="getRatingTheme(p.stageRating)" size="small" class="rating-tag">
                        {{ p.stageRating }} · {{ p.stageRatingText }}
                      </t-tag>
                    </div>
                  </div>
                </div>
                <div class="detail-item team-rating-block">
                  <span class="detail-label">团队综合评级</span>
                  <div class="team-rating-display">
                    <t-tag :theme="getRatingTheme(selectedTeamForReveal.teamRating)" size="large" class="team-rating-tag">
                      {{ selectedTeamForReveal.teamRating }} · {{ selectedTeamForReveal.teamRatingText }}
                    </t-tag>
                    <span class="team-score">{{ selectedTeamForReveal.teamScore }}分</span>
                  </div>
                </div>
                <!-- 最终票数构成 -->
                <div class="detail-item final-breakdown">
                  <span class="detail-label">最终票数构成</span>
                  <div class="breakdown-list">
                    <div class="breakdown-row">
                      <span>基础票数</span>
                      <span>{{ selectedTeamForReveal.baseVotes }}</span>
                    </div>
                    <div class="breakdown-row">
                      <span>团队得分（{{ selectedTeamForReveal.teamScore }}分）</span>
                      <span>+{{ selectedTeamForReveal.attributeVotes }}</span>
                    </div>
                    <div class="breakdown-row">
                      <span>发挥波动</span>
                      <span :class="selectedTeamForReveal.performanceVotes >= 0 ? 'positive' : 'negative'">
                        {{ selectedTeamForReveal.performanceVotes >= 0 ? '+' : '' }}{{ selectedTeamForReveal.performanceVotes }}
                      </span>
                    </div>
                    <div class="breakdown-row">
                      <span>团队加成</span>
                      <span class="positive">+{{ selectedTeamForReveal.eventVotes }}</span>
                    </div>
                    <div class="breakdown-row total">
                      <span>最终票数</span>
                      <span>{{ selectedTeamForReveal.finalVotes }}票</span>
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
import { ref, computed, onMounted } from 'vue'
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
import AudienceVoteView from './AudienceVoteView.vue'

const router = useRouter()
const route = useRoute()
const performanceStore = usePerformanceStore()
const seasonStore = useSeasonStore()
const teamStore = useTeamStore()
const songStore = useSongStore()
const playerStore = usePlayerStore()

// ==================== 阶段状态 ====================
const activeTab = ref('player-status') // 'player-status'=选手发挥, 'settlement'=公演结算, 'audience-vote'=喜爱度票数, 'elimination'=淘汰

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
const playerStatuses = ref<any[]>([])
const playerPage = ref(1)
const generatingPlayerId = ref('')
const bulkGenerating = ref(false)

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
    const { getPerformancePlayerStatus } = await import('../../services/api')
    const result = await getPerformancePlayerStatus(roundId)
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

// 管理员开启公演
async function handleStartPerformance() {
  try {
    const { startPerformance, getPlayerPerformanceStatus } = await import('../../services/api')
    await startPerformance(currentRoundIdComputed.value || `round-${currentRound.value}`)
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

// 为单个选手生成随机发挥值（与选手端 playerGeneratePerformance mock 一致）
function generateRandomValue(): number {
  return Math.floor(Math.random() * 61) - 20 // -20 ~ 40
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

function handleGoToSettlement() {
  activeTab.value = 'settlement'
}

// ==================== 阶段二：公演结算 ====================
const calculating = ref(false)
const selectedTeamForReveal = ref<any>(null)
const allTeamsRevealed = ref(false)

const teamPerformanceResults = computed(() => performanceStore.teamPerformanceResults)
const sortedTeamResults = computed(() => performanceStore.sortedTeamPerformanceResults)
const hasCalculated = computed(() => teamPerformanceResults.value.length > 0)

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

function handleRevealTeam(team: any) {
  selectedTeamForReveal.value = team
  team.status = 'confirmed'
  performanceStore.teamPerformanceResults = [...performanceStore.teamPerformanceResults]

  allTeamsRevealed.value = performanceStore.teamPerformanceResults.every((t: any) => t.status === 'confirmed')

  // 持久化已揭晓的队伍
  if (currentRoundIdComputed.value) {
    const revealed = teamPerformanceResults.value
      .filter((t: any) => t.status === 'confirmed')
      .map((t: any) => t.teamId)
    saveRevealedTeams(currentRoundIdComputed.value, revealed)
  }
}

function getRatingTheme(rating: string): string {
  const map: Record<string, string> = { S: 'success', A: 'primary', B: 'warning', C: 'default', D: 'danger' }
  return map[rating] || 'default'
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

function handleGoToEliminationPage() {
  router.push(`/admin/round/${currentRoundNumber.value}/elimination`)
}

// ==================== 初始化 ====================
onMounted(async () => {
  const roundId = currentRoundIdComputed.value
  if (!seasonStore.season) {
    await seasonStore.fetchSeason()
  }
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
  background: #f5f7fa;
  min-height: 100vh;
}

.page-header {
  margin-bottom: 20px;

  h1 {
    font-size: 24px;
    font-weight: 600;
    color: #1a1a2e;
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
  background: #fff;
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

  .label { font-size:12px; color:#86909c; }
  .value { font-size:18px; font-weight:600; color:#1a1a2e; }
}

.status-section {
  display: flex;
  align-items: center;
  gap: 12px;

  .generated-count {
    font-size:14px;
    color:#4e5969;
  }
}

.action-section {
  margin-bottom: 16px;
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
    border-bottom: 1px solid #f0f0f0;
  }

  th {
    background: #fafafa;
    font-weight: 600;
    color: #333;
  }

  .player-name { font-weight:600; }
  .team-name { color:#666; }

  .performance-value {
    .value {
      font-weight: 700;
      font-size: 15px;
      &.positive { color:#00a870; }
      &.negative { color:#e34d59; }
      &.pending { color:#999; font-weight:400; }
    }
  }

  .done-text { color:#00a870; font-weight:700; }
}

.teams-section, .detail-section, .ranking-section {
  background: #fff;
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
    color: #86909c;
  }

  .table-row {
    display: grid;
    grid-template-columns: 2fr 2fr 1fr 1fr 1fr;
    gap: 8px;
    padding: 12px;
    border-radius: 8px;
    transition: background .2s;

    &:hover { background:#f7f8fa; }
    .team-name { font-weight:500; color:#1a1a2e; }
    .song-name { color:#4e5969; }
    .member-count { color:#4e5969; }
  }
}

.detail-section {
  .team-detail {
    .detail-item {
      margin-bottom: 16px;

      .detail-label { font-size:14px; font-weight:500; color:#4e5969; display:block; margin-bottom:8px; }
      .detail-value { font-size:14px; color:#1a1a2e; }

      &.final {
        .final-score { font-size:28px; font-weight:700; color:#0052d9; }
      }
    }

    .member-ratings {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .member-rating-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        background: #f7f8fa;
        border-radius: 8px;

        .member-name { flex:1; font-weight:500; }
        .member-score { font-weight:700; color:#0052d9; min-width:50px; text-align:right; }
        .rating-tag { min-width:100px; text-align:center; }
      }
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

    // 票数构成列表
    .final-breakdown {
      .breakdown-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 12px;
        background: #f7f8fa;
        border-radius: 8px;

        .breakdown-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 14px;
          color: #4e5969;

          .positive { color: #00a870; font-weight: 600; }
          .negative { color: #e34d59; font-weight: 600; }

          &.total {
            border-top: 2px solid #0052d9;
            margin-top: 4px;
            padding-top: 10px;
            font-weight: 700;
            color: #0052d9;
            font-size: 16px;
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

    .team-name { flex:1; font-size:14px; font-weight:500; color:#1a1a2e; }
    .score { font-size:15px; font-weight:700; color:#0052d9; }
  }
}
</style>
