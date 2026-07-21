<template>
  <div class="bb-profile">
    <div class="page-header">
      <h1>我的资料</h1>
    </div>

    <div class="profile-card">
      <div class="profile-avatar">{{ user?.name?.[0] || '?' }}</div>
      <div class="profile-info">
        <div class="profile-name">{{ user?.name }}</div>
        <div class="profile-code">登录码: {{ user?.loginCode }}</div>
        <div class="profile-status">
          <span class="status-tag" :class="user?.status">{{ statusText }}</span>
        </div>
      </div>
    </div>

    <div class="info-section">
      <h3>基本信息</h3>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">角色</span>
          <span class="info-value">{{ user?.role === 'admin' ? '管理员' : '房客' }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">状态</span>
          <span class="info-value">{{ statusText }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">登录码</span>
          <span class="info-value"><code>{{ user?.loginCode }}</code></span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useBbAuthStore } from '../../../stores/bbAuthStore'

const authStore = useBbAuthStore()
const user = computed(() => authStore.currentUser)

const statusText = computed(() => {
  const map: Record<string, string> = { active: '活跃', evicted: '已淘汰', jury: '陪审团' }
  return map[user.value?.status || ''] || user.value?.status || ''
})
</script>

<style scoped>
.bb-profile { max-width: 600px; margin: 0 auto; }
.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.profile-card { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #00ff8822; border-radius: 12px; padding: 24px; display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
.profile-avatar { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #00ff88, #00cc66); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; color: #1a1a3e; }
.profile-name { font-size: 20px; font-weight: 600; color: #fff; }
.profile-code { font-size: 13px; color: #888; margin-top: 4px; }
.profile-status { margin-top: 8px; }
.status-tag { padding: 2px 10px; border-radius: 10px; font-size: 12px; }
.status-tag.active { background: #00ff8822; color: #00ff88; }
.status-tag.evicted { background: #ff444422; color: #ff4444; }
.status-tag.jury { background: #ffaa0022; color: #ffaa00; }
.info-section { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; }
.info-section h3 { margin: 0 0 16px; font-size: 16px; color: #e0e0e0; }
.info-grid { display: flex; flex-direction: column; gap: 12px; }
.info-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #00ff8811; }
.info-item:last-child { border-bottom: none; }
.info-label { font-size: 14px; color: #888; }
.info-value { font-size: 14px; color: #e0e0e0; font-weight: 500; }
.info-value code { background: #00ff8815; color: #00ff88; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
</style>
