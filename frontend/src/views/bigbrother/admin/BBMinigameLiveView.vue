<template>
  <div class="mg-live">
    <div class="page-header">
      <h1>小游戏实时观战</h1>
      <button class="bb-btn" @click="refresh">🔄 刷新</button>
    </div>

    <div class="live-layout">
      <div class="rooms-panel">
        <div class="panel-title">进行中的比赛（{{ rooms.length }}）</div>
        <div v-if="!rooms.length" class="empty-hint">当前没有活跃比赛房间</div>
        <div
          v-for="r in rooms"
          :key="r.roomId"
          class="room-item"
          :class="{ active: selectedRoomId === r.roomId }"
          @click="selectRoom(r)"
        >
          <div class="ri-top">
            <span class="ri-name">{{ r.minigameName || r.minigameId }}</span>
            <span class="ri-status" :class="r.status">{{ statusText(r.status) }}</span>
          </div>
          <div class="ri-meta">
            {{ gameTypeLabel(r.gameType) }} · {{ r.participants?.length || 0 }}人 · 事件 {{ r.eventCount }}
            <span v-if="r.targetScore"> · 目标 {{ r.targetScore }}</span>
          </div>
        </div>
      </div>

      <div class="observer-panel">
        <MinigameObserver v-if="selectedRoomId" :roomId="selectedRoomId" :room="selectedRoom" />
        <div v-else class="empty-hint">选择左侧房间开始观战</div>

        <div v-if="selectedRoomId" class="controls">
          <button v-if="selectedRoom?.status === 'waiting'" class="bb-btn bb-btn-primary" @click="start">▶ 开始比赛</button>
          <button v-if="selectedRoom?.status === 'playing'" class="bb-btn bb-btn-warn" @click="pause">⏸ 暂停</button>
          <button v-if="selectedRoom?.status === 'paused'" class="bb-btn bb-btn-primary" @click="resume">▶ 恢复</button>
          <button v-if="selectedRoom && ['waiting','playing','paused'].includes(selectedRoom.status)" class="bb-btn bb-btn-danger" @click="stop">⏹ 停止</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { bbGetActiveMinigameRooms, bbStartMinigame, bbPauseMinigame, bbResumeMinigame, bbStopMinigame } from '../../../services/bbApi'
import MinigameObserver from '../../../components/bigbrother/MinigameObserver.vue'

const rooms = ref<any[]>([])
const selectedRoomId = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

const selectedRoom = computed(() => rooms.value.find(r => r.roomId === selectedRoomId.value) || null)

function statusText(s: string) {
  return ({ waiting: '等待中', countdown: '倒计时', playing: '进行中', paused: '已暂停', finished: '已结束' } as Record<string, string>)[s] || s
}
function gameTypeLabel(t: string) {
  return ({ hoh: 'HOH', veto: '否决权', bbbb: 'BBBB', finale: '终局' } as Record<string, string>)[t] || t
}

async function refresh() {
  try {
    const list = await bbGetActiveMinigameRooms()
    rooms.value = (list || []).filter(r => r.status !== 'finished')
    if (selectedRoomId.value && !rooms.value.find(r => r.roomId === selectedRoomId.value)) {
      selectedRoomId.value = null
    }
    if (!selectedRoomId.value && rooms.value.length) {
      const playing = rooms.value.find(r => r.status === 'playing') || rooms.value[0]
      selectedRoomId.value = playing.roomId
    }
  } catch {}
}

function selectRoom(r: any) { selectedRoomId.value = r.roomId }

async function start() {
  if (!selectedRoomId.value) return
  try { await bbStartMinigame(selectedRoomId.value); await refresh() } catch (e: any) { alert(e?.message || '失败') }
}
async function pause() {
  if (!selectedRoomId.value) return
  try { await bbPauseMinigame(selectedRoomId.value); await refresh() } catch (e: any) { alert(e?.message || '失败') }
}
async function resume() {
  if (!selectedRoomId.value) return
  try { await bbResumeMinigame(selectedRoomId.value); await refresh() } catch (e: any) { alert(e?.message || '失败') }
}
async function stop() {
  if (!selectedRoomId.value) return
  if (!confirm('确定停止该比赛？')) return
  try { await bbStopMinigame(selectedRoomId.value); await refresh() } catch (e: any) { alert(e?.message || '失败') }
}

onMounted(() => { refresh(); timer = setInterval(refresh, 3000) })
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.mg-live { max-width: 1100px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.page-header .bb-btn { margin-left: auto; }
.live-layout { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; }
.rooms-panel { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 12px; padding: 14px; }
.panel-title { font-size: 14px; color: #00ff88; font-weight: 600; margin-bottom: 10px; }
.room-item { padding: 10px 12px; border: 1px solid #ffffff10; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; }
.room-item:hover { border-color: #4488ff66; }
.room-item.active { border-color: #4488ff; background: #4488ff12; }
.ri-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.ri-name { font-size: 13px; color: #e0e0e0; font-weight: 600; }
.ri-status { font-size: 11px; padding: 1px 8px; border-radius: 4px; background: #ffffff10; color: #aaa; }
.ri-status.playing { background: #00ff8822; color: #00ff88; }
.ri-status.paused { background: #ffaa0022; color: #ffaa00; }
.ri-meta { font-size: 12px; color: #8a8aa5; }
.observer-panel { min-width: 0; }
.empty-hint { color: #666; font-size: 13px; padding: 24px 0; text-align: center; }
.controls { display: flex; gap: 10px; margin-top: 12px; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn-primary { border-color: #00ff88; background: #00ff8822; }
.bb-btn-warn { border-color: #ffaa0066; color: #ffaa00; }
.bb-btn-danger { border-color: #ff444466; color: #ff4444; }
</style>
