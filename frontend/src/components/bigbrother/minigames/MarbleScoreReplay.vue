<template>
  <div class="msr">
    <div class="msr-head">
      <div class="msr-title">{{ meta.title || '弹珠得分' }}</div>
      <div class="msr-tags">
        <span class="msr-tag">{{ meta.modeLabel }}</span>
        <span v-for="s in summaryList" :key="s.label" class="msr-tag">{{ s.label }}：{{ s.value }}</span>
      </div>
      <div v-if="meta.description" class="msr-desc">{{ meta.description }}</div>
    </div>

    <div class="msr-main">
      <div class="msr-map">
        <MarbleMap :map="meta.map" :throws="allThrows" />
      </div>
      <div class="msr-legend">
        <div class="msr-legend-title">区域分值</div>
        <div class="msr-cells">
          <span v-for="cell in mapCells" :key="cell.id" class="msr-cell">
            <i :style="{ background: cell.color }"></i>{{ cell.score }} 分
          </span>
        </div>
        <div class="msr-legend-title" style="margin-top: 12px">选手</div>
        <div class="msr-players">
          <div
            v-for="p in meta.players || []"
            :key="p.playerId"
            class="msr-player"
            :style="{ borderLeftColor: p.color }"
          >
            <span class="mp-dot" :style="{ background: p.color }"></span>
            <span class="mp-name">{{ p.playerName }}</span>
            <span class="mp-score" :style="{ color: p.color }">{{ p.score }}</span>
            <span class="mp-status" :class="statusClass(p.status)">{{ p.status }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isSingle && tieText" class="msr-tie">{{ tieText }}</div>

    <div class="msr-block">
      <div class="msr-block-title">
        每位选手得分明细
        <span class="msr-note">颜色与地图落点标记一致</span>
      </div>
      <div class="msr-table-wrap">
        <table class="msr-table msr-matrix">
          <thead>
            <tr>
              <th class="col-player">选手</th>
              <template v-if="isSingle">
                <th>方向</th>
                <th>力度</th>
                <th>落点</th>
              </template>
              <template v-else>
                <th v-for="r in roundNumbers" :key="r">第{{ r }}轮</th>
              </template>
              <th>总得分</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in scoreRows" :key="row.playerId">
              <td class="col-player">
                <span class="player-cell">
                  <span class="mp-dot" :style="{ background: row.color }"></span>
                  <span class="mp-name">{{ row.playerName }}</span>
                </span>
              </td>
              <template v-if="isSingle">
                <td>{{ row.throw ? row.throw.angle + '°' : '—' }}</td>
                <td>{{ row.throw ? row.throw.power + '%' : '—' }}</td>
                <td>{{ row.throw ? `${row.throw.x}, ${row.throw.y}` : '—' }}</td>
              </template>
              <template v-else>
                <td
                  v-for="(score, i) in row.roundScores"
                  :key="i"
                  class="msr-score-cell"
                  :class="{ empty: score == null }"
                  :style="score == null ? undefined : { color: row.color }"
                >{{ score == null ? '—' : score }}</td>
              </template>
              <td class="msr-total" :style="{ color: row.color }">{{ row.score }}</td>
              <td class="msr-result" :class="row.isWinner ? 'ok' : (row.status === '淘汰' ? 'bad' : '')">
                {{ row.isWinner ? '🏆 获胜' : row.status }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="!isSingle" class="msr-block">
      <div class="msr-block-title">每轮发射细节</div>
      <div class="msr-rounds">
        <div v-for="h in meta.history || []" :key="h.round" class="msr-round">
          <div class="msr-round-head">
            <span>第 {{ h.round }} 轮</span>
            <span v-if="h.eliminated?.length" class="msr-out">
              淘汰：{{ h.eliminated.map(nameOf).join('、') }}
              <em v-if="h.tie">（并列最低 {{ h.lowestScore }} 分，随机判定）</em>
              <em v-else>（最低 {{ h.lowestScore }} 分）</em>
            </span>
          </div>
          <div class="msr-throws">
            <div
              v-for="t in h.throws || []"
              :key="t.playerId"
              class="msr-throw"
              :class="{ out: h.eliminated?.includes(t.playerId) }"
              :style="{ borderLeftColor: t.color }"
            >
              <span class="mp-dot" :style="{ background: t.color }"></span>
              <span class="mp-name">{{ t.playerName }}</span>
              <span class="msr-throw-fields">{{ t.angle }}° / {{ t.power }}%</span>
              <span class="msr-throw-score" :style="{ color: t.color }">{{ t.score }} 分</span>
            </div>
          </div>
        </div>
        <div v-if="!(meta.history || []).length" class="msr-empty">暂无回合记录</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MarbleMap from './MarbleMap.vue'

const props = defineProps<{ meta: any }>()

const mapCells = computed(() => props.meta?.map?.cells || [])

const summaryList = computed(() => {
  const s = props.meta?.summary
  if (!s) return []
  if (Array.isArray(s)) return s
  return Object.entries(s).map(([label, value]) => ({ label, value }))
})

const isSingle = computed(() => props.meta?.mode === 'single')

const allThrows = computed(() => {
  if (Array.isArray(props.meta?.allThrows) && props.meta.allThrows.length) return props.meta.allThrows
  const out: any[] = []
  for (const h of (props.meta?.history || [])) out.push(...(h.throws || []))
  return out
})

const roundNumbers = computed(() => {
  const set = new Set<number>()
  for (const h of (props.meta?.history || [])) {
    if (h.round != null) set.add(Number(h.round))
  }
  return [...set].sort((a, b) => a - b)
})

const scoreRows = computed(() => {
  const players: any[] = props.meta?.players || []
  const byId = new Map(players.map((p: any) => [p.playerId, p]))
  const order = (props.meta?.order?.length
    ? props.meta.order
    : players.map((p: any) => ({ playerId: p.playerId, playerName: p.playerName }))) as any[]

  const throwsByRound = new Map<number, Map<string, any>>()
  for (const h of (props.meta?.history || [])) {
    const m = new Map<string, any>()
    for (const t of (h.throws || [])) m.set(t.playerId, t)
    throwsByRound.set(Number(h.round), m)
  }

  const throwByPlayer = new Map<string, any>()
  for (const t of allThrows.value) throwByPlayer.set(t.playerId, t)

  const winners: string[] = props.meta?.winners || []
  return order.map((o: any) => {
    const p = byId.get(o.playerId) || {}
    const color = p.color || '#c9a6ff'
    const isWinner = winners.includes(o.playerId) || props.meta?.winnerId === o.playerId
    let status = p.status || ''
    if (!status) status = isWinner ? '获胜' : '完成'
    return {
      playerId: o.playerId,
      playerName: p.playerName || o.playerName || o.playerId,
      color,
      score: p.score ?? 0,
      status,
      isWinner,
      throw: throwByPlayer.get(o.playerId) || null,
      roundScores: roundNumbers.value.map(r => {
        const t = throwsByRound.get(r)?.get(o.playerId)
        return t ? t.score : null
      })
    }
  })
})

const tieText = computed(() => {
  const tb = props.meta?.tieBreak
  if (!tb || tb.type !== 'distance') return ''
  const tied = (tb.tied || []).map(nameOf).join('、')
  return `最高分并列：${tied}。按落点与区域中心的距离判定，${nameOf(tb.winnerId)} 胜出。`
})

function nameOf(id: string) {
  return props.meta?.players?.find((p: any) => p.playerId === id)?.playerName || id
}

function statusClass(s: string) {
  if (!s) return ''
  if (/获胜|存活/.test(s)) return 'ok'
  if (/淘汰/.test(s)) return 'bad'
  return ''
}
</script>

<style scoped>
.msr { display: flex; flex-direction: column; gap: 14px; }
.msr-head { background: #b39bff0e; border-left: 3px solid #b39bff; border-radius: 8px; padding: 12px 14px; }
.msr-title { font-size: 15px; font-weight: 700; color: #ece7fb; }
.msr-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.msr-tag { font-size: 12px; color: #c9a6ff; background: #b39bff18; border: 1px solid #b39bff33; border-radius: 6px; padding: 2px 8px; }
.msr-desc { font-size: 13px; color: #b9c6e6; line-height: 1.6; margin-top: 8px; }
.msr-main { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(220px, 0.85fr); gap: 14px; align-items: start; }
.msr-map { min-width: 0; }
.msr-legend { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 10px; padding: 11px 12px; }
.msr-legend-title { font-size: 12px; color: #b39bff; font-weight: 700; margin-bottom: 7px; }
.msr-cells { display: flex; flex-wrap: wrap; gap: 5px; max-height: 200px; overflow-y: auto; }
.msr-cell { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: #cfc4ea; background: #ffffff06; border-radius: 5px; padding: 2px 6px; }
.msr-cell i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.msr-players { display: flex; flex-direction: column; gap: 4px; }
.msr-player { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: #ddd; padding: 4px 7px; background: #ffffff05; border-radius: 6px; border-left: 2px solid transparent; }
.mp-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.mp-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mp-score { font-weight: 800; }
.mp-status { font-size: 11px; color: #8f83b8; }
.mp-status.ok { color: #7ee0a0; }
.mp-status.bad { color: #ff6b6b; }
.msr-block { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 10px; padding: 12px; }
.msr-block-title { font-size: 13px; color: #b39bff; font-weight: 700; margin-bottom: 10px; }
.msr-note { margin-left: 8px; font-size: 11px; color: #7d6fa6; font-weight: 400; }
.msr-tie { font-size: 12.5px; color: #e6c988; background: #e6c98810; border: 1px solid #e6c98833; border-radius: 7px; padding: 7px 10px; margin-bottom: 10px; }
.msr-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12.5px; }
.msr-table-wrap { overflow-x: auto; }
.msr-table th, .msr-table td { border-bottom: 1px solid #ffffff12; border-right: 1px solid #ffffff0c; padding: 6px 8px; text-align: center; color: #cfc4ea; white-space: nowrap; }
.msr-table th { background: #ffffff08; color: #b9c6e6; font-weight: 600; }
.msr-table tr:last-child td { border-bottom: none; }
.msr-table th.col-player, .msr-table td.col-player {
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 120px;
  text-align: left;
  background: #141024;
}
.msr-table th.col-player { z-index: 2; }
.player-cell { display: flex; align-items: center; gap: 6px; }
.msr-score-cell { font-weight: 700; font-variant-numeric: tabular-nums; }
.msr-score-cell.empty { color: #4a3d6e; }
.msr-total { font-weight: 800; font-size: 13px; font-variant-numeric: tabular-nums; }
.msr-result { font-size: 11.5px; color: #8f83b8; }
.msr-result.ok { color: #7ee0a0; font-weight: 700; }
.msr-result.bad { color: #ff6b6b; }
.msr-rounds { display: flex; flex-direction: column; gap: 8px; max-height: 460px; overflow-y: auto; }
.msr-round { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 8px; padding: 8px 10px; }
.msr-round-head { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; font-size: 12.5px; color: #ece7fb; font-weight: 700; margin-bottom: 6px; }
.msr-out { color: #ff8a8a; font-weight: 500; }
.msr-out em { font-style: normal; color: #b39bff; font-size: 11px; }
.msr-throws { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 4px; }
.msr-throw { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #cfc4ea; background: #ffffff04; border-radius: 5px; border-left: 2px solid transparent; padding: 4px 6px; }
.msr-throw.out { color: #ff8a8a; background: #ff444410; }
.msr-throw-fields { color: #7d6fa6; }
.msr-throw-score { margin-left: auto; font-weight: 800; }
.msr-empty { font-size: 12.5px; color: #6b5f92; padding: 12px; text-align: center; }

@media (max-width: 720px) {
  .msr-main { grid-template-columns: 1fr; }
  .msr-map { max-width: min(100%, 56vh); margin: 0 auto; }
  .msr-throws { grid-template-columns: 1fr; }
  .msr-cells { max-height: 92px; overflow-y: auto; }
  .msr-table { font-size: 12px; }
  .msr-table th, .msr-table td { padding: 4px 6px; }
}
</style>
