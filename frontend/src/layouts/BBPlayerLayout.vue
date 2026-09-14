<template>
  <div class="bb-player-layout">
    <!-- 睡眠全局覆盖：进入 BB 游戏即判断，睡眠期间禁止一切操作 -->
    <div v-if="isSleeping" class="sleep-overlay">
      <div class="sleep-card">
        <div class="sleep-icon">😴</div>
        <div class="sleep-title">睡眠中</div>
        <div class="sleep-desc">你在睡觉，无法进行任何操作或接收消息</div>
        <div v-if="!wakeReady" class="sleep-timer">可醒来倒计时：{{ sleepCountdown }}</div>
        <button class="bb-btn" :disabled="!wakeReady" @click="doWake">
          {{ wakeReady ? '醒来' : '还未到时间' }}
        </button>
      </div>
    </div>
    <!-- 管理员广播（全页面可见） -->
    <div v-if="realtime.lastBroadcast" class="bb-broadcast-overlay" @click.self="realtime.clearBroadcast()">
      <div class="bb-broadcast-modal">
        <div class="bb-broadcast-icon">{{ realtime.lastBroadcast.type === 'invite' ? '📣' : '🔔' }}</div>
        <div class="bb-broadcast-title">{{ realtime.lastBroadcast.type === 'invite' ? '管理员邀请' : '管理员通知' }}</div>
        <div class="bb-broadcast-msg">{{ realtime.lastBroadcast.message }}</div>
        <div v-if="realtime.lastBroadcast.type === 'invite' && realtime.lastBroadcast.roomName" class="bb-broadcast-room">
          📍 已带你前往「{{ realtime.lastBroadcast.roomName }}」
        </div>
        <div class="bb-broadcast-from">—— {{ realtime.lastBroadcast.from }}</div>
        <button class="bb-btn" @click="realtime.clearBroadcast()">知道了</button>
      </div>
    </div>

    <header class="bb-player-header">      <div class="header-content">
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

          <div v-for="grp in roundGroups" :key="grp.round" class="nav-section">
            <div class="nav-section-header" :class="{ current: grp.status === 'current' }"
              @click="toggleRound(grp.round)">
              <span class="collapse-icon" :class="{ collapsed: isRoundCollapsed(grp.round) }">▾</span>
              <span class="section-title">{{ grp.title }}</span>
              <span class="section-status" :class="grp.status">{{ grp.statusText }}</span>
            </div>
            <div v-show="!isRoundCollapsed(grp.round)" class="round-stages">
              <router-link v-for="it in grp.items" :key="it.stage"
                :to="it.path"
                class="nav-item sub-item"
                :class="{ disabled: !it.clickable }"
                @click="mobileMenuOpen = false">
                <span class="nav-icon">{{ it.icon }}</span>
                <span class="nav-text">{{ it.stageName }}</span>
                <span class="stage-status-dot" :class="it.status"></span>
              </router-link>
            </div>
          </div>
        </div>
      </aside>

      <main class="bb-main">
        <router-view :key="'bb-stage-' + realtime.stageTick" />
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useBbAuthStore } from '../stores/bbAuthStore'
import { useBbSeasonStore } from '../stores/bbSeasonStore'
import { useBbRealtimeStore } from '../stores/bbRealtimeStore'
import { BB_STAGE_NAME } from '../types/bigbrother'
import { bbGetMyState, bbSleepWake } from '../services/bbHouseApi'
import { applyGamePageMeta } from '../router'

const router = useRouter()
const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

// 浏览器标题随当前比赛/阶段动态变化
watch(() => seasonStore.stageName, (s) => {
  applyGamePageMeta('bigbrother', seasonStore.currentRoundNumber ? `第${seasonStore.currentRoundNumber}周 · ${s}` : s)
}, { immediate: true })
const realtime = useBbRealtimeStore()

const mobileMenuOpen = ref(false)
const showSwitchModal = ref(false)
const collapsedRounds = ref<Set<number>>(new Set())

