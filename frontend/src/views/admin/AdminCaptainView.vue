<template>
  <div class="admin-captain">
    <t-card class="stage-card" :bordered="false">
      <div class="page-head">
        <div>
          <h1>队长选举</h1>
          <p>第 {{ currentRound }} 公演 - 管理队长选举流程</p>
        </div>
        <div class="page-head-actions">
          <t-button variant="outline" @click="loadData">刷新</t-button>
        </div>
      </div>
    </t-card>

    <t-row :gutter="16">
      <t-col :span="16">
        <t-card title="候选选手" :bordered="false" class="stage-card">
          <template #subtitle>
            <t-tag theme="primary" variant="light">第 {{ currentRound }} 公演</t-tag>
            <span class="subtitle-info">共 {{ filteredCandidates.length }} / {{ candidates.length }} 位候选选手</span>
          </template>

          <div class="candidate-search">
            <t-input v-model="searchKeyword" placeholder="搜索选手姓名" clearable />
          </div>

          <div class="candidates-grid">
            <div
              v-for="candidate in filteredCandidates"
              :key="candidate.id"
              class="candidate-card"
              :class="{
                selected: selectedCaptains.includes(candidate.id),
                captain: candidate.isCurrentRoundCaptain
              }"
              @click="selectCandidate(candidate.id)"
            >
              <div class="candidate-avatar">
                <img 
                  v-if="candidate.avatar" 
                  :src="getAvatarUrl(candidate.avatar)" 
                  :alt="candidate.name" 
                  @error="handleImageError($event)"
                />
                <div class="avatar-placeholder" v-show="!candidate.avatar || imageLoadFailed.includes(candidate.id)">
                  {{ candidate.name.charAt(0) }}
                </div>
              </div>
              <div class="candidate-info">
                <div class="candidate-header">
                  <span class="candidate-name">{{ candidate.name }}</span>
                  <t-tag v-if="candidate.isCurrentRoundCaptain" theme="success" size="small">现任队长</t-tag>
                  <t-tag v-if="selectedCaptains.includes(candidate.id)" theme="primary" size="small">已选择</t-tag>
                </div>
                <div class="candidate-stats">
                  <span class="stat votes">🗳️ {{ getVoteCount(candidate.id) }} 票</span>
                </div>
                <div class="candidate-status">
                  <span :class="`status-tag ${candidate.status}`">
                    {{ getStatusText(candidate.status) }}
                  </span>
                </div>
              </div>
              <div class="candidate-actions">
                <t-button
                  size="small"
                  :theme="candidate.isCurrentRoundCaptain ? 'default' : 'primary'"
                  :disabled="selectedCaptains.length >= teamCount && !selectedCaptains.includes(candidate.id)"
                  @click.stop="toggleCaptain(candidate)"
                >
                  {{ candidate.isCurrentRoundCaptain ? '取消队长' : '设为队长' }}
                </t-button>
              </div>
            </div>
          </div>

          <div v-if="candidates.length === 0" class="empty-state">
            <span class="empty-icon">👥</span>
            <p>暂无候选选手</p>
          </div>
        </t-card>
      </t-col>

      <t-col :span="8">
        <t-card title="队伍阵型与队长" :bordered="false" class="stage-card">
          <template #subtitle>
            <t-tag :theme="allTeamsAssigned ? 'success' : 'warning'" variant="light">
              {{ assignedTeamCount }}/{{ teamCount }} 已分配队长
            </t-tag>
          </template>

          <!-- 队伍列表 -->
          <div class="teams-formation-list">
            <div
              v-for="team in teams"
              :key="team.id"
              class="team-formation-item"
              :class="{ assigned: teamCaptainMap[team.id] }"
            >
              <div class="team-header">
                <span class="team-name">{{ team.name || `第${team.roundIndex + 1}队` }}</span>
                <t-tag theme="primary" variant="light" size="small">
                  {{ team.maxMembers }}人阵型
                </t-tag>
              </div>
              <div class="team-captain-assign">
                <template v-if="teamCaptainMap[team.id]">
                  <div class="assigned-captain">
                    <span class="assigned-captain-name">
                      👑 {{ getCaptainName(teamCaptainMap[team.id]) }}
                    </span>
                    <button class="remove-btn small" @click="removeTeamCaptain(team.id)">×</button>
                  </div>
                </template>
                <template v-else>
                  <t-select
                    placeholder="选择队长"
                    size="small"
                    style="width: 100%"
                    @change="(val: string) => assignCaptainToTeam(team.id, val)"
                  >
                    <t-option
                      v-for="c in availableCaptainsForTeam(team.id)"
                      :key="c.id"
                      :value="c.id"
                      :label="c.name"
                    />
                  </t-select>
                </template>
              </div>
            </div>
          </div>

          <div v-if="teams.length === 0" class="empty-captains">
            <span class="empty-icon">📋</span>
            <p>暂无队伍配置，请先在预先准备中设置</p>
          </div>

          <!-- 已选队长（未分配到队伍） -->
          <div v-if="unassignedCaptains.length > 0" class="unassigned-section">
            <div class="unassigned-title">已选但未分配队长 ({{ unassignedCaptains.length }})</div>
            <div class="unassigned-list">
              <t-tag v-for="c in unassignedCaptains" :key="c.id" theme="warning" variant="light" size="medium">
                {{ c.name }}
              </t-tag>
            </div>
          </div>

          <div class="action-section">
            <t-button
              theme="primary"
              block
              :loading="saving"
              @click="saveCaptains"
            >
              刷新队长数据
            </t-button>
            <t-button
              variant="outline"
              block
              @click="autoSelectCaptains"
            >
              自动推选并分配
            </t-button>
          </div>

          <div class="tips-section">
            <div class="tip-item">
              <span class="tip-icon">💡</span>
              <span class="tip-text">需要为 {{ teamCount }} 个队伍各分配 1 位队长</span>
            </div>
            <div class="tip-item">
              <span class="tip-icon">💡</span>
              <span class="tip-text">队长将拥有组队和选歌的权限</span>
            </div>
          </div>
        </t-card>
      </t-col>
    </t-row>

    <t-card title="投票记录（按候选人汇总）" :bordered="false" class="stage-card" v-if="showVotingRecords">
      <div class="voting-records">
        <table class="records-table">
          <thead>
            <tr>
              <th>候选人</th>
              <th>得票数</th>
              <th>投票成员</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in groupedRecords" :key="item.playerId">
              <td class="candidate-col">
                <span class="candidate-name">{{ item.playerName }}</span>
              </td>
              <td class="votes-col">
                <span class="votes-count">{{ item.votes }}</span>
              </td>
              <td class="voters-col">
                <t-tag v-for="voter in item.voters" :key="voter" variant="light" size="small" style="margin: 2px 4px 2px 0">
                  {{ voter }}
                </t-tag>
                <span v-if="item.voters.length === 0" class="no-voters">暂无</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <t-empty v-if="groupedRecords.length === 0" description="暂无投票记录" />
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { usePlayerStore } from '../../stores/playerStore'
import { useSeasonStore } from '../../stores/seasonStore'
import { useTeamStore } from '../../stores/teamStore'
import {
  getCurrentCaptains,
  getAvailableCaptainPlayers,
  getCaptainVoteDetails,
  getAvatarUrl
} from '../../services/api'
import {
  getTeams as dsGetTeams
} from '../../services/dataService'
import type { User } from '../../types/user'
import type { RoundTeam } from '../../types/round'

const route = useRoute()
const playerStore = usePlayerStore()
const seasonStore = useSeasonStore()
const teamStore = useTeamStore()

const currentRound = computed(() => parseInt(route.params.round as string) || seasonStore.currentRoundNumber)
const saving = ref(false)
const showVotingRecords = ref(false)
const selectedCaptains = ref<string[]>([])
const voteRecords = ref<{ voterName: string; targetName: string; targetId: string; createdAt: string }[]>([])
const searchKeyword = ref('')

const groupedRecords = computed(() => {
  const map = new Map<string, { playerId: string; playerName: string; votes: number; voters: string[] }>()
  voteRecords.value.forEach(r => {
    const id = r.targetId || r.targetName
    if (!map.has(id)) {
      map.set(id, { playerId: id, playerName: r.targetName, votes: 0, voters: [] })
    }
    const item = map.get(id)!
    item.votes++
    if (!item.voters.includes(r.voterName)) {
      item.voters.push(r.voterName)
    }
  })
  return Array.from(map.values()).sort((a, b) => b.votes - a.votes)
})
const imageLoadFailed = ref<string[]>([])

// 按轮次队长数据（替代 User.role）
const captainRecords = ref<{ playerId: string; playerName: string; teamId: string }[]>([])
const availablePlayersData = ref<{ id: string; name: string; attributes: { vocal: number; dance: number; charm: number }; inTeam: boolean }[]>([])

