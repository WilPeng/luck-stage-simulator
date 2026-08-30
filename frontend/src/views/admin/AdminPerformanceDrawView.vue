<template>
  <div class="admin-perf-draw">
    <div class="page-head">
      <div>
        <h1>🎲 发挥值管理</h1>
        <p>第{{ currentRoundNumber }}公演 · 管理选手的公演发挥值抽取</p>
      </div>
      <div class="page-head-actions">
        <t-tag :theme="performanceReleased ? 'success' : 'warning'" variant="light" size="large">
          {{ performanceReleased ? '选手可抽取发挥值' : '发挥值抽取未开放' }}
        </t-tag>
        <t-button variant="outline" :loading="loading" @click="loadData">刷新</t-button>
      </div>
    </div>

    <!-- 概览 -->
    <div class="overview-section">
      <div class="overview-grid">
        <div class="overview-item">
          <span class="label">当前轮次</span>
          <span class="value">第{{ currentRoundNumber }}次公演</span>
        </div>
        <div class="overview-item">
          <span class="label">参与选手</span>
          <span class="value">{{ allPlayers.length }}人</span>
        </div>
        <div class="overview-item">
          <span class="label">已生成</span>
          <span class="value" :class="{ highlight: generatedCount > 0 }">{{ generatedCount }}</span>
        </div>
        <div class="overview-item">
          <span class="label">待生成</span>
          <span class="value">{{ allPlayers.length - generatedCount }}</span>
        </div>
      </div>
    </div>

    <!-- 开放开关 + 抽取方式 -->
    <div class="config-grid">
      <t-card title="抽取开放" :bordered="false" class="config-card">
        <div class="config-row">
          <div class="config-info">
            <span class="config-icon">🔓</span>
            <div>
              <div class="config-title">开放选手抽取</div>
              <div class="config-desc">开启后选手端可进入发挥值抽取页面</div>
            </div>
          </div>
          <t-switch :value="performanceReleased" @change="handleToggleRelease" />
        </div>
      </t-card>

      <t-card title="抽取方式" :bordered="false" class="config-card">
        <div class="config-row">
          <div class="config-info">
            <span class="config-icon">🎲</span>
            <div>
              <div class="config-title">发挥值生成方式</div>
              <div class="config-desc">{{ modeHint }}</div>
            </div>
          </div>
          <t-select
            v-model="generationMode"
            style="width: 180px"
            size="small"
            placeholder="选择抽取方式"
            @change="handleGenerationModeChange"
          >
            <t-option value="random" label="🎰 随机老虎机（随机）" />
            <t-option value="pointer" label="🎯 摆动指针（反应）" />
            <t-option value="speed" label="⚡ 手速挑战（连击）" />
            <t-option value="strategy" label="🧠 策略抉择（风险）" />
            <t-option value="reflex" label="🔴 反应力（变灯点击）" />
            <t-option value="memory" label="🃏 记忆配对（翻牌）" />
            <t-option value="bomb" label="💣 数字炸弹（猜数）" />
            <t-option value="spot_diff" label="🔍 找不同（限时）" />
            <t-option value="math" label="🧮 算术挑战（限时）" />
          </t-select>
        </div>
      </t-card>
    </div>

    <!-- 操作区 -->
    <div class="action-section">
      <t-space style="width: 100%">
        <t-button theme="primary" :loading="bulkGenerating" @click="handleGenerateAll">
          一键全部生成
        </t-button>
        <t-button
          theme="danger"
          variant="outline"
          :loading="bulkRevoking"
          :disabled="generatedCount === 0"
          @click="handleRevokeAll"
        >
          撤回全部 ({{ generatedCount }})
        </t-button>
        <t-button
          theme="danger"
          variant="outline"
          :disabled="selectedRevokeIds.length === 0"
          @click="handleRevokeSelected"
        >
          撤回所选 ({{ selectedRevokeIds.length }})
        </t-button>
      </t-space>
    </div>

    <!-- 选手发挥表格 -->
    <t-card title="选手实时发挥" :bordered="false" class="player-table-card">
      <div class="table-toolbar">
        <t-pagination
          v-model="playerPage"
          :total="allPlayers.length"
          :page-size="10"
          :show-jumper="true"
          size="small"
        />
      </div>
      <table class="player-table">
        <thead>
          <tr>
            <th style="width: 40px">
              <t-checkbox
                :checked="selectedRevokeIds.length === generatedPlayers.length && generatedPlayers.length > 0"
                :indeterminate="selectedRevokeIds.length > 0 && selectedRevokeIds.length < generatedPlayers.length"
                @change="(checked: any) => toggleSelectAllRevoke(!!checked)"
              />
            </th>
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
            <td>
              <t-checkbox
                v-if="player.generated"
                :checked="selectedRevokeIds.includes(player.playerId)"
                @change="() => toggleRevokeSelect(player.playerId)"
              />
            </td>
            <td>{{ (playerPage - 1) * 10 + idx + 1 }}</td>
            <td class="player-name">{{ player.playerName }}</td>
            <td class="team-name">{{ player.teamName }}</td>
            <td class="performance-value">
              <span v-if="player.generated" :class="['value', player.performanceValue >= 0 ? 'positive' : 'negative']">
                {{ player.performanceValue >= 0 ? '+' : '' }}{{ player.performanceValue }}
              </span>
              <span v-else class="value pending">待生成</span>
            </td>
            <td>
              <t-tag v-if="player.generated" theme="success" variant="light" size="small">已生成</t-tag>
              <t-tag v-else theme="warning" variant="light" size="small">待生成</t-tag>
            </td>
            <td>
              <t-button
                v-if="!player.generated"
                size="small"
                variant="outline"
                :loading="generatingPlayerId === player.playerId"
                @click="handleGeneratePlayer(player)"
              >
                代生成
              </t-button>
              <t-button
                v-else
                size="small"
                variant="text"
                theme="danger"
                :loading="revokingPlayerId === player.playerId"
                @click="handleRevokePlayer(player)"
              >
                撤回
              </t-button>
            </td>
          </tr>
        </tbody>
      </table>
      <t-empty v-if="allPlayers.length === 0" description="暂无选手数据，请先完成组队" />
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useSeasonStore } from '../../stores/seasonStore'
import { useTeamStore } from '../../stores/teamStore'
import { usePlayerStore } from '../../stores/playerStore'
import type { PerformanceGenerationMode } from '../../types/performance'
import {
  setPerformanceGenerationMode,
  setConcurrentRelease,
  getConcurrentReleaseStatus,
  getPlayerPerformanceStatus,
  getPerformanceRoundStatus,
  savePerformancePlayerStatus,
  startPerformance,
  getPerformanceStarted,
  revokePlayerPerformance
} from '../../services/api'

