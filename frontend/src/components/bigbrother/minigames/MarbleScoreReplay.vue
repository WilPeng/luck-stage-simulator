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
          <div v-for="p in meta.players || []" :key="p.playerId" class="msr-player">
            <span class="mp-dot" :style="{ background: p.color }"></span>
            <span class="mp-name">{{ p.playerName }}</span>
            <span class="mp-score">{{ p.score }}</span>
            <span class="mp-status" :class="statusClass(p.status)">{{ p.status }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isSingle" class="msr-block">
      <div class="msr-block-title">出场顺序与得分</div>
      <div v-if="tieText" class="msr-tie">{{ tieText }}</div>
      <table class="msr-table">
        <thead><tr><th>顺序</th><th>选手</th><th>方向</th><th>力度</th><th>落点</th><th>得分</th><th>结果</th></tr></thead>
        <tbody>
          <tr v-for="row in singleRows" :key="row.playerId">
            <td>{{ row.index }}</td>
            <td class="mc-name">{{ row.playerName }}</td>
            <td>{{ row.throw ? row.throw.angle + '°' : '—' }}</td>
            <td>{{ row.throw ? row.throw.power + '%' : '—' }}</td>
            <td>{{ row.throw ? `${row.throw.x}, ${row.throw.y}` : '—' }}</td>
            <td class="mc ok">{{ row.throw ? row.throw.score : '—' }}</td>
            <td :class="meta.winners?.includes(row.playerId) ? 'mc ok' : ''">
              {{ meta.winners?.includes(row.playerId) ? '🏆 获胜' : '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="msr-block">
      <div class="msr-block-title">每轮结算</div>
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
            <div v-for="t in h.throws || []" :key="t.playerId" class="msr-throw" :class="{ out: h.eliminated?.includes(t.playerId) }">
              <span class="mp-dot" :style="{ background: t.color }"></span>
              <span class="mp-name">{{ t.playerName }}</span>
              <span class="msr-throw-fields">{{ t.angle }}° / {{ t.power }}%</span>
              <span class="msr-throw-score">{{ t.score }} 分</span>
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

const singleRows = computed(() => {
  const throws: any[] = allThrows.value || []
  const byPlayer: Record<string, any> = {}
  for (const t of throws) byPlayer[t.playerId] = t
  return (props.meta?.order || []).map((o: any) => ({
    index: o.index,
    playerId: o.playerId,
    playerName: o.playerName,
    throw: byPlayer[o.playerId] || null
  }))
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
.msr-cells { display: flex; flex-wrap: wrap; gap: 5px; }
.msr-cell { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: #cfc4ea; background: #ffffff06; border-radius: 5px; padding: 2px 6px; }
.msr-cell i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.msr-players { display: flex; flex-direction: column; gap: 4px; }
.msr-player { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: #ddd; padding: 4px 6px; background: #ffffff05; border-radius: 6px; }
.mp-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.mp-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mp-score { color: #e6c988; font-weight: 700; }
.mp-status { font-size: 11px; color: #8f83b8; }
.mp-status.ok { color: #7ee0a0; }
.mp-status.bad { color: #ff6b6b; }
.msr-block { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 10px; padding: 12px; }
.msr-block-title { font-size: 13px; color: #b39bff; font-weight: 700; margin-bottom: 10px; }
.msr-tie { font-size: 12.5px; color: #e6c988; background: #e6c98810; border: 1px solid #e6c98833; border-radius: 7px; padding: 7px 10px; margin-bottom: 10px; }
.msr-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.msr-table th, .msr-table td { border: 1px solid #ffffff12; padding: 5px 8px; text-align: center; color: #cfc4ea; white-space: nowrap; }
.msr-table th { background: #ffffff08; color: #b9c6e6; font-weight: 600; }
.msr-table td.mc-name { text-align: left; }
.msr-table td.mc.ok { color: #7ee0a0; }
.msr-rounds { display: flex; flex-direction: column; gap: 8px; max-height: 460px; overflow-y: auto; }
.msr-round { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 8px; padding: 8px 10px; }
.msr-round-head { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; font-size: 12.5px; color: #ece7fb; font-weight: 700; margin-bottom: 6px; }
.msr-out { color: #ff8a8a; font-weight: 500; }
.msr-out em { font-style: normal; color: #b39bff; font-size: 11px; }
.msr-throws { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 4px; }
.msr-throw { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #cfc4ea; background: #ffffff04; border-radius: 5px; padding: 3px 6px; }
.msr-throw.out { color: #ff8a8a; background: #ff444410; }
.msr-throw-fields { color: #7d6fa6; }
.msr-throw-score { margin-left: auto; color: #e6c988; font-weight: 700; }
.msr-empty { font-size: 12.5px; color: #6b5f92; padding: 12px; text-align: center; }

@media (max-width: 720px) {
  .msr-main { grid-template-columns: 1fr; }
  .msr-throws { grid-template-columns: 1fr; }
}
</style>
