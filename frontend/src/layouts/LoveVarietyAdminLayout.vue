<template>
  <div class="lv-admin-layout">
    <header class="lv-header">
      <div class="header-content">
        <div class="logo-section">
          <span class="logo-icon">💕</span>
          <span class="logo-text">恋综 管理</span>
        </div>
        <div class="header-info">
          <span class="stage-tag">{{ stageDisplay }}</span>
          <span class="user-name">{{ authStore.currentUser?.name }}</span>
          <button class="lv-btn lv-btn-sm" @click="handleLogout">退出</button>
        </div>
        <button class="mobile-menu-btn" @click="mobileMenuOpen = !mobileMenuOpen">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>

    <div class="layout-body">
      <aside class="lv-sider" :class="{ open: mobileMenuOpen }">
        <nav class="sider-nav">
          <div class="nav-section">
            <div v-for="item in fixedItems" :key="item.path"
              class="nav-item" :class="{ active: $route.path === item.path }"
              @click="navigateTo(item.path)">
              <span class="nav-icon">{{ item.icon }}</span>
              <span class="nav-text">{{ item.text }}</span>
            </div>
          </div>

          <div class="nav-section">
            <div class="nav-section-title">赛程控制</div>
            <div v-for="item in stageItems" :key="item.path"
              class="nav-item" :class="{ active: $route.path.startsWith(item.path) }"
              @click="navigateTo(item.path)">
              <span class="nav-icon">{{ item.icon }}</span>
              <span class="nav-text">{{ item.text }}</span>
            </div>
          </div>

          <div v-for="round in rounds" :key="round" class="nav-section">
            <div class="nav-section-header" :class="{ current: round === seasonStore.currentRoundNumber }"
              @click="toggleRound(round)">
              <span class="collapse-icon" :class="{ collapsed: isRoundCollapsed(round) }">▾</span>
              <span class="section-title">第{{ round }}轮</span>
              <span class="section-status" :class="getRoundStatus(round)">{{ getRoundStatusText(round) }}</span>
            </div>
            <div v-show="!isRoundCollapsed(round)" class="round-stages">
              <div v-for="st in stageList" :key="st.key"
                class="nav-item sub-item"
                :class="{ active: isStageActive(round, st.key), disabled: !isStageClickable(round, st.key) }"
                @click="navigateToStage(round, st.key)">
                <span class="nav-icon">{{ st.icon }}</span>
                <span class="nav-text">{{ st.text }}</span>
                <span class="stage-status-dot" :class="getStageStatusClass(round, st.key)"></span>
              </div>
            </div>
          </div>
        </nav>
      </aside>

      <main class="lv-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useLvAuthStore } from '../stores/lovevarietyAuthStore'
import { useLvSeasonStore } from '../stores/lovevarietySeasonStore'
import { LV_STAGE_NAME, type LVStageType } from '../types/lovevariety'

const router = useRouter()
const route = useRoute()
const authStore = useLvAuthStore()
const seasonStore = useLvSeasonStore()

const mobileMenuOpen = ref(false)
const collapsedRounds = ref<Set<number>>(new Set())

function initCollapsed() {
  const current = seasonStore.currentRoundNumber
  const n = seasonStore.totalRounds
  for (let i = 1; i <= n; i++) {
    if (i !== current) {
      collapsedRounds.value.add(i)
    }
  }
}

const fixedItems = [
  { icon: '📊', text: '总览', path: '/games/lovevariety/admin/dashboard' },
  { icon: '👥', text: '选手管理', path: '/games/lovevariety/admin/players' },
]

const stageItems = [
  { icon: '🎯', text: '赛程矩阵', path: '/games/lovevariety/admin/stage' },
]

const stageList = [
  { key: 'love_vote' as LVStageType, icon: '💌', text: '喜爱值投送' },
  { key: 'pairing' as LVStageType, icon: '💑', text: '配对结算' },
  { key: 'elimination' as LVStageType, icon: '🚪', text: '淘汰' },
]

const rounds = computed(() => {
  const n = seasonStore.totalRounds
  return Array.from({ length: n }, (_, i) => i + 1)
})

const stageDisplay = computed(() => {
  return `第${seasonStore.currentRoundNumber}轮 · ${seasonStore.stageName}`
})

function toggleRound(round: number) {
  if (collapsedRounds.value.has(round)) {
    collapsedRounds.value.delete(round)
  } else {
    collapsedRounds.value.add(round)
  }
}

function isRoundCollapsed(round: number): boolean {
  return collapsedRounds.value.has(round)
}

function getRoundStatus(round: number): string {
  if (round < seasonStore.currentRoundNumber) return 'completed'
  if (round === seasonStore.currentRoundNumber) return 'current'
  return 'future'
}

function getRoundStatusText(round: number): string {
  if (round < seasonStore.currentRoundNumber) return '已完成'
  if (round === seasonStore.currentRoundNumber) return '进行中'
  return '未开始'
}

function isStageClickable(round: number, stage: LVStageType): boolean {
  return seasonStore.isStageAccessible(round, stage)
}

