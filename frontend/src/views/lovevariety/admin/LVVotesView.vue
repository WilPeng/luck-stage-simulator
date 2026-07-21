<template>
  <div class="lv-votes">
    <div class="page-header">
      <h1>喜爱值投送详情</h1>
      <span class="round-tag">第{{ $route.params.round }}轮</span>
    </div>

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else>
      <!-- 收获汇总 -->
      <div class="summary-section">
        <h3>收获喜爱值汇总</h3>
        <div class="summary-grid">
          <div v-for="item in receivedSummary" :key="item.playerId" class="summary-card"
            :class="{ single: item.isSingle }">
            <div class="player-name">{{ item.playerName }}</div>
            <div class="total-value">{{ item.total }}</div>
            <div class="total-label">收获喜爱值</div>
            <div v-if="item.isSingle" class="single-badge">❤️ 单身汉</div>
          </div>
        </div>
      </div>

      <!-- 投送明细表格 -->
      <div class="detail-section">
        <h3>投送明细</h3>
        <div class="table-container">
          <table class="lv-table">
            <thead>
              <tr>
                <th>投票人</th>
                <th>被投人</th>
                <th>投送值</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="v in votes" :key="v.id">
                <td>{{ v.voterName }}</td>
                <td>{{ v.targetName }}</td>
                <td><span class="value-badge">{{ v.value }}</span></td>
              </tr>
              <tr v-if="votes.length === 0"><td colspan="3" class="empty-cell">暂无投送记录</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { lvGetRoundVotes, lvGetRoundPairing } from '../../../services/lovevarietyApi'
import type { LVLoveVote } from '../../../types/lovevariety'

const route = useRoute()
const votes = ref<LVLoveVote[]>([])
const pairing = ref<any>(null)
const loading = ref(true)

const roundId = computed(() => `round-${route.params.round}`)

const receivedSummary = computed(() => {
  const map: Record<string, { playerName: string; total: number }> = {}
  for (const v of votes.value) {
    if (!map[v.targetId]) map[v.targetId] = { playerName: v.targetName, total: 0 }
    map[v.targetId].total += v.value
  }
  const list = Object.entries(map).map(([playerId, data]) => ({
    playerId,
    playerName: data.playerName,
    total: data.total,
    isSingle: pairing.value?.singlePlayerId === playerId
  }))
  list.sort((a, b) => a.total - b.total)
  return list
})

onMounted(async () => {
  try {
    votes.value = await lvGetRoundVotes(roundId.value)
    pairing.value = await lvGetRoundPairing(roundId.value)
  } catch {}
  loading.value = false
})
</script>

<style scoped>
.lv-votes { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag {
  background: #ff69b422; color: #ff69b4; padding: 2px 12px;
  border-radius: 10px; font-size: 12px; border: 1px solid #ff69b444;
}
.loading { text-align: center; color: #888; padding: 40px; font-size: 16px; }
.summary-section { margin-bottom: 24px; }
.summary-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
.summary-card {
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 10px;
  padding: 16px; text-align: center; position: relative;
}
.summary-card.single { border-color: #ff69b4; background: #ff69b408; }
.summary-card .player-name { font-size: 14px; font-weight: 600; color: #e0e0e0; margin-bottom: 8px; }
.summary-card .total-value { font-size: 28px; font-weight: 700; color: #ff69b4; }
.summary-card .total-label { font-size: 11px; color: #888; margin-top: 4px; }
.summary-card .single-badge { font-size: 12px; color: #ff69b4; margin-top: 6px; }
.detail-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.table-container { overflow-x: auto; }
.lv-table { width: 100%; border-collapse: collapse; }
.lv-table th, .lv-table td {
  padding: 10px 16px; text-align: left; border-bottom: 1px solid #ff69b411;
  font-size: 14px; color: #ccc;
}
.lv-table th { color: #888; font-size: 12px; text-transform: uppercase; }
.lv-table tr:hover td { background: #ff69b405; }
.value-badge { background: #ff69b415; color: #ff69b4; padding: 2px 10px; border-radius: 10px; font-size: 13px; font-weight: 600; }
.empty-cell { text-align: center; color: #666; padding: 32px; }
</style>
