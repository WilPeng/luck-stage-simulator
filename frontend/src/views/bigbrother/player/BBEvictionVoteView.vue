<template>
  <div class="bb-eviction-player">
    <div class="page-header">
      <h1>淘汰投票</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
      <span v-if="isHistory" class="history-tag">历史记录</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <template v-else-if="isCurrentRound">
      <div v-if="hasVoted" class="voted-card">
        <div class="voted-icon">🗳️</div>
        <div class="voted-info">
          <div class="voted-label">你已投票</div>
          <div class="voted-target">投票对象: {{ myVote?.targetName }}</div>
        </div>
      </div>

      <div v-if="isHoh && !hasVoted" class="hoh-vote-note">
        👑 你是本周的 HOH，请正常投票。你的投票仅在出现平票时作为最终裁决使用，不影响常规计票。
      </div>

      <div v-if="isNominee && seasonStore.currentStage === 'eviction_vote'" class="nominee-waiting-card">
        <div class="nominee-waiting-icon">⏳</div>
        <div class="nominee-waiting-title">你本轮是被提名者，等待其他玩家投票</div>
        <div class="nominee-waiting-desc">作为被提名人，你无法参与本轮淘汰投票。结果将在投票结束后公布。</div>
        <div class="nominee-list-preview">
          <div class="nominee-list-label">本轮被提名人：</div>
          <div class="nominee-chips">
            <span v-for="(name, i) in voteOptions" :key="i" class="nominee-chip"
              :class="{ 'is-self': voteOptionIds[i] === authStore.currentUser?.id }">
              <BBAvatar :name="name" :avatar="avatarMap[voteOptionIds[i]] || null" size="sm" />
              {{ name }}{{ voteOptionIds[i] === authStore.currentUser?.id ? '（你）' : '' }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="isNominee && seasonStore.currentStage === 'eviction'" class="nominee-waiting-card result-waiting">
        <div class="nominee-waiting-icon">🔔</div>
        <div class="nominee-waiting-title">投票已结束，等待公布结果</div>
        <div class="nominee-waiting-desc">管理员即将宣布本轮淘汰结果。</div>
      </div>

      <div v-if="nomination && !hasVoted && !isNominee && seasonStore.currentStage === 'eviction_vote'" class="vote-section">
        <h3>选择你要淘汰的对象</h3>
        <div class="vote-options">
          <div v-for="(name, i) in voteOptions" :key="i" class="vote-option"
            :class="{ selected: selectedVote === voteOptionIds[i] }"
            @click="selectedVote = voteOptionIds[i]">
            <span class="vote-icon">🗳️</span>
            <BBAvatar :name="name" :avatar="avatarMap[voteOptionIds[i]] || null" size="md" />
            <span class="vote-name">{{ name }}</span>
            <span v-if="selectedVote === voteOptionIds[i]" class="check-mark">✓</span>
          </div>
        </div>
        <div class="vote-action">
          <button class="bb-btn bb-btn-primary" :disabled="!selectedVote" @click="castVote">确认投票</button>
        </div>
      </div>
    </template>

    <!-- 历史轮次展示提名 -->
    <div v-if="nomination && isHistory" class="nomination-summary">
      <h3>被提名人</h3>
      <div class="nominees-list">
        <div v-for="(name, i) in (nomination.nomineeNames || [])" :key="i" class="nominee-chip">{{ name }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { bbGetCurrentNomination, bbGetNominationHistory, bbCastVote, bbGetMyVote, bbGetCurrentHoh, bbGetActiveHouseguests } from '../../../services/bbApi'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'
import type { BBNomination, BBEvictionVote } from '../../../types/bigbrother'

const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const roundNum = computed(() => Number(route.params.round) || 1)
const isCurrentRound = computed(() => roundNum.value === seasonStore.currentRoundNumber)
const isHistory = computed(() => seasonStore.isStageCompleted(roundNum.value, 'eviction_vote'))
const isFuture = computed(() => seasonStore.getStageStatus(roundNum.value, 'eviction_vote') === 'future')

const nomination = ref<BBNomination | null>(null)
const myVote = ref<BBEvictionVote | null>(null)
const currentHoh = ref<any>(null)
const selectedVote = ref<string>('')
const loading = ref(true)
const avatarMap = ref<Record<string, string | null>>({})

const hasVoted = computed(() => !!myVote.value)
const isHoh = computed(() => currentHoh.value?.winnerId === authStore.currentUser?.id)

const isNominee = computed(() => {
  if (!nomination.value || !authStore.currentUser?.id) return false
  // BBBB 胜者安全，可参与投票
  if ((nomination.value as any).bbbbWinnerId === authStore.currentUser.id) return false
  const allIds = [...nomination.value.nomineeIds]
  if (nomination.value.replacementNomineeId) allIds.push(nomination.value.replacementNomineeId)
  return allIds.includes(authStore.currentUser.id)
})

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
    alert(e?.message || '投票失败')
  }
}

onMounted(async () => {
  // 加载提名数据（当前轮次用 /current 接口，历史轮次用 history 接口）
  if (isCurrentRound.value) {
    try { nomination.value = await bbGetCurrentNomination() } catch {}
  } else {
    try {
      const history = await bbGetNominationHistory()
      const roundKey = `round-${roundNum.value}`
      nomination.value = history.find(h => h.roundId === roundKey) || null
    } catch {}
  }
  if (isCurrentRound.value) {
    try { currentHoh.value = await bbGetCurrentHoh() } catch {}
    try { myVote.value = await bbGetMyVote() } catch {}
  }
  try {
    const list = await bbGetActiveHouseguests()
    const m: Record<string, string | null> = {}
    for (const h of (list || [])) m[h.id] = (h as any).avatar || null
    avatarMap.value = m
  } catch {}
  loading.value = false
})
</script>

<style scoped>
.bb-eviction-player { max-width: 600px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #ece7fb; margin: 0; }
.round-tag { background: #b39bff22; color: #b39bff; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #b39bff44; }
.history-tag { background: #88888822; color: #a99bd0; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #6b5f92; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }
.hoh-vote-note { background: #e6c98822; border: 1px solid #e6c988; border-radius: 8px; padding: 12px 16px; font-size: 14px; color: #e6c988; margin-bottom: 16px; line-height: 1.6; }
.loading-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: #8f83b8; font-size: 14px; }
.loading-spinner { width: 32px; height: 32px; border: 3px solid #b39bff22; border-top-color: #b39bff; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.voted-card { background: #1c1533; border: 1px solid #b39bff; border-radius: 12px; padding: 24px; display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.voted-icon { font-size: 36px; }
.voted-label { font-size: 12px; color: #8f83b8; text-transform: uppercase; }
.voted-target { font-size: 16px; font-weight: 600; color: #b39bff; margin-top: 4px; }
.vote-section, .nomination-summary { background: #1b1130; border: 1px solid #b39bff22; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.vote-section h3, .nomination-summary h3 { margin: 0 0 12px; font-size: 16px; color: #ece7fb; }
.vote-options { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.vote-option { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: #b39bff05; border: 1px solid #b39bff22; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
.vote-option:hover { border-color: #b39bff; background: #b39bff10; }
.vote-option.selected { border-color: #b39bff; background: #b39bff15; }
.vote-icon { font-size: 20px; }
.vote-name { flex: 1; font-size: 15px; color: #ece7fb; }
.check-mark { color: #b39bff; font-size: 18px; font-weight: 700; }
.vote-action { text-align: center; }
.bb-btn { background: transparent; border: 1px solid #b39bff44; color: #b39bff; padding: 10px 28px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #b39bff22; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-primary { background: #b39bff22; border-color: #b39bff; }
.nominees-list { display: flex; gap: 12px; flex-wrap: wrap; }
.nominee-chip { background: #e6c98815; border: 1px solid #e6c98833; border-radius: 6px; padding: 8px 16px; font-size: 14px; color: #e6c988; }
.nominee-chip.is-self { background: #ff444422; border-color: #ff444466; color: #ff6b6b; font-weight: 600; }
.nominee-waiting-card { background: linear-gradient(135deg, #1a0f2e, #2e0f1a); border: 1px solid #ff444444; border-radius: 12px; padding: 28px 24px; margin-bottom: 20px; text-align: center; }
.nominee-waiting-card.result-waiting { background: linear-gradient(135deg, #1e1636, #1a2e0f); border-color: #e6c98844; }
.nominee-waiting-icon { font-size: 48px; margin-bottom: 12px; }
.nominee-waiting-title { font-size: 18px; font-weight: 600; color: #ff6b6b; margin-bottom: 8px; }
.result-waiting .nominee-waiting-title { color: #e6c988; }
.nominee-waiting-desc { font-size: 14px; color: #a99bd0; line-height: 1.6; }
.nominee-list-preview { margin-top: 20px; padding-top: 16px; border-top: 1px solid #ffffff10; text-align: left; }
.nominee-list-label { font-size: 13px; color: #8f83b8; margin-bottom: 10px; }
.nominee-chips { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
</style>
