<template>
  <div class="minigame balance-bar">
    <div v-if="!gameStarted" class="game-waiting">
      <div class="game-icon">⚖️</div>
      <h2>保持平衡</h2>
      <p>按住空格键保持指针在绿色区域，停留时间最长者获胜！</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else-if="!finished" class="game-playing">
      <div class="game-header">
        <span class="timer">⏱️ {{ timeLeft }}s</span>
        <span class="zone-time">🎯 {{ zoneTime }}s</span>
      </div>
      <div class="bar-container">
        <div class="bar-track">
          <div class="target-zone"></div>
          <div class="bar-pointer" :style="{ left: pointerPos + '%' }"></div>
        </div>
      </div>
      <div class="controls">
        <button class="hold-btn" :class="{ holding: isHolding }"
          @mousedown="startHold" @mouseup="stopHold" @mouseleave="stopHold"
          @touchstart.prevent="startHold" @touchend.prevent="stopHold">
          {{ isHolding ? '按住中...' : '按住我！' }}
        </button>
        <p class="hint">按住按钮或空格键保持平衡</p>
      </div>
    </div>

    <div v-else class="game-finished">
      <div class="game-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || '未知' }}</span>
        <span class="winner-label">获胜！</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'

const props = defineProps<{ roomId: string; participants: { playerId: string; playerName: string }[] }>()
const emit = defineEmits<{ (e: 'finished', winner: { playerId: string; playerName: string }): void }>()

const authStore = useBbAuthStore()
const myId = computed(() => authStore.currentUser?.id || '')

const roomIdRef = ref(props.roomId)
const { gameState, countdown, winner, finished, connect, sendAction } = useMinigameSocket(roomIdRef)

const gameStarted = computed(() => gameState.value && (countdown.value === -1 || countdown.value === 0))
const isHolding = ref(false)

const pointerPos = computed(() => {
  if (gameState.value?.position !== undefined) return gameState.value.position * 100
  return 50
})
const zoneTime = computed(() => {
  const ms = gameState.value?.timeInZone || 0
  return (ms / 1000).toFixed(1)
})
const timeLeft = computed(() => {
  if (!gameState.value?.timeLeft && gameState.value?.timeLeft !== 0) return 15
  return Math.ceil(gameState.value.timeLeft / 1000)
})

function startHold() {
  isHolding.value = true
  sendAction({ type: 'hold', holding: true })
}
function stopHold() {
  isHolding.value = false
  sendAction({ type: 'hold', holding: false })
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space' && !isHolding.value && gameStarted.value) {
    e.preventDefault()
    startHold()
  }
}
function handleKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space' && isHolding.value) {
    e.preventDefault()
    stopHold()
  }
}

watch(finished, (val) => {
  if (val && winner.value) emit('finished', winner.value)
})

onMounted(() => {
  connect()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})
</script>

<style scoped>
.balance-bar { text-align: center; padding: 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
.game-waiting h2 { font-size: 22px; color: #e0e0e0; margin-bottom: 8px; }
.game-waiting p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 18px; color: #e0e0e0; }
.zone-time { color: #00ff88; font-weight: 600; }
.bar-container { margin: 20px 0 30px; }
.bar-track {
  position: relative; height: 40px; background: linear-gradient(90deg, #ff4444 0%, #ffaa00 30%, #00ff88 45%, #00ff88 55%, #ffaa00 70%, #ff4444 100%);
  border-radius: 20px; overflow: hidden; border: 2px solid #333;
}
.target-zone {
  position: absolute; left: 35%; width: 30%; height: 100%;
  background: transparent; border-left: 2px dashed #00ff88; border-right: 2px dashed #00ff88;
}
.bar-pointer {
  position: absolute; top: -4px; width: 8px; height: 48px; background: #fff;
  border-radius: 4px; box-shadow: 0 0 10px #00ff88; transform: translateX(-50%); transition: left 0.05s linear;
}
.controls { margin-top: 24px; }
.hold-btn {
  width: 160px; height: 160px; border-radius: 50%; border: 3px solid #00ff88;
  background: #00ff8811; color: #00ff88; font-size: 20px; font-weight: 700;
  cursor: pointer; user-select: none; transition: all 0.15s;
}
.hold-btn.holding { background: #00ff8833; transform: scale(0.95); border-color: #ffaa00; color: #ffaa00; }
.hint { color: #666; font-size: 13px; margin-top: 12px; }
.game-finished h2 { font-size: 22px; color: #e0e0e0; margin-bottom: 16px; }
.winner-name { font-size: 28px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
</style>
