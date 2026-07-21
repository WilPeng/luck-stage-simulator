<template>
  <div class="bb-player-layout">
    <header class="bb-player-header">
      <div class="header-content">
        <div class="logo-section">
          <span class="logo-icon">📹</span>
          <span class="logo-text">Big Brother</span>
        </div>
        <div class="header-info">
          <span class="stage-tag">{{ seasonStore.stageName }}</span>
          <span class="user-name">{{ currentUser?.name }}</span>
          <button class="bb-btn bb-btn-sm" @click="openSwitchModal">切换</button>
          <button class="bb-btn bb-btn-sm" @click="handleLogout">退出</button>
        </div>
        <button class="menu-toggle" @click="mobileMenuOpen = !mobileMenuOpen">
          <span class="menu-icon" :class="{ open: mobileMenuOpen }">
            <span></span><span></span><span></span>
          </span>
        </button>
      </div>
    </header>

    <div class="layout-body">
      <aside class="bb-sidebar" :class="{ open: mobileMenuOpen }">
        <div class="sidebar-nav">
          <div class="nav-section">
            <router-link v-for="item in fixedItems" :key="item.path"
              :to="item.path" class="nav-item" :class="{ active: isActive(item.path) }"
              @click="mobileMenuOpen = false">
              <span class="nav-icon">{{ item.icon }}</span>
              <span class="nav-text">{{ item.text }}</span>
            </router-link>
          </div>

          <div v-for="round in totalRounds" :key="round" class="nav-section">
            <div class="nav-section-header" :class="{ current: round === seasonStore.currentRoundNumber }"
              @click="toggleRound(round)">
              <span class="collapse-icon" :class="{ collapsed: isRoundCollapsed(round) }">▾</span>
              <span class="section-title">第{{ round }}周</span>
              <span class="section-status" :class="getRoundStatus(round)">{{ getRoundStatusText(round) }}</span>
            </div>
            <div v-show="!isRoundCollapsed(round)" class="round-stages">
              <router-link v-for="st in roundStages" :key="st.key"
                :to="`/games/bigbrother/player/round/${round}/${st.route}`"
                class="nav-item sub-item"
                :class="{ disabled: !isStageAccessible(round, st.key as any) }"
                @click="mobileMenuOpen = false">
                <span class="nav-icon">{{ st.icon }}</span>
                <span class="nav-text">{{ st.text }}</span>
                <span class="stage-status-dot" :class="getStageStatusClass(round, st.key as any)"></span>
              </router-link>
            </div>
          </div>
        </div>
      </aside>

      <main class="bb-main">
        <router-view />
      </main>
    </div>

    <!-- 切换选手弹窗 -->
    <Teleport to="body">
      <div v-if="showSwitchModal" class="bb-modal-overlay" @click.self="showSwitchModal = false">
        <div class="bb-modal">
          <div class="bb-modal-header">
            <h3>切换选手</h3>
            <button class="close-btn" @click="showSwitchModal = false">✕</button>
          </div>
          <div class="bb-modal-body">
            <div v-for="p in loggedPlayers" :key="p.id"
              class="player-option" @click="switchPlayer(p)">
              <span class="player-avatar">{{ p.name[0] }}</span>
              <div class="player-info">
                <div class="player-name">{{ p.name }}</div>
                <div class="player-code">{{ p.loginCode }}</div>
              </div>
            </div>
            <div v-if="loggedPlayers.length === 0" class="empty-tip">暂无历史登录记录</div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useBbAuthStore } from '../stores/bbAuthStore'
import { useBbSeasonStore } from '../stores/bbSeasonStore'
import { BB_STAGE_NAME } from '../types/bigbrother'

const router = useRouter()
const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const mobileMenuOpen = ref(false)
const showSwitchModal = ref(false)
const collapsedRounds = ref<Set<number>>(new Set())

const currentUser = computed(() => authStore.currentUser)
const totalRounds = computed(() => seasonStore.totalRounds)

const fixedItems = [
  { icon: '🏠', text: '首页', path: '/games/bigbrother/player/home' },
  { icon: '👤', text: '我的资料', path: '/games/bigbrother/player/profile' },
  { icon: '💬', text: '聊天室', path: '/games/bigbrother/player/chat' },
  { icon: '📝', text: '历史记录', path: '/games/bigbrother/player/history' },
]

const roundStages = [
  { key: 'hoh_competition', icon: '👑', text: 'HOH竞争', route: 'hoh' },
  { key: 'nomination', icon: '📋', text: '提名', route: 'nomination' },
  { key: 'veto_competition', icon: '🛡️', text: '否决权', route: 'veto' },
  { key: 'veto_ceremony', icon: '⚖️', text: '否决权会议', route: 'veto' },
  { key: 'eviction_vote', icon: '🗳️', text: '淘汰投票', route: 'eviction' },
  { key: 'eviction', icon: '🚪', text: '淘汰结果', route: 'eviction' },
]

const loggedPlayers = computed(() => authStore.getLoggedPlayers())

function isActive(path: string): boolean {
  return route.path.startsWith(path)
}

