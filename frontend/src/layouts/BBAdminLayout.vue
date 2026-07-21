<template>
  <div class="bb-admin-layout">
    <header class="bb-header">
      <div class="header-content">
        <div class="logo-section">
          <span class="logo-icon">📹</span>
          <span class="logo-text">Big Brother 管理</span>
        </div>
        <div class="header-info">
          <span class="stage-tag">{{ stageDisplay }}</span>
          <span class="user-name">{{ authStore.currentUser?.name }}</span>
          <button class="bb-btn bb-btn-sm" @click="handleLogout">退出</button>
        </div>
        <button class="mobile-menu-btn" @click="mobileMenuOpen = !mobileMenuOpen">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>

    <div class="layout-body">
      <aside class="bb-sider" :class="{ open: mobileMenuOpen }">
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
              <span class="section-title">第{{ round }}周</span>
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

          <div class="nav-section">
            <div class="nav-section-title">其他</div>
            <div v-for="item in otherItems" :key="item.path"
              class="nav-item" :class="{ active: $route.path.startsWith(item.path) }"
              @click="navigateTo(item.path)">
              <span class="nav-icon">{{ item.icon }}</span>
              <span class="nav-text">{{ item.text }}</span>
            </div>
          </div>
        </nav>
      </aside>

      <main class="bb-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useBbAuthStore } from '../stores/bbAuthStore'
import { useBbSeasonStore } from '../stores/bbSeasonStore'
import { BB_STAGE_NAME, type BBStageType } from '../types/bigbrother'

const router = useRouter()
const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const mobileMenuOpen = ref(false)
const collapsedRounds = ref<Set<number>>(new Set())

// 初始化折叠状态：除了当前轮次外全部折叠
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
  { icon: '📊', text: '总览', path: '/games/bigbrother/admin/dashboard' },
  { icon: '👥', text: '房客管理', path: '/games/bigbrother/admin/houseguests' },
]

const stageItems = [
  { icon: '🎯', text: '赛程矩阵', path: '/games/bigbrother/admin/stage' },
]

const stageList = [
  { key: 'hoh_competition' as BBStageType, icon: '👑', text: 'HOH竞争' },
  { key: 'nomination' as BBStageType, icon: '📋', text: '提名' },
  { key: 'veto_competition' as BBStageType, icon: '🛡️', text: '否决权竞争' },
  { key: 'veto_ceremony' as BBStageType, icon: '⚖️', text: '否决权会议' },
  { key: 'replacement_nom' as BBStageType, icon: '🔄', text: '替换提名' },
  { key: 'eviction_vote' as BBStageType, icon: '🗳️', text: '淘汰投票' },
  { key: 'eviction' as BBStageType, icon: '🚪', text: '淘汰结果' },
]

const otherItems = [
  { icon: '📜', text: '操作日志', path: '/games/bigbrother/admin/logs' },
  { icon: '💬', text: '聊天室', path: '/games/bigbrother/admin/chat' },
]

const rounds = computed(() => {
  const n = seasonStore.totalRounds
  return Array.from({ length: n }, (_, i) => i + 1)
})

const stageDisplay = computed(() => {
  return `第${seasonStore.currentRoundNumber}周 · ${seasonStore.stageName}`
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

function isStageClickable(round: number, stage: BBStageType): boolean {
  return seasonStore.isStageAccessible(round, stage)
}

function isStageActive(round: number, stage: BBStageType): boolean {
  return seasonStore.isStageActive(round, stage)
}

function getStageStatusClass(round: number, stage: BBStageType): string {
  return seasonStore.getStageStatus(round, stage)
}

function navigateTo(path: string) {
  mobileMenuOpen.value = false
  router.push(path)
}

function navigateToStage(round: number, stage: BBStageType) {
  if (!isStageClickable(round, stage)) return
  mobileMenuOpen.value = false
  const stageRoutes: Record<string, string> = {
    hoh_competition: 'hoh',
    nomination: 'nomination',
    veto_competition: 'veto',
    veto_ceremony: 'veto',
    replacement_nom: 'nomination',
    eviction_vote: 'eviction',
    eviction: 'eviction'
  }
  const routeName = stageRoutes[stage] || 'hoh'
  router.push(`/games/bigbrother/admin/round/${round}/${routeName}`)
}

async function handleLogout() {
  await authStore.logout()
  router.push('/games/bigbrother/login')
}

onMounted(async () => {
  await seasonStore.fetchProgress()
  await seasonStore.fetchMenu()
  initCollapsed()
})
</script>

<style scoped>
.bb-admin-layout {
  min-height: 100vh;
  background: #0a0a1a;
  color: #e0e0e0;
  font-family: system-ui, sans-serif;
}
.bb-header {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 56px;
  background: linear-gradient(135deg, #0f0f2e 0%, #1a1a3e 100%);
  border-bottom: 1px solid #00ff8844;
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
.logo-section {
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo-icon { font-size: 22px; }
.logo-text {
  font-size: 16px;
  font-weight: 600;
  background: linear-gradient(90deg, #00ff88, #00cc66);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stage-tag {
  background: #00ff8822;
  color: #00ff88;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  border: 1px solid #00ff8844;
}
.user-name { font-size: 14px; color: #aaa; }
.bb-btn {
  background: transparent;
  border: 1px solid #00ff8844;
  color: #00ff88;
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.bb-btn:hover { background: #00ff8822; }
.mobile-menu-btn {
  display: none;
  flex-direction: column;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
}
.mobile-menu-btn span {
  width: 22px; height: 2px;
  background: #00ff88;
  border-radius: 2px;
}
.layout-body {
  display: flex;
  padding-top: 56px;
}
.bb-sider {
  width: 240px;
  min-height: calc(100vh - 56px);
  background: #0f0f2e;
  border-right: 1px solid #00ff8822;
  overflow-y: auto;
  transition: transform 0.3s;
}
.sider-nav { padding: 12px 0; }
.nav-section { margin-bottom: 8px; }
.nav-section-title {
  padding: 8px 16px 4px;
  font-size: 11px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.nav-section-header {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  color: #aaa;
  transition: all 0.2s;
}
.nav-section-header:hover { color: #00ff88; }
.nav-section-header.current { color: #00ff88; }
.collapse-icon {
  font-size: 10px;
  margin-right: 6px;
  transition: transform 0.2s;
}
.collapse-icon.collapsed { transform: rotate(-90deg); }
.section-title { flex: 1; }
.section-status { font-size: 11px; }
.section-status.completed { color: #00ff88; }
.section-status.current { color: #ffaa00; }
.section-status.future { color: #555; }
.nav-item {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 13px;
  color: #aaa;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}
.nav-item:hover {
  background: #00ff8808;
  color: #e0e0e0;
}
.nav-item.active {
  background: #00ff8815;
  color: #00ff88;
  border-left-color: #00ff88;
}
.nav-item.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.nav-item.sub-item { padding-left: 32px; font-size: 12px; }
.nav-icon { margin-right: 8px; font-size: 14px; width: 20px; text-align: center; }
.nav-text { flex: 1; }
.stage-status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
}
.stage-status-dot.completed { background: #00ff88; }
.stage-status-dot.current { background: #ffaa00; animation: pulse 2s infinite; }
.stage-status-dot.future { background: #333; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.bb-main {
  flex: 1;
  padding: 24px;
  min-height: calc(100vh - 56px);
  overflow-y: auto;
}
@media (max-width: 768px) {
  .mobile-menu-btn { display: flex; }
  .bb-sider {
    position: fixed;
    top: 56px; left: 0;
    z-index: 99;
    transform: translateX(-100%);
  }
  .bb-sider.open { transform: translateX(0); }
  .bb-main { padding: 16px; }
  .header-info .stage-tag { display: none; }
}
</style>
