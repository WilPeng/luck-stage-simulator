<template>
  <div class="bb-veto-draw">
    <div class="page-header">
      <h1>否决权参与者抽选</h1>
      <span class="round-tag">第{{ $route.params.round }}周</span>
    </div>

    <div v-if="twistInfo?.isNoPendantChallenge" class="twist-info-bar">
      <span class="twist-item no-pendant">🚫 无护符挑战：本轮跳过否决权，无人持有否决权</span>
    </div>

    <div v-else>
      <!-- 步骤说明 -->
      <div class="step-card">
        <div class="step-title">📋 抽取规则</div>
        <ul class="step-list">
          <li><strong>HOH</strong> 和 <strong>被提名者</strong> 必定参加 POV</li>
          <li>从<strong>所有活跃房客</strong>中随机抽取，补足至 <strong>共 6 人</strong>参与</li>
          <li>若抽中 <strong>HOH</strong> 或 <strong>被提名者</strong>，他们可从其他未被选择的房客中<strong>自选 1 人</strong>加入 POV</li>
          <li>自选完成后即可进行否决权竞争</li>
        </ul>
      </div>

      <!-- 当前状态 -->
      <div v-if="veto" class="veto-card" :class="{ drawn: veto.participants?.length > 0 }">
        <div class="veto-icon">🎲</div>
        <div class="veto-info">
          <div class="veto-label">否决权抽选状态</div>
          <div v-if="veto.participants && veto.participants.length > 0" class="veto-participants">
            <div class="veto-subtitle">
              已抽取 {{ veto.participants.length }} 名参与者
              <span v-if="veto.winnerId" class="has-winner">（已有获胜者）</span>
            </div>
            <div class="participant-list">
              <span v-for="p in veto.participants" :key="p.playerId" class="participant-tag"
                :class="{
                  winner: p.playerId === veto.winnerId,
                  hoh: p.playerId === hohId,
                  nominee: nomineeIds.includes(p.playerId),
                  picked: p.source === 'picked'
                }">
                <BBAvatar :name="p.playerName" :avatar="p.avatar" size="sm" />
                {{ p.playerName }}
                <span v-if="p.playerId === hohId" class="role-badge hoh-badge">HOH</span>
                <span v-if="nomineeIds.includes(p.playerId)" class="role-badge nominee-badge">提名</span>
                <span v-if="p.playerId === veto.winnerId" class="role-badge winner-badge">🏆</span>
                <span v-if="p.source === 'drawn'" class="role-badge random-badge">抽中</span>
                <span v-if="p.source === 'default' && p.playerId !== hohId && !nomineeIds.includes(p.playerId)" class="role-badge default-badge">必定</span>
                <span v-if="p.source === 'picked'" class="role-badge picked-badge">
                  自选 <small>({{ getPickerName(p.pickedBy) }})</small>
                </span>
              </span>
            </div>
          </div>
          <div v-else class="no-draw">
            <p>尚未抽取参与者，请点击下方按钮抽取</p>
          </div>
        </div>
      </div>

      <!-- 自选区域 -->
      <div v-if="canPick.length > 0" class="pick-section">
        <h3>🎯 房客自选</h3>
        <p class="pick-hint">以下被抽中的HOH/提名者可从其他房客中各选1人加入POV：</p>
        <div v-for="picker in canPick" :key="picker.playerId" class="pick-row">
          <div class="pick-row-header">
            <span class="picker-name">{{ picker.playerName }}</span>
            <span class="picker-role" :class="picker.role === 'hoh' ? 'hoh' : 'nominee'">
              {{ picker.role === 'hoh' ? 'HOH' : '提名者' }}
            </span>
            <span v-if="pickedByMap[picker.playerId]" class="pick-done-badge">
              已选择: {{ getPlayerName(pickedByMap[picker.playerId]) }}
            </span>
          </div>
          <div class="pick-row-actions">
            <select v-model="pickSelections[picker.playerId]" class="pick-select">
              <option value="">-- 请选择 --</option>
              <option v-for="opt in getAvailableOptions(picker.playerId)" :key="opt.playerId" :value="opt.playerId">
                {{ opt.playerName }}
              </option>
            </select>
            <button
              class="bb-btn bb-btn-pick"
              :disabled="!pickSelections[picker.playerId] || pickingMap[picker.playerId]"
              @click="confirmPick(picker.playerId)"
            >
              {{ pickingMap[picker.playerId] ? '确认中...' : '确认自选' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="action-section">
        <h3>操作</h3>
        <div class="action-buttons">
          <button class="bb-btn bb-btn-draw" @click="drawParticipants" :disabled="drawing">
            <span v-if="drawing" class="drawing-spin">🎲</span>
            <span v-else>🎲</span>
            {{ drawing ? '抽取中...' : veto?.participants?.length ? '重新抽取参与者' : '抽取参与者' }}
          </button>
          <button
            v-if="veto?.participants?.length && !veto?.winnerId && allPicksDone"
            class="bb-btn bb-btn-minigame"
            @click="showMinigameModal = true"
          >
            🎮 小游戏竞争
          </button>
          <button
            v-if="veto?.participants?.length && !veto?.winnerId && allPicksDone"
            class="bb-btn bb-btn-compete"
            @click="runCompetition"
            :disabled="competing"
          >
            🏆 随机否决权
          </button>
        </div>
        <!-- 小游戏房间状态 -->
        <div v-if="activeRoom" class="room-status" :class="activeRoom.status">
          <span class="status-badge">{{ statusText }}</span>
          <span class="status-info">{{ activeRoom.minigameId }} · {{ activeRoom.participants.length }}人</span>
          <button v-if="activeRoom.status === 'waiting'" class="bb-btn bb-btn-primary" @click="startMinigame">▶ 开始比赛</button>
        </div>
        <p v-if="veto?.participants?.length && !veto?.winnerId && !allPicksDone && canPick.length > 0" class="action-hint">
          请先完成所有自选，再进行否决权竞争
        </p>
      </div>
    </div>

    <!-- 小游戏选择弹窗 -->
    <Teleport to="body">
      <div v-if="showMinigameModal" class="bb-modal-overlay" @click.self="showMinigameModal = false">
        <div class="bb-modal bb-modal-lg">
          <div class="bb-modal-header">
            <h3>选择否决权小游戏</h3>
            <button class="close-btn" @click="showMinigameModal = false">✕</button>
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
import { ref, computed, onMounted, reactive } from 'vue'
import {
  bbGetCurrentVeto, bbRunVetoCompetition, bbDrawVetoParticipants, bbGetCurrentHoh,
  bbGetCurrentNomination, bbPickVetoParticipant, bbCreateMinigameRoom, bbStartMinigame, bbGetActiveMinigameRoom
} from '../../../services/bbApi'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'
import MinigameSelector from '../../../components/bigbrother/minigames/MinigameSelector.vue'
import type { BBVetoRecord, MinigameRoom } from '../../../types/bigbrother'

const veto = ref<BBVetoRecord | null>(null)
const twistInfo = ref<any>(null)
const hohId = ref('')
const nomineeIds = ref<string[]>([])
const drawing = ref(false)
const competing = ref(false)
const showMinigameModal = ref(false)
const activeRoom = ref<MinigameRoom | null>(null)

const statusText = computed(() => {
  const s = activeRoom.value?.status
  if (s === 'waiting') return '等待中'
  if (s === 'countdown') return '倒计时'
  if (s === 'playing') return '游戏中'
  if (s === 'finished') return '已结束'
  return s || ''
})

// 自选相关
const canPick = ref<{ playerId: string; playerName: string; role: 'hoh' | 'nominee' }[]>([])
const pickablePlayers = ref<{ playerId: string; playerName: string }[]>([])
const pickSelections = reactive<Record<string, string>>({})
const pickingMap = reactive<Record<string, boolean>>({})

// 已自选的映射：pickedBy -> pickedPlayerId
const pickedByMap = computed(() => {
  const map: Record<string, string> = {}
  if (!veto.value?.participants) return map
  for (const p of veto.value.participants) {
    if (p.source === 'picked' && p.pickedBy) {
      map[p.pickedBy] = p.playerId
    }
  }
  return map
})

// 所有可自选者是否都已完成
const allPicksDone = computed(() => {
  if (canPick.value.length === 0) return true
  return canPick.value.every(p => !!pickedByMap.value[p.playerId])
})

function getPlayerName(id: string): string {
  return pickablePlayers.value.find(p => p.playerId === id)?.playerName || ''
}

function getPickerName(pickedBy?: string): string {
  if (!pickedBy) return ''
  const p = canPick.value.find(c => c.playerId === pickedBy)
  return p?.playerName || ''
}

function getAvailableOptions(pickerId: string): { playerId: string; playerName: string }[] {
  const usedIds = new Set((veto.value?.participants || []).map(p => p.playerId))
  return pickablePlayers.value.filter(p => !usedIds.has(p.playerId))
}

async function fetchData() {
  try {
    const result = await bbGetCurrentVeto()
    veto.value = (result as any)?.data || result || null
    twistInfo.value = (result as any)?.twists || null

    try {
      const hoh = await bbGetCurrentHoh()
      hohId.value = (hoh as any)?.winnerId || ''
    } catch {}

    try {
      const nom = await bbGetCurrentNomination()
      nomineeIds.value = (nom as any)?.nomineeIds || []
    } catch {}
  } catch {}
  // 检查活跃的小游戏房间
  try { activeRoom.value = await bbGetActiveMinigameRoom('veto') } catch {}
}

async function drawParticipants() {
  if (drawing.value) return
  drawing.value = true
  try {
    const result = await bbDrawVetoParticipants() as any
    veto.value = result as BBVetoRecord

    canPick.value = result.canPick || []
    pickablePlayers.value = result.pickablePlayers || []
    Object.keys(pickSelections).forEach(k => delete pickSelections[k])

    try {
      const hoh = await bbGetCurrentHoh()
      hohId.value = (hoh as any)?.winnerId || ''
    } catch {}
    try {
      const nom = await bbGetCurrentNomination()
      nomineeIds.value = (nom as any)?.nomineeIds || []
    } catch {}

    const defaultCount = result.defaultCount || 0
    const drawCount = result.drawCount || 0
    const pickMsg = canPick.value.length > 0
      ? `，其中 ${canPick.value.map(p => p.playerName).join('、')} 可以各选1人加入POV`
      : ''
    alert(`抽取完成！${defaultCount} 人必定参加 + ${drawCount} 人随机抽中 = 共 ${result.participants?.length || 0} 名参与者${pickMsg}`)
  } catch (e: any) {
    alert(e.message || '抽取失败')
  } finally {
    drawing.value = false
  }
}

async function confirmPick(pickerId: string) {
  const pickedId = pickSelections[pickerId]
  if (!pickedId || pickingMap[pickerId]) return
  pickingMap[pickerId] = true
  try {
    const result = await bbPickVetoParticipant(pickerId, pickedId) as any
    veto.value = result as BBVetoRecord
    delete pickSelections[pickerId]
  } catch (e: any) {
    alert(e.message || '自选失败')
  } finally {
    pickingMap[pickerId] = false
  }
}

async function runCompetition() {
  if (competing.value) return
  competing.value = true
  try {
    const result = await bbRunVetoCompetition()
    veto.value = result as any
    alert(`否决权竞争完成！${result.winnerName} 获胜！`)
  } catch (e: any) {
    alert(e.message || '竞争失败')
  } finally {
    competing.value = false
  }
}

async function onSelectMinigame(minigameId: string) {
  showMinigameModal.value = false
  if (!veto.value?.participants?.length) {
    alert('请先抽取参与者')
    return
  }
  try {
    const participants = veto.value.participants.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName
    }))
    const room = await bbCreateMinigameRoom('veto', minigameId, participants)
    activeRoom.value = room
    alert(`比赛房间已创建！玩家可以加入了。`)
  } catch (e: any) {
    alert(e.message)
  }
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

onMounted(fetchData)
</script>

<style scoped>
.bb-veto-draw { max-width: 1000px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }

.twist-info-bar { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; }
.twist-item { font-size: 13px; color: #aaa; }
.twist-item.no-pendant { color: #ffaa00; }

/* 步骤说明 */
.step-card { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.step-title { font-size: 16px; font-weight: 600; color: #e0e0e0; margin-bottom: 12px; }
.step-list { list-style: none; padding: 0; margin: 0; }
.step-list li { font-size: 13px; color: #aaa; padding: 6px 0; padding-left: 20px; position: relative; }
.step-list li::before { content: '•'; position: absolute; left: 6px; color: #00ff88; }
.step-list strong { color: #00ff88; }

/* 否决权卡片 */
.veto-card { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #444; border-radius: 12px; padding: 24px; display: flex; align-items: flex-start; gap: 20px; margin-bottom: 20px; }
.veto-card.drawn { border-color: #00ff8844; }
.veto-icon { font-size: 48px; flex-shrink: 0; }
.veto-info { flex: 1; }
.veto-label { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 8px; }
.no-draw p { color: #666; font-size: 14px; }

.veto-participants { margin-top: 0; }
.veto-subtitle { font-size: 13px; color: #aaa; margin-bottom: 12px; }
.has-winner { color: #ffaa00; font-weight: 600; }

.participant-list { display: flex; flex-wrap: wrap; gap: 8px; }
.participant-tag {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px;
  background: #0f0f2e;
  border: 1px solid #00ff8822;
  border-radius: 8px;
  font-size: 13px; color: #ccc;
  transition: all 0.2s;
}
.participant-tag.winner {
  border-color: #ffaa00; background: #ffaa0010; color: #ffaa00; font-weight: 600;
}
.participant-tag.picked {
  border-color: #aa44ff44; background: #aa44ff10;
}

.role-badge {
  font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 500;
}
.hoh-badge { background: #4488ff22; color: #4488ff; border: 1px solid #4488ff33; }
.nominee-badge { background: #ff444422; color: #ff4444; border: 1px solid #ff444433; }
.winner-badge { background: #ffaa0022; color: #ffaa00; border: 1px solid #ffaa0033; font-size: 12px; padding: 0 4px; }
.random-badge { background: #00ff8815; color: #00ff88; border: 1px solid #00ff8833; }
.default-badge { background: #4488ff15; color: #4488ff; border: 1px solid #4488ff33; }
.picked-badge { background: #aa44ff22; color: #aa44ff; border: 1px solid #aa44ff33; }
.picked-badge small { color: #aa44ff88; font-size: 10px; }

/* 自选区域 */
.pick-section {
  background: linear-gradient(135deg, #0f0f2e, #1a1a3e);
  border: 1px solid #aa44ff44;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}
.pick-section h3 { margin: 0 0 4px; font-size: 16px; color: #e0e0e0; }
.pick-hint { font-size: 13px; color: #888; margin: 0 0 16px; }
.pick-row {
  background: #0f0f2e;
  border: 1px solid #00ff8811;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 10px;
}
.pick-row:last-child { margin-bottom: 0; }
.pick-row-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px;
}
.picker-name { font-size: 14px; font-weight: 600; color: #e0e0e0; }
.picker-role {
  font-size: 10px; padding: 1px 8px; border-radius: 4px; font-weight: 500;
}
.picker-role.hoh { background: #4488ff22; color: #4488ff; border: 1px solid #4488ff33; }
.picker-role.nominee { background: #ff444422; color: #ff4444; border: 1px solid #ff444433; }
.pick-done-badge { font-size: 12px; color: #00ff88; margin-left: auto; }
.pick-row-actions { display: flex; gap: 10px; align-items: center; }
.pick-select {
  flex: 1;
  background: #1a1a2e; border: 1px solid #00ff8822; color: #ccc;
  padding: 8px 12px; border-radius: 6px; font-size: 13px; outline: none;
}
.pick-select:focus { border-color: #aa44ff44; }
.pick-select option { background: #1a1a2e; color: #ccc; }

.bb-btn-pick {
  border-color: #aa44ff44 !important; color: #aa44ff !important; white-space: nowrap;
}
.bb-btn-pick:hover:not(:disabled) { background: #aa44ff15 !important; }

/* 操作区 */
.action-section { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; }
.action-section h3 { margin: 0 0 12px; font-size: 16px; color: #e0e0e0; }
.action-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
.action-hint { font-size: 12px; color: #ffaa00; margin: 12px 0 0; }

.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
.bb-btn:hover:not(:disabled) { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-draw { border-color: #4488ff44; color: #4488ff; }
.bb-btn-draw:hover:not(:disabled) { background: #4488ff15; }
.bb-btn-compete { border-color: #ffaa0044; color: #ffaa00; }
.bb-btn-compete:hover:not(:disabled) { background: #ffaa0015; }

/* 抽取动画 */
.drawing-spin {
  display: inline-block;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.bb-btn-minigame { border-color: #ffaa0044; color: #ffaa00; }
.bb-btn-minigame:hover:not(:disabled) { background: #ffaa0015; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }
.room-status { margin-top: 14px; padding: 10px 16px; background: #ffffff05; border: 1px solid #00ff8822; border-radius: 8px; display: flex; align-items: center; gap: 12px; }
.room-status.playing { border-color: #00ff88; }
.room-status.finished { border-color: #ffaa00; }
.status-badge { font-size: 12px; font-weight: 600; color: #00ff88; padding: 2px 10px; background: #00ff8810; border-radius: 4px; }
.status-info { flex: 1; font-size: 13px; color: #aaa; }
.bb-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.bb-modal { background: #1a1a3e; border: 1px solid #00ff8844; border-radius: 12px; width: 400px; max-width: 90vw; }
.bb-modal-lg { width: 700px; }
.bb-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #00ff8822; }
.bb-modal-header h3 { margin: 0; color: #00ff88; font-size: 16px; }
.close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; }
.bb-modal-body { padding: 20px; }
</style>
