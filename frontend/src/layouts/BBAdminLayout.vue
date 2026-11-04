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
          <button class="bb-btn bb-btn-sm bb-btn-summon" @click="summonPlayers">📢 召集</button>
          <button class="bb-btn bb-btn-sm" @click="openBroadcast">📣 广播</button>
          <button class="bb-btn bb-btn-sm" @click="openBroadcastHistory">📜 广播记录</button>
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
            <div v-for="item in otherItems" :key="item.text"
              class="nav-item" :class="{ active: item.path !== '#' && $route.path.startsWith(item.path) }"
              @click="item.click ? nextStage() : navigateTo(item.path)">
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

    <!-- 管理员广播弹窗 -->
    <Teleport to="body">
      <div v-if="broadcastOpen" class="bb-modal-overlay" @click.self="broadcastOpen = false">
        <div class="bb-modal">
          <div class="bb-modal-header">
            <h3>📣 管理员广播</h3>
            <button class="close-btn" @click="broadcastOpen = false">✕</button>
          </div>
          <div class="bb-modal-body">
            <div class="form-group">
              <label>广播类型</label>
              <select v-model="broadcastType" class="bb-select">
                <option value="notice">通知</option>
                <option value="invite">邀请所有人到房间</option>
              </select>
            </div>
            <div v-if="broadcastType === 'invite'" class="form-group">
              <label>目标房间</label>
              <select v-model="broadcastRoom" class="bb-select">
                <option value="">选择房间…</option>
                <option v-for="r in broadcastRooms" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>快速模板</label>
              <select v-model="broadcastTemplate" class="bb-select" @change="applyBroadcastTemplate">
                <option value="">选择模板…</option>
                <option value="hoh">开始 HOH 比赛</option>
                <option value="pov">开始 POV 比赛</option>
                <option value="bbbb">开始 BBBB 比赛</option>
                <option value="finale">开始终局比赛</option>
                <option value="end">今日比赛结束</option>
                <option value="nomination">开始提名仪式</option>
                <option value="veto_ceremony">开始否决权仪式</option>
                <option value="eviction_vote">开始淘汰投票</option>
                <option value="eviction">开始淘汰仪式</option>
                <option value="gather">请全体房客到客厅集合</option>
              </select>
            </div>
            <div class="form-group">
              <label>{{ broadcastType === 'invite' ? '附言（可选）' : '通知内容' }}</label>
              <textarea
                v-model="broadcastMessage"
                class="bb-input"
                rows="3"
                :placeholder="broadcastType === 'invite' ? '例如：请全体到客厅集合' : '输入要发送的通知内容'"
              ></textarea>
            </div>
            <div class="form-actions">
              <button class="bb-btn" @click="broadcastOpen = false">取消</button>
              <button
                class="bb-btn bb-btn-primary"
                :disabled="broadcastSending || (broadcastType === 'invite' ? !broadcastRoom : !broadcastMessage.trim())"
                @click="sendBroadcast"
              >{{ broadcastSending ? '发送中…' : '发送' }}</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 广播记录弹窗 -->
    <Teleport to="body">
      <div v-if="broadcastHistoryOpen" class="bb-modal-overlay" @click.self="broadcastHistoryOpen = false">
        <div class="bb-modal">
          <div class="bb-modal-header">
            <h3>📜 广播通知记录</h3>
            <button class="close-btn" @click="broadcastHistoryOpen = false">✕</button>
          </div>
          <div class="bb-modal-body">
            <div class="bh-actions">
              <button
                class="bb-btn bb-btn-danger bb-btn-sm"
                :disabled="!broadcastHistory.length || broadcastHistoryLoading"
                @click="clearBroadcastHistory"
              >🗑 清空全部</button>
            </div>
            <div class="bh-list">
              <div v-for="b in broadcastHistory" :key="b.id" class="bh-item">
                <div class="bh-top">
                  <span class="bh-time">{{ formatBroadcastTime(b.createdAt) }}</span>
                  <button class="bh-del" title="删除这条记录" @click="deleteBroadcast(b)">删除</button>
                </div>
                <div class="bh-message">
                  {{ b.message }}
                  <span v-if="b.type === 'invite' && b.roomName" class="bh-room">（邀请至 {{ b.roomName }}）</span>
                </div>
                <div class="bh-from">—— {{ b.from || '管理员' }}</div>
              </div>
              <div v-if="broadcastHistoryLoading" class="bh-empty">加载中…</div>
              <div v-else-if="!broadcastHistory.length" class="bh-empty">暂无广播记录</div>
            </div>
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
import { BB_STAGE_NAME, type BBStageType } from '../types/bigbrother'
import { applyGamePageMeta } from '../router'
import { bbSummonPage } from '../services/bbApi'
import { bbGetHouseRooms, bbAdminBroadcast, bbGetBroadcastHistory, bbDeleteBroadcast, bbClearBroadcasts } from '../services/bbHouseApi'

const router = useRouter()
const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()
const realtime = useBbRealtimeStore()

const mobileMenuOpen = ref(false)
const collapsedRounds = ref<Set<number>>(new Set())

// 顶部广播弹窗
const broadcastOpen = ref(false)
const broadcastType = ref<'notice' | 'invite'>('notice')
const broadcastRoom = ref('')
const broadcastMessage = ref('')
const broadcastRooms = ref<any[]>([])
const broadcastSending = ref(false)
const broadcastTemplate = ref('')

// 广播记录
const broadcastHistoryOpen = ref(false)
const broadcastHistory = ref<any[]>([])
const broadcastHistoryLoading = ref(false)

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

const fixedItemsAll = [
  { icon: '📊', text: '总览', path: '/games/bigbrother/admin/dashboard', perm: 'dashboard' },
  { icon: '👥', text: '房客管理', path: '/games/bigbrother/admin/houseguests', perm: 'houseguests' },
]

const stageItemsAll = [
  { icon: '🎯', text: '赛季设置', path: '/games/bigbrother/admin/stage', perm: 'stage' },
  { icon: '🏁', text: '终局F3 / 冠军', path: '/games/bigbrother/admin/endgame', perm: 'endgame' },
  { icon: '🏆', text: '季终结算', path: '/games/bigbrother/admin/season-result', perm: 'season-result' },
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

const otherItemsAll = [
  { icon: '🏡', text: 'BB House 管理', path: '/games/bigbrother/admin/house-admin', perm: 'house' },
  { icon: '💬', text: '房间聊天记录', path: '/games/bigbrother/admin/house-chat', perm: 'chat' },
  { icon: '😴', text: '睡眠/洗澡记录', path: '/games/bigbrother/admin/guest-states', perm: 'guest-states' },
  { icon: '🎮', text: '游戏库', path: '/games/bigbrother/admin/game-library', perm: 'game-library' },
  { icon: '👁', text: '小游戏实时观战', path: '/games/bigbrother/admin/minigame-live', perm: 'minigame' },
  { icon: '🎬', text: '小游戏复盘', path: '/games/bigbrother/admin/minigame-replay', perm: 'minigame' },
  { icon: '📜', text: '操作日志', path: '/games/bigbrother/admin/logs', perm: 'logs' },
  { icon: '▶️', text: '推进到下一阶段', path: '#', click: 'nextStage', perm: 'stage' },
]

// ===== 管理员权限过滤（权限为空 = 全部可见）=====
const adminPerms = computed<string[]>(() => (authStore.currentUser?.permissions as string[]) || [])
function hasPerm(perm: string): boolean {
  return adminPerms.value.length === 0 || adminPerms.value.includes(perm)
}
const fixedItems = computed(() => fixedItemsAll.filter(i => hasPerm(i.perm)))
const stageItems = computed(() => stageItemsAll.filter(i => hasPerm(i.perm)))
const otherItems = computed(() => otherItemsAll.filter(i => hasPerm(i.perm)))

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

async function summonPlayers() {
  const cur = route.path
  let playerPath = '/games/bigbrother/player/home'
  const roundMatch = cur.match(/\/admin\/round\/(\d+)\/([a-z-]+)/)
  if (roundMatch) {
    playerPath = `/games/bigbrother/player/round/${roundMatch[1]}/${roundMatch[2]}`
  } else if (cur.includes('/admin/endgame') || cur.includes('/admin/season-result')) {
    playerPath = '/games/bigbrother/player/finale'
  } else if (cur.includes('/admin/house')) {
    playerPath = '/games/bigbrother/player/house'
  }
  try { await bbSummonPage(playerPath); alert('已召集所有选手前往该页面') }
  catch (e: any) { alert(e?.message || '召集失败') }
}

async function openBroadcast() {
  broadcastOpen.value = true
  if (!broadcastRooms.value.length) {
    try { broadcastRooms.value = await bbGetHouseRooms() || [] } catch { broadcastRooms.value = [] }
  }
}

function applyBroadcastTemplate() {
  const key = broadcastTemplate.value
  if (!key) return
  const now = new Date()
  const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const map: Record<string, string> = {
    hoh: `${t}开始HOH比赛`,
    pov: `${t}开始POV比赛`,
    bbbb: `${t}开始BBBB比赛`,
    finale: `${t}开始终局比赛`,
    end: '今日比赛结束',
    nomination: `${t}开始提名仪式`,
    veto_ceremony: `${t}开始否决权仪式`,
    eviction_vote: `${t}开始淘汰投票`,
    eviction: `${t}开始淘汰仪式`,
    gather: '请全体房客到客厅集合'
  }
  broadcastMessage.value = map[key] || ''
  broadcastTemplate.value = ''
}

function formatBroadcastTime(t: string) {
  if (!t) return ''
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function loadBroadcastHistory() {
  broadcastHistoryLoading.value = true
  try {
    broadcastHistory.value = await bbGetBroadcastHistory(100) || []
  } catch {
    broadcastHistory.value = []
  } finally {
    broadcastHistoryLoading.value = false
  }
}

async function openBroadcastHistory() {
  broadcastHistoryOpen.value = true
  await loadBroadcastHistory()
}

async function deleteBroadcast(b: any) {
  if (!confirm('确定删除这条广播记录吗？')) return
  try {
    await bbDeleteBroadcast(b.id)
    broadcastHistory.value = broadcastHistory.value.filter(x => x.id !== b.id)
  } catch (e: any) {
    alert(e?.message || '删除失败')
  }
}

async function clearBroadcastHistory() {
  if (!broadcastHistory.value.length) return
  if (!confirm(`确定清空全部 ${broadcastHistory.value.length} 条广播记录吗？此操作不可恢复。`)) return
  try {
    await bbClearBroadcasts()
    broadcastHistory.value = []
  } catch (e: any) {
    alert(e?.message || '清空失败')
  }
}

async function sendBroadcast() {
  if (broadcastType.value === 'invite' && !broadcastRoom.value) return
  if (broadcastType.value === 'notice' && !broadcastMessage.value.trim()) return
  if (broadcastSending.value) return
  broadcastSending.value = true
  try {
    await bbAdminBroadcast({
      type: broadcastType.value,
      roomId: broadcastType.value === 'invite' ? broadcastRoom.value : null,
      message: broadcastMessage.value
    })
    broadcastMessage.value = ''
    broadcastOpen.value = false
    alert('广播已发送')
  } catch (e: any) {
    alert(e?.message || '发送失败')
  } finally {
    broadcastSending.value = false
  }
}

async function handleLogout() {
  await authStore.logout()
  router.push('/games/bigbrother/admin/login')
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
  color: #ece7fb;
  font-family: var(--bb-font-body, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif);
  background:
    radial-gradient(1100px 620px at 82% 0%, rgba(120, 66, 150, 0.3) 0%, transparent 60%),
    radial-gradient(900px 520px at 4% 100%, rgba(120, 60, 60, 0.22) 0%, transparent 62%),
    linear-gradient(160deg, #170d28 0%, #241630 48%, #120a1a 100%);
  background-attachment: fixed;
}
.bb-header {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 60px;
  background: linear-gradient(135deg, rgba(46, 28, 62, 0.96) 0%, rgba(24, 14, 36, 0.96) 100%);
  border-bottom: 1px solid rgba(230, 201, 136, 0.26);
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
.logo-section {
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo-icon { font-size: 22px; }
.logo-text {
  font-family: var(--bb-font-display, 'Cinzel', Georgia, serif);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1.2px;
  background: linear-gradient(90deg, #f6efdb, #e6c988 55%, #d1a25e);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stage-tag {
  background: rgba(230, 201, 136, 0.12);
  color: #e6c988;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid rgba(230, 201, 136, 0.35);
}
.user-name { font-size: 14px; color: #b3a6d6; }
.bb-btn {
  background: transparent;
  border: 1px solid #b39bff44;
  color: #b39bff;
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.bb-btn:hover { background: #b39bff22; }
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
  background: #b39bff;
  border-radius: 2px;
}
.layout-body {
  display: flex;
  padding-top: 60px;
}
.bb-sider {
  width: 240px;
  height: calc(100vh - 60px);
  position: sticky;
  top: 60px;
  align-self: flex-start;
  background: rgba(26, 15, 36, 0.8);
  border-right: 1px solid rgba(230, 201, 136, 0.16);
  backdrop-filter: blur(10px);
  overflow-y: auto;
  overscroll-behavior: contain;
  transition: transform 0.3s;
}
.bb-sider::-webkit-scrollbar { width: 8px; }
.bb-sider::-webkit-scrollbar-track { background: #120a22; }
.bb-sider::-webkit-scrollbar-thumb { background: #b39bff44; border-radius: 4px; }
.bb-sider::-webkit-scrollbar-thumb:hover { background: #b39bff77; }
.sider-nav { padding: 12px 0; }
.nav-section { margin-bottom: 8px; }
.nav-section-title {
  padding: 8px 16px 4px;
  font-size: 11px;
  color: #6b5f92;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.nav-section-header {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  color: #a99bd0;
  transition: all 0.2s;
}
.nav-section-header:hover { color: #b39bff; }
.nav-section-header.current { color: #e6c988; }
.collapse-icon {
  font-size: 10px;
  margin-right: 6px;
  transition: transform 0.2s;
}
.collapse-icon.collapsed { transform: rotate(-90deg); }
.section-title { flex: 1; }
.section-status { font-size: 11px; }
.section-status.completed { color: #b39bff; }
.section-status.current { color: #e6c988; }
.section-status.future { color: #5c5182; }
.nav-item {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 13px;
  color: #a99bd0;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}
.nav-item:hover {
  background: #b39bff08;
  color: #ece7fb;
}
.nav-item.active {
  background: rgba(230, 201, 136, 0.1);
  color: #e9d3a0;
  border-left-color: #e6c988;
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
.stage-status-dot.completed { background: #b39bff; }
.stage-status-dot.current { background: #e6c988; animation: pulse 2s infinite; }
.stage-status-dot.future { background: #3a2f5c; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.bb-main {
  flex: 1;
  padding: 24px;
  min-height: calc(100vh - 60px);
  overflow-y: auto;
}
/* 顶部广播弹窗 */
.bb-modal-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7);
  display: flex; align-items: center; justify-content: center; z-index: 2000;
}
.bb-modal {
  background: #2a1a4a; border: 1px solid #b39bff44;
  border-radius: 12px; width: 420px; max-width: 92vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.bb-modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid #b39bff22;
}
.bb-modal-header h3 { margin: 0; color: #e6c988; font-size: 16px; }
.close-btn { background: none; border: none; color: #8f83b8; cursor: pointer; font-size: 18px; }
.bb-modal-body { padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; color: #a99bd0; margin-bottom: 6px; }
.bb-select, .bb-input {
  width: 100%; box-sizing: border-box;
  background: #1b1130; border: 1px solid #b39bff33; color: #ece7fb;
  padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none;
  font-family: inherit; resize: vertical;
}
.bb-select:focus, .bb-input:focus { border-color: #b39bff; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
.bb-btn-primary { background: #b39bff22; border-color: #b39bff; }
.bb-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 广播记录 */
.bh-actions { display: flex; justify-content: flex-end; margin-bottom: 8px; }
.bh-list { max-height: 60vh; overflow-y: auto; }
.bh-item {
  padding: 10px 12px; margin-bottom: 8px;
  background: #ffffff06; border: 1px solid #ffffff10; border-radius: 8px;
}
.bh-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.bh-time { font-size: 11px; color: #7fb0ff; font-variant-numeric: tabular-nums; }
.bh-del {
  background: transparent; border: 1px solid #ff444455; color: #ff6b6b;
  border-radius: 5px; padding: 1px 8px; font-size: 11px; cursor: pointer;
}
.bh-del:hover { background: #ff444422; }
.bb-btn-sm { padding: 4px 10px; font-size: 12px; }
.bb-btn-danger { border-color: #ff444466; color: #ff6b6b; }
.bb-btn-danger:hover { background: #ff444422; }
.bh-message { font-size: 13px; color: #ece7fb; margin-top: 3px; line-height: 1.45; word-break: break-word; }
.bh-room { color: #e6c988; }
.bh-from { font-size: 11px; color: #6b5f92; margin-top: 4px; text-align: right; }
.bh-empty { color: #6b5f92; font-size: 13px; text-align: center; padding: 24px 0; }

@media (max-width: 768px) {
  .mobile-menu-btn { display: flex; }
  .bb-sider {
    position: fixed;
    top: 60px; left: 0;
    z-index: 99;
    transform: translateX(-100%);
  }
  .bb-sider.open { transform: translateX(0); }
  .bb-main { padding: 16px; }
  .header-content { padding: 0 12px; }
  .header-info { gap: 6px; }
  .header-info .stage-tag,
  .header-info .user-name { display: none; }
  .header-info .bb-btn { padding: 6px 9px; font-size: 12px; white-space: nowrap; }
  .logo-text { font-size: 15px; }
  .bb-modal-body { padding: 14px; }
  .bh-list { max-height: 52vh; }
}
@media (max-width: 430px) {
  .logo-text { display: none; }
  .logo-icon { font-size: 20px; }
  .header-info .bb-btn { padding: 5px 7px; font-size: 11px; }
  .bb-modal { width: 94vw; }
  .bb-modal-header { padding: 12px 14px; }
  .bb-modal-body { padding: 12px; }
}
</style>
