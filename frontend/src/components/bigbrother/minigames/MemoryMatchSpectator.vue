<template>
  <div class="mm-spectator">
    <div class="mm-head">
      <span class="mm-title">🃏 全体选手牌面</span>
      <span class="mm-meta">4×4 · {{ totalPairs }} 对</span>
    </div>

    <div class="mm-grid">
      <div
        v-for="p in board?.players || []"
        :key="p.playerId"
        class="mm-player"
        :class="{ done: p.done }"
      >
        <div class="mm-p-head">
          <BBAvatar :name="p.playerName" size="sm" />
          <span class="mm-name">{{ p.playerName }}</span>
          <span class="mm-pairs">{{ p.matchedPairs }}/{{ p.totalPairs }}</span>
        </div>

        <div class="mm-board">
          <div
            v-for="(card, idx) in (p.board || [])"
            :key="idx"
            class="mm-card"
            :class="{
              hidden: !isFlipped(p, idx) && !isMatched(p, idx),
              flipped: isFlipped(p, idx) && !isMatched(p, idx),
              matched: isMatched(p, idx)
            }"
          >
            <span class="mm-card-emoji">{{ card }}</span>
          </div>
        </div>

        <div class="mm-p-foot">
          <span>步数 {{ p.moves }}</span>
          <span v-if="p.done" class="mm-done">✅ {{ fmtDur(p.durationMs) }}</span>
          <span v-else class="mm-playing">进行中</span>
        </div>
      </div>
      <div v-if="!(board?.players || []).length" class="mm-empty">暂无选手牌面</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BBAvatar from '../BBAvatar.vue'

const props = defineProps<{ board: any }>()

const totalPairs = computed(() => Number(props.board?.players?.[0]?.totalPairs) || 8)

function isFlipped(p: any, idx: number) {
  return (p.flipped || []).includes(idx)
}
function isMatched(p: any, idx: number) {
  return (p.matched || []).includes(idx)
}
function fmtDur(ms: number | null) {
  if (ms == null) return '-'
  return `${(ms / 1000).toFixed(1)}s`
}
</script>

<style scoped>
.mm-spectator {
  background: #120a22;
  border: 1px solid #b39bff22;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
}
.mm-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.mm-title { font-size: 14px; font-weight: 700; color: #b39bff; }
.mm-meta { font-size: 12px; color: #8f83b8; }
.mm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.mm-player { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 10px; padding: 9px; }
.mm-player.done { border-color: #e6c988; background: #e6c9880e; }
.mm-p-head { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; min-width: 0; }
.mm-name { flex: 1; font-size: 12.5px; color: #ece7fb; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mm-pairs { font-size: 12px; color: #e6c988; font-weight: 700; }
.mm-board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; }
.mm-card {
  aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  border-radius: 5px; background: #1c1533; border: 1px solid #b39bff44;
}
.mm-card.hidden { background: #241a42; border-color: #ffffff10; }
.mm-card.hidden .mm-card-emoji { opacity: 0.22; filter: grayscale(0.6); }
.mm-card.flipped { border-color: #00c8ff; box-shadow: 0 0 8px #00c8ff44; }
.mm-card.matched { background: #b39bff14; border-color: #b39bff; opacity: 0.85; }
.mm-card-emoji { font-size: 17px; }
.mm-p-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 7px; font-size: 11px; color: #8f83b8; }
.mm-done { color: #e6c988; font-weight: 700; }
.mm-playing { color: #7fb0ff; }
.mm-empty { color: #6b5f92; font-size: 13px; padding: 20px; grid-column: 1 / -1; text-align: center; }
@media (max-width: 560px) {
  .mm-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
}
</style>
