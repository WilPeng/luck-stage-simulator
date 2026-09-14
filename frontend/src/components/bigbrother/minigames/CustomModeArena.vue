<template>
  <div class="mode-arena">
    <div class="arena-header">
      <span class="mode-name">{{ modeName }}</span>
      <span v-if="state.tiebreak" class="tb-tag">数字加时题</span>
      <span v-else-if="state.totalQuestions" class="q-progress">第 {{ (state.qIndex || 0) + 1 }} / {{ state.totalQuestions }} 题</span>
      <span v-if="timerActive" class="arena-timer" :class="{ urgent: remain <= 5 }">⏱ {{ remain }}s</span>
    </div>

    <div class="players-strip">
      <div
        v-for="p in state.players"
        :key="p.playerId"
        class="p-chip"
        :class="{ out: !p.alive, me: p.playerId === myId, turn: state.current && state.current.includes(p.playerId) }"
      >
        <span class="p-name">{{ p.playerName }}</span>
        <span v-if="mode === 'score-tb'" class="p-score">{{ p.score }}分</span>
        <span v-if="p.answered" class="p-dot">✓</span>
        <span v-if="!p.alive" class="p-out">出局</span>
      </div>
    </div>

    <div v-if="mode === 'duel' && state.current" class="duel-banner">
      ⚔ {{ nameOf(state.current[0]) }} vs {{ nameOf(state.current[1]) }}
    </div>

    <div v-if="state.roundResult" class="round-result">
      <template v-if="state.roundResult.tiebreak">
        加时题目标：<strong>{{ state.roundResult.target }}</strong>
      </template>
      <template v-else-if="state.roundResult.eliminatedId">
        {{ nameOf(state.roundResult.eliminatedId) }} 出局
      </template>
      <template v-else-if="state.roundResult.locked">
        <span v-if="state.roundResult.anyCorrect">本轮错误/未作答者出局</span>
        <span v-else>全员错误，本轮无人出局</span>
      </template>
      <template v-else-if="state.roundResult.winnerId">
        {{ nameOf(state.roundResult.winnerId) }} 胜出本回合
      </template>
    </div>

    <div v-if="state.finished" class="arena-finished">
      🏆 {{ nameOf(state.winner) }} 获胜！
    </div>

    <template v-else-if="state.phase === 'picking' && state.my && state.my.canPick">
      <p class="pick-hint">你答对了！请选择要淘汰的选手：</p>
      <div class="pick-grid">
        <button
          v-for="p in aliveOthers"
          :key="p.playerId"
          class="pick-btn"
          @click="$emit('action', { type: 'pick', targetId: p.playerId })"
        >{{ p.playerName }}</button>
      </div>
    </template>

    <template v-else-if="state.question">
      <div class="q-text">{{ state.question.text }}</div>
      <div v-if="state.question.points > 1" class="points-hint">本题 {{ state.question.points }} 分</div>

      <template v-if="canInput">
        <div v-if="state.question.qtype === 'choice' || state.question.qtype === 'judge'" class="options-grid">
          <button
            v-for="opt in state.question.options"
            :key="opt"
            class="option-btn"
            :class="{ selected: myAnswer === opt }"
            @click="chooseOption(opt)"
          >{{ opt }}</button>
        </div>
        <NumberPad
          v-else-if="state.question.qtype === 'number'"
          v-model="padValue"
          @submit="submitNumber"
        />
        <div v-else class="answer-input">
          <input
            v-model="textAnswer"
            class="bb-input"
            placeholder="输入答案"
            @keyup.enter="submitText"
          />
          <button class="submit-btn" :disabled="!textAnswer" @click="submitText">提交</button>
        </div>
      </template>
      <div v-else-if="state.my && !state.my.alive" class="waiting-msg">你已出局，观战中...</div>
      <div v-else-if="state.my && state.my.answered" class="waiting-msg">已作答，等待其他选手...</div>
      <div v-else-if="mode === 'duel'" class="waiting-msg">等待本轮对决开始...</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import NumberPad from './NumberPad.vue'

const props = defineProps<{ state: any; myId: string }>()
const emit = defineEmits<{ (e: 'action', a: any): void }>()

const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 200) })
onUnmounted(() => { if (clock) clearInterval(clock) })

const mode = computed(() => props.state.mode)
const modeName = computed(() => ({
  'elim-last': '最后作答出局',
  'first-pick': '首个作答定胜负',
  'duel': '1v1 对决',
  'survive-tb': '限时淘汰 + 数字TB',
  'score-tb': '限时积分 + 数字TB'
} as Record<string, string>)[mode.value] || '对战')

const myAnswer = computed(() => props.state.my?.myAnswer ?? null)
const textAnswer = ref('')
const padValue = ref(0)

watch(() => props.state.my?.myAnswer, (v) => {
  if (v == null) return
  if (typeof v === 'number' || /^\d+$/.test(String(v))) padValue.value = Number(v) || 0
  textAnswer.value = String(v)
})

const timerActive = computed(() =>
  (mode.value === 'survive-tb' || mode.value === 'score-tb') &&
  props.state.phase === 'answering' && !!props.state.deadline
)
const remain = computed(() => Math.max(0, Math.ceil((props.state.deadline - now.value) / 1000)))

const canInput = computed(() => {
  if (!props.state.my || !props.state.my.canAnswer) return false
  if (mode.value === 'duel') return !!(props.state.current && props.state.current.includes(props.myId))
  return true
})

const aliveOthers = computed(() =>
  (props.state.players || []).filter((p: any) => p.alive && p.playerId !== props.myId)
)

function nameOf(id: string) {
  const p = (props.state.players || []).find((x: any) => x.playerId === id)
  return p ? p.playerName : '?'
}

function chooseOption(opt: string) {
  emit('action', { type: 'answer', answer: opt })
}
function submitNumber(v: number) {
  emit('action', { type: 'answer', answer: v })
}
function submitText() {
  if (!textAnswer.value) return
  emit('action', { type: 'answer', answer: textAnswer.value })
}
</script>

<style scoped>
.mode-arena { display: flex; flex-direction: column; gap: 12px; }
.arena-header { display: flex; align-items: center; gap: 12px; font-size: 14px; color: #aaa; }
.mode-name { color: #00ff88; font-weight: 600; }
.q-progress { color: #8a8aa5; }
.tb-tag { background: #ffaa0022; color: #ffaa00; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
.arena-timer { margin-left: auto; font-weight: 700; color: #00ff88; }
.arena-timer.urgent { color: #ff4444; }
.players-strip { display: flex; flex-wrap: wrap; gap: 8px; }
.p-chip { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; border: 1px solid #ffffff18; background: #0f0f2c; font-size: 13px; color: #ddd; }
.p-chip.me { border-color: #00ff8866; }
.p-chip.turn { border-color: #00c8ff; box-shadow: 0 0 0 1px #00c8ff55; }
.p-chip.out { opacity: 0.45; text-decoration: line-through; }
.p-score { color: #ffaa00; font-size: 12px; }
.p-dot { color: #00ff88; }
.p-out { color: #ff4444; font-size: 11px; }
.duel-banner { text-align: center; font-size: 16px; color: #00c8ff; background: #00c8ff14; border: 1px solid #00c8ff33; border-radius: 8px; padding: 8px; }
.round-result { text-align: center; font-size: 14px; color: #ffaa00; background: #ffaa0014; border: 1px solid #ffaa0033; border-radius: 8px; padding: 8px; }
.round-result strong { color: #00ff88; }
.arena-finished { text-align: center; font-size: 22px; font-weight: 700; color: #00ff88; padding: 24px 0; }
.pick-hint { color: #e0e0e0; font-size: 15px; }
.pick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pick-btn { padding: 14px; border: 2px solid #ff444455; border-radius: 8px; background: #ff444411; color: #ff8888; font-size: 15px; cursor: pointer; }
.pick-btn:hover { background: #ff444433; }
.q-text { font-size: 20px; color: #e0e0e0; line-height: 1.5; }
.points-hint { font-size: 12px; color: #ffaa00; }
.options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.option-btn { padding: 14px 16px; border: 2px solid #00ff8833; border-radius: 8px; background: #0a1a1044; color: #e0e0e0; font-size: 15px; cursor: pointer; text-align: left; }
.option-btn:hover { border-color: #00ff8866; }
.option-btn.selected { border-color: #00ff88; background: #00ff8822; }
.answer-input { display: flex; gap: 8px; }
.bb-input { flex: 1; padding: 12px 16px; background: #0a1a10; border: 1px solid #00ff8833; border-radius: 8px; color: #e0e0e0; font-size: 16px; outline: none; box-sizing: border-box; }
.bb-input:focus { border-color: #00ff88; }
.submit-btn { padding: 12px 20px; border: 1px solid #00ff8866; border-radius: 8px; background: #00ff8822; color: #00ff88; font-size: 15px; font-weight: 600; cursor: pointer; }
.submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.waiting-msg { text-align: center; color: #8a8aa5; font-size: 14px; padding: 16px 0; }
</style>
