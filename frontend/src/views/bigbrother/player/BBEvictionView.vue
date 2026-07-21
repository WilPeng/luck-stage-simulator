<template>
  <div class="bb-eviction-player">
    <div class="page-header">
      <h1>淘汰投票</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
      <span v-if="isHistory" class="history-tag">历史记录</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <!-- 当前轮次投票 -->
    <template v-if="isCurrentRound">
      <div v-if="hasVoted" class="voted-card">
        <div class="voted-icon">🗳️</div>
        <div class="voted-info">
          <div class="voted-label">你已投票</div>
          <div class="voted-target">投票对象: {{ myVote?.targetName }}</div>
        </div>
      </div>

      <div v-if="isHoh && !hasVoted" class="hoh-vote-note">
        ⚠️ 你是本周的 HOH，只有在平票时才能投票
      </div>

      <div v-if="nomination && !hasVoted && seasonStore.currentStage === 'eviction_vote'" class="vote-section">
        <h3>选择你要淘汰的对象</h3>
        <div class="vote-options">
          <div v-for="(name, i) in voteOptions" :key="i" class="vote-option"
            :class="{ selected: selectedVote === voteOptionIds[i] }"
            @click="selectedVote = voteOptionIds[i]">
            <span class="vote-icon">🗳️</span>
            <span class="vote-name">{{ name }}</span>
            <span v-if="selectedVote === voteOptionIds[i]" class="check-mark">✓</span>
          </div>
        </div>
        <div class="vote-action">
          <button class="bb-btn bb-btn-primary" :disabled="!selectedVote" @click="castVote">
            确认投票
          </button>
        </div>
      </div>
    </template>

    <!-- 历史淘汰结果（或当前轮次已出结果） -->
    <div v-if="evictionResult" class="result-section">
      <h3>淘汰结果</h3>
      <div class="result-card">
        <div class="result-icon">🚪</div>
        <div class="result-info">
          <div class="result-name">{{ evictionResult.evictedName }}</div>
          <div class="result-votes">{{ evictionResult.voteCount }} / {{ evictionResult.totalVotes }} 票</div>
        </div>
      </div>
    </div>

    <!-- 提名信息（历史轮次展示） -->
    <div v-if="nomination && isHistory" class="nomination-summary">
      <h3>被提名人</h3>
      <div class="nominees-list">
        <div v-for="(name, i) in (nomination.nomineeNames || [])" :key="i" class="nominee-chip">
          {{ name }}
        </div>
      </div>
      <div v-if="nomination.replacementNomineeName" class="replacement-info">
        替换提名: <strong>{{ nomination.replacementNomineeName }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { bbGetNominationHistory, bbCastVote, bbGetMyVote, bbGetEvictionHistory, bbGetCurrentHoh } from '../../../services/bbApi'
import type { BBNomination, BBEvictionVote, BBEviction } from '../../../types/bigbrother'

const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const roundNum = computed(() => Number(route.params.round) || 1)
const isCurrentRound = computed(() => roundNum.value === seasonStore.currentRoundNumber)
const isHistory = computed(() => {
  return seasonStore.isStageCompleted(roundNum.value, 'eviction_vote') ||
    seasonStore.isStageCompleted(roundNum.value, 'eviction')
})
const isFuture = computed(() => {
  const status = seasonStore.getStageStatus(roundNum.value, 'eviction_vote')
  return status === 'future'
})

const nomination = ref<BBNomination | null>(null)
const myVote = ref<BBEvictionVote | null>(null)
const evictionResult = ref<BBEviction | null>(null)
const currentHoh = ref<any>(null)
const selectedVote = ref<string>('')

const hasVoted = computed(() => !!myVote.value)

const isHoh = computed(() => currentHoh.value?.winnerId === authStore.currentUser?.id)

const voteOptions = computed(() => {
  if (!nomination.value) return []
  const names = [...nomination.value.nomineeNames]
  if (nomination.value.replacementNomineeName) names.push(nomination.value.replacementNomineeName)
  return [...new Set(names)]
})

const voteOptionIds = computed(() => {
  if (!nomination.value) return []
  const ids = [...nomination.value.nomineeIds]
  if (nomination.value.replacementNomineeId) ids.push(nomination.value.replacementNomineeId)
  return [...new Set(ids)]
})

async function castVote() {
  if (!selectedVote.value) return
  const idx = voteOptionIds.value.indexOf(selectedVote.value)
  const name = voteOptions.value[idx] || ''
  try {
    await bbCastVote(selectedVote.value, name)
    myVote.value = { targetId: selectedVote.value, targetName: name } as any
    alert('投票成功！')
  } catch (e: any) {
    const msg = e?.message || e?.error || '投票失败'
    alert(msg)
  }
}

onMounted(async () => {
  // 加载提名数据
  try {
    const history = await bbGetNominationHistory()
    const roundKey = `round-${roundNum.value}`
    nomination.value = history.find(h => h.roundId === roundKey) || null
  } catch {}

  // 加载淘汰结果
  try {
    const history = await bbGetEvictionHistory()
    const roundKey = `round-${roundNum.value}`
    evictionResult.value = history.find(h => h.roundId === roundKey) || null
  } catch {}

  // 当前轮次才需要 HOH 和我的投票信息
  if (isCurrentRound.value) {
    try { currentHoh.value = await bbGetCurrentHoh() } catch {}
    try { myVote.value = await bbGetMyVote() } catch {}
  }
})
</script>

<style scoped>
.bb-eviction-player { max-width: 600px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.history-tag { background: #88888822; color: #aaa; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #666; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }
.hoh-vote-note { background: #ffaa0022; border: 1px solid #ffaa00; border-radius: 8px; padding: 12px 16px; font-size: 14px; color: #ffaa00; margin-bottom: 16px; }
.voted-card { background: #0f2e0f; border: 1px solid #00ff88; border-radius: 12px; padding: 24px; display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.voted-icon { font-size: 36px; }
.voted-label { font-size: 12px; color: #888; text-transform: uppercase; }
.voted-target { font-size: 16px; font-weight: 600; color: #00ff88; margin-top: 4px; }
.vote-section, .result-section, .nomination-summary { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.vote-section h3, .result-section h3, .nomination-summary h3 { margin: 0 0 12px; font-size: 16px; color: #e0e0e0; }
.vote-options { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.vote-option { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: #00ff8805; border: 1px solid #00ff8822; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
.vote-option:hover { border-color: #00ff88; background: #00ff8810; }
.vote-option.selected { border-color: #00ff88; background: #00ff8815; }
.vote-icon { font-size: 20px; }
.vote-name { flex: 1; font-size: 15px; color: #e0e0e0; }
.check-mark { color: #00ff88; font-size: 18px; font-weight: 700; }
.vote-action { text-align: center; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 10px 28px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }
.result-card { display: flex; align-items: center; gap: 16px; padding: 16px; background: #2e0f0f; border: 1px solid #ff4444; border-radius: 8px; }
.result-icon { font-size: 32px; }
.result-name { font-size: 18px; font-weight: 600; color: #ff4444; }
.result-votes { font-size: 13px; color: #aaa; margin-top: 2px; }
.nominees-list { display: flex; gap: 12px; flex-wrap: wrap; }
.nominee-chip { background: #ffaa0015; border: 1px solid #ffaa0033; border-radius: 6px; padding: 8px 16px; font-size: 14px; color: #ffaa00; }
.replacement-info { margin-top: 12px; font-size: 14px; color: #aaa; }
.replacement-info strong { color: #ffaa00; }
</style>
