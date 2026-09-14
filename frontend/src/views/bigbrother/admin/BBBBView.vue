<template>
  <div class="bbbb-admin">
    <div class="page-header">
      <h1>🎯 BBBB 环节</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
    </div>

    <div class="rule-bar">
      本轮提名 3 人。淘汰投票前进行 BBBB 比赛：胜者安全，其余 2 人进入淘汰投票。
    </div>

    <!-- 提名名单 -->
    <div class="card">
      <div class="card-title">被提名人（{{ nominees.length }}）</div>
      <div class="nominee-list">
        <div v-for="n in nominees" :key="n.id" class="nominee" :class="{ safe: bbbbWinnerId === n.id }">
          <BBAvatar :name="n.name" :avatar="n.avatar" size="sm" />
          <span class="nominee-name">{{ n.name }}</span>
          <span v-if="bbbbWinnerId === n.id" class="safe-badge">安全</span>
          <button v-else class="bb-btn bb-btn-xs" @click="setSafe(n)">设为安全（胜者）</button>
        </div>
        <div v-if="!nominees.length" class="muted">暂无提名（需先完成提名）</div>
      </div>
      <div v-if="bbbbWinnerId" class="safe-result">✅ 安全者（不再是终极提名，不可被投票，可参与投票）：{{ bbbbWinnerName }}</div>
    </div>

    <!-- 小游戏房间 -->
    <div class="card">
      <div class="card-title">BBBB 比赛房间</div>
      <div v-if="!activeRoom" class="room-actions">
        <button class="bb-btn bb-btn-primary" @click="showPicker = true">🎮 选择小游戏并创建房间</button>
      </div>
      <div v-else class="room-status">
        <span class="status-badge">{{ statusText }}</span>
        <span class="status-info">{{ activeRoom.minigameId }} · {{ activeRoom.participants?.length || 0 }}人</span>
        <button v-if="activeRoom.status === 'waiting'" class="bb-btn bb-btn-primary" @click="startRoom">▶ 开始</button>
        <button v-if="activeRoom.status === 'playing' || activeRoom.status === 'paused'" class="bb-btn bb-btn-danger" @click="stopRoom">⏹ 停止</button>
      </div>
      <div v-if="activeRoom && progress" class="progress">
        <div v-for="row in progressRows" :key="row.playerId" class="progress-row">
          <span>{{ row.playerName }}</span>
          <span class="p-label">{{ row.label || row.score }}</span>
          <button class="bb-btn bb-btn-xs" @click="setSafeById(row.playerId, row.playerName)">设为安全</button>
        </div>
      </div>
    </div>

    <MinigameSelectModal v-model:open="showPicker" title="选择 BBBB 小游戏" @select="onSelectMinigame" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  bbGetCurrentNomination, bbSetBbbbWinner, bbCreateMinigameRoom, bbStartMinigame,
  bbGetActiveMinigameRoom, bbGetMinigameRoomProgress, bbStopMinigame
} from '../../../services/bbApi'
import MinigameSelectModal from '../../../components/bigbrother/minigames/MinigameSelectModal.vue'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'

const route = useRoute()
const roundNum = computed(() => Number(route.params.round) || 1)

const nominees = ref<any[]>([])
const bbbbWinnerId = ref<string | null>(null)
const bbbbWinnerName = ref('')
const activeRoom = ref<any>(null)
const progress = ref<any>(null)
const showPicker = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const statusText = computed(() => {
  const s = activeRoom.value?.status
  return s === 'waiting' ? '等待中' : s === 'playing' ? '游戏中' : s === 'paused' ? '已暂停' : s === 'finished' ? '已结束' : (s || '')
})

const progressRows = computed(() => {
  if (!progress.value?.states) return []
  return Object.entries(progress.value.states).map(([playerId, st]: any) => ({
    playerId,
    playerName: progress.value.participants.find((p: any) => p.playerId === playerId)?.playerName || playerId,
    ...st
  }))
})

async function fetchData() {
  try {
    const nom = await bbGetCurrentNomination()
    nominees.value = (nom?.nomineeIds || []).map((id: string, i: number) => ({
      id,
      name: nom.nomineeNames?.[i] || id,
      avatar: null
    }))
    bbbbWinnerId.value = nom?.bbbbWinnerId || null
    bbbbWinnerName.value = nom?.bbbbWinnerName || ''
  } catch {}
  try { activeRoom.value = await bbGetActiveMinigameRoom('bbbb') } catch {}
}

async function onSelectMinigame(minigameId: string) {
  showPicker.value = false
  if (!nominees.value.length) { alert('暂无被提名人'); return }
  try {
    const room = await bbCreateMinigameRoom('bbbb' as any, minigameId, nominees.value.map(n => ({ playerId: n.id, playerName: n.name })))
    activeRoom.value = room
    startPolling()
  } catch (e: any) { alert(e?.message || '创建失败') }
}

async function startRoom() {
  if (!activeRoom.value) return
  try { await bbStartMinigame(activeRoom.value.roomId); activeRoom.value = { ...activeRoom.value, status: 'playing' } } catch (e: any) { alert(e?.message) }
}

async function stopRoom() {
  if (!activeRoom.value) return
  try { await bbStopMinigame(activeRoom.value.roomId); activeRoom.value = null } catch (e: any) { alert(e?.message) }
}

async function setSafe(n: { id: string; name: string }) { setSafeById(n.id, n.name) }

async function setSafeById(playerId: string, playerName: string) {
  try {
    await bbSetBbbbWinner(playerId, playerName)
    bbbbWinnerId.value = playerId
    alert(`${playerName} 已安全，其余 2 人进入淘汰投票`)
    await fetchData()
  } catch (e: any) { alert(e?.message || '设置失败') }
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    if (!activeRoom.value) return
    try { progress.value = await bbGetMinigameRoomProgress(activeRoom.value.roomId) } catch {}
  }, 1500)
}

onMounted(() => { fetchData(); startPolling() })
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })
</script>

<style scoped>
.bbbb-admin { max-width: 1000px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.page-header h1 { font-size: 22px; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; }
.rule-bar { background: #ffaa0014; border: 1px solid #ffaa0044; color: #ffaa00; border-radius: 10px; padding: 12px 18px; margin-bottom: 16px; font-size: 13px; }
.card { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 16px 20px; margin-bottom: 16px; }
.card-title { font-size: 15px; color: #e0e0e0; font-weight: 600; margin-bottom: 12px; }
.nominee-list { display: flex; flex-direction: column; gap: 8px; }
.nominee { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #ffffff06; border-radius: 8px; }
.nominee.safe { border: 1px solid #00ff88; }
.nominee-name { flex: 1; color: #ddd; }
.safe-badge { color: #00ff88; font-size: 12px; }
.muted { color: #666; font-size: 13px; }
.room-status { display: flex; align-items: center; gap: 12px; }
.status-badge { font-size: 12px; color: #00ff88; background: #00ff8815; padding: 2px 10px; border-radius: 4px; }
.status-info { flex: 1; color: #aaa; font-size: 13px; }
.progress { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.progress-row { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #ccc; }
.p-label { flex: 1; color: #888; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn-primary { border-color: #00ff88; background: #00ff8822; }
.bb-btn-danger { border-color: #ff444466; color: #ff6b6b; }
.bb-btn-xs { padding: 3px 10px; font-size: 11px; }
</style>
