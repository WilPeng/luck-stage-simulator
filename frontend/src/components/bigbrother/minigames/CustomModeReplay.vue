<template>
  <div class="cm-replay">
    <div class="cmr-rules">
      <div class="cmr-title">{{ meta.gameName }} · {{ modeLabel }}</div>
      <div class="cmr-desc">{{ meta.description }}</div>
      <div class="cmr-tags">
        <span class="cmr-tag">胜负：{{ winLabel }}</span>
        <span v-if="meta.mode === 'lives-build'" class="cmr-tag">初始生命：{{ meta.initialLives }}</span>
        <span v-if="meta.mode === 'race-score'" class="cmr-tag">目标分：{{ meta.raceTarget }}</span>
        <span v-if="meta.mode === 'race-score'" class="cmr-tag">名次得分：{{ (meta.racePoints || []).join(' / ') }}</span>
        <span v-if="meta.eliminateRule" class="cmr-tag">淘汰规则：{{ meta.eliminateRule === 'first_wrong' ? '首个答错出局' : '最后作答出局' }}</span>
      </div>
    </div>

    <!-- 题目与正确答案 -->
    <div class="cmr-section">
      <div class="cmr-section-title">题目与正确答案</div>
      <div class="cmr-questions">
        <div v-for="(q, i) in meta.questions || []" :key="q.id || i" class="cmr-q">
          <span class="cmr-q-no">Q{{ i + 1 }}</span>
          <span class="cmr-q-text">{{ q.text || '（无题目文字）' }}</span>
          <span v-if="q.qtype === 'match' && q.correctAnswer" class="cmr-q-ans">正确配对：{{ q.correctAnswer }}</span>
          <span v-else-if="q.correctAnswer !== '' && q.correctAnswer != null" class="cmr-q-ans">答案：{{ q.correctAnswer }}</span>
          <span v-else class="cmr-q-ans dim">无标准答案 / 管理员评判</span>
        </div>
        <div v-if="!(meta.questions || []).length" class="cmr-empty">暂无题目</div>
      </div>
    </div>

    <!-- 最终排名 -->
    <div class="cmr-section">
      <div class="cmr-section-title">最终排名</div>
      <table class="cmr-table">
        <thead>
          <tr>
            <th>名次</th>
            <th>选手</th>
            <th v-if="showScore">总分</th>
            <th v-if="showLives">生命</th>
            <th>答对轮次</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in rankedPlayers" :key="p.playerId" :class="{ winner: isWinner(p) }">
            <td>{{ i + 1 }}</td>
            <td class="cmr-name">{{ p.playerName }}</td>
            <td v-if="showScore" class="cmr-score">{{ p.score }}</td>
            <td v-if="showLives">{{ p.lives }}</td>
            <td>{{ p.correctCount }}</td>
            <td :class="p.alive ? 'cmr-ok' : 'cmr-bad'">
              {{ isWinner(p) ? '🏆 获胜' : (p.alive ? '存活' : '出局') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 逐轮过程 -->
    <div class="cmr-section">
      <div class="cmr-section-title">逐轮过程</div>
      <div v-for="(r, ri) in meta.rounds || []" :key="ri" class="cmr-round">
        <div class="cmr-round-head">
          <span class="cmr-round-no">第 {{ (r.qIndex ?? ri) + 1 }} 题{{ r.tiebreak ? '（数字加时）' : '' }}</span>
          <span class="cmr-round-q">{{ r.question?.text || '（无题目）' }}</span>
          <span v-if="r.question?.correctAnswer" class="cmr-round-ans">答案：{{ r.question.correctAnswer }}</span>
        </div>

        <table class="cmr-table compact">
          <thead>
            <tr>
              <th>选手</th>
              <th>作答</th>
              <th>判定</th>
              <th v-if="showRoundPoints">本轮得分</th>
              <th v-if="showLives">生命</th>
              <th v-if="showScore">总分</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in r.players || []" :key="p.playerId" :class="{ eliminated: p.eliminated }">
              <td class="cmr-name">{{ p.playerName }}</td>
              <td class="cmr-answer">{{ fmtAnswer(p.answer) }}</td>
              <td :class="p.correct ? 'cmr-ok' : (p.answer == null ? 'cmr-dim' : 'cmr-bad')">
                {{ p.correct ? '✅ 正确' : (p.answer == null ? '未作答' : '❌ 错误') }}
              </td>
              <td v-if="showRoundPoints" class="cmr-score">{{ p.roundPoints ? '+' + p.roundPoints : '-' }}</td>
              <td v-if="showLives">{{ p.lives }}</td>
              <td v-if="showScore" class="cmr-score">{{ p.score }}</td>
              <td :class="p.eliminated ? 'cmr-bad' : (p.alive ? 'cmr-ok' : 'cmr-dim')">
                {{ p.eliminated ? '出局' : (p.alive ? '存活' : '-') }}
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="roundOutcome(r)" class="cmr-outcome">{{ roundOutcome(r) }}</div>
      </div>
      <div v-if="!(meta.rounds || []).length" class="cmr-empty">暂无逐轮记录</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ meta: any }>()

const MODE_LABEL: Record<string, string> = {
  'elim-last': '淘汰赛',
  'first-pick': '首个作答赛',
  'duel': '1v1 对决',
  'survive-tb': '生存赛 + 数字加时',
  'score-tb': '积分赛 + 数字加时',
  'lives-build': '生命赛',
  'race-score': '抢分赛'
}
const WIN_LABEL: Record<string, string> = {
  first_correct: '首个全对获胜',
  highest_score: '最高分获胜',
  most_correct: '答对最多获胜',
  all_correct: '全部答对获胜',
  target_correct: '达到目标答对数获胜',
  admin_judge: '管理员评判'
}

const modeLabel = computed(() => MODE_LABEL[props.meta?.mode] || props.meta?.mode || '自定义')
const winLabel = computed(() => WIN_LABEL[props.meta?.winCondition] || props.meta?.winCondition || '按配置结算')
const showScore = computed(() => ['score-tb', 'race-score'].includes(props.meta?.mode))
const showLives = computed(() => props.meta?.mode === 'lives-build')
const showRoundPoints = computed(() => props.meta?.mode === 'race-score')

const rankedPlayers = computed(() => {
  const list = [...(props.meta?.players || [])]
  return list.sort((a: any, b: any) => {
    const aw = a.playerId === props.meta?.winnerId ? 1 : 0
    const bw = b.playerId === props.meta?.winnerId ? 1 : 0
    if (aw !== bw) return bw - aw
    if (showLives.value) return (b.lives || 0) - (a.lives || 0)
    if (showScore.value) return (b.score || 0) - (a.score || 0)
    return (b.correctCount || 0) - (a.correctCount || 0)
  })
})

function isWinner(p: any) {
  return !!props.meta?.winnerId && p.playerId === props.meta.winnerId
}
function fmtAnswer(v: any) {
  if (v == null || v === '') return '—'
  if (typeof v === 'object') { try { return JSON.stringify(v) } catch { return String(v) } }
  return String(v)
}
function roundOutcome(r: any): string {
  const res = r?.result || {}
  const nameOf = (id: string) => (r.players || []).find((p: any) => p.playerId === id)?.playerName || id
  if (res.eliminatedIds) return `本轮出局：${res.eliminatedIds.map(nameOf).join('、')}`
  if (res.eliminatedId) return `本轮出局：${nameOf(res.eliminatedId)}`
  if (res.selfEliminated) return `首个作答错误，自己出局：${nameOf(res.eliminatedId)}`
  if (res.loserId) return `失去 1 点生命：${nameOf(res.loserId)}（剩余 ${res.livesLeft ?? '-'}）`
  if (res.winnerId) return `本轮胜者：${nameOf(res.winnerId)}`
  if (res.bothEliminated) return '双方均未作答，两人淘汰'
  if (res.timeout) return '本轮超时'
  if (res.race) return '本轮抢分结算完成'
  return ''
}
</script>

<style scoped>
.cm-replay { display: flex; flex-direction: column; gap: 14px; }
.cmr-rules { background: #b39bff0e; border-left: 3px solid #b39bff; border-radius: 8px; padding: 12px 14px; }
.cmr-title { font-size: 15px; font-weight: 700; color: #ece7fb; margin-bottom: 4px; }
.cmr-desc { font-size: 13px; color: #b9c6e6; line-height: 1.6; }
.cmr-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.cmr-tag { font-size: 12px; color: #c9a6ff; background: #b39bff18; border: 1px solid #b39bff33; border-radius: 6px; padding: 2px 8px; }
.cmr-section { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 10px; padding: 12px; }
.cmr-section-title { font-size: 13px; color: #b39bff; font-weight: 700; margin-bottom: 10px; }
.cmr-questions { display: flex; flex-direction: column; gap: 6px; }
.cmr-q { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; color: #ddd; padding: 6px 8px; background: #ffffff05; border-radius: 6px; }
.cmr-q-no { color: #b39bff; font-weight: 700; }
.cmr-q-text { flex: 1; min-width: 180px; }
.cmr-q-ans { color: #e6c988; font-size: 12px; }
.cmr-q-ans.dim { color: #6b5f92; }
.cmr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.cmr-table th, .cmr-table td { border: 1px solid #ffffff12; padding: 6px 9px; text-align: center; color: #cfc4ea; }
.cmr-table th { background: #ffffff08; color: #b9c6e6; font-weight: 600; }
.cmr-table tr.winner td { background: #e6c98810; }
.cmr-table tr.eliminated td { background: #ff444408; opacity: 0.75; }
.cmr-table.compact th, .cmr-table.compact td { padding: 4px 8px; font-size: 12px; }
.cmr-name { text-align: left; color: #ece7fb; white-space: nowrap; }
.cmr-score { color: #e6c988; font-weight: 700; }
.cmr-answer { color: #e0d7ff; max-width: 180px; word-break: break-word; }
.cmr-ok { color: #7ee0a0; }
.cmr-bad { color: #ff6b6b; }
.cmr-dim { color: #6b5f92; }
.cmr-round { margin-bottom: 14px; }
.cmr-round:last-child { margin-bottom: 0; }
.cmr-round-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; }
.cmr-round-no { color: #b39bff; font-weight: 700; }
.cmr-round-q { color: #ece7fb; flex: 1; min-width: 180px; }
.cmr-round-ans { color: #e6c988; font-size: 12px; }
.cmr-outcome { margin-top: 6px; font-size: 12px; color: #c9a6ff; }
.cmr-empty { color: #6b5f92; font-size: 13px; padding: 16px; text-align: center; }
</style>
