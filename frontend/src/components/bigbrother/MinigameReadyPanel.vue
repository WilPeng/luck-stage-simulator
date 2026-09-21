<template>
  <div v-if="roomId" class="mg-ready">
    <div class="mr-head">
      <span class="mr-title">📣 准备环节</span>
      <span v-if="gameTitle" class="mr-game">{{ gameTitle }}</span>
      <span class="mr-count" :class="{ all: allReady }">{{ readyCount }} / {{ participants.length }} 已准备</span>
      <button class="bb-btn bb-btn-summon" @click="$emit('summon')" :disabled="summoning">
        {{ summoning ? '召集中…' : '📣 召集选手' }}
      </button>
    </div>
    <div class="mr-players">
      <span
        v-for="p in participants"
        :key="p.playerId"
        class="mr-chip"
        :class="{ ready: p.ready, offline: !p.connected }"
      >
        <BBAvatar :name="p.playerName" :avatar="p.avatar" size="sm" />
        {{ p.playerName }}
        <span class="mr-dot">{{ p.ready ? '✅' : (p.connected ? '⏳' : '⚪') }}</span>
      </span>
      <span v-if="!participants.length" class="mr-empty">暂无参与者</span>
    </div>
    <div class="mr-hint">召集后所有参赛选手会切换到本比赛页面并点击「准备」。</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, nextTick, ref } from 'vue'
import { useMinigameSocket } from '../../composables/useMinigameSocket'
import BBAvatar from './BBAvatar.vue'

const props = defineProps<{
  roomId: string
  gameTitle?: string
  summoning?: boolean
}>()

defineEmits<{ (e: 'summon'): void }>()

const roomRef = ref(props.roomId)
const { progress, participants: joinedParticipants, connect, joinRoom } = useMinigameSocket(roomRef)

const participants = computed<any[]>(() => {
  const fromProgress = progress.value?.participants
  if (Array.isArray(fromProgress) && fromProgress.length) return fromProgress
  return joinedParticipants.value || []
})
const readyCount = computed(() => participants.value.filter(p => p.ready).length)
const allReady = computed(() => participants.value.length > 0 && participants.value.every(p => p.ready))

onMounted(() => {
  connect()
  nextTick(() => { if (props.roomId) joinRoom(props.roomId) })
})
</script>

<style scoped>
.mg-ready { background: #0f0f2e; border: 1px solid #ffaa0044; border-radius: 10px; padding: 14px 16px; margin-top: 12px; }
.mr-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.mr-title { font-size: 14px; font-weight: 700; color: #ffaa00; }
.mr-game { font-size: 13px; color: #ccc; }
.mr-count { font-size: 12px; color: #8a8aa5; }
.mr-count.all { color: #00ff88; font-weight: 600; }
.bb-btn-summon { margin-left: auto; border-color: #ffaa0066; color: #ffaa00; padding: 6px 16px; font-size: 13px; }
.bb-btn-summon:hover:not(:disabled) { background: #ffaa0022; }
.mr-players { display: flex; flex-wrap: wrap; gap: 8px; }
.mr-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border: 1px solid #ffffff18; border-radius: 8px; background: #ffffff06; font-size: 13px; color: #ddd; }
.mr-chip.ready { border-color: #00ff88; background: #00ff8812; }
.mr-chip.offline { opacity: 0.5; }
.mr-dot { font-size: 12px; }
.mr-empty { color: #666; font-size: 13px; }
.mr-hint { margin-top: 8px; font-size: 12px; color: #666; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; border-radius: 6px; cursor: pointer; transition: all 0.15s; }
.bb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
