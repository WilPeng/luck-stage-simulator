<template>
  <div class="lv-result">
    <div class="page-header">
      <h1>配对结果</h1>
      <span class="round-tag">第{{ $route.params.round }}轮</span>
      <span v-if="isHistory" class="history-tag">历史记录</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else-if="!result" class="empty-state">
      <p>本轮配对尚未进行</p>
    </div>

    <div v-else>
      <!-- 单身汉 -->
      <div class="single-section">
        <h3>❤️ 单身汉</h3>
        <div class="single-card" :class="{ 'is-me': isMe(result.singlePlayerName) }">
          <span class="single-name">{{ result.singlePlayerName }}</span>
          <span v-if="isMe(result.singlePlayerName)" class="me-badge">我</span>
          <span class="single-desc">收获喜爱值最少，本轮落单</span>
        </div>
      </div>

      <!-- 配对列表 -->
      <div class="pairs-section">
        <h3>💑 配对组合（共 {{ result.pairs?.length || 0 }} 对）</h3>
        <div class="pairs-list">
          <div v-for="(pair, i) in result.pairs" :key="i" class="pair-card"
            :class="{ 'involves-me': isMe(pair.player1Name) || isMe(pair.player2Name) }">
            <div class="pair-rank">#{{ i + 1 }}</div>
            <div class="pair-players">
              <span class="pair-player" :class="{ 'is-me': isMe(pair.player1Name) }">
                {{ pair.player1Name }}
                <span v-if="isMe(pair.player1Name)" class="mini-badge">我</span>
              </span>
              <span class="pair-heart">💕</span>
              <span class="pair-player" :class="{ 'is-me': isMe(pair.player2Name) }">
                {{ pair.player2Name }}
                <span v-if="isMe(pair.player2Name)" class="mini-badge">我</span>
              </span>
            </div>
            <div class="pair-detail">
              互相投送值: {{ pair.p1toP2 }} + {{ pair.p2toP1 }} = <strong>{{ pair.mutualValue }}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useLvAuthStore } from '../../../stores/lovevarietyAuthStore'
import { useLvSeasonStore } from '../../../stores/lovevarietySeasonStore'
import { lvGetRoundPairing } from '../../../services/lovevarietyApi'

const route = useRoute()
const authStore = useLvAuthStore()
const seasonStore = useLvSeasonStore()

const result = ref<any>(null)
const loading = ref(true)

const roundNum = computed(() => Number(route.params.round) || 1)
const roundId = computed(() => `round-${roundNum.value}`)
const isHistory = computed(() => seasonStore.isStageCompleted(roundNum.value, 'pairing') || seasonStore.isStageCompleted(roundNum.value, 'elimination'))
const isFuture = computed(() => seasonStore.getStageStatus(roundNum.value, 'pairing') === 'future')

function isMe(name: string): boolean {
  return name === authStore.currentUser?.name
}

onMounted(async () => {
  try {
    result.value = await lvGetRoundPairing(roundId.value)
  } catch {}
  loading.value = false
})
</script>

<style scoped>
.lv-result { max-width: 800px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #ff69b422; color: #ff69b4; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #ff69b444; }
.history-tag { background: #88888822; color: #aaa; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #666; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }
.loading { text-align: center; color: #888; padding: 40px; }
.empty-state { text-align: center; color: #888; padding: 40px; }
.single-section { margin-bottom: 24px; }
.single-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.single-card {
  background: linear-gradient(135deg, #ff69b422, #ff149322);
  border: 1px solid #ff69b4; border-radius: 12px; padding: 20px;
  display: flex; align-items: center; gap: 12px;
}
.single-card.is-me { border-color: #ffd700; background: linear-gradient(135deg, #ffd70022, #ffa50022); }
.single-name { font-size: 20px; font-weight: 700; color: #ff69b4; }
.single-card.is-me .single-name { color: #ffd700; }
.me-badge { background: #ffd700; color: #1a0f2e; font-size: 12px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.single-desc { font-size: 13px; color: #aaa; margin-left: auto; }
.pairs-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.pairs-list { display: flex; flex-direction: column; gap: 10px; }
.pair-card {
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 10px;
  padding: 16px; position: relative; transition: all 0.2s;
}
.pair-card.involves-me { border-color: #ffd700; background: #ffd70008; }
.pair-rank { position: absolute; top: 8px; right: 12px; font-size: 12px; color: #888; }
.pair-players { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 8px; }
.pair-player { font-size: 16px; font-weight: 600; color: #e0e0e0; }
.pair-player.is-me { color: #ffd700; }
.mini-badge { background: #ffd700; color: #1a0f2e; font-size: 10px; padding: 1px 6px; border-radius: 8px; font-weight: 600; margin-left: 4px; }
.pair-heart { font-size: 20px; }
.pair-detail { text-align: center; font-size: 13px; color: #888; }
.pair-detail strong { color: #ff69b4; }
</style>