const route = useRoute()
const seasonStore = useSeasonStore()
const teamStore = useTeamStore()
const playerStore = usePlayerStore()

const loading = ref(false)

const currentRoundNumber = computed(() => {
  const routeRound = Number(route.params.round)
  return routeRound || seasonStore.currentRoundNumber
})
const currentRoundId = computed(() => `round-${currentRoundNumber.value}`)

// ==================== 状态 ====================
const performanceStarted = ref<boolean | null>(null)
const performanceReleased = ref(false)
const generationMode = ref<PerformanceGenerationMode>('random')
const playerStatuses = ref<any[]>([])
const playerPage = ref(1)
const generatingPlayerId = ref('')
const bulkGenerating = ref(false)
const revokingPlayerId = ref('')
const bulkRevoking = ref(false)
const selectedRevokeIds = ref<string[]>([])

const generatedPlayers = computed(() => playerStatuses.value.filter((p: any) => p.generated))
const generatedCount = computed(() => generatedPlayers.value.length)

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

const pagedPlayers = computed(() => {
  const start = (playerPage.value - 1) * 10
  return playerStatuses.value.slice(start, start + 10)
})

const MODE_HINTS: Record<string, string> = {
  random: '选手端点击后系统随机给出发挥值',
  pointer: '选手端通过点击停下指针获取发挥值',
  speed: '限时快速点击，次数映射发挥值',
  strategy: '选择风险档位，档位内随机',
  reflex: '变绿后点击，反应越快区间越高',
  memory: '翻牌配对，翻牌越少发挥值越高',
  bomb: '猜数字缩小范围，逼近越多发挥值越高',
  spot_diff: '两个10×10矩阵找10处不同，限时30秒',
  math: '限时30秒算术题，答对越多发挥值越高'
}
const modeHint = computed(() => MODE_HINTS[generationMode.value] || '')

