<template>
  <div class="bb-eviction-admin">
    <div class="page-header">
      <h1>淘汰投票</h1>
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
        <div class="stat-value">{{ voteData.total > 0 && activeCount > 0 ? Math.round(voteData.total / activeCount * 100) : 0 }}%</div>
        <div class="stat-label">投票率</div>
      </div>
    </div>

    <!-- 投票管理 -->
    <div v-if="activeHouseguests.length > 0 && nomination" class="vote-manage-section">
      <h3>🗳️ 为房客投票</h3>
      <div class="vote-grid">
        <div v-for="h in activeHouseguests" :key="h.id" class="vote-row"
          :class="{ voted: getVote(h.id), isHoh: h.id === currentHohId, isNominee: isNominee(h.id) }">
          <div class="voter-info">
            <span class="voter-name">{{ h.name }}</span>
            <span v-if="h.id === currentHohId" class="hoh-tag">HOH（仅平票可投）</span>
            <span v-if="isNominee(h.id)" class="nominee-tag">被提名</span>
          </div>
          <div class="voter-vote">
            <span v-if="getVote(h.id)" class="voted-target">→ {{ getVote(h.id) }}</span>
            <span v-else-if="isNominee(h.id)" class="not-voted">被提名（不可投票）</span>
            <span v-else class="not-voted">未投票</span>
          </div>
          <div class="voter-action">
            <select v-model="voteSelections[h.id]" class="bb-select-sm"
              :disabled="isNominee(h.id)"
              @change="castVoteFor(h.id, h.name, voteSelections[h.id])">
              <option value="">{{ isNominee(h.id) ? '被提名者不可投票' : '选择投票对象' }}</option>
              <option v-for="n in nomineeOptions" :key="n.id" :value="n.id"
                :disabled="h.id === n.id">
                {{ n.name }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div v-if="twistInfo?.isTripleEviction" class="twist-action-hint">
      🔱 三重献祭生效中：宣布结果后将淘汰得票最高的 2 名被提名人
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { bbGetVotes, bbCastVote, bbGetActiveHouseguests, bbGetCurrentNomination, bbGetCurrentHoh, bbGetHouseguestStats } from '../../../services/bbApi'

const voteData = ref<{ votes: any[]; total: number }>({ votes: [], total: 0 })
const twistInfo = ref<any>(null)
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

const nomineeIdSet = computed(() => new Set(nomination.value?.nomineeIds || []))

function isNominee(hid: string): boolean {
  return nomineeIdSet.value.has(hid)
}

function getVote(voterId: string): string {
  const v = voteData.value.votes?.find((v: any) => v.voterId === voterId)
  return v ? v.targetName : ''
}

async function castVoteFor(voterId: string, voterName: string, targetId: string) {
  if (!targetId) return
  try {
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
  try { const stats = await bbGetHouseguestStats(); activeCount.value = stats.active } catch {}
  try { activeHouseguests.value = await bbGetActiveHouseguests() } catch {}
  try { nomination.value = await bbGetCurrentNomination() } catch {}
  try { currentHoh.value = await bbGetCurrentHoh() } catch {}
  for (const h of activeHouseguests.value) {
    voteSelections.value[h.id] = ''
  }
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
.vote-row.isNominee { border-color: #ff444466; background: #2a0f0f; }
.voter-info { flex: 1; min-width: 0; }
.voter-name { font-size: 14px; color: #fff; font-weight: 500; }
.hoh-tag { display: inline-block; margin-left: 8px; font-size: 10px; color: #ffaa00; background: #ffaa0022; padding: 1px 8px; border-radius: 6px; }
.nominee-tag { display: inline-block; margin-left: 8px; font-size: 10px; color: #ff4444; background: #ff444422; padding: 1px 8px; border-radius: 6px; }
.voter-vote { width: 120px; text-align: center; }
.voted-target { color: #00ff88; font-size: 13px; }
.not-voted { color: #666; font-size: 12px; }
.voter-action { width: 160px; }
.bb-select-sm { width: 100%; padding: 6px 8px; background: #0f0f2e; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 12px; }
.bb-select-sm:disabled { opacity: 0.4; cursor: not-allowed; background: #1a0f0f; }
.bb-select-sm:focus { border-color: #ffaa00; outline: none; }
.bb-select-sm option { background: #0f0f2e; color: #fff; }
.twist-action-hint { padding: 10px 14px; background: #e74c3c11; border: 1px solid #e74c3c33; border-radius: 8px; font-size: 13px; color: #e74c3c; margin-bottom: 12px; }
.votes-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.bb-table { width: 100%; border-collapse: collapse; }
.bb-table th, .bb-table td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #00ff8811; font-size: 14px; color: #ccc; }
.bb-table th { color: #888; font-size: 12px; text-transform: uppercase; }
.highlight { color: #ffaa00; font-weight: 500; }
.time { font-size: 12px; color: #666; }
</style>