// 队伍数据（含阵型信息）
const teams = ref<RoundTeam[]>([])
const teamCount = computed(() => teams.value.length)

// 队长到队伍的映射：teamId -> captainId
const teamCaptainMap = ref<Record<string, string>>({})

async function loadTeams() {
  const roundId = `round-${currentRound.value}`
  try {
    // 优先从 teamStore 获取（teamStore 通过 dataService 持久化）
    if (teamStore.teams.length > 0) {
      const teamData = teamStore.teams
      teams.value = teamData
      teamData.forEach(team => {
        if (team.captainId) {
          teamCaptainMap.value[team.id] = team.captainId
        }
      })
      return
    }
    // 再尝试从 dataService 直接读取
    const dsData = dsGetTeams(roundId)
    if (dsData.length > 0) {
      teams.value = dsData
      dsData.forEach(team => {
        if (team.captainId) {
          teamCaptainMap.value[team.id] = team.captainId
        }
      })
      return
    }
    // 最后从 API 读取
    const teamData = await getRoundTeams(roundId)
    teams.value = teamData
    teamData.forEach(team => {
      if (team.captainId) {
        teamCaptainMap.value[team.id] = team.captainId
      }
    })
  } catch (e) {
    console.warn('[Captain] Failed to load teams:', e)
    teams.value = []
  }
}

// 判断选手是否是当前轮的队长（通过 captainRecords 而非 User.role）
function isRoundCaptain(playerId: string): boolean {
  return captainRecords.value.some(c => c.playerId === playerId)
}

const candidates = computed(() => {
  // 如果从API获取了可用选手列表，以API数据为准
  if (availablePlayersData.value.length > 0) {
    return availablePlayersData.value.map(ap => {
      const fullUser = playerStore.users.find(u => u.id === ap.id)
      return {
        id: ap.id,
        name: ap.name,
        role: isRoundCaptain(ap.id) ? 'captain' : (fullUser?.role || 'player'),
        status: fullUser?.status || 'active',
        avatar: fullUser?.avatar || null,
        attributes: ap.attributes,
        // 标记是否在当前轮被设为队长
        isCurrentRoundCaptain: isRoundCaptain(ap.id)
      }
    })
  }
  // 降级：从所有用户中过滤（兼容旧行为）
  return playerStore.users.filter(user =>
    user.role !== 'admin' && user.status !== 'eliminated'
  ).map(u => ({
    ...u,
    isCurrentRoundCaptain: isRoundCaptain(u.id)
  }))})

const filteredCandidates = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return candidates.value
  return candidates.value.filter(c => (c.name || '').toLowerCase().includes(kw))
})

// 当前轮的队长列表（已分配到队伍的）
const captains = computed(() => {
  return candidates.value.filter(c =>
    c.isCurrentRoundCaptain || selectedCaptains.value.includes(c.id)
  )
})

// 已分配队长的队伍数量
const assignedTeamCount = computed(() => {
  return Object.keys(teamCaptainMap.value).length
})

// 所有队伍是否都已分配队长
const allTeamsAssigned = computed(() => {
  return teams.value.length > 0 && assignedTeamCount.value === teams.value.length
})

// 已选但未分配到队伍的队长
const unassignedCaptains = computed(() => {
  const assignedCaptainIds = new Set(Object.values(teamCaptainMap.value))
  return captains.value.filter(c => !assignedCaptainIds.has(c.id))
})

// 获取队长姓名
function getCaptainName(captainId: string): string {
  const captain = candidates.value.find(c => c.id === captainId)
  return captain?.name || '未知'
}

// 获取可分配给某队伍的队长（未被其他队伍分配的）
function availableCaptainsForTeam(teamId: string): User[] {
  const assignedCaptainIds = new Set(
    Object.entries(teamCaptainMap.value)
      .filter(([tid]) => tid !== teamId)
      .map(([, cid]) => cid)
  )
  return captains.value.filter(c => !assignedCaptainIds.has(c.id))
}

function getStatusText(status: string): string {
  const map: Record<string, string> = {
    active: '活跃',
    danger: '危险区',
    eliminated: '已淘汰'
  }
  return map[status] || status
}

function getVoteCount(playerId: string): number {
  const record = groupedRecords.value.find(r => r.playerId === playerId)
  return record?.votes || 0
}

function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement
  const alt = img.getAttribute('alt')
  if (alt) {
    const candidate = candidates.value.find(c => c.name === alt) || captains.value.find(c => c.name === alt)
    if (candidate && !imageLoadFailed.value.includes(candidate.id)) {
      imageLoadFailed.value.push(candidate.id)
    }
  }
  img.style.display = 'none'
}

function selectCandidate(userId: string) {
  if (selectedCaptains.value.includes(userId)) {
    selectedCaptains.value = selectedCaptains.value.filter(id => id !== userId)
  } else if (selectedCaptains.value.length < teamCount.value) {
    selectedCaptains.value.push(userId)
  } else {
    MessagePlugin.warning(`最多只能选择 ${teamCount.value} 位队长`)
  }
}

function toggleCaptain(candidate: any) {
  if (candidate.isCurrentRoundCaptain) {
    removeCaptain(candidate.id)
  } else {
    selectCandidate(candidate.id)
  }
}

function removeCaptain(userId: string) {
  selectedCaptains.value = selectedCaptains.value.filter(id => id !== userId)
  // 同时移除该队长在各队伍的分配
  Object.keys(teamCaptainMap.value).forEach(teamId => {
    if (teamCaptainMap.value[teamId] === userId) {
      delete teamCaptainMap.value[teamId]
    }
  })
}

// 获取队伍已分配的队长
function getTeamCaptain(teamId: string): User | undefined {
  const captainId = teamCaptainMap.value[teamId]
  if (!captainId) return undefined
  return candidates.value.find(c => c.id === captainId)
}

// 持久化单个队伍的队长分配到后端
async function persistTeamCaptain(teamId: string, captainId: string) {
  const roundId = `round-${currentRound.value}`
  const team = teams.value.find(t => t.id === teamId)
  if (!team) return

  try {
    // 先把队长当作普通队员加入队伍
    const isCaptainInMembers = team.members?.some(m => m.playerId === captainId)
    if (!isCaptainInMembers) {
      await teamStore.addMember(team.id, captainId, roundId)
    }

    // 再设置该队员为队长身份
    await teamStore.assignCaptain(team.id, captainId, roundId)

    // 更新队名为"xxx团"
    const captain = playerStore.getPlayerById(captainId)
    if (captain) {
      const newTeamName = `${captain.name}团`
      await teamStore.updateTeamName(team.id, newTeamName, roundId)
    }
  } catch (e: any) {
    console.error(`[Captain] 保存队伍 ${team.name} 队长失败:`, e)
    throw e
  }
}

async function clearTeamCaptain(teamId: string) {
  const roundId = `round-${currentRound.value}`
  try {
    await teamStore.assignCaptain(teamId, '', roundId)
  } catch (e: any) {
    console.error(`[Captain] 移除队伍 ${teamId} 队长失败:`, e)
    throw e
  }
}

// 为队伍分配队长（立即持久化）
async function assignCaptainToTeam(teamId: string, captainId: string) {
  const roundId = `round-${currentRound.value}`
  // 检查该队长是否已被分配到其他队伍，若是则先移除
  const previousTeamId = Object.keys(teamCaptainMap.value).find(
    tid => teamCaptainMap.value[tid] === captainId && tid !== teamId
  )

  if (previousTeamId) {
    delete teamCaptainMap.value[previousTeamId]
    try {
      await clearTeamCaptain(previousTeamId)
    } catch (e: any) {
      MessagePlugin.error(`移除原队伍队长失败: ${e.message}`)
    }
  }

  teamCaptainMap.value[teamId] = captainId

  try {
    saving.value = true
    await persistTeamCaptain(teamId, captainId)
    MessagePlugin.success('队长已分配并保存')
    // 刷新数据
    await teamStore.fetchTeams(roundId)
    await loadTeams()
    await loadCaptainRecords()
  } catch (e: any) {
    MessagePlugin.error(`分配队长失败: ${e.message}`)
  } finally {
    saving.value = false
  }
}

// 移除队伍的队长分配（立即持久化）
async function removeTeamCaptain(teamId: string) {
  delete teamCaptainMap.value[teamId]
  try {
    saving.value = true
    await clearTeamCaptain(teamId)
    MessagePlugin.success('队长已移除')
    await teamStore.fetchTeams(`round-${currentRound.value}`)
    await loadTeams()
    await loadCaptainRecords()
  } catch (e: any) {
    MessagePlugin.error(`移除队长失败: ${e.message}`)
  } finally {
    saving.value = false
  }
}

async function autoSelectCaptains() {
  // 随机从候选人中选出队长并随机分配到各队
  const pool = [...candidates.value]
  const count = Math.min(teamCount.value, teams.value.length, pool.length)
  // Fisher–Yates 洗牌后取前 count 个
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  selectedCaptains.value = pool.slice(0, count).map(c => c.id)

  // 逐个队伍保存，每次分配都立即请求后端
  const roundId = `round-${currentRound.value}`
  const errors: string[] = []
  teamCaptainMap.value = {}
  saving.value = true
  for (const [index, team] of teams.value.entries()) {
    const captainId = selectedCaptains.value[index]
    if (!captainId) continue
    teamCaptainMap.value[team.id] = captainId
    try {
      await persistTeamCaptain(team.id, captainId)
    } catch (e: any) {
      console.warn(`[Captain] 自动分配队伍 ${team.name} 队长失败:`, e)
      errors.push(`${team.name}: ${e.message}`)
    }
  }
  saving.value = false

  // 刷新数据
  await teamStore.fetchTeams(roundId)
  await loadTeams()
  await loadCaptainRecords()

  if (errors.length > 0) {
    MessagePlugin.warning(`自动分配完成，但部分队伍失败:\n${errors.join('\n')}`)
  } else {
    MessagePlugin.success(`已自动推选并分配 ${teamCount.value} 位队长`)
  }
}

async function saveCaptains() {
  // 现在每次分配都会实时保存，此按钮仅用于刷新数据
  saving.value = true
  try {
    const roundId = `round-${currentRound.value}`
    await teamStore.fetchTeams(roundId)
    await loadTeams()
    await loadCaptainRecords()
    MessagePlugin.success('队长数据已刷新')
  } catch (e: any) {
    console.error('[Captain] saveCaptains refresh error:', e)
    MessagePlugin.error(e.message || '刷新失败')
  } finally {
    saving.value = false
  }
}

function formatVoteTime(dateStr?: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

async function loadVoteRecords() {
  const roundId = `round-${currentRound.value}`
  try {
    const data = await getCaptainVoteDetails(roundId)
    voteRecords.value = data || []
    showVotingRecords.value = voteRecords.value.length > 0
  } catch (e) {
    voteRecords.value = []
    showVotingRecords.value = false
  }
}

async function loadCaptainRecords() {
  const roundId = `round-${currentRound.value}`
  try {
    const captainsRes = await getCurrentCaptains(roundId)
    if (captainsRes.success) {
      captainRecords.value = captainsRes.data || []
    }
    const availableRes = await getAvailableCaptainPlayers(roundId)
    if (availableRes.success) {
      availablePlayersData.value = availableRes.data || []
    }
  } catch (e) {
    console.warn('[Captain] 按轮次加载队长数据失败，降级使用用户角色:', e)
    captainRecords.value = []
    availablePlayersData.value = []
  }
}

async function loadData() {
  const roundId = `round-${currentRound.value}`
  await Promise.all([
    playerStore.fetchUsers({ pageSize: 1000 }),
    seasonStore.fetchProgress(),
    teamStore.fetchTeams(roundId),
    loadCaptainRecords(),
    loadVoteRecords()
  ])
  await loadTeams()
}

onMounted(loadData)
</script>

<style lang="scss" scoped>
.admin-captain {
  max-width: 1400px;
}

.stage-card {
  border-radius: 8px;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;

  h1 {
    margin: 0 0 4px;
    font-size: 20px;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
  }
}

.page-head-actions {
  display: flex;
  gap: 8px;
}

.subtitle-info {
  margin-left: 8px;
  color: var(--text-secondary);
  font-size: 13px;
}

.candidate-search {
  margin-bottom: 16px;
}

.candidates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.candidate-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--card-bg);
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;

  &:hover {
    border-color: #0052d9;
    box-shadow: 0 2px 8px rgba(0, 82, 217, 0.1);
  }

  &.selected {
    border-color: #0052d9;
    background: rgba(0, 82, 217, 0.04);
  }

  &.captain {
    border-color: #00a870;
    background: rgba(0, 168, 112, 0.04);
  }
}

.candidate-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0052cc, #003da6);
    color: #fff;
    font-size: 22px;
    font-weight: 600;
  }
}

.candidate-info {
  width: 100%;
  min-width: 0;
}

.candidate-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

.candidate-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-all;
}

.candidate-stats {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-bottom: 6px;

  .stat {
    font-size: 11px;
    padding: 2px 6px;
    background: var(--bg-primary);
    border-radius: 4px;
    color: var(--text-secondary);
  }

  .stat.votes {
    background: rgba(0, 82, 217, 0.1);
    color: #0052d9;
    font-weight: 600;
  }
}

.candidate-status {
  .status-tag {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;

    &.active {
      background: rgba(0, 168, 112, 0.1);
      color: #00a870;
    }

    &.danger {
      background: rgba(245, 108, 108, 0.1);
      color: #f56c6c;
    }

    &.eliminated {
      background: rgba(156, 163, 175, 0.1);
      color: var(--text-tertiary);
    }
  }
}

.candidate-actions {
  width: 100%;
}

.empty-state {
  text-align: center;
  padding: 40px;
  background: var(--bg-primary);
  border-radius: 8px;

  .empty-icon {
    font-size: 48px;
    display: block;
    margin-bottom: 12px;
  }

  p {
    color: var(--text-tertiary);
    margin: 0;
  }
}

.captains-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.captain-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 237, 78, 0.1));
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 8px;
}

.captain-item .captain-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0052cc, #003da6);
    color: #fff;
    font-size: 20px;
    font-weight: 600;
  }
}

.captain-info {
  flex: 1;

  .captain-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    display: block;
  }

  .captain-attr {
    font-size: 11px;
    color: var(--text-secondary);
  }
}

.remove-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: rgba(245, 108, 108, 0.1);
  color: #f56c6c;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(245, 108, 108, 0.2);
  }
}

.empty-captains {
  text-align: center;
  padding: 32px;
  background: var(--bg-primary);
  border-radius: 8px;

  .empty-icon {
    font-size: 40px;
    display: block;
    margin-bottom: 8px;
  }

  p {
    color: var(--text-tertiary);
    margin: 0;
    font-size: 13px;
  }
}

.teams-formation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.team-formation-item {
  padding: 12px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s;

  &:hover {
    border-color: #0052d9;
    box-shadow: 0 2px 8px rgba(0, 82, 217, 0.1);
  }

  &.assigned {
    background: linear-gradient(135deg, rgba(0, 168, 112, 0.05), rgba(0, 210, 140, 0.05));
    border-color: #00a870;
  }
}

.team-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;

  .team-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.team-captain-assign {
  .assigned-captain {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: rgba(255, 215, 0, 0.1);
    border: 1px solid rgba(255, 215, 0, 0.3);
    border-radius: 6px;

    .assigned-captain-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }
  }
}

.remove-btn.small {
  width: 20px;
  height: 20px;
  font-size: 12px;
}

.unassigned-section {
  margin-top: 16px;
  padding: 12px;
  background: rgba(245, 108, 108, 0.05);
  border: 1px dashed rgba(245, 108, 108, 0.3);
  border-radius: 8px;

  .unassigned-title {
    font-size: 13px;
    font-weight: 600;
    color: #f56c6c;
    margin-bottom: 8px;
  }

  .unassigned-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
}

.action-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.tips-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.tip-item {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;

  .tip-icon {
    font-size: 14px;
  }

  .tip-text {
    font-size: 12px;
    color: var(--text-secondary);
  }
}

.voting-records {
  overflow-x: auto;
}

.records-table {
  width: 100%;
  border-collapse: collapse;

  th, td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
    font-size: 13px;
  }

  th {
    background: var(--bg-primary);
    font-weight: 600;
    color: var(--text-secondary);
  }

  td {
    color: var(--text-primary);
  }
}

.candidate-col .candidate-name {
  font-weight: 600;
  font-size: 14px;
}

.votes-col .votes-count {
  font-size: 18px;
  font-weight: 700;
  color: #0052d9;
}

.voters-col {
  max-width: 300px;
}

.no-voters {
  color: var(--text-tertiary);
  font-size: 12px;
}

@media (max-width: 768px) {
  .candidates-grid {
    grid-template-columns: 1fr;
  }

  .candidate-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .candidate-actions {
    margin-top: 8px;
    width: 100%;
  }
}
</style>