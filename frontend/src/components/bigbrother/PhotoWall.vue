<template>
  <div class="photo-wall">
    <div
      v-for="(p, i) in players"
      :key="p.id"
      class="pw-cell"
      :class="[{ out: isOut(p) }, 'hue-' + (i % 6)]"
      :title="p.name"
    >
      <img v-if="p.avatar" :src="p.avatar" class="pw-media" :alt="p.name" />
      <div v-else class="pw-media pw-initial">{{ (p.name || '?').charAt(0) }}</div>
      <span v-if="showNames" class="pw-name">{{ p.name }}</span>
      <div v-if="editable" class="pw-order">
        <button class="pw-btn" :disabled="i === 0" @click.stop="$emit('move', i, -1)">↑</button>
        <button class="pw-btn" :disabled="i === players.length - 1" @click.stop="$emit('move', i, 1)">↓</button>
      </div>
    </div>
    <div v-if="!players.length" class="pw-empty">暂无房客</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ players: any[]; editable?: boolean; showNames?: boolean }>()
defineEmits<{ (e: 'move', index: number, dir: -1 | 1): void }>()

function isOut(p: any) {
  return p.status && p.status !== 'active'
}
</script>

<style scoped>
.photo-wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
  gap: 0;
  border-radius: 8px;
  overflow: hidden;
  width: 100%;
}
.pw-cell {
  position: relative;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border: 1px solid #05050c;
}
/* 旋转的彩色渐变环（仅边框旋转，头像不动） */
.pw-cell::before {
  content: '';
  position: absolute;
  inset: -60%;
  background: conic-gradient(from 0deg, #00ff88, #4488ff, #ff44aa, #ffaa00, #00ff88);
  animation: pwSpin 8s linear infinite;
}
.hue-1::before { background: conic-gradient(from 0deg, #ff44aa, #ffaa00, #00ff88, #4488ff, #ff44aa); animation-duration: 9s; }
.hue-2::before { background: conic-gradient(from 0deg, #4488ff, #00ff88, #ffaa00, #ff44aa, #4488ff); animation-duration: 10s; }
.hue-3::before { background: conic-gradient(from 0deg, #ffaa00, #ff44aa, #4488ff, #00ff88, #ffaa00); animation-duration: 7s; }
.hue-4::before { background: conic-gradient(from 0deg, #00ff88, #ffaa00, #4488ff, #ff44aa, #00ff88); animation-duration: 11s; }
.hue-5::before { background: conic-gradient(from 0deg, #4488ff, #ff44aa, #00ff88, #ffaa00, #4488ff); animation-duration: 8.5s; }
@keyframes pwSpin { to { transform: rotate(360deg); } }
.pw-cell.out::before { background: #3a3a3a; animation: none; }
/* 头像不旋转：静止覆盖在渐变环之上，仅露出细边框 */
.pw-media {
  position: absolute;
  inset: 2px;
  width: calc(100% - 4px);
  height: calc(100% - 4px);
  object-fit: cover;
  z-index: 1;
  background: #0b0b1c;
}
.pw-initial {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #00ff88;
  font-size: 22px;
  font-weight: 700;
}
.pw-cell.out .pw-media { filter: grayscale(1) brightness(0.75); }
.pw-cell.out .pw-initial { color: #888; }
.pw-name {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  z-index: 2;
  font-size: 11px;
  color: #fff;
  background: #000000aa;
  text-align: center;
  padding: 1px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pw-order {
  position: absolute;
  top: 2px; right: 2px;
  z-index: 3;
  display: flex;
  gap: 2px;
}
.pw-btn {
  width: 18px; height: 18px;
  border: 1px solid #ffffff44;
  background: #000000aa;
  color: #fff;
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
  line-height: 1;
}
.pw-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.pw-empty { grid-column: 1 / -1; text-align: center; color: #666; padding: 20px; }
</style>
