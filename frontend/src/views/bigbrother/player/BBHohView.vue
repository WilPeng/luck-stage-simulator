<template>
  <div class="bb-hoh-player">
    <div class="page-header">
      <h1>HOH 竞争</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
      <span v-if="isHistory" class="history-tag">历史记录</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <div v-if="currentHoh" class="hoh-announcement">
      <div class="hoh-card" :class="{ 'is-me': isMe(currentHoh.winnerName) }">
        <div class="hoh-crown">👑</div>
        <div class="hoh-body">
          <div class="hoh-label">一家之主（HOH）</div>
          <div class="hoh-name">
            {{ currentHoh.winnerName }}
            <span v-if="isMe(currentHoh.winnerName)" class="me-badge">我</span>
          </div>
          <div class="hoh-desc" v-if="!isHistory">
            {{ isMe(currentHoh.winnerName) ? '恭喜！你是本周的 HOH，请前往提名页面选择两名被提名人。' : `${currentHoh.winnerName} 成为了本周的 HOH，将负责提名两名房客面临淘汰。` }}
          </div>
        </div>
      </div>
    </div>
    <div v-else class="hoh-card pending">
      <div class="hoh-crown">👑</div>
      <div class="hoh-body">
        <div class="hoh-label">HOH 竞争尚未进行</div>
        <div class="hoh-hint">等待管理员开启 HOH 竞争</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { bbGetHohHistory } from '../../../services/bbApi'
import type { BBHohRecord } from '../../../types/bigbrother'

const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const roundNum = computed(() => Number(route.params.round) || 1)
const isHistory = computed(() => seasonStore.isStageCompleted(roundNum.value, 'hoh_competition'))
const isFuture = computed(() => seasonStore.getStageStatus(roundNum.value, 'hoh_competition') === 'future')

const currentHoh = ref<BBHohRecord | null>(null)

function isMe(name: string): boolean {
  return name === authStore.currentUser?.name
}

onMounted(async () => {
  try {
    const history = await bbGetHohHistory()
    const roundKey = `round-${roundNum.value}`
    currentHoh.value = history.find(h => h.roundId === roundKey) || null
  } catch {}
})
</script>

<style scoped>
.bb-hoh-player { max-width: 500px; margin: 0 auto; padding: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.history-tag { background: #88888822; color: #aaa; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #666; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }

.hoh-announcement { animation: fadeIn 0.4s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.hoh-card {
  background: linear-gradient(135deg, #0f0f2e, #1a1a3e);
  border: 1px solid #444;
  border-radius: 16px;
  padding: 32px 24px;
  display: flex;
  align-items: center;
  gap: 20px;
}
.hoh-card.is-me {
  border-color: #00ff88;
  background: linear-gradient(135deg, #0a1a0a, #0f2e1a);
  box-shadow: 0 0 20px rgba(0, 255, 136, 0.1);
}
.hoh-card.pending {
  border-color: #444;
}

.hoh-crown { font-size: 56px; flex-shrink: 0; }
.hoh-body { flex: 1; }
.hoh-label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
.hoh-name { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
.hoh-card:not(.is-me) .hoh-name { color: #ffaa00; }
.hoh-card.is-me .hoh-name { color: #00ff88; }
.me-badge { background: #00ff88; color: #000; padding: 2px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-left: 8px; vertical-align: middle; }
.hoh-desc { font-size: 14px; line-height: 1.6; }
.hoh-card:not(.is-me) .hoh-desc { color: #aaa; }
.hoh-card.is-me .hoh-desc { color: #00ff88cc; }
.hoh-hint { color: #666; font-size: 14px; margin-top: 8px; }
</style>
