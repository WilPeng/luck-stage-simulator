<template>
  <div class="bb-history">
    <div class="page-header">
      <h1>历史记录</h1>
    </div>

    <div class="section">
      <h3>HOH 历史</h3>
      <div class="list">
        <div v-for="r in hohHistory" :key="r.id" class="list-item">
          <span class="item-icon">👑</span>
          <span class="item-text">{{ r.winnerName }} - {{ r.competitionName }}</span>
          <span class="item-time">{{ formatTime(r.createdAt) }}</span>
        </div>
        <div v-if="hohHistory.length === 0" class="empty">暂无记录</div>
      </div>
    </div>

    <div class="section">
      <h3>淘汰历史</h3>
      <div class="list">
        <div v-for="e in evictionHistory" :key="e.id" class="list-item evicted">
          <span class="item-icon">🚪</span>
          <span class="item-text">{{ e.evictedName }} 被淘汰 ({{ e.voteCount }}/{{ e.totalVotes }}票)</span>
          <span class="item-time">{{ formatTime(e.createdAt) }}</span>
        </div>
        <div v-if="evictionHistory.length === 0" class="empty">暂无记录</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { bbGetHohHistory, bbGetEvictionHistory } from '../../../services/bbApi'
import type { BBHohRecord, BBEviction } from '../../../types/bigbrother'

const hohHistory = ref<BBHohRecord[]>([])
const evictionHistory = ref<BBEviction[]>([])

function formatTime(t: string) { return t ? new Date(t).toLocaleDateString('zh-CN') : '' }

onMounted(async () => {
  try {
    hohHistory.value = await bbGetHohHistory()
    evictionHistory.value = await bbGetEvictionHistory()
  } catch {}
})
</script>

<style scoped>
.bb-history { max-width: 800px; margin: 0 auto; }
.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #ece7fb; margin: 0; }
.section { background: #1b1130; border: 1px solid #b39bff22; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.section h3 { margin: 0 0 12px; font-size: 16px; color: #ece7fb; }
.list { display: flex; flex-direction: column; gap: 8px; }
.list-item { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #b39bff05; border-radius: 8px; }
.list-item.evicted { background: #ff444405; }
.item-icon { font-size: 18px; }
.item-text { flex: 1; font-size: 14px; color: #cfc4ea; }
.item-time { font-size: 12px; color: #6b5f92; white-space: nowrap; }
.empty { text-align: center; color: #6b5f92; padding: 24px; }
</style>
