<template>
  <div class="lv-player-layout">
    <header class="lv-player-header">
      <div class="header-content">
        <div class="logo-section">
          <span class="logo-icon">💕</span>
          <span class="logo-text">恋综</span>
        </div>
        <div class="header-info">
          <span class="stage-tag">{{ seasonStore.stageName }}</span>
          <span class="user-name">{{ currentUser?.name }}</span>
          <button class="lv-btn lv-btn-sm" @click="openSwitchModal">切换</button>
          <button class="lv-btn lv-btn-sm" @click="handleLogout">退出</button>
        </div>
        <button class="menu-toggle" @click="mobileMenuOpen = !mobileMenuOpen">
          <span class="menu-icon" :class="{ open: mobileMenuOpen }">
            <span></span><span></span><span></span>
          </span>
        </button>
      </div>
    </header>

    <div class="layout-body">
      <aside class="lv-sidebar" :class="{ open: mobileMenuOpen }">
        <div class="sidebar-nav">
          <div class="nav-section">
            <router-link v-for="item in fixedItems" :key="item.path"
              :to="item.path" class="nav-item" :class="{ active: isActive(item.path) }"
              @click="mobileMenuOpen = false">
              <span class="nav-icon">{{ item.icon }}</span>
              <span class="nav-text">{{ item.text }}</span>
            </router-link>
          </div>

          <div v-for="round in totalRounds" :key="round" v-show="!isWaiting" class="nav-section">
            <div class="nav-section-header" :class="{ current: round === seasonStore.currentRoundNumber }"
              @click="toggleRound(round)">
              <span class="collapse-icon" :class="{ collapsed: isRoundCollapsed(round) }">▾</span>
              <span class="section-title">第{{ round }}轮</span>
              <span class="section-status" :class="getRoundStatus(round)">{{ getRoundStatusText(round) }}</span>
            </div>
            <div v-show="!isRoundCollapsed(round)" class="round-stages">
              <router-link v-for="st in roundStages" :key="st.key"
                :to="`/games/lovevariety/player/round/${round}/${st.route}`"
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

      <main class="lv-main">
        <router-view />
      </main>
    </div>

    <!-- 切换选手弹窗 -->
    <Teleport to="body">
      <div v-if="showSwitchModal" class="lv-modal-overlay" @click.self="showSwitchModal = false">
        <div class="lv-modal">
          <div class="lv-modal-header">
            <h3>切换选手</h3>
            <button class="close-btn" @click="showSwitchModal = false">✕</button>
          </div>
          <div class="lv-modal-body">
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
import { useLvAuthStore } from '../stores/lovevarietyAuthStore'
import { useLvSeasonStore } from '../stores/lovevarietySeasonStore'

const router = useRouter()
const route = useRoute()
const authStore = useLvAuthStore()
const seasonStore = useLvSeasonStore()

const mobileMenuOpen = ref(false)
const showSwitchModal = ref(false)
const collapsedRounds = ref<Set<number>>(new Set())

const currentUser = computed(() => authStore.currentUser)
const totalRounds = computed(() => seasonStore.totalRounds)
const isWaiting = computed(() => seasonStore.currentStage === 'waiting')

const fixedItems = [
  { icon: '🏠', text: '首页', path: '/games/lovevariety/player/home' },
  { icon: '✉️', text: '寄信', path: '/games/lovevariety/player/letter/send' },
  { icon: '📪', text: '收件箱', path: '/games/lovevariety/player/letter/inbox' },
]

const roundStages = [
  { key: 'love_vote', icon: '💌', text: '喜爱值投送', route: 'vote' },
  { key: 'pairing', icon: '💑', text: '配对结果', route: 'result' },
  { key: 'elimination', icon: '🚪', text: '淘汰', route: 'result' },
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
  if (isWaiting.value) return false
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
  router.push('/games/lovevariety/login')
}

onMounted(async () => {
  await seasonStore.fetchProgress()
  await seasonStore.fetchMenu()
})
</script>

<style scoped>
.lv-player-layout {
  min-height: 100vh;
  background: #0a0a1a;
  color: #e0e0e0;
  font-family: system-ui, sans-serif;
}
.lv-player-header {
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
.menu-toggle { display: none; background: none; border: none; cursor: pointer; padding: 4px; }
.menu-icon { display: flex; flex-direction: column; gap: 4px; }
.menu-icon span { width: 22px; height: 2px; background: #ff69b4; border-radius: 2px; transition: all 0.3s; }
.menu-icon.open span:nth-child(1) { transform: rotate(45deg) translate(4px, 4px); }
.menu-icon.open span:nth-child(2) { opacity: 0; }
.menu-icon.open span:nth-child(3) { transform: rotate(-45deg) translate(4px, -4px); }
.layout-body { display: flex; padding-top: 56px; }
.lv-sidebar {
  width: 240px; min-height: calc(100vh - 56px);
  background: #1a0f2e; border-right: 1px solid #ff69b422;
  overflow-y: auto; transition: transform 0.3s;
}
.sidebar-nav { padding: 12px 0; }
.nav-section { margin-bottom: 8px; }
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
  text-decoration: none;
}
.nav-item:hover { background: #ff69b408; color: #e0e0e0; }
.nav-item.active { background: #ff69b415; color: #ff69b4; border-left-color: #ff69b4; }
.nav-item.disabled { opacity: 0.35; pointer-events: none; cursor: not-allowed; }
.nav-item.sub-item { padding-left: 32px; font-size: 12px; }
.nav-icon { margin-right: 8px; font-size: 14px; width: 20px; text-align: center; }
.nav-text { flex: 1; }
.stage-status-dot { width: 8px; height: 8px; border-radius: 50%; }
.stage-status-dot.completed { background: #ff69b4; }
.stage-status-dot.current { background: #ffaa00; animation: pulse 2s infinite; }
.stage-status-dot.future { background: #333; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.lv-main { flex: 1; padding: 24px; min-height: calc(100vh - 56px); overflow-y: auto; }
.lv-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.lv-modal {
  background: #2d1b4e; border: 1px solid #ff69b444;
  border-radius: 12px; width: 360px; max-width: 90vw; max-height: 80vh; overflow-y: auto;
}
.lv-modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid #ff69b422;
}
.lv-modal-header h3 { margin: 0; color: #ff69b4; font-size: 16px; }
.close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; }
.lv-modal-body { padding: 12px; }
.player-option {
  display: flex; align-items: center; gap: 12px;
  padding: 12px; cursor: pointer; border-radius: 8px; transition: all 0.2s;
}
.player-option:hover { background: #ff69b415; }
.player-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: linear-gradient(135deg, #ff69b4, #ff1493);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 600; color: #1a0f2e;
}
.player-info .player-name { font-size: 14px; color: #e0e0e0; }
.player-info .player-code { font-size: 12px; color: #888; }
.empty-tip { text-align: center; color: #666; padding: 24px; font-size: 14px; }
@media (max-width: 768px) {
  .menu-toggle { display: block; }
  .lv-sidebar { position: fixed; top: 56px; left: 0; z-index: 99; transform: translateX(-100%); }
  .lv-sidebar.open { transform: translateX(0); }
  .lv-main { padding: 16px; }
  .header-info .stage-tag { display: none; }
}
</style>
