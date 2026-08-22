<template>
  <div class="admin-layout">
    <header class="admin-header">
      <div class="header-content">
        <div class="logo-section">
          <span class="logo-icon">🎛️</span>
          <span class="logo-text">赛事管理</span>
        </div>
        <div class="header-info">
          <span class="stage-tag">{{ stageDisplay }}</span>
          <button class="theme-toggle-btn" @click="authStore.toggleTheme()" :title="authStore.theme === 'dark' ? '切换浅色模式' : '切换深色模式'">
            {{ authStore.theme === 'dark' ? '☀️' : '🌙' }}
          </button>
          <span class="user-name">{{ authStore.currentUser?.name }}</span>
          <button class="logout-btn" @click="handleLogout">退出</button>
        </div>
        <button class="mobile-menu-btn" @click="mobileMenuOpen = !mobileMenuOpen">
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </header>

    <div class="layout-body">
      <aside class="admin-sider" :class="{ open: mobileMenuOpen }">
        <nav class="sider-nav">
          <!-- 固定菜单 -->
          <div class="nav-section">
            <div
              v-for="item in fixedItems"
              :key="item.path"
              class="nav-item"
              :class="{ active: $route.path === item.path }"
              @click="navigateTo(item.path)"
            >
              <span class="nav-icon">{{ item.icon }}</span>
              <span class="nav-text">{{ item.text }}</span>
            </div>
          </div>

          <!-- 赛程控制 -->
          <div class="nav-section">
            <div class="nav-section-title">赛程控制</div>
            <div
              v-for="item in stageItems"
              :key="item.path"
              class="nav-item"
              :class="{ active: $route.path.startsWith(item.path) }"
              @click="navigateTo(item.path)"
            >
              <span class="nav-icon">{{ item.icon }}</span>
              <span class="nav-text">{{ item.text }}</span>
            </div>
          </div>

          <!-- 按轮次分组的菜单 -->
          <div
            v-for="round in rounds"
            :key="round"
            class="nav-section"
          >
            <div
              class="nav-section-title"
              :class="{ current: round === currentRoundNumber }"
              @click="toggleRound(round)"
            >
              <span class="collapse-icon" :class="{ collapsed: isRoundCollapsed(round) }">▾</span>
              <span>第{{ round }}公演</span>
              <span class="round-status" :class="getRoundStatus(round)">{{ getRoundStatusText(round) }}</span>
            </div>
            <div class="collapse-content" :class="{ collapsed: isRoundCollapsed(round) }">
              <div class="collapse-inner">
                <div
                  v-for="stage in getRoundStageList(round)"
                  :key="`${round}-${stage.key}`"
                  v-show="isStageVisible(round, stage.key)"
                  class="nav-item"
                  :class="{ active: isActive(round, stage.key) }"
                  @click="navigateTo(`${gamePrefix}/admin/round/${round}/${stage.key}`)"
                >
                  <span class="nav-icon">{{ stage.icon }}</span>
                  <span class="nav-text">{{ stage.text }}</span>
                  <span v-if="isCompleted(round, stage.key)" class="item-badge completed">✓</span>
                  <span v-if="isCurrent(round, stage.key)" class="item-badge current">●</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 其他管理 -->
          <div class="nav-section">
            <div class="nav-section-title">其他管理</div>
            <div
              v-for="item in otherItems"
              :key="item.path"
              class="nav-item"
              :class="{ active: $route.path.startsWith(item.path) }"
              @click="navigateTo(item.path)"
            >
              <span class="nav-icon">{{ item.icon }}</span>
              <span class="nav-text">{{ item.text }}</span>
            </div>
          </div>
        </nav>
      </aside>

      <div class="overlay" v-if="mobileMenuOpen" @click="mobileMenuOpen = false"></div>

      <main class="admin-main">
        <router-view />
      </main>
    </div>

    <nav class="mobile-tab-bar">
      <div
        class="tab-item"
        :class="{ active: $route.path === `${gamePrefix}/admin/dashboard` }"
        @click="navigateTo(`${gamePrefix}/admin/dashboard`)"
      >
        <span class="tab-icon">📊</span>
        <span class="tab-text">总览</span>
      </div>
      <div
        class="tab-item"
        :class="{ active: $route.path === `${gamePrefix}/admin/stage` }"
        @click="navigateTo(`${gamePrefix}/admin/stage`)"
      >
        <span class="tab-icon">🎯</span>
        <span class="tab-text">赛程</span>
      </div>
      <div
        class="tab-item"
        :class="{ active: $route.path === `${gamePrefix}/admin/players` }"
        @click="navigateTo(`${gamePrefix}/admin/players`)"
      >
        <span class="tab-icon">👥</span>
        <span class="tab-text">玩家</span>
      </div>
      <div
        class="tab-item"
        :class="{ active: $route.path === `${gamePrefix}/admin/logs` }"
        @click="navigateTo(`${gamePrefix}/admin/logs`)"
      >
        <span class="tab-icon">📜</span>
        <span class="tab-text">日志</span>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useSeasonStore } from '../stores/seasonStore'
import { STAGE_ORDER, CONCURRENT_ACTIONS } from '../types/season'
import type { StageType, StageStatus } from '../types/season'

const authStore = useAuthStore()
const seasonStore = useSeasonStore()
const router = useRouter()
const route = useRoute()
const mobileMenuOpen = ref(false)

const gamePrefix = computed(() => `/games/${authStore.currentGameId}`)

// 每轮公演的折叠状态，默认所有轮次都展开
const collapsedRounds = ref<Record<number, boolean>>({})

function toggleRound(round: number) {
  collapsedRounds.value[round] = !collapsedRounds.value[round]
}

function isRoundCollapsed(round: number): boolean {
  return collapsedRounds.value[round] === true
}

const currentRoundNumber = computed(() => seasonStore.currentRoundNumber)
const totalRounds = computed(() => seasonStore.totalRounds)
const rounds = computed(() => Array.from({ length: totalRounds.value }, (_, i) => i + 1))

const stageDisplay = computed(() => {
  return `${seasonStore.currentRoundNumber}公 - ${seasonStore.stageName}`
})

// 固定菜单
const fixedItems = computed(() => [
  { path: `${gamePrefix.value}/admin/dashboard`, icon: '📊', text: '总览' },
  { path: `${gamePrefix.value}/admin/players`, icon: '👥', text: '玩家管理' }
])

// 赛程控制菜单
const stageItems = computed(() => [
  { path: `${gamePrefix.value}/admin/stage`, icon: '🎯', text: '赛程矩阵' }
])

// 阶段配置（按新的阶段顺序，单个轮次内使用并发行动中心）
const stageConfig: Record<StageType, { icon: string; text: string }> = {
  preparation: { icon: '📋', text: '预先准备' },
  captain_vote: { icon: '👑', text: '队长选举' },
  concurrent: { icon: '⚡', text: '并发行动' },
  performance: { icon: '🌟', text: '公演' },
  danger_confirm: { icon: '⚠️', text: '危险名单' },
  elimination: { icon: '📝', text: '淘汰' },
  teaming: { icon: '👥', text: '组队' },
  song_select: { icon: '🎵', text: '选歌' },
  training: { icon: '💪', text: '训练' }
}

// 显示的阶段列表（按 STAGE_ORDER 顺序，仅显示主阶段）
const stageList = computed(() => {
  return STAGE_ORDER.map(key => ({ key: key as StageType, ...stageConfig[key as StageType] }))
})

// 并发子行动 → 菜单阶段 key 的映射（与管理端路由段保持一致）
const ACTION_TO_STAGE_KEY: Record<string, StageType> = {
  team: 'teaming',
  song: 'song_select',
  training: 'training'
}

// 菜单阶段 key → 并发子行动的反向映射
const STAGE_TO_ACTION: Record<string, 'team' | 'song' | 'training'> = {
  teaming: 'team',
  song_select: 'song',
  training: 'training'
}

// 某轮的菜单列表：主阶段 + 该轮已开放的并发子行动（插在"并发行动"之后）
function getRoundStageList(round: number): { key: StageType; icon: string; text: string }[] {
  const released = seasonStore.getReleasedConcurrentActions(round)
  const releasedKeys: StageType[] = released
    .map(action => ACTION_TO_STAGE_KEY[action])
    .filter(Boolean)
  const ordered: StageType[] = []
  for (const stage of stageList.value) {
    ordered.push(stage.key)
    if (stage.key === 'concurrent') {
      ordered.push(...releasedKeys)
    }
  }
  return ordered.map(key => ({ key, ...stageConfig[key] }))
}

// 其他管理菜单
const otherItems = computed(() => [
  { path: `${gamePrefix.value}/admin/songs`, icon: '🎵', text: '歌曲管理' },
  { path: `${gamePrefix.value}/admin/training-cards`, icon: '🃏', text: '训练卡牌' },
  { path: `${gamePrefix.value}/admin/training-records`, icon: '📈', text: '训练记录' },
  { path: `${gamePrefix.value}/admin/ranking`, icon: '🏅', text: '排名总览' },
  { path: `${gamePrefix.value}/admin/chat`, icon: '💬', text: '聊天室' },
  { path: `${gamePrefix.value}/admin/logs`, icon: '📜', text: '操作日志' }
])

// 获取轮次状态
function getRoundStatus(round: number): string {
  if (round < currentRoundNumber.value) return 'completed'
  if (round === currentRoundNumber.value) return 'current'
  return 'future'
}

function getRoundStatusText(round: number): string {
  const status = getRoundStatus(round)
  const textMap: Record<string, string> = {
    completed: '已完成',
    current: '进行中',
    future: '未开始'
  }
  return textMap[status]
}

// 检查阶段是否完成
function isCompleted(round: number, stage: StageType): boolean {
  return seasonStore.getStageStatus(round, stage) === 'completed'
}

// 检查阶段是否当前
function isCurrent(round: number, stage: StageType): boolean {
  return seasonStore.getStageStatus(round, stage) === 'current'
}

// 检查阶段是否可见（已完成或当前；并发子行动由开放状态控制，进入列表即显示）
function isStageVisible(round: number, stage: StageType): boolean {
  if (CONCURRENT_ACTIONS.includes(stage)) {
    return seasonStore.isConcurrentActionReleased(round, STAGE_TO_ACTION[stage])
  }
  const status = seasonStore.getStageStatus(round, stage)
  return status === 'completed' || status === 'current'
}

// 检查路由是否激活
function isActive(round: number, stage: StageType): boolean {
  const stagePath = `${gamePrefix.value}/admin/round/${round}/${stage}`
  return route.path.startsWith(stagePath)
}

// 导航
function navigateTo(path: string) {
  router.push(path)
  mobileMenuOpen.value = false
}

async function handleLogout() {
  await authStore.logout()
  authStore.clearAuth()
  await router.replace(`/games/${authStore.currentGameId}/login`)
}

function initCollapsedRounds() {
  rounds.value.forEach(round => {
    if (getRoundStatus(round) === 'completed') {
      collapsedRounds.value[round] = true
    }
  })
}

// 初始化加载
onMounted(async () => {
  try {
    await seasonStore.fetchProgress()
    initCollapsedRounds()
  } catch (e) {
    console.error('[AdminLayout] 初始化加载失败:', e)
  }
  // 初始化主题
  authStore.initTheme()
})
</script>

<style lang="scss" scoped>
/* ===================== CSS 变量（主题切换） ===================== */
.admin-layout {
  --bg-primary: #f4f5fb;
  --bg-secondary: #ffffff;
  --card-bg: #ffffff;
  --card-border: #eceaf6;
  --text-primary: #2b2b3a;
  --text-secondary: #5c5c72;
  --text-tertiary: #9a9ab0;
  --text-muted: #b8b8cc;
  --border-color: #eceaf6;
  --sidebar-bg: #ffffff;
  --header-bg: #ffffff;
  --hover-bg: rgba(108, 92, 231, 0.06);
  --active-bg: rgba(108, 92, 231, 0.09);
  --progress-bg: #f0eefb;
  --primary-color: #6c5ce7;
  --brand-gradient: linear-gradient(135deg, #6c5ce7, #a29bfe);

  &[data-theme="dark"] {
    --bg-primary: #14142a;
    --bg-secondary: #1e1e3a;
    --card-bg: rgba(255, 255, 255, 0.06);
    --card-border: rgba(255, 255, 255, 0.1);
    --text-primary: #ffffff;
    --text-secondary: rgba(255, 255, 255, 0.72);
    --text-tertiary: rgba(255, 255, 255, 0.46);
    --text-muted: rgba(255, 255, 255, 0.36);
    --border-color: rgba(255, 255, 255, 0.1);
    --sidebar-bg: #1e1e3a;
    --header-bg: #1e1e3a;
    --hover-bg: rgba(255, 255, 255, 0.07);
    --active-bg: rgba(255, 255, 255, 0.1);
    --progress-bg: rgba(255, 255, 255, 0.16);
    --primary-color: #8d7bff;
    --brand-gradient: linear-gradient(135deg, #7c6cf0, #b39dff);
  }
}

.admin-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-primary);
}

.admin-header {
  flex-shrink: 0;
  background: linear-gradient(120deg, #6c5ce7 0%, #8a7bf5 55%, #a29bfe 100%);
  padding: 0 24px;
  box-shadow: 0 4px 20px rgba(108, 92, 231, 0.28);
  z-index: 100;
  height: 56px;
  display: flex;
  align-items: center;
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    top: -80%;
    right: -4%;
    width: 280px;
    height: 280px;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.16) 0%, transparent 70%);
    border-radius: 50%;
    pointer-events: none;
  }
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: 1400px;
  position: relative;
  z-index: 1;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  font-size: 22px;
}

