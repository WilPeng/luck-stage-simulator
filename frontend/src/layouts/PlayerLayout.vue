<template>
  <div class="player-layout">
    <header class="player-header">
      <div class="header-content">
        <div class="logo-section">
          <span class="logo-icon">🎤</span>
          <span class="logo-text">{{ gameName }}</span>
        </div>
        <div class="header-info">
          <span class="stage-tag" :class="stageClass">{{ stageName }}</span>
          <button class="theme-toggle-btn" @click="authStore.toggleTheme()" :title="authStore.theme === 'dark' ? '切换浅色模式' : '切换深色模式'">
            {{ authStore.theme === 'dark' ? '☀️' : '🌙' }}
          </button>
          <div class="user-info">
            <span class="user-name">{{ currentUser?.name }}</span>
            <button class="logout-btn" @click="openSwitchModal">切换</button>
            <button class="logout-btn" @click="handleLogout">退出</button>
          </div>
          <button class="menu-toggle" @click="mobileMenuOpen = !mobileMenuOpen">
            <span class="menu-icon" :class="{ open: mobileMenuOpen }">
              <span></span><span></span><span></span>
            </span>
          </button>
        </div>
      </div>
    </header>

    <div class="layout-body">
      <aside class="player-sidebar" :class="{ open: mobileMenuOpen }">
        <div class="sidebar-nav">
          <!-- 固定菜单项 -->
          <div class="nav-section">
            <router-link
              v-for="item in fixedItems"
              :key="item.path"
              :to="item.path"
              class="nav-item"
              :class="{ active: isActive(item.path) }"
              @click="mobileMenuOpen = false"
            >
              <span class="nav-icon">{{ item.icon }}</span>
              <span class="nav-text">{{ item.text }}</span>
            </router-link>
          </div>

          <!-- 按轮次分组的菜单 -->
          <div
            v-for="round in totalRounds"
            :key="round"
            class="nav-section"
          >
            <div
              class="nav-section-header"
              :class="{ current: round === currentRoundNumber }"
              @click="toggleRound(round)"
            >
              <span class="collapse-icon" :class="{ collapsed: isRoundCollapsed(round) }">▾</span>
              <span class="section-icon">🎭</span>
              <span class="section-title">第{{ round }}公演</span>
              <span class="section-status" :class="getRoundStatus(round)">{{ getRoundStatusText(round) }}</span>
            </div>
            <div class="collapse-content" :class="{ collapsed: isRoundCollapsed(round) }">
              <div class="collapse-inner">
                <router-link
                  v-for="stage in roundStages"
                  :key="`${round}-${stage.type}`"
                  :to="getStagePath(round, stage.type)"
                  class="nav-item stage-item"
                  :class="{
                    active: isActive(getStagePath(round, stage.type)),
                    disabled: !isStageAccessible(round, stage.type),
                    completed: isStageCompleted(round, stage.type),
                    current: isStageActive(round, stage.type)
                  }"
                  @click="handleStageClick($event, round, stage.type)"
                >
                  <span class="nav-icon">{{ stage.icon }}</span>
                  <span class="nav-text">{{ stage.name }}</span>
                  <span v-if="isStageCompleted(round, stage.type)" class="stage-badge completed">✓</span>
                  <span v-if="isStageActive(round, stage.type)" class="stage-badge current">●</span>
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div class="overlay" v-if="mobileMenuOpen" @click="mobileMenuOpen = false"></div>

      <main class="player-main">
        <router-view />
      </main>
    </div>

    <nav class="mobile-tab-bar">
      <router-link
        v-for="item in tabItems"
        :key="item.path"
        class="tab-item"
        :class="{ active: isActive(item.path) }"
        :to="item.path"
      >
        <span class="tab-icon">{{ item.icon }}</span>
        <span class="tab-text">{{ item.text }}</span>
      </router-link>
    </nav>
  </div>

  <!-- 切换选手弹窗 -->
  <Teleport to="body">
    <div v-if="showSwitchModal" class="switch-overlay" @click.self="showSwitchModal = false">
      <div class="switch-modal">
        <div class="switch-modal-header">
          <h3>切换选手</h3>
          <button class="switch-close-btn" @click="showSwitchModal = false">✕</button>
        </div>
        <div class="switch-search">
          <input
            v-model="switchKeyword"
            type="text"
            placeholder="搜索选手姓名..."
            class="switch-search-input"
          />
        </div>
        <div class="switch-list" ref="switchListRef">
          <div
            v-for="player in filteredPlayers"
            :key="player.id"
            class="switch-item"
            :class="{ active: player.id === currentUser?.id, switching: switchingUserId === player.id }"
            @click="handleSwitchPlayer(player)"
          >
            <div class="switch-item-avatar">
              <img
                v-if="getAvatarUrl(player.avatar)"
                :src="getAvatarUrl(player.avatar)"
                alt=""
                class="switch-avatar-img"
              />
              <span v-else class="switch-avatar-placeholder">{{ player.name?.[0] || '?' }}</span>
            </div>
            <div class="switch-item-info">
              <span class="switch-item-name">{{ player.name }}</span>
              <span class="switch-item-code">{{ player.loginCode }}</span>
            </div>
            <div v-if="player.id === currentUser?.id" class="switch-item-current">当前</div>
            <div v-if="switchingUserId === player.id" class="switch-item-loading">切换中...</div>
          </div>
          <div v-if="filteredPlayers.length === 0" class="switch-empty">
            {{ loggedPlayers.length === 0 ? '暂无历史登录记录' : '没有找到匹配的选手' }}
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useSeasonStore } from '../stores/seasonStore'
import { STAGE_ORDER, STAGE_NAMES } from '../types/season'
import type { StageType } from '../types/season'
import type { User } from '../types/user'
import { MessagePlugin } from 'tdesign-vue-next'
import { getAvatarUrl } from '../services/api'

const authStore = useAuthStore()
const seasonStore = useSeasonStore()
const route = useRoute()
const router = useRouter()
const mobileMenuOpen = ref(false)

import { GAMES, getGameById } from '../config/games'

const gamePrefix = computed(() => `/games/${authStore.currentGameId}`)
const gameName = computed(() => {
  const game = getGameById(authStore.currentGameId)
  return game?.name || '模拟游戏'
})

// 切换选手（仅展示本设备已登录过的选手）
const showSwitchModal = ref(false)
const switchKeyword = ref('')
const switchingUserId = ref<string | null>(null)
const loggedPlayers = ref<User[]>([])

const filteredPlayers = computed(() => {
  let list = loggedPlayers.value
  const kw = switchKeyword.value.trim()
  if (kw) {
    list = list.filter(u => u.name.includes(kw) || u.loginCode?.includes(kw))
  }
  return list
})

function openSwitchModal() {
  showSwitchModal.value = true
  switchKeyword.value = ''
  // 从 localStorage 读取历史登录记录
  loggedPlayers.value = authStore.getLoggedPlayers()
}

async function handleSwitchPlayer(player: User) {
  if (player.id === authStore.currentUser?.id) return
  switchingUserId.value = player.id
  try {
    await authStore.switchToPlayer(player)
    showSwitchModal.value = false
    MessagePlugin.success(`已切换到 ${player.name}`)
    // 整页刷新确保所有数据干净
    window.location.reload()
  } catch (e: any) {
    MessagePlugin.error(e.message || '切换失败')
  } finally {
    switchingUserId.value = null
  }
}

// 每轮公演的折叠状态，默认所有轮次都展开
const collapsedRounds = ref<Record<number, boolean>>({})

function toggleRound(round: number) {
  collapsedRounds.value[round] = !collapsedRounds.value[round]
}

function isRoundCollapsed(round: number): boolean {
  return collapsedRounds.value[round] === true
}

const currentUser = computed(() => authStore.currentUser)
const stageName = computed(() => seasonStore.stageName)
const currentRoundNumber = computed(() => seasonStore.currentRoundNumber)
const totalRounds = computed(() => seasonStore.totalRounds)

const stageClass = computed(() => {
  const stage = seasonStore.currentStage
  const classMap: Record<string, string> = {
    preparation: 'preparation',
    captain_vote: 'captain',
    teaming: 'team',
    song_select: 'song',
    training: 'training',
    performance: 'performance',
    elimination: 'elimination'
  }
  return classMap[stage] || ''
})

// 固定菜单项
const fixedItems = computed(() => [
  { path: `${gamePrefix.value}/player/home`, icon: '🏠', text: '首页' },
  { path: `${gamePrefix.value}/player/profile`, icon: '✨', text: '我的属性' },
  { path: `${gamePrefix.value}/player/chat`, icon: '💬', text: '聊天室' },
  { path: `${gamePrefix.value}/player/history`, icon: '📝', text: '我的记录' }
])

