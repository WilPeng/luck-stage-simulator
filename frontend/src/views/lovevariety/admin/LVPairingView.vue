<template>
  <div class="lv-pairing">
    <div class="page-header">
      <h1>配对结算管理</h1>
      <span class="round-tag">第{{ $route.params.round }}轮</span>
      <button class="lv-btn" @click="calculatePairing" :disabled="calculating">
        {{ calculating ? '结算中...' : '💑 执行配对结算' }}
      </button>
    </div>

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else-if="!result" class="empty-state">
      <p>本轮尚未进行配对结算</p>
      <p class="hint">先确保所有选手已完成喜爱值投送，然后点击上方按钮执行配对结算</p>
    </div>

    <div v-else>
      <!-- 单身汉 -->
      <div class="single-section">
        <h3>❤️ 本轮单身汉</h3>
        <div class="single-card">
          <span class="single-name">{{ result.singlePlayerName }}</span>
          <span class="single-desc">收获喜爱值最少，本轮落单</span>
        </div>
      </div>

      <!-- 配对列表 -->
      <div class="pairs-section">
        <h3>💑 配对结果（共 {{ result.pairs?.length || 0 }} 对）</h3>
        <div class="pairs-grid">
          <div v-for="(pair, i) in result.pairs" :key="i" class="pair-card">
            <div class="pair-rank">#{{ i + 1 }}</div>
            <div class="pair-players">
              <div class="player-col">
                <span class="pair-player">{{ pair.player1Name }}</span>
                <span class="pair-value">→ {{ pair.p1toP2 }}</span>
              </div>
              <div class="pair-heart">💕</div>
              <div class="player-col">
                <span class="pair-player">{{ pair.player2Name }}</span>
                <span class="pair-value">→ {{ pair.p2toP1 }}</span>
              </div>
            </div>
            <div class="pair-total">互相投送值之和: <strong>{{ pair.mutualValue }}</strong></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { lvGetRoundPairing, lvCalculatePairing } from '../../../services/lovevarietyApi'

const route = useRoute()
const result = ref<any>(null)
const loading = ref(true)
const calculating = ref(false)

const roundId = computed(() => `round-${route.params.round}`)

async function calculatePairing() {
  calculating.value = true
  try {
    const res = await lvCalculatePairing()
    result.value = res
    alert(`配对结算完成！${res.singlePlayerName} 成为单身汉，共 ${res.pairs.length} 对组合`)
  } catch (e: any) {
    alert(e.message || '配对结算失败')
  } finally {
    calculating.value = false
  }
}

onMounted(async () => {
  try {
    result.value = await lvGetRoundPairing(roundId.value)
  } catch {}
  loading.value = false
})
</script>

<style scoped>
.lv-pairing { max-width: 1000px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag {
  background: #ff69b422; color: #ff69b4; padding: 2px 12px;
  border-radius: 10px; font-size: 12px; border: 1px solid #ff69b444;
}
.lv-btn {
  background: transparent; border: 1px solid #ff69b444; color: #ff69b4;
  padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.lv-btn:hover { background: #ff69b422; }
.lv-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.loading { text-align: center; color: #888; padding: 40px; font-size: 16px; }
.empty-state { text-align: center; color: #888; padding: 40px; }
.empty-state .hint { font-size: 13px; color: #666; margin-top: 8px; }
.single-section { margin-bottom: 24px; }
.single-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.single-card {
  background: linear-gradient(135deg, #ff69b422, #ff149322);
  border: 1px solid #ff69b4; border-radius: 12px; padding: 20px;
  display: flex; align-items: center; gap: 16px;
}
.single-name { font-size: 22px; font-weight: 700; color: #ff69b4; }
.single-desc { font-size: 14px; color: #aaa; }
.pairs-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.pairs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.pair-card {
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 10px;
  padding: 16px; position: relative;
}
.pair-rank {
  position: absolute; top: 8px; right: 12px;
  font-size: 12px; color: #888;
}
.pair-players { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.player-col { text-align: center; }
.pair-player { display: block; font-size: 16px; font-weight: 600; color: #e0e0e0; }
.pair-value { display: block; font-size: 12px; color: #ff69b4; margin-top: 4px; }
.pair-heart { font-size: 24px; }
.pair-total { text-align: center; font-size: 13px; color: #888; border-top: 1px solid #ff69b411; padding-top: 8px; }
.pair-total strong { color: #ff69b4; }
</style>