function isStageActive(round: number, stage: LVStageType): boolean {
  return seasonStore.isStageActive(round, stage)
}

function getStageStatusClass(round: number, stage: LVStageType): string {
  return seasonStore.getStageStatus(round, stage)
}

function navigateTo(path: string) {
  mobileMenuOpen.value = false
  router.push(path)
}

function navigateToStage(round: number, stage: LVStageType) {
  if (!isStageClickable(round, stage)) return
  mobileMenuOpen.value = false
  const stageRoutes: Record<string, string> = {
    love_vote: 'votes',
    pairing: 'pairing',
    elimination: 'elimination'
  }
  const routeName = stageRoutes[stage] || 'votes'
  router.push(`/games/lovevariety/admin/round/${round}/${routeName}`)
}

async function handleLogout() {
  await authStore.logout()
  router.push('/games/lovevariety/login')
}

onMounted(async () => {
  await seasonStore.fetchProgress()
  await seasonStore.fetchMenu()
  initCollapsed()
})
</script>

<style scoped>
.lv-admin-layout {
  min-height: 100vh;
  background: #0a0a1a;
  color: #e0e0e0;
  font-family: system-ui, sans-serif;
}
.lv-header {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 56px;
  background: linear-gradient(135deg, #2d1b4e 0%, #4a1a5e 100%);
  border-bottom: 1px solid #ff69b444;
  z-index: 100;
  display: flex;
  align-items: center;
}
.header-content {
  width: 100%;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.logo-section { display: flex; align-items: center; gap: 8px; }
.logo-icon { font-size: 22px; }
.logo-text {
  font-size: 16px; font-weight: 600;
  background: linear-gradient(90deg, #ff69b4, #ff1493);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.header-info { display: flex; align-items: center; gap: 12px; }
.stage-tag {
  background: #ff69b422; color: #ff69b4;
  padding: 4px 12px; border-radius: 12px;
  font-size: 12px; border: 1px solid #ff69b444;
}
.user-name { font-size: 14px; color: #aaa; }
.lv-btn {
  background: transparent; border: 1px solid #ff69b444; color: #ff69b4;
  padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s;
}
.lv-btn:hover { background: #ff69b422; }
.lv-btn-sm { padding: 6px 16px; font-size: 13px; }
.mobile-menu-btn {
  display: none; flex-direction: column; gap: 4px;
  background: none; border: none; cursor: pointer; padding: 4px;
}
.mobile-menu-btn span {
  width: 22px; height: 2px; background: #ff69b4; border-radius: 2px;
}
.layout-body { display: flex; padding-top: 56px; }
.lv-sider {
  width: 240px; min-height: calc(100vh - 56px);
  background: #1a0f2e; border-right: 1px solid #ff69b422;
  overflow-y: auto; transition: transform 0.3s;
}
.sider-nav { padding: 12px 0; }
.nav-section { margin-bottom: 8px; }
.nav-section-title {
  padding: 8px 16px 4px; font-size: 11px; color: #666;
  text-transform: uppercase; letter-spacing: 1px;
}
.nav-section-header {
  display: flex; align-items: center; padding: 8px 16px;
  cursor: pointer; font-size: 13px; color: #aaa; transition: all 0.2s;
}
.nav-section-header:hover { color: #ff69b4; }
.nav-section-header.current { color: #ff69b4; }
.collapse-icon { font-size: 10px; margin-right: 6px; transition: transform 0.2s; }
.collapse-icon.collapsed { transform: rotate(-90deg); }
.section-title { flex: 1; }
.section-status { font-size: 11px; }
.section-status.completed { color: #ff69b4; }
.section-status.current { color: #ffaa00; }
.section-status.future { color: #555; }
.nav-item {
  display: flex; align-items: center; padding: 10px 16px;
  cursor: pointer; font-size: 13px; color: #aaa;
  transition: all 0.2s; border-left: 3px solid transparent;
}
.nav-item:hover { background: #ff69b408; color: #e0e0e0; }
.nav-item.active { background: #ff69b415; color: #ff69b4; border-left-color: #ff69b4; }
.nav-item.disabled { opacity: 0.35; cursor: not-allowed; }
.nav-item.sub-item { padding-left: 32px; font-size: 12px; }
.nav-icon { margin-right: 8px; font-size: 14px; width: 20px; text-align: center; }
.nav-text { flex: 1; }
.stage-status-dot { width: 8px; height: 8px; border-radius: 50%; }
.stage-status-dot.completed { background: #ff69b4; }
.stage-status-dot.current { background: #ffaa00; animation: pulse 2s infinite; }
.stage-status-dot.future { background: #333; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.lv-main { flex: 1; padding: 24px; min-height: calc(100vh - 56px); overflow-y: auto; }
@media (max-width: 768px) {
  .mobile-menu-btn { display: flex; }
  .lv-sider { position: fixed; top: 56px; left: 0; z-index: 99; transform: translateX(-100%); }
  .lv-sider.open { transform: translateX(0); }
  .lv-main { padding: 16px; }
  .header-info .stage-tag { display: none; }
}
</style>
