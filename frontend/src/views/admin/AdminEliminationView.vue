<template>
  <div class="admin-elimination">
    <div class="page-header">
      <div>
        <h1>淘汰管理</h1>
        <p>查看各队伍详情，选择要淘汰的选手</p>
      </div>
      <t-space>
        <t-button variant="outline" :loading="loading" @click="loadAll">刷新数据</t-button>
        <t-button theme="danger" :disabled="selectedIds.length === 0" :loading="batchEliminating" @click="confirmBatchEliminate">
          批量淘汰 ({{ selectedIds.length }})
        </t-button>
      </t-space>
    </div>

    <!-- 第一部分：队伍详情展示 -->
    <div class="teams-section">
      <h2 class="section-title">队伍详情</h2>
      
      <!-- 如果队伍详情为空，显示提示 -->
      <t-alert v-if="teamsWithDetails.length === 0" theme="warning" style="margin-bottom: 16px">
        <template #message>
          暂无队伍数据，请先完成组队。您可以前往 <router-link to="/admin/team">组队管理</router-link> 创建队伍。
        </template>
      </t-alert>
      
      <div v-for="team in teamsWithDetails" :key="team.teamId" class="team-card">
        <div class="team-header">
          <div class="team-info">
            <h3>{{ team.teamName }}</h3>
            <t-tag :theme="isTeamSafe(team.teamId) ? 'success' : 'default'" variant="light">
              {{ isTeamSafe(team.teamId) ? '安全团' : '普通团' }}
            </t-tag>
          </div>
          <div class="team-scores">
            <div class="score-item">
              <span class="score-label">团秀得分</span>
              <span class="score-value">{{ team.teamScore || '-' }}</span>
            </div>
            <div class="score-item">
              <span class="score-label">团队排名</span>
              <span class="score-value">{{ team.teamRank || '-' }}</span>
            </div>
          </div>
        </div>

        <!-- 队伍成员列表 -->
        <div class="members-list">
          <div v-for="member in team.members" :key="member.playerId" class="member-item">
            <div class="member-info">
              <span class="member-name">{{ member.name }}</span>
              <t-tag v-if="member.isCaptain" theme="primary" variant="light" size="small">队长</t-tag>
              <t-tag v-else theme="default" variant="light" size="small">成员</t-tag>
            </div>
            <div class="member-details">
              <div class="detail-item">
                <span class="detail-label">个人评级</span>
                <t-tag :theme="getRatingTheme(member.personalRating)" variant="light" size="small">
                  {{ member.personalRating || '-' }}
                </t-tag>
              </div>
              <div class="detail-item">
                <span class="detail-label">团秀得分</span>
                <span class="detail-value">{{ member.teamScore || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">个人喜爱度</span>
                <span class="detail-value">{{ member.audienceVotes || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">喜爱度排名</span>
                <span :class="['rank-badge', getRankClass(member.audienceRank)]">
                  {{ member.audienceRank || '-' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 第二部分：统一表格 -->
    <div class="table-section">
      <h2 class="section-title">选手列表</h2>
      <div class="table-wrap">
        <table class="elimination-table">
          <thead>
            <tr>
              <th style="width: 50px">
                <t-checkbox
                  :checked="isAllSelected"
                  :indeterminate="isIndeterminate"
                  @change="toggleAllSelection"
                />
              </th>
              <th>选手姓名</th>
              <th>所在团</th>
              <th>角色</th>
              <th>个人评级</th>
              <th>团秀得分</th>
              <th>个人喜爱度</th>
              <th>喜爱度排名</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="member in allMembers"
              :key="member.playerId"
              :class="{
                'row-selected': selectedIds.includes(member.playerId),
                'row-captain': member.isCaptain,
                'row-safe': isTeamSafe(member.teamId)
              }"
            >
              <td>
                <t-checkbox
                  :checked="selectedIds.includes(member.playerId)"
                  :disabled="isTeamSafe(member.teamId)"
                  @change="() => toggleMember(member.playerId)"
                />
              </td>
              <td>
                <span class="member-name">{{ member.name }}</span>
                <t-tag v-if="member.isCaptain" theme="primary" variant="light" size="small">队长</t-tag>
              </td>
              <td>{{ member.teamName }}</td>
              <td>{{ member.isCaptain ? '队长' : '成员' }}</td>
              <td>
                <t-tag :theme="getRatingTheme(member.personalRating)" variant="light" size="small">
                  {{ member.personalRating || '-' }}
                </t-tag>
              </td>
              <td>{{ member.teamScore || '-' }}</td>
              <td>{{ member.audienceVotes || '-' }}</td>
              <td>
                <span :class="['rank-badge', getRankClass(member.audienceRank)]">
                  {{ member.audienceRank || '-' }}
                </span>
              </td>
              <td>
                <t-button
                  theme="danger"
                  variant="text"
                  size="small"
                  :disabled="isTeamSafe(member.teamId)"
                  @click="handleEliminateMember(member)"
                >
                  淘汰
                </t-button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 淘汰确认对话框 -->
    <t-dialog
      v-model:visible="showConfirmDialog"
      header="确认淘汰"
      theme="warning"
      :close-on-overlay-click="false"
    >
      <div v-if="selectedIds.length > 0">
        <p>确定要淘汰以下选手吗？</p>
        <ul class="eliminate-list">
          <li v-for="id in selectedIds" :key="id">
            {{ getPlayerName(id) }}
          </li>
        </ul>
      </div>
      <template #footer>
        <t-button @click="showConfirmDialog = false">取消</t-button>
        <t-button theme="danger" :loading="batchEliminating" @click="doBatchEliminate">确认淘汰</t-button>
      </template>
    </t-dialog>

    <!-- 淘汰记录 -->
    <t-card :bordered="false" class="records-card">
      <template #header>
        <h3>淘汰记录</h3>
      </template>
      
      <div v-if="store.records.length > 0" class="records-list">
        <div v-for="record in store.records" :key="record.id" class="record-item">
          <div class="record-info">
            <span class="record-name">{{ record.userName }}</span>
            <span class="record-detail">
              第{{ record.round }}轮 · 排名{{ record.rank || '-' }} · {{ record.reason }}
            </span>
            <span class="record-time">{{ formatTime(record.eliminatedAt) }}</span>
          </div>
          <t-button theme="success" variant="text" size="small" @click="handleRestore(record.userId)">
            恢复
          </t-button>
        </div>
      </div>
      <t-empty v-else description="暂无淘汰记录" />
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useEliminationStore } from '../../stores/eliminationStore'
import { useSeasonStore } from '../../stores/seasonStore'
import { usePerformanceStore } from '../../stores/performanceStore'
import { useTeamStore } from '../../stores/teamStore'

const route = useRoute()
const store = useEliminationStore()
const seasonStore = useSeasonStore()
const performanceStore = usePerformanceStore()
const teamStore = useTeamStore()

// 从路由参数获取轮次，如果没有则使用 seasonStore 的当前轮次
const currentRound = computed(() => {
  const roundParam = route.params.round
  if (roundParam) {
    return parseInt(roundParam as string, 10) || seasonStore.currentRound
  }
  return seasonStore.currentRound
})

const loading = ref(false)  // 本地loading状态
const batchEliminating = ref(false)
const showConfirmDialog = ref(false)
const selectedIds = ref<string[]>([])

// 获取队伍详情数据
// 优先以喜爱度排名为主要数据源，如果尚未生成则从 teamStore 直接构建
const teamsWithDetails = computed(() => {
  const audienceRankings = performanceStore.audienceRankings
  const candidates = store.candidates
  const storedTeams = teamStore.teams

  console.log('[AdminEliminationView] 计算 teamsWithDetails:', {
    audienceRankingsCount: audienceRankings.length,
    candidatesCount: candidates.length,
    storedTeamsCount: storedTeams.length
  })

  if (audienceRankings.length > 0) {
    // 方案A：以喜爱度排名为主数据源构建队伍详情
    const teamMap = new Map<string, {
      teamId: string
      teamName: string
      teamScore: any
      teamRank: any
      members: any[]
    }>()

    audienceRankings.forEach(ranking => {
      const tid = ranking.teamId || 'unknown'
      if (!teamMap.has(tid)) {
        const teamCandidates = candidates.filter(c => c.teamId === tid)
        teamMap.set(tid, {
          teamId: tid,
          teamName: ranking.teamName || `队伍 ${tid.slice(0, 4)}`,
          teamScore: teamCandidates[0]?.teamShowScore || '-',
          teamRank: teamCandidates[0]?.rank || '-',
          members: []
        })
      }

      const candidate = candidates.find(c => c.userId === ranking.playerId)

      teamMap.get(tid)!.members.push({
        playerId: ranking.playerId,
        teamId: tid,
        teamName: ranking.teamName || teamMap.get(tid)!.teamName,
        name: ranking.playerName || '未知',
        isCaptain: false,
        personalRating: candidate?.personalScore || '-',
        teamScore: candidate?.teamShowScore || '-',
        audienceVotes: ranking.votes || '-',
        audienceRank: ranking.rank || '-'
      })
    })

    const result = Array.from(teamMap.values())
    console.log('[AdminEliminationView] 从喜爱度排名构建:', result.length, '个队伍')
    return result
  }

  // 方案B：喜爱度排名不可用时，从 teamStore 直接构建
  const result = storedTeams.map(team => {
    const teamCandidates = candidates.filter(c => c.teamId === team.id)
    const teamName = team.name || `队伍 ${team.id.slice(0, 4)}`
    return {
      teamId: team.id,
      teamName,
      teamScore: teamCandidates[0]?.teamShowScore || '-',
      teamRank: teamCandidates[0]?.rank || '-',
      members: (team.members || []).map(member => {
        const candidate = candidates.find(c => c.userId === member.playerId)
        const player = member.player || member as any
        return {
          playerId: member.playerId,
          teamId: team.id,
          teamName,
          name: candidate?.userName || player?.name || member.playerId,
          isCaptain: team.captainId === member.playerId,
          personalRating: candidate?.personalScore || '-',
          teamScore: candidate?.teamShowScore || '-',
          audienceVotes: '-',
          audienceRank: '-'
        }
      })
    }
  })

  console.log('[AdminEliminationView] 从队伍存储构建:', result.length, '个队伍')
  return result
})

// 获取所有成员（用于统一表格），按个人喜爱度排名升序排列
const allMembers = computed(() => {
  const members: any[] = []
  teamsWithDetails.value.forEach(team => {
    team.members.forEach(member => {
      members.push({
        ...member,
        teamId: team.teamId,
        teamName: team.teamName
      })
    })
  })
  // 按喜爱度排名升序排序（排名在前面的排上面）
  return members.sort((a, b) => {
    const rankA = typeof a.audienceRank === 'number' ? a.audienceRank : 999
    const rankB = typeof b.audienceRank === 'number' ? b.audienceRank : 999
    return rankA - rankB
  })
})

// 检查是否全选
const isAllSelected = computed(() => {
  const selectableMembers = allMembers.value.filter(m => !isTeamSafe(m.teamId))
  return selectableMembers.length > 0 && selectableMembers.every(m => selectedIds.value.includes(m.playerId))
})

// 检查是否部分选中
const isIndeterminate = computed(() => {
  const selectableMembers = allMembers.value.filter(m => !isTeamSafe(m.teamId))
  const selectedCount = selectableMembers.filter(m => selectedIds.value.includes(m.playerId)).length
  return selectedCount > 0 && selectedCount < selectableMembers.length
})

function isTeamSafe(teamId: string): boolean {
  return performanceStore.isTeamSafe(teamId)
}

function toggleMember(playerId: string) {
  const idx = selectedIds.value.indexOf(playerId)
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1)
  } else {
    selectedIds.value.push(playerId)
  }
}

function toggleAllSelection(checked: boolean) {
  if (checked) {
    const selectableIds = allMembers.value
      .filter(m => !isTeamSafe(m.teamId))
      .map(m => m.playerId)
      .filter(id => !selectedIds.value.includes(id))
    selectedIds.value.push(...selectableIds)
  } else {
    const selectableIds = allMembers.value
      .filter(m => !isTeamSafe(m.teamId))
      .map(m => m.playerId)
    selectedIds.value = selectedIds.value.filter(id => !selectableIds.includes(id))
  }
}

function getPlayerName(playerId: string): string {
  // 优先从候选人中查找，然后从喜爱度排名中查找
  const candidate = store.candidates.find(c => c.userId === playerId)
  if (candidate?.userName) return candidate.userName
  const ranking = performanceStore.audienceRankings.find(r => r.playerId === playerId)
  return ranking?.playerName || playerId
}

function getRatingTheme(rating: string): string {
  const themeMap: Record<string, string> = {
    'S': 'danger',
    'A': 'warning',
    'B': 'primary',
    'C': 'default',
    'D': 'default'
  }
  return themeMap[rating] || 'default'
}

function getRankClass(rank: number): string {
  if (rank <= 3) return 'top-rank'
  if (rank <= 10) return 'good-rank'
  return ''
}

function formatTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function loadAll() {
  // 构造正确的 roundId 格式
  const roundId = `round-${currentRound.value}`
  
  try {
    loading.value = true
    
    // 逐个加载，确保数据正确获取
    console.log('[AdminEliminationView] 开始加载队伍数据...')
    await teamStore.fetchTeams(roundId)
    console.log('[AdminEliminationView] 队伍数据加载完成:', teamStore.teams.length, '个队伍')
    
    console.log('[AdminEliminationView] 开始加载候选人数据...')
    await store.fetchCandidates(currentRound.value)
    console.log('[AdminEliminationView] 候选人数据加载完成:', store.candidates.length, '个候选人')
    
    console.log('[AdminEliminationView] 开始加载淘汰记录...')
    await store.fetchRecords(currentRound.value)
    
    console.log('[AdminEliminationView] 开始加载喜爱度排名...')
    await performanceStore.fetchAudienceVoteRankings(roundId)
    console.log('[AdminEliminationView] 喜爱度排名加载完成:', performanceStore.audienceRankings.length, '条记录')
    
  } catch (error: any) {
    console.error('[AdminEliminationView] 加载数据失败:', error)
    MessagePlugin.error('加载数据失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

function confirmBatchEliminate() {
  if (selectedIds.value.length === 0) {
    MessagePlugin.warning('请至少选择一名选手')
    return
  }
  showConfirmDialog.value = true
}

async function doBatchEliminate() {
  try {
    batchEliminating.value = true
    await store.manualEliminate(currentRound.value, selectedIds.value, '管理员手动淘汰')
    MessagePlugin.success(`已淘汰${selectedIds.value.length}名选手`)
    selectedIds.value = []
    showConfirmDialog.value = false
    await loadAll()
  } catch (e: any) {
    MessagePlugin.error(e.message || '淘汰失败')
  } finally {
    batchEliminating.value = false
  }
}

async function handleEliminateMember(member: any) {
  try {
    await store.manualEliminate(currentRound.value, [member.playerId], '管理员手动淘汰')
    MessagePlugin.success(`已淘汰选手: ${member.name}`)
    await loadAll()
  } catch (e: any) {
    MessagePlugin.error(e.message || '淘汰失败')
  }
}

async function handleRestore(userId: string) {
  try {
    await store.restore(userId)
    MessagePlugin.success('已恢复选手')
    await loadAll()
  } catch (e: any) {
    MessagePlugin.error(e.message || '恢复失败')
  }
}

onMounted(async () => {
  await seasonStore.fetchSeason()
  await loadAll()
})
</script>

<style lang="scss" scoped>
.admin-elimination {
  min-height: 100%;
  padding: 20px;
  background: #f5f7fa;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;

  h1 {
    margin: 0 0 8px;
    color: #1a1a2e;
    font-size: 24px;
  }

  p {
    margin: 0;
    color: #6b7280;
    font-size: 14px;
  }
}

.section-title {
  margin: 0 0 16px;
  color: #1a1a2e;
  font-size: 18px;
  font-weight: 600;
}

// 第一部分：队伍详情
.teams-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 30px;
}

.team-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.team-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 2px solid #f0f0f0;

  .team-info {
    display: flex;
    align-items: center;
    gap: 12px;

    h3 {
      margin: 0;
      font-size: 18px;
      color: #1a1a2e;
    }
  }

  .team-scores {
    display: flex;
    gap: 24px;

    .score-item {
      display: flex;
      flex-direction: column;
      align-items: center;

      .score-label {
        font-size: 12px;
        color: #6b7280;
        margin-bottom: 4px;
      }

      .score-value {
        font-size: 20px;
        font-weight: 700;
        color: #0052d9;
      }
    }
  }
}

.members-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.member-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f9f9f9;
  border-radius: 8px;
  transition: background 0.2s;

  &:hover {
    background: #f0f0f0;
  }
}

.member-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 150px;
}

.member-name {
  font-weight: 500;
  font-size: 14px;
  color: #1a1a2e;
}

.member-details {
  display: flex;
  gap: 24px;
  align-items: center;
}

.detail-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;

  .detail-label {
    font-size: 11px;
    color: #6b7280;
  }

  .detail-value {
    font-size: 14px;
    font-weight: 500;
    color: #1a1a2e;
  }
}