// ==================== 初始化 ====================
async function initPlayerStatuses() {
  try {
    const result = await getPlayerPerformanceStatus(currentRoundId.value)
    if (result.generationMode) generationMode.value = result.generationMode
    if (result.players?.length > 0) {
      playerStatuses.value = result.players
      performanceStarted.value = result.started || false
      return
    }
  } catch (_) {}
  playerStatuses.value = allPlayers.value.map((p: any) => ({ ...p, generated: false, performanceValue: null }))
}

async function persistPlayerStatuses() {
  try {
    const players = playerStatuses.value.map((p: any) => ({
      playerId: p.playerId,
      performanceValue: p.performanceValue
    }))
    await savePerformancePlayerStatus(currentRoundId.value, players)
  } catch (e: any) {
    console.error('[PerfDraw] 保存到后端失败:', e.message)
  }
}

// ==================== 开放开关 ====================
async function handleToggleRelease(value: boolean) {
  try {
    await setConcurrentRelease(currentRoundId.value, 'performance', value)
    performanceReleased.value = value
    MessagePlugin.success(value ? '已开放选手抽取发挥值' : '已关闭发挥值抽取')
  } catch (e: any) {
    MessagePlugin.error(e.message || '切换失败')
  }
}

// ==================== 抽取方式 ====================
async function handleGenerationModeChange(value: string | number | boolean) {
  const mode = value as PerformanceGenerationMode
  generationMode.value = mode
  try {
    await setPerformanceGenerationMode(currentRoundId.value, mode)
    MessagePlugin.success(`已切换到 ${MODE_HINTS[mode] || mode}`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '切换生成方式失败')
  }
}

// ==================== 生成 ====================
function generateRandomValue(): number {
  return Math.floor(Math.random() * 31) - 10 // -10 ~ 20
}

async function handleGeneratePlayer(player: any) {
  generatingPlayerId.value = player.playerId
  try {
    const value = generateRandomValue()
    await savePerformancePlayerStatus(currentRoundId.value, [{ playerId: player.playerId, performanceValue: value }])
    const idx = playerStatuses.value.findIndex((p: any) => p.playerId === player.playerId)
    if (idx !== -1) {
      playerStatuses.value[idx].generated = true
      playerStatuses.value[idx].performanceValue = value
    }
    MessagePlugin.success(`已为 ${player.playerName} 生成发挥值 ${value}`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '生成失败')
  } finally {
    generatingPlayerId.value = ''
  }
}

async function handleGenerateAll() {
  bulkGenerating.value = true
  try {
    // 只给尚未生成（或发挥值为空的）选手生成，不覆盖已有发挥值
    const toGenerate = playerStatuses.value.filter((p: any) => !p.generated || p.performanceValue === null)
    if (toGenerate.length === 0) {
      MessagePlugin.info('所有选手都已生成发挥值，无需生成')
      return
    }
    const players = toGenerate.map((p: any) => ({ playerId: p.playerId, performanceValue: generateRandomValue() }))
    await savePerformancePlayerStatus(currentRoundId.value, players)
    const valueMap = new Map(players.map(p => [p.playerId, p.performanceValue]))
    for (const p of playerStatuses.value) {
      if (valueMap.has(p.playerId)) {
        p.generated = true
        p.performanceValue = valueMap.get(p.playerId)
      }
    }
    MessagePlugin.success(`已为 ${players.length} 位选手生成发挥值（已有发挥值的未覆盖）`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '一键生成失败')
  } finally {
    bulkGenerating.value = false
  }
}

// ==================== 撤回 ====================
async function handleRevokePlayer(player: any) {
  revokingPlayerId.value = player.playerId
  try {
    await revokePlayerPerformance(currentRoundId.value, [player.playerId])
    const idx = playerStatuses.value.findIndex((p: any) => p.playerId === player.playerId)
    if (idx !== -1) {
      playerStatuses.value[idx].generated = false
      playerStatuses.value[idx].performanceValue = null
    }
    MessagePlugin.success(`已撤回 ${player.playerName || '该选手'} 的发挥值`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '撤回失败')
  } finally {
    revokingPlayerId.value = ''
  }
}

async function handleRevokeSelected() {
  if (selectedRevokeIds.value.length === 0) {
    MessagePlugin.warning('请先勾选要撤回的选手')
    return
  }
  const ok = window.confirm(`确定撤回所选 ${selectedRevokeIds.value.length} 位选手的发挥值吗？`)
  if (!ok) return
  bulkRevoking.value = true
  try {
    await revokePlayerPerformance(currentRoundId.value, selectedRevokeIds.value)
    const idSet = new Set(selectedRevokeIds.value)
    for (const p of playerStatuses.value) {
      if (idSet.has(p.playerId)) {
        p.generated = false
        p.performanceValue = null
      }
    }
    selectedRevokeIds.value = []
    MessagePlugin.success(`已撤回 ${idSet.size} 位选手的发挥值`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '批量撤回失败')
  } finally {
    bulkRevoking.value = false
  }
}

async function handleRevokeAll() {
  if (generatedCount.value === 0) {
    MessagePlugin.warning('暂无已生成的发挥值')
    return
  }
  const ok = window.confirm(`确定撤回全部 ${generatedCount.value} 位选手的发挥值吗？此操作不可撤销。`)
  if (!ok) return
  bulkRevoking.value = true
  try {
    await revokePlayerPerformance(currentRoundId.value)
    for (const p of playerStatuses.value) {
      p.generated = false
      p.performanceValue = null
    }
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
  if (checked) selectedRevokeIds.value = generatedPlayers.value.map((p: any) => p.playerId)
  else selectedRevokeIds.value = []
}

// ==================== 启动公演 ====================
async function handleStartPerformance() {
  try {
    await startPerformance(currentRoundId.value, generationMode.value)
    performanceStarted.value = true
    await initPlayerStatuses()
    MessagePlugin.success('公演已开启，选手可以开始操作')
  } catch (e: any) {
    MessagePlugin.error(e.message || '开启公演失败')
  }
}

// ==================== 加载 ====================
async function loadData() {
  loading.value = true
  try {
    if (!seasonStore.season) await seasonStore.fetchSeason()
    await Promise.all([
      teamStore.fetchTeams(currentRoundId.value),
      playerStore.fetchAllUsers()
    ])

    // 发挥值开放状态
    try {
      const release = await getConcurrentReleaseStatus(currentRoundId.value)
      performanceReleased.value = !!release?.performanceReleased
    } catch (_) {}

    // 抽取方式
    try {
      const rs = await getPerformanceRoundStatus(currentRoundId.value)
      if (rs?.generationMode) generationMode.value = rs.generationMode
    } catch (_) {}

    // 公演是否开启
    try {
      performanceStarted.value = await getPerformanceStarted(currentRoundNumber.value)
    } catch (_) {}

    await initPlayerStatuses()
  } catch (e: any) {
    MessagePlugin.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style lang="scss" scoped>
.admin-perf-draw {
  min-height: 100%;
  padding: 16px;
  background: var(--bg-primary);
  max-width: 1400px;
  margin: 0 auto;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;

  h1 {
    margin: 0 0 4px;
    color: var(--text-primary);
    font-size: 22px;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .page-head-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }
}

.overview-section {
  margin-bottom: 16px;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.overview-item {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  .label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .value {
    font-size: 22px;
    font-weight: 700;
    color: var(--text-primary);

    &.highlight {
      color: #6c5ce7;
    }
  }
}

.config-grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 12px;
  margin-bottom: 16px;
}

.config-card {
  border-radius: 14px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  border: 1px solid var(--card-border);
}

.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  .config-info {
    display: flex;
    align-items: center;
    gap: 12px;

    .config-icon {
      font-size: 26px;
    }

    .config-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .config-desc {
      font-size: 12px;
      color: var(--text-secondary);
    }
  }
}

.action-section {
  margin-bottom: 16px;
}

.player-table-card {
  border-radius: 14px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  border: 1px solid var(--card-border);
}

.table-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.player-table {
  width: 100%;
  border-collapse: collapse;

  thead {
    th {
      padding: 10px 12px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-color);
    }
  }

  tbody {
    tr {
      border-bottom: 1px solid var(--border-color);

      &:hover {
        background: var(--hover-bg);
      }
    }

    td {
      padding: 10px 12px;
      font-size: 13px;
      color: var(--text-primary);
    }
  }
}

.player-name {
  font-weight: 500;
}

.team-name {
  color: var(--text-secondary);
}

.performance-value {
  .value {
    font-weight: 700;

    &.positive {
      color: #2ba471;
    }

    &.negative {
      color: #e74c3c;
    }

    &.pending {
      color: var(--text-tertiary);
      font-weight: 500;
    }
  }
}

.pending-text {
  color: var(--text-tertiary);
}

@media (max-width: 768px) {
  .overview-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .config-grid {
    grid-template-columns: 1fr;
  }
}
</style>
