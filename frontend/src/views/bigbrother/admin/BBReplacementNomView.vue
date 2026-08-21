<template>
  <div class="bb-replacement-admin">
    <div class="page-header">
      <h1>替换提名</h1>
      <span class="round-tag">第{{ $route.params.round }}周</span>
    </div>

    <!-- 否决权信息 -->
    <div v-if="veto" class="veto-card">
      <div class="veto-icon">🛡️</div>
      <div class="veto-info">
        <div class="veto-label">否决权信息</div>
        <div class="veto-winner">POV 赢家：{{ veto.winnerName }}</div>
        <div v-if="veto.usedOnPlayerName" class="veto-saved">
          拯救: <strong class="highlight">{{ veto.usedOnPlayerName }}</strong>
        </div>
      </div>
    </div>

    <!-- 回旋镖护符提示 -->
    <div v-if="twistInfo?.isBoomerangPendant && nomination" class="twist-action-hint">
      🪃 回旋镖护符已触发！提名名单已清空，HOH 需要重新提名所有被提名人。
    </div>

    <!-- 当前 HOH 和提名信息 -->
    <div class="status-panel">
      <div class="status-row hoh-row">
        <span class="status-label">👑 当前 HOH</span>
        <span class="status-value" :class="{ 'no-data': !nomination?.hohName }">
          {{ nomination?.hohName || '暂无' }}
        </span>
      </div>
      <div class="status-row nom-row">
        <span class="status-label">📋 当前提名</span>
        <div class="nominee-list">
          <span v-for="(name, i) in (nomination?.nomineeNames || [])" :key="i" class="nominee-tag"
            :class="{ replacement: nomination?.replacementNomineeName === name }">
            {{ name }}
            <span v-if="nomination?.replacementNomineeName === name" class="replacement-badge">替补</span>
          </span>
          <span v-if="!nomination?.nomineeNames?.length" class="no-data">暂无</span>
        </div>
      </div>
      <div v-if="savedPlayerName" class="status-row saved-row">
        <span class="status-label">🛡️ 被拯救者</span>
        <span class="status-value saved-name">{{ savedPlayerName }}</span>
      </div>
    </div>

    <!-- 替换完成提示 -->
    <div v-if="nomination?.replacementNomineeId" class="done-hint">
      <span>✅ 替补提名已完成：<strong>{{ nomination.replacementNomineeName }}</strong> 已加入最终提名名单，将进入驱逐投票阶段。</span>
    </div>

    <!-- 操作按钮 -->
    <div v-if="!nomination?.replacementNomineeId" class="action-section">
      <h3>操作 - 选择替补提名</h3>
      <p class="action-hint">否决权使用后，HOH 需要选择一名新的房客替换被拯救的提名者</p>
      <div class="action-buttons">
        <button class="bb-btn" @click="showReplaceModal = true" :disabled="!nomination || !nomination.vetoUsed">
          🔄 选择替补提名
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showReplaceModal" class="bb-modal-overlay" @click.self="showReplaceModal = false">
        <div class="bb-modal">
          <div class="bb-modal-header"><h3>替换提名</h3><button class="close-btn" @click="showReplaceModal = false">✕</button></div>
          <div class="bb-modal-body">
            <div class="form-group">
              <label>替换人选</label>
              <select v-model="replaceId" class="bb-select">
                <option value="" disabled>请选择</option>
                <option v-for="h in baseAvailable" :key="h.id" :value="h.id">{{ h.name }}</option>
              </select>
            </div>
            <div class="form-actions">
              <button class="bb-btn" @click="showReplaceModal = false">取消</button>
              <button class="bb-btn bb-btn-primary" @click="replaceNomination">确认替换</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { bbGetCurrentNomination, bbReplaceNomination, bbGetActiveHouseguests, bbGetCurrentVeto } from '../../../services/bbApi'
import type { BBNomination, BBVetoRecord } from '../../../types/bigbrother'

const nomination = ref<BBNomination | null>(null)
const twistInfo = ref<any>(null)
const veto = ref<BBVetoRecord | null>(null)
const activeList = ref<{ id: string; name: string }[]>([])
const activeMap = ref<Record<string, string>>({})
const showReplaceModal = ref(false)
const replaceId = ref('')
const savedPlayerId = ref('')
const savedPlayerName = ref('')

