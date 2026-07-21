<template>
  <div class="admin-teams">
    <!-- 顶部统计卡片 -->
    <div class="stats-section">
      <div class="stat-card">
        <span class="stat-value">{{ teamStore.teams.length }}</span>
        <span class="stat-label">队伍数</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ assignedCount }}</span>
        <span class="stat-label">已分配</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ unassignedCount }}</span>
        <span class="stat-label">未分配</span>
      </div>
    </div>

    <!-- 操作按钮区 -->
    <div class="action-section">
      <t-button theme="warning" block @click="handleAutoDistribute">
        <template #icon><RefreshIcon /></template>
        自动分配
      </t-button>
    </div>

    <!-- 未分配选手区 -->
    <div class="unassigned-section" v-if="unassignedPlayers.length > 0">
      <div class="section-header">
        <span class="section-title">未分配选手</span>
        <span class="section-count">{{ unassignedPlayers.length }} 人</span>
      </div>
      <div class="player-chips">
        <div
          v-for="player in unassignedPlayers"
          :key="player.id"
          class="player-chip"
          @click="handleViewPlayer(player)"
        >
          <span class="chip-avatar">
            <img v-if="player.avatar" :src="getAvatarUrl(player.avatar)" :alt="player.name" />
            <span v-else>{{ getAvatar(player.name) }}</span>
          </span>
          <span class="chip-name">{{ player.name }}</span>
        </div>
      </div>
    </div>

    <!-- 队伍列表 -->
    <div class="teams-section">
      <div class="section-header">
        <span class="section-title">队伍列表</span>
        <span class="section-count">{{ teamStore.teams.length }} 队</span>
      </div>

      <div v-if="teamStore.loading" class="loading-state">
        <t-loading text="加载中..." />
      </div>

      <div v-else-if="teamStore.teams.length === 0" class="empty-state">
        <span class="empty-icon">🏝️</span>
        <span class="empty-text">暂无队伍，请先设置队伍</span>
      </div>

      <div v-else class="team-list">
        <div
          v-for="team in teamStore.teams"
          :key="team.id"
          class="team-card"
          :class="{ locked: team.locked }"
        >
          <!-- 队伍头部 -->
          <div class="team-header">
            <div class="team-info">
              <span class="team-name">{{ team.name }}</span>
              <span class="team-meta">
                {{ team.members?.length || 0 }}/{{ team.maxMembers }} 人
              </span>
            </div>
            <t-tag :theme="team.locked ? 'danger' : 'success'" variant="light" size="small">
              {{ team.locked ? '已锁定' : '招募中' }}
            </t-tag>
          </div>

          <!-- 队长信息（简洁显示，队员卡片中已有队长标签） -->
          <div class="captain-info" v-if="getTeamCaptain(team)">
            <span class="captain-label">队长</span>
            <span class="captain-value">{{ getTeamCaptain(team)!.name }}</span>
          </div>
          <div class="captain-info no-captain" v-else>
            <span class="captain-label">队长</span>
            <span class="captain-value">未指定</span>
          </div>

          <!-- 成员列表 -->
          <div class="members-section">
            <div class="members-grid">
              <div
                v-for="member in team.members"
                :key="member.id"
                class="member-item"
                :class="{ captain: member.playerId === team.captainId }"
                @click="handleMemberClick(team, member)"
              >
                <span class="member-avatar">
                  <img v-if="member.player?.avatar" :src="getAvatarUrl(member.player.avatar)" :alt="member.player?.name" />
                  <span v-else>{{ getAvatar(member.player?.name) }}</span>
                </span>
                <span class="member-name">{{ member.player?.name }}</span>
                <span v-if="member.playerId === team.captainId" class="captain-badge">队长</span>
              </div>
              <div
                v-if="!team.locked && (team.members?.length || 0) < team.maxMembers"
                class="member-item add-member"
                @click="openAddMemberDialog(team)"
              >
                <span class="add-icon">+</span>
                <span class="add-text">添加</span>
              </div>
            </div>
          </div>

          <!-- 属性平均 -->
          <div class="attr-section">
            <div class="attr-item">
              <span class="attr-label">Vocal</span>
              <span class="attr-value vocal">{{ getTeamAttrAverage(team, 'vocal') }}</span>
            </div>
            <div class="attr-item">
              <span class="attr-label">Dance</span>
              <span class="attr-value dance">{{ getTeamAttrAverage(team, 'dance') }}</span>
            </div>
            <div class="attr-item">
              <span class="attr-label">Charm</span>
              <span class="attr-value charm">{{ getTeamAttrAverage(team, 'charm') }}</span>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="team-actions">
            <t-button
              v-if="!team.locked"
              theme="danger"
              variant="text"
              size="small"
              :disabled="!team.captainId"
              @click="handleLockTeam(team)"
            >
              锁定
            </t-button>
            <t-button
              v-else
              theme="success"
              variant="text"
              size="small"
              @click="handleUnlockTeam(team)"
            >
              解锁
            </t-button>
            <t-popconfirm content="确认删除此队伍?" @confirm="handleDeleteTeam(team)">
              <t-button theme="danger" variant="text" size="small">
                删除
              </t-button>
            </t-popconfirm>
          </div>
        </div>
      </div>
    </div>

    <!-- 设置队伍弹窗 -->
    <t-dialog
      v-model:visible="showSetupDialog"
      header="设置队伍"
      width="90%"
      :close-on-overlay-click="false"
      :destroy-on-close="true"
    >
      <div class="setup-form">
        <div class="form-item">
          <label>队伍数量</label>
          <t-input-number
            v-model="setupForm.teamCount"
            :min="1"
            :max="10"
            @change="handleTeamCountChange"
          />
        </div>
        <div class="team-config-list">
          <div
            v-for="i in setupForm.teamCount"
            :key="i"
            class="team-config-item"
          >
            <t-input
              v-model="setupForm.teamNames[i - 1]"
              placeholder="队伍名称"
              class="team-name-input"
            />
            <t-input-number
              v-model="setupForm.teamSizes[i - 1]"
              :min="2"
              :max="20"
              placeholder="人数"
              class="team-size-input"
            />
          </div>
        </div>
        <div class="form-tip" :class="capacityMatches ? 'ok' : 'warn'">
          <div class="capacity-info">
            <div class="capacity-row">
              <span>总容量</span>
              <span>{{ totalCapacity }} 人</span>
            </div>
            <div class="capacity-row">
              <span>参赛选手</span>
              <span>{{ totalPlayers }} 人</span>
            </div>
            <div class="capacity-row highlight">
              <span>{{ capacityMatches ? '✅ 匹配' : diff > 0 ? `⚠️ 空出 ${diff} 个名额` : `⚠️ 超出 ${-diff} 人` }}</span>
            </div>
          </div>
          <div class="capacity-warning">
            设置后现有队伍和分配将被清空
          </div>
        </div>
      </div>
      <template #footer>
        <t-space>
          <t-button @click="showSetupDialog = false">取消</t-button>
          <t-button theme="primary" :loading="setupLoading" @click="handleSetupTeams">
            确认设置
          </t-button>
        </t-space>
      </template>
    </t-dialog>

    <!-- 添加成员弹窗 -->
    <t-dialog
      v-model:visible="showAddMemberDialog"
      header="添加成员"
      width="90%"
      :destroy-on-close="true"
    >
      <div class="add-member-form">
        <t-input
          v-model="memberSearchKeyword"
          placeholder="搜索选手姓名"
          clearable
          @change="filterUnassignedPlayers"
        />
        <div class="member-select-list">
          <div
            v-for="player in filteredUnassignedPlayers"
            :key="player.id"
            class="member-select-item"
            @click="handleAddMember(player)"
          >
            <span class="member-avatar">
              <img v-if="player.avatar" :src="getAvatarUrl(player.avatar)" :alt="player.name" />
              <span v-else>{{ getAvatar(player.name) }}</span>
            </span>
            <span class="member-name">{{ player.name }}</span>
            <t-tag size="small" variant="outline">{{ player.loginCode }}</t-tag>
          </div>
          <div v-if="filteredUnassignedPlayers.length === 0" class="no-data">
            暂无可添加的选手
          </div>
        </div>
      </div>
    </t-dialog>

    <!-- 选择队长弹窗 -->
    <t-dialog
      v-model:visible="showSelectCaptainDialog"
      header="指定队长"
      width="90%"
      :destroy-on-close="true"
    >
      <div class="captain-select-list">
        <div
          v-for="member in selectedTeam?.members || []"
          :key="member.id"
          class="captain-select-item"
          @click="handleSetCaptain(member)"
        >
          <span class="member-avatar">
            <img v-if="member.player?.avatar" :src="getAvatarUrl(member.player.avatar)" :alt="member.player?.name" />
            <span v-else>{{ getAvatar(member.player?.name) }}</span>
          </span>
          <span class="member-name">{{ member.player?.name }}</span>
        </div>
        <div v-if="!selectedTeam?.members?.length" class="no-data">
          暂无成员可指定为队长
        </div>
      </div>
    </t-dialog>

    <!-- 选手详情弹窗 -->
    <t-dialog
      v-model:visible="showPlayerDetail"
      header="选手详情"
      width="90%"
      :destroy-on-close="true"
    >
      <div class="player-detail" v-if="selectedPlayer">
        <div class="detail-header">
          <span class="detail-avatar">{{ getAvatar(selectedPlayer.name) }}</span>
          <span class="detail-name">{{ selectedPlayer.name }}</span>
        </div>
        <div class="detail-info">
          <div class="info-item">
            <span class="info-label">登录码</span>
            <span class="info-value">{{ selectedPlayer.loginCode }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">身份</span>
            <span class="info-value">{{ getRoleText(selectedPlayer.role) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">状态</span>
            <span class="info-value">{{ getStatusText(selectedPlayer.status) }}</span>
          </div>
        </div>
        <div class="detail-attrs">
          <div class="attr-bar-item">
            <span>Vocal</span>
            <div class="attr-bar">
              <div class="attr-bar-fill vocal" :style="{ width: (selectedPlayer.attributes?.vocal || 0) + '%' }"></div>
            </div>
            <span>{{ selectedPlayer.attributes?.vocal || 0 }}</span>
          </div>
          <div class="attr-bar-item">
            <span>Dance</span>
            <div class="attr-bar">
              <div class="attr-bar-fill dance" :style="{ width: (selectedPlayer.attributes?.dance || 0) + '%' }"></div>
            </div>
            <span>{{ selectedPlayer.attributes?.dance || 0 }}</span>
          </div>
          <div class="attr-bar-item">
            <span>Charm</span>
            <div class="attr-bar">
              <div class="attr-bar-fill charm" :style="{ width: (selectedPlayer.attributes?.charm || 0) + '%' }"></div>
            </div>
            <span>{{ selectedPlayer.attributes?.charm || 0 }}</span>
          </div>
        </div>
        <div class="detail-actions" v-if="!selectedPlayer.teamId">
          <t-button theme="primary" block @click="openAddMemberDialogForPlayer(selectedPlayer)">
            添加到队伍
          </t-button>
        </div>
        <div class="detail-actions" v-else-if="selectedTeamForPlayer && !selectedTeamForPlayer.locked && selectedPlayer.role !== 'captain'">
          <t-popconfirm content="确认将此选手移出队伍?" @confirm="handleRemoveMemberFromDetail">
            <t-button theme="danger" block>
              移出队伍
            </t-button>
          </t-popconfirm>
        </div>
      </div>
    </t-dialog>

    <!-- 成员操作弹窗 -->
    <t-dialog
      v-model:visible="showMemberAction"
      header="成员操作"
      width="80%"
      :destroy-on-close="true"
    >
      <t-space direction="vertical" style="width: 100%">
        <t-button
          theme="warning"
          block
          :disabled="selectedMember?.id === selectedTeam?.captainId"
          @click="handleSetCaptainFromAction"
        >
          {{ selectedMember?.id === selectedTeam?.captainId ? '已是队长' : '设为队长' }}
        </t-button>
        <t-button
          v-if="selectedTeam && !selectedTeam.locked"
          theme="danger"
          block
          :disabled="selectedMember?.id === selectedTeam?.captainId"
          @click="handleRemoveMember"
        >
          {{ selectedMember?.id === selectedTeam?.captainId ? '请先更换队长' : '移出队伍' }}
        </t-button>
        <div class="move-section" v-if="selectedTeam && !selectedTeam.locked">
          <t-divider>或移动到其他队伍</t-divider>
          <t-select
            v-model="targetTeamId"
            placeholder="选择目标队伍"
            style="width: 100%"
          >
            <t-option
              v-for="team in otherTeams"
              :key="team.id"
              :value="team.id"
              :label="team.name"
              :disabled="(team.members?.length || 0) >= team.maxMembers"
            />
          </t-select>
          <t-button
            theme="primary"
            block
            :disabled="!targetTeamId"
            @click="handleMoveMember"
          >
            确认移动
          </t-button>
        </div>
      </t-space>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { SettingIcon, RefreshIcon } from 'tdesign-icons-vue-next'
import { useTeamStore } from '../../stores/teamStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useSeasonStore } from '../../stores/seasonStore'
import { getAvatarUrl, getCurrentCaptains } from '../../services/api'
import { getTeams as dsGetTeams } from '../../services/dataService'
import type { RoundTeam, RoundTeamMember } from '../../types/round'
import type { User } from '../../types/user'

const route = useRoute()
const teamStore = useTeamStore()
const playerStore = usePlayerStore()
const seasonStore = useSeasonStore()

// 弹窗状态
const showSetupDialog = ref(false)
const showAddMemberDialog = ref(false)
const showSelectCaptainDialog = ref(false)
const showPlayerDetail = ref(false)
const showMemberAction = ref(false)

// 选中的对象
const selectedTeam = ref<RoundTeam | null>(null)
const selectedPlayer = ref<User | null>(null)
const selectedMember = ref<RoundTeamMember | null>(null)
const selectedTeamForPlayer = ref<RoundTeam | null>(null)
const targetTeamId = ref('')

// 搜索和筛选
const memberSearchKeyword = ref('')
const filteredUnassignedPlayers = ref<User[]>([])

// 加载状态
const setupLoading = ref(false)
// 从路由参数获取轮次号，确保不同轮次加载各自的组队数据
const roundFromRoute = computed(() => parseInt(route.params.round as string) || 0)
const currentRoundId = computed(() => {
  const r = roundFromRoute.value
  return r > 0 ? `round-${r}` : seasonStore.currentRoundId
})
const loading = computed(() => teamStore.loading)

const TEAM_MANAGEMENT_USER_PAGE_SIZE = 1000

function fetchTeamManagementUsers() {
  return playerStore.fetchUsers({ status: 'active', pageSize: TEAM_MANAGEMENT_USER_PAGE_SIZE })
}

// 设置表单
const setupForm = reactive({
  teamCount: 4,
  teamNames: ['', '', '', ''],
  teamSizes: [4, 4, 4, 4]
})

// 计算属性
const assignedCount = computed(() => {
  const assignedIds = new Set<string>()
  teamStore.teams.forEach(team => {
    team.members?.forEach(member => {
      assignedIds.add(member.playerId)
    })
  })
  return assignedIds.size
})

const unassignedCount = computed(() => {
  const assignedIds = new Set<string>()
  teamStore.teams.forEach(team => {
    team.members?.forEach(member => {
      assignedIds.add(member.playerId)
    })
    // 也要排除队长
    if (team.captainId) {
      assignedIds.add(team.captainId)
    }
  })
  return playerStore.users.filter(u =>
    !assignedIds.has(u.id) &&
    u.role !== 'admin' &&
    u.status !== 'eliminated'
  ).length
})

const unassignedPlayers = computed(() => {
  const assignedIds = new Set<string>()
  teamStore.teams.forEach(team => {
    team.members?.forEach(member => {
      assignedIds.add(member.playerId)
    })
    // 也要排除队长
    if (team.captainId) {
      assignedIds.add(team.captainId)
    }
  })
  return playerStore.users.filter(u =>
    !assignedIds.has(u.id) &&
    u.role !== 'admin' &&
    u.status !== 'eliminated'
  )
})

const otherTeams = computed(() => {
  if (!selectedTeam.value) return []
  return teamStore.teams.filter(t => t.id !== selectedTeam.value?.id)
})

// 参赛选手总数（排除管理员）
const totalPlayers = computed(() => {
  return playerStore.users.filter(u => u.role !== 'admin' && u.status !== 'eliminated').length
})

// 队伍总容量
const totalCapacity = computed(() => {
  return setupForm.teamSizes
    .slice(0, setupForm.teamCount)
    .reduce((sum, size) => sum + (Number(size) || 0), 0)
})

// 容量与人数差值
const diff = computed(() => totalCapacity.value - totalPlayers.value)

// 是否匹配
const capacityMatches = computed(() => diff.value === 0)

// 头像获取
function getAvatar(name?: string): string {
  const icons = ['🌟', '🎤', '💃', '✨', '🎵', '🎭', '🎨', '🎪']
  if (!name) return '🎤'
  return icons[name.charCodeAt(0) % icons.length]
}

function getRoleText(role?: string): string {
  const texts: Record<string, string> = { captain: '队长', player: '队员', admin: '管理员' }
  return texts[role || ''] || '未知'
}

function getStatusText(status?: string): string {
  const texts: Record<string, string> = { active: '安全', danger: '危险', eliminated: '已淘汰' }
  return texts[status || ''] || '未知'
}

// 获取队伍属性平均
function getTeamAttrAverage(team: RoundTeam, attr: 'vocal' | 'dance' | 'charm'): number {
  return teamStore.getTeamAttrAverage(team, attr)
}

// 获取队长
function getTeamCaptain(team: RoundTeam): User | undefined {
  if (!team.captainId) return undefined
  // 先从成员列表中查找
  const captain = teamStore.getTeamCaptain(team)
  if (captain?.player) return captain.player as User
  // 如果成员列表中没有，从 playerStore 中查找
  return playerStore.users.find(u => u.id === team.captainId)
}

// 处理队伍数量变化
function handleTeamCountChange() {
  while (setupForm.teamNames.length < setupForm.teamCount) {
    setupForm.teamNames.push('')
    setupForm.teamSizes.push(4)
  }
  while (setupForm.teamNames.length > setupForm.teamCount) {
    setupForm.teamNames.pop()
    setupForm.teamSizes.pop()
  }
}

// 设置队伍
async function handleSetupTeams() {
  // 校验：容量与人数必须匹配
  if (!capacityMatches.value) {
    const diffText = diff.value > 0
      ? `将有 ${diff.value} 个名额空余`
      : `有 ${-diff.value} 人无法进入队伍`
    const confirmDialog = DialogPlugin.confirm({
      header: '⚠️ 人数不匹配',
      body: `队伍总容量为 ${totalCapacity.value} 人，参赛选手共 ${totalPlayers.value} 人，${diffText}。\n建议调整各队伍人数后再设置。\n\n是否仍然继续？`,
      theme: 'warning',
      onConfirm: () => {
        confirmDialog.destroy()
        doSetupTeams()
      },
      onCancel: () => {
        confirmDialog.destroy()
      }
    })
    return
  }
  doSetupTeams()
}

function doSetupTeams() {
  const confirmDialog = DialogPlugin.confirm({
    header: '确认设置',
    body: `队伍总容量 ${totalCapacity.value} 人，参赛选手 ${totalPlayers.value} 人，设置后现有队伍和分配将被清空，确定继续？`,
    theme: 'warning',
    onConfirm: async () => {
      confirmDialog.destroy()
      setupLoading.value = true
      try {
        const teamSizes = setupForm.teamSizes.slice(0, setupForm.teamCount)
        const teamNames = setupForm.teamNames.slice(0, setupForm.teamCount).map((name, i) =>
          name || `第${i + 1}团`
        )
        await teamStore.setupTeamConfig({
          teamCount: setupForm.teamCount,
          teamSizes,
          teamNames
        }, currentRoundId.value)
        MessagePlugin.success('队伍设置成功')
        showSetupDialog.value = false
        await fetchTeamManagementUsers()
      } catch (e: any) {
        MessagePlugin.error(e.message || '设置失败')
      } finally {
        setupLoading.value = false
      }
    }
  })
}

// 自动分配
async function handleAutoDistribute() {
  try {
    // 优先使用队伍数据中已有的 roundId（与 setupTeams 创建时一致），
    // 确保后端能正确匹配到队伍
    const actualRoundId = teamStore.teams.length > 0 && teamStore.teams[0].roundId
      ? teamStore.teams[0].roundId
      : currentRoundId.value
    await teamStore.randomAssign(actualRoundId)
    // 自动将队长角色选手设置为各自队伍的队长
    await autoSetCaptains()
    MessagePlugin.success('自动分配完成')
    await fetchTeamManagementUsers()
  } catch (e: any) {
    MessagePlugin.error(e.message || '分配失败')
  }
}

// 自动将队长选手设置为各自队伍的队长
async function autoSetCaptains() {
  try {
    // 优先从按轮次API获取当前轮队长，降级使用 User.role
    let allCaptains: any[] = []
    try {
      // 使用队伍数据中的实际 roundId
      const roundId = teamStore.teams.length > 0 && teamStore.teams[0].roundId
        ? teamStore.teams[0].roundId
        : `round-${seasonStore.currentRoundNumber || 1}`
      const captainsRes = await getCurrentCaptains(roundId)
      if (captainsRes.success && captainsRes.data.length > 0) {
        allCaptains = captainsRes.data.map(c => {
          const user = playerStore.users.find(u => u.id === c.playerId)
          return user || { id: c.playerId, name: c.playerName, status: 'active' }
        })
      }
    } catch (e) {
      console.warn('[autoSetCaptains] 按轮次获取队长失败，降级使用User.role:', e)
    }

    // 降级：使用 User.role 判断
    if (allCaptains.length === 0) {
      allCaptains = playerStore.users.filter(u => u.role === 'captain' && u.status !== 'eliminated')
    }

    let unassignedCaptains = allCaptains.filter(c => {
      // 排除已经是指定队长的
      return !teamStore.teams.some(t => t.captainId === c.id)
    })

    console.log(`[autoSetCaptains] 找到 ${allCaptains.length} 个队长角色选手，${unassignedCaptains.length} 个未分配`)
    console.log('[autoSetCaptains] 未分配的队长:', unassignedCaptains.map(c => c.name))

    for (const team of teamStore.teams) {
      try {
        console.log(`[autoSetCaptains] 处理队伍: ${team.name}, 当前队长ID: ${team.captainId}`)
        
        // 如果队伍已有队长
        if (team.captainId) {
          // 确保队长在成员列表中
          const isCaptainInMembers = team.members?.some(m => m.playerId === team.captainId)
          if (!isCaptainInMembers) {
            await teamStore.addMember(team.id, team.captainId, currentRoundId.value)
          }
          // 更新队名为"队长名团"格式
          const captain = playerStore.getPlayerById(team.captainId)
          if (captain) {
            await teamStore.updateTeamName(team.id, `${captain.name}团`, currentRoundId.value)
          }
          console.log(`[autoSetCaptains] 队伍 ${team.name} 已有队长 ${captain?.name}，已更新队名`)
          continue
        }

        // 1. 先从队伍成员中找队长角色选手
        const captainInTeam = team.members?.find(m => {
          return allCaptains.some(c => c.id === m.playerId)
        })

        if (captainInTeam) {
          await teamStore.assignCaptain(team.id, captainInTeam.playerId, currentRoundId.value)
          const playerName = captainInTeam.player?.name || '未知'
          await teamStore.updateTeamName(team.id, `${playerName}团`, currentRoundId.value)
          unassignedCaptains = unassignedCaptains.filter(c => c.id !== captainInTeam.playerId)
          console.log(`[autoSetCaptains] 队伍 ${team.name} 从成员中找到队长 ${playerName}`)
        } else if (unassignedCaptains.length > 0) {
          // 2. 从未分配的队长中分配一个给这支队伍
          const captain = unassignedCaptains.shift()!
          await teamStore.addMember(team.id, captain.id, currentRoundId.value)
          await teamStore.assignCaptain(team.id, captain.id, currentRoundId.value)
          await teamStore.updateTeamName(team.id, `${captain.name}团`, currentRoundId.value)
          console.log(`[autoSetCaptains] 队伍 ${team.name} 分配了新队长 ${captain.name}`)
        } else {
          console.warn(`[autoSetCaptains] 队伍 ${team.name} 没有可用的队长可分配`)
        }
      } catch (teamError) {
        console.error(`[autoSetCaptains] 处理队伍 ${team.name} 时出错:`, teamError)
        // 继续处理下一个队伍
      }
    }

    // 重新获取最新数据
    if (currentRoundId.value) {
      await teamStore.fetchTeams(currentRoundId.value)
      console.log('[autoSetCaptains] 已重新获取队伍数据')
    }
  } catch (error) {
    console.error('[autoSetCaptains] 整体出错:', error)
  }
}

// 锁定队伍
async function handleLockTeam(team: RoundTeam) {
  try {
    await teamStore.lockTeam(team.id, currentRoundId.value)
    MessagePlugin.success('队伍已锁定')
  } catch (e: any) {
    MessagePlugin.error(e.message || '锁定失败')
  }
}

// 解锁队伍
async function handleUnlockTeam(team: RoundTeam) {
  try {
    await teamStore.unlockTeam(team.id, currentRoundId.value)
    MessagePlugin.success('队伍已解锁')
  } catch (e: any) {
    MessagePlugin.error(e.message || '解锁失败')
  }
}

// 删除队伍
async function handleDeleteTeam(team: RoundTeam) {
  try {
    await teamStore.deleteTeam(team.id, currentRoundId.value)
    MessagePlugin.success('队伍已删除')
    await fetchTeamManagementUsers()
  } catch (e: any) {
    MessagePlugin.error(e.message || '删除失败')
  }
}

// 筛选未分配选手
function filterUnassignedPlayers() {
  const keyword = memberSearchKeyword.value.toLowerCase()
  filteredUnassignedPlayers.value = unassignedPlayers.value.filter(p =>
    p.name.toLowerCase().includes(keyword) ||
    p.loginCode.toLowerCase().includes(keyword)
  )
}

// 打开添加成员弹窗
function openAddMemberDialog(team: RoundTeam) {
  selectedTeam.value = team
  memberSearchKeyword.value = ''
  filteredUnassignedPlayers.value = [...unassignedPlayers.value]
  showAddMemberDialog.value = true
}

// 打开添加成员弹窗（从选手详情）
function openAddMemberDialogForPlayer(player: User) {
  showPlayerDetail.value = false
  // 简单处理：让用户选择一个队伍
  if (teamStore.teams.length === 0) {
    MessagePlugin.warning('暂无队伍可添加')
    return
  }
  const dialog = DialogPlugin.confirm({
    header: '添加到队伍',
    body: `选择要将 ${player.name} 添加到的队伍`,
    onConfirm: async () => {
      dialog.destroy()
      try {
        // 选择第一个未满的队伍
        const targetTeam = teamStore.teams.find(t => 
          (t.members?.length || 0) < t.maxMembers && !t.locked
        )
        if (targetTeam) {
          // TODO: 实现添加成员到队伍的 API
          MessagePlugin.success(`已添加到 ${targetTeam.name}`)
          await fetchTeamManagementUsers()
        }
      } catch (e: any) {
        MessagePlugin.error(e.message || '添加失败')
      }
    }
  })
}

// 添加成员
async function handleAddMember(player: User) {
  if (!selectedTeam.value) return
  try {
    await teamStore.addMember(selectedTeam.value.id, player.id, currentRoundId.value)
    MessagePlugin.success(`已添加 ${player.name} 到 ${selectedTeam.value.name}`)
    showAddMemberDialog.value = false
    await fetchTeamManagementUsers()
  } catch (e: any) {
    MessagePlugin.error(e.message || '添加失败')
  }
}

// 打开选择队长弹窗
function openSelectCaptainDialog(team: RoundTeam) {
  selectedTeam.value = team
  showSelectCaptainDialog.value = true
}

// 选择队长
async function handleSetCaptain(member: RoundTeamMember) {
  if (!selectedTeam.value) return
  try {
    // 1. 设置队长
    await teamStore.assignCaptain(selectedTeam.value.id, member.playerId, currentRoundId.value)
    
    // 2. 将队长添加到队伍成员中
    await teamStore.addMember(selectedTeam.value.id, member.playerId, currentRoundId.value)
    
    // 3. 更新队名为"xx团"
    const playerName = member.player?.name || '未知'
    const newTeamName = `${playerName}团`
    await teamStore.updateTeamName(selectedTeam.value.id, newTeamName, currentRoundId.value)
    
    MessagePlugin.success(`已指定 ${playerName} 为队长，队伍已更名为 "${newTeamName}"`)
    showSelectCaptainDialog.value = false
    await fetchTeamManagementUsers()
    if (currentRoundId.value) {
      await teamStore.fetchTeams(currentRoundId.value)
    }
  } catch (e: any) {
    MessagePlugin.error(e.message || '设置失败')
  }
}

// 查看选手
function handleViewPlayer(player: User) {
  selectedPlayer.value = player
  // 查找该选手所在队伍
  selectedTeamForPlayer.value = teamStore.teams.find(t => 
    t.members?.some(m => m.playerId === player.id)
  ) || null
  showPlayerDetail.value = true
}

// 成员点击
function handleMemberClick(team: RoundTeam, member: RoundTeamMember) {
  selectedTeam.value = team
  selectedMember.value = member
  targetTeamId.value = ''
  showMemberAction.value = true
}

// 从操作弹窗设置队长
async function handleSetCaptainFromAction() {
  if (!selectedTeam.value || !selectedMember.value) return
  try {
    // 1. 设置队长
    await teamStore.assignCaptain(selectedTeam.value.id, selectedMember.value.playerId, currentRoundId.value)
    
    // 2. 将队长添加到队伍成员中
    await teamStore.addMember(selectedTeam.value.id, selectedMember.value.playerId, currentRoundId.value)
    
    // 3. 更新队名为"xx团"
    const playerName = selectedMember.value.player?.name || '未知'
    const newTeamName = `${playerName}团`
    await teamStore.updateTeamName(selectedTeam.value.id, newTeamName, currentRoundId.value)
    
    MessagePlugin.success(`已指定 ${playerName} 为队长，队伍已更名为 "${newTeamName}"`)
    showMemberAction.value = false
    await fetchTeamManagementUsers()
    if (currentRoundId.value) {
      await teamStore.fetchTeams(currentRoundId.value)
    }
  } catch (e: any) {
    MessagePlugin.error(e.message || '设置失败')
  }
}

// 移除成员
async function handleRemoveMember() {
  if (!selectedTeam.value || !selectedMember.value) return
  try {
    await teamStore.removeMember(selectedTeam.value.id, selectedMember.value.playerId, currentRoundId.value)
    MessagePlugin.success(`${selectedMember.value.player?.name} 已移出队伍`)
    showMemberAction.value = false
    await fetchTeamManagementUsers()
    if (currentRoundId.value) {
      await teamStore.fetchTeams(currentRoundId.value)
    }
  } catch (e: any) {
    MessagePlugin.error(e.message || '移除失败')
  }
}

// 从详情移除成员
async function handleRemoveMemberFromDetail() {
  if (!selectedTeamForPlayer.value || !selectedPlayer.value) return
  try {
    await teamStore.removeMember(selectedTeamForPlayer.value.id, selectedPlayer.value.id, currentRoundId.value)
    MessagePlugin.success(`${selectedPlayer.value.name} 已移出队伍`)
    showPlayerDetail.value = false
    await fetchTeamManagementUsers()
    if (currentRoundId.value) {
      await teamStore.fetchTeams(currentRoundId.value)
    }
  } catch (e: any) {
    MessagePlugin.error(e.message || '移除失败')
  }
}

// 移动成员
async function handleMoveMember() {
  if (!selectedTeam.value || !selectedMember.value || !targetTeamId.value) return
  try {
    // 先从当前队伍移除，再添加到目标队伍
    await teamStore.removeMember(selectedTeam.value.id, selectedMember.value.playerId, currentRoundId.value)
    await teamStore.addMember(targetTeamId.value, selectedMember.value.playerId, currentRoundId.value)
    
    const targetTeam = teamStore.getTeamById(targetTeamId.value)
    MessagePlugin.success(`${selectedMember.value.player?.name} 已移动到 ${targetTeam?.name}`)
    showMemberAction.value = false
    await fetchTeamManagementUsers()
    if (currentRoundId.value) {
      await teamStore.fetchTeams(currentRoundId.value)
    }
  } catch (e: any) {
    MessagePlugin.error(e.message || '移动失败')
  }
}

// 初始化
onMounted(async () => {
  // 先获取赛季信息
  if (!seasonStore.season) {
    await seasonStore.fetchSeason()
  }

  if (currentRoundId.value) {
    // 加载玩家数据和队伍数据
    await Promise.all([
      fetchTeamManagementUsers(),
      teamStore.fetchTeams(currentRoundId.value)
    ])

    // 如果 teams 为空，从 dataService 直接读取
    if (teamStore.teams.length === 0) {
      const dsData = dsGetTeams(currentRoundId.value)
      if (dsData.length > 0) {
        console.log('[AdminTeamView] 从 dataService 恢复队伍数据:', dsData.length, 'teams')
        teamStore.teams = dsData
      }
    }

    console.log('[AdminTeamView] 加载完成:', {
      roundId: currentRoundId.value,
      teams: teamStore.teams.length,
      players: playerStore.users.length
    })
  }
})
</script>

<style lang="scss" scoped>
.admin-teams {
  background: var(--bg-primary);
  padding: 12px;
  min-height: 100%;
  padding-bottom: env(safe-area-inset-bottom, 20px);
}

// 统计卡片
.stats-section {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.stat-card {
  flex: 1;
  background: var(--card-bg);
  border-radius: 10px;
  padding: 14px 12px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  transition: transform 0.15s;

  &:active {
    transform: scale(0.97);
  }

  .stat-value {
    display: block;
    font-size: 22px;
    font-weight: 700;
    color: #0052d9;
    line-height: 1.2;
  }

  .stat-label {
    font-size: 11px;
    color: var(--text-tertiary);
    margin-top: 4px;
  }
}

// 操作按钮区
.action-section {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

// 区块头部
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  background: var(--card-bg);
  border-radius: 10px 10px 0 0;
  margin-bottom: 1px;

  .section-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .section-count {
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

// 未分配选手
.unassigned-section {
  background: var(--card-bg);
  border-radius: 10px;
  margin-bottom: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.player-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 14px;
}

.player-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #f0f5ff 0%, #fff 100%);
  padding: 6px 12px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid rgba(0, 82, 204, 0.08);

  &:active {
    transform: scale(0.95);
    background: var(--hover-bg);
  }

  .chip-avatar {
    font-size: 15px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
  }

  .chip-name {
    font-size: 12px;
    color: var(--text-primary);
    font-weight: 500;
  }
}

// 队伍列表
.teams-section {
  background: var(--card-bg);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.team-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}

.team-card {
  background: linear-gradient(135deg, #fafafa 0%, #fff 100%);
  border-radius: 10px;
  padding: 14px;
  border: 1px solid var(--border-color);
  transition: all 0.2s;

  &:active {
    transform: scale(0.99);
  }

  &.locked {
    background: linear-gradient(135deg, #fff5f5 0%, #fff 100%);
    border-color: #fecaca;
  }
}

.team-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;

  .team-name {
    font-size: 17px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .team-meta {
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

.captain-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #fff7e6 0%, #fff 100%);
  border-radius: 8px;
  margin-bottom: 12px;
  border: 1px solid rgba(255, 208, 168, 0.3);

  &.no-captain {
    background: var(--bg-primary);
    border-color: #e8e8e8;

    .captain-value {
      color: var(--text-tertiary);
    }
  }

  .captain-label {
    font-size: 11px;
    color: var(--text-tertiary);
  }

  .captain-value {
    font-size: 13px;
    font-weight: 600;
    color: #e34d59;
  }
}

.members-section {
  margin-bottom: 12px;
}

.members-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.member-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  background: var(--card-bg);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 60px;
  border: 1px solid rgba(0, 0, 0, 0.04);

  &:active {
    transform: scale(0.95);
  }

  &.captain {
    background: linear-gradient(135deg, #fff7e6 0%, #fff 100%);
    border: 1px solid #ffd0a8;
  }

  &.add-member {
    background: var(--bg-primary);
    border: 1px dashed var(--border-color);

    .add-icon {
      font-size: 20px;
      color: #0052d9;
    }

    .add-text {
      font-size: 10px;
      color: #0052d9;
    }
  }

  .member-avatar {
    font-size: 22px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 50%;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
  }

  .member-name {
    font-size: 11px;
    color: var(--text-primary);
    text-align: center;
    max-width: 60px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .captain-badge {
    font-size: 9px;
    color: #e34d59;
    background: var(--card-bg);
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
  }
}

.attr-section {
  display: flex;
  justify-content: space-around;
  padding: 12px 0;
  border-top: 1px solid var(--border-color);

  .attr-item {
    text-align: center;

    .attr-label {
      display: block;
      font-size: 10px;
      color: var(--text-tertiary);
      margin-bottom: 4px;
    }

    .attr-value {
      font-size: 15px;
      font-weight: 600;

      &.vocal { color: #e34d59; }
      &.dance { color: #00a870; }
      &.charm { color: #ed7b2f; }
    }
  }
}

.song-section {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--border-color);

  .song-label {
    font-size: 11px;
    color: var(--text-tertiary);
  }
}

.team-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

// 设置表单
.setup-form {
  padding: 8px 0;

  .form-item {
    margin-bottom: 16px;

    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text-primary);
    }
  }

  .team-config-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .team-config-item {
    display: flex;
    gap: 10px;

    .team-name-input {
      flex: 2;
    }

    .team-size-input {
      flex: 1;
    }
  }

  .form-tip {
    margin-top: 16px;
    padding: 12px;
    background: #fff7e6;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.5;

    &.ok {
      background: #e6fffb;
      color: #036d5a;
    }

    &.warn {
      background: #fff1e6;
      color: #c24d00;
      border: 1px solid #ffc9a8;
    }

    .capacity-info {
      .capacity-row {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;

        &.highlight {
          justify-content: center;
          font-weight: 600;
          font-size: 13px;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px dashed rgba(0, 0, 0, 0.1);
        }
      }
    }

    .capacity-warning {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid rgba(181, 124, 0, 0.2);
      opacity: 0.8;
    }
  }
}

// 添加成员表单
.add-member-form {
  .member-select-list {
    margin-top: 12px;
    max-height: 300px;
    overflow-y: auto;
  }

  .member-select-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    cursor: pointer;
    transition: background 0.2s;
    border-radius: 8px;

    &:active {
      background: var(--bg-primary);
    }

    .member-avatar {
      font-size: 22px;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
      }
    }

    .member-name {
      flex: 1;
      font-size: 13px;
      color: var(--text-primary);
    }
  }
}

// 选择队长/成员操作
.captain-select-list,
.captain-select-item {
  .captain-select-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    cursor: pointer;
    border-radius: 8px;

    &:active {
      background: var(--bg-primary);
    }

    .member-avatar {
      font-size: 22px;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
      }
    }

    .member-name {
      flex: 1;
      font-size: 13px;
      color: var(--text-primary);
    }
  }
}

.move-section {
  padding-top: 12px;

  .t-divider {
    margin: 12px 0;
  }

  .t-button {
    margin-top: 12px;
  }
}

// 选择歌曲
.song-select-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.song-select-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:active {
    background: #eee;
    transform: scale(0.98);
  }

  .song-name {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .song-style {
    font-size: 11px;
    color: var(--text-tertiary);
  }
}

// 选手详情
.player-detail {
  padding: 8px 0;

  .detail-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px 0;
    border-bottom: 1px solid var(--border-color);
    margin-bottom: 16px;

    .detail-avatar {
      font-size: 48px;
      margin-bottom: 8px;
    }

    .detail-name {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary);
    }
  }

  .detail-info {
    .info-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;

      .info-label {
        color: var(--text-tertiary);
        font-size: 12px;
      }

      .info-value {
        font-weight: 500;
        font-size: 12px;
      }
    }
  }

  .detail-attrs {
    padding: 16px 0;
    border-top: 1px solid var(--border-color);

    .attr-bar-item {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;

      span:first-child {
        width: 50px;
        font-size: 12px;
      }

      .attr-bar {
        flex: 1;
        height: 8px;
        background: var(--progress-bg);
        border-radius: 4px;
        overflow: hidden;

        .attr-bar-fill {
          height: 100%;
          border-radius: 4px;

          &.vocal { background: linear-gradient(90deg, #e34d59, #f78ba7); }
          &.dance { background: linear-gradient(90deg, #00a870, #8fd4a0); }
          &.charm { background: linear-gradient(90deg, #ed7b2f, #ffcbae); }
        }
      }

      span:last-child {
        width: 30px;
        text-align: right;
        font-weight: 600;
        font-size: 13px;
      }
    }
  }

  .detail-actions {
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
  }
}

.no-data {
  text-align: center;
  padding: 24px;
  color: var(--text-muted);
  font-size: 13px;
}

// 空状态和加载
.empty-state,
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;

  .empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }

  .empty-text {
    font-size: 13px;
    color: var(--text-muted);
  }
}

// 移动端优化
@media (max-width: 480px) {
  .admin-teams {
    padding: 10px;
  }

  .stats-section {
    gap: 8px;
  }

  .stat-card {
    padding: 12px 8px;

    .stat-value {
      font-size: 18px;
    }

    .stat-label {
      font-size: 10px;
    }
  }

  .team-card {
    padding: 12px;
  }

  .team-header {
    .team-name {
      font-size: 15px;
    }
  }

  .member-item {
    min-width: 52px;
    padding: 6px;

    .member-avatar {
      font-size: 20px;
    }

    .member-name {
      font-size: 10px;
      max-width: 52px;
    }
  }
}

// 桌面端适配
@media (min-width: 768px) {
  .admin-teams {
    padding: 20px;
  }

  .stats-section {
    gap: 16px;
  }

  .stat-card {
    padding: 20px;

    .stat-value {
      font-size: 26px;
    }
  }

  .team-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .team-list {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