.logo-text {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.theme-toggle-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
  padding: 0;

  &:hover {
    background: rgba(255, 255, 255, 0.25);
    transform: scale(1.05);
  }
}

.stage-tag {
  padding: 4px 14px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.25);
}

.user-name {
  color: #ffffff;
  font-weight: 600;
  font-size: 14px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.logout-btn {
  padding: 5px 14px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.25);
    border-color: rgba(255, 255, 255, 0.5);
  }
}

.mobile-menu-btn {
  display: none;
  flex-direction: column;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;

  span {
    width: 22px;
    height: 2px;
    background: var(--text-primary);
    border-radius: 2px;
  }
}

.layout-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.admin-sider {
  width: 232px;
  flex-shrink: 0;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  padding: 10px 0;
}

.sider-nav {
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
}

.nav-section {
  margin-bottom: 8px;
}

.nav-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  cursor: pointer;
  user-select: none;

  &:hover {
    color: var(--text-secondary);
  }

  &.current {
    color: var(--primary-color);
  }

  .collapse-icon {
    font-size: 10px;
    transition: transform 0.2s ease;
    flex-shrink: 0;
    width: 12px;
    text-align: center;

    &.collapsed {
      transform: rotate(-90deg);
    }
  }

  .round-status {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: normal;

    &.completed {
      background: rgba(0, 168, 112, 0.12);
      color: #00a870;
    }

    &.current {
      background: rgba(108, 92, 231, 0.14);
      color: var(--primary-color);
    }

    &.future {
      background: rgba(156, 163, 175, 0.12);
      color: #9ca3af;
    }
  }
}

// 折叠展开动画
.collapse-content {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.3s ease;

  &.collapsed {
    grid-template-rows: 0fr;
  }

  .collapse-inner {
    overflow: hidden;
    min-height: 0;
  }
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  border-radius: 10px;
  transition: all 0.2s;
  cursor: pointer;
  margin: 2px 0;

  &:hover {
    color: var(--primary-color);
    background: var(--hover-bg);
    transform: translateX(2px);
  }

  &.active {
    color: var(--primary-color);
    background: linear-gradient(90deg, rgba(108, 92, 231, 0.14), rgba(162, 155, 254, 0.06));
    font-weight: 600;
    box-shadow: inset 0 0 0 1px rgba(108, 92, 231, 0.15);
  }
}

.nav-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.nav-text {
  flex: 1;
}

.item-badge {
  font-size: 12px;
  margin-left: 4px;

  &.completed {
    color: #00a870;
  }

  &.current {
    color: #0052cc;
    animation: pulse 2s infinite;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.admin-main {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: var(--bg-primary);
}

.overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 99;
}

.mobile-tab-bar {
  display: none;
}

@media (max-width: 768px) {
  .admin-layout {
    height: 100dvh;
  }

  .admin-header {
    padding: 0 16px;
    height: 52px;
  }

  .logo-text {
    font-size: 15px;
  }

  .user-name {
    font-size: 13px;
  }

  .mobile-menu-btn {
    display: flex;
  }

  .admin-sider {
    position: fixed;
    left: -220px;
    top: 0;
    bottom: 0;
    z-index: 101;
    transition: left 0.3s ease;
    width: 200px;
    background: var(--sidebar-bg);

    &.open {
      left: 0;
    }
  }

  .overlay {
    display: block;
  }

  .admin-main {
    padding: 16px;
    padding-bottom: 72px;
  }

  .mobile-tab-bar {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--sidebar-bg);
    border-top: 1px solid var(--border-color);
    z-index: 98;
    padding: 6px 2px;
    padding-bottom: calc(6px + env(safe-area-inset-bottom));
  }

  .tab-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 6px 2px;
    text-decoration: none;
    color: var(--text-tertiary);
    transition: all 0.2s;
    border-radius: 8px;
    gap: 3px;
    cursor: pointer;

    &.active {
      color: var(--primary-color);
    }
  }

  .tab-icon {
    font-size: 20px;
    line-height: 1;
  }

  .tab-text {
    font-size: 10px;
    font-weight: 500;
  }
}

@media (max-width: 480px) {
  .admin-header {
    padding: 0 12px;
  }

  .logo-text {
    font-size: 14px;
  }

  .logo-icon {
    font-size: 20px;
  }

  .stage-tag {
    display: none;
  }

  .user-name {
    font-size: 12px;
  }

  .admin-main {
    padding: 12px;
    padding-bottom: 66px;
  }

  .admin-sider {
    width: 180px;
    left: -180px;

    &.open {
      left: 0;
    }
  }

  .tab-icon {
    font-size: 18px;
  }

  .tab-text {
    font-size: 9px;
  }
}
</style>