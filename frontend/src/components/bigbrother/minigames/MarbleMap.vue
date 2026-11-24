<template>
  <div class="marble-map" :class="{ compact }">
    <svg class="mm-svg" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="xMidYMid meet" role="img" aria-label="弹珠得分地图">
      <defs>
        <radialGradient :id="glowId" cx="50%" cy="100%" r="80%">
          <stop offset="0%" stop-color="#ffe9a8" stop-opacity="0.16" />
          <stop offset="100%" stop-color="#0c0820" stop-opacity="0" />
        </radialGradient>
        <filter :id="shadowId" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0.6" stdDeviation="0.9" flood-color="#000" flood-opacity="0.55" />
        </filter>
      </defs>

      <rect :x="0" :y="0" :width="width" :height="height" class="mm-bg" />
      <rect :x="0" :y="0" :width="width" :height="height" :fill="`url(#${glowId})`" />

      <!-- 不规则区域 -->
      <g class="mm-cells">
        <g v-for="cell in cells" :key="cell.id">
          <polygon
            :points="pointsAttr(cell)"
            :fill="cell.color"
            fill-opacity="0.42"
            :stroke="cell.color"
            stroke-opacity="0.95"
            stroke-width="0.45"
            stroke-linejoin="round"
          />
          <circle :cx="cell.seed.x" :cy="cell.seed.y" r="0.7" :fill="cell.color" fill-opacity="0.9" />
          <text
            :x="cell.seed.x"
            :y="cell.seed.y + 1.4"
            class="mm-score"
            :style="{ fontSize: labelSize(cell.score) + 'px' }"
          >{{ cell.score }}</text>
        </g>
      </g>

      <!-- 落点轨迹 -->
      <line
        v-if="previewPoint"
        :x1="origin.x" :y1="origin.y" :x2="previewPoint.x" :y2="previewPoint.y"
        class="mm-path"
      />

      <!-- 历史落点 -->
      <g class="mm-throws">
        <g v-for="(t, i) in throwList" :key="i">
          <circle
            :cx="t.x" :cy="t.y" r="1.65"
            :fill="t.color || '#ffd166'"
            stroke="#120a22" stroke-width="0.5"
            :filter="`url(#${shadowId})`"
          >
            <title>{{ t.playerName }} · {{ t.score }} 分</title>
          </circle>
          <text :x="t.x" :y="t.y + 0.75" class="mm-throw-score">{{ t.score }}</text>
        </g>
      </g>

      <!-- 发射点 -->
      <circle :cx="origin.x" :cy="origin.y" r="2.6" class="mm-origin-halo" />
      <circle :cx="origin.x" :cy="origin.y" r="1.4" class="mm-origin" />

      <!-- 方向箭头 -->
      <g v-if="aimAngle !== null && aimAngle !== undefined" class="mm-aim">
        <line
          :x1="origin.x" :y1="origin.y" :x2="aimLineEnd.x" :y2="aimLineEnd.y"
          :stroke="activeColor || '#ffd166'" stroke-width="0.9" stroke-linecap="round"
          stroke-opacity="0.95"
        />
        <polygon :points="arrowHead" :fill="activeColor || '#ffd166'" />
        <circle :cx="aimLineEnd.x" :cy="aimLineEnd.y" r="0.7" :fill="activeColor || '#ffd166'" />
      </g>

      <!-- 当前预览落点 -->
      <g v-if="previewPoint" class="mm-preview">
        <circle :cx="previewPoint.x" :cy="previewPoint.y" r="1.9" class="mm-preview-ring" />
        <circle :cx="previewPoint.x" :cy="previewPoint.y" r="0.8" class="mm-preview-dot" />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  map: any
  throws?: any[]
  aimAngle?: number | null
  previewPoint?: { x: number; y: number } | null
  activeColor?: string
  compact?: boolean
}>(), {
  throws: () => [],
  aimAngle: null,
  previewPoint: null,
  activeColor: '',
  compact: false
})

const uid = Math.random().toString(36).slice(2, 9)
const glowId = computed(() => `mm-glow-${uid}`)
const shadowId = computed(() => `mm-shadow-${uid}`)

const width = computed(() => Number(props.map?.width) || 100)
const height = computed(() => Number(props.map?.height) || 100)
const origin = computed(() => props.map?.origin || { x: 50, y: 100 })
const cells = computed(() => props.map?.cells || [])
const throwList = computed(() => (props.throws || []).filter(t => t && Number.isFinite(t.x) && Number.isFinite(t.y)))

function pointsAttr(cell: any) {
  return (cell.points || []).map((p: any) => `${p.x},${p.y}`).join(' ')
}

function labelSize(score: number) {
  return 2.6 + Math.max(0, Math.min(1, (score - 10) / 90)) * 1.8
}

const aimLineEnd = computed(() => {
  const a = Number(props.aimAngle) || 0
  const rad = a * Math.PI / 180
  return {
    x: origin.value.x + Math.sin(rad) * 19,
    y: origin.value.y - Math.cos(rad) * 19
  }
})

const arrowHead = computed(() => {
  const a = Number(props.aimAngle) || 0
  const rad = a * Math.PI / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  const px = Math.cos(rad)
  const py = Math.sin(rad)
  const tip = { x: origin.value.x + dx * 27, y: origin.value.y + dy * 27 }
  const base = { x: origin.value.x + dx * 22, y: origin.value.y + dy * 22 }
  const left = { x: base.x + px * 2.4, y: base.y + py * 2.4 }
  const right = { x: base.x - px * 2.4, y: base.y - py * 2.4 }
  return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`
})
</script>

<style scoped>
.marble-map {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  overflow: hidden;
  background: radial-gradient(circle at 50% 100%, #241a44 0%, #120d24 55%, #0a0716 100%);
  border: 1px solid #b39bff33;
  box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.65), 0 8px 30px rgba(0, 0, 0, 0.35);
}
.mm-svg { display: block; width: 100%; height: 100%; }
.mm-bg { fill: #0e0a1e; }
.mm-score {
  fill: #ffffff;
  font-weight: 800;
  text-anchor: middle;
  dominant-baseline: middle;
  paint-order: stroke;
  stroke: #0b0718;
  stroke-width: 0.8;
  stroke-opacity: 0.65;
  pointer-events: none;
  user-select: none;
}
.mm-throw-score {
  fill: #120a22;
  font-size: 1.8px;
  font-weight: 900;
  text-anchor: middle;
  dominant-baseline: middle;
  pointer-events: none;
  user-select: none;
}
.mm-path {
  stroke: #ffd166;
  stroke-width: 0.42;
  stroke-dasharray: 1.6 1.4;
  stroke-opacity: 0.55;
}
.mm-origin-halo { fill: #ffd16622; }
.mm-origin { fill: #ffd166; stroke: #120a22; stroke-width: 0.4; }
.mm-aim { filter: drop-shadow(0 0 1.2px rgba(255, 209, 102, 0.7)); }
.mm-preview-ring {
  fill: none;
  stroke: #ffffff;
  stroke-width: 0.5;
  stroke-dasharray: 1.2 1.2;
  opacity: 0.85;
}
.mm-preview-dot { fill: #fff8db; }
.marble-map.compact { border-radius: 10px; }
</style>
