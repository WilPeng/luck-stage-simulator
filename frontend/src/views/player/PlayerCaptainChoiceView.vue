<template>
  <div class="player-captain-choice">
    <StageStatusView :round="currentRound" stage="teaming">
      <template #current>
        <div class="team-header">
          <h1>🤝 选择意向队长</h1>
          <p class="subtitle">选择你希望加入的队长，管理员将根据所有选手的意向进行匹配分组</p>
        </div>

        <!-- 未开放提示 -->
        <div v-if="!isTeamReleased" class="release-locked-banner">
          <span class="lock-icon">🔒</span>
          <div class="lock-text">
            <div class="lock-title">意向提交尚未开放</div>
            <div class="lock-desc">请等待管理员开放意向队长分组</div>
          </div>
        </div>

        <!-- 队长视角：不选意向，只查看分组情况 -->
        <template v-if="isCurrentUserCaptain">
          <div class="section-card my-team-card">
            <div class="section-title-bar"><span class="section-icon">🏠</span><span>我的队伍</span></div>
            <div class="my-team-info">
              <span class="my-team-name">{{ myTeam?.name || '未知' }}</span>
              <span class="my-team-count">{{ myTeam?.members?.length || 0 }} / {{ myTeam?.maxMembers || 0 }} 人</span>
            </div>
            <div class="team-members">
              <div v-for="m in myTeam?.members || []" :key="m.playerId" class="team-member">
                <span class="member-dot"></span>{{ m.player?.name || '未知' }}
                <span v-if="m.playerId === myTeam?.captainId" class="captain-badge">👑</span>
              </div>
              <div v-if="!myTeam?.members || myTeam.members.length === 0" class="no-members">暂无成员</div>
            </div>
            <p class="captain-hint">你是本轮队长，将由选手选择你作为意向队长。无需提交意向。</p>
          </div>

          <div class="section-title-bar">
            <span class="section-icon">👥</span>
            <span>当前分组情况</span>
            <span class="sub-count">{{ teams.length }} 支</span>
          </div>
          <div class="teams-grid">
            <div v-for="team in teams" :key="team.id" class="team-card view-only">
              <div class="team-header">
                <span class="team-name">{{ team.name }}</span>
                <span class="team-count">{{ team.members?.length || 0 }}/{{ team.maxMembers }} 人</span>
              </div>
              <div class="team-captain">队长：<strong>{{ getCaptainName(team) || '未指定' }}</strong></div>
              <div class="team-members">
                <div v-for="m in team.members || []" :key="m.playerId" class="team-member">
                  <span class="member-dot"></span>{{ m.player?.name || '未知' }}
                  <span v-if="m.playerId === team.captainId" class="captain-badge">👑</span>
                </div>
                <div v-if="!team.members || team.members.length === 0" class="no-members">暂无成员</div>
              </div>
            </div>
          </div>
          <div v-if="teams.length === 0" class="empty-tip">暂无队伍</div>
        </template>

        <!-- 队员视角：选择意向队长 -->
        <template v-else>
          <!-- 已提交意向（不可修改） -->
          <div v-if="myPreference && myPreference.preferredCaptainId" class="section-card submitted-card">
            <div class="section-title-bar"><span class="section-icon">✅</span><span>我的意向（已提交，不可修改）</span></div>
            <p style="margin:0">已选择意向队长：<strong style="color:#f39c12">{{ myPreference.preferredCaptainName || '未知' }}</strong></p>
            <p class="submitted-hint">每位选手只能提交一次意向，提交后不可修改</p>
          </div>

          <!-- 所有队伍（供选择意向队长） -->
          <div class="section-title-bar">
            <span class="section-icon">👥</span>
            <span>所有队伍</span>
            <span class="sub-count">{{ teams.length }} 支</span>
          </div>
          <div class="teams-grid">
            <div
              v-for="team in teams"
              :key="team.id"
              class="team-card"
              :class="{
                selected: myPreference && myPreference.teamId === team.id,
                disabled: submitted
              }"
            >
              <div class="team-header">
                <span class="team-name">{{ team.name }}</span>
                <span class="team-count">{{ team.members?.length || 0 }}/{{ team.maxMembers }} 人</span>
              </div>
              <div class="team-captain">队长：<strong>{{ getCaptainName(team) || '未指定' }}</strong></div>
              <div class="team-members">
                <div v-for="m in team.members || []" :key="m.playerId" class="team-member">
                  <span class="member-dot"></span>{{ m.player?.name || '未知' }}
                </div>
                <div v-if="!team.members || team.members.length === 0" class="no-members">暂无成员</div>
              </div>
              <template v-if="submitted">
                <t-tag v-if="myPreference && myPreference.teamId === team.id" theme="success" variant="light">已选</t-tag>
                <t-tag v-else theme="default" variant="light">已提交</t-tag>
              </template>
              <t-button
                v-else
                theme="primary"
                size="small"
                :disabled="!isTeamReleased || !team.captainId"
                :loading="submittingPreference"
                @click="handleSubmitPreference(team.captainId)"
              >
                {{ team.captainId ? `选择队长` : '暂无队长' }}
              </t-button>
            </div>
          </div>
          <div v-if="teams.length === 0" class="empty-tip">暂无队伍</div>
        </template>
      </template>
    </StageStatusView>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useAuthStore } from '../../stores/authStore'
import { useTeamStore } from '../../stores/teamStore'
import { usePlayerStore } from '../../stores/playerStore'
import { getConcurrentReleaseStatus, submitCaptainPreference, getMyCaptainPreference } from '../../services/api'
import type { ConcurrentReleaseStatusResponse } from '../../types/season'
import StageStatusView from '../../components/StageStatusView.vue'