// 睡眠全局状态
const myState = ref<any>({ isSleeping: false, wakeAt: null })
const nowTs = ref(Date.now())
const isSleeping = computed(() => !!myState.value.isSleeping)
const wakeReady = computed(() => myState.value.wakeAt ? nowTs.value >= new Date(myState.value.wakeAt).getTime() : false)
const sleepCountdown = computed(() => {
  if (!myState.value.wakeAt) return ''
  const ms = Math.max(0, new Date(myState.value.wakeAt).getTime() - nowTs.value)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}小时${m}分`
})
let stateTimer: ReturnType<typeof setInterval> | null = null
let tickTimer: ReturnType<typeof setInterval> | null = null
async function refreshState() {
  try { myState.value = await bbGetMyState() } catch {}
}
async function doWake() {
  try { await bbSleepWake(); await refreshState() } catch (e: any) { alert(e?.message || '无法醒来') }
}

const currentUser = computed(() => authStore.currentUser)
const totalRounds = computed(() => seasonStore.totalRounds)

const fixedItems = [
  { icon: '🏠', text: '首页', path: '/games/bigbrother/player/home' },
  { icon: '👤', text: '我的资料', path: '/games/bigbrother/player/profile' },
  { icon: '🏡', text: 'BB House', path: '/games/bigbrother/player/house' },
  { icon: '📝', text: '历史记录', path: '/games/bigbrother/player/history' },
]

const stageMeta: Record<string, { icon: string; route: string }> = {
  hoh_competition: { icon: '👑', route: 'hoh' },
  nomination: { icon: '📋', route: 'nomination' },
  veto_competition: { icon: '🛡️', route: 'veto-competition' },
  veto_ceremony: { icon: '⚖️', route: 'veto-ceremony' },
  replacement_nom: { icon: '🔄', route: 'replacement-nom' },
  bbbb: { icon: '🎯', route: 'bbbb' },
  eviction_vote: { icon: '🗳️', route: 'eviction-vote' },
  eviction: { icon: '🚪', route: 'eviction' },
  final3: { icon: '🏁', route: 'finale' },
  champion_vote: { icon: '🏆', route: 'finale' },
}

const ENDGAME_STAGES = ['final3', 'champion_vote']

// 依据赛季配置（菜单）生成左侧树：每周包含哪些环节、终局两轮
const roundGroups = computed(() => {
  const items = seasonStore.menuItems || []
  const byRound = new Map<number, any[]>()
  for (const it of items) {
    if (!byRound.has(it.round)) byRound.set(it.round, [])
    byRound.get(it.round)!.push(it)
  }
  const c = seasonStore.currentRoundNumber
  const rounds = Array.from(byRound.keys()).sort((a, b) => {
    const ka = a <= c ? (c - a) : (1000 + (a - c))
    const kb = b <= c ? (c - b) : (1000 + (b - c))
    return ka - kb
  })
  return rounds.map(r => {
    const list = byRound.get(r)!
    const isEndgame = list.some(i => ENDGAME_STAGES.includes(i.stage))
    const hasCurrent = list.some(i => i.status === 'current')
    const allDone = list.every(i => i.status === 'completed')
    const status = hasCurrent ? 'current' : (allDone ? 'completed' : 'future')
    return {
      round: r,
      title: isEndgame ? (list[0]?.stageName || `第${r}轮`) : `第${r}周`,
      status,
      statusText: status === 'current' ? '进行中' : status === 'completed' ? '已完成' : '未开始',
      items: list.map(i => {
        const meta = stageMeta[i.stage] || { icon: '•', route: i.stage }
        const isEnd = ENDGAME_STAGES.includes(i.stage)
        return {
          stage: i.stage,
          stageName: i.stageName,
          status: i.status,
          clickable: i.clickable,
          icon: meta.icon,
          path: isEnd
            ? '/games/bigbrother/player/finale'
            : `/games/bigbrother/player/round/${r}/${meta.route}`
        }
      })
    }
  })
})

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
  await refreshState()
  realtime.connect()
  stateTimer = setInterval(refreshState, 8000)
  tickTimer = setInterval(() => { nowTs.value = Date.now() }, 1000)
})

onUnmounted(() => {
  if (stateTimer) { clearInterval(stateTimer); stateTimer = null }
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
  realtime.disconnect()
})
</script>

<style scoped>
.bb-player-layout {
  min-height: 100vh;
  background: #0a0a1a;
  color: #e0e0e0;
  font-family: system-ui, sans-serif;
}
.sleep-overlay {
  position: fixed; inset: 0; z-index: 3000;
  background: rgba(4, 6, 20, 0.96);
  display: flex; align-items: center; justify-content: center;
}
.sleep-card { text-align: center; color: #e0e0e0; }
.sleep-icon { font-size: 80px; }
.sleep-title { font-size: 26px; font-weight: 700; color: #00ff88; margin: 12px 0 6px; }
.sleep-desc { color: #888; margin-bottom: 12px; }
.sleep-timer { color: #ffaa00; margin-bottom: 16px; }
.bb-broadcast-overlay {
  position: fixed; inset: 0; z-index: 2500;
  background: rgba(0, 0, 0, 0.7);
  display: flex; align-items: center; justify-content: center;
}
.bb-broadcast-modal {
  background: linear-gradient(135deg, #1a1a3e, #0f0f2e);
  border: 1px solid #00ff8866; border-radius: 14px;
  padding: 28px 32px; width: min(420px, 90vw); text-align: center;
  box-shadow: 0 12px 48px #000000aa;
}
.bb-broadcast-icon { font-size: 44px; }
.bb-broadcast-title { color: #00ff88; font-weight: 700; margin: 10px 0 8px; font-size: 16px; }
.bb-broadcast-msg { color: #e0e0e0; font-size: 15px; line-height: 1.6; margin-bottom: 8px; }
.bb-broadcast-room { color: #00ff88; font-size: 13px; margin-bottom: 8px; }
.bb-broadcast-from { color: #777; font-size: 12px; margin-bottom: 16px; }
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
