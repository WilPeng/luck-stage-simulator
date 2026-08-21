<template>
  <div class="bb-eviction-admin">
    <div class="page-header">
      <h1>淘汰结果</h1>
      <span class="round-tag">第{{ $route.params.round }}周</span>
    </div>

    <div v-if="lastEviction" class="eviction-result-card">
      <div class="result-icon">🚪</div>
      <div class="result-info">
        <div class="result-label">最新淘汰结果</div>
        <div class="result-name">{{ lastEviction.evictedName }}</div>
        <div class="result-votes">{{ lastEviction.voteCount }} / {{ lastEviction.totalVotes }} 票</div>
      </div>
    </div>

    <div v-if="twistInfo && (twistInfo.isTripleEviction || twistInfo.isKarmicPawnship)" class="twist-info-bar">
      <span v-if="twistInfo.isTripleEviction" class="twist-item triple">🔱 三重献祭：本轮将淘汰得票最高的 2 人</span>
      <span v-if="twistInfo.isKarmicPawnship" class="twist-item karmic">⚖️ 因果报应：被提名但未被淘汰的幸存者将自动成为下轮 HOH</span>
    </div>

    <div class="action-section">
      <h3>操作 - 宣布结果</h3>
      <div v-if="twistInfo?.isTripleEviction" class="twist-action-hint">
        🔱 三重献祭生效中：宣布结果后将淘汰得票最高的 2 名被提名人
      </div>
      <div class="action-buttons">
        <button class="bb-btn bb-btn-danger" @click="announceResult" :disabled="voteData.total === 0">
          🚪 宣布淘汰结果{{ twistInfo?.isTripleEviction ? '（双淘汰）' : '' }}
        </button>
      </div>
    </div>

    <div v-if="voteData.votes?.length > 0" class="votes-section">
      <h3>投票明细</h3>
      <div class="table-container">
        <table class="bb-table">
          <thead><tr><th>投票者</th><th>投票对象</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="v in voteData.votes" :key="v.id">
              <td>{{ v.voterName }}</td>
              <td class="highlight">{{ v.targetName }}</td>
              <td class="time">{{ formatTime(v.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="history-section">
      <h3>淘汰历史</h3>
      <div class="table-container">
        <table class="bb-table">
          <thead><tr><th>轮次</th><th>被淘汰者</th><th>得票</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="e in evictionHistory" :key="e.id">
              <td>{{ formatTime(e.createdAt) }}</td>
              <td class="highlight">{{ e.evictedName }}</td>
              <td>{{ e.voteCount }} / {{ e.totalVotes }}</td>
              <td class="time">{{ formatTime(e.updatedAt) }}</td>
            </tr>
            <tr v-if="evictionHistory.length === 0"><td colspan="4" class="empty-cell">暂无淘汰记录</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { bbGetVotes, bbAnnounceEviction, bbGetEvictionHistory } from '../../../services/bbApi'
import type { BBEviction } from '../../../types/bigbrother'

const voteData = ref<{ votes: any[]; total: number }>({ votes: [], total: 0 })
const lastEviction = ref<BBEviction | null>(null)
const evictionHistory = ref<BBEviction[]>([])
const twistInfo = ref<any>(null)

async function fetchData() {
  try { voteData.value = await bbGetVotes() } catch {}
  try { evictionHistory.value = await bbGetEvictionHistory() } catch {}
  lastEviction.value = evictionHistory.value[0] || null
}

async function announceResult() {
  const msg = twistInfo.value?.isTripleEviction
    ? '确定宣布淘汰结果？此操作将淘汰得票最高的 2 名房客（三重献祭）。'
    : '确定宣布淘汰结果？此操作将淘汰得票最多的房客。'
  if (!confirm(msg)) return
  try {
    const result = await bbAnnounceEviction()
    twistInfo.value = result
    if (result.isTripleEviction && result.evicted?.length > 1) {
      alert(`${result.evicted.map((e: any) => e.name).join('、')} 被淘汰！(${result.totalVotes}总票)`)
    } else if (result.evicted?.length > 0) {
      alert(`${result.evicted[0].name} 被淘汰！(${result.evicted[0].votes}票)`)
    }
    if (result.karmicHoh) {
      alert(`⚖️ 因果报应生效：${result.karmicHoh} 将成为下轮 HOH`)
    }
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

function formatTime(t: string) { return t ? new Date(t).toLocaleString('zh-CN') : '' }

onMounted(fetchData)
</script>

<style scoped>
.bb-eviction-admin { max-width: 1000px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.eviction-result-card { background: linear-gradient(135deg, #2e0f0f, #3e1a1a); border: 1px solid #ff4444; border-radius: 12px; padding: 24px; display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
.result-icon { font-size: 48px; }
.result-label { font-size: 12px; color: #888; text-transform: uppercase; }
.result-name { font-size: 22px; font-weight: 700; color: #ff4444; }
.result-votes { font-size: 14px; color: #aaa; margin-top: 4px; }
.twist-info-bar { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 6px; }
.twist-item { font-size: 13px; color: #aaa; }
.twist-item.triple { color: #e74c3c; }
.twist-item.karmic { color: #00ff88; }
.twist-action-hint { padding: 10px 14px; background: #e74c3c11; border: 1px solid #e74c3c33; border-radius: 8px; font-size: 13px; color: #e74c3c; margin-bottom: 12px; }
.action-section { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.action-section h3 { margin: 0 0 12px; font-size: 16px; color: #e0e0e0; }
.action-buttons { display: flex; gap: 12px; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-danger { border-color: #ff4444; color: #ff4444; }
.bb-btn-danger:hover { background: #ff444422; }
.votes-section h3, .history-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.votes-section { margin-bottom: 20px; }
.bb-table { width: 100%; border-collapse: collapse; }
.bb-table th, .bb-table td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #00ff8811; font-size: 14px; color: #ccc; }
.bb-table th { color: #888; font-size: 12px; text-transform: uppercase; }
.highlight { color: #ffaa00; font-weight: 500; }
.time { font-size: 12px; color: #666; }
.empty-cell { text-align: center; color: #666; padding: 32px; }
</style>
