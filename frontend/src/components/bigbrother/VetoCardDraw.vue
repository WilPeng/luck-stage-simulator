<template>
  <div class="veto-card-draw">
    <div v-if="!state" class="deal-row">
      <button v-if="canDeal" class="bb-btn bb-btn-primary" @click="$emit('deal')">🃏 发牌（存活 &gt; 6：由选手抽卡）</button>
      <span v-else class="hint">等待管理员发牌…</span>
    </div>

    <template v-else>
      <div class="draw-info">
        当前抽卡：<strong>{{ currentDrawer?.playerName || '—' }}</strong>
        （{{ state.drawerIndex }} / {{ state.drawerOrder.length }}）
      </div>
      <div class="cards-grid">
        <div
          v-for="c in state.cards"
          :key="c.id"
          class="card"
          :class="{ flipped: c.flipped, clickable: canDraw && !c.flipped }"
          @click="onCardClick"
        >
          <template v-if="c.flipped">
            <span class="card-name">{{ c.playerName }}</span>
          </template>
          <template v-else>
            <span class="card-back">🂠</span>
          </template>
        </div>
      </div>
      <div class="draw-actions">
        <button class="bb-btn bb-btn-primary" :disabled="!canDraw || state.drawerIndex >= state.drawerOrder.length" @click="$emit('draw')">
          {{ state.drawerIndex >= state.drawerOrder.length ? '抽卡结束' : (canDraw ? '翻一张牌' : '等待当前玩家翻牌') }}
        </button>
      </div>
      <div class="participants">
        <div class="p-title">已确定参与者（{{ state.participants.length }}）</div>
        <div class="p-list">
          <span v-for="p in state.participants" :key="p.playerId" class="p-chip" :class="p.source">{{ p.playerName }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  state: any | null
  myId?: string
  isAdmin?: boolean
  canDeal?: boolean
}>()

const emit = defineEmits<{ (e: 'deal'): void; (e: 'draw'): void }>()

const currentDrawer = computed(() => {
  if (!props.state) return null
  return (props.state.drawerOrder || [])[props.state.drawerIndex] || null
})

const canDraw = computed(() => {
  if (!props.state) return false
  if (props.state.drawerIndex >= (props.state.drawerOrder || []).length) return false
  return !!props.isAdmin || currentDrawer.value?.playerId === props.myId
})

function onCardClick() {
  if (canDraw.value) emit('draw')
}
</script>

<style scoped>
.veto-card-draw { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 12px; padding: 18px; }
.deal-row { display: flex; align-items: center; gap: 12px; }
.hint { color: #888; font-size: 13px; }
.draw-info { color: #ccc; font-size: 14px; margin-bottom: 12px; }
.draw-info strong { color: #00ff88; }
.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 8px; margin-bottom: 14px; }
.card { aspect-ratio: 2/3; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: linear-gradient(160deg, #1c1c46, #12122e); border: 1px solid #00ff8833; color: #e0e0ff; font-size: 12px; text-align: center; padding: 4px; }
.card.flipped { background: linear-gradient(160deg, #0a2e1a, #0f0f2e); border-color: #00ff88; color: #00ff88; font-weight: 700; }
.card.clickable { cursor: pointer; }
.card.clickable:hover { border-color: #00ff88; transform: translateY(-2px); }
.card-back { font-size: 30px; opacity: 0.6; }
.card-name { word-break: break-all; }
.draw-actions { margin-bottom: 12px; }
.participants { border-top: 1px solid #ffffff10; padding-top: 12px; }
.p-title { color: #8a8aa5; font-size: 12px; margin-bottom: 8px; }
.p-list { display: flex; flex-wrap: wrap; gap: 6px; }
.p-chip { padding: 3px 10px; border-radius: 10px; font-size: 12px; background: #00ff8815; color: #00ff88; }
.p-chip.default { background: #ffaa0015; color: #ffaa00; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.bb-btn:hover:not(:disabled) { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-primary { border-color: #00ff88; background: #00ff8822; }
</style>
