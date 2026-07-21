<template>
  <div class="player-info-card">
    <div class="card-header">
      <div class="avatar-section">
        <div class="avatar">
          <span class="avatar-icon">{{ avatarIcon }}</span>
        </div>
        <div class="basic-info">
          <h3 class="player-name">{{ name }}</h3>
          <span class="player-role" :class="role">{{ roleText }}</span>
        </div>
      </div>
      <div class="status-badge" :class="statusClass">
        {{ statusText }}
      </div>
    </div>
    
    <div class="card-body">
      <div class="team-info" v-if="teamName">
        <span class="team-label">所属队伍</span>
        <span class="team-name">{{ teamName }}</span>
      </div>
      
      <div class="stats-row">
        <div class="stat-item">
          <span class="stat-icon">🎤</span>
          <span class="stat-value">{{ vocal }}</span>
          <span class="stat-label">Vocal</span>
        </div>
        <div class="stat-item">
          <span class="stat-icon">💃</span>
          <span class="stat-value">{{ dance }}</span>
          <span class="stat-label">Dance</span>
        </div>
        <div class="stat-item">
          <span class="stat-icon">✨</span>
          <span class="stat-value">{{ charm }}</span>
          <span class="stat-label">Charm</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  name: string
  role: 'player' | 'captain' | 'admin'
  status: 'active' | 'danger' | 'eliminated'
  teamName?: string
  vocal: number
  dance: number
  charm: number
}>()

const avatarIcon = computed(() => {
  const icons = ['🌟', '🎤', '💃', '✨', '🎵', '🎭']
  const index = props.name.charCodeAt(0) % icons.length
  return icons[index]
})

const roleText = computed(() => {
  switch (props.role) {
    case 'captain': return '队长'
    case 'player': return '队员'
    case 'admin': return '管理员'
    default: return '队员'
  }
})

const statusText = computed(() => {
  switch (props.status) {
    case 'active': return '安全'
    case 'danger': return '危险'
    case 'eliminated': return '已淘汰'
    default: return '未知'
  }
})

const statusClass = computed(() => props.status)
</script>

<style lang="scss" scoped>
.player-info-card {
  background: linear-gradient(135deg, rgba(75, 0, 130, 0.3), rgba(0, 191, 255, 0.3));
  border-radius: 16px;
  padding: 24px;
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-color);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.avatar-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffd700, #ff6b6b);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(255, 215, 0, 0.3);
}

.avatar-icon {
  font-size: 32px;
}

.basic-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.player-name {
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.player-role {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  
  &.captain {
    background: linear-gradient(135deg, #ffd700, #ff6b6b);
    color: #2c3e50;
  }
  
  &.player {
    background: var(--hover-bg);
    color: var(--text-primary);
  }
  
  &.admin {
    background: #3498db;
    color: var(--text-primary);
  }
}

.status-badge {
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  
  &.active {
    background: linear-gradient(135deg, #27ae60, #2ecc71);
    color: var(--text-primary);
  }
  
  &.danger {
    background: linear-gradient(135deg, #f39c12, #e67e22);
    color: var(--text-primary);
  }
  
  &.eliminated {
    background: linear-gradient(135deg, #e74c3c, #c0392b);
    color: var(--text-primary);
  }
}

.card-body {
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.team-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  
  .team-label {
    color: var(--text-tertiary);
    font-size: 14px;
  }
  
  .team-name {
    color: var(--text-primary);
    font-weight: 600;
    font-size: 14px;
  }
}

.stats-row {
  display: flex;
  justify-content: space-around;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-icon {
  font-size: 20px;
}

.stat-value {
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 700;
}

.stat-label {
  color: var(--text-tertiary);
  font-size: 12px;
}
</style>