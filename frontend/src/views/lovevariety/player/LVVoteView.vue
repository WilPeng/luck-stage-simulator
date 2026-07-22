<template>
  <div class="lv-vote">
    <div class="page-header">
      <h1>喜爱值投送</h1>
      <span class="round-tag">第{{ $route.params.round }}轮</span>
      <span v-if="hasSubmitted" class="submitted-tag">已提交</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <!-- 已提交结果（只读展示） -->
    <div v-if="hasSubmitted" class="result-view">
      <div class="total-banner submitted">
        <div class="total-label">你投送的喜爱值总额</div>
        <div class="total-value">{{ totalBudget }}</div>
      </div>
      <h3 class="result-title">投送详情</h3>
      <div class="votes-list">
        <div v-for="v in myVotes" :key="v.id" class="vote-item">
          <div class="vote-target-row">
            <LvAvatar :name="v.targetName" :avatar="getTargetAvatar(v.targetId)" size="sm" />
            <span class="vote-target">{{ v.targetName }}</span>
          </div>
          <span class="vote-value">{{ v.value }}</span>
        </div>
      </div>
    </div>

    <div v-else-if="!isCurrentStage" class="not-current">
      <p>当前不是喜爱值投送阶段</p>
    </div>

    <!-- 投送表单（未提交时） -->
    <div v-else class="vote-form">
      <div class="total-banner">
        <div class="total-label">你可投送的喜爱值总额</div>
        <div class="total-value">{{ totalBudget }}</div>
        <div class="total-hint">系统分配预算</div>
      </div>

      <div class="remaining-info" :class="{ error: remaining < 0 || !allDifferent || !allTargetsFilled }">
        <span>剩余可分配: {{ remaining }}</span>
        <span v-if="!allTargetsFilled" class="error-text">还有 {{ unfilledCount }} 位选手未分配值</span>
        <span v-else-if="!allDifferent" class="error-text">每个选手的喜爱值必须不同！</span>
        <span v-else-if="remaining === 0" class="ok-text">✅ 分配完成</span>
      </div>

      <div class="players-list">
        <div v-for="p in targets" :key="p.id" class="player-row" :class="{ missing: (voteValues[p.id] || 0) <= 0 }">
          <div class="player-name-row">
            <LvAvatar :name="p.name" :avatar="getTargetAvatar(p.id)" size="sm" />
            <span class="player-name">{{ p.name }}</span>
          </div>
          <input v-model.number="voteValues[p.id]" type="number" class="vote-input"
            min="1" :max="totalBudget" placeholder="0"
            @input="onValueChange" />
        </div>
      </div>

      <div class="actions-row">
        <button class="lv-btn lv-btn-secondary random-btn" @click="randomFill" type="button">
          🎲 随机一下
        </button>
        <button class="lv-btn lv-btn-primary submit-btn" @click="submitVotes"
          :disabled="!canSubmit || submitting">
          {{ submitting ? '提交中...' : '提交投送' }}
        </button>
      </div>

      <div v-if="submitSuccess" class="success-toast">✅ 投送提交成功！</div>
      <div v-if="submitError" class="error-toast">{{ submitError }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useLvAuthStore } from '../../../stores/lovevarietyAuthStore'
import { useLvSeasonStore } from '../../../stores/lovevarietySeasonStore'
import { lvGetActivePlayers, lvGetMyVotes, lvGetMyBudget, lvSubmitVotes } from '../../../services/lovevarietyApi'
import LvAvatar from '../../../components/lovevariety/LvAvatar.vue'

const route = useRoute()
const authStore = useLvAuthStore()
const seasonStore = useLvSeasonStore()

const roundNum = computed(() => Number(route.params.round) || 1)
const roundId = computed(() => `round-${roundNum.value}`)
const isCurrentStage = computed(() => seasonStore.currentStage === 'love_vote')
const isCurrentRound = computed(() => roundNum.value === seasonStore.currentRoundNumber)
const isFuture = computed(() => seasonStore.getStageStatus(roundNum.value, 'love_vote') === 'future')

// 是否已提交：初始根据阶段状态判断，提交成功后变为 true
const hasSubmitted = ref(false)

// 随机抽取 40-70
const totalBudget = ref(0)

const targets = ref<{ id: string; name: string; avatar?: string | null }[]>([])
const voteValues = ref<Record<string, number>>({})
const myVotes = ref<any[]>([])
const submitting = ref(false)
const submitSuccess = ref(false)
const submitError = ref('')

const totalUsed = computed(() => {
  return Object.values(voteValues.value).reduce((sum, v) => sum + (v || 0), 0)
})

const remaining = computed(() => totalBudget.value - totalUsed.value)

const allDifferent = computed(() => {
  const values = Object.values(voteValues.value).filter(v => v > 0)
  const unique = new Set(values)
  return unique.size === values.length
})

const allTargetsFilled = computed(() => {
  return targets.value.length > 0 && targets.value.every(p => (voteValues.value[p.id] || 0) > 0)
})

const unfilledCount = computed(() => {
  return targets.value.filter(p => (voteValues.value[p.id] || 0) <= 0).length
})

const canSubmit = computed(() => {
  return remaining.value === 0 && allDifferent.value && allTargetsFilled.value
})

const targetAvatarMap = ref<Record<string, string | null>>({})

function getTargetAvatar(id: string): string | null {
  return targetAvatarMap.value[id] || null
}

function onValueChange() {
  submitError.value = ''
}

function randomFill(): void {
  const n = targets.value.length
  const budget = totalBudget.value
  if (n === 0 || budget < n) return
  submitError.value = ''

  // 每人至少 1
  const values = new Array(n).fill(1)
  let remainingBudget = budget - n

  if (remainingBudget > 0) {
    // 生成 n 个随机增量
    const increments = Array.from({ length: n }, () => Math.random() * remainingBudget)
    const incSum = increments.reduce((a, b) => a + b, 0)

    let adjRemaining = remainingBudget
    for (let i = 0; i < n - 1; i++) {
      const inc = Math.round(increments[i] / incSum * remainingBudget)
      values[i] += inc
      adjRemaining -= inc
    }
    // 最后一人拿剩余部分
    values[n - 1] += adjRemaining
  }

  // 确保值互不相同：排序后微调
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].v <= sorted[i - 1].v) {
      sorted[i].v = sorted[i - 1].v + 1
    }
  }

  // 修正总和（从大值减去超出部分）
  const currentSum = sorted.reduce((a, b) => a + b.v, 0)
  let diff = currentSum - budget
  for (let i = sorted.length - 1; i >= 0 && diff > 0; i--) {
    const adjust = Math.min(diff, sorted[i].v - 1)
    sorted[i].v -= adjust
    diff -= adjust
  }

  // 填入 voteValues
  sorted.forEach(s => {
    voteValues.value[targets.value[s.i].id] = s.v
  })
}

async function submitVotes() {
  if (!canSubmit.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const votes = Object.entries(voteValues.value)
      .filter(([_, v]) => v > 0)
      .map(([targetId, value]) => {
        const player = targets.value.find(p => p.id === targetId)
        return { targetId, targetName: player?.name || '', value }
      })
    await lvSubmitVotes(roundId.value, votes, totalBudget.value)
    submitSuccess.value = true
    hasSubmitted.value = true
    // 重新加载已提交的记录
    myVotes.value = await lvGetMyVotes(roundId.value)
    setTimeout(() => submitSuccess.value = false, 3000)
  } catch (e: any) {
    submitError.value = e.message || '提交失败'
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  try {
    // 检查是否已提交投送
    const existingVotes = await lvGetMyVotes(roundId.value)
    if (existingVotes.length > 0) {
      hasSubmitted.value = true
      myVotes.value = existingVotes
      totalBudget.value = existingVotes.reduce((s: number, v: any) => s + v.value, 0)
      return
    }
  } catch {}

  try {
    // 从后端获取系统分配的预算
    const budgetData = await lvGetMyBudget(roundId.value)
    totalBudget.value = budgetData.budget
  } catch {
    // 降级：本地随机（正常情况下不应走到这里）
    totalBudget.value = 100 + Math.floor(Math.random() * 61)
  }

  try {
    // 加载活跃选手（排除自己）
    const all = await lvGetActivePlayers()
    targets.value = all.filter(p => p.id !== authStore.currentUser?.id)
    // 记录头像
    all.forEach(p => { targetAvatarMap.value[p.id] = p.avatar || null })
    // 初始化投送值
    targets.value.forEach(p => { voteValues.value[p.id] = 0 })
  } catch {}
})
</script>

<style scoped>
.lv-vote { max-width: 600px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #ff69b422; color: #ff69b4; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #ff69b444; }
.history-tag { background: #88888822; color: #aaa; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.submitted-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.future-tag { background: #44444422; color: #666; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }
.not-current, .history-view, .result-view { text-align: center; padding: 40px 0; color: #888; }
.result-title { font-size: 16px; color: #e0e0e0; margin: 24px 0 12px; }
.votes-list { max-width: 400px; margin: 0 auto; }
.vote-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #ff69b411; }
.vote-target-row { display: flex; align-items: center; gap: 8px; }
.vote-target { color: #e0e0e0; }
.vote-value { color: #ff69b4; font-weight: 600; }
.empty-tip { color: #666; padding: 20px; }
.total-banner {
  background: linear-gradient(135deg, #ff69b422, #ff149322);
  border: 1px solid #ff69b4; border-radius: 12px; padding: 20px;
  text-align: center; margin-bottom: 16px;
}
.total-label { font-size: 13px; color: #aaa; }
.total-value { font-size: 36px; font-weight: 700; color: #ff69b4; margin: 4px 0; }
.total-hint { font-size: 12px; color: #888; }
.total-banner.submitted { background: linear-gradient(135deg, #00ff8822, #00cc6622); border-color: #00ff88; }
.remaining-info { text-align: center; font-size: 14px; color: #888; margin-bottom: 16px; }
.remaining-info.error { color: #ff4444; }
.remaining-info .error-text { display: block; font-size: 12px; color: #ff4444; margin-top: 4px; }
.remaining-info .ok-text { display: block; font-size: 12px; color: #00ff88; margin-top: 4px; }
.players-list { margin-bottom: 20px; }
.player-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-bottom: 1px solid #ff69b411;
  transition: all 0.2s;
}
.player-row.missing {
  border-left: 3px solid #ff4444;
  background: #ff000010;
}
.player-row.missing .vote-input {
  border-color: #ff444466;
}
.player-name-row { display: flex; align-items: center; gap: 8px; }
.player-name { font-size: 15px; font-weight: 500; color: #e0e0e0; }
.vote-input {
  width: 80px; background: #1a0f2e; border: 1px solid #ff69b422; color: #e0e0e0;
  padding: 6px 10px; border-radius: 6px; font-size: 16px; text-align: center; outline: none;
}
.vote-input:focus { border-color: #ff69b4; }
.lv-btn {
  background: transparent; border: 1px solid #ff69b444; color: #ff69b4;
  padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.lv-btn:hover { background: #ff69b422; }
.lv-btn-primary { background: #ff69b422; border-color: #ff69b4; }
.lv-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.actions-row { display: flex; gap: 12px; }
.actions-row .submit-btn { flex: 1; }
.random-btn { background: #1a0f2e; border-color: #888844; color: #ffcc00; white-space: nowrap; padding: 12px 16px; }
.random-btn:hover { background: #88888822; }
.submit-btn { padding: 12px 20px; font-size: 16px; }
.success-toast { text-align: center; color: #00ff88; margin-top: 12px; font-size: 14px; }
.error-toast { text-align: center; color: #ff4444; margin-top: 12px; font-size: 14px; }
</style>
