<template>
  <div class="song-rating-detail">
    <div class="srd-tags">
      <span class="srd-tag">🎲 难度 {{ difficulty }} 面骰</span>
      <span class="srd-tag">⚠️ 风险值 {{ risk }}</span>
      <span class="srd-tag">🎤 基准V {{ baseVocal }}</span>
      <span class="srd-tag">💃 基准D {{ baseDance }}</span>
      <span class="srd-tag main">★ 主属性 {{ mainAttrLabel }}</span>
    </div>

    <div class="srd-current">
      你的当前主属性值：<strong>{{ currentMainValue }}</strong>
      <span v-if="currentRange">（评级概率：{{ fmtRow(currentRange.probs) }}）</span>
    </div>

    <div class="srd-table-wrap">
      <div class="srd-table-title">主属性区间 → 评级概率（其余属性按你当前数值）</div>
      <table class="srd-table">
        <thead>
          <tr>
            <th>{{ mainAttrLabel }}区间</th>
            <th class="col-s">S</th>
            <th class="col-a">A</th>
            <th class="col-b">B</th>
            <th class="col-c">C</th>
            <th class="col-d">D</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(r, i) in ranges"
            :key="i"
            :class="{ highlight: currentMainValue >= r.from && currentMainValue <= r.to }"
          >
            <td class="range">{{ r.from }} ~ {{ r.to }}</td>
            <td class="col-s">{{ r.probs.S ? pct(r.probs.S) : '-' }}</td>
            <td class="col-a">{{ r.probs.A ? pct(r.probs.A) : '-' }}</td>
            <td class="col-b">{{ r.probs.B ? pct(r.probs.B) : '-' }}</td>
            <td class="col-c">{{ r.probs.C ? pct(r.probs.C) : '-' }}</td>
            <td class="col-d">{{ r.probs.D ? pct(r.probs.D) : '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { mainAttrRatingRanges, computeRatingFaces, pct, type Attrs, type SongLike } from '../../utils/songRating'

const props = defineProps<{
  song: SongLike | null | undefined
  attributes?: Attrs
}>()

const attrs = computed<Attrs>(() => props.attributes || { vocal: 0, dance: 0, charm: 0 })

const info = computed(() => computeRatingFaces(attrs.value, props.song || {}))

const difficulty = computed(() => info.value.difficulty)
const risk = computed(() => info.value.risk)
const baseVocal = computed(() => info.value.baseVocal)
const baseDance = computed(() => info.value.baseDance)
const mainAttr = computed(() => info.value.mainAttr)
const mainAttrLabel = computed(() => ({ vocal: '🎤 声乐', dance: '💃 舞蹈', charm: '✨ 魅力' }[mainAttr.value] || mainAttr.value))
const currentMainValue = computed(() => attrs.value[mainAttr.value] ?? 0)

const rangeData = computed(() => mainAttrRatingRanges(props.song || {}, attrs.value, Math.max(120, currentMainValue.value + 20)))
const ranges = computed(() => rangeData.value.ranges)
const currentRange = computed(() => ranges.value.find(r => currentMainValue.value >= r.from && currentMainValue.value <= r.to) || null)

function fmtRow(p: { S: number; A: number; B: number; C: number; D: number }): string {
  const parts: string[] = []
  if (p.S) parts.push(`S ${pct(p.S)}`)
  if (p.A) parts.push(`A ${pct(p.A)}`)
  if (p.B) parts.push(`B ${pct(p.B)}`)
  if (p.C) parts.push(`C ${pct(p.C)}`)
  if (p.D) parts.push(`D ${pct(p.D)}`)
  return parts.join(' / ')
}
</script>

<style scoped lang="scss">
.song-rating-detail {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(102, 126, 234, 0.06);
  border: 1px solid rgba(102, 126, 234, 0.18);
}
.srd-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.srd-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--hover-bg, #f2f3f8);
  color: var(--text-secondary, #555);
  &.main { background: rgba(255, 193, 7, 0.18); color: #b8860b; font-weight: 700; }
}
.srd-current {
  font-size: 12px;
  color: var(--text-secondary, #555);
  margin-bottom: 8px;
  strong { color: #667eea; }
}
.srd-table-wrap { overflow-x: auto; }
.srd-table-title { font-size: 12px; color: var(--text-tertiary, #999); margin-bottom: 6px; }
.srd-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  th, td { padding: 4px 6px; text-align: center; border-bottom: 1px solid var(--border-color, #eee); }
  th { color: var(--text-tertiary, #999); font-weight: 600; }
  td.range { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--text-primary, #333); }
  tbody tr.highlight { background: rgba(255, 193, 7, 0.16); font-weight: 700; }
  .col-s { color: #e67e22; }
  .col-a { color: #27ae60; }
  .col-b { color: #2980b9; }
  .col-c { color: #f39c12; }
  .col-d { color: #e74c3c; }
}
</style>
