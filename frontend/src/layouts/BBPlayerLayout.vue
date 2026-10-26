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

    <!-- 管理员召集：切换到比赛页面准备 -->
    <div v-if="summonNotice" class="bb-broadcast-overlay" @click.self="summonNotice = null">
      <div class="bb-broadcast-modal">
        <div class="bb-broadcast-icon">📣</div>
        <div class="bb-broadcast-title">比赛召集</div>
        <div class="bb-broadcast-msg">管理员召集你参加「{{ summonNotice.minigameName || '小游戏' }}」，已切换到比赛页面，请点击「准备」。</div>
        <button class="bb-btn" @click="summonNotice = null">前往准备</button>
      </div>
    </div>

    <!-- 管理员召集：召集所有选手到指定页面 -->
    <div v-if="pageSummonNotice" class="bb-broadcast-overlay" @click.self="pageSummonNotice = null">
      <div class="bb-broadcast-modal">
        <div class="bb-broadcast-icon">📢</div>
        <div class="bb-broadcast-title">管理员召集</div>
        <div class="bb-broadcast-msg">管理员召集大家前往「{{ pageSummonName }}」页面，已为你切换。</div>
        <button class="bb-btn" @click="pageSummonNotice = null">知道了</button>
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

// 管理员召集：切换到比赛页面并提示进入准备
const summonNotice = ref<any>(null)
watch(() => realtime.lastMinigameSummon, (s) => {
  if (!s || !s.path) return
  summonNotice.value = s
  try { if (router.currentRoute.value.path !== s.path) router.push(s.path) } catch {}
})

// 管理员「召集到页面」
const pageSummonNotice = ref<any>(null)
const PAGE_NAME: Record<string, string> = {
  home: '首页', profile: '我的资料', house: 'BB House', history: '历史记录', finale: '终局',
  hoh: 'HOH 竞争', nomination: '提名仪式', 'veto-competition': '否决权竞争', 'veto-ceremony': '否决权会议',
  'replacement-nom': '替换提名', bbbb: 'BBBB', 'eviction-vote': '淘汰投票', eviction: '淘汰结果'
}
const pageSummonName = computed(() => {
  const p = pageSummonNotice.value?.path || ''
  const seg = p.split('/').pop() || ''
  return PAGE_NAME[seg] || seg || '指定'
})
watch(() => realtime.lastSummon, (s) => {
  if (!s || !s.path) return
  pageSummonNotice.value = s
  try { if (router.currentRoute.value.path !== s.path) router.push(s.path) } catch {}
})

