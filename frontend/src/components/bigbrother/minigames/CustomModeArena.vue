<template>
  <div class="mode-arena">
    <div class="arena-header">
      <span class="mode-name">{{ modeName }}</span>
      <span v-if="state.tiebreak" class="tb-tag">数字加时题</span>
      <span v-else-if="state.totalQuestions" class="q-progress">第 {{ questionNo }} / {{ state.totalQuestions }} 题</span>
      <span v-if="mode === 'race-score'" class="tb-tag">目标 {{ state.raceTarget }} 分</span>
      <span v-if="mode === 'lives-build' && state.my" class="tb-tag">我的生命 {{ state.my.lives }} ❤️</span>
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
        <span v-if="mode === 'score-tb' || mode === 'race-score'" class="p-score">{{ p.score }}分</span>
        <span v-if="mode === 'lives-build'" class="p-lives">{{ '❤️'.repeat(Math.max(0, p.lives || 0)) || '💀' }}</span>
        <span v-if="p.roundPoints > 0" class="p-gain">+{{ p.roundPoints }}</span>
        <span v-if="p.answered && mode !== 'lives-build'" class="p-dot" title="已作答">已答</span>
        <span v-if="!p.alive" class="p-out">出局</span>
      </div>
    </div>

    <div v-if="mode === 'duel' && state.current && state.phase !== 'announcing'" class="duel-banner">
      ⚔ {{ nameOf(state.current[0]) }} vs {{ nameOf(state.current[1]) }}
    </div>

    <div v-if="mode === 'duel' && state.phase === 'announcing' && state.current" class="duel-announce">
      <div class="da-label">⚔ 本轮 PK 公示</div>
      <div class="da-versus">
        {{ nameOf(state.current[0]) }}
        <span class="da-vs">VS</span>
        {{ nameOf(state.current[1]) }}
      </div>
      <div class="da-timer">{{ duelAnnounceRemain }} 秒后开始作答</div>
    </div>

    <div v-if="state.roundResult" class="round-result">
      <template v-if="state.roundResult.tiebreak">
        加时题目标：<strong>{{ state.roundResult.target }}</strong>
      </template>
      <template v-else-if="state.roundResult.lives">
        <span v-if="state.roundResult.loserId">
          {{ nameOf(state.roundResult.loserId) }} 失去 1 点生命
          <span v-if="state.roundResult.eliminated">，生命耗尽出局</span>
          <span v-else>（剩余 {{ state.roundResult.livesLeft }} 点）</span>
        </span>
        <span v-else>本轮无人失去生命</span>
      </template>
      <template v-else-if="state.roundResult.race">
        <div>本题结算：</div>
        <div v-if="state.roundResult.order && state.roundResult.order.length" class="race-order">
          <span v-for="r in state.roundResult.order" :key="r.playerId" class="race-order-item">
            {{ r.rank }}. {{ nameOf(r.playerId) }} +{{ r.points }}
          </span>
        </div>
        <div v-else class="race-order-empty">本题无人答对</div>
      </template>
      <template v-else-if="state.roundResult.eliminatedIds && state.roundResult.eliminatedIds.length">
        {{ state.roundResult.eliminatedIds.map(nameOf).join('、') }} 出局
        <span v-if="state.roundResult.bothEliminated">（双方均未作答）</span>
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

    <template v-else-if="mode === 'duel' && state.phase === 'duel-picking'">
      <p class="pick-hint" v-if="state.my && state.my.canPickDuel">你是上一轮胜者，请选择本轮 PK 的 2 名选手：</p>
      <p class="pick-hint" v-else>等待 <strong>{{ nameOf(state.pickerId) }}</strong> 选择本轮 PK 的 2 名选手…</p>
      <div class="pick-countdown">选择剩余 {{ duelPickRemain }} 秒</div>
      <div v-if="state.my && state.my.canPickDuel" class="pick-grid">
        <button
          v-for="p in alivePlayers"
          :key="p.playerId"
          class="pick-btn duel-pick-btn"
          :class="{ selected: duelPickSelected.includes(p.playerId) }"
          @click="toggleDuelPick(p.playerId)"
        >
          {{ p.playerName }}
          <span v-if="duelPickSelected.includes(p.playerId)" class="pick-check">✓</span>
        </button>
      </div>
      <button
        v-if="state.my && state.my.canPickDuel"
        class="submit-btn"
        :disabled="duelPickSelected.length !== 2"
        @click="confirmDuelPick"
      >
        确认选择 ({{ duelPickSelected.length }}/2)
      </button>
    </template>

    <template v-else-if="state.question">
      <div class="q-text" v-html="sanitizeRichText(state.question.text)"></div>
      <MediaPlayer v-if="state.question.media" :media="state.question.media" />
      <div v-if="state.question.points > 1" class="points-hint">本题 {{ state.question.points }} 分</div>
      <div v-if="actionMsg" class="action-msg" :class="actionMsg.type">{{ actionMsg.text }}</div>

      <template v-if="canInput">
        <!-- 模式6：记忆回溯，用 +1 / +5 等按钮凑出目标数字 -->
        <div v-if="mode === 'lives-build'" class="build-area">
          <div class="build-value">{{ buildValue }}</div>
          <div class="build-buttons">
            <button class="build-btn" @click="addBuild(1)">+1</button>
            <button class="build-btn" @click="addBuild(5)">+5</button>
            <button class="build-btn" @click="addBuild(10)">+10</button>
            <button class="build-btn" @click="addBuild(50)">+50</button>
          </div>
          <div class="build-actions">
            <button class="build-clear" @click="buildValue = 0">清零</button>
            <button class="submit-btn" :disabled="buildValue <= 0" @click="submitBuild">提交数字</button>
          </div>
          <p class="build-hint">提交错误会清零，可立即重试；每轮最后未答对的选手失去 1 点生命。</p>
        </div>
        <template v-else>
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
          <template v-else-if="state.question.qtype === 'match'">
            <MatchAnswer
              v-model="matchAnswer"
              :leftItems="state.question.leftItems || []"
              :rightItems="state.question.rightItems || []"
            />
            <button class="submit-btn" :disabled="!matchComplete" @click="submitMatch">提交连线答案</button>
          </template>
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
import MatchAnswer from './MatchAnswer.vue'
import MediaPlayer from './MediaPlayer.vue'
import { sanitizeRichText } from '../../../utils/richText'

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
  'score-tb': '限时积分 + 数字TB',
  'lives-build': '记忆回溯（生命值）',
  'race-score': '众里寻他千百度'
} as Record<string, string>)[mode.value] || '对战')

const myAnswer = computed(() => props.state.my?.myAnswer ?? null)
const questionNo = computed(() => Math.max(0, Number(props.state.qIndex) || 0) + 1)
const textAnswer = ref('')
const padValue = ref(0)
const matchAnswer = ref('')
const buildValue = ref(0)
const actionMsg = ref<{ type: string; text: string } | null>(null)
let msgTimer: ReturnType<typeof setTimeout> | null = null

function showActionMsg(type: string, text: string) {
  actionMsg.value = { type, text }
  if (msgTimer) clearTimeout(msgTimer)
  msgTimer = setTimeout(() => { actionMsg.value = null }, 2600)
}

watch(() => props.state.question?.id, () => {
  matchAnswer.value = ''
  buildValue.value = 0
})

watch(() => props.state.qIndex, () => {
  buildValue.value = 0
  actionMsg.value = null
})

// 处理答题结果：记忆回溯答错清零；抢分赛显示得分
watch(() => props.state.actionResult, (r: any) => {
  if (!r) return
  if (mode.value === 'lives-build') {
    if (r.error) { showActionMsg('wrong', r.error); return }
    if (r.reset) {
      buildValue.value = 0
      showActionMsg('wrong', '❌ 答错，数字已清零，可立即重试')
    } else if (r.correct) {
      showActionMsg('correct', '✅ 答对！等待其他选手…')
    }
  } else if (mode.value === 'race-score') {
    if (r.error) { showActionMsg('wrong', r.error); return }
    if (r.correct) {
      const rankText = r.rank ? `（第 ${r.rank} 位）` : ''
      showActionMsg('correct', `✅ 答对 +${r.points || 0} 分${rankText}`)
    } else if (r.retry) {
      showActionMsg('wrong', '❌ 答错，可继续尝试')
    }
  }
}, { deep: true })

watch(() => props.state.my?.myAnswer, (v) => {
  if (v == null) return
  if (typeof v === 'number' || /^\d+$/.test(String(v))) padValue.value = Number(v) || 0
  textAnswer.value = String(v)
  if (props.state.question?.qtype === 'match') matchAnswer.value = String(v)
})

const matchComplete = computed(() => {
  const total = (props.state.question?.leftItems || []).length
  if (!total) return false
  try {
    const mapping = JSON.parse(matchAnswer.value || '{}')
    for (let i = 0; i < total; i++) {
      if (!(i in mapping)) return false
    }
    return true
  } catch {
    return false
  }
})

const timerActive = computed(() =>
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
const alivePlayers = computed(() =>
  (props.state.players || []).filter((p: any) => p.alive)
)
const duelPickSelected = ref<string[]>([])
const duelAnnounceRemain = computed(() => Math.max(0, Math.ceil(((props.state.nextAt || 0) - now.value) / 1000)))
const duelPickRemain = computed(() => Math.max(0, Math.ceil(((props.state.pickDeadline || 0) - now.value) / 1000)))

watch(() => props.state.phase, (phase) => {
  if (phase !== 'duel-picking') duelPickSelected.value = []
})
watch(() => props.state.pickerId, () => { duelPickSelected.value = [] })

function toggleDuelPick(playerId: string) {
  const current = duelPickSelected.value
  if (current.includes(playerId)) {
    duelPickSelected.value = current.filter(id => id !== playerId)
    return
  }
  if (current.length >= 2) return
  duelPickSelected.value = [...current, playerId]
}

function confirmDuelPick() {
  if (duelPickSelected.value.length !== 2) return
  emit('action', { type: 'pick_pair', playerIds: [...duelPickSelected.value] })
}

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
function addBuild(n: number) {
  buildValue.value += n
}
function submitBuild() {
  if (buildValue.value <= 0) return
  emit('action', { type: 'answer', answer: buildValue.value })
}
function submitText() {
  if (!textAnswer.value) return
  emit('action', { type: 'answer', answer: textAnswer.value })
}
function submitMatch() {
  if (!matchComplete.value) return
  emit('action', { type: 'answer', answer: matchAnswer.value })
}
</script>

<style scoped>
.mode-arena { display: flex; flex-direction: column; gap: 12px; }
.arena-header { display: flex; align-items: center; gap: 12px; font-size: 14px; color: #a99bd0; }
.mode-name { color: #b39bff; font-weight: 600; }
.q-progress { color: #b3a6d6; }
.tb-tag { background: #e6c98822; color: #e6c988; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
.arena-timer { margin-left: auto; font-weight: 700; color: #b39bff; }
.arena-timer.urgent { color: #ff4444; }
.players-strip { display: flex; flex-wrap: wrap; gap: 8px; }
.p-chip { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; border: 1px solid #ffffff18; background: #1b1130; font-size: 13px; color: #ddd; }
.p-chip.me { border-color: #b39bff66; }
.p-chip.turn { border-color: #00c8ff; box-shadow: 0 0 0 1px #00c8ff55; }
.p-chip.out { opacity: 0.45; text-decoration: line-through; }
.p-score { color: #e6c988; font-size: 12px; }
.p-lives { font-size: 12px; letter-spacing: -1px; }
.p-gain { color: #7ee0a0; font-size: 12px; font-weight: 700; }
.p-dot { color: #b39bff; font-size: 11px; }
.p-out { color: #ff4444; font-size: 11px; }
.race-order { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 6px; }
.race-order-item { background: #ffffff0a; border: 1px solid #e6c98833; border-radius: 999px; padding: 2px 10px; font-size: 12px; color: #f0e2b6; }
.race-order-empty { color: #b3a6d6; font-size: 12px; }
.build-area { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 8px 0; }
.build-value { font-size: 54px; font-weight: 800; color: #b39bff; line-height: 1; text-shadow: 0 0 24px #b39bff55; }
.build-buttons { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.build-btn { min-width: 74px; padding: 14px 18px; font-size: 20px; font-weight: 700; color: #e2d9ff; background: linear-gradient(160deg, #2e1e52, #1a1233); border: 2px solid #ffffff1c; border-radius: 12px; cursor: pointer; }
.build-btn:hover { border-color: #b39bff; color: #b39bff; }
.build-actions { display: flex; gap: 12px; width: 100%; justify-content: center; }
.build-clear { padding: 12px 20px; border: 1px solid #ffffff22; border-radius: 8px; background: #ffffff08; color: #b3a6d6; font-size: 15px; cursor: pointer; }
.build-hint { font-size: 12px; color: #8f83b8; text-align: center; margin: 0; }
.action-msg { text-align: center; font-size: 14px; padding: 8px; border-radius: 8px; }
.action-msg.correct { color: #7ee0a0; background: #7ee0a014; border: 1px solid #7ee0a033; }
.action-msg.wrong { color: #ff8f8f; background: #ff444414; border: 1px solid #ff444433; }
.duel-banner { text-align: center; font-size: 16px; color: #00c8ff; background: #00c8ff14; border: 1px solid #00c8ff33; border-radius: 8px; padding: 8px; }
.duel-announce { text-align: center; padding: 18px; border: 1px solid #00c8ff55; background: #00c8ff12; border-radius: 12px; }
.da-label { font-size: 13px; color: #7fd8ff; letter-spacing: 1px; }
.da-versus { margin: 10px 0; font-size: 24px; font-weight: 800; color: #ece7fb; }
.da-vs { color: #00c8ff; font-size: 15px; margin: 0 10px; }
.da-timer { font-size: 14px; color: #e6c988; }
.round-result { text-align: center; font-size: 14px; color: #e6c988; background: #e6c98814; border: 1px solid #e6c98833; border-radius: 8px; padding: 8px; }
.round-result strong { color: #b39bff; }
.arena-finished { text-align: center; font-size: 22px; font-weight: 700; color: #b39bff; padding: 24px 0; }
.pick-hint { color: #ece7fb; font-size: 15px; }
.pick-countdown { text-align: center; color: #e6c988; font-size: 13px; }
.pick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pick-btn { padding: 14px; border: 2px solid #ff444455; border-radius: 8px; background: #ff444411; color: #ff8888; font-size: 15px; cursor: pointer; }
.pick-btn:hover { background: #ff444433; }
.duel-pick-btn { display: flex; align-items: center; justify-content: center; gap: 6px; border-color: #b39bff55; background: #b39bff11; color: #e0d7ff; }
.duel-pick-btn:hover { background: #b39bff22; }
.duel-pick-btn.selected { border-color: #b39bff; background: #b39bff33; color: #fff; }
.pick-check { color: #7ee0a0; font-weight: 700; }
.q-text { font-size: 20px; color: #ece7fb; line-height: 1.5; }
.points-hint { font-size: 12px; color: #e6c988; }
.options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.option-btn { padding: 14px 16px; border: 2px solid #b39bff33; border-radius: 8px; background: #17112a44; color: #ece7fb; font-size: 15px; cursor: pointer; text-align: left; }
.option-btn:hover { border-color: #b39bff66; }
.option-btn.selected { border-color: #b39bff; background: #b39bff22; }
.answer-input { display: flex; gap: 8px; }
.bb-input { flex: 1; padding: 12px 16px; background: #17112a; border: 1px solid #b39bff33; border-radius: 8px; color: #ece7fb; font-size: 16px; outline: none; box-sizing: border-box; }
.bb-input:focus { border-color: #b39bff; }
.submit-btn { padding: 12px 20px; border: 1px solid #b39bff66; border-radius: 8px; background: #b39bff22; color: #b39bff; font-size: 15px; font-weight: 600; cursor: pointer; }
.submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.waiting-msg { text-align: center; color: #b3a6d6; font-size: 14px; padding: 16px 0; }
@media (max-width: 480px) {
  .pick-grid { grid-template-columns: 1fr; }
  .options-grid { grid-template-columns: 1fr; }
}
</style>
