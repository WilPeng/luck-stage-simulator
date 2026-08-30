<template>
  <div class="admin-captain-choice">
    <div class="page-header">
      <h1>🤝 意向队长分组管理</h1>
      <p class="subtitle">第{{ currentRound }}公演 · 选手选择意向队长，按匹配完成分组</p>
    </div>

    <div class="stat-cards">
      <div class="stat-card">
        <span class="stat-value">{{ preferences.length }}</span>
        <span class="stat-label">已提交意向</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ captainOptions.length }}</span>
        <span class="stat-label">队长数</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ teamStore.teams.length }}</span>
        <span class="stat-label">队伍数</span>
      </div>
    </div>

    <div class="action-bar">
      <t-button theme="primary" :loading="matching" @click="handleMatch">
        🤝 按意向匹配分组
      </t-button>
      <t-button variant="outline" :loading="loading" @click="loadAll">刷新</t-button>
    </div>

    <!-- 意向列表 -->
    <div class="section-card">
      <div class="section-title">
        <span>📋 选手意向</span>
        <t-tag theme="primary" variant="light">{{ filteredPreferences.length }} 条</t-tag>
      </div>

      <!-- 筛选栏 -->
      <div class="filter-bar">
        <t-select
          v-model="filterCaptainId"
          placeholder="按意向队长筛选"
          clearable
          filterable
          style="width: 220px"
        >
          <t-option v-for="cap in captainFilterOptions" :key="cap.value" :value="cap.value" :label="cap.label" />
        </t-select>
        <span class="filter-hint">可多选行后批量分配，超出队伍容量会被拦截</span>
      </div>

      <div v-if="filteredPreferences.length === 0" class="empty-tip">暂无符合条件的意向</div>
      <div v-else class="preference-table-wrap">
        <table class="preference-table">
          <thead>
            <tr>
              <th style="width: 40px">
                <t-checkbox
                  :checked="selectedCount > 0 && selectedCount === filteredPreferences.length"
                  :indeterminate="selectedCount > 0 && selectedCount < filteredPreferences.length"
                  @change="(checked: any) => toggleSelectAll(checked)"
                />
              </th>
              <th>选手</th>
              <th>意向队长</th>
              <th style="width: 120px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in filteredPreferences"
              :key="p.playerId"
              :class="{ selected: selectedIds.has(p.playerId) }"
            >
              <td>
                <t-checkbox
                  :checked="selectedIds.has(p.playerId)"
                  @change="(checked: any) => toggleSelect(p.playerId, checked)"
                />
              </td>
              <td class="cell-player">{{ p.playerName }}</td>
              <td class="cell-captain">{{ p.preferredCaptainName || '未知队长' }}</td>
              <td>
                <t-button
                  theme="primary"
                  variant="outline"
                  size="small"
                  :loading="assigningIds.has(p.playerId)"
                  :disabled="assigningIds.size > 0 || matching"
                  @click="handleAssignOne(p)"
                >
                  分配
                </t-button>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 批量操作条 -->
        <div v-if="selectedCount > 0" class="batch-bar">
          <span>已选 <strong>{{ selectedCount }}</strong> 条</span>
          <t-button theme="success" size="small" :loading="batchAssigning" :disabled="matching" @click="handleAssignBatch">
            批量分配所选意向
          </t-button>
          <t-button variant="text" size="small" @click="clearSelection">取消选择</t-button>
        </div>
      </div>
    </div>

    <!-- 队伍状态 -->
    <div class="section-card">
      <div class="section-title"><span>👥 队伍状态</span></div>
      <div class="teams-grid">
        <div v-for="team in teamStore.teams" :key="team.id" class="team-card">
          <div class="team-header">
            <span class="team-name">{{ team.name }}</span>
            <span class="team-count">{{ team.members?.length || 0 }}/{{ team.maxMembers }}</span>
          </div>
          <div class="team-captain">队长：<strong>{{ getCaptainName(team) || '未指定' }}</strong></div>
          <div class="team-members">
            <div v-for="m in team.members" :key="m.playerId" class="team-member">{{ m.player?.name || '未知' }}</div>
            <div v-if="!team.members || team.members.length === 0" class="no-members">暂无成员</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 未提交意向选手 -->
    <div class="section-card">
      <div class="section-title">
        <span>🎲 未提交意向的选手（需手动或随机分组）</span>
        <t-tag theme="warning" variant="light">{{ unassignedPlayers.length }} 人</t-tag>
      </div>
      <div class="unassigned-actions">
        <t-button theme="success" :loading="randomAssigning" :disabled="unassignedPlayers.length === 0" @click="handleRandomAssign">
          🎲 随机分配未入队选手
        </t-button>
        <span class="action-hint">随机分配到有容量的队伍（已入队/已提交意向的选手不受影响）</span>
      </div>
      <div v-if="unassignedPlayers.length === 0" class="empty-tip">所有选手都已入队或已提交意向</div>
      <div v-else class="unassigned-list">
        <div v-for="p in unassignedPlayers" :key="p.id" class="unassigned-item">
          <span class="unassigned-name">{{ p.name }}</span>
          <t-button
            theme="primary"
            variant="outline"
            size="small"
            @click="openAssignDialog({ id: p.id, name: p.name })"
          >
            分配
          </t-button>
        </div>
      </div>
    </div>

    <!-- 单个分配弹窗 -->
    <t-dialog
      v-model:visible="showAssignDialog"
      :header="`分配「${assigningPlayer?.name || ''}」到队伍`"
      width="420px"
      :close-on-overlay-click="true"
      :destroy-on-close="true"
    >
      <div class="assign-dialog-body">
        <p class="assign-dialog-tip">选择要把该选手分配到的队伍：</p>
        <t-select
          v-model="targetTeamId"
          placeholder="选择目标队伍"
          filterable
          style="width: 100%"
        >
          <t-option
            v-for="team in teamStore.teams"
            :key="team.id"
            :value="team.id"
            :label="`${team.name}（${team.members?.length || 0}/${team.maxMembers}）${getCaptainName(team) ? '· 队长' + getCaptainName(team) : ''}`"
            :disabled="(team.members?.length || 0) >= team.maxMembers"
          />
        </t-select>
      </div>
      <template #footer>
        <t-space>
          <t-button @click="showAssignDialog = false">取消</t-button>
          <t-button theme="primary" :loading="singleAssigning" :disabled="!targetTeamId" @click="handleSingleAssign">
            确认分配
          </t-button>
        </t-space>
      </template>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { useTeamStore } from '../../stores/teamStore'
