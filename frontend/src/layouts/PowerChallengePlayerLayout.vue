<template>
  <div class="pc-player-layout">
    <header class="pc-header">
      <div class="header-content">
        <div class="logo-section">
          <span class="logo-icon">💪</span>
          <span class="logo-text">实力大挑战</span>
        </div>
        <div class="header-info">
          <span class="stage-tag">{{ seasonStore.roundPhase === 'answering' || seasonStore.roundPhase === 'countdown' ? '比赛中' : seasonStore.status === 'finished' ? '已结束' : '等待开始' }}</span>
          <span class="user-name">{{ currentUser?.name }}</span>
          <button class="bb-btn bb-btn-sm" @click="handleLogout">退出</button>
        </div>
      </div>
    </header>
    <div class="pc-main"><router-view /></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePcAuthStore } from '../stores/pcAuthStore'
import { usePcSeasonStore } from '../stores/pcSeasonStore'

const router = useRouter()
const authStore = usePcAuthStore()
const seasonStore = usePcSeasonStore()
const currentUser = computed(() => authStore.currentUser)

function handleLogout() {
  authStore.logout()
  router.push('/games/powerchallenge/login')
}

onMounted(() => { seasonStore.fetchSeason() })
</script>

<style scoped>
.pc-player-layout { min-height: 100vh; background: #0a0a1a; color: #e0e0e0; }
.pc-header { background: #141430; border-bottom: 2px solid #00ff8844; padding: 12px 24px; position: sticky; top: 0; z-index: 100; }
.header-content { display: flex; align-items: center; justify-content: space-between; max-width: 1200px; margin: 0 auto; }
.logo-section { display: flex; align-items: center; gap: 10px; }
.logo-icon { font-size: 28px; }
.logo-text { font-size: 20px; font-weight: 700; color: #00ff88; }
.header-info { display: flex; align-items: center; gap: 16px; }
.stage-tag { background: #00ff8822; color: #00ff88; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; }
.user-name { color: #ccc; font-size: 14px; }
.pc-main { padding: 24px; max-width: 1200px; margin: 0 auto; }
</style>
