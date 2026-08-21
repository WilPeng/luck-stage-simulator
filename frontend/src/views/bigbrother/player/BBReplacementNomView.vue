<template>
  <div class="bb-nomination-player">
    <div class="page-header">
      <h1>替换提名</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
      <span v-if="isHistory" class="history-tag">历史记录</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <div v-if="nomination" class="nomination-card">
      <div class="hoh-info">HOH: {{ nomination.hohName }}</div>
      <div class="nominees">
        <div v-for="(name, i) in (nomination.nomineeNames || [])" :key="i" class="nominee-item" :class="{ warned: isMe(name) }">
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
      <p>暂无替换提名信息</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { bbGetNominationHistory } from '../../../services/bbApi'

const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const roundNum = computed(() => Number(route.params.round) || 1)
const isHistory = computed(() => seasonStore.isStageCompleted(roundNum.value, 'replacement_nom'))
const isFuture = computed(() => seasonStore.getStageStatus(roundNum.value, 'replacement_nom') === 'future')
const nomination = ref<any>(null)

function isMe(name: string): boolean { return name === authStore.currentUser?.name }

onMounted(async () => {
  try {
    const history = await bbGetNominationHistory()
    const roundKey = `round-${roundNum.value}`
    nomination.value = history.find(h => h.roundId === roundKey) || null
  } catch {}
})
</script>

<style scoped>
.bb-nomination-player { max-width: 600px; margin: 0 auto; padding: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.history-tag { background: #88888822; color: #aaa; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #666; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }
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
</style>
