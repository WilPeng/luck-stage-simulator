<template>
  <div class="jigsaw-spectator">
    <div class="js-head">
      <span class="js-title">🧩 全体选手盘面</span>
      <span class="js-meta">{{ board?.size || 5 }}×{{ board?.size || 5 }} · {{ board?.imageUrl ? '图片拼图' : '数字拼图' }}</span>
    </div>

    <div class="js-grid">
      <div
        v-for="p in board?.players || []"
        :key="p.playerId"
        class="js-player"
        :class="{ done: p.done, cooling: p.cooldownRemaining > 0 }"
      >
        <div class="js-p-head">
          <BBAvatar :name="p.playerName" size="sm" />
          <span class="js-name">{{ p.playerName }}</span>
          <span v-if="p.done" class="js-status done">✅ 完成</span>
          <span v-else-if="p.cooldownRemaining > 0" class="js-status cooling">⏳ {{ p.cooldownRemaining }}s</span>
          <span v-else class="js-status">{{ p.placed }}/{{ p.total }}</span>
        </div>

        <div class="js-board" :style="boardStyle">
          <div
            v-for="(piece, pos) in (p.order || [])"
            :key="pos"
            class="js-cell"
            :style="cellStyle(piece)"
          >
            <span v-if="!board?.imageUrl" class="js-num">{{ piece + 1 }}</span>
          </div>
        </div>

        <div class="js-progress">
          <div class="js-fill" :style="{ width: pct(p) + '%' }"></div>
        </div>
      </div>
      <div v-if="!(board?.players || []).length" class="js-empty">暂无选手盘面</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BBAvatar from '../BBAvatar.vue'

const props = defineProps<{ board: any }>()

const size = computed(() => Number(props.board?.size) || 5)

const IMG = computed(() => {
  const u = props.board?.imageUrl || ''
  return u ? `url(${toAbsolute(u)})` : 'none'
})
const boardStyle = computed(() => ({
  backgroundImage: IMG.value,
  gridTemplateColumns: `repeat(${size.value}, 1fr)`
}))

function toAbsolute(u: string): string {
  if (/^https?:\/\//.test(u)) return u
  const base = ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || '/api'
  const root = base.replace(/\/api$/, '')
  return `${root}${u.startsWith('/') ? '' : '/'}${u}`
}

function cellStyle(piece: number) {
  if (!props.board?.imageUrl) return { background: `hsl(${(piece * 37) % 360} 55% 45%)` }
  const n = size.value
  const col = piece % n
  const row = Math.floor(piece / n)
  const pct = 100 / Math.max(1, n - 1)
  return {
    backgroundImage: IMG.value,
    backgroundSize: `${n * 100}% ${n * 100}%`,
    backgroundPosition: `${col * pct}% ${row * pct}%`
  }
}

function pct(p: any) {
  const total = Number(p?.total) || (size.value * size.value)
  const placed = Number(p?.placed) || 0
  return total > 0 ? Math.min(100, Math.round((placed / total) * 100)) : 0
}
</script>

<style scoped>
.jigsaw-spectator {
  background: #120a22;
  border: 1px solid #b39bff22;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
}
.js-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.js-title { font-size: 14px; font-weight: 700; color: #b39bff; }
.js-meta { font-size: 12px; color: #8f83b8; }
.js-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.js-player { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 10px; padding: 9px; }
.js-player.done { border-color: #e6c988; background: #e6c9880e; }
.js-player.cooling { border-color: #ff444455; }
.js-p-head { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; min-width: 0; }
.js-name { flex: 1; font-size: 12.5px; color: #ece7fb; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.js-status { font-size: 11px; color: #b3a6d6; white-space: nowrap; }
.js-status.done { color: #e6c988; font-weight: 700; }
.js-status.cooling { color: #ff6b6b; }
.js-board { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px; width: 100%; aspect-ratio: 1; background: #000; border-radius: 6px; overflow: hidden; }
.js-cell { position: relative; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center; }
.js-num { font-size: 9px; color: #ffffffcc; font-weight: 700; }
.js-progress { height: 4px; background: #ffffff12; border-radius: 2px; overflow: hidden; margin-top: 7px; }
.js-fill { height: 100%; background: linear-gradient(90deg, #b39bff, #e6c988); transition: width 0.25s ease; }
.js-empty { color: #6b5f92; font-size: 13px; padding: 20px; grid-column: 1 / -1; text-align: center; }
@media (max-width: 560px) {
  .js-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
}
</style>
