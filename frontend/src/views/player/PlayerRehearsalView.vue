<template>
  <StageStatusView :round="currentRound" stage="rehearsal">
    <template #current>
      <div class="player-rehearsal">
        <div class="rehearsal-header">
          <h1>彩排中心</h1>
          <p class="subtitle">查看彩排结果和对公演的影响</p>
        </div>
        
        <t-card v-if="currentTeam" theme="poster" class="team-card">
      <div class="team-header">
        <span class="team-icon">👥</span>
        <span class="team-name">{{ currentTeam.name }}</span>
      </div>
    </t-card>
    
    <t-card v-if="rehearsalResult" theme="poster" class="result-card">
      <div class="result-icon">🎭</div>
      <h2 class="result-title">{{ rehearsalResult.eventName }}</h2>
      <p class="result-desc">{{ rehearsalResult.description }}</p>
      
      <div class="effect-section">
        <span class="effect-label">对公演的影响：</span>
        <div class="effects">
          <t-tag v-if="rehearsalResult.bonus.vocal" :theme="rehearsalResult.bonus.vocal > 0 ? 'success' : 'danger'" variant="light">
            🎤 {{ rehearsalResult.bonus.vocal > 0 ? '+' : '' }}{{ rehearsalResult.bonus.vocal }}
          </t-tag>
          <t-tag v-if="rehearsalResult.bonus.dance" :theme="rehearsalResult.bonus.dance > 0 ? 'success' : 'danger'" variant="light">
            💃 {{ rehearsalResult.bonus.dance > 0 ? '+' : '' }}{{ rehearsalResult.bonus.dance }}
          </t-tag>
          <t-tag v-if="rehearsalResult.bonus.charm" :theme="rehearsalResult.bonus.charm > 0 ? 'success' : 'danger'" variant="light">
            ✨ {{ rehearsalResult.bonus.charm > 0 ? '+' : '' }}{{ rehearsalResult.bonus.charm }}
          </t-tag>
        </div>
      </div>
      
      <div class="result-time">
        <span class="time-label">彩排时间：</span>
        <span class="time-value">{{ rehearsalResult.createdAt }}</span>
      </div>
    </t-card>
    
    <div v-else class="no-rehearsal">
      <t-empty description="彩排尚未开始">
        <template #image>
          <t-icon name="info-circle" style="font-size: 48px; color: var(--text-primary)" />
        </template>
      </t-empty>
      <p class="empty-desc">{{ isCaptain ? '作为队长，你可以开启彩排' : '请等待队长开启彩排' }}</p>
      <t-button
        v-if="isCaptain"
        theme="warning"
        variant="base"
        class="rehearsal-btn"
        @click="handleStartRehearsal"
      >
        🎭 开始彩排
      </t-button>
    </div>
    
    <div v-if="allTeams.length > 0" class="all-teams-section">
      <div class="section-title-bar">
        <span class="section-icon">👥</span>
        <span>各队彩排状态</span>
      </div>
      <div class="teams-grid">
        <div v-for="team in allTeams" :key="team.id" class="team-rehearsal-card" :class="{ 'is-my-team': team.id === currentTeam?.id }">
          <div class="team-rehearsal-header">
            <span class="team-rehearsal-name">{{ team.name }}</span>
            <t-tag v-if="team.id === currentTeam?.id" theme="primary" variant="light" size="small">我的队伍</t-tag>
          </div>
          <div v-if="getTeamRehearsal(team.id)" class="rehearsal-brief">
            <span class="rehearsal-event-name">{{ getTeamRehearsal(team.id)?.eventName }}</span>
            <div class="rehearsal-effects">
              <span v-if="getTeamRehearsal(team.id)?.bonus.vocal" class="mini-effect" :class="getBonusClass(team.id, 'vocal')">
                🎤{{ getBonusText(team.id, 'vocal') }}
              </span>
              <span v-if="getTeamRehearsal(team.id)?.bonus.dance" class="mini-effect" :class="getBonusClass(team.id, 'dance')">
                💃{{ getBonusText(team.id, 'dance') }}
              </span>
              <span v-if="getTeamRehearsal(team.id)?.bonus.charm" class="mini-effect" :class="getBonusClass(team.id, 'charm')">
                ✨{{ getBonusText(team.id, 'charm') }}
              </span>
            </div>
          </div>
          <div v-else class="no-rehearsal-brief">
            <span>尚未彩排</span>
          </div>
        </div>
      </div>
    </div>

    <t-card theme="poster" class="tips-card">
      <template #header>
        <h3 class="tips-title">彩排说明</h3>
      </template>
      <ul class="tips-list">
        <li>🎯 彩排会随机产生一个事件</li>
        <li>📈 彩排效果会影响公演最终得分</li>
        <li>🎲 事件可能是正面或负面的</li>
        <li>⏰ 只有队长可以开启彩排</li>
      </ul>
    </t-card>
  </div>
  </template>

  <template #completed>
  <!-- 已完成阶段：显示彩排结果列表 -->
  <div class="result-section">
    <div class="section-title-bar">
      <span class="title-icon">📋</span>
      <span>彩排结果</span>
    </div>

    <t-card v-if="rehearsalResult" theme="poster" class="result-card">
      <div class="result-icon">🎭</div>
      <h2 class="result-title">{{ rehearsalResult.eventName }}</h2>
      <p class="result-desc">{{ rehearsalResult.description }}</p>
      
      <div class="effect-section">
        <span class="effect-label">对公演的影响：</span>
        <div class="effects">
          <t-tag v-if="rehearsalResult.bonus.vocal" :theme="rehearsalResult.bonus.vocal > 0 ? 'success' : 'danger'" variant="light">
            🎤 {{ rehearsalResult.bonus.vocal > 0 ? '+' : '' }}{{ rehearsalResult.bonus.vocal }}
          </t-tag>
          <t-tag v-if="rehearsalResult.bonus.dance" :theme="rehearsalResult.bonus.dance > 0 ? 'success' : 'danger'" variant="light">
            💃 {{ rehearsalResult.bonus.dance > 0 ? '+' : '' }}{{ rehearsalResult.bonus.dance }}
          </t-tag>
          <t-tag v-if="rehearsalResult.bonus.charm" :theme="rehearsalResult.bonus.charm > 0 ? 'success' : 'danger'" variant="light">
            ✨ {{ rehearsalResult.bonus.charm > 0 ? '+' : '' }}{{ rehearsalResult.bonus.charm }}
          </t-tag>
        </div>
      </div>
      
      <div class="result-time">
        <span class="time-label">彩排时间：</span>
        <span class="time-value">{{ rehearsalResult.createdAt }}</span>
      </div>
    </t-card>

    <div v-if="allTeams.length > 0" class="all-teams-section">
      <div class="section-title-bar">
        <span class="section-icon">👥</span>
        <span>各队彩排状态</span>
      </div>
      <div class="teams-grid">
        <div v-for="team in allTeams" :key="team.id" class="team-rehearsal-card" :class="{ 'is-my-team': team.id === currentTeam?.id }">
          <div class="team-rehearsal-header">
            <span class="team-rehearsal-name">{{ team.name }}</span>
            <t-tag v-if="team.id === currentTeam?.id" theme="primary" variant="light" size="small">我的队伍</t-tag>
          </div>
          <div v-if="getTeamRehearsal(team.id)" class="rehearsal-brief">
            <span class="rehearsal-event-name">{{ getTeamRehearsal(team.id)?.eventName }}</span>
            <div class="rehearsal-effects">
              <span v-if="getTeamRehearsal(team.id)?.bonus.vocal" class="mini-effect" :class="getBonusClass(team.id, 'vocal')">
                🎤{{ getBonusText(team.id, 'vocal') }}
              </span>
              <span v-if="getTeamRehearsal(team.id)?.bonus.dance" class="mini-effect" :class="getBonusClass(team.id, 'dance')">
                💃{{ getBonusText(team.id, 'dance') }}
              </span>
              <span v-if="getTeamRehearsal(team.id)?.bonus.charm" class="mini-effect" :class="getBonusClass(team.id, 'charm')">
                ✨{{ getBonusText(team.id, 'charm') }}
              </span>
            </div>
          </div>
          <div v-else class="no-rehearsal-brief">
            <span>尚未彩排</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  </template>
