<template>
  <div class="bb-eviction-admin">
    <div class="page-header">
      <h1>淘汰投票管理</h1>
      <span class="round-tag">第{{ $route.params.round }}周</span>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">{{ voteData.total }}</div>
        <div class="stat-label">已投票数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ activeCount }}</div>
        <div class="stat-label">可投票房客</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ voteData.total > 0 ? Math.round(voteData.total / activeCount * 100) : 0 }}%</div>
        <div class="stat-label">投票率</div>
      </div>
    </div>

    <!-- 投票管理：为每位房客投票 -->
    <div v-if="activeHouseguests.length > 0 && nomination" class="vote-manage-section">
      <h3>🗳️ 为房客投票</h3>
      <div class="vote-grid">
        <div v-for="h in activeHouseguests" :key="h.id" class="vote-row"
          :class="{ voted: getVote(h.id), isHoh: h.id === currentHohId }">
          <div class="voter-info">
            <span class="voter-name">{{ h.name }}</span>
            <span v-if="h.id === currentHohId" class="hoh-tag">HOH（仅平票可投）</span>
          </div>
          <div class="voter-vote">
            <span v-if="getVote(h.id)" class="voted-target">→ {{ getVote(h.id) }}</span>
            <span v-else class="not-voted">未投票</span>
          </div>
          <div class="voter-action">
            <select v-model="voteSelections[h.id]" class="bb-select-sm"
              @change="castVoteFor(h.id, h.name, voteSelections[h.id])">
              <option value="">选择投票对象</option>
              <option v-for="n in nomineeOptions" :key="n.id" :value="n.id"
                :disabled="h.id === n.id">
                {{ n.name }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div v-if="lastEviction" class="eviction-result-card">
      <div class="result-icon">🚪</div>
      <div class="result-info">
        <div class="result-label">最新淘汰结果</div>
        <div class="result-name">{{ lastEviction.evictedName }}</div>
        <div class="result-votes">{{ lastEviction.voteCount }} / {{ lastEviction.totalVotes }} 票</div>
      </div>
    </div>

    <div class="action-section">
      <h3>操作</h3>
      <div class="action-buttons">
        <button class="bb-btn bb-btn-danger" @click="announceResult" :disabled="voteData.total === 0">
          🚪 宣布淘汰结果
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
import { ref, computed, onMounted } from 'vue'
import { bbGetVotes, bbCastVote, bbAnnounceEviction, bbGetEvictionHistory, bbGetHouseguestStats, bbGetActiveHouseguests, bbGetCurrentNomination, bbGetCurrentHoh } from '../../../services/bbApi'
import type { BBEviction } from '../../../types/bigbrother'

const voteData = ref<{ votes: any[]; total: number }>({ votes: [], total: 0 })
const lastEviction = ref<BBEviction | null>(null)
const evictionHistory = ref<BBEviction[]>([])
const activeCount = ref(0)
const activeHouseguests = ref<{ id: string; name: string }[]>([])
const nomination = ref<any>(null)
const currentHoh = ref<any>(null)
const voteSelections = ref<Record<string, string>>({})

const currentHohId = computed(() => currentHoh.value?.winnerId || '')

const nomineeOptions = computed(() => {
  const ids = nomination.value?.nomineeIds || []
  const names = nomination.value?.nomineeNames || []
  return ids.map((id: string, i: number) => ({ id, name: names[i] || '' }))
})

function getVote(voterId: string): string {
  const v = voteData.value.votes?.find((v: any) => v.voterId === voterId)
  return v ? v.targetName : ''
}

async function castVoteFor(voterId: string, voterName: string, targetId: string) {
  if (!targetId) return
  try {
    // 查找被投票人的名字
    const target = nomineeOptions.value.find((n: any) => n.id === targetId)
    await bbCastVote(targetId, target?.name || '', voterId, voterName)
    try { voteData.value = await bbGetVotes() } catch {}
    voteSelections.value[voterId] = ''
  } catch (e: any) {
    alert(e?.message || '投票失败')
    voteSelections.value[voterId] = ''
  }
}

async function fetchData() {
  try { voteData.value = await bbGetVotes() } catch {}
  try { evictionHistory.value = await bbGetEvictionHistory() } catch {}
  lastEviction.value = evictionHistory.value[0] || null
  try { const stats = await bbGetHouseguestStats(); activeCount.value = stats.active } catch {}
  try { activeHouseguests.value = await bbGetActiveHouseguests() } catch {}
  try { nomination.value = await bbGetCurrentNomination() } catch {}
  try { currentHoh.value = await bbGetCurrentHoh() } catch {}
  // 初始化已投票的选中状态为空
  for (const h of activeHouseguests.value) {
    voteSelections.value[h.id] = ''
  }
}

async function announceResult() {
  if (!confirm('确定宣布淘汰结果？此操作将淘汰得票最多的房客。')) return
  try {
    const result = await bbAnnounceEviction()
    alert(`${result.evictedName} 被淘汰！(${result.voteCount}/${result.totalVotes}票)`)
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
.stats-row { display: flex; gap: 16px; margin-bottom: 20px; }
.stat-card { flex: 1; background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 16px; text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: #fff; }
.stat-label { font-size: 12px; color: #888; margin-top: 4px; }

.vote-manage-section { background: #0f0f2e; border: 1px solid #ffaa0022; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.vote-manage-section h3 { margin: 0 0 16px; font-size: 16px; color: #e0e0e0; }
.vote-grid { display: flex; flex-direction: column; gap: 8px; }
.vote-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #1a1a3e; border-radius: 8px; border: 1px solid #00ff8811; }
.vote-row.voted { border-color: #00ff8844; }
.vote-row.isHoh { border-color: #ffaa0044; background: #2e2a0f; }
.voter-info { flex: 1; min-width: 0; }
.voter-name { font-size: 14px; color: #fff; font-weight: 500; }
.hoh-tag { display: inline-block; margin-left: 8px; font-size: 10px; color: #ffaa00; background: #ffaa0022; padding: 1px 8px; border-radius: 6px; }
.voter-vote { width: 120px; text-align: center; }
.voted-target { color: #00ff88; font-size: 13px; }
.not-voted { color: #666; font-size: 12px; }
.voter-action { width: 160px; }
.bb-select-sm { width: 100%; padding: 6px 8px; background: #0f0f2e; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 12px; }
.bb-select-sm:focus { border-color: #ffaa00; outline: none; }
.bb-select-sm option { background: #0f0f2e; color: #fff; }

.eviction-result-card { background: linear-gradient(135deg, #2e0f0f, #3e1a1a); border: 1px solid #ff4444; border-radius: 12px; padding: 24px; display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
.result-icon { font-size: 48px; }
.result-label { font-size: 12px; color: #888; text-transform: uppercase; }
.result-name { font-size: 22px; font-weight: 700; color: #ff4444; }
.result-votes { font-size: 14px; color: #aaa; margin-top: 4px; }
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
