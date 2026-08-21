<template>
  <div class="admin-elimination">
    <div class="page-header">
      <div>
        <h1>PK 淘汰管理</h1>
        <p>危险队列队首发起 PK，3 人角逐，1000 名评审按属性权重三选一投票</p>
      </div>
      <t-space>
        <t-button variant="outline" :loading="loading" @click="loadAll">刷新数据</t-button>
        <t-button theme="warning" variant="outline" :loading="stopping" @click="confirmStop">
          结束淘汰环节
        </t-button>
      </t-space>
    </div>

    <!-- ===== PK 淘汰控制中心 ===== -->
    <div class="pk-section">
      <h2 class="section-title">⚔️ PK 淘汰控制台</h2>

      <!-- 危险名单提示 -->
      <t-alert v-if="!dangerConfirmed" theme="warning" style="margin-bottom: 16px">
        <template #message>
          尚未确认危险名单，请前往
          <router-link :to="`/games/${authStore.currentGameId}/admin/round/${currentRound}/danger_confirm`">确认危险名单</router-link>
          后开始 PK 淘汰。
        </template>
      </t-alert>

      <div v-if="dangerConfirmed" class="pk-layout">
        <!-- 左：危险队列 -->
        <div class="pk-queue-card">
          <div class="card-title">
            <span>🔴 危险队列（按喜爱度从低到高）</span>
            <span class="queue-count">{{ pkQueue.length }}人</span>
          </div>
          <div class="pk-queue-list">
            <div
              v-for="(entry, idx) in pkQueue"
              :key="entry.playerId"
              class="pk-queue-item"
              :class="{ 'is-first': idx === 0 }"
            >
              <span class="queue-idx">{{ idx + 1 }}</span>
              <span class="queue-name">{{ entry.playerName }}</span>
              <span class="queue-team">{{ entry.teamName || '未组队' }}</span>
              <span class="queue-votes">{{ entry.popularityVotes }}票</span>
            </div>
            <t-empty v-if="pkQueue.length === 0" description="危险队列已清空" />
          </div>

          <!-- PK 历史记录 -->
          <div v-if="pkHistory.length > 0" class="pk-history">
            <div class="card-title" style="margin-top: 20px">
              <span>📋 PK 历史（{{ pkHistory.length }}场）</span>
            </div>
            <div class="pk-history-list">
              <div v-for="pk in pkHistory" :key="pk.id" class="pk-history-item">
                <div class="pk-history-head">
                  <span class="pk-index">第 {{ pk.pkIndex }} 场</span>
                  <span class="pk-attribute">{{ attributeName(pk.attribute) }}</span>
                  <span class="pk-status" :class="pk.status">{{ pk.status === 'resolved' ? '已裁定' : '进行中' }}</span>
                </div>
                <div class="pk-history-players">
                  <div v-for="p in pk.players" :key="p.playerId" class="pk-history-player">
                    <span class="pk-history-name">{{ p.playerName }}</span>
                    <span v-if="p.votes > 0" class="pk-history-votes">{{ p.votes }}票</span>
                    <span v-if="p.decision" class="pk-history-decision" :class="p.decision">{{ decisionText(p.decision) }}</span>
                  </div>
                </div>
                <div v-if="pk.voteDetails?.length" class="pk-check-votes">
                  <span class="check-title">评审查票（{{ pk.voteDetails.length }}人）</span>
                  <div class="check-seats">
                    <span
                      v-for="seat in pk.voteDetails"
                      :key="seat.seatNumber"
                      class="check-seat"
                      :style="{ background: pkPlayerColor(seat.playerId) }"
                      :title="`${seat.seatNumber}号评审 → ${pkPlayerNameById(seat.playerId)}`"
                    >
                      {{ seat.seatNumber }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右：PK 操作区 -->
        <div class="pk-operations-card">
          <div v-if="!currentPk" class="pk-start-panel">
            <div class="panel-title">发起一场 PK</div>

            <!-- 挑战者：队首 -->
            <div class="pk-field">
              <span class="field-label">挑战者（队首）</span>
              <div v-if="pkQueue[0]" class="challenger-box">
                <span class="challenger-name">{{ pkQueue[0].playerName }}</span>
                <span class="challenger-team">{{ pkQueue[0].teamName || '未组队' }}</span>
                <span class="challenger-votes">{{ pkQueue[0].popularityVotes }}票</span>
              </div>
              <t-empty v-else description="队列为空" :size="'small'" />
            </div>

            <!-- 选择对手 -->
            <div class="pk-field">
              <span class="field-label">选择 2 名对手（从危险队列中选择）</span>
              <div class="opponent-select">
                <t-select
                  v-model="opponentId1"
                  :options="opponentOptions"
                  placeholder="选择第一名对手"
                  clearable
                />
                <t-select
                  v-model="opponentId2"
                  :options="opponentOptions"
                  placeholder="选择第二名对手"
                  clearable
                />
              </div>
            </div>

            <!-- PK 属性 -->
            <div class="pk-field">
              <span class="field-label">PK 属性（作为投票权重）</span>
              <t-radio-group v-model="pkAttribute" variant="default-filled">
                <t-radio-button value="vocal">🎤 声乐</t-radio-button>
                <t-radio-button value="dance">💃 舞蹈</t-radio-button>
                <t-radio-button value="charm">✨ 魅力</t-radio-button>
              </t-radio-group>
            </div>

            <t-button
              theme="primary"
              block
              :disabled="!canStartPk"
              :loading="pkStarting"
              @click="handleStartPk"
            >
              发起 PK
            </t-button>
          </div>

          <!-- PK 进行中 -->
          <div v-else class="pk-active-panel">
            <div class="panel-title">
              第 {{ currentPk.pkIndex }} 场 PK · 属性：{{ attributeName(currentPk.attribute) }}
            </div>

            <!-- 3 名选手 -->
            <div class="pk-players">
              <div
                v-for="p in currentPk.players"
                :key="p.playerId"
                class="pk-player"
                :style="{ borderColor: pkPlayerColor(p.playerId) }"
              >
                <span class="pk-player-name">{{ p.playerName }}</span>
                <span class="pk-player-team">{{ p.teamName || '未组队' }}</span>
                <span class="pk-player-weight">
                  {{ currentPk.attribute === 'vocal' ? '🎤' : currentPk.attribute === 'dance' ? '💃' : '✨' }}
                  {{ p.weight }}
                </span>
                <span v-if="p.votes > 0" class="pk-player-votes">{{ p.votes }}票</span>
              </div>
            </div>

            <!-- 投票结果（已生成） -->
            <div v-if="hasPkVotes" class="pk-votes-result">
              <div class="votes-bar">
                <div
                  v-for="p in currentPk.players"
                  :key="p.playerId"
                  class="votes-bar-segment"
                  :style="{ width: votesPercent(p) + '%', background: segmentColor(p.playerId) }"
                >
                  {{ p.playerName }} {{ p.votes }}
                </div>
              </div>
            </div>

            <!-- 查票区（每位评审投给谁，危险区颜色） -->
            <div v-if="hasPkVotes && currentPk.voteDetails?.length" class="pk-vote-details">
              <div class="vote-details-title">
                🗳️ 评审查票（{{ currentPk.voteDetails.length }}人投票）
              </div>
              <div class="vote-details-seats">
                <span
                  v-for="seat in currentPk.voteDetails"
                  :key="seat.seatNumber"
                  class="vote-detail-seat"
                  :style="{ background: pkPlayerColor(seat.playerId) }"
                  :title="`${seat.seatNumber}号评审 → ${pkPlayerNameById(seat.playerId)}`"
                >
                  {{ seat.seatNumber }}
                </span>
              </div>
            </div>

            <!-- 裁定区 -->
            <div class="pk-decisions">
              <span class="field-label">裁定三名选手的状态</span>
              <div v-for="p in currentPk.players" :key="p.playerId" class="pk-decision-row">
                <span class="decision-name">{{ p.playerName }}</span>
                <t-radio-group
                  v-model="decisions[p.playerId]"
                  variant="default-filled"
                  size="small"
                >
                  <t-radio-button value="safe">🟢 安全</t-radio-button>
                  <t-radio-button value="pending">🟡 待定</t-radio-button>
                  <t-radio-button value="eliminated">🔴 淘汰</t-radio-button>
                </t-radio-group>
              </div>
            </div>

            <div class="pk-actions">
              <t-button
                v-if="!hasPkVotes"
                theme="warning"
                :loading="voting"
                @click="handleGenerateVotes"
              >
                🗳️ 生成大众评审投票 (1000人三选一)
              </t-button>
              <t-button
                v-else
                theme="danger"
                :loading="resolving"
                :disabled="!canResolve"
                @click="handleResolve"
              >
                确认裁定结果
              </t-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 第一部分：队伍详情展示 -->
    <div class="teams-section">
      <h2 class="section-title">队伍详情</h2>
      
      <!-- 如果队伍详情为空，显示提示 -->
      <t-alert v-if="teamsWithDetails.length === 0" theme="warning" style="margin-bottom: 16px">
        <template #message>
          暂无队伍数据，请先完成组队。您可以前往 <router-link :to="`/games/${authStore.currentGameId}/admin/team`">组队管理</router-link> 创建队伍。
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
      <div class="table-head">
        <h2 class="section-title">选手列表（手动批量淘汰）</h2>
        <t-button
          theme="danger"
          variant="outline"
          size="small"
          :disabled="selectedIds.length === 0"
          @click="confirmBatchEliminate"
        >
          批量淘汰 ({{ selectedIds.length }})
        </t-button>
      </div>
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
import { useAuthStore } from '../../stores/authStore'

const route = useRoute()
const authStore = useAuthStore()
const store = useEliminationStore()
const seasonStore = useSeasonStore()
const performanceStore = usePerformanceStore()
const teamStore = useTeamStore()

// 从路由参数获取轮次，如果没有则使用 seasonStore 的当前轮次
const currentRound = computed<number>(() => {
  const roundParam = route.params.round
  if (roundParam) {
    const n = parseInt(roundParam as string, 10)
    if (!isNaN(n)) return n
  }
  return Number(seasonStore.currentRound) || 1
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

    // 加载危险名单与 PK 状态
    await store.fetchDangerStatus(currentRound.value)
    await store.fetchPkQueue(currentRound.value)
    await store.fetchPkHistory(currentRound.value)
    currentPk.value = store.currentPk
    // 初始化裁定选择
    if (currentPk.value) {
      currentPk.value.players.forEach(p => {
        if (!decisions.value[p.playerId]) decisions.value[p.playerId] = 'safe'
      })
    }
    
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

// ================== PK 淘汰逻辑 ==================

const dangerConfirmed = computed(() => !!store.dangerStatus?.confirmed)
const pkQueue = computed(() => store.pkQueue)
const pkHistory = computed(() => store.pkHistory)
const currentPk = ref(store.currentPk)
const opponentId1 = ref<string>('')
const opponentId2 = ref<string>('')
const pkAttribute = ref<'vocal' | 'dance' | 'charm'>('vocal')
const decisions = ref<Record<string, 'safe' | 'pending' | 'eliminated'>>({})
const pkStarting = ref(false)
const voting = ref(false)
const resolving = ref(false)
const stopping = ref(false)

const opponentOptions = computed(() => {
  const ids = new Set([opponentId2.value])
  return pkQueue.value
    .filter(e => e.playerId !== pkQueue.value[0]?.playerId)
    .filter(e => !ids.has(e.playerId))
    .map(e => ({ label: `${e.playerName}（${e.popularityVotes}票）`, value: e.playerId }))
})

const canStartPk = computed(() => {
  return pkQueue.value.length >= 3 && !!opponentId1.value && !!opponentId2.value && opponentId1.value !== opponentId2.value
})

const hasPkVotes = computed(() => {
  return !!currentPk.value && currentPk.value.players.some(p => p.votes > 0)
})

const canResolve = computed(() => {
  if (!currentPk.value) return false
  return currentPk.value.players.every(p => !!decisions.value[p.playerId])
})

function attributeName(attr: string): string {
  const map: Record<string, string> = { vocal: '🎤 声乐', dance: '💃 舞蹈', charm: '✨ 魅力' }
  return map[attr] || attr
}

function decisionText(d: string): string {
  const map: Record<string, string> = { safe: '🟢 安全', pending: '🟡 待定', eliminated: '🔴 淘汰' }
  return map[d] || d
}

function segmentColor(playerId: string): string {
  const colors = ['#e74c3c', '#f39c12', '#27ae60']
  const idx = currentPk.value?.players.findIndex(p => p.playerId === playerId) ?? 0
  return colors[Math.max(idx, 0) % colors.length]
}

// 危险区选手颜色（按队列顺序固定色板，三选一投票/查票区用）
const PK_COLOR_PALETTE = ['#e74c3c', '#f39c12', '#27ae60', '#2980b9', '#8e44ad', '#16a085', '#c0392b', '#d35400', '#2c3e50', '#7f8c8d']
const pkColorMap = new Map<string, string>()

function pkPlayerColor(playerId: string): string {
  if (!pkColorMap.has(playerId)) {
    const idx = pkQueue.value.findIndex(e => e.playerId === playerId)
    pkColorMap.set(playerId, PK_COLOR_PALETTE[(idx >= 0 ? idx : pkColorMap.size) % PK_COLOR_PALETTE.length])
  }
  return pkColorMap.get(playerId) || '#95a5a6'
}

function pkPlayerNameById(playerId: string): string {
  const entry = pkQueue.value.find(e => e.playerId === playerId)
  if (entry) return entry.playerName
  const pk = currentPk.value
  if (pk) {
    const p = pk.players.find(x => x.playerId === playerId)
    if (p) return p.playerName
  }
  return playerId
}

function votesPercent(p: { playerId: string; votes: number }): number {
  const total = currentPk.value?.players.reduce((s, x) => s + x.votes, 0) || 1
  return Math.round((p.votes / total) * 100)
}

async function handleStartPk() {
  if (!canStartPk.value) {
    MessagePlugin.warning('请选择 2 名不同的对手')
    return
  }
  pkStarting.value = true
  try {
    await store.doStartPk({
      round: currentRound.value,
      challengerId: pkQueue.value[0].playerId,
      opponentIds: [opponentId1.value, opponentId2.value],
      attribute: pkAttribute.value
    })
    currentPk.value = store.currentPk
    // 初始化裁定选择
    decisions.value = {}
    if (currentPk.value) {
      currentPk.value.players.forEach(p => { decisions.value[p.playerId] = 'safe' })
    }
    opponentId1.value = ''
    opponentId2.value = ''
    MessagePlugin.success('PK 已发起')
    await store.fetchPkHistory(currentRound.value)
  } catch (e: any) {
    MessagePlugin.error(e.message || '发起 PK 失败')
  } finally {
    pkStarting.value = false
  }
}

async function handleGenerateVotes() {
  if (!currentPk.value) return
  voting.value = true
  try {
    await store.doGeneratePkVotes(currentPk.value.id)
    currentPk.value = store.currentPk
    MessagePlugin.success('大众评审投票已生成')
  } catch (e: any) {
    MessagePlugin.error(e.message || '生成投票失败')
  } finally {
    voting.value = false
  }
}

async function handleResolve() {
  if (!currentPk.value || !canResolve.value) return
  resolving.value = true
  try {
    await store.doResolvePk(currentPk.value.id, decisions.value)
    currentPk.value = null
    decisions.value = {}
    await store.fetchDangerStatus(currentRound.value)
    await store.fetchPkQueue(currentRound.value)
    await store.fetchPkHistory(currentRound.value)
    MessagePlugin.success('PK 裁定完成')
  } catch (e: any) {
    MessagePlugin.error(e.message || '裁定失败')
  } finally {
    resolving.value = false
  }
}

function confirmStop() {
  if (window.confirm('确定结束本轮淘汰环节并进入下一轮公演流程吗？')) {
    handleStop()
  }
}

async function handleStop() {
  stopping.value = true
  try {
    await store.doStopElimination(currentRound.value)
    await seasonStore.nextStage()
    MessagePlugin.success('淘汰环节已结束，进入下一阶段')
  } catch (e: any) {
    MessagePlugin.error(e.message || '结束失败')
  } finally {
    stopping.value = false
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
  background: var(--bg-primary);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;

  h1 {
    margin: 0 0 8px;
    color: var(--text-primary);
    font-size: 24px;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 14px;
  }
}

.section-title {
  margin: 0 0 16px;
  color: var(--text-primary);
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
  background: var(--card-bg);
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
  border-bottom: 2px solid var(--border-color);

  .team-info {
    display: flex;
    align-items: center;
    gap: 12px;

    h3 {
      margin: 0;
      font-size: 18px;
      color: var(--text-primary);
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
        color: var(--text-secondary);
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
  background: var(--table-hover-bg);
  border-radius: 8px;
  transition: background 0.2s;

  &:hover {
    background: var(--progress-bg);
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
  color: var(--text-primary);
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
    color: var(--text-secondary);
  }

  .detail-value {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }
}

// 第二部分：统一表格
.table-section {
  margin-bottom: 30px;
}

.table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  .section-title {
    margin: 0;
  }
}

.table-wrap {
  overflow-x: auto;
  background: var(--card-bg);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.elimination-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;

  thead {
    background: var(--hover-bg);
    
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
      border-bottom: 1px solid var(--border-color);
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
  background: var(--table-hover-bg);
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
      color: var(--text-secondary);
    }

    .record-time {
      font-size: 11px;
      color: var(--text-tertiary);
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

// ===== PK 淘汰控制台 =====

.pk-section {
  margin-bottom: 30px;
}

.pk-layout {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 16px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

.pk-queue-card,
.pk-operations-card {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 14px;

  .queue-count {
    font-size: 12px;
    color: #e74c3c;
    background: rgba(231, 76, 60, 0.1);
    padding: 2px 8px;
    border-radius: 10px;
  }
}

.pk-queue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
}

.pk-queue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--table-hover-bg);
  border-radius: 8px;

  &.is-first {
    background: rgba(231, 76, 60, 0.12);
    border: 1px solid rgba(231, 76, 60, 0.3);
  }

  .queue-idx {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #e74c3c;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .queue-name {
    flex: 1;
    font-weight: 600;
    font-size: 14px;
  }

  .queue-team {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .queue-votes {
    font-size: 12px;
    font-weight: 600;
    color: #e74c3c;
  }
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 16px;
}

.pk-field {
  margin-bottom: 16px;

  .field-label {
    display: block;
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 8px;
    font-weight: 600;
  }
}

.challenger-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(231, 76, 60, 0.1);
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 8px;

  .challenger-name {
    font-size: 16px;
    font-weight: 700;
    flex: 1;
  }

  .challenger-team {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .challenger-votes {
    font-size: 13px;
    font-weight: 700;
    color: #e74c3c;
  }
}

.opponent-select {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pk-players {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;

  .pk-player {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 14px 8px;
    background: var(--table-hover-bg);
    border-radius: 10px;
    border: 2px solid transparent;
    text-align: center;

    .pk-player-name {
      font-size: 15px;
      font-weight: 700;
    }

    .pk-player-team {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .pk-player-weight {
      font-size: 16px;
      font-weight: 800;
      color: #0052d9;
    }

    .pk-player-votes {
      font-size: 14px;
      font-weight: 700;
      color: #e74c3c;
    }
  }
}

.pk-votes-result {
  margin-bottom: 16px;

  .votes-bar {
    display: flex;
    height: 36px;
    border-radius: 8px;
    overflow: hidden;

    .votes-bar-segment {
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
    }
  }
}

// PK 查票区
.pk-vote-details {
  margin-bottom: 16px;

  .vote-details-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .vote-details-seats {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    max-height: 140px;
    overflow-y: auto;
  }

  .vote-detail-seat {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    color: #fff;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
}

// PK 历史记录
.pk-history {
  margin-top: 8px;

  .pk-history-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 420px;
    overflow-y: auto;
  }

  .pk-history-item {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 12px;

    .pk-history-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;

      .pk-index {
        font-size: 13px;
        font-weight: 700;
      }

      .pk-attribute {
        font-size: 11px;
        color: var(--text-secondary);
      }

      .pk-status {
        font-size: 10px;
        padding: 1px 8px;
        border-radius: 8px;
        margin-left: auto;

        &.resolved { background: rgba(39, 174, 96, 0.15); color: #27ae60; }
        &.voting { background: rgba(243, 156, 18, 0.15); color: #f39c12; }
      }
    }

    .pk-history-players {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin-bottom: 8px;
    }

    .pk-history-player {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 8px;
      background: var(--table-hover-bg);
      border-radius: 8px;

      .pk-history-name {
        font-size: 12px;
        font-weight: 600;
      }

      .pk-history-votes {
        font-size: 14px;
        font-weight: 800;
        color: #0052d9;
      }

      .pk-history-decision {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 8px;

        &.safe { background: rgba(39, 174, 96, 0.15); color: #27ae60; }
        &.pending { background: rgba(243, 156, 18, 0.15); color: #f39c12; }
        &.eliminated { background: rgba(231, 76, 60, 0.15); color: #e74c3c; }
      }
    }

    .pk-check-votes {
      .check-title {
        display: block;
        font-size: 11px;
        color: var(--text-muted);
        margin-bottom: 6px;
      }

      .check-seats {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
        max-height: 90px;
        overflow-y: auto;
      }

      .check-seat {
        width: 22px;
        height: 22px;
        border-radius: 4px;
        color: #fff;
        font-size: 9px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
    }
  }
}

.pk-decisions {
  margin-bottom: 16px;

  .field-label {
    display: block;
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 10px;
    font-weight: 600;
  }
}

.pk-decision-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-color);

  .decision-name {
    font-weight: 600;
    font-size: 14px;
    flex-shrink: 0;
  }
}

.pk-actions {
  display: flex;
  gap: 8px;
}
</style>
