<template>
  <div class="sg-replay">
    <div v-if="meta.type === 'spot-difference'" class="arena">
      <div class="sgr-section-title">比赛现场 · 颜色矩阵</div>
      <template v-if="meta.gridA?.length && meta.gridB?.length">
        <div class="arena-tabs"><button v-for="p in meta.submissions || []" :key="p.playerId" :class="{ selected: spotPlayer?.playerId === p.playerId }" @click="spotId = p.playerId; spotStep = 0">{{ p.playerName }}</button></div>
        <div v-if="spotPlayer?.entries?.length" class="arena-tabs"><button v-for="(entry, i) in spotPlayer.entries" :key="i" :class="{ selected: spotStep === i }" @click="spotStep = i">第 {{ i + 1 }} 次 · {{ entry.correct ? '正确' : '错误' }}</button></div>
        <p class="arena-note">白框：选手标记　金框：正确位置（赛后揭晓）</p>
        <label class="arena-note"><input v-model="spotReveal" type="checkbox"> 显示正确位置</label>
        <div class="spot-boards"><div v-for="(board, b) in [meta.gridA, meta.gridB]" :key="b"><div class="arena-note">{{ b === 0 ? '原图' : '选手提交' }}</div><div class="spot-grid"><div v-for="(color, i) in board" :key="i" :style="{ background: palette[color] || color }" :class="{ mark: b === 1 && spotPlayer?.entries?.[spotStep]?.marks?.includes(i), answer: spotReveal && meta.diffs?.includes(i) }"></div></div></div></div>
        <p v-if="!spotPlayer?.entries?.length" class="arena-note">该选手没有提交记录。</p>
      </template>
      <p v-else class="arena-note">这场历史比赛没有保存矩阵，无法还原题面。下方仍可查看已有提交记录。</p>
    </div>
    <div v-if="meta.type === 'dice-duel' && dicePlayers.length" class="arena">
      <div class="sgr-section-title">比赛现场 · 第 {{ diceRound + 1 }} 轮</div>
      <div class="arena-tabs"><button v-for="n in diceRounds" :key="n" :class="{ selected: diceRound === n - 1 }" @click="diceRound = n - 1">第 {{ n }} 轮</button></div>
      <div class="dice-players"><div v-for="p in dicePlayers" :key="p.playerId" class="dice-player"><b>{{ p.playerName }}</b><div class="dice-faces"><span v-for="(die, i) in p.rounds?.[diceRound]?.results || []" :key="i">{{ die }}</span><small v-if="!p.rounds?.[diceRound]">未记录</small></div><div>本轮 {{ p.rounds?.[diceRound]?.total ?? '—' }} 分</div></div></div>
    </div>
    <div v-if="meta.type === 'sequence-memory' && meta.rounds?.length" class="arena">
      <div class="sgr-section-title">比赛现场 · 第 {{ sequenceRound + 1 }} 轮</div>
      <div class="arena-tabs"><button v-for="(_, i) in meta.rounds" :key="i" :class="{ selected: sequenceRound === i }" @click="sequenceRound = i">第 {{ i + 1 }} 轮</button></div>
      <template v-if="meta.rounds[sequenceRound]">
        <p class="arena-note">问题：第 {{ meta.rounds[sequenceRound].questionIndex }} 个图案是什么？</p>
        <div v-if="meta.rounds[sequenceRound].sequence?.length" class="sequence-cards"><span v-for="(item, i) in meta.rounds[sequenceRound].sequence" :key="i">{{ item }}</span></div>
        <p v-else class="arena-note">本轮完整序列未记录。</p>
        <p class="arena-note">选项：{{ (meta.rounds[sequenceRound].options || []).join('　') }}　·　赛后答案：{{ meta.rounds[sequenceRound].correctEmoji ?? '未记录' }}</p>
        <div class="dice-players"><div v-for="(answer, pid) in meta.rounds[sequenceRound].answers || {}" :key="pid" class="dice-player"><b>{{ playerName(String(pid)) }}</b><div>选择：{{ answer.choice || '未作答' }}</div><div>{{ answer.choice === meta.rounds[sequenceRound].correctEmoji ? '正确' : '未答对' }}</div></div></div>
      </template>
    </div>
    <div class="sgr-rules">
      <div class="sgr-title">{{ meta.title || meta.type }}</div>
      <div v-if="meta.description" class="sgr-desc">{{ meta.description }}</div>
      <div v-if="summaryList.length" class="sgr-tags">
        <span v-for="s in summaryList" :key="s.label" class="sgr-tag">{{ s.label }}：{{ s.value }}</span>
      </div>
    </div>

    <details class="final-details"><summary>最终排名与明细</summary>
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

    </details>
    <!-- 华容道：以选手视角对照起始和结束盘面 -->
    <div v-if="meta.boards && meta.boards.length" class="sgr-section arena">
      <div class="sgr-section-title">选手视角 · 盘面回顾</div>
      <p class="arena-note">选择选手，对照所有人共同的起始盘面与该选手结束时的盘面。{{ selectedBoard?.path?.length ? '拖动步数查看每次移动后的棋盘。' : '本局仅保存了起始和结束盘面。' }}</p>
      <div class="arena-tabs" aria-label="选择选手">
        <button v-for="b in meta.boards" :key="b.playerId" type="button" :class="{ selected: selectedBoard?.playerId === b.playerId }" @click="selectedPlayer = b.playerId; moveStep = 0">{{ b.playerName }}</button>
      </div>
      <div class="sgr-boards">
        <div class="sgr-board-card">
          <div class="sgr-board-title">初始棋盘</div>
          <div class="sgr-board">
            <div v-for="(v, i) in (meta.initialBoard || [])" :key="i" class="sgr-cell" :class="{ blank: v === 0 }">{{ v === 0 ? '' : v }}</div>
          </div>
        </div>
        <div v-if="selectedBoard" class="sgr-board-card">
          <div class="sgr-board-title">
            {{ selectedBoard.playerName }} · {{ selectedBoard.path?.length ? '第 '+moveStep+' 步' : '结束盘面' }}
            <span class="sgr-board-meta">{{ selectedBoard.solved ? '✅ 已完成' : '未完成' }} · {{ selectedBoard.moves }} 步</span>
          </div>
          <input v-if="selectedBoard.path?.length" v-model.number="moveStep" type="range" aria-label="查看移动步数" min="0" :max="selectedBoard.path.length">
          <div class="sgr-board">
            <div v-for="(v, i) in moveBoard" :key="i" class="sgr-cell" :class="{ blank: v === 0, correct: v !== 0 && v === i + 1 }">{{ v === 0 ? '' : v }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const palette: Record<string,string> = {red:'#e74c3c',orange:'#e67e22',yellow:'#f1c40f',green:'#7ee0b0',blue:'#3498db',purple:'#9b59b6',black:'#1a1a1a',white:'#f5f5f5',gray:'#95a5a6',pink:'#ff7eb3'}
const props = defineProps<{ meta: any }>()
const selectedPlayer = ref('')
const spotId = ref('')
const spotStep = ref(0)
const spotReveal = ref(false)
const diceRound = ref(0)
const sequenceRound = ref(0)
const spotPlayer = computed(() => props.meta?.submissions?.find((p: any) => p.playerId === spotId.value) || props.meta?.submissions?.[0])
const dicePlayers = computed<any[]>(() => {
  if (props.meta.roundsByPlayer) return props.meta.roundsByPlayer
  if (props.meta.type !== 'dice-duel') return []
  return (props.meta.tables?.[0]?.rows || []).map((row: any[], i:number) => ({
    playerId: i,
    playerName: row[0],
    rounds: row.slice(1,-1).map(cell => {
      const match = /^(\d+(?:\+\d+)*) = (\d+)$/.exec(String(cell))
      return match ? { results: match[1]!.split('+').map(Number), total: Number(match[2]) } : null
    })
  }))
})
const diceRounds = computed(() => Math.max(1, ...dicePlayers.value.map(p => p.rounds.length)))
function playerName(id: string) { return props.meta?.players?.find((p: any) => p.playerId === id)?.playerName || id }
watch(() => props.meta, () => { selectedPlayer.value = '' })
const selectedBoard = computed(() => props.meta?.boards?.find((b: any) => b.playerId === selectedPlayer.value) || props.meta?.boards?.[0])

const summaryList = computed(() => {
  const s = props.meta?.summary
  if (!s) return []
  if (Array.isArray(s)) return s
  return Object.entries(s).map(([label, value]) => ({ label, value }))
})

const moveStep = ref(0)
const moveBoard = computed(() => {
  const b = selectedBoard.value
  if (!b?.path?.length || !props.meta.initialBoard?.length) return b?.board || []
  const board = [...props.meta.initialBoard]
  for (const index of b.path.slice(0, moveStep.value)) {
    const blank = board.indexOf(0)
    board[blank] = board[index]
    board[index] = 0
  }
  return board
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
.arena { background: linear-gradient(145deg, #182849, #11182b); padding: 20px; }
.arena-note { color: #aebedc; font-size: 13px; line-height: 1.6; }
.arena-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
.arena-tabs button { color: #dce8ff; background: #ffffff0b; border: 1px solid #ffffff24; border-radius: 8px; padding: 8px 14px; cursor: pointer; }
.arena-tabs button.selected { background: #365da4; border-color: #8ab5ff; }
.spot-boards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; max-width: 700px; }
.spot-grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 2px; }
.spot-grid div { aspect-ratio: 1; border: 1px solid #ffffff33; }
.spot-grid div.mark { outline: 2px solid white; outline-offset: -3px; }
.spot-grid div.answer { box-shadow: inset 0 0 0 3px #f4ba35; }
.dice-players { display: flex; flex-wrap: wrap; gap: 10px; }
.dice-player { padding: 14px; border-radius: 10px; background: #ffffff0c; color: #e9efff; min-width: 130px; }
.dice-faces, .sequence-cards { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.dice-faces span, .sequence-cards span { display: grid; place-items: center; min-width: 38px; height: 38px; border-radius: 6px; background: #f5f1e7; color: #202744; font-size: 22px; font-weight: bold; }
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
