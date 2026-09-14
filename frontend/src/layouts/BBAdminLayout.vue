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
            <div class="nav-section-title">赛季设置</div>
            <div v-for="item in stageItems" :key="item.text"
              class="nav-item" :class="{ active: item.path !== '#' && $route.path.startsWith(item.path) }"
              @click="item.click ? nextStage() : navigateTo(item.path)">
              <span class="nav-icon">{{ item.icon }}</span>
              <span class="nav-text">{{ item.text }}</span>
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

          <div v-for="grp in roundGroups" :key="grp.round" class="nav-section">
            <div class="nav-section-header" :class="{ current: grp.status === 'current' }"
              @click="toggleRound(grp.round)">
              <span class="collapse-icon" :class="{ collapsed: isRoundCollapsed(grp.round) }">▾</span>
              <span class="section-title">{{ grp.title }}</span>
              <span class="section-status" :class="grp.status">{{ grp.statusText }}</span>
            </div>
            <div v-show="!isRoundCollapsed(grp.round)" class="round-stages">
              <div v-for="it in grp.items" :key="it.stage"
                class="nav-item sub-item"
                :class="{ active: isStageActive(grp.round, it.stage), disabled: !it.clickable }"
                @click="navigateTo(it.path)">
                <span class="nav-icon">{{ it.icon }}</span>
                <span class="nav-text">{{ it.stageName }}</span>
                <span class="stage-status-dot" :class="it.status"></span>
              </div>
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useBbAuthStore } from '../stores/bbAuthStore'
import { useBbSeasonStore } from '../stores/bbSeasonStore'
import { useBbRealtimeStore } from '../stores/bbRealtimeStore'
import { BB_STAGE_NAME, type BBStageType } from '../types/bigbrother'
import { applyGamePageMeta } from '../router'

const router = useRouter()
const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()
const realtime = useBbRealtimeStore()

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
  { icon: '🎯', text: '赛季设置', path: '/games/bigbrother/admin/stage' },
  { icon: '🏁', text: '终局F3 / 冠军', path: '/games/bigbrother/admin/endgame' },
  { icon: '🏆', text: '季终结算', path: '/games/bigbrother/admin/season-result' },
  { icon: '▶️', text: '推进到下一阶段', path: '#', click: 'nextStage' },
]

const stageList = [
  { key: 'hoh_competition' as BBStageType, icon: '👑', text: 'HOH竞争', route: 'hoh' },
  { key: 'nomination' as BBStageType, icon: '📋', text: '提名仪式', route: 'nomination' },
  { key: 'veto_competition' as BBStageType, icon: '🛡️', text: '否决权竞争', route: 'veto-competition' },
  { key: 'veto_ceremony' as BBStageType, icon: '⚖️', text: '否决权会议', route: 'veto-ceremony' },
  { key: 'replacement_nom' as BBStageType, icon: '🔄', text: '替换提名', route: 'replacement-nom' },
  { key: 'eviction_vote' as BBStageType, icon: '🗳️', text: '淘汰投票', route: 'eviction-vote' },
  { key: 'eviction' as BBStageType, icon: '🚪', text: '淘汰结果', route: 'eviction' },
]

const otherItems = [
  { icon: '🏡', text: 'BB House 管理', path: '/games/bigbrother/admin/house-admin' },
  { icon: '💬', text: '房间聊天记录', path: '/games/bigbrother/admin/house-chat' },
  { icon: '😴', text: '睡眠/洗澡记录', path: '/games/bigbrother/admin/guest-states' },
  { icon: '🎮', text: '游戏库', path: '/games/bigbrother/admin/game-library' },
  { icon: '👁', text: '小游戏实时观战', path: '/games/bigbrother/admin/minigame-live' },
  { icon: '🎬', text: '小游戏复盘', path: '/games/bigbrother/admin/minigame-replay' },
  { icon: '📜', text: '操作日志', path: '/games/bigbrother/admin/logs' },
]

const adminStageMeta: Record<string, { icon: string; route: string }> = {
  hoh_competition: { icon: '👑', route: 'hoh' },
  nomination: { icon: '📋', route: 'nomination' },
  veto_competition: { icon: '🛡️', route: 'veto-competition' },
  veto_ceremony: { icon: '⚖️', route: 'veto-ceremony' },
  replacement_nom: { icon: '🔄', route: 'replacement-nom' },
  bbbb: { icon: '🎯', route: 'bbbb' },
  eviction_vote: { icon: '🗳️', route: 'eviction-vote' },
  eviction: { icon: '🚪', route: 'eviction' },
  final3: { icon: '🏁', route: 'endgame' },
  champion_vote: { icon: '🏆', route: 'endgame' },
}
const ENDGAME_STAGES = ['final3', 'champion_vote']

// 依据赛季配置（菜单）生成左侧树
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
        const meta = adminStageMeta[i.stage] || { icon: '•', route: i.stage }
        const isEnd = ENDGAME_STAGES.includes(i.stage)
        return {
          stage: i.stage,
          stageName: i.stageName,
          status: i.status,
          clickable: i.clickable,
          icon: meta.icon,
          path: isEnd
            ? `/games/bigbrother/admin/${meta.route}`
            : `/games/bigbrother/admin/round/${r}/${meta.route}`
        }
      })
    }
  })
})

const stageDisplay = computed(() => {
  return `第${seasonStore.currentRoundNumber}周 · ${seasonStore.stageName}`
})

// 浏览器标题随当前比赛/阶段动态变化
watch(stageDisplay, (v) => { applyGamePageMeta('bigbrother', v) }, { immediate: true })

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
  const st = stageList.find(s => s.key === stage)
  const routeName = st?.route || 'hoh'
  router.push(`/games/bigbrother/admin/round/${round}/${routeName}`)
}

async function nextStage() {
  mobileMenuOpen.value = false
  await seasonStore.nextStage()
}

async function handleLogout() {
  await authStore.logout()
  router.push('/games/bigbrother/login')
}

onMounted(async () => {
  await seasonStore.fetchProgress()
  await seasonStore.fetchMenu()
  initCollapsed()
  realtime.connect()
})

onUnmounted(() => {
  realtime.disconnect()
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
