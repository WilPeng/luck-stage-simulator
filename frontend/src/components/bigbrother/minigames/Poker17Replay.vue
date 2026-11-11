<template>
  <div class="p17-replay">
    <div class="p17r-rules">
      <div class="p17r-title">17 Poker 复盘</div>
      <div class="p17r-desc">
        17 张牌（A/K/Q/J/10 + 4 花色 + Joker）对战。每轮先下底注，再翻牌、换牌、下注/跟注/加注/弃牌，
        最后按牌型比较大小；筹码归零或 10 轮后筹码最多者获胜。
      </div>
      <div class="p17r-tags">
        <span class="p17r-tag">初始筹码：{{ meta.initialChips }}</span>
        <span class="p17r-tag">总轮数：{{ meta.totalRounds }}</span>
        <span class="p17r-tag">桌上总筹码：{{ meta.totalChips }}</span>
        <span v-if="meta.finalResult?.endReason" class="p17r-tag">结束原因：{{ endReasonLabel(meta.finalResult.endReason) }}</span>
      </div>
    </div>

    <!-- 最终排名 -->
    <div class="p17r-section">
      <div class="p17r-section-title">最终排名</div>
      <table class="p17r-table">
        <thead>
          <tr><th>名次</th><th>选手</th><th>最终筹码</th><th>盈亏</th><th>结果</th></tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in finalRanking" :key="p.playerId" :class="{ winner: p.winner }">
            <td>{{ i + 1 }}</td>
            <td class="p17r-name">{{ p.name }}</td>
            <td class="p17r-chips">{{ p.chips }}</td>
            <td :class="p.net >= 0 ? 'p17r-ok' : 'p17r-bad'">{{ p.net >= 0 ? '+' : '' }}{{ p.net }}</td>
            <td>{{ p.winner ? '🏆 获胜' : '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 逐轮过程 -->
    <div class="p17r-section">
      <div class="p17r-section-title">逐轮过程</div>
      <div v-for="r in meta.rounds || []" :key="r.round" class="p17r-round">
        <div class="p17r-round-head">
          <span class="p17r-round-no">第 {{ r.round }} 轮</span>
          <span class="p17r-round-type">{{ typeLabel(r.type) }}</span>
          <span class="p17r-pot">底池 {{ r.pot }}</span>
          <span v-if="r.refundedAnte" class="p17r-dim">退还底注 {{ r.refundedAnte }}</span>
          <span v-if="(r.winnerNames || []).length" class="p17r-winner">赢家：{{ r.winnerNames.join('、') }}</span>
        </div>

        <table class="p17r-table compact">
          <thead>
            <tr><th>选手</th><th>手牌</th><th>牌型</th><th>本轮盈亏</th><th>分得</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in participants" :key="p.playerId">
              <td class="p17r-name">{{ p.playerName }}</td>
              <td class="p17r-hand">
                <span v-for="(c, ci) in (r.hands?.[p.playerId] || [])" :key="ci" class="p17r-card" :class="cardClass(c)">{{ cardLabel(c) }}</span>
                <span v-if="!r.hands || !r.hands[p.playerId]" class="p17r-dim">未摊牌</span>
              </td>
              <td class="p17r-eval">{{ evalText(r, p.playerId) }}</td>
              <td :class="(r.chipDeltas?.[p.playerId] || 0) >= 0 ? 'p17r-ok' : 'p17r-bad'">
                {{ deltaText(r.chipDeltas?.[p.playerId]) }}
              </td>
              <td class="p17r-chips">{{ r.payouts?.[p.playerId] ?? '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!(meta.rounds || []).length" class="p17r-dim" style="text-align:center;padding:16px">暂无轮次记录</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ meta: any; participants?: { playerId: string; playerName: string }[] }>()

const participants = computed(() => props.participants || [])
const nameOf = (pid: string) => participants.value.find(p => p.playerId === pid)?.playerName || pid

const finalRanking = computed(() => {
  const fr = props.meta?.finalResult || {}
  const chips = fr.chips || {}
  const net = fr.net || {}
  const winners = new Set(fr.winnerIds || [])
  return Object.keys(chips).map(pid => ({
    playerId: pid,
    name: nameOf(pid),
    chips: chips[pid] || 0,
    net: net[pid] || 0,
    winner: winners.has(pid)
  })).sort((a, b) => b.chips - a.chips)
})

function cardLabel(c: any) {
  if (!c) return ''
  if (c.label) return c.label
  if (c.joker) return 'Joker'
  return `${c.rank || ''}${c.suit || ''}`
}
function cardClass(c: any) {
  if (!c) return ''
  if (c.color === 'red') return 'red'
  if (c.color === 'purple') return 'purple'
  return 'black'
}
function evalText(r: any, pid: string) {
  const e = r.evaluations?.[pid]
  if (!e) return '—'
  const name = e.categoryName || e.category || e.name || ''
  return name || '—'
}
function deltaText(v: any) {
  const n = Number(v) || 0
  return n >= 0 ? `+${n}` : `${n}`
}
function typeLabel(t: string) {
  return ({ showdown: '摊牌结算', fold: '弃牌结束', no_contest: '双方过牌·退回底注' } as Record<string, string>)[t] || t || ''
}
function endReasonLabel(r: string) {
  return ({ chips_zero: '有人筹码归零', tie: '平局', total_rounds: '完成全部轮数' } as Record<string, string>)[r] || r || ''
}
</script>

<style scoped>
.p17-replay { display: flex; flex-direction: column; gap: 14px; }
.p17r-rules { background: #b39bff0e; border-left: 3px solid #b39bff; border-radius: 8px; padding: 12px 14px; }
.p17r-title { font-size: 15px; font-weight: 700; color: #ece7fb; }
.p17r-desc { font-size: 13px; color: #b9c6e6; line-height: 1.6; margin-top: 4px; }
.p17r-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.p17r-tag { font-size: 12px; color: #c9a6ff; background: #b39bff18; border: 1px solid #b39bff33; border-radius: 6px; padding: 2px 8px; }
.p17r-section { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 10px; padding: 12px; }
.p17r-section-title { font-size: 13px; color: #b39bff; font-weight: 700; margin-bottom: 10px; }
.p17r-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.p17r-table th, .p17r-table td { border: 1px solid #ffffff12; padding: 6px 9px; text-align: center; color: #cfc4ea; }
.p17r-table th { background: #ffffff08; color: #b9c6e6; font-weight: 600; }
.p17r-table.compact th, .p17r-table.compact td { padding: 4px 8px; font-size: 12px; }
.p17r-table tr.winner td { background: #e6c98810; }
.p17r-name { text-align: left; color: #ece7fb; white-space: nowrap; }
.p17r-chips { color: #e6c988; font-weight: 700; }
.p17r-ok { color: #7ee0a0; }
.p17r-bad { color: #ff6b6b; }
.p17r-dim { color: #6b5f92; }
.p17r-hand { display: flex; flex-wrap: wrap; gap: 3px; justify-content: center; }
.p17r-card { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 24px; padding: 0 4px; border-radius: 4px; background: #2a1a4a; border: 1px solid #b39bff44; font-size: 11px; font-weight: 700; color: #ece7fb; }
.p17r-card.red { color: #ff8f8f; border-color: #ff444455; }
.p17r-card.purple { color: #c9a6ff; border-color: #b39bff66; }
.p17r-card.black { color: #dfe7ff; }
.p17r-eval { color: #c9a6ff; }
.p17r-round { margin-bottom: 14px; }
.p17r-round:last-child { margin-bottom: 0; }
.p17r-round-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 13px; }
.p17r-round-no { color: #b39bff; font-weight: 700; }
.p17r-round-type { color: #e6c988; }
.p17r-pot { color: #cfc4ea; }
.p17r-winner { color: #7ee0a0; }
</style>
