<template>
  <div class="bb-veto-admin">
    <div class="page-header">
      <h1>否决权竞争</h1>
      <span class="round-tag">第{{ $route.params.round }}周</span>
    </div>

    <div v-if="twistInfo?.isNoPendantChallenge" class="twist-info-bar">
      <span class="twist-item no-pendant">🚫 无护符挑战：本轮跳过否决权竞争，无人持有否决权</span>
    </div>

    <div v-if="veto" class="veto-card">
      <div class="veto-icon">🛡️</div>
      <div class="veto-info">
        <div class="veto-label">否决权</div>
        <div class="veto-winner">{{ veto.winnerName || '暂无获胜者' }}</div>
        <div class="veto-status">{{ veto.used ? '✅ 已使用' : '⏳ 未使用' }}</div>
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
    <div v-else class="veto-card empty">
      <p>暂无否决权记录，请先进行否决权竞争</p>
    </div>

    <div class="action-section">
      <h3>操作</h3>
      <div class="action-buttons">
        <button class="bb-btn" @click="runCompetition" :disabled="twistInfo?.isNoPendantChallenge">
          🎲 模拟否决权竞争
        </button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { bbGetCurrentVeto, bbGetVetoHistory, bbRunVetoCompetition } from '../../../services/bbApi'
import type { BBVetoRecord } from '../../../types/bigbrother'

const veto = ref<BBVetoRecord | null>(null)
const twistInfo = ref<any>(null)
const history = ref<BBVetoRecord[]>([])

async function fetchData() {
  try {
    const result = await bbGetCurrentVeto()
    veto.value = result as any
    twistInfo.value = (result as any)?.twists || null
  } catch {}
  try { history.value = await bbGetVetoHistory() } catch {}
}

async function runCompetition() {
  try {
    const result = await bbRunVetoCompetition()
    alert(`否决权竞争完成！${result.winnerName} 获胜！`)
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
.twist-info-bar { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 6px; }
.twist-item { font-size: 13px; color: #aaa; }
.twist-item.no-pendant { color: #ffaa00; }
.veto-participants { margin-top: 16px; padding-top: 16px; border-top: 1px solid #00ff8811; }
.veto-subtitle { font-size: 12px; color: #888; margin-bottom: 8px; }
.participant-list { display: flex; flex-wrap: wrap; gap: 6px; }
.participant-tag { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 6px; font-size: 12px; color: #ccc; }
.participant-tag.winner { border-color: #ffaa00; background: #ffaa0008; color: #ffaa00; font-weight: 600; }
.winner-badge { font-size: 12px; }
.action-section { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.action-section h3 { margin: 0 0 12px; font-size: 16px; color: #e0e0e0; }
.action-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.history-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.bb-table { width: 100%; border-collapse: collapse; }
.bb-table th, .bb-table td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #00ff8811; font-size: 14px; color: #ccc; }
.bb-table th { color: #888; font-size: 12px; text-transform: uppercase; }
.highlight { color: #ffaa00; font-weight: 500; }
.empty-cell { text-align: center; color: #666; padding: 32px; }
</style>