// 阶段配置
const stageConfig: Record<StageType, { icon: string; name: string }> = {
  preparation: { icon: '📋', name: '预先准备' },
  captain_vote: { icon: '👑', name: '队长选举' },
  teaming: { icon: '👥', name: '组队' },
  song_select: { icon: '🎵', name: '选歌' },
  training: { icon: '💪', name: '训练' },
  rehearsal: { icon: '🎭', name: '彩排' }, // 保留配置以匹配 STAGE_ORDER
  performance: { icon: '🌟', name: '公演结果' },
  elimination: { icon: '📊', name: '淘汰结果' }
}

// 轮次阶段列表（排除已删除的彩排）
const roundStages = computed(() => {
  return STAGE_ORDER.filter(type => type !== 'rehearsal').map(type => ({
    type,
    icon: stageConfig[type].icon,
    name: stageConfig[type].name
  }))
})

// 移动端底部导航
const tabItems = computed(() => {
  const prefix = gamePrefix.value
  const items = [
    { path: `${prefix}/player/home`, icon: '🏠', text: '首页' },
    { path: `${prefix}/player/profile`, icon: '✨', text: '我的' }
  ]

  // 添加当前轮次的当前阶段（排除已删除的彩排）
  if (seasonStore.season) {
    const currentStage = seasonStore.currentStage
    if (currentStage !== 'rehearsal') {
      const stageInfo = stageConfig[currentStage]
      if (stageInfo) {
        items.push({
          path: getStagePath(currentRoundNumber.value, currentStage),
          icon: stageInfo.icon,
          text: stageInfo.name
        })
      }
    }
  }

  return items
})

// 获取阶段路径
function getStagePath(round: number, stage: StageType): string {
  const prefix = gamePrefix.value
  const pathMap: Record<StageType, string> = {
    preparation: `${prefix}/player/round/${round}/preparation`,
    captain_vote: `${prefix}/player/round/${round}/captain`,
    teaming: `${prefix}/player/round/${round}/team`,
    song_select: `${prefix}/player/round/${round}/song-selection`,
    training: `${prefix}/player/round/${round}/training`,
    rehearsal: '',
    performance: `${prefix}/player/round/${round}/performance`,
    elimination: `${prefix}/player/round/${round}/elimination`
  }
  return pathMap[stage]
}

// 获取轮次状态
function getRoundStatus(round: number): string {
  if (round < currentRoundNumber.value) return 'completed'
  if (round === currentRoundNumber.value) return 'current'
  return 'future'
}

// 获取轮次状态文本
function getRoundStatusText(round: number): string {
  const status = getRoundStatus(round)
  const textMap: Record<string, string> = {
    completed: '已完成',
    current: '进行中',
    future: '未开始'
  }
  return textMap[status]
}

// 检查阶段是否可访问
function isStageAccessible(round: number, stage: StageType): boolean {
  return seasonStore.isStageAccessible(round, stage)
}

// 检查阶段是否已完成
function isStageCompleted(round: number, stage: StageType): boolean {
  return seasonStore.isStageCompleted(round, stage)
}

// 检查阶段是否当前激活
function isStageActive(round: number, stage: StageType): boolean {
  return seasonStore.isStageActive(round, stage)
}

// 判断路径是否激活
function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + '/')
}

// 处理阶段点击
function handleStageClick(event: Event, round: number, stage: StageType) {
  if (!isStageAccessible(round, stage)) {
    event.preventDefault()
    MessagePlugin.warning('该阶段尚未开放')
    return
  }
  mobileMenuOpen.value = false
}

// 退出登录
async function handleLogout() {
  await authStore.logout()
  authStore.clearAuth()
  await router.replace(`${gamePrefix.value}/login`)
}

// 初始化：加载赛季进度和菜单
onMounted(async () => {
  try {
    await Promise.all([
      seasonStore.fetchProgress(),
      seasonStore.fetchMenu()
    ])
  } catch (e) {
    console.error('[PlayerLayout] 初始化加载失败:', e)
  }
  // 初始化主题
  authStore.initTheme()
})
</script>