function toggleRound(round: number) {
  if (collapsedRounds.value.has(round)) collapsedRounds.value.delete(round)
  else collapsedRounds.value.add(round)
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

function isStageAccessible(round: number, stage: string): boolean {
  return seasonStore.isStageAccessible(round, stage as any)
}

function getStageStatusClass(round: number, stage: string): string {
  return seasonStore.getStageStatus(round, stage as any)
}

function openSwitchModal() {
  showSwitchModal.value = true
}

async function switchPlayer(player: { loginCode: string }) {
  try {
    await authStore.loginUser(player.loginCode)
    showSwitchModal.value = false
  } catch (e: any) {
    alert(e.message || '切换失败')
  }
}

async function handleLogout() {
  await authStore.logout()
  router.push('/games/bigbrother/login')
}

onMounted(async () => {
  await seasonStore.fetchProgress()
  await seasonStore.fetchMenu()
})
</script>

<style scoped>
.bb-player-layout {
  min-height: 100vh;
  background: #0a0a1a;
  color: #e0e0e0;
  font-family: system-ui, sans-serif;
}
.bb-player-header {
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
.logo-section { display: flex; align-items: center; gap: 8px; }
.logo-icon { font-size: 22px; }
.logo-text {
  font-size: 16px; font-weight: 600;
  background: linear-gradient(90deg, #00ff88, #00cc66);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.header-info { display: flex; align-items: center; gap: 12px; }
.stage-tag {
  background: #00ff8822; color: #00ff88;
  padding: 4px 12px; border-radius: 12px;
  font-size: 12px; border: 1px solid #00ff8844;
}
.user-name { font-size: 14px; color: #aaa; }
.bb-btn {
  background: transparent; border: 1px solid #00ff8844;
  color: #00ff88; padding: 6px 16px; border-radius: 6px;
  cursor: pointer; font-size: 13px; transition: all 0.2s;
}
.bb-btn:hover { background: #00ff8822; }
.menu-toggle {
  display: none; background: none; border: none; cursor: pointer; padding: 4px;
}
.menu-icon { display: flex; flex-direction: column; gap: 4px; }
.menu-icon span { width: 22px; height: 2px; background: #00ff88; border-radius: 2px; transition: all 0.3s; }
.menu-icon.open span:nth-child(1) { transform: rotate(45deg) translate(4px, 4px); }
.menu-icon.open span:nth-child(2) { opacity: 0; }
.menu-icon.open span:nth-child(3) { transform: rotate(-45deg) translate(4px, -4px); }
.layout-body { display: flex; padding-top: 56px; }
.bb-sidebar {
  width: 240px; min-height: calc(100vh - 56px);
  background: #0f0f2e; border-right: 1px solid #00ff8822;
  overflow-y: auto; transition: transform 0.3s;
}
.sidebar-nav { padding: 12px 0; }
.nav-section { margin-bottom: 8px; }
.nav-section-header {
  display: flex; align-items: center; padding: 8px 16px;
  cursor: pointer; font-size: 13px; color: #aaa; transition: all 0.2s;
}
.nav-section-header:hover { color: #00ff88; }
.nav-section-header.current { color: #00ff88; }
.collapse-icon { font-size: 10px; margin-right: 6px; transition: transform 0.2s; }
.collapse-icon.collapsed { transform: rotate(-90deg); }
.section-title { flex: 1; }
.section-status { font-size: 11px; }
.section-status.completed { color: #00ff88; }
.section-status.current { color: #ffaa00; }
.section-status.future { color: #555; }
.nav-item {
  display: flex; align-items: center; padding: 10px 16px;
  cursor: pointer; font-size: 13px; color: #aaa;
  transition: all 0.2s; border-left: 3px solid transparent;
  text-decoration: none;
}
.nav-item:hover { background: #00ff8808; color: #e0e0e0; }
.nav-item.active { background: #00ff8815; color: #00ff88; border-left-color: #00ff88; }
.nav-item.disabled { opacity: 0.35; pointer-events: none; cursor: not-allowed; }
.nav-item.sub-item { padding-left: 32px; font-size: 12px; }
.nav-icon { margin-right: 8px; font-size: 14px; width: 20px; text-align: center; }
.nav-text { flex: 1; }
.stage-status-dot { width: 8px; height: 8px; border-radius: 50%; }
.stage-status-dot.completed { background: #00ff88; }
.stage-status-dot.current { background: #ffaa00; animation: pulse 2s infinite; }
.stage-status-dot.future { background: #333; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.bb-main { flex: 1; padding: 24px; min-height: calc(100vh - 56px); overflow-y: auto; }
.bb-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.bb-modal {
  background: #1a1a3e; border: 1px solid #00ff8844;
  border-radius: 12px; width: 360px; max-width: 90vw; max-height: 80vh; overflow-y: auto;
}
.bb-modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid #00ff8822;
}
.bb-modal-header h3 { margin: 0; color: #00ff88; font-size: 16px; }
.close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; }
.bb-modal-body { padding: 12px; }
.player-option {
  display: flex; align-items: center; gap: 12px;
  padding: 12px; cursor: pointer; border-radius: 8px; transition: all 0.2s;
}
.player-option:hover { background: #00ff8815; }
.player-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: linear-gradient(135deg, #00ff88, #00cc66);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 600; color: #1a1a3e;
}
.player-info .player-name { font-size: 14px; color: #e0e0e0; }
.player-info .player-code { font-size: 12px; color: #888; }
.empty-tip { text-align: center; color: #666; padding: 24px; font-size: 14px; }
@media (max-width: 768px) {
  .menu-toggle { display: block; }
  .bb-sidebar {
    position: fixed; top: 56px; left: 0; z-index: 99;
    transform: translateX(-100%);
  }
  .bb-sidebar.open { transform: translateX(0); }
  .bb-main { padding: 16px; }
  .header-info .stage-tag { display: none; }
}
</style>