import { usePlayerStore } from '../../stores/playerStore'
import { getAllCaptainPreferences, matchCaptainPreferences, getCurrentCaptains, assignCaptainPreferences } from '../../services/api'

const route = useRoute()
const teamStore = useTeamStore()
const playerStore = usePlayerStore()

const currentRound = computed(() => parseInt(route.params.round as string) || 1)
const loading = ref(false)
const matching = ref(false)
const randomAssigning = ref(false)
const preferences = ref<{ playerId: string; playerName: string; preferredCaptainId: string; preferredCaptainName: string; teamId: string }[]>([])
const captainOptions = ref<any[]>([])

// 筛选与选择
const filterCaptainId = ref('')
const selectedIds = ref<Set<string>>(new Set())
const assigningIds = ref<Set<string>>(new Set())
const batchAssigning = ref(false)

// 单个分配弹窗
const showAssignDialog = ref(false)
const assigningPlayer = ref<{ id: string; name: string } | null>(null)
const targetTeamId = ref('')
const singleAssigning = ref(false)

// 未提交意向且未入队的选手（需要手动/随机分组）
const unassignedPlayers = computed(() => {
  const inTeamIds = new Set<string>()
  teamStore.teams.forEach(t => {
    t.members?.forEach(m => inTeamIds.add(m.playerId))
    if (t.captainId) inTeamIds.add(t.captainId)
  })
  const withPreferenceIds = new Set(preferences.value.map(p => p.playerId))
  return playerStore.users
    .filter(u => u.role !== 'admin' && u.status !== 'eliminated')
    .filter(u => !inTeamIds.has(u.id) && !withPreferenceIds.has(u.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'))
})

const totalUnassignedCount = computed(() => unassignedPlayers.value.length)

const filteredPreferences = computed(() => {
  if (!filterCaptainId.value) return preferences.value
  return preferences.value.filter(p => p.preferredCaptainId === filterCaptainId.value)
})

// 筛选下拉选项：合并 意向里的队长 + RoundCaptain 表 + 队伍中的 captainId，去重
const captainFilterOptions = computed(() => {
  const map = new Map<string, string>()
  // 1. 意向里的队长
  preferences.value.forEach(p => {
    if (p.preferredCaptainId && p.preferredCaptainName) {
      map.set(p.preferredCaptainId, p.preferredCaptainName)
    }
  })
  // 2. getCurrentCaptains 返回
  captainOptions.value.forEach(c => {
    if (c.playerId) map.set(c.playerId, c.playerName || c.playerId)
  })
  // 3. 队伍中的 captainId
  teamStore.teams.forEach(t => {
    if (t.captainId) {
      const name = playerStore.users.find(u => u.id === t.captainId)?.name || t.captainName || t.captainId
      map.set(t.captainId, name)
    }
  })
  return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
})

const selectedCount = computed(() => filteredPreferences.value.filter(p => selectedIds.value.has(p.playerId)).length)

function getCaptainName(team: any): string | null {
  if (!team.captainId) return null
  const cap = captainOptions.value.find(c => c.playerId === team.captainId)
  if (cap?.playerName) return cap.playerName
  return playerStore.users.find(u => u.id === team.captainId)?.name || team.captainName || null
}

function toggleSelect(playerId: string, checked: boolean) {
  if (checked) selectedIds.value.add(playerId)
  else selectedIds.value.delete(playerId)
  selectedIds.value = new Set(selectedIds.value)
}

function toggleSelectAll(checked: boolean) {
  if (checked) {
    filteredPreferences.value.forEach(p => selectedIds.value.add(p.playerId))
  } else {
    filteredPreferences.value.forEach(p => selectedIds.value.delete(p.playerId))
  }
  selectedIds.value = new Set(selectedIds.value)
}

function clearSelection() {
  selectedIds.value = new Set()
}

async function loadAll() {
  loading.value = true
  try {
    await Promise.all([
      teamStore.fetchTeams(`round-${currentRound.value}`),
      playerStore.fetchUsers({ pageSize: 1000 })
    ])
    const [prefRes, capRes] = await Promise.all([
      getAllCaptainPreferences(`round-${currentRound.value}`),
      getCurrentCaptains(`round-${currentRound.value}`)
    ])
    preferences.value = prefRes.preferences || []
    captainOptions.value = capRes.data || []
    selectedIds.value = new Set()
  } catch (e) {
    console.error('[AdminCaptainChoice] 加载失败:', e)
  } finally {
    loading.value = false
  }
}

// 分配单条意向
async function handleAssignOne(p: { playerId: string; playerName: string }) {
  if (assigningIds.value.size > 0 || matching.value) return
  assigningIds.value.add(p.playerId)
  assigningIds.value = new Set(assigningIds.value)
  try {
    const result = await assignCaptainPreferences(`round-${currentRound.value}`, [p.playerId])
    if (result.assignedCount > 0) {
      MessagePlugin.success(`已分配「${p.playerName}」到其意向队长队伍`)
    } else {
      MessagePlugin.warning((result.errors && result.errors[0] && result.errors[0].error) || '分配失败')
    }
    await loadAll()
  } catch (e: any) {
    MessagePlugin.error(e.message || '分配失败')
  } finally {
    assigningIds.value = new Set()
  }
}

// 批量分配所选意向
async function handleAssignBatch() {
  if (selectedIds.value.size === 0 || batchAssigning.value || matching.value) return
  const ids = filteredPreferences.value.filter(p => selectedIds.value.has(p.playerId)).map(p => p.playerId)
  const confirmed = window.confirm(`将批量分配选中的 ${ids.length} 条意向到各自队长队伍（超出容量的会被跳过）。是否继续？`)
  if (!confirmed) return
  batchAssigning.value = true
  try {
    const result = await assignCaptainPreferences(`round-${currentRound.value}`, ids)
    let msg = `批量分配完成：成功 ${result.assignedCount} 条`
    if (result.errorCount > 0) {
      msg += `，失败 ${result.errorCount} 条`
    }
    if (result.errors && result.errors.length > 0) {
      msg += `\n失败详情：${result.errors.slice(0, 3).map(e => e.playerName + '：' + e.error).join('; ')}`
    }
    MessagePlugin[result.errorCount > 0 ? 'warning' : 'success'](msg)
    await loadAll()
  } catch (e: any) {
    MessagePlugin.error(e.message || '批量分配失败')
  } finally {
    batchAssigning.value = false
  }
}

async function handleMatch() {
  const confirmed = window.confirm('将根据选手提交的意向队长进行匹配分组，未提交意向的选手随机补位。是否继续？')
  if (!confirmed) return
  matching.value = true
  try {
    const result = await matchCaptainPreferences(`round-${currentRound.value}`)
    MessagePlugin.success(`匹配完成：${result.matchedByPreference} 人按意向，${result.randomFill} 人随机补位`)
    await loadAll()
  } catch (e: any) {
    MessagePlugin.error(e.message || '匹配失败')
  } finally {
    matching.value = false
  }
}

// ===== 未提交意向选手的分组 =====

// 打开单个分配弹窗
function openAssignDialog(player: { id: string; name: string }) {
  assigningPlayer.value = player
  targetTeamId.value = ''
  showAssignDialog.value = true
}

// 单个分配：把某未入队选手分配到指定队伍
async function handleSingleAssign() {
  if (!assigningPlayer.value || !targetTeamId.value || singleAssigning.value) return
  singleAssigning.value = true
  try {
    await teamStore.addMember(targetTeamId.value, assigningPlayer.value.id, `round-${currentRound.value}`)
    MessagePlugin.success(`已将「${assigningPlayer.value.name}」分配到目标队伍`)
    showAssignDialog.value = false
    await loadAll()
  } catch (e: any) {
    MessagePlugin.error(e.message || '分配失败')
  } finally {
    singleAssigning.value = false
  }
}

// 随机分配所有未入队选手到有容量的队伍
async function handleRandomAssign() {
  if (unassignedPlayers.value.length === 0) {
    MessagePlugin.warning('没有未入队的选手')
    return
  }
  const confirmed = window.confirm(`将随机分配 ${unassignedPlayers.value.length} 位未入队选手到有容量的队伍。是否继续？`)
  if (!confirmed) return
  randomAssigning.value = true
  try {
    await teamStore.randomAssign(`round-${currentRound.value}`)
    MessagePlugin.success(`已随机分配 ${unassignedPlayers.value.length} 位选手`)
    await loadAll()
  } catch (e: any) {
    MessagePlugin.error(e.message || '随机分配失败')
  } finally {
    randomAssigning.value = false
  }
}

onMounted(loadAll)
</script>

<style scoped lang="scss">
.admin-captain-choice {
  padding: 16px;
  min-height: 100%;
}

.page-header {
  margin-bottom: 20px;
  h1 { margin: 0 0 6px; font-size: 22px; color: var(--text-primary); }
  .subtitle { margin: 0; font-size: 13px; color: var(--text-secondary); }
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 16px;

  .stat-card {
    background: var(--card-bg);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

    .stat-value { font-size: 24px; font-weight: 800; color: #667eea; }
    .stat-label { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; }
  }
}

.action-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.section-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 12px;
}

.preference-table-wrap {
  overflow-x: auto;
}

.preference-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;

  th, td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
  }

  th {
    background: var(--bg-primary);
    font-weight: 600;
    color: var(--text-secondary);
  }

  tbody tr {
    transition: background 0.15s;

    &:hover {
      background: var(--hover-bg);
    }

    &.selected {
      background: rgba(102, 126, 234, 0.08);
    }
  }

  .cell-player { font-weight: 600; }
  .cell-captain { color: #f39c12; font-weight: 600; }
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;

  .filter-hint {
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 10px 12px;
  background: rgba(102, 126, 234, 0.08);
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 8px;

  strong { color: #667eea; }
}

.teams-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;

  @media (min-width: 480px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (min-width: 768px) {
    grid-template-columns: repeat(3, 1fr);
  }
}

.team-card {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;

  .team-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;

    .team-name { font-size: 15px; font-weight: 700; }
    .team-count { font-size: 12px; color: var(--text-tertiary); }
  }

  .team-captain { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }

  .team-members {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    .team-member {
      padding: 4px 10px;
      background: var(--hover-bg);
      border-radius: 12px;
      font-size: 12px;
    }

    .no-members { color: var(--text-tertiary); font-size: 12px; }
  }
}

.empty-tip {
  padding: 24px;
  text-align: center;
  color: var(--text-tertiary);
}

// 未提交意向选手区
.unassigned-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;

  .action-hint {
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

.unassigned-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.unassigned-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  background: var(--hover-bg);
  border-radius: 8px;
  font-size: 14px;

  .unassigned-name {
    font-weight: 600;
  }
}

.assign-dialog-body {
  .assign-dialog-tip {
    margin: 0 0 12px;
    font-size: 14px;
    color: var(--text-secondary);
  }
}
</style>
