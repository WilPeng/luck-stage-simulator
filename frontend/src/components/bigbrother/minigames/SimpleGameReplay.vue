<template>
  <div class="sg-replay">
    <div class="sgr-rules">
      <div class="sgr-title">{{ meta.title || meta.type }}</div>
      <div v-if="meta.description" class="sgr-desc">{{ meta.description }}</div>
      <div v-if="summaryList.length" class="sgr-tags">
        <span v-for="s in summaryList" :key="s.label" class="sgr-tag">{{ s.label }}：{{ s.value }}</span>
      </div>
    </div>

    <!-- 最终排名 -->
    <div class="sgr-section">
      <div class="sgr-section-title">最终排名</div>
      <div class="sgr-players">
        <div v-for="(p, i) in (meta.players || [])" :key="p.playerId || i" class="sgr-card">
          <div class="sgr-card-head">
            <span class="sgr-rank">{{ i + 1 }}</span>
            <span class="sgr-name">{{ p.playerName }}</span>
            <span v-if="p.score != null" class="sgr-score">{{ p.score }}</span>
            <span class="sgr-status" :class="statusClass(p.status)">{{ p.status }}</span>
          </div>
          <div v-if="p.details && p.details.length" class="sgr-details">
            <span v-for="d in p.details" :key="d.label" class="sgr-detail">
              <b>{{ d.label }}</b>{{ d.value }}
            </span>
          </div>
        </div>
        <div v-if="!(meta.players || []).length" class="sgr-empty">暂无选手数据</div>
      </div>
    </div>

    <!-- 额外过程表 -->
    <div v-for="(t, ti) in (meta.tables || [])" :key="ti" class="sgr-section">
      <div class="sgr-section-title">{{ t.title }}</div>
      <div class="sgr-table-wrap">
        <table class="sgr-table">
          <thead>
            <tr><th v-for="(c, ci) in t.columns || []" :key="ci">{{ c }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in t.rows || []" :key="ri">
              <td v-for="(cell, ci) in row" :key="ci" :class="cellClass(cell)">{{ cell }}</td>
            </tr>
            <tr v-if="!(t.rows || []).length"><td :colspan="(t.columns || []).length || 1" class="sgr-empty">暂无记录</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 棋盘类（华容道）：初始棋盘 + 每位选手最终棋盘 -->
    <div v-if="meta.boards && meta.boards.length" class="sgr-section">
      <div class="sgr-section-title">棋盘过程</div>
      <div class="sgr-boards">
        <div class="sgr-board-card">
          <div class="sgr-board-title">初始棋盘</div>
          <div class="sgr-board">
            <div v-for="(v, i) in (meta.initialBoard || [])" :key="i" class="sgr-cell" :class="{ blank: v === 0 }">{{ v === 0 ? '' : v }}</div>
          </div>
        </div>
        <div v-for="b in meta.boards" :key="b.playerId" class="sgr-board-card">
          <div class="sgr-board-title">
            {{ b.playerName }}
            <span class="sgr-board-meta">{{ b.solved ? '✅ 已完成' : '未完成' }} · {{ b.moves }} 步</span>
          </div>
          <div class="sgr-board" :class="{ solved: b.solved }">
            <div v-for="(v, i) in b.board || []" :key="i" class="sgr-cell" :class="{ blank: v === 0, correct: v !== 0 && v === i + 1 }">{{ v === 0 ? '' : v }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ meta: any }>()

const summaryList = computed(() => {
  const s = props.meta?.summary
  if (!s) return []
  if (Array.isArray(s)) return s
  return Object.entries(s).map(([label, value]) => ({ label, value }))
})

function statusClass(s: string) {
  if (!s) return ''
  if (/完成|存活|获胜/.test(s)) return 'ok'
  if (/未完成|出局|淘汰/.test(s)) return 'bad'
  return ''
}
function cellClass(cell: any) {
  if (typeof cell !== 'string') return ''
  if (cell.includes('✅') || cell === '正确') return 'cell-ok'
  if (cell.includes('❌') || cell === '错误') return 'cell-bad'
  return ''
}
</script>

<style scoped>
.sg-replay { display: flex; flex-direction: column; gap: 14px; }
.sgr-rules { background: #b39bff0e; border-left: 3px solid #b39bff; border-radius: 8px; padding: 12px 14px; }
.sgr-title { font-size: 15px; font-weight: 700; color: #ece7fb; }
.sgr-desc { font-size: 13px; color: #b9c6e6; line-height: 1.6; margin-top: 4px; }
.sgr-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.sgr-tag { font-size: 12px; color: #c9a6ff; background: #b39bff18; border: 1px solid #b39bff33; border-radius: 6px; padding: 2px 8px; }
.sgr-section { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 10px; padding: 12px; }
.sgr-section-title { font-size: 13px; color: #b39bff; font-weight: 700; margin-bottom: 10px; }
.sgr-players { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.sgr-card { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 8px; padding: 9px 11px; }
.sgr-card-head { display: flex; align-items: center; gap: 8px; }
.sgr-rank { width: 16px; font-size: 12px; color: #7d6fa6; }
.sgr-name { flex: 1; font-size: 14px; color: #ece7fb; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sgr-score { font-size: 15px; font-weight: 800; color: #e6c988; }
.sgr-status { font-size: 11px; color: #8f83b8; }
.sgr-status.ok { color: #7ee0a0; }
.sgr-status.bad { color: #ff6b6b; }
.sgr-details { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; font-size: 12px; color: #cfc4ea; }
.sgr-detail b { color: #b3a6d6; font-weight: 500; margin-right: 4px; }
.sgr-table-wrap { max-height: 360px; overflow: auto; }
.sgr-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.sgr-table th, .sgr-table td { border: 1px solid #ffffff12; padding: 5px 8px; text-align: center; color: #cfc4ea; white-space: nowrap; }
.sgr-table th { background: #ffffff08; color: #b9c6e6; font-weight: 600; }
.sgr-table td.cell-ok { color: #7ee0a0; }
.sgr-table td.cell-bad { color: #ff6b6b; }
.sgr-empty { color: #6b5f92; font-size: 13px; padding: 14px; text-align: center; }
.sgr-boards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.sgr-board-card { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 8px; padding: 8px; }
.sgr-board-title { font-size: 12px; color: #cfc4ea; font-weight: 600; margin-bottom: 6px; }
.sgr-board-meta { font-size: 11px; color: #8f83b8; font-weight: 400; margin-left: 4px; }
.sgr-board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; }
.sgr-board.solved .sgr-cell { border-color: #b39bff; }
.sgr-cell {
  aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  background: #1c1533; border: 1px solid #ffffff14; border-radius: 4px;
  font-size: 11px; color: #e0d7ff; font-weight: 600;
}
.sgr-cell.blank { background: #0f0a1c; border-style: dashed; }
.sgr-cell.correct { color: #c9a6ff; border-color: #b39bff44; }
@media (max-width: 640px) {
  .sgr-players { grid-template-columns: 1fr; }
}
</style>
