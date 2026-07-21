<template>
  <div class="bb-nomination-player">
    <div class="page-header">
      <h1>提名</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
      <span v-if="isHistory" class="history-tag">历史记录</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <!-- 当前轮次且用户是 HOH 且处于提名阶段：显示提名操作 -->
    <div v-if="isCurrentRound && isCurrentHoh && isNominationStage" class="nomination-action">
      <div class="hoh-banner">🏆 你是本周的 HOH！请选择两名被提名人</div>
      <div class="nomination-form">
        <div class="form-group">
          <label>被提名人 1</label>
          <select v-model="nominee1" class="bb-select">
            <option value="" disabled>请选择</option>
            <option v-for="h in listForNominee1" :key="h.id" :value="h.id">{{ h.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>被提名人 2</label>
          <select v-model="nominee2" class="bb-select">
            <option value="" disabled>请选择</option>
            <option v-for="h in listForNominee2" :key="h.id" :value="h.id">{{ h.name }}</option>
          </select>
        </div>
        <button class="bb-btn" @click="submitNomination" :disabled="!nominee1 || !nominee2 || submitting">
          {{ submitting ? '提交中...' : '提交提名' }}
        </button>
      </div>
    </div>

    <!-- 已有提名结果 -->
    <div v-if="nomination" class="nomination-card">
      <div class="hoh-info">HOH: {{ nomination.hohName }}</div>
      <div class="nominees">
        <div v-for="(name, i) in (nomination.nomineeNames || [])" :key="i" class="nominee-item"
          :class="{ warned: isMe(name) }">
          <span class="nominee-icon">📋</span>
          <span class="nominee-name">{{ name }}</span>
          <span v-if="isMe(name)" class="me-badge">我</span>
          <span class="nominee-order">被提名人 {{ i + 1 }}</span>
        </div>
      </div>
      <div v-if="nomination.replacementNomineeName" class="replacement">
        替换提名: <strong>{{ nomination.replacementNomineeName }}</strong>
      </div>
      <div v-if="nomination.vetoUsed" class="veto-note">否决权已被使用</div>
    </div>
    <div v-else class="empty-card">
      <p>本周暂无提名信息</p>
    </div>

    <!-- 提交成功提示 -->
    <div v-if="submitSuccess" class="success-toast">提名已提交！</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { bbGetNominationHistory, bbSetNomination, bbGetActiveHouseguests, bbGetHohHistory } from '../../../services/bbApi'

const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const roundNum = computed(() => Number(route.params.round) || 1)
const isCurrentRound = computed(() => roundNum.value === seasonStore.currentRoundNumber)
const isHistory = computed(() => seasonStore.isStageCompleted(roundNum.value, 'nomination'))
const isFuture = computed(() => seasonStore.getStageStatus(roundNum.value, 'nomination') === 'future')

const nomination = ref<any>(null)
const currentHoh = ref<any>(null)
const activeList = ref<{ id: string; name: string }[]>([])
const activeMap = ref<Record<string, string>>({})
const nominee1 = ref('')
const nominee2 = ref('')
const submitting = ref(false)
const submitSuccess = ref(false)

const isCurrentHoh = computed(() => {
  return currentHoh.value?.winnerId === authStore.currentUser?.id
})

const isNominationStage = computed(() => seasonStore.currentStage === 'nomination')

const baseAvailable = computed(() => {
  const vetoWinnerId = nomination.value?.vetoWinnerId || ''
  return activeList.value.filter(h =>
    h.id !== authStore.currentUser?.id &&
    h.id !== vetoWinnerId
  )
})

const listForNominee1 = computed(() => {
  return baseAvailable.value.filter(h => h.id !== nominee2.value)
})

const listForNominee2 = computed(() => {
  return baseAvailable.value.filter(h => h.id !== nominee1.value)
})

function isMe(name: string): boolean {
  return name === authStore.currentUser?.name
}

async function submitNomination() {
  if (!nominee1.value || !nominee2.value) return
  submitting.value = true
  try {
    const name1 = activeMap.value[nominee1.value] || ''
    const name2 = activeMap.value[nominee2.value] || ''
    await bbSetNomination(
      [nominee1.value, nominee2.value],
      [name1, name2]
    )
    submitSuccess.value = true
    setTimeout(() => submitSuccess.value = false, 2000)
    try {
      const history = await bbGetNominationHistory()
      const roundKey = `round-${roundNum.value}`
      nomination.value = history.find(h => h.roundId === roundKey || h.roundId === roundKey) || null
    } catch {}
  } catch (e) {
    console.error('提交提名失败:', e)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  try {
    const hohHistory = await bbGetHohHistory()
    const roundKey = `round-${roundNum.value}`
    currentHoh.value = hohHistory.find(h => h.roundId === roundKey) || null
  } catch {}
  try {
    const history = await bbGetNominationHistory()
    const roundKey = `round-${roundNum.value}`
    nomination.value = history.find(h => h.roundId === roundKey || h.roundId === `round-${roundNum.value}`) || null
  } catch {}
  if (isCurrentRound.value) {
    try {
      const list = await bbGetActiveHouseguests()
      activeList.value = list
      const map: Record<string, string> = {}
      list.forEach(h => { map[h.id] = h.name })
      activeMap.value = map
    } catch {}
  }
})
</script>

<style scoped>
.bb-nomination-player { max-width: 600px; margin: 0 auto; padding: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.history-tag { background: #88888822; color: #aaa; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #666; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }

.hoh-banner { background: linear-gradient(135deg, #ffaa0022, #ff880022); border: 1px solid #ffaa00; border-radius: 8px; padding: 12px; text-align: center; font-size: 15px; color: #ffaa00; margin-bottom: 20px; }

.nomination-form { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #444; border-radius: 12px; padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 14px; color: #aaa; margin-bottom: 6px; }
.bb-select { width: 100%; padding: 10px; background: #1a1a3e; border: 1px solid #444; border-radius: 8px; color: #fff; font-size: 14px; }
.bb-select:focus { border-color: #ffaa00; outline: none; }
.bb-select option { background: #1a1a3e; color: #fff; }
.bb-btn { width: 100%; padding: 12px; background: linear-gradient(135deg, #ffaa00, #ff8800); border: none; border-radius: 8px; color: #000; font-size: 16px; font-weight: 600; cursor: pointer; }
.bb-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.nomination-card { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #ffaa00; border-radius: 12px; padding: 24px; margin-top: 20px; }
.hoh-info { font-size: 14px; color: #aaa; margin-bottom: 16px; }
.nominees { display: flex; gap: 16px; }
.nominee-item { flex: 1; background: #ffaa0008; border: 1px solid #ffaa0022; border-radius: 8px; padding: 16px; text-align: center; position: relative; }
.nominee-item.warned { border-color: #ff4444; background: #ff444408; }
.nominee-icon { display: block; font-size: 24px; margin-bottom: 8px; }
.nominee-name { display: block; font-size: 18px; font-weight: 600; color: #fff; }
.me-badge { position: absolute; top: 8px; right: 8px; background: #ff4444; color: #fff; padding: 1px 8px; border-radius: 8px; font-size: 10px; }
.nominee-order { display: block; font-size: 12px; color: #888; margin-top: 4px; }
.replacement { margin-top: 16px; padding: 12px; background: #ffaa0008; border-radius: 8px; font-size: 14px; color: #ffaa00; }
.veto-note { margin-top: 12px; color: #00ff88; font-size: 13px; }
.empty-card { background: #0f0f2e; border: 1px solid #444; border-radius: 12px; padding: 40px; text-align: center; margin-top: 20px; }
.empty-card p { color: #666; }

.success-toast { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: #00ff88; color: #000; padding: 12px 24px; border-radius: 8px; font-weight: 600; }
</style>