const route = useRoute()
const teamStore = useTeamStore()
const playerStore = usePlayerStore()
const authStore = useAuthStore()

const currentRound = computed(() => parseInt(route.params.round as string) || 1)

const releaseStatus = ref<ConcurrentReleaseStatusResponse | null>(null)
const isTeamReleased = computed(() => !!releaseStatus.value?.teamReleased)
const myPreference = ref<{ preferredCaptainId: string | null; preferredCaptainName: string | null; teamId: string | null } | null>(null)
const submittingPreference = ref(false)
let releaseTimer: number | undefined

// 队伍列表（从接口加载）
const teams = computed(() => teamStore.teams)

// 当前用户是否为队长（队长不选意向，只查看分组情况）
const isCurrentUserCaptain = computed(() => {
  const uid = authStore.currentUser?.id
  if (!uid) return false
  return teamStore.teams.some(t => t.captainId === uid)
})

// 当前用户自己的队伍（队长用）
const myTeam = computed(() => {
  const uid = authStore.currentUser?.id
  if (!uid) return null
  return teamStore.teams.find(t => t.captainId === uid) || null
})

// 是否已提交（提交后锁定，不可修改）
const submitted = computed(() => !!myPreference.value?.preferredCaptainId)

function getCaptainName(team: any): string | null {
  if (!team.captainId) return null
  const captain = playerStore.users.find(u => u.id === team.captainId)
  return captain?.name || null
}

function getAvatarIcon(name?: string): string {
  const icons = ['🌟', '🎤', '💃', '✨', '🎵', '🎭', '🎨', '🎪']
  if (!name) return '🎤'
  return icons[name.charCodeAt(0) % icons.length]
}

async function loadReleaseStatus() {
  try {
    releaseStatus.value = await getConcurrentReleaseStatus(`round-${currentRound.value}`)
  } catch (e) {
    releaseStatus.value = null
  }
}

async function loadMyPreference() {
  try {
    myPreference.value = await getMyCaptainPreference(`round-${currentRound.value}`)
  } catch (e) {
    myPreference.value = null
  }
}

async function loadAll() {
  await teamStore.fetchTeams(`round-${currentRound.value}`)
  await loadMyPreference()
}

async function handleSubmitPreference(captainId: string | null) {
  if (submittingPreference.value || !captainId) return
  submittingPreference.value = true
  try {
    await submitCaptainPreference(`round-${currentRound.value}`, captainId)
    MessagePlugin.success('意向已提交')
    await loadMyPreference()
  } catch (e: any) {
    MessagePlugin.error(e.message || '提交失败')
  } finally {
    submittingPreference.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    playerStore.fetchUsers({ pageSize: 1000 }),
    loadReleaseStatus()
  ])
  await loadAll()
  releaseTimer = window.setInterval(loadReleaseStatus, 8000)
})

onBeforeUnmount(() => {
  if (releaseTimer) window.clearInterval(releaseTimer)
})
</script>

<style scoped lang="scss">
.player-captain-choice {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.team-header {
  margin-bottom: 24px;
  h1 { font-size: 24px; font-weight: 700; margin: 0 0 8px; color: var(--text-primary); }
  .subtitle { color: var(--text-tertiary); font-size: 14px; margin: 0; }
}

.release-locked-banner {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; margin-bottom: 20px;
  background: rgba(255, 215, 0, 0.08);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 12px;
  .lock-icon { font-size: 24px; }
  .lock-text { flex: 1; }
  .lock-title { font-size: 14px; font-weight: 600; color: #ffd700; }
  .lock-desc { font-size: 12px; color: var(--text-tertiary); }
}

.section-title-bar {
  display: flex; align-items: center; gap: 8px;
  font-size: 16px; font-weight: 600; margin-bottom: 16px;
  .section-icon { font-size: 20px; }
  .sub-count { font-size: 13px; color: var(--text-tertiary); }
}

.section-card {
  background: var(--hover-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.submitted-card {
  border-color: rgba(43, 164, 113, 0.4);
  background: rgba(43, 164, 113, 0.05);

  .submitted-hint {
    font-size: 12px;
    color: var(--text-tertiary);
    margin: 8px 0 0;
  }
}

.teams-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-bottom: 20px;

  @media (min-width: 480px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (min-width: 768px) {
    grid-template-columns: repeat(3, 1fr);
  }
}

// 队长视角
.my-team-card {
  border-color: rgba(102, 126, 234, 0.4);

  .my-team-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    .my-team-name {
      font-size: 17px;
      font-weight: 700;
    }

    .my-team-count {
      font-size: 13px;
      color: var(--text-tertiary);
    }
  }

  .captain-hint {
    margin: 12px 0 0;
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

.team-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: var(--hover-bg);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  transition: all 0.2s;

  &.view-only {
    cursor: default;
  }

  .captain-badge {
    margin-left: 4px;
    font-size: 12px;
  }

  &.selected {
    border-color: #2ba471;
    background: rgba(43, 164, 113, 0.08);
  }

  &.disabled {
    opacity: 0.75;
  }

  .team-header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .team-name { font-size: 16px; font-weight: 700; color: var(--text-primary); }
    .team-count { font-size: 12px; color: var(--text-tertiary); }
  }

  .team-captain {
    font-size: 13px;
    color: var(--text-secondary);

    strong { color: #f39c12; }
  }

  .team-members {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    .team-member {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      background: var(--bg-primary);
      border-radius: 10px;
      font-size: 12px;

      .member-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #667eea;
      }
    }

    .no-members { color: var(--text-tertiary); font-size: 12px; }
  }
}

.empty-tip {
  padding: 32px;
  text-align: center;
  color: var(--text-tertiary);
}
</style>
