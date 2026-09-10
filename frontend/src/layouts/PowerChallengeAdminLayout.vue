<template>
  <div class="pc-admin-layout">
    <header class="pc-admin-header">
      <div class="header-content">
        <div class="logo-section">
          <span class="logo-icon">💪</span>
          <span class="logo-text">实力大挑战 · 管理端</span>
        </div>
        <div class="header-info">
          <span class="user-name">{{ currentUser?.name }}</span>
          <button class="bb-btn bb-btn-sm" @click="handleLogout">退出</button>
        </div>
      </div>
    </header>
    <div class="pc-admin-body">
      <aside class="pc-admin-sidebar">
        <router-link to="/games/powerchallenge/admin/dashboard" class="nav-item" :class="{ active: isActive('/games/powerchallenge/admin/dashboard') }">📊 控制台</router-link>
        <router-link to="/games/powerchallenge/admin/live" class="nav-item" :class="{ active: isActive('/games/powerchallenge/admin/live') }">🎮 比赛控制台</router-link>
        <router-link to="/games/powerchallenge/admin/players" class="nav-item" :class="{ active: isActive('/games/powerchallenge/admin/players') }">👥 玩家管理</router-link>
        <router-link to="/games/powerchallenge/admin/question-pools" class="nav-item" :class="{ active: isActive('/games/powerchallenge/admin/question-pools') }">💪 题目池</router-link>
      </aside>
      <main class="pc-admin-main"><router-view /></main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { usePcAuthStore } from '../stores/pcAuthStore'

const router = useRouter()
const route = useRoute()
const authStore = usePcAuthStore()
const currentUser = computed(() => authStore.currentUser)

function handleLogout() {
  authStore.logout()
  router.push('/games/powerchallenge/login')
}

function isActive(path: string): boolean {
  return route.path === path
}
</script>

<style scoped>
.pc-admin-layout { min-height: 100vh; background: #0a0a1a; color: #e0e0e0; }
.pc-admin-header { background: #141430; border-bottom: 2px solid #ffaa0044; padding: 12px 24px; position: sticky; top: 0; z-index: 100; }
.header-content { display: flex; align-items: center; justify-content: space-between; max-width: 1200px; margin: 0 auto; }
.logo-section { display: flex; align-items: center; gap: 10px; }
.logo-icon { font-size: 28px; }
.logo-text { font-size: 20px; font-weight: 700; color: #ffaa00; }
.header-info { display: flex; align-items: center; gap: 16px; }
.user-name { color: #ccc; font-size: 14px; }
.pc-admin-body { display: flex; }
.pc-admin-sidebar { width: 220px; background: #141430; min-height: calc(100vh - 56px); padding: 16px; border-right: 1px solid #ffffff12; }
.nav-item { display: block; padding: 10px 16px; color: #aaa; text-decoration: none; border-radius: 8px; margin-bottom: 4px; font-size: 14px; }
.nav-item:hover { background: #ffffff08; color: #e0e0e0; }
.nav-item.active { background: #ffaa0022; color: #ffaa00; font-weight: 600; }
.pc-admin-main { flex: 1; padding: 24px; }
</style>
