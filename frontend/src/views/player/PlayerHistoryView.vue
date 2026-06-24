<template>
  <div class="player-history">
    <div class="history-header">
      <h1>我的记录</h1>
      <p class="subtitle">查看你的所有操作记录</p>
    </div>
    
    <t-card v-if="userLogs.length > 0" theme="dark" class="history-card">
      <t-timeline mode="alternate" theme="dark" class="custom-timeline">
        <t-timeline-item 
          v-for="log in userLogs" 
          :key="log.id" 
          :dot-color="getActionColor(log.actionType)"
        >
          <template #label>
            <span class="action-time">{{ log.createdAt }}</span>
          </template>
          <div class="timeline-content" :class="getActionClass(log.actionType)">
            <div class="content-header">
              <span class="action-icon">{{ getActionIcon(log.actionType) }}</span>
              <t-tag :theme="getActionTagTheme(log.actionType)" variant="light" size="small">
                {{ getActionText(log.actionType) }}
              </t-tag>
            </div>
            <p class="content-detail">{{ log.detail }}</p>
          </div>
        </t-timeline-item>
      </t-timeline>
    </t-card>
    
    <t-card v-else theme="dark" class="no-history-card">
      <t-empty title="暂无操作记录" description="完成各项任务后，记录将在这里显示">
        <template #icon>
          <span class="empty-icon">📜</span>
        </template>
      </t-empty>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAuthStore } from '../../stores/authStore'
import { useLogStore } from '../../stores/logStore'

const authStore = useAuthStore()
const logStore = useLogStore()

const currentUser = computed(() => authStore.currentUser)
const userLogs = computed(() => {
  if (!currentUser.value) return []
  return logStore.logs.filter(log => log.userId === currentUser.value?.id)
})

function getActionIcon(actionType: string): string {
  const icons: Record<string, string> = {
    login: '🔐',
    logout: '🚪',
    initial_luck: '🎲',
    apply_team: '📝',
    invite_player: '📩',
    accept_invite: '✓',
    reject_invite: '✗',
    lock_team: '🔒',
    select_song: '🎵',
    training_draw: '🎴',
    rehearsal: '🎭',
    performance_calculate: '🏆',
    elimination_generate: '❌',
    stage_change: '📅'
  }
  return icons[actionType] || '📋'
}

function getActionText(actionType: string): string {
  const texts: Record<string, string> = {
    login: '登录系统',
    logout: '退出登录',
    initial_luck: '初始命运',
    apply_team: '申请入队',
    invite_player: '邀请队员',
    accept_invite: '接受邀请',
    reject_invite: '拒绝邀请',
    lock_team: '锁定队伍',
    select_song: '选择歌曲',
    training_draw: '训练翻牌',
    rehearsal: '彩排',
    performance_calculate: '公演结算',
    elimination_generate: '淘汰结果',
    stage_change: '阶段变更'
  }
  return texts[actionType] || '未知操作'
}

function getActionClass(actionType: string): string {
  const classes: Record<string, string> = {
    login: 'success',
    logout: 'info',
    initial_luck: 'warning',
    apply_team: 'info',
    invite_player: 'info',
    accept_invite: 'success',
    reject_invite: 'danger',
    lock_team: 'warning',
    select_song: 'info',
    training_draw: 'success',
    rehearsal: 'success',
    performance_calculate: 'success',
    elimination_generate: 'danger',
    stage_change: 'warning'
  }
  return classes[actionType] || 'info'
}

function getActionColor(actionType: string): string {
  const colors: Record<string, string> = {
    success: '#2ecc71',
    danger: '#e74c3c',
    warning: '#f39c12',
    info: '#3498db'
  }
  return colors[getActionClass(actionType)] || colors.info
}

function getActionTagTheme(actionType: string): 'success' | 'danger' | 'warning' | 'primary' | 'default' | 'info' {
  const themes: Record<string, 'success' | 'danger' | 'warning' | 'primary' | 'default' | 'info'> = {
    login: 'success',
    logout: 'info',
    initial_luck: 'warning',
    apply_team: 'info',
    invite_player: 'info',
    accept_invite: 'success',
    reject_invite: 'danger',
    lock_team: 'warning',
    select_song: 'primary',
    training_draw: 'success',
    rehearsal: 'success',
    performance_calculate: 'success',
    elimination_generate: 'danger',
    stage_change: 'warning'
  }
  return themes[actionType] || 'info'
}

onMounted(async () => {
  await logStore.fetchLogs()
})
</script>

<style lang="scss" scoped>
.player-history {
  color: #fff;
  min-height: 100vh;
  padding: 20px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

@media (max-width: 768px) {
  .player-history {
    min-height: calc(100vh - 56px);
    padding: 16px;
    padding-bottom: 72px;
  }
}

@media (max-width: 480px) {
  .player-history {
    min-height: calc(100vh - 48px);
    padding: 12px;
    padding-bottom: 66px;
  }
}

.history-header {
  margin-bottom: 24px;
  
  h1 {
    font-size: 28px;
    font-weight: 700;
    margin: 0 0 8px 0;
    background: linear-gradient(135deg, #3498db, #2980b9);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  
  .subtitle {
    color: rgba(255, 255, 255, 0.6);
    margin: 0;
    font-size: 14px;
  }
}

:deep(.t-card) {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  
  .t-card__body {
    padding: 24px;
  }
}

.custom-timeline {
  :deep(.t-timeline-item) {
    padding-bottom: 24px;
    
    &:last-child {
      padding-bottom: 0;
    }
  }
  
  :deep(.t-timeline-item__label) {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }
  
  :deep(.t-timeline-item__dot) {
    background: transparent;
    border: none;
    
    .t-icon {
      font-size: 20px;
    }
  }
  
  :deep(.t-timeline-item__content) {
    color: #fff;
  }
}

.timeline-content {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
  border-left: 3px solid #667eea;
  
  &.success {
    border-left-color: #2ecc71;
  }
  
  &.danger {
    border-left-color: #e74c3c;
  }
  
  &.warning {
    border-left-color: #f39c12;
  }
  
  &.info {
    border-left-color: #3498db;
  }
}

.content-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.action-icon {
  font-size: 20px;
}

.action-time {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.content-detail {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.no-history-card {
  max-width: 600px;
  margin: 0 auto;
}

.empty-icon {
  font-size: 64px;
}

:deep(.t-empty) {
  .t-empty__description {
    color: rgba(255, 255, 255, 0.6);
  }
}

@media (max-width: 768px) {
  :deep(.t-card__body) {
    padding: 16px;
  }
  
  :deep(.custom-timeline) {
    .t-timeline-item {
      padding-bottom: 16px;
    }
    
    .t-timeline-item__dot {
      display: none;
    }
  }
  
  .timeline-content {
    padding: 12px;
  }
  
  .content-header {
    gap: 8px;
  }

  .history-header {
    margin-bottom: 16px;
    h1 { font-size: 22px; }
    .subtitle { font-size: 13px; }
  }
}

@media (max-width: 480px) {
  .history-header {
    h1 { font-size: 18px; }
    .subtitle { font-size: 12px; }
  }

  .timeline-content {
    padding: 10px;
  }

  .content-detail {
    font-size: 13px;
  }
}
</style>