// 排除 HOH、已被提名的房客、POV 赢家、被拯救者
const baseAvailable = computed(() => {
  const hohId = nomination.value?.hohId || ''
  const vetoWinnerId = (nomination.value as any)?.vetoWinnerId || ''
  const nomineeIdSet = new Set(nomination.value?.nomineeIds || [])
  const excludeSet = new Set([hohId, vetoWinnerId, savedPlayerId.value])
  return activeList.value.filter(h =>
    !excludeSet.has(h.id) &&
    !nomineeIdSet.has(h.id)
  )
})

async function fetchData() {
  try {
    const data = await bbGetCurrentNomination()
    nomination.value = data as any
    twistInfo.value = (data as any)?.twists || null
  } catch {}
  try {
    const vetoData = await bbGetCurrentVeto()
    veto.value = vetoData as any
    savedPlayerId.value = (vetoData as any)?.usedOnPlayerId || ''
    savedPlayerName.value = (vetoData as any)?.usedOnPlayerName || ''
  } catch {}
  try {
    const list = await bbGetActiveHouseguests()
    activeList.value = list
    const map: Record<string, string> = {}
    list.forEach(h => { map[h.id] = h.name })
    activeMap.value = map
  } catch {}
}

async function replaceNomination() {
  if (!replaceId.value) return
  const pName = activeMap.value[replaceId.value] || ''
  try {
    await bbReplaceNomination(replaceId.value, pName)
    showReplaceModal.value = false
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

onMounted(fetchData)
</script>

<style scoped>
.bb-replacement-admin { max-width: 1000px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }

/* 否决权卡片 */
.veto-card { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #ffaa00; border-radius: 12px; padding: 24px; display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
.veto-icon { font-size: 48px; }
.veto-info { flex: 1; }
.veto-label { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 4px; }
.veto-winner { font-size: 18px; font-weight: 700; color: #ffaa00; margin-bottom: 4px; }
.veto-saved { font-size: 14px; color: #aaa; }
.highlight { color: #00ff88; }

.twist-action-hint { padding: 10px 14px; background: #00ff8811; border: 1px solid #00ff8833; border-radius: 8px; font-size: 13px; color: #00ff88; margin-bottom: 20px; }

/* 状态面板 */
.status-panel { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 12px; }
.status-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
.status-row + .status-row { border-top: 1px solid #00ff8811; }
.status-label { font-size: 13px; color: #888; min-width: 120px; }
.status-value { font-size: 14px; font-weight: 600; color: #e0e0e0; }
.status-value.no-data { color: #555; font-weight: 400; }
.hoh-row .status-value { color: #4488ff; }
.nom-row { align-items: flex-start; }
.nom-row .status-label { padding-top: 4px; }
.nominee-list { display: flex; flex-wrap: wrap; gap: 6px; }
.nominee-tag {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px;
  background: #ff444410;
  border: 1px solid #ff444433;
  border-radius: 8px;
  font-size: 14px; font-weight: 600; color: #ff4444;
}
.nominee-tag.replacement {
  background: #ffaa0010; border-color: #ffaa0044; color: #ffaa00;
}
.replacement-badge {
  font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: #ffaa0022; color: #ffaa00; border: 1px solid #ffaa0033;
}
.saved-row .saved-name { color: #00ff88; }

/* 替换完成提示 */
.done-hint { background: #00ff8810; border: 1px solid #00ff8844; border-radius: 10px; padding: 12px 16px; font-size: 14px; color: #00ff88; margin-bottom: 20px; }
.done-hint strong { color: #00ff88; }

/* 操作区 */
.action-section { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.action-section h3 { margin: 0 0 4px; font-size: 16px; color: #e0e0e0; }
.action-hint { font-size: 12px; color: #888; margin: 0 0 12px; }
.action-buttons { display: flex; gap: 12px; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }
.bb-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.bb-modal { background: #1a1a3e; border: 1px solid #00ff8844; border-radius: 12px; width: 400px; max-width: 90vw; }
.bb-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #00ff8822; }
.bb-modal-header h3 { margin: 0; color: #00ff88; font-size: 16px; }
.close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; }
.bb-modal-body { padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
.bb-select { background: #0f0f2e; border: 1px solid #00ff8822; color: #e0e0e0; padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; cursor: pointer; width: 100%; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
</style>
