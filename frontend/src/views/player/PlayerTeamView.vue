<template>
  <div class="player-team">
    <StageStatusView :round="currentRound" stage="teaming">
      <template #current>
        <div class="team-header">
          <h1>组队中心</h1>
          <p class="subtitle">{{ isCurrentUserCaptain ? '作为队长，管理你的队伍' : '申请加入或接收邀请' }}</p>
        </div>

        <!-- 队伍总览（所有人可见） -->
        <div class="teams-overview">
          <div class="section-title-bar">
            <span class="section-icon">👥</span>
            <span>所有队伍</span>
          </div>
          <div class="teams-grid">
            <div v-for="team in allTeams" :key="team.id" class="team-overview-card">
              <div class="team-overview-header">
                <span class="team-overview-name">{{ team.name }}</span>
                <span class="team-overview-count">{{ team.members?.length || 0 }}/{{ team.maxMembers }}</span>
              </div>
              <div class="team-captain">队长：<span class="captain-name-highlight">{{ team.captainId ? getCaptainName(team) : '未指定' }}</span></div>
              <div class="team-members-list">
                <div v-for="member in team.members" :key="member.playerId" class="team-member-item" :class="{ 'is-captain': member.playerId === team.captainId }">
                  <div class="mini-avatar">{{ getAvatarIcon(member.player?.name) }}</div>
                  <span class="team-member-name">{{ member.player?.name || '未知' }}</span>
                  <span v-if="member.playerId === team.captainId" class="captain-mini-badge">队长</span>
                </div>
                <div v-if="!team.members || team.members.length === 0" class="no-members">暂无成员</div>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== 队长视图 ===== -->
        <div v-if="isCurrentUserCaptain && myTeam" class="captain-view">
          <!-- 我的队伍 -->
          <div class="section-card">
            <div class="section-title-bar"><span class="section-icon">🏠</span><span>我的队伍</span></div>
            <div class="team-card-modern">
              <div class="team-card-header">
                <span class="team-name-large">{{ myTeam.name }}</span>
                <span class="team-capacity">{{ myTeam.members?.length || 0 }} / {{ myTeam.maxMembers }} 人</span>
              </div>
              <div class="member-chips">
                <div v-for="member in myTeam.members" :key="member.playerId" class="member-chip" :class="{ 'chip-captain': member.playerId === myTeam.captainId }">
                  <div class="chip-avatar">{{ getAvatarIcon(member.player?.name) }}</div>
                  <span class="chip-name">{{ member.player?.name || '未知' }}</span>
                  <span v-if="member.playerId === myTeam.captainId" class="chip-badge">👑</span>
                </div>
                <div v-if="!myTeam.members || myTeam.members.length === 0" class="no-data">暂无成员</div>
              </div>
            </div>
          </div>

          <!-- 入队申请（队长审核） -->
          <div class="section-card">
            <div class="section-title-bar"><span class="section-icon">📋</span><span>入队申请（{{ pendingApplications.length }}）</span></div>
            <div v-if="pendingApplications.length > 0" class="application-list">
              <div v-for="app in pendingApplications" :key="app.id" class="application-item">
                <div class="app-avatar">{{ getAvatarIcon(getPlayerName(app)) }}</div>
                <span class="app-name">{{ getPlayerName(app) }}</span>
                <t-space>
                  <t-button theme="success" size="small" @click="handleAcceptApplication(app)">同意</t-button>
                  <t-button theme="default" size="small" @click="handleRejectApplication(app)">拒绝</t-button>
                </t-space>
              </div>
            </div>
            <div v-else class="empty-tip">暂无入队申请</div>
          </div>

          <!-- 邀请未入队选手 -->
          <div class="section-card">
            <div class="section-title-bar"><span class="section-icon">📩</span><span>邀请未入队选手</span></div>
            <div class="search-box">
              <t-input v-model="searchKeyword" placeholder="搜索选手" />
            </div>
            <div v-if="filteredUnassigned.length > 0" class="player-list">
              <div v-for="player in filteredUnassigned" :key="player.id" class="player-row">
                <div class="player-row-avatar">{{ getAvatarIcon(player.name) }}</div>
                <span class="player-row-name">{{ player.name }}</span>
                <template v-if="!myTeam.locked">
                  <t-button
                    v-if="!isPlayerInvited(player.id)"
                    size="small" theme="primary"
                    @click="handleInvite(player.id)">邀请</t-button>
                  <t-tag v-else theme="warning" size="small">已邀请</t-tag>
                </template>
                <t-tag v-else theme="danger" size="small">已锁定</t-tag>
              </div>
            </div>
            <div v-else class="empty-tip">所有选手都已入队</div>
          </div>
        </div>

        <!-- ===== 队员视图 ===== -->
        <div v-else class="member-view">
          <!-- 我已加入的队伍 -->
          <div v-if="myTeam" class="section-card">
            <div class="section-title-bar"><span class="section-icon">🏠</span><span>我的队伍</span></div>
            <div class="team-card-modern">
              <div class="team-card-header">
                <span class="team-name-large">{{ myTeam.name }}</span>
                <t-tag :theme="myTeam.locked ? 'danger' : 'success'" variant="light">{{ myTeam.locked ? '已满员' : '招募中' }}</t-tag>
              </div>
              <div class="member-chips">
                <div v-for="member in myTeam.members" :key="member.playerId" class="member-chip" :class="{ 'chip-captain': member.playerId === myTeam.captainId }">
                  <div class="chip-avatar">{{ getAvatarIcon(member.player?.name) }}</div>
                  <span class="chip-name">{{ member.player?.name || '未知' }}</span>
                  <span v-if="member.playerId === myTeam.captainId" class="chip-badge">👑</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 收到的邀请 -->
          <div v-if="pendingInvites.length > 0" class="section-card">
            <div class="section-title-bar"><span class="section-icon">📩</span><span>队长邀请（{{ pendingInvites.length }}）</span></div>
            <div v-for="invite in pendingInvites" :key="invite.id" class="invite-card">
              <span class="invite-text">{{ invite.captainName }} 邀请你加入「{{ invite.teamName }}」</span>
              <t-space>
                <t-button theme="success" size="small" @click="handleAcceptInvite(invite)">接受</t-button>
                <t-button theme="default" size="small" @click="handleRejectInvite(invite)">拒绝</t-button>
              </t-space>
            </div>
          </div>

          <!-- 申请入队 -->
          <div v-if="!myTeam" class="section-card">
            <div class="section-title-bar"><span class="section-icon">✋</span><span>申请入队</span></div>
            <div class="teams-apply-grid">
              <div v-for="team in joinableTeams" :key="team.id" class="team-apply-card">
                <div class="apply-team-header">
                  <span class="apply-team-name">{{ team.name }}</span>
                  <span class="apply-team-count">{{ team.members?.length || 0 }}/{{ team.maxMembers }}</span>
                </div>
                <div class="apply-captain">队长：{{ getCaptainName(team) }}</div>
                <template v-if="team.locked || (team.members?.length || 0) >= team.maxMembers">
                  <t-tag theme="danger" block size="large">已满员</t-tag>
                </template>
                <template v-else-if="isTeamApplied(team.id)">
                  <t-tag theme="warning" block size="large">已申请</t-tag>
                </template>
                <t-button v-else theme="primary" block @click="handleApply(team.id)">申请加入</t-button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #completed>
        <div class="team-header"><h1>组队结果</h1></div>
        <div class="teams-grid">
          <div v-for="team in allTeams" :key="team.id" class="team-result-card">
            <div class="result-team-name">{{ team.name }}</div>
            <div class="result-members">
              <div v-for="member in team.members" :key="member.playerId" class="result-member">
                <span class="result-member-name">{{ member.player?.name || '未知' }}</span>
                <span v-if="member.playerId === team.captainId" class="result-captain-badge">队长</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </StageStatusView>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useSeasonStore } from '../../stores/seasonStore'
