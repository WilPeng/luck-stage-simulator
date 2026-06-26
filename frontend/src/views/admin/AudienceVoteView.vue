<template>
  <div class="audience-vote-page" :class="{ embedded: props.embedded }">
    <!-- ==================== 未生成投票前：权重编辑表格 ==================== -->
    <template v-if="!store.audienceVoteGenerated">
      <div v-if="!props.embedded" class="page-header">
        <h1>喜爱度权重设置</h1>
        <div class="header-actions">
          <t-button theme="primary" :loading="store.audienceVoteLoading" @click="handleGenerate">
            生成大众评审投票
          </t-button>
          <t-button variant="outline" @click="loadPlayers">
            刷新选手列表
          </t-button>
        </div>
      </div>
      <div v-else class="embedded-actions">
        <t-space>
          <t-button theme="primary" size="small" :loading="store.audienceVoteLoading" @click="handleGenerate">
            生成大众评审投票
          </t-button>
          <t-button variant="outline" size="small" @click="loadPlayers">
            刷新
          </t-button>
        </t-space>
      </div>

      <t-card title="选手喜爱度权重配置（可编辑）" class="weight-config-card">
        <template #subtitle>
          <span>设置各选手的权重分值，点击"生成大众评审投票"后根据权重生成排行榜</span>
        </template>
        <div class="weight-table-wrapper">
          <table class="weight-table">
            <thead>
              <tr>
                <th class="col-rank">#</th>
                <th class="col-player">选手</th>
                <th class="col-team">队伍</th>
                <th class="col-editable">
                  基础属性贡献
                  <t-tooltip content="选手基础属性（vocal/dance/charm）折算分" placement="top">
                    <t-icon name="info-circle" class="hint-icon" />
                  </t-tooltip>
                </th>
                <th class="col-editable">
                  实时发挥贡献
                  <t-tooltip content="选手在公演中的实时发挥得分" placement="top">
                    <t-icon name="info-circle" class="hint-icon" />
                  </t-tooltip>
                </th>
                <th class="col-editable">
                  团队排名加成
                  <t-tooltip content="团队排名越高加成越多" placement="top">
                    <t-icon name="info-circle" class="hint-icon" />
                  </t-tooltip>
                </th>
                <th class="col-editable">
                  MVP加成
                  <t-tooltip content="队内排名第一的额外加成" placement="top">
                    <t-icon name="info-circle" class="hint-icon" />
                  </t-tooltip>
                </th>
                <th class="col-editable">
                  随机观众缘
                  <t-tooltip content="运气成分/观众随机喜好" placement="top">
                    <t-icon name="info-circle" class="hint-icon" />
                  </t-tooltip>
                </th>
                <th class="col-total">总权重</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in weightForm" :key="item.playerId">
                <td class="col-rank">{{ index + 1 }}</td>
                <td class="col-player">
                  <span class="player-name-cell">{{ item.playerName }}</span>
                </td>
                <td class="col-team">
                  <span class="team-name-cell">{{ item.teamName }}</span>
                </td>
                <td class="col-editable">
                  <t-input
                    v-model="item.baseContribution"
                    type="number"
                    size="small"
                    class="weight-input"
                    @change="recalcTotal(index)"
                  />
                </td>
                <td class="col-editable">
                  <t-input
                    v-model="item.performanceContribution"
                    type="number"
                    size="small"
                    class="weight-input"
                    @change="recalcTotal(index)"
                  />
                </td>
                <td class="col-editable">
                  <t-input
                    v-model="item.teamRankBonus"
                    type="number"
                    size="small"
                    class="weight-input"
                    @change="recalcTotal(index)"
                  />
                </td>
                <td class="col-editable">
                  <t-input
                    v-model="item.mvpBonus"
                    type="number"
                    size="small"
                    class="weight-input"
                    @change="recalcTotal(index)"
                  />
                </td>
                <td class="col-editable">
                  <t-input
                    v-model="item.audienceLuck"
                    type="number"
                    size="small"
                    class="weight-input"
                    @change="recalcTotal(index)"
                  />
                </td>
                <td class="col-total">
                  <span class="total-value">{{ item.totalWeight }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="weightForm.length === 0" class="empty-state">
            <t-empty description="暂无选手数据，请先刷新" />
          </div>
        </div>
      </t-card>
    </template>

    <!-- ==================== 已生成投票后：排行榜 / 权重榜 / 评审席 ==================== -->
    <template v-else>
      <div v-if="!props.embedded" class="page-header">
        <h1>{{ released ? '个人喜爱度最终结果' : '大众评审投票结果' }}</h1>
        <div class="header-actions">
          <t-button theme="primary" variant="outline" @click="handleExport">
            导出喜爱度表格
          </t-button>
          <t-button v-if="!released" theme="danger" variant="outline" @click="handleReset">
            重新设置权重
          </t-button>
          <t-button v-if="!released" variant="outline" @click="refreshData">
            刷新
          </t-button>
          <t-button v-if="!released" theme="success" :loading="releasing" @click="handleRelease">
            释放最终结果
          </t-button>
          <t-tag v-else theme="success" variant="light" size="large">✅ 已释放</t-tag>
        </div>
      </div>
      <div v-else class="embedded-actions">
        <t-space>
          <t-button variant="outline" size="small" @click="handleExport">
            导出表格
          </t-button>
          <t-button v-if="!released" variant="outline" size="small" @click="handleReset">
            重新设置
          </t-button>
          <t-button v-if="!released" variant="outline" size="small" @click="refreshData">
            刷新
          </t-button>
          <t-button v-if="!released" theme="success" size="small" :loading="releasing" @click="handleRelease">
            释放
          </t-button>
          <t-tag v-else theme="success" variant="light">✅ 已释放</t-tag>
        </t-space>
      </div>

      <!-- 顶部统计 -->
      <div class="stats-section">
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-icon">👥</span>
            <div class="stat-info">
              <span class="stat-label">总评审人数</span>
              <span class="stat-value">{{ store.audienceTotalAudience }}</span>
            </div>
          </div>
          <div class="stat-card">
            <span class="stat-icon">🗳️</span>
            <div class="stat-info">
              <span class="stat-label">总投票数</span>
              <span class="stat-value">{{ store.audienceTotalVotes }}</span>
            </div>
          </div>
          <div class="stat-card">
            <span class="stat-icon">✅</span>
            <div class="stat-info">
              <span class="stat-label">已完成评审</span>
              <span class="stat-value">{{ store.audienceTotalAudience }} / 1000</span>
            </div>
          </div>
          <div class="stat-card">
            <span class="stat-icon">🏆</span>
            <div class="stat-info">
              <span class="stat-label">当前榜首</span>
              <span class="stat-value">{{ store.audienceRankings[0]?.playerName || '-' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 排行榜和权重榜 -->
      <t-row :gutter="[16, 16]">
        <t-col :xs="24" :md="12">
          <t-card title="喜爱度排行榜" class="ranking-card">
            <div class="ranking-list">
              <div
                v-for="(item, index) in store.audienceRankings"
                :key="item.playerId"
                class="ranking-item"
                :class="{ 'top3': index < 3 }"
              >
                <span class="rank-number">{{ item.rank }}</span>
                <div class="rank-info">
                  <span class="player-name">{{ item.playerName }}</span>
                  <span class="team-name">{{ item.teamName }}</span>
                </div>
                <span class="vote-count">{{ item.votes }} 票</span>
              </div>
            </div>
          </t-card>
        </t-col>
        <t-col :xs="24" :md="12">
          <t-card title="喜爱度权重榜（只读）" class="weight-card">
            <div class="weight-list">
              <div
                v-for="(item, index) in sortedWeights"
                :key="item.playerId"
                class="weight-item"
              >
                <span class="weight-rank">{{ index + 1 }}</span>
                <div class="weight-info">
                  <span class="player-name">{{ item.playerName }}</span>
                  <span class="team-name">{{ item.teamName }}</span>
                </div>
                <span class="weight-value">{{ item.totalWeight }}</span>
                <t-tooltip :content="getWeightBreakdown(item)" placement="top">
                  <t-icon name="info-circle" class="info-icon" />
                </t-tooltip>
              </div>
            </div>
          </t-card>
        </t-col>
      </t-row>

      <!-- 大众评审席 -->
      <t-card title="大众评审席（1000座）" class="seats-card">
        <div class="seats-toolbar">
          <t-space>
            <t-tag theme="primary" variant="light">总座位：1000</t-tag>
            <t-tag theme="success" variant="light">已投票：{{ store.audienceTotalAudience }}</t-tag>
          </t-space>
          <span class="seats-tip">点击座位查看该评审的投票详情</span>
        </div>
        <div class="seats-grid">
          <div
            v-for="seat in seats"
            :key="seat.id"
            class="seat-item"
            :class="{ voted: seat.voted }"
            @click="handleSeatClick(seat)"
          >
            <t-tooltip :content="`${seat.seatNumber}号评审`" placement="top">
              <span class="seat-icon">{{ seat.voted ? '🎭' : '🪑' }}</span>
            </t-tooltip>
          </div>
        </div>
      </t-card>

      <!-- 评审投票详情弹窗（可编辑） -->
      <t-dialog
        v-model:visible="detailVisible"
        :header="`${selectedSeatNumber}号大众评审 — 可编辑投票`"
        width="480px"
        :destroy-on-close="true"
        :footer="false"
      >
        <div v-if="store.selectedAudienceDetail" class="vote-detail-editable">
          <div class="edit-hint">可修改该评审的投票对象，下拉选择选手</div>
          <div
            v-for="vote in store.selectedAudienceDetail.votes"
            :key="vote.voteOrder"
            class="vote-edit-item"
          >
            <span class="vote-order">第{{ vote.voteOrder }}票</span>
            <t-select
              v-model="vote.playerId"
              filterable
              size="small"
              style="width:200px"
              @change="(val: string) => { vote.playerName = (store.audienceRankings.find(r => r.playerId === val)?.playerName || val) }"
            >
              <t-option
                v-for="p in store.audienceRankings"
                :key="p.playerId"
                :value="p.playerId"
                :label="p.playerName"
              />
            </t-select>
          </div>
          <div class="vote-edit-actions">
            <t-button size="small" variant="outline" @click="detailVisible = false">关闭</t-button>
            <t-button size="small" theme="primary" @click="handleSaveVoteEdit">保存修改</t-button>
          </div>
        </div>
        <div v-else class="vote-detail-loading">
          <t-loading text="加载中..." size="small" />
        </div>
      </t-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, reactive } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { usePerformanceStore } from '../../stores/performanceStore'
import { useSeasonStore } from '../../stores/seasonStore'
import { useTeamStore } from '../../stores/teamStore'
import type { AudienceSeat, PlayerPopularityWeight } from '../../types/performance'

const props = defineProps<{
  roundId?: string
  embedded?: boolean
}>()

const emit = defineEmits<{
  (e: 'release'): void
}>()

const store = usePerformanceStore()
const seasonStore = useSeasonStore()
const teamStore = useTeamStore()

const detailVisible = ref(false)
const selectedSeatNumber = ref(0)
const released = ref(false)
const releasing = ref(false)

const currentRoundId = computed(() => props.roundId || seasonStore.currentRoundId || '')

// 权重编辑表单（每个选手一行，可编辑各项权重值）
const weightForm = ref<PlayerPopularityWeight[]>([])

// 加载选手列表并初始化权重表单（使用实际数据推算默认值）
async function loadPlayers() {
  const roundId = currentRoundId.value
  if (!roundId) return

  // 确保队伍数据已加载
  if (teamStore.teams.length === 0) {
    await teamStore.fetchTeams(roundId)
  }

  // 尝试获取公演结算结果（含各队伍排名和选手发挥值）
  const teamResults = store.teamPerformanceResults || []

  // 构建队伍排名映射 { teamId → rank }
  const teamRankMap: Record<string, number> = {}
  const totalTeams = teamResults.length
  for (const tr of teamResults) {
    teamRankMap[tr.teamId] = tr.rank || totalTeams
  }

  // 构建选手发挥数据映射 { playerId → { performanceValue, rankInTeam } }
  const perfMap: Record<string, { performanceValue: number; rankInTeam: number }> = {}
  for (const tr of teamResults) {
    if (tr.playerPerformances) {
      for (const p of tr.playerPerformances) {
        perfMap[p.playerId] = { performanceValue: p.performanceValue || 0, rankInTeam: p.rankInTeam || 99 }
      }
    }
  }

  // 计算团队排名加成（与后端算法一致）
  function calcTeamRankBonus(rank: number, total: number): number {
    if (total <= 1) return 0
    return Math.round(30 * (total - rank) / (total - 1))
  }

  const teams = teamStore.teams
  weightForm.value = []

  for (const team of teams) {
    if (!team.members) continue
    for (const member of team.members) {
      if (!member.player) continue

      const charm = member.player.attributes?.charm || member.player.attributes?.魅力 || 0
      const playerId = member.playerId
      const perfData = perfMap[playerId]
      const teamRank = teamRankMap[team.id] || 1

      // ① 基础属性贡献 = 魅力 × 2
      const baseContribution = Math.round(charm * 2)

      // ② 实时发挥贡献（有实际发挥值时使用，否则按默认范围随机）
      let performanceContribution: number
      if (perfData) {
        performanceContribution = Math.max(0, perfData.performanceValue)
      } else {
        performanceContribution = Math.floor(Math.random() * 20) + 1
      }

      // ③ 团队排名加成（等差递减）
      const teamRankBonus = calcTeamRankBonus(teamRank, totalTeams || 1)

      // ④ 队内 MVP 加成
      const mvpBonus = (perfData && perfData.rankInTeam === 1) ? Math.floor(Math.random() * 11) + 10 : 0

      // ⑤ 观众缘随机值
      const audienceLuck = Math.floor(Math.random() * 16)

      const totalWeight = baseContribution + performanceContribution + teamRankBonus + mvpBonus + audienceLuck

      weightForm.value.push({
        playerId,
        playerName: member.player.name || member.playerId,
        teamId: team.id,
        teamName: team.name || '',
        baseContribution,
        performanceContribution,
        teamRankBonus,
        mvpBonus,
        audienceLuck,
        totalWeight
      })
    }
  }
}

// 重新计算某行的总权重
function recalcTotal(index: number) {
  const item = weightForm.value[index]
  if (item) {
    item.totalWeight = item.baseContribution + item.performanceContribution + item.teamRankBonus + item.mvpBonus + item.audienceLuck
  }
}

// 1000个座位
const seats = computed<AudienceSeat[]>(() => {
  const existingSeats = new Map(store.audienceSeats.map(s => [s.seatNumber, s]))
  return Array.from({ length: 1000 }, (_, i) => {
    const seatNumber = i + 1
    return existingSeats.get(seatNumber) || {
      id: `seat-${seatNumber}`,
      seatNumber,
      voted: false
    }
  })
})

const sortedWeights = computed<PlayerPopularityWeight[]>(() => {
  return [...store.audienceWeights].sort((a, b) => b.totalWeight - a.totalWeight)
})

function getWeightBreakdown(item: PlayerPopularityWeight): string {
  return [
    `基础属性贡献：${item.baseContribution}`,
    `实时发挥贡献：${item.performanceContribution}`,
    `团队排名加成：${item.teamRankBonus}`,
    `队内MVP加成：${item.mvpBonus}`,
    `随机观众缘：${item.audienceLuck}`
  ].join('\n')
}

// 导出个人喜爱度 CSV 表格
function handleExport() {
  const rankings = store.audienceRankings
  if (!rankings || rankings.length === 0) {
    MessagePlugin.warning('暂无喜爱度数据可导出')
    return
  }

  const weightsMap = new Map(store.audienceWeights.map(w => [w.playerId, w]))

  // CSV 表头
  const headers = ['排名', '选手', '队伍', '得票数', '总权重', '基础属性贡献', '实时发挥贡献', '团队排名加成', 'MVP加成', '随机观众缘']

  // 构造每一行
  const rows = rankings.map((item) => {
    const w = weightsMap.get(item.playerId)
    return [
      item.rank,
      item.playerName,
      item.teamName,
      item.votes,
      w?.totalWeight ?? item.totalWeight ?? '',
      w?.baseContribution ?? '',
      w?.performanceContribution ?? '',
      w?.teamRankBonus ?? '',
      w?.mvpBonus ?? '',
      w?.audienceLuck ?? ''
    ].map(v => `"${v}"`).join(',')
  })

  const csvContent = [headers.join(','), ...rows].join('\n')
  const BOM = '\uFEFF' // UTF-8 BOM -> Excel 自动识别中文
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `个人喜爱度排行_${currentRoundId.value || 'unknown'}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  MessagePlugin.success('喜爱度表格已导出')
}

async function handleGenerate() {
  if (!currentRoundId.value) {
    MessagePlugin.warning('轮次信息加载中，请稍后再试')
    return
  }

  // 收集编辑后的权重数据
  const weights = weightForm.value.map(w => ({
    ...w,
    totalWeight: w.baseContribution + w.performanceContribution + w.teamRankBonus + w.mvpBonus + w.audienceLuck
  }))

  // 校验：至少有一个选手有权重
  if (weights.length === 0) {
    MessagePlugin.warning('请先加载选手数据')
    return
  }

  const success = await store.generateAudienceVotes(currentRoundId.value, weights)
  if (success) {
    MessagePlugin.success('大众评审投票已生成')
    await store.fetchAudienceSeats(currentRoundId.value)
  } else {
    MessagePlugin.error('生成失败')
  }
}

async function handleReset() {
  const roundId = currentRoundId.value
  store.audienceVoteGenerated = false
  store.audienceRankings = []
  store.audienceWeights = []
  store.audienceSeats = []
  store.audienceTotalAudience = 0
  store.audienceTotalVotes = 0
  if (roundId) await store.clearAudienceVoteData(roundId)
  await loadPlayers()
}

async function refreshData() {
  if (!currentRoundId.value) return
  await Promise.all([
    store.fetchAudienceVoteRankings(currentRoundId.value),
    store.fetchAudienceSeats(currentRoundId.value)
  ])
}

async function handleSeatClick(seat: AudienceSeat) {
  if (!currentRoundId.value) return
  selectedSeatNumber.value = seat.seatNumber
  detailVisible.value = true
  await store.fetchAudienceVoteDetail(currentRoundId.value, seat.seatNumber)
}

async function handleSaveVoteEdit() {
  if (!currentRoundId.value || !store.selectedAudienceDetail) return
  // 从投票详情中提取 playerId 数组
  const playerIds = store.selectedAudienceDetail.votes.map(v => v.playerId)
  const success = await store.saveAudienceSeatVotes(
    currentRoundId.value,
    selectedSeatNumber.value,
    playerIds
  )
  if (success) {
    MessagePlugin.success('该评审投票已保存，正在刷新排行榜...')
    // 保存成功后自动重新获取排行榜数据
    await refreshData()
  } else {
    MessagePlugin.warning('保存到服务器失败，本地修改已保留')
  }
  detailVisible.value = false
}

async function handleRelease() {
  if (!currentRoundId.value) return
  releasing.value = true
  try {
    const success = await store.releaseFinalRanking(currentRoundId.value)
    if (success) {
      released.value = true
      MessagePlugin.success('个人喜爱度最终结果已释放')
      emit('release')
    } else {
      MessagePlugin.error('释放失败')
    }
  } catch (e: any) {
    MessagePlugin.error('释放失败: ' + e.message)
  } finally {
    releasing.value = false
  }
}

onMounted(async () => {
  if (!props.embedded) {
    await seasonStore.fetchSeason()
    await seasonStore.fetchRounds()
  }

  // 检查是否已有生成的投票数据
  await refreshData()

  // 检查最终结果是否已释放（持久化恢复）
  const alreadyReleased = await store.fetchFinalRanking(currentRoundId.value)
  if (alreadyReleased) {
    released.value = true
  }

  if (store.audienceVoteGenerated) {
    // 已有投票结果，直接显示排行榜
  } else {
    // 无投票结果，显示权重编辑表格
    await loadPlayers()
  }
})

watch(currentRoundId, (newVal, oldVal) => {
  if (newVal && newVal !== oldVal) {
    refreshData()
  }
})
</script>

<style lang="scss" scoped>
.audience-vote-page {
  padding: 16px;
  background: #f5f7fa;
  min-height: 100%;

  &.embedded {
    padding: 0;
    background: transparent;
  }
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;

  h1 {
    margin: 0;
    font-size: 20px;
    color: #333;
  }

  .header-actions {
    display: flex;
    gap: 12px;
  }
}

.embedded-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

// ====== 权重配置表格 ======
.weight-config-card {
  margin-bottom: 16px;
  border-radius: 12px;

  :deep(.t-card__header) {
    font-weight: 600;
  }
}

.weight-table-wrapper {
  overflow-x: auto;
}

.weight-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 900px;

  th, td {
    padding: 10px 8px;
    text-align: center;
    border-bottom: 1px solid #f0f0f0;
  }

  thead th {
    background: #fafafa;
    font-weight: 600;
    color: #333;
    white-space: nowrap;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  tbody tr:hover {
    background: #f5f7fa;
  }

  .col-rank { width: 40px; }
  .col-player { text-align: left; min-width: 100px; }
  .col-team { text-align: left; min-width: 100px; }
  .col-editable { min-width: 110px; }
  .col-total { min-width: 70px; }

  .player-name-cell {
    font-weight: 600;
    color: #1a1a2e;
  }

  .team-name-cell {
    font-size: 12px;
    color: #666;
  }

  .weight-input {
    width: 80px;
    margin: 0 auto;
  }

  .total-value {
    font-weight: 700;
    color: #e34d59;
    font-size: 15px;
  }

  .hint-icon {
    color: #999;
    font-size: 12px;
    vertical-align: middle;
    margin-left: 2px;
    cursor: help;
  }
}

// ====== 统计卡片 ======
.stats-section {
  margin-bottom: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;

  @media (min-width: 768px) {
    grid-template-columns: repeat(4, 1fr);
  }
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

  .stat-icon {
    font-size: 28px;
  }

  .stat-info {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .stat-label {
      font-size: 13px;
      color: #666;
    }

    .stat-value {
      font-size: 20px;
      font-weight: 700;
      color: #333;
    }
  }
}

// ====== 排行榜 / 权重榜 ======
.ranking-card,
.weight-card,
.seats-card {
  margin-bottom: 16px;
  border-radius: 12px;

  :deep(.t-card__header) {
    font-weight: 600;
  }
}

.empty-state {
  padding: 32px 0;
}

.ranking-list,
.weight-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 500px;
  overflow-y: auto;
}

.ranking-item,
.weight-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f9f9f9;
  transition: background 0.2s;

  &:hover {
    background: #f0f0f0;
  }

  &.top3 {
    background: linear-gradient(135deg, #fff9e6 0%, #fff3cd 100%);
    border: 1px solid #ffe082;
  }

  .rank-number,
  .weight-rank {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #e5e7eb;
    font-size: 13px;
    font-weight: 600;
    color: #333;
    flex-shrink: 0;
  }

  .rank-info,
  .weight-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;

    .player-name {
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .team-name {
      font-size: 12px;
      color: #999;
    }
  }

  .vote-count,
  .weight-value {
    font-size: 15px;
    font-weight: 700;
    color: #e67e22;
    flex-shrink: 0;
  }
}

.info-icon {
  color: #999;
  cursor: pointer;
  flex-shrink: 0;
}

// ====== 评审席 ======
.seats-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;

  .seats-tip {
    font-size: 13px;
    color: #999;
  }
}

.seats-grid {
  display: grid;
  grid-template-columns: repeat(20, 1fr);
  gap: 4px;
  max-height: 400px;
  overflow-y: auto;
  padding: 8px;
  background: #fafafa;
  border-radius: 8px;

  @media (max-width: 1200px) {
    grid-template-columns: repeat(15, 1fr);
  }

  @media (max-width: 768px) {
    grid-template-columns: repeat(10, 1fr);
  }
}

.seat-item {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  font-size: 12px;

  &:hover {
    background: #e5e7eb;
    transform: scale(1.2);
  }

  &.voted {
    background: #e8f5e9;
  }
}

.vote-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .vote-detail-item {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px;
    background: #f5f7fa;
    border-radius: 8px;

    .vote-order {
      font-size: 13px;
      color: #666;
      width: 60px;
    }

    .vote-player {
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }
  }
}

.vote-detail-editable {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .edit-hint {
    font-size: 13px;
    color: #999;
    padding: 8px 12px;
    background: #fff7e6;
    border-radius: 6px;
  }

  .vote-edit-item {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 12px;
    background: #f5f7fa;
    border-radius: 8px;

    .vote-order {
      font-size: 13px;
      color: #666;
      width: 60px;
      flex-shrink: 0;
    }
  }

  .vote-edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 8px;
  }
}

.vote-detail-loading {
  padding: 32px 0;
  display: flex;
  justify-content: center;
}
</style>
