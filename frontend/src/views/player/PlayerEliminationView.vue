<template>
  <div class="elimination-page">
    <!-- 晋级恭喜 -->
    <div class="congrats-section">
      <div class="congrats-glow"></div>
      <div class="congrats-icon">🏆</div>
      <h1>恭喜！你成功晋级</h1>
      <p class="congrats-text">你的表现出色，成功晋级下一轮！</p>
    </div>

    <!-- 淘汰名单 -->
    <div class="eliminated-section">
      <div class="section-header">
        <span class="section-badge">❌</span>
        <h2>淘汰名单</h2>
        <span class="section-count">{{ eliminatedPlayers.length }}人</span>
      </div>

      <div v-if="eliminatedPlayers.length === 0" class="empty-state">
        <span class="empty-icon">🎉</span>
        <span class="empty-text">本轮无人淘汰</span>
      </div>

      <div v-else class="eliminated-list">
        <div v-for="player in eliminatedPlayers" :key="player.id" class="eliminated-item">
          <div class="player-avatar">{{ getAvatar(player.name) }}</div>
          <div class="player-info">
            <span class="player-name">{{ player.name }}</span>
            <span class="player-team">{{ getTeamName(player.teamId) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { usePlayerStore } from '../../stores/playerStore'
import { useTeamStore } from '../../stores/teamStore'

const route = useRoute()
const playerStore = usePlayerStore()
const teamStore = useTeamStore()

const currentRound = computed(() => Number(route.params.round) || 1)

const eliminatedPlayers = computed(() => {
  return playerStore.users.filter(u => u.status === 'eliminated')
})

function getAvatar(name?: string): string {
  const icons = ['🌟', '🎤', '💃', '✨', '🎵', '🎭']
  if (!name) return '🎤'
  return icons[name.charCodeAt(0) % icons.length]
}

function getTeamName(teamId?: string): string {
  if (!teamId) return '未组队'
  const team = teamStore.getTeamById(teamId)
  return team?.name || '未知队伍'
}

onMounted(async () => {
  await Promise.all([
    playerStore.fetchAllUsers(),
    teamStore.fetchTeams()
  ])
})
</script>

<style lang="scss" scoped>
.elimination-page {
  min-height: 100vh;
  padding: 24px 20px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #fff;
}

// ===== 晋级恭喜 =====
.congrats-section {
  text-align: center;
  position: relative;
  padding: 60px 20px 40px;
  margin-bottom: 28px;

  .congrats-glow {
    position: absolute;
    top: 20px; left: 50%;
    width: 220px; height: 220px;
    transform: translateX(-50%);
    background: radial-gradient(circle, rgba(255, 215, 0, 0.12) 0%, transparent 70%);
    border-radius: 50%;
    pointer-events: none;
  }

  .congrats-icon {
    font-size: 72px;
    margin-bottom: 16px;
    animation: float 3s ease-in-out infinite;
  }

  h1 {
    font-size: 28px;
    font-weight: 800;
    margin: 0 0 12px;
    background: linear-gradient(135deg, #ffd700, #ff6b6b);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .congrats-text {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.7);
    margin: 0;
    line-height: 1.6;
  }
}

// ===== 淘汰名单 =====
.eliminated-section {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 20px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;

  .section-badge {
    font-size: 20px;
  }

  h2 {
    font-size: 18px;
    font-weight: 700;
    margin: 0;
    flex: 1;
  }

  .section-count {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.4);
    background: rgba(231, 76, 60, 0.15);
    padding: 2px 10px;
    border-radius: 10px;
  }
}

.eliminated-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.eliminated-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: rgba(231, 76, 60, 0.08);
  border: 1px solid rgba(231, 76, 60, 0.2);
  border-radius: 12px;
  transition: background 0.2s;

  &:active {
    background: rgba(231, 76, 60, 0.15);
  }
}

.player-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.player-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;

  .player-name {
    font-size: 15px;
    font-weight: 600;
  }

  .player-team {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
  }
}

// ===== 空状态 =====
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 0;

  .empty-icon {
    font-size: 48px;
    opacity: 0.5;
  }

  .empty-text {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.4);
  }
}

// ===== 动画 =====
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

// ===== 移动端适配 =====
@media (max-width: 768px) {
  .congrats-section {
    padding: 40px 16px 32px;

    .congrats-icon { font-size: 56px; }
    h1 { font-size: 24px; }
    .congrats-text { font-size: 14px; }
  }

  .eliminated-section {
    padding: 16px;
  }
}
</style>