import { useTeamStore } from '../../stores/teamStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useAuthStore } from '../../stores/authStore'
import {
  invitePlayerToTeam,
  applyToTeam,
  acceptTeamApplication,
  rejectTeamApplication,
  acceptTeamInvite as apiAcceptInvite,
  rejectTeamInvite as apiRejectInvite,
  getTeamApplications,
  getPlayerInvites
} from '../../services/api'
import StageStatusView from '../../components/StageStatusView.vue'

const route = useRoute()
const seasonStore = useSeasonStore()
const teamStore = useTeamStore()
const playerStore = usePlayerStore()
const authStore = useAuthStore()

const currentRound = computed(() => parseInt(route.params.round as string) || 1)
const searchKeyword = ref('')

// 当前选手
const currentUser = computed(() => authStore.currentUser)

// 是否为当前轮的队长
const isCurrentUserCaptain = computed(() => {
  if (!currentUser.value) return false
  return teamStore.teams.some(t => t.captainId === currentUser.value!.id)
})

// 当前选手所在的队伍
const myTeam = computed(() => {
  if (!currentUser.value) return null
  return teamStore.teams.find(t =>
    t.captainId === currentUser.value!.id ||
    t.members?.some(m => m.playerId === currentUser.value!.id)
  ) || null
})