<style lang="scss" scoped>
/* ===================== CSS 变量（主题切换） ===================== */
.player-layout {
  // 浅色模式（默认）
  --bg-primary: #f5f7fa;
  --bg-secondary: #ffffff;
  --card-bg: #ffffff;
  --card-border: #e8e8e8;
  --text-primary: #333333;
  --text-secondary: #666666;
  --text-tertiary: #999999;
  --text-muted: #bbbbbb;
  --border-color: #e8e8e8;
  --sidebar-bg: #ffffff;
  --sidebar-hover: #f0f0f5;
  --hover-bg: #f5f5f8;
  --progress-bg: #f0f0f0;
  --switch-modal-bg: #ffffff;
  --switch-modal-text: #1a1a1a;
  --switch-input-border: #e0e0e0;
  --switch-input-placeholder: #bbb;
  --switch-hover: #f5f5f8;

  // 深色模式
  &[data-theme="dark"] {
    --bg-primary: #1a1a2e;
    --bg-secondary: #16213e;
    --card-bg: rgba(255, 255, 255, 0.05);
    --card-border: rgba(255, 255, 255, 0.1);
    --text-primary: #ffffff;
    --text-secondary: rgba(255, 255, 255, 0.7);
    --text-tertiary: rgba(255, 255, 255, 0.45);
    --text-muted: rgba(255, 255, 255, 0.35);
    --border-color: rgba(255, 255, 255, 0.08);
    --sidebar-bg: #2a2a4a;
    --sidebar-hover: rgba(255, 255, 255, 0.06);
    --hover-bg: rgba(255, 255, 255, 0.06);
    --progress-bg: rgba(255, 255, 255, 0.15);
    --switch-modal-bg: #2a2a4a;
    --switch-modal-text: #ffffff;
    --switch-input-border: rgba(255, 255, 255, 0.15);
    --switch-input-placeholder: rgba(255, 255, 255, 0.35);
    --switch-hover: rgba(255, 255, 255, 0.06);
  }
}

.player-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-primary);
}

.player-header {
  flex-shrink: 0;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  padding: 12px 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  z-index: 100;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  font-size: 28px;
}