const mobileMenuOpen = ref(false)
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
  color: #ece7fb;
  font-family: var(--bb-font-body, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif);
  background:
    radial-gradient(1100px 620px at 82% 0%, rgba(96, 58, 160, 0.32) 0%, transparent 60%),
    radial-gradient(900px 520px at 4% 100%, rgba(64, 38, 128, 0.28) 0%, transparent 62%),
    linear-gradient(160deg, #160d29 0%, #1e1236 48%, #120a22 100%);
  background-attachment: fixed;
}
.sleep-overlay {
  position: fixed; inset: 0; z-index: 3000;
  background: rgba(14, 8, 30, 0.95);
  display: flex; align-items: center; justify-content: center;
}
.sleep-card { text-align: center; color: #ece7fb; }
.sleep-icon { font-size: 80px; }
.sleep-title { font-size: 26px; font-weight: 700; color: #b39bff; margin: 12px 0 6px; }
.sleep-desc { color: #8f83b8; margin-bottom: 12px; }
.sleep-timer { color: #e6c988; margin-bottom: 16px; }
.bb-broadcast-overlay {
  position: fixed; inset: 0; z-index: 2500;
  background: rgba(0, 0, 0, 0.7);
  display: flex; align-items: center; justify-content: center;
}
.bb-broadcast-modal {
  background: linear-gradient(135deg, #2a1a4a, #1b1130);
  border: 1px solid #b39bff66; border-radius: 14px;
  padding: 28px 32px; width: min(420px, 90vw); text-align: center;
  box-shadow: 0 12px 48px #000000aa;
}
.bb-broadcast-icon { font-size: 44px; }
.bb-broadcast-title { color: #b39bff; font-weight: 700; margin: 10px 0 8px; font-size: 16px; }
.bb-broadcast-msg { color: #ece7fb; font-size: 15px; line-height: 1.6; margin-bottom: 8px; }
.bb-broadcast-room { color: #b39bff; font-size: 13px; margin-bottom: 8px; }
.bb-broadcast-from { color: #7d6fa6; font-size: 12px; margin-bottom: 16px; }
.bb-player-header {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 60px;
  background: linear-gradient(135deg, rgba(42, 26, 74, 0.96) 0%, rgba(24, 14, 42, 0.96) 100%);
  border-bottom: 1px solid rgba(230, 201, 136, 0.28);
  box-shadow: 0 6px 30px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(12px);
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
  font-family: var(--bb-font-display, 'Cinzel', Georgia, serif);
  font-size: 18px; font-weight: 700; letter-spacing: 1.5px;
  background: linear-gradient(90deg, #f6efdb, #e6c988 55%, #c9a24f);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.header-info { display: flex; align-items: center; gap: 12px; }
.stage-tag {
  background: rgba(230, 201, 136, 0.12); color: #e6c988;
  padding: 4px 12px; border-radius: 999px;
  font-size: 12px; border: 1px solid rgba(230, 201, 136, 0.35);
}
.user-name { font-size: 14px; color: #b3a6d6; }
.bb-btn {
  background: transparent; border: 1px solid #b39bff44;
  color: #b39bff; padding: 6px 16px; border-radius: 6px;
  cursor: pointer; font-size: 13px; transition: all 0.2s;
}
.bb-btn:hover { background: #b39bff22; }
.menu-toggle {
  display: none; background: none; border: none; cursor: pointer; padding: 4px;
}
.menu-icon { display: flex; flex-direction: column; gap: 4px; }
.menu-icon span { width: 22px; height: 2px; background: #b39bff; border-radius: 2px; transition: all 0.3s; }
.menu-icon.open span:nth-child(1) { transform: rotate(45deg) translate(4px, 4px); }
.menu-icon.open span:nth-child(2) { opacity: 0; }
.menu-icon.open span:nth-child(3) { transform: rotate(-45deg) translate(4px, -4px); }
.layout-body { display: flex; padding-top: 60px; }
.bb-sidebar {
  width: 240px; height: calc(100vh - 60px);
  position: sticky; top: 60px; align-self: flex-start;
  background: rgba(24, 14, 42, 0.78); border-right: 1px solid rgba(179, 155, 255, 0.16);
  backdrop-filter: blur(10px);
  overflow-y: auto; overscroll-behavior: contain; transition: transform 0.3s;
}
.bb-sidebar::-webkit-scrollbar { width: 8px; }
.bb-sidebar::-webkit-scrollbar-track { background: #120a22; }
.bb-sidebar::-webkit-scrollbar-thumb { background: #b39bff44; border-radius: 4px; }
.bb-sidebar::-webkit-scrollbar-thumb:hover { background: #b39bff77; }
.sidebar-nav { padding: 12px 0; }
.nav-section { margin-bottom: 8px; }
.nav-section-header {
  display: flex; align-items: center; padding: 8px 16px;
  cursor: pointer; font-size: 13px; color: #a99bd0; transition: all 0.2s;
}
.nav-section-header:hover { color: #b39bff; }
.nav-section-header.current { color: #e6c988; }
.collapse-icon { font-size: 10px; margin-right: 6px; transition: transform 0.2s; }
.collapse-icon.collapsed { transform: rotate(-90deg); }
.section-title { flex: 1; }
.section-status { font-size: 11px; }
.section-status.completed { color: #b39bff; }
.section-status.current { color: #e6c988; }
.section-status.future { color: #5c5182; }
.nav-item {
  display: flex; align-items: center; padding: 10px 16px;
  cursor: pointer; font-size: 13px; color: #a99bd0;
  transition: all 0.2s; border-left: 3px solid transparent;
  text-decoration: none;
}
.nav-item:hover { background: #b39bff08; color: #ece7fb; }
.nav-item.active { background: rgba(179, 155, 255, 0.12); color: #e9d3a0; border-left-color: #e6c988; }
.nav-item.disabled { opacity: 0.35; pointer-events: none; cursor: not-allowed; }
.nav-item.sub-item { padding-left: 32px; font-size: 12px; }
.nav-icon { margin-right: 8px; font-size: 14px; width: 20px; text-align: center; }
.nav-text { flex: 1; }
.stage-status-dot { width: 8px; height: 8px; border-radius: 50%; }
.stage-status-dot.completed { background: #b39bff; }
.stage-status-dot.current { background: #e6c988; animation: pulse 2s infinite; }
.stage-status-dot.future { background: #3a2f5c; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.bb-main { flex: 1; padding: 24px; min-height: calc(100vh - 60px); overflow-y: auto; }
.bb-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.bb-modal {
  background: #2a1a4a; border: 1px solid #b39bff44;
  border-radius: 12px; width: 360px; max-width: 90vw; max-height: 80vh; overflow-y: auto;
}
.bb-modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid #b39bff22;
}
.bb-modal-header h3 { margin: 0; color: #b39bff; font-size: 16px; }
.close-btn { background: none; border: none; color: #8f83b8; cursor: pointer; font-size: 18px; }
.bb-modal-body { padding: 12px; }
.player-option {
  display: flex; align-items: center; gap: 12px;
  padding: 12px; cursor: pointer; border-radius: 8px; transition: all 0.2s;
}
.player-option:hover { background: #b39bff15; }
.player-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: linear-gradient(135deg, #b39bff, #8b6bff);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 600; color: #2a1a4a;
}
.player-info .player-name { font-size: 14px; color: #ece7fb; }
.player-info .player-code { font-size: 12px; color: #8f83b8; }
.empty-tip { text-align: center; color: #6b5f92; padding: 24px; font-size: 14px; }
@media (max-width: 768px) {
  .menu-toggle { display: block; }
  .bb-sidebar {
    position: fixed; top: 60px; left: 0; z-index: 99;
    transform: translateX(-100%);
  }
  .bb-sidebar.open { transform: translateX(0); }
  .bb-main { padding: 16px; }
  .header-info .stage-tag { display: none; }
}
</style>