// 所有队伍
const allTeams = computed(() => teamStore.teams)

// 未入队选手
const unassignedPlayers = computed(() => {
  const teamMemberIds = new Set<string>()
  teamStore.teams.forEach(t => {
    t.members?.forEach(m => teamMemberIds.add(m.playerId))
    if (t.captainId) teamMemberIds.add(t.captainId)
  })
  return playerStore.users.filter(u =>
    u.role !== 'admin' &&
    u.status !== 'eliminated' &&
    !teamMemberIds.has(u.id)
  )
})

// 队长可邀请的未入队选手（搜索过滤）
const filteredUnassigned = computed(() => {
  if (!searchKeyword.value) return unassignedPlayers.value
  return unassignedPlayers.value.filter(p =>
    p.name.includes(searchKeyword.value)
  )
})

// 可申请加入的队伍（未满员、未锁定）
const joinableTeams = computed(() => {
  return teamStore.teams.filter(t =>
    t.captainId &&
    !t.locked &&
    (t.members?.length || 0) < t.maxMembers
  )
})

// 已申请入队（含本次会话内刚操作的），队长视角：这些选手的邀请按钮应禁用
const appliedPlayerIds = computed(() => new Set(pendingApplications.value.map(a => a.playerId)))

// 已邀请过我的队伍 ID，队员视角：这些队伍的申请按钮应禁用
const invitedTeamIds = computed(() => new Set(pendingInvites.value.map(i => i.teamId)))

// 本地已操作记录（防止同次会话内重复点击，等待 API 刷新前兜底）
const locallyInvited = ref(new Set<string>())   // 队长已邀请的 playerId
const locallyApplied = ref(new Set<string>())   // 队员已申请的 teamId

const pendingApplications = ref<{ id: string; playerId: string; playerName: string }[]>([])
const pendingInvites = ref<{ id: string; captainId: string; captainName: string; teamId: string; teamName: string }[]>([])

function getAvatarIcon(name?: string): string {
  if (!name) return '👤'
  const icons = ['🌟', '🎤', '💃', '✨', '🎵', '🎭']
  return icons[name.charCodeAt(0) % icons.length]
}

// 从申请对象中获取选手名字——后端可能把 playerId 填入 playerName，
// 需要从 playerStore 兜底查找真实名字
function getPlayerName(app: { playerId: string; playerName?: string }): string {
  // 先尝试从 playerStore 按 playerId 查找（后端已加载用户列表）
  const found = playerStore.users.find(u => u.id === app.playerId)
  if (found?.name) return found.name
  // 兜底：如果 playerName 看起来像真实名字（不是 UUID）就用它
  if (app.playerName && app.playerName !== app.playerId) return app.playerName
  return '未知选手'
}

// 队长视角：该选手是否已操作过（已申请 / 已邀请）
function isPlayerInvited(playerId: string): boolean {
  return appliedPlayerIds.value.has(playerId) || locallyInvited.value.has(playerId)
}

// 队员视角：该队伍是否已操作过（已发送邀请 / 已申请）
function isTeamApplied(teamId: string): boolean {
  return invitedTeamIds.value.has(teamId) || locallyApplied.value.has(teamId)
}

function getCaptainName(team: any): string {
  if (!team.captainId) return '未指定'
  const member = team.members?.find((m: any) => m.playerId === team.captainId)
  if (member?.player?.name) return member.player.name
  const user = playerStore.users.find(u => u.id === team.captainId)
  return user?.name || '未知'
}

// 队长：邀请选手
async function handleInvite(playerId: string) {
  if (!myTeam.value) return
  try {
    const roundId = `round-${currentRound.value}`
    await invitePlayerToTeam(myTeam.value.id, playerId, roundId)
    locallyInvited.value.add(playerId)
    MessagePlugin.success('邀请已发出')
  } catch (e: any) {
    MessagePlugin.error(e.message || '邀请失败')
  }
}

// 队员：申请入队
async function handleApply(teamId: string) {
  if (!currentUser.value) return
  try {
    const roundId = `round-${currentRound.value}`
    await applyToTeam(teamId, currentUser.value.id, roundId)
    locallyApplied.value.add(teamId)
    MessagePlugin.success('入队申请已发送')
  } catch (e: any) {
    MessagePlugin.error(e.message || '申请失败')
  }
}

// 队长：同意入队申请
async function handleAcceptApplication(app: { playerId: string }) {
  if (!myTeam.value) return
  try {
    const roundId = `round-${currentRound.value}`
    await acceptTeamApplication(myTeam.value.id, app.playerId, roundId)
    pendingApplications.value = pendingApplications.value.filter(a => a.playerId !== app.playerId)
    MessagePlugin.success('已同意入队')
    await loadTeams()
  } catch (e: any) {
    MessagePlugin.error(e.message || '操作失败')
  }
}

// 队长：拒绝入队申请
async function handleRejectApplication(app: { playerId: string }) {
  if (!myTeam.value) return
  try {
    const roundId = `round-${currentRound.value}`
    await rejectTeamApplication(myTeam.value.id, app.playerId, roundId)
    pendingApplications.value = pendingApplications.value.filter(a => a.playerId !== app.playerId)
    MessagePlugin.info('已拒绝')
  } catch (e: any) {
    MessagePlugin.error(e.message || '操作失败')
  }
}

// 队员：接受邀请
async function handleAcceptInvite(invite: { id: string }) {
  try {
    await apiAcceptInvite(invite.id)
    pendingInvites.value = pendingInvites.value.filter(i => i.id !== invite.id)
    MessagePlugin.success('已加入队伍')
    await loadTeams()
  } catch (e: any) {
    MessagePlugin.error(e.message || '操作失败')
  }
}

// 队员：拒绝邀请
async function handleRejectInvite(invite: { id: string }) {
  try {
    await apiRejectInvite(invite.id)
    pendingInvites.value = pendingInvites.value.filter(i => i.id !== invite.id)
    MessagePlugin.info('已拒绝邀请')
  } catch (e: any) {
    MessagePlugin.error(e.message || '操作失败')
  }
}

async function loadApplications() {
  if (!myTeam.value || !currentUser.value) return
  const roundId = `round-${currentRound.value}`
  try {
    const res = await getTeamApplications(myTeam.value.id, roundId)
    pendingApplications.value = Array.isArray(res)
      ? res
      : (res as any)?.applications || (res as any)?.data || []
  } catch (e) {
    pendingApplications.value = []
  }
}

async function loadInvites() {
  if (!currentUser.value) return
  const roundId = `round-${currentRound.value}`
  try {
    const res = await getPlayerInvites(currentUser.value.id, roundId)
    // 兼容多种返回格式：
    //   数组 → 直接使用
    //   对象 { invites/invitations/data: [...] } → 提取其中的数组
    //   其他 → 兜底空数组
    pendingInvites.value = Array.isArray(res)
      ? res
      : (res as any)?.invites || (res as any)?.invitations || (res as any)?.data || []
  } catch (e) {
    pendingInvites.value = []
  }
}

async function loadTeams() {
  const roundId = `round-${currentRound.value}`
  try {
    await teamStore.fetchTeams(roundId)
  } catch (e) {
    console.warn('[PlayerTeam] 加载队伍失败:', e)
  }
}

async function loadAll() {
  await loadTeams()
  await loadApplications()
  await loadInvites()
}

onMounted(async () => {
  await Promise.all([
    playerStore.fetchUsers({ pageSize: 1000 }),
    seasonStore.fetchSeason()
  ])
  await loadAll()
})
</script>

<style scoped lang="scss">
.player-team {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.team-header {
  margin-bottom: 24px;
  h1 { font-size: 24px; font-weight: 700; margin: 0 0 8px; }
  .subtitle { color: #999; font-size: 14px; margin: 0; }
}

.section-title-bar {
  display: flex; align-items: center; gap: 8px;
  font-size: 16px; font-weight: 600; margin-bottom: 16px;
  .section-icon { font-size: 20px; }
}

.section-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.teams-grid, .teams-apply-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.team-overview-card, .team-apply-card, .team-result-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 16px;
}

.team-overview-header, .apply-team-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px;
  .team-overview-name, .apply-team-name { font-size: 16px; font-weight: 600; }
  .team-overview-count, .apply-team-count { font-size: 13px; color: #999; }
}

.team-captain, .apply-captain { font-size: 13px; color: #aaa; margin-bottom: 12px; }
.captain-name-highlight { color: #f39c12; font-weight: 500; }

.team-members-list { display: flex; flex-direction: column; gap: 6px; }
.team-member-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: rgba(255,255,255,0.03);
  &.is-captain { background: rgba(243,156,18,0.1); }
}

.mini-avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(102,126,234,0.2); font-size: 14px; }
.team-member-name { font-size: 13px; flex: 1; }
.captain-mini-badge { font-size: 10px; color: #f39c12; background: rgba(243,156,18,0.15); padding: 1px 6px; border-radius: 6px; }
.no-members { font-size: 12px; color: #666; padding: 8px; text-align: center; }

/* 队长视图 */
.team-card-modern {
  background: rgba(255,255,255,0.03);
  border-radius: 12px;
  padding: 16px;
}
.team-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.team-name-large { font-size: 18px; font-weight: 700; }
.team-capacity { font-size: 14px; color: #999; }

.member-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.member-chip { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: rgba(255,255,255,0.05); border-radius: 20px;
  &.chip-captain { background: rgba(243,156,18,0.15); border: 1px solid rgba(243,156,18,0.3); }
}
.chip-avatar { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; background: rgba(102,126,234,0.2); }
.chip-name { font-size: 13px; }
.chip-badge { font-size: 12px; }
.no-data { font-size: 12px; color: #666; padding: 12px; text-align: center; }

/* 申请列表 */
.application-list { display: flex; flex-direction: column; gap: 8px; }
.application-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: rgba(255,255,255,0.03); border-radius: 8px; }
.app-avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(102,126,234,0.2); font-size: 14px; }
.app-name { flex: 1; font-size: 14px; }

/* 邀请列表 */
.search-box { margin-bottom: 12px; }
.player-list { display: flex; flex-direction: column; gap: 8px; }
.player-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 8px; }
.player-row-avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(102,126,234,0.2); font-size: 14px; }
.player-row-name { flex: 1; font-size: 14px; }

/* 邀请卡片 */
.invite-card { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(46,204,113,0.2); border-radius: 10px; margin-bottom: 8px; }
.invite-text { font-size: 14px; flex: 1; }

/* 队伍申请卡片 */
.team-apply-card .apply-team-header { margin-bottom: 4px; }
.team-apply-card .apply-captain { margin-bottom: 12px; }

/* 已完成结果 */
.team-result-card { margin-bottom: 12px; }
.result-team-name { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
.result-members { display: flex; flex-wrap: wrap; gap: 8px; }
.result-member { display: flex; align-items: center; gap: 6px; padding: 4px 10px; background: rgba(255,255,255,0.03); border-radius: 16px; font-size: 13px; }
.result-captain-badge { font-size: 10px; color: #f39c12; }

.empty-tip { font-size: 13px; color: #666; text-align: center; padding: 16px; }

// ===== 移动端适配 =====
@media (max-width: 768px) {
  .player-team {
    padding: 16px;
  }

  .team-header {
    h1 { font-size: 20px; }
    .subtitle { font-size: 13px; }
  }

  .section-card {
    padding: 14px;
  }

  // 队伍总览列表（移动端单列）
  .teams-grid, .teams-apply-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  // 队伍总览卡片
  .team-overview-card, .team-apply-card, .team-result-card {
    padding: 12px;
  }

  .team-overview-name, .apply-team-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 入队申请
  .application-item {
    flex-wrap: wrap;
    gap: 8px;

    .app-name {
      width: 100%;
      order: -1;
    }

    .t-space {
      width: 100%;
      display: flex !important;

      .t-button {
        flex: 1;
      }
    }
  }

  // 邀请选手
  .player-row {
    flex-wrap: wrap;
    gap: 8px;

    .player-row-name {
      width: 100%;
      order: -1;
    }

    .t-button, .t-tag {
      flex: 1;
      text-align: center;
    }
  }

  // 邀请卡片
  .invite-card {
    flex-direction: column;
    gap: 12px;
    padding: 12px;

    .invite-text {
      width: 100%;
      font-size: 13px;
    }

    .t-space {
      width: 100%;
      display: flex !important;

      .t-button {
        flex: 1;
      }
    }
  }

  // 我的队伍卡片
  .team-card-header {
    flex-wrap: wrap;
    gap: 8px;
  }

  .team-name-large {
    font-size: 16px;
  }

  .member-chips {
    gap: 6px;
  }

  .member-chip {
    padding: 4px 10px;
    font-size: 12px;
  }

  // 已完成结果
  .result-team-name {
    font-size: 14px;
  }

  .result-member {
    font-size: 12px;
  }
}
</style>