.logo-text {
  font-size: 20px;
  font-weight: bold;
  color: #fff;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 16px;
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
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;

  &.preparation { background: linear-gradient(135deg, #95a5a6, #7f8c8d); }
  &.captain { background: linear-gradient(135deg, #f39c12, #e67e22); }
  &.team { background: linear-gradient(135deg, #4ecdc4, #44a08d); }
  &.song { background: linear-gradient(135deg, #a29bfe, #6c5ce7); }
  &.training { background: linear-gradient(135deg, #ff6b6b, #ee5a24); }
  &.performance { background: linear-gradient(135deg, #fdcb6e, #f39c12); }
  &.elimination { background: linear-gradient(135deg, #e74c3c, #c0392b); }
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-name {
  color: #fff;
  font-weight: 600;
  font-size: 15px;
}

.player-main {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.logout-btn {
  padding: 5px 14px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.25);
    border-color: rgba(255, 255, 255, 0.4);
  }
}

// 汉堡菜单按钮（默认隐藏桌面端显示）
.menu-toggle {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  margin-left: 8px;
}

.menu-icon {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 22px;
  height: 18px;
  justify-content: center;

  span {
    display: block;
    width: 100%;
    height: 2px;
    background: #fff;
    border-radius: 2px;
    transition: all 0.3s ease;
    transform-origin: center;
  }

  &.open {
    span:nth-child(1) {
      transform: translateY(6px) rotate(45deg);
    }
    span:nth-child(2) {
      opacity: 0;
    }
    span:nth-child(3) {
      transform: translateY(-6px) rotate(-45deg);
    }
  }
}

.layout-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.player-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  padding: 12px 0;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-section {
  margin-bottom: 8px;
}

.nav-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;

  &:hover {
    background: var(--sidebar-hover);
  }

  &.current {
    color: #667eea;
    background: rgba(102, 126, 234, 0.08);
    border-radius: 8px;
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

  .section-icon {
    font-size: 14px;
  }

  .section-title {
    flex: 1;
  }

  .section-status {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;

    &.completed {
      background: rgba(0, 168, 112, 0.2);
      color: #00a870;
    }

    &.current {
      background: rgba(0, 82, 217, 0.2);
      color: #0052d9;
    }

    &.future {
      background: rgba(156, 163, 175, 0.2);
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
  gap: 12px;
  padding: 10px 16px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  transition: all 0.2s;
  border-radius: 0;

  &:hover {
    color: var(--text-primary);
    background: var(--sidebar-hover);
  }

  &.active {
    color: #667eea;
    background: linear-gradient(90deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.05));
    border-left: 3px solid #667eea;
    padding-left: 13px;
    font-weight: 600;
  }

  &.stage-item {
    padding-left: 24px;
    font-size: 13px;
  }

  &.disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }

  &.completed .nav-text {
    color: #52c41a;
  }

  &.current {
    background: rgba(102, 126, 234, 0.1);
    border-left: 3px solid #667eea;
    padding-left: 13px;
  }
}

.nav-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.nav-text {
  flex: 1;
}

.stage-badge {
  font-size: 12px;
  margin-left: 4px;

  &.completed {
    color: #00a870;
  }

  &.current {
    color: #0052d9;
    animation: pulse 2s infinite;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 99;
}

.mobile-tab-bar {
  display: none;
}

@media (max-width: 768px) {
  .player-layout {
    height: 100dvh;
  }

  .player-header {
    padding: 10px 16px;
  }

  .logo-text {
    font-size: 16px;
  }

  .logo-icon {
    font-size: 22px;
  }

  .header-info {
    gap: 8px;
  }

  .stage-tag {
    padding: 4px 10px;
    font-size: 11px;
  }

  .user-name {
    font-size: 13px;
  }

  .logout-btn {
    padding: 4px 10px;
    font-size: 12px;
  }

  .player-sidebar {
    position: fixed;
    left: -220px;
    top: 0;
    bottom: 0;
    z-index: 101;
    transition: left 0.3s ease;
    width: 200px;
    background: var(--sidebar-bg);
    padding-top: 56px;

    &.open {
      left: 0;
    }
  }

  .overlay {
    display: block;
    z-index: 100;
  }

  .menu-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-left: auto;
  }

  .player-main {
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
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
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
    border-radius: 10px;
    gap: 3px;

    &.active {
      color: #667eea;
      background: rgba(102, 126, 234, 0.1);
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
  .player-header {
    padding: 8px 12px;
  }

  .logo-text {
    font-size: 14px;
  }

  .logo-icon {
    font-size: 20px;
  }

  .header-info {
    gap: 6px;
  }

  .stage-tag {
    padding: 3px 8px;
    font-size: 10px;
  }

  .user-name {
    font-size: 12px;
  }

  .logout-btn {
    padding: 3px 8px;
    font-size: 11px;
  }

  .player-main {
    padding: 12px;
    padding-bottom: 66px;
  }

  .tab-icon {
    font-size: 18px;
  }

  .tab-text {
    font-size: 9px;
  }
}

/* ===================== 切换选手弹窗 ===================== */
.switch-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.switch-modal {
  background: var(--switch-modal-bg);
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.switch-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 12px;

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--switch-modal-text);
  }
}

.switch-close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;

  &:hover {
    background: var(--hover-bg);
    color: var(--text-primary);
  }
}

.switch-search {
  padding: 8px 24px 12px;

  .switch-search-input {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid var(--switch-input-border);
    border-radius: 10px;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
    background: transparent;
    color: var(--switch-modal-text);

    &:focus {
      border-color: #667eea;
      box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
    }

    &::placeholder {
      color: var(--switch-input-placeholder);
    }
  }
}

.switch-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 16px;
}

.switch-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;

  &:hover {
    background: var(--switch-hover);
  }

  &.active {
    background: rgba(102, 126, 234, 0.08);
    border: 1px solid rgba(102, 126, 234, 0.2);
  }

  &.switching {
    opacity: 0.6;
    pointer-events: none;
  }
}

.switch-item-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.switch-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.switch-avatar-placeholder {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.switch-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.switch-item-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--switch-modal-text);
}

.switch-item-code {
  font-size: 12px;
  color: var(--text-tertiary);
}

.switch-item-current {
  font-size: 12px;
  color: #667eea;
  font-weight: 500;
  padding: 2px 10px;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 20px;
  flex-shrink: 0;
}

.switch-item-loading {
  font-size: 12px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.switch-empty,
.switch-loading {
  text-align: center;
  padding: 32px 16px;
  color: var(--text-tertiary);
  font-size: 14px;
}
</style>