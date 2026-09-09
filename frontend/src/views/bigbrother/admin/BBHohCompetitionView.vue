<template>
  <div class="bb-hoh-admin">
    <div class="page-header">
      <h1>HOH 竞争</h1>
      <span class="round-tag">第{{ $route.params.round }}周</span>
    </div>

    <div v-if="currentHoh" class="current-hoh-card">
      <div class="hoh-icon">👑</div>
      <div class="hoh-info">
        <div class="hoh-label">当前 HOH</div>
        <div class="hoh-name">{{ currentHoh.winnerName }}</div>
        <div class="hoh-type">{{ currentHoh.competitionName }}</div>
      </div>
    </div>
    <div v-else class="current-hoh-card empty">
      <div class="hoh-info">
        <div class="hoh-label">当前暂无 HOH</div>
      </div>
    </div>

    <!-- Twist 信息提示 -->
    <div v-if="twistInfo && hasAnyTwist" class="twist-info-bar">
      <span v-if="twistInfo.isSecretKeeper" class="twist-item">🎭 匿名房主：HOH 身份对玩家保密</span>
      <span v-if="twistInfo.isKarmicPawnship" class="twist-item">⚖️ 因果报应：上轮幸存者将自动成为本轮 HOH</span>
      <span v-if="twistInfo.karmicHohName" class="twist-item highlight">→ {{ twistInfo.karmicHohName }} 将自动成为本轮 HOH</span>
      <span v-if="twistInfo.isCondemned" class="twist-item">⛓️ 受罚者：HOH 确定后将有 4 人成为受罚者</span>
      <span v-if="twistInfo.isSerpentMark" class="twist-item">🐍 毒蛇标记：每位玩家将被秘密分配目标</span>
    </div>

    <!-- 上一轮 HOH 豁免提示 -->
    <div v-if="excludedHoh" class="rule-bar">
      🚫 规则：上一轮 HOH <strong>{{ excludedHoh.name }}</strong> 不能参加本轮 HOH 竞争（不能连任）。
    </div>

    <div class="action-section">
      <h3>操作</h3>
      <div class="action-buttons">
        <button class="bb-btn" @click="runCompetition">🎲 模拟 HOH 竞争</button>
        <button class="bb-btn" @click="openMinigameModal">🎮 开启小游戏</button>
        <button class="bb-btn" @click="showAssignModal = true">✏️ 手动指定 HOH</button>
      </div>
      <!-- 小游戏房间状态 -->
      <div v-if="activeRoom" class="room-status" :class="activeRoom.status">
        <span class="status-badge">{{ statusText }}</span>
        <span class="status-info">{{ activeRoom.minigameId }} · {{ activeRoom.participants.length }}人<template v-if="activeRoom.targetScore"> · 目标 {{ activeRoom.targetScore }}</template></span>
        <div class="room-actions">
          <button v-if="activeRoom.status === 'waiting'" class="bb-btn bb-btn-primary" @click="startMinigame">▶ 开始比赛</button>
          <button v-if="activeRoom.status === 'playing'" class="bb-btn bb-btn-warn" @click="pauseMinigame">⏸ 暂停</button>
          <button v-if="activeRoom.status === 'paused'" class="bb-btn bb-btn-primary" @click="resumeMinigame">▶ 恢复</button>
          <button v-if="activeRoom.status === 'playing' || activeRoom.status === 'paused'" class="bb-btn bb-btn-danger" @click="stopMinigame">⏹ 停止</button>
        </div>
      </div>

      <!-- 目标设置确认创建 -->
      <div v-if="selectedMinigameId" class="target-setup">
        <div class="target-setup-title">🎮 已选择「{{ selectedMinigameId }}」，设置胜出目标（可选）</div>
        <div class="target-setup-row">
          <input v-model.number="targetScore" type="number" min="1" class="target-input" :placeholder="targetInputHint" />
          <button class="bb-btn bb-btn-primary" :disabled="creating" @click="createRoomWithTarget">✓ 创建房间</button>
          <button class="bb-btn" :disabled="creating" @click="cancelCreateRoom">取消</button>
        </div>
      </div>
    </div>

    <div class="history-section">
      <h3>HOH 历史记录</h3>
      <div class="table-container">
        <table class="bb-table">
          <thead><tr><th>轮次</th><th>HOH</th><th>方式</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="r in history" :key="r.id">
              <td>{{ getRoundIndex(r.roundId) }}</td>
              <td class="highlight">{{ r.winnerName }}</td>
              <td>{{ r.competitionName }}</td>
              <td class="time">{{ formatTime(r.createdAt) }}</td>
            </tr>
            <tr v-if="history.length === 0"><td colspan="4" class="empty-cell">暂无记录</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showAssignModal" class="bb-modal-overlay" @click.self="showAssignModal = false">
        <div class="bb-modal">
          <div class="bb-modal-header">
            <h3>手动指定 HOH</h3>
            <button class="close-btn" @click="showAssignModal = false">✕</button>
          </div>
          <div class="bb-modal-body">
            <div class="form-group">
              <label>选择房客</label>
              <select v-model="selectedPlayerId" class="bb-select">
                <option v-for="h in activeHouseguests" :key="h.id" :value="h.id">{{ h.name }}</option>
              </select>
              <div v-if="selectedPlayerId" class="selected-preview">
                <BBAvatar :name="getSelectedName()" :avatar="getSelectedAvatar()" size="md" />
                <span class="selected-name">{{ getSelectedName() }}</span>
              </div>
            </div>
            <div class="form-actions">
              <button class="bb-btn" @click="showAssignModal = false">取消</button>
              <button class="bb-btn bb-btn-primary" @click="assignHoh">确认指定</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 小游戏选择弹窗 -->
    <Teleport to="body">
      <div v-if="showMinigameModal" class="bb-modal-overlay" @click.self="closeMinigameModal">
        <div class="bb-modal bb-modal-xl">
          <div class="bb-modal-header">
            <h3>🎮 开启 HOH 小游戏</h3>
            <button class="close-btn" @click="closeMinigameModal">✕</button>
          </div>
          <div class="bb-modal-body">
            <MinigameSelector :selectedId="null" @select="onSelectMinigame" />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  bbGetCurrentHoh, bbGetHohHistory, bbRunHohCompetition, bbAssignHoh,
  bbGetHohEligible, bbCreateMinigameRoom, bbStartMinigame, bbGetActiveMinigameRoom,
  bbPauseMinigame, bbResumeMinigame, bbStopMinigame
} from '../../../services/bbApi'
import MinigameSelector from '../../../components/bigbrother/minigames/MinigameSelector.vue'
import type { BBHohRecord, MinigameRoom } from '../../../types/bigbrother'

const route = useRoute()
const currentHoh = ref<BBHohRecord | null>(null)
const twistInfo = ref<any>(null)
const history = ref<BBHohRecord[]>([])
const activeHouseguests = ref<{ id: string; name: string; avatar: string | null }[]>([])
const excludedHoh = ref<{ id: string; name: string } | null>(null)
const showAssignModal = ref(false)
const showMinigameModal = ref(false)
const selectedPlayerId = ref('')
const activeRoom = ref<MinigameRoom | null>(null)
const selectedMinigameId = ref<string | null>(null)
const targetScore = ref<number | null>(null)
const creating = ref(false)

const targetInputHint = computed(() => {
  if (!selectedMinigameId.value) return ''
  const hints: Record<string, string> = {
    'click-speed': '点击次数（如 50，达到即胜）',
    'quick-math': '答对题数（如 10，达到即胜）',
    'memory-match': '填写任意正整数（完成全部配对即胜）',
    'balance-bar': '保持时长（毫秒，如 8000 达到即胜）',
    'dice-duel': '总分数（如 20，达到即胜）'
  }
  return hints[selectedMinigameId.value] || '目标值（可选）'
})

const statusText = computed(() => {
  const s = activeRoom.value?.status
  if (s === 'waiting') return '等待中'
  if (s === 'countdown') return '倒计时'
  if (s === 'playing') return '游戏中'
  if (s === 'paused') return '已暂停'
  if (s === 'finished') return '已结束'
  return s || ''
})

function closeMinigameModal() {
  showMinigameModal.value = false
}

function hasNormalAfterEvict(p: any): boolean {
  if (!p.evictedRound) return false
  return rounds.value.some(x => colKind(x) === 'normal' && x.round > p.evictedRound)
}

const hasAnyTwist = computed(() => {
  if (!twistInfo.value) return false
  return twistInfo.value.isSecretKeeper || twistInfo.value.isKarmicPawnship ||
    twistInfo.value.isCondemned || twistInfo.value.isSerpentMark
})

async function fetchData() {
  try {
    const result = await bbGetCurrentHoh()
    currentHoh.value = result as any
    twistInfo.value = (result as any)?.twists || null
  } catch {}
  try { history.value = await bbGetHohHistory() } catch {}
  // 可参赛名单（排除上一轮 HOH——不能连任）
  try {
    const eligible = await bbGetHohEligible()
    activeHouseguests.value = eligible.candidates as any
    excludedHoh.value = eligible.excludedHoh
  } catch {
    try { activeHouseguests.value = await bbGetActiveHouseguests() } catch {}
  }
}

async function runCompetition() {
  try {
    const result = await bbRunHohCompetition()
    alert(`HOH 竞争完成！${result.winnerName} 获胜！`)
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

async function assignHoh() {
  if (!selectedPlayerId.value) return
  const player = activeHouseguests.value.find(h => h.id === selectedPlayerId.value)
  try {
    await bbAssignHoh(selectedPlayerId.value, player?.name || '')
    showAssignModal.value = false
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

async function openMinigameModal() {
  showMinigameModal.value = true
}

async function onSelectMinigame(minigameId: string) {
  showMinigameModal.value = false
  if (!activeHouseguests.value.length) {
    alert('没有活跃房客')
    return
  }
  selectedMinigameId.value = minigameId
  targetScore.value = null
}

async function createRoomWithTarget() {
  if (!selectedMinigameId.value || !activeHouseguests.value.length) return
  creating.value = true
  try {
    const participants = activeHouseguests.value.map(h => ({
      playerId: h.id,
      playerName: h.name
    }))
    const room = await bbCreateMinigameRoom('hoh', selectedMinigameId.value, participants, targetScore.value)
    activeRoom.value = room
    selectedMinigameId.value = null
    targetScore.value = null
    alert(`比赛房间已创建！玩家可以加入了${room.targetScore ? `（目标：达到 ${room.targetScore} 即胜）` : ''}`)
  } catch (e: any) {
    alert(e.message)
  } finally {
    creating.value = false
  }
}

function cancelCreateRoom() {
  selectedMinigameId.value = null
  targetScore.value = null
}

async function startMinigame() {
  if (!activeRoom.value) return
  try {
    await bbStartMinigame(activeRoom.value.roomId)
    activeRoom.value = { ...activeRoom.value, status: 'playing' }
  } catch (e: any) {
    alert(e.message)
  }
}

async function pauseMinigame() {
  if (!activeRoom.value) return
  try {
    await bbPauseMinigame(activeRoom.value.roomId)
    activeRoom.value = { ...activeRoom.value, status: 'paused' }
  } catch (e: any) {
    alert(e.message)
  }
}

async function resumeMinigame() {
  if (!activeRoom.value) return
  try {
    await bbResumeMinigame(activeRoom.value.roomId)
    activeRoom.value = { ...activeRoom.value, status: 'playing' }
  } catch (e: any) {
    alert(e.message)
  }
}

async function stopMinigame() {
  if (!activeRoom.value) return
  if (!confirm('确定停止游戏？将不产生胜者。')) return
  try {
    await bbStopMinigame(activeRoom.value.roomId)
    activeRoom.value = null
  } catch (e: any) {
    alert(e.message)
  }
}

function getRoundIndex(roundId: string): string {
  return roundId?.slice(-4) || '?'
}

function getSelectedName(): string {
  const h = activeHouseguests.value.find(h => h.id === selectedPlayerId.value)
  return h?.name || ''
}

function getSelectedAvatar(): string | null {
  const h = activeHouseguests.value.find(h => h.id === selectedPlayerId.value)
  return h?.avatar || null
}

function formatTime(t: string) {
  return t ? new Date(t).toLocaleString('zh-CN') : ''
}

onMounted(fetchData)
</script>

<style scoped>
.bb-hoh-admin { max-width: 1000px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.current-hoh-card { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #00ff88; border-radius: 12px; padding: 24px; display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
.current-hoh-card.empty { border-color: #444; }
.twist-info-bar { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 6px; }
.twist-item { font-size: 13px; color: #aaa; }
.rule-bar { background: #ff444414; border: 1px solid #ff444466; border-radius: 10px; padding: 12px 18px; margin-bottom: 20px; font-size: 13px; color: #ff8888; }
.rule-bar strong { color: #ff5555; }
.twist-item.highlight { color: #00ff88; font-weight: 600; }
.hoh-icon { font-size: 48px; }
.hoh-label { font-size: 12px; color: #888; text-transform: uppercase; }
.hoh-name { font-size: 24px; font-weight: 700; color: #00ff88; }
.hoh-type { font-size: 13px; color: #aaa; margin-top: 4px; }
.action-section { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.action-section h3 { margin: 0 0 12px; font-size: 16px; color: #e0e0e0; }
.action-buttons { display: flex; gap: 12px; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }
.bb-btn-warn { border-color: #ffaa0066; color: #ffaa00; }
.bb-btn-warn:hover { background: #ffaa0022; }
.bb-btn-danger { border-color: #ff444466; color: #ff4444; }
.bb-btn-danger:hover { background: #ff444422; }
.history-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.bb-table { width: 100%; border-collapse: collapse; }
.bb-table th, .bb-table td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #00ff8811; font-size: 14px; color: #ccc; }
.bb-table th { color: #888; font-size: 12px; text-transform: uppercase; }
.highlight { color: #00ff88; font-weight: 500; }
.time { font-size: 12px; color: #666; }
.empty-cell { text-align: center; color: #666; padding: 32px; }
.bb-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.bb-modal { background: #1a1a3e; border: 1px solid #00ff8844; border-radius: 12px; width: 400px; max-width: 90vw; }
.bb-modal-xl { width: 680px; }
.bb-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #00ff8822; }
.bb-modal-header h3 { margin: 0; color: #00ff88; font-size: 16px; }
.close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; }
.bb-modal-body { padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
.bb-select { background: #0f0f2e; border: 1px solid #00ff8822; color: #e0e0e0; padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; cursor: pointer; width: 100%; }
.selected-preview { display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 10px; background: #00ff8808; border-radius: 8px; }
.selected-name { font-size: 15px; color: #00ff88; font-weight: 500; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
/* 小游戏房间状态 */
.room-status { margin-top: 14px; padding: 10px 16px; background: #ffffff05; border: 1px solid #00ff8822; border-radius: 8px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.room-status.playing { border-color: #00ff88; }
.room-status.paused { border-color: #ffaa00; }
.room-status.finished { border-color: #ffaa00; }
.room-actions { display: flex; gap: 8px; margin-left: auto; }
.status-badge { font-size: 12px; font-weight: 600; color: #00ff88; padding: 2px 10px; background: #00ff8810; border-radius: 4px; }
.status-info { flex: 1; font-size: 13px; color: #aaa; }

/* 目标设置 */
.target-setup { margin-top: 14px; padding: 14px 16px; background: #ffffff05; border: 1px solid #ffaa0033; border-radius: 8px; }
.target-setup-title { font-size: 13px; color: #ffaa00; margin-bottom: 10px; }
.target-setup-row { display: flex; gap: 10px; align-items: center; }
.target-input { flex: 1; max-width: 240px; padding: 8px 12px; background: #0a0a2e; border: 1px solid #ffaa0044; border-radius: 6px; color: #fff; font-size: 14px; }
.target-input::placeholder { color: #666; }
.target-input:focus { outline: none; border-color: #ffaa00; }

/* 小游戏选择弹窗 */
.twist-picker-modal { width: 520px; }
.twist-options { display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; }
.twist-option {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  background: #0f0f2e; border: 1px solid #00ff8811; border-radius: 8px;
  cursor: pointer; transition: all 0.2s;
}
.twist-option:hover { background: #00ff8808; border-color: #00ff8833; }
.twist-option input[type="checkbox"] { accent-color: #00ff88; width: 16px; height: 16px; }
.twist-option-icon { font-size: 20px; }
.twist-option-name { font-size: 14px; font-weight: 500; color: #e0e0e0; min-width: 100px; }
.twist-option-desc { font-size: 12px; color: #888; flex: 1; }
</style>
