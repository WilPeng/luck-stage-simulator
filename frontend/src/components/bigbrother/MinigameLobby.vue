<template>
  <div class="mg-lobby">
    <div class="lobby-icon">📣</div>
    <h2 class="lobby-title">{{ gameTitle || '小游戏' }}</h2>
    <p class="lobby-sub">管理员已召集本场比赛，请点击「准备」。全员准备后即可开始。</p>

    <div class="lobby-players">
      <div
        v-for="p in players"
        :key="p.playerId"
        class="lp"
        :class="{ ready: p.ready, me: p.playerId === myId }"
      >
        <BBAvatar :name="p.playerName" :avatar="p.avatar" size="sm" />
        <span class="lp-name">{{ p.playerName }}<span v-if="p.playerId === myId" class="lp-me">我</span></span>
        <span class="lp-status" :class="{ ready: p.ready }">{{ p.ready ? '✅ 已准备' : '⏳ 未准备' }}</span>
      </div>
      <div v-if="!players.length" class="lp-empty">等待选手加入…</div>
    </div>

    <button class="lobby-btn" :class="{ ready: myReady }" @click="toggleReady">
      {{ myReady ? '✅ 已准备（点击取消）' : '准备' }}
    </button>
    <div class="lobby-hint">
      {{ readyCount }} / {{ players.length }} 已准备{{ allReady ? ' · 等待管理员开始比赛…' : '' }}
    </div>
    <div v-if="!connected" class="lobby-conn">连接中…</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, nextTick, ref } from 'vue'
import { useMinigameSocket } from '../../composables/useMinigameSocket'
import BBAvatar from './BBAvatar.vue'

const props = defineProps<{
  roomId: string
  gameTitle?: string
  participants?: any[]
  myId: string
}>()

const roomRef = ref(props.roomId)
const { connected, participants: sockParticipants, allReady, connect, joinRoom, setReady } = useMinigameSocket(roomRef)

const players = computed<any[]>(() => {
  const list = sockParticipants.value && sockParticipants.value.length ? sockParticipants.value : (props.participants || [])
  return list
})
const myReady = computed(() => !!players.value.find(p => p.playerId === props.myId)?.ready)
const readyCount = computed(() => players.value.filter(p => p.ready).length)

function toggleReady() {
  setReady(!myReady.value)
}

onMounted(() => {
  connect()
  nextTick(() => { if (props.roomId) joinRoom(props.roomId) })
})
</script>

<style scoped>
.mg-lobby { text-align: center; padding: 36px 24px; }
.lobby-icon { font-size: 56px; margin-bottom: 10px; animation: lobbyPulse 1.2s ease-in-out infinite; }
@keyframes lobbyPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }
.lobby-title { font-size: 24px; color: #e0e0e0; margin: 0 0 8px; }
.lobby-sub { color: #8a8aa5; font-size: 14px; margin: 0 0 22px; }
.lobby-players { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; max-width: 640px; margin: 0 auto 22px; }
.lp { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #ffffff14; border-radius: 8px; background: #ffffff06; font-size: 13px; color: #ddd; }
.lp.me { border-color: #00ff8866; }
.lp.ready { border-color: #00ff88; background: #00ff8812; }
.lp-name { flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lp-me { color: #00ff88; font-size: 11px; margin-left: 4px; }
.lp-status { font-size: 12px; color: #888; }
.lp-status.ready { color: #00ff88; }
.lp-empty { grid-column: 1 / -1; color: #666; font-size: 13px; padding: 16px; }
.lobby-btn { padding: 14px 48px; font-size: 18px; font-weight: 700; border: 1px solid #00ff88; border-radius: 10px; background: #00ff8822; color: #00ff88; cursor: pointer; transition: all 0.15s; }
.lobby-btn:hover { background: #00ff8833; }
.lobby-btn.ready { background: #00ff8844; }
.lobby-hint { margin-top: 14px; color: #8a8aa5; font-size: 13px; }
.lobby-conn { margin-top: 6px; color: #666; font-size: 12px; }
</style>