</StageStatusView>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/authStore'
import { useTeamStore } from '../../stores/teamStore'
import { usePerformanceStore } from '../../stores/performanceStore'
import StageStatusView from '../../components/StageStatusView.vue'

const route = useRoute()
const authStore = useAuthStore()
const teamStore = useTeamStore()
const performanceStore = usePerformanceStore()

const currentRound = computed(() => Number(route.params.round))

const currentUser = computed(() => authStore.currentUser)
const isCaptain = computed(() => authStore.isCaptain)
const currentTeam = computed(() => teamStore.getTeamById(currentUser.value?.teamId || ''))
const allTeams = computed(() => teamStore.teams)
const rehearsalResult = computed(() => currentTeam.value ? performanceStore.getTeamRehearsal(currentTeam.value.id) : null)

function getTeamRehearsal(teamId: string) {
  return performanceStore.getTeamRehearsal(teamId)
}

function getBonusClass(teamId: string, type: 'vocal' | 'dance' | 'charm'): string {
  const rehearsal = getTeamRehearsal(teamId)
  if (!rehearsal) return ''
  const value = rehearsal.bonus[type] || 0
  return value > 0 ? 'positive' : 'negative'
}

function getBonusText(teamId: string, type: 'vocal' | 'dance' | 'charm'): string {
  const rehearsal = getTeamRehearsal(teamId)
  if (!rehearsal) return ''
  const value = rehearsal.bonus[type] || 0
  return value > 0 ? `+${value}` : `${value}`
}

async function handleStartRehearsal() {
  if (!currentTeam.value) return
  await performanceStore.start(currentTeam.value.id)
}

onMounted(async () => {
  await teamStore.fetchTeams()
  await performanceStore.fetchRehearsals()
})
</script>

<style lang="scss" scoped>
.player-rehearsal {
color: var(--text-primary);
}

.rehearsal-header {
  margin-bottom: 24px;
  
  h1 {
    font-size: 28px;
    font-weight: 700;
    margin: 0 0 8px 0;
  }
  
  .subtitle {
    color: var(--text-tertiary);
    margin: 0;
    font-size: 14px;
  }
}

.team-card {
  margin-bottom: 24px;
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid var(--border-color);
}

.team-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.team-icon {
  font-size: 28px;
}

.team-name {
  font-size: 18px;
  font-weight: 700;
}

.result-card {
  margin-bottom: 24px;
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid var(--border-color);
  text-align: center;
}

.result-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.result-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 8px 0;
}

.result-desc {
  color: var(--text-secondary);
  font-size: 15px;
  margin: 0 0 20px 0;
}

.effect-section {
  margin-bottom: 20px;
}

.effect-label {
  display: block;
  color: var(--text-tertiary);
  font-size: 13px;
  margin-bottom: 12px;
}

.effects {
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}

.result-time {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.time-label {
  color: var(--text-tertiary);
  font-size: 13px;
}

.time-value {
  color: var(--text-secondary);
  font-size: 13px;
}

.no-rehearsal {
  margin-bottom: 24px;
  padding: 24px;
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;

  :deep(.t-empty__description) {
    color: var(--text-primary);
    font-size: 16px;
  }
}

.empty-desc {
  color: var(--text-tertiary);
  margin: 0;
}

.tips-card {
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid var(--border-color);
}

.tips-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.tips-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.tips-list li {
  color: var(--text-secondary);
  font-size: 14px;
}

.rehearsal-btn {
  background: linear-gradient(135deg, #fdcb6e, #f39c12) !important;
  border: none !important;
  color: #fff !important;
}

.all-teams-section {
  margin-bottom: 24px;
}

.section-title-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--hover-bg);
  border-radius: 10px;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;

  .section-icon {
    font-size: 18px;
  }
}

.teams-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}

.team-rehearsal-card {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--border-color);
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(255, 255, 255, 0.12);
  }

  &.is-my-team {
    border-color: rgba(78, 205, 196, 0.3);
    background: linear-gradient(135deg, rgba(78, 205, 196, 0.05), rgba(68, 160, 141, 0.03));
  }
}

.team-rehearsal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;

  .team-rehearsal-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.rehearsal-brief {
  .rehearsal-event-name {
    display: block;
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 8px;
  }

  .rehearsal-effects {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .mini-effect {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;

    &.positive {
      background: rgba(46, 204, 113, 0.15);
      color: #2ecc71;
    }

    &.negative {
      background: rgba(231, 76, 60, 0.15);
      color: #e74c3c;
    }
  }
}

.no-rehearsal-brief {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}
</style>
