<template>
  <div class="bb-hoh-admin">
    <div class="page-header">
      <h1>HOH 管理</h1>
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

    <div class="action-section">
      <h3>操作</h3>
      <div class="action-buttons">
        <button class="bb-btn" @click="runCompetition">🎲 模拟 HOH 竞争</button>
        <button class="bb-btn" @click="showAssignModal = true">✏️ 手动指定 HOH</button>
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

    <!-- 手动指定弹窗 -->
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
            </div>
            <div class="form-actions">
              <button class="bb-btn" @click="showAssignModal = false">取消</button>
              <button class="bb-btn bb-btn-primary" @click="assignHoh">确认指定</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { bbGetCurrentHoh, bbGetHohHistory, bbRunHohCompetition, bbAssignHoh, bbGetActiveHouseguests } from '../../../services/bbApi'
import type { BBHohRecord, BBHouseguest } from '../../../types/bigbrother'

const route = useRoute()
const currentHoh = ref<BBHohRecord | null>(null)
const history = ref<BBHohRecord[]>([])
const activeHouseguests = ref<{ id: string; name: string }[]>([])
const showAssignModal = ref(false)
const selectedPlayerId = ref('')

async function fetchData() {
  try { currentHoh.value = await bbGetCurrentHoh() } catch {}
  try { history.value = await bbGetHohHistory() } catch {}
  try { activeHouseguests.value = await bbGetActiveHouseguests() } catch {}
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

function getRoundIndex(roundId: string): string {
  const match = history.value.find(h => h.roundId === roundId)
  return roundId?.slice(-4) || '?'
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
.round-tag {
  background: #00ff8822; color: #00ff88; padding: 2px 12px;
  border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844;
}
.current-hoh-card {
  background: linear-gradient(135deg, #0f0f2e, #1a1a3e);
  border: 1px solid #00ff88; border-radius: 12px;
  padding: 24px; display: flex; align-items: center; gap: 20px; margin-bottom: 20px;
}
.current-hoh-card.empty { border-color: #444; }
.hoh-icon { font-size: 48px; }
.hoh-label { font-size: 12px; color: #888; text-transform: uppercase; }
.hoh-name { font-size: 24px; font-weight: 700; color: #00ff88; }
.hoh-type { font-size: 13px; color: #aaa; margin-top: 4px; }
.action-section { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.action-section h3 { margin: 0 0 12px; font-size: 16px; color: #e0e0e0; }
.action-buttons { display: flex; gap: 12px; }
.bb-btn {
  background: transparent; border: 1px solid #00ff8844; color: #00ff88;
  padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.bb-btn:hover { background: #00ff8822; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }
.history-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.bb-table { width: 100%; border-collapse: collapse; }
.bb-table th, .bb-table td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #00ff8811; font-size: 14px; color: #ccc; }
.bb-table th { color: #888; font-size: 12px; text-transform: uppercase; }
.highlight { color: #00ff88; font-weight: 500; }
.time { font-size: 12px; color: #666; }
.empty-cell { text-align: center; color: #666; padding: 32px; }
.bb-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
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
