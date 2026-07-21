<template>
  <div class="bb-veto-admin">
    <div class="page-header">
      <h1>否决权管理</h1>
      <span class="round-tag">第{{ $route.params.round }}周</span>
    </div>

    <div v-if="veto" class="veto-card">
      <div class="veto-icon">🛡️</div>
      <div class="veto-info">
        <div class="veto-label">否决权</div>
        <div class="veto-winner">{{ veto.winnerName || '暂无获胜者' }}</div>
        <div class="veto-status">{{ veto.used ? '✅ 已使用' : '⏳ 未使用' }}</div>
        <div v-if="veto.used && (veto.usedOnPlayerName || veto.targetPlayerName)" class="veto-saved">
          拯救: <strong class="highlight">{{ veto.usedOnPlayerName || veto.targetPlayerName }}</strong>
          <span class="veto-removed">（已从提名名单中移除）</span>
        </div>
        <div v-if="veto.participants && veto.participants.length > 0" class="veto-participants">
          <div class="veto-subtitle">参与者（HOH + 2名被提名人 + 随机抽{{ veto.drawCount || 3 }}人）</div>
          <div class="participant-list">
            <span v-for="p in veto.participants" :key="p.playerId" class="participant-tag"
              :class="{ winner: p.playerId === veto.winnerId }">
              {{ p.playerName }}
              <span v-if="p.playerId === veto.winnerId" class="winner-badge">🏆</span>
            </span>
          </div>
        </div>
      </div>
    </div>
    <!-- 否决权已使用，提示需要替换提名 -->
    <div v-if="veto?.used && nomination && nomination.nomineeIds.length < 2" class="replacement-hint">
      ⚠️ 否决权已使用，请前往<a href="javascript:void(0)" @click="$router.push('/games/bigbrother/admin/nomination')" class="link">提名管理</a>替换提名
    </div>
    <div v-else class="veto-card empty">
      <p>暂无否决权记录</p>
    </div>

    <div class="action-section">
      <h3>操作</h3>
      <div class="action-buttons">
        <button class="bb-btn" @click="runCompetition">🎲 模拟否决权竞争</button>
        <button class="bb-btn" :disabled="!veto || veto.used" @click="showUseModal = true">✅ 使用否决权</button>
        <button class="bb-btn" :disabled="!veto" @click="skipVeto">⏭️ 不使用否决权</button>
      </div>
    </div>

    <div class="history-section">
      <h3>否决权历史</h3>
      <div class="table-container">
        <table class="bb-table">
          <thead><tr><th>轮次</th><th>获胜者</th><th>是否使用</th><th>拯救对象</th></tr></thead>
          <tbody>
            <tr v-for="r in history" :key="r.id">
              <td>{{ formatTime(r.createdAt) }}</td>
              <td class="highlight">{{ r.winnerName }}</td>
              <td>{{ r.used ? '✅ 已使用' : '❌ 未使用' }}</td>
              <td>{{ r.usedOnPlayerName || '-' }}</td>
            </tr>
            <tr v-if="history.length === 0"><td colspan="4" class="empty-cell">暂无记录</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showUseModal" class="bb-modal-overlay" @click.self="showUseModal = false">
        <div class="bb-modal">
          <div class="bb-modal-header"><h3>使用否决权</h3><button class="close-btn" @click="showUseModal = false">✕</button></div>
          <div class="bb-modal-body">
            <p style="color:#aaa;font-size:14px;margin-bottom:16px;">选择要拯救的被提名人</p>
            <div class="form-group">
              <label>拯救对象</label>
              <select v-model="savePlayerId" class="bb-select">
                <option v-for="n in nomineeOptions" :key="n.id" :value="n.id">{{ n.name }}</option>
              </select>
            </div>
            <div class="form-actions">
              <button class="bb-btn" @click="showUseModal = false">取消</button>
              <button class="bb-btn bb-btn-primary" @click="useVeto">确认拯救</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { bbGetCurrentVeto, bbGetVetoHistory, bbRunVetoCompetition, bbUseVeto, bbSkipVeto, bbGetCurrentNomination, bbGetActiveHouseguests } from '../../../services/bbApi'
import type { BBVetoRecord, BBNomination } from '../../../types/bigbrother'

const veto = ref<BBVetoRecord | null>(null)
const history = ref<BBVetoRecord[]>([])
const nomination = ref<BBNomination | null>(null)
const showUseModal = ref(false)
const savePlayerId = ref('')

const nomineeOptions = computed(() => {
  if (!nomination.value) return []
  return nomination.value.nomineeIds.map((id, i) => ({
    id,
    name: nomination.value!.nomineeNames[i] || id
  }))
})

async function fetchData() {
  try {
    veto.value = await bbGetCurrentVeto()
    history.value = await bbGetVetoHistory()
    nomination.value = await bbGetCurrentNomination()
  } catch {}
}

async function runCompetition() {
  try {
    const result = await bbRunVetoCompetition()
    alert(`否决权竞争完成！${result.winnerName} 获胜！`)
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

async function useVeto() {
  if (!savePlayerId.value) { alert('请选择要拯救的对象'); return }
  const p = nomineeOptions.value.find(n => n.id === savePlayerId.value)
  try {
    await bbUseVeto(savePlayerId.value, p?.name || '')
    showUseModal.value = false
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

async function skipVeto() {
  try {
    await bbSkipVeto()
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

function formatTime(t: string) { return t ? new Date(t).toLocaleDateString('zh-CN') : '?' }

onMounted(fetchData)
</script>

<style scoped>
.bb-veto-admin { max-width: 1000px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.veto-card { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #ffaa00; border-radius: 12px; padding: 24px; display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
.veto-card.empty { border-color: #444; }
.veto-card.empty p { text-align: center; color: #666; width: 100%; }
.veto-icon { font-size: 48px; }
.veto-label { font-size: 12px; color: #888; text-transform: uppercase; }
.veto-winner { font-size: 20px; font-weight: 700; color: #ffaa00; }
.veto-status { font-size: 13px; color: #aaa; margin-top: 4px; }
.veto-saved { margin-top: 8px; font-size: 14px; color: #aaa; }
.highlight { color: #00ff88; }
.veto-removed { display: block; font-size: 12px; color: #ffaa00; margin-top: 4px; }
.veto-participants { margin-top: 16px; padding-top: 16px; border-top: 1px solid #00ff8811; }
.veto-subtitle { font-size: 12px; color: #888; margin-bottom: 8px; }
.participant-list { display: flex; flex-wrap: wrap; gap: 6px; }
.participant-tag { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 6px; font-size: 12px; color: #ccc; }
.participant-tag.winner { border-color: #ffaa00; background: #ffaa0008; color: #ffaa00; font-weight: 600; }
.winner-badge { font-size: 12px; }
.replacement-hint { background: #ffaa0022; border: 1px solid #ffaa00; border-radius: 10px; padding: 12px 16px; font-size: 14px; color: #ffaa00; margin-bottom: 20px; }
.replacement-hint .link { color: #ffaa00; text-decoration: underline; }
.action-section { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.action-section h3 { margin: 0 0 12px; font-size: 16px; color: #e0e0e0; }
.action-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }
.history-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.bb-table { width: 100%; border-collapse: collapse; }
.bb-table th, .bb-table td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #00ff8811; font-size: 14px; color: #ccc; }
.bb-table th { color: #888; font-size: 12px; text-transform: uppercase; }
.empty-cell { text-align: center; color: #666; padding: 32px; }
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
