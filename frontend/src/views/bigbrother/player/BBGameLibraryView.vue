<template>
  <div class="bb-game-library">
    <!-- 牌桌/等待房 -->
    <div v-if="activeRoomId" class="room-view">
      <div class="room-view-head">
        <button class="bb-btn bb-btn-sm" @click="leaveCurrentRoom">← 返回大厅</button>
        <span class="room-status-tag" :class="room?.status">{{ statusLabel(room?.status) }}</span>
      </div>
      <Poker17Game
        :roomId="activeRoomId"
        :participants="room?.participants || []"
        :hostId="room?.hostId || null"
        :roomStatus="room?.status || ''"
        standalone
        @leave="leaveCurrentRoom"
        @room-changed="onRoomChanged"
        @finished="onGameFinished"
      />
    </div>

    <!-- 17 Poker 牌桌大厅 -->
    <div v-else class="lobby">
      <div class="page-head">
        <div>
          <h1>17 Poker</h1>
          <p class="page-sub">双人牌桌 · 10 局 · 初始 100 筹码</p>
        </div>
        <button class="bb-btn bb-btn-sm" @click="refreshAll">刷新</button>
      </div>

      <div v-if="error" class="lobby-error">⚠️ {{ error }}</div>

      <div class="library-grid">
        <div class="game-card poker">
          <div class="game-card-glow"></div>
          <div class="game-card-head">
            <div class="game-icon">🃏</div>
            <div class="game-tags">
              <span class="tag">双人</span>
              <span class="tag gold">10局</span>
              <span class="tag">策略</span>
            </div>
          </div>
          <h2>17 Poker</h2>
          <p class="game-desc">
            17 张特殊牌库（A/K/Q/J 四花色 + Joker）。每人初始 100 筹码，每局底注 5 直接进入底池，
            系统不抽水。两轮下注与换牌后摊牌比牌型。
          </p>
          <p class="game-desc">
            胜负判定：10 局内一方筹码归零，另一方直接获胜；10 局后筹码更多者获胜；
            若筹码相同，则第 10 局筹码增加的一方获胜。
          </p>
          <div class="game-rules">
            <span>🃏 Joker 万能</span>
            <span>🪙 底注进底池</span>
            <span>🔁 最多换 7 张</span>
            <span>🚫 无抽水</span>
          </div>
          <div class="game-actions">
            <button v-if="myRoom" class="bb-btn bb-btn-primary" @click="openRoom(myRoom.roomId)">
              继续我的房间
            </button>
            <button v-else class="bb-btn bb-btn-primary" :disabled="creating" @click="createRoom">
              {{ creating ? '创建中…' : '创建房间' }}
            </button>
            <button v-if="myRoom" class="bb-btn" :disabled="creating" @click="createRoom">新建房间</button>
          </div>
        </div>

        <div class="join-card">
          <h3>加入好友的房间</h3>
          <p>输入房主分享的房间号，即可加入等待中的牌桌。</p>
          <div class="join-row">
            <input v-model.trim="joinCode" class="bb-input" placeholder="粘贴房间号" @keyup.enter="joinByCode" />
            <button class="bb-btn bb-btn-primary" :disabled="joining || !joinCode" @click="joinByCode">
              {{ joining ? '加入中…' : '加入房间' }}
            </button>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>开放中的房间</h2>
        <div v-if="rooms.length === 0" class="empty">暂无开放房间，创建一个房间邀请好友吧。</div>
        <div v-else class="room-list">
          <div v-for="r in rooms" :key="r.roomId" class="room-row">
            <div class="room-players">
              <BBAvatar
                v-for="p in r.participants"
                :key="p.playerId"
                :name="p.playerName"
                :avatar="p.avatar || avatarDirectory[p.playerId]"
                size="sm"
              />
              <div v-if="r.participants.length < 2" class="room-empty-slot">＋</div>
            </div>
            <div class="room-info">
              <div class="room-title">
                房主：{{ hostName(r) }}
                <span v-if="isMyRoom(r)" class="mine-tag">我的房间</span>
              </div>
              <div class="room-meta">
                <span>{{ r.participants.length }} / 2 人</span>
                <span class="dot">·</span>
                <span>{{ statusLabel(r.status) }}</span>
                <span class="dot">·</span>
                <span>{{ formatTime(r.createdAt) }}</span>
              </div>
            </div>
            <button
              class="bb-btn bb-btn-sm"
              :class="{ 'bb-btn-primary': canJoin(r) }"
              :disabled="!canJoin(r) && !isMyRoom(r)"
              @click="onRoomAction(r)"
            >
              {{ roomActionLabel(r) }}
            </button>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>最近战绩</h2>
        <div v-if="records.length === 0" class="empty">暂无 17 Poker 比赛记录。</div>
        <div v-else class="record-list">
          <div v-for="rec in records" :key="rec.id" class="record-row">
            <div class="record-icon">🏆</div>
            <div class="record-main">
              <div class="record-winner">
                {{ winnerNames(rec) || '无胜者' }}
                <span v-if="rec.finalResult?.isTie" class="tie-tag">并列</span>
              </div>
              <div class="record-meta">
                {{ rec.participants?.map((p: any) => p.playerName).join(' vs ') }}
                <span class="dot">·</span>
                {{ formatDate(rec.endedAt || rec.startedAt) }}
              </div>
            </div>
            <div class="record-score">
              <span v-for="p in rec.participants || []" :key="p.playerId" class="record-chip">
                {{ p.playerName }}: {{ rec.finalResult?.chips?.[p.playerId] ?? rec.scores?.[p.playerId] ?? '-' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'
import Poker17Game from '../../../components/bigbrother/minigames/Poker17Game.vue'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import {
  bbGetPoker17Rooms, bbGetPoker17MyRoom, bbGetPoker17Room,
  bbCreatePoker17Room, bbJoinPoker17Room, bbLeavePoker17Room,
  bbGetPoker17Records, bbGetActiveHouseguests, type Poker17RoomSummary
} from '../../../services/bbApi'

const route = useRoute()
const router = useRouter()
const authStore = useBbAuthStore()
const myId = computed(() => authStore.currentUser?.id || '')

const rooms = ref<Poker17RoomSummary[]>([])
const myRoom = ref<Poker17RoomSummary | null>(null)
const room = ref<Poker17RoomSummary | null>(null)
const records = ref<any[]>([])
const joinCode = ref('')
const creating = ref(false)
const joining = ref(false)
const error = ref('')
const avatarDirectory = ref<Record<string, string | null>>({})

const activeRoomId = computed(() => {
  const value = route.query.room
  return typeof value === 'string' ? value : ''
})

let pollTimer: ReturnType<typeof setInterval> | null = null

function statusLabel(status?: string) {
  return ({
    waiting: '等待玩家',
    countdown: '倒计时',
    playing: '进行中',
    paused: '已暂停',
    finished: '已结束'
  } as Record<string, string>)[status || ''] || status || ''
}

function hostName(r: Poker17RoomSummary) {
  return r.participants.find(p => p.playerId === r.hostId)?.playerName || '—'
}
function isMyRoom(r: Poker17RoomSummary) {
  return r.participants.some(p => p.playerId === myId.value)
}
function canJoin(r: Poker17RoomSummary) {
  return r.status === 'waiting' && r.participants.length < 2 && !isMyRoom(r)
}
function roomActionLabel(r: Poker17RoomSummary) {
  if (isMyRoom(r)) return r.status === 'waiting' ? '进入房间' : '继续游戏'
  if (r.status !== 'waiting') return '进行中'
  if (r.participants.length >= 2) return '已满'
  return '加入'
}
function onRoomAction(r: Poker17RoomSummary) {
  if (isMyRoom(r)) return openRoom(r.roomId)
  if (canJoin(r)) return joinRoom(r)
}

function formatTime(ms?: number | null) {
  if (!ms) return ''
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function formatDate(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function winnerNames(rec: any): string {
  const fr = rec?.finalResult
  if (fr?.winnerNames?.length) return fr.winnerNames.join('、')
  return rec?.winner?.playerName || ''
}

async function fetchRooms() {
  try { rooms.value = await bbGetPoker17Rooms() } catch {}
}
async function fetchMyRoom() {
  try { myRoom.value = await bbGetPoker17MyRoom() } catch {}
}
async function fetchRecords() {
  try { records.value = await bbGetPoker17Records(10) } catch {}
}
async function fetchAvatarDirectory() {
  try {
    const list = await bbGetActiveHouseguests()
    const map: Record<string, string | null> = {}
    for (const h of (list || [])) {
      if (h?.id) map[h.id] = h.avatar || null
    }
    avatarDirectory.value = map
  } catch {}
}
async function refreshAll() {
  await Promise.all([fetchRooms(), fetchMyRoom(), fetchRecords(), fetchAvatarDirectory()])
}

async function fetchActiveRoom(roomId: string) {
  error.value = ''
  try {
    const data = await bbGetPoker17Room(roomId)
    if (!data.participants.some(p => p.playerId === myId.value)) {
      error.value = '你不在该房间中'
      room.value = null
      await router.replace({ path: route.path })
      return
    }
    if (data.status === 'finished') {
      // 刷新/回访已结束房间时，若已经开启“再来一局”，自动切换到新房间。
      try {
        const active = await bbGetPoker17MyRoom()
        if (active && active.roomId !== roomId && active.status !== 'finished') {
          room.value = active
          await router.replace({ path: route.path, query: { room: active.roomId } })
          return
        }
      } catch {}
      error.value = '该房间的比赛已结束，请返回大厅查看战绩'
      room.value = null
      await router.replace({ path: route.path })
      return
    }
    room.value = data
  } catch (e: any) {
    error.value = e?.message || '房间不存在或已结束'
    room.value = null
    await router.replace({ path: route.path })
  }
}

function openRoom(roomId: string) {
  if (!roomId) return
  router.push({ path: route.path, query: { room: roomId } })
}

async function createRoom() {
  if (creating.value) return
  creating.value = true
  error.value = ''
  try {
    const roomData = await bbCreatePoker17Room()
    if (roomData?.roomId) {
      await fetchRooms()
      openRoom(roomData.roomId)
    }
  } catch (e: any) {
    error.value = e?.message || '创建房间失败'
  } finally {
    creating.value = false
  }
}

async function joinRoom(r: Poker17RoomSummary) {
  if (joining.value) return
  joining.value = true
  error.value = ''
  try {
    const roomData = await bbJoinPoker17Room(r.roomId)
    if (roomData?.roomId) openRoom(roomData.roomId)
  } catch (e: any) {
    error.value = e?.message || '加入房间失败'
  } finally {
    joining.value = false
  }
}

async function joinByCode() {
  const code = joinCode.value.trim()
  if (!code || joining.value) return
  joining.value = true
  error.value = ''
  try {
    const roomData = await bbJoinPoker17Room(code)
    if (roomData?.roomId) {
      joinCode.value = ''
      openRoom(roomData.roomId)
    }
  } catch (e: any) {
    error.value = e?.message || '房间号无效或房间已满'
  } finally {
    joining.value = false
  }
}

async function leaveCurrentRoom() {
  const id = activeRoomId.value
  if (id) {
    const status = room.value?.status
    if ((status === 'playing' || status === 'countdown' || status === 'paused') &&
      !window.confirm('比赛仍在进行，离开后可以从大厅重新进入。确定离开吗？')) {
      return
    }
    try { await bbLeavePoker17Room(id) } catch {}
  }
  room.value = null
  await router.replace({ path: route.path })
  await refreshAll()
}

function onRoomChanged(roomData: Poker17RoomSummary) {
  if (!roomData?.roomId) return
  room.value = roomData
  router.replace({ path: route.path, query: { room: roomData.roomId } })
}

function onGameFinished() {
  fetchRecords()
}

watch(activeRoomId, (id) => {
  if (id) fetchActiveRoom(id)
  else room.value = null
}, { immediate: true })

onMounted(async () => {
  await refreshAll()
  pollTimer = setInterval(() => {
    if (!activeRoomId.value) {
      fetchRooms()
      fetchMyRoom()
    }
  }, 5000)
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<style scoped>
.bb-game-library { max-width: 1040px; margin: 0 auto; }
.lobby { padding-bottom: 40px; }
.page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 22px; }
.page-head h1 { margin: 0 0 6px; font-size: 26px; color: #ece7fb; }
.page-sub { margin: 0; color: #8f83b8; font-size: 13px; }
.bb-btn { background: transparent; border: 1px solid #b39bff44; color: #b39bff; padding: 8px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
.bb-btn:hover:not(:disabled) { background: #b39bff18; border-color: #b39bff; }
.bb-btn-primary { background: linear-gradient(135deg, #b39bff33, #7b5cd622); border-color: #b39bff; color: #e3d9ff; font-weight: 600; }
.bb-btn-sm { padding: 6px 14px; font-size: 12px; }
.bb-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.bb-input { background: #120a22; border: 1px solid #b39bff33; border-radius: 8px; color: #ece7fb; padding: 10px 12px; font-size: 13px; outline: none; }
.bb-input:focus { border-color: #b39bff; }
.lobby-error { background: #ff444422; border: 1px solid #ff444466; color: #ffb4b4; padding: 10px 14px; border-radius: 10px; margin-bottom: 16px; font-size: 13px; }

.library-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px; margin-bottom: 28px; }
.game-card { position: relative; overflow: hidden; background: linear-gradient(155deg, #241640, #170e2a); border: 1px solid #b39bff44; border-radius: 18px; padding: 22px; }
.game-card-glow { position: absolute; top: -80px; right: -60px; width: 220px; height: 220px; background: radial-gradient(circle, #b39bff44, transparent 70%); pointer-events: none; }
.game-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.game-icon { font-size: 48px; line-height: 1; filter: drop-shadow(0 6px 16px #b39bff55); }
.game-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.tag { font-size: 11px; padding: 2px 9px; border-radius: 999px; background: #b39bff15; color: #b39bff; border: 1px solid #b39bff33; }
.tag.gold { background: #e6c98815; color: #e6c988; border-color: #e6c98844; }
.game-card h2 { margin: 0 0 8px; font-size: 24px; color: #f0eadf; }
.game-desc { margin: 0 0 12px; font-size: 13px; line-height: 1.8; color: #a99bd0; }
.game-rules { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
.game-rules span { font-size: 11px; color: #8f83b8; background: #ffffff06; border: 1px solid #ffffff10; border-radius: 6px; padding: 3px 8px; }
.game-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.join-card { background: #17112a88; border: 1px solid #b39bff22; border-radius: 18px; padding: 22px; align-self: start; }
.join-card h3 { margin: 0 0 8px; font-size: 16px; color: #ece7fb; }
.join-card p { margin: 0 0 16px; font-size: 12px; line-height: 1.7; color: #8f83b8; }
.join-row { display: flex; gap: 8px; }
.join-row .bb-input { flex: 1; min-width: 0; }

.section { margin-top: 26px; }
.section h2 { font-size: 17px; color: #ece7fb; margin: 0 0 12px; }
.empty { color: #6b5f92; font-size: 13px; padding: 22px; text-align: center; background: #ffffff03; border: 1px dashed #ffffff12; border-radius: 12px; }
.room-list { display: flex; flex-direction: column; gap: 8px; }
.room-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: #17112a77; border: 1px solid #b39bff1a; border-radius: 12px; }
.room-players { display: flex; align-items: center; gap: 6px; min-width: 80px; }
.room-empty-slot { width: 36px; height: 36px; border-radius: 50%; border: 1px dashed #b39bff44; color: #6b5f92; display: flex; align-items: center; justify-content: center; }
.room-info { flex: 1; min-width: 0; }
.room-title { font-size: 13px; color: #ece7fb; display: flex; align-items: center; gap: 8px; }
.mine-tag { font-size: 10px; color: #e6c988; background: #e6c98818; border-radius: 999px; padding: 1px 7px; }
.room-meta { margin-top: 4px; font-size: 11px; color: #8f83b8; display: flex; gap: 6px; flex-wrap: wrap; }
.dot { color: #4a3d6e; }

.record-list { display: flex; flex-direction: column; gap: 8px; }
.record-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: #17112a77; border: 1px solid #ffffff0d; border-radius: 12px; }
.record-icon { font-size: 22px; }
.record-main { flex: 1; min-width: 0; }
.record-winner { font-size: 13px; color: #ece7fb; }
.tie-tag { font-size: 10px; color: #b39bff; margin-left: 6px; }
.record-meta { margin-top: 4px; font-size: 11px; color: #8f83b8; display: flex; gap: 6px; flex-wrap: wrap; }
.record-score { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.record-chip { font-size: 11px; color: #e6c988; background: #e6c98810; border-radius: 6px; padding: 3px 8px; }

.room-view-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.room-status-tag { font-size: 12px; padding: 4px 12px; border-radius: 999px; background: #ffffff08; color: #a99bd0; border: 1px solid #ffffff14; }
.room-status-tag.waiting { color: #e6c988; border-color: #e6c98844; background: #e6c98810; }
.room-status-tag.playing, .room-status-tag.countdown { color: #7ee0b0; border-color: #7ee0b044; background: #7ee0b010; }
.room-status-tag.finished { color: #8f83b8; }

@media (max-width: 820px) {
  .library-grid { grid-template-columns: 1fr; }
  .room-row { flex-wrap: wrap; }
  .record-score { justify-content: flex-start; }
}
</style>