// 第二部分：统一表格
.table-section {
  margin-bottom: 30px;
}

.table-wrap {
  overflow-x: auto;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.elimination-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;

  thead {
    background: #f8f9fa;
    
    th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #4a5568;
      border-bottom: 2px solid #e2e8f0;
    }
  }

  tbody tr {
    transition: background 0.2s;

    &:hover {
      background: #f7fafc;
    }

    &.row-selected {
      background: #ebf4ff;
    }

    &.row-captain {
      background: #fffbeb;
    }

    &.row-safe {
      opacity: 0.6;
    }

    td {
      padding: 12px;
      border-bottom: 1px solid #f0f0f0;
    }
  }
}

.rank-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 13px;

  &.top-rank {
    background: #fff3e0;
    color: #e65100;
  }

  &.good-rank {
    background: #e3f2fd;
    color: #1565c0;
  }
}

.records-card {
  border-radius: 12px;

  h3 {
    margin: 0;
    font-size: 16px;
  }
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.record-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;

  .record-info {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .record-name {
      font-weight: 600;
      font-size: 14px;
    }

    .record-detail {
      font-size: 12px;
      color: #6b7280;
    }

    .record-time {
      font-size: 11px;
      color: #9ca3af;
    }
  }
}

.eliminate-list {
  margin: 12px 0;
  padding-left: 20px;

  li {
    margin: 4px 0;
    color: #d54941;
  }
}
</style>
