<template>
  <div class="player-layout">
    <header class="player-header">
      <div class="header-content">
        <div class="logo-section">
          <span class="logo-icon">🎤</span>
          <span class="logo-text">乘风2026</span>
        </div>
        <div class="header-info">
          <span class="stage-tag" :class="stageClass">{{ stageName }}</span>
          <div class="user-info">
            <span class="user-name">{{ currentUser?.name }}</span>
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
            <div class="nav-section-header" :class="{ current: round === currentRoundNumber }">
              <span class="section-icon">🎭</span>
              <span class="section-title">第{{ round }}公演</span>
              <span class="section-status" :class="getRoundStatus(round)">{{ getRoundStatusText(round) }}</span>
            </div>
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
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useSeasonStore } from '../stores/seasonStore'
import { STAGE_ORDER, STAGE_NAMES } from '../types/season'
import type { StageType } from '../types/season'
import { MessagePlugin } from 'tdesign-vue-next'

const authStore = useAuthStore()
const seasonStore = useSeasonStore()
const route = useRoute()
const router = useRouter()
const mobileMenuOpen = ref(false)

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
const fixedItems = [
  { path: '/player/home', icon: '🏠', text: '首页' },
  { path: '/player/profile', icon: '✨', text: '我的属性' },
  { path: '/player/chat', icon: '💬', text: '聊天室' },
  { path: '/player/history', icon: '📝', text: '我的记录' }
]

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
  const items = [
    { path: '/player/home', icon: '🏠', text: '首页' },
    { path: '/player/profile', icon: '✨', text: '我的' }
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
  const pathMap: Record<StageType, string> = {
    preparation: `/player/round/${round}/preparation`,
    captain_vote: `/player/round/${round}/captain`,
    teaming: `/player/round/${round}/team`,
    song_select: `/player/round/${round}/song-selection`,
    training: `/player/round/${round}/training`,
    rehearsal: '',
    performance: `/player/round/${round}/performance`,
    elimination: `/player/round/${round}/elimination`
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
  // 先清除所有持久化数据，再跳转，避免与新登录产生竞态
  await authStore.logout()
  authStore.clearAuth()
  await router.replace('/login')
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
})
</script>

<style lang="scss" scoped>
.player-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #f5f7fa;
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
  background: #f5f7fa;
  color: #333;
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
  background: #fff;
  border-right: 1px solid #e8e8e8;
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
  color: #999;
  font-size: 12px;
  font-weight: 600;

  &.current {
    color: #667eea;
    background: rgba(102, 126, 234, 0.08);
    border-radius: 8px;
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

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  color: #666;
  text-decoration: none;
  font-size: 14px;
  transition: all 0.2s;
  border-radius: 0;

  &:hover {
    color: #333;
    background: #f0f0f5;
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

.player-main {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
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
    background: #fff;
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
    background: #fff;
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
    border-top: 1px solid #e8e8e8;
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
    color: #999;
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
</style>