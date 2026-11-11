<template>
  <div class="mm-replay">
    <div class="mmr-overview">
      <div class="mmr-rules">
        <span class="mmr-rules-title">比赛规则</span>
        4×4 共 {{ totalPairs }} 对卡片，翻开两张相同图案即可配对；完成全部 {{ totalPairs }} 对后，用时最短者获胜。
      </div>

      <table class="mmr-table">
        <thead>
          <tr>
            <th>名次</th>
            <th>选手</th>
            <th>配对</th>
            <th>翻牌次数</th>
            <th>用时</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in sortedPlayers" :key="p.playerId">
            <td>{{ i + 1 }}</td>
            <td class="mmr-name">
              <BBAvatar :name="p.playerName" size="sm" />
              <span>{{ p.playerName }}</span>
            </td>
            <td class="mmr-pairs">{{ p.matchedPairs }}/{{ p.totalPairs }}</td>
            <td>{{ p.moves }}</td>
            <td>{{ p.done ? fmtDur(p.durationMs) : '-' }}</td>
            <td :class="p.done ? 'mmr-ok' : 'mmr-bad'">{{ p.done ? '已完成' : '未完成' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 每位选手的完整盘面与翻牌过程 -->
    <div v-for="p in sortedPlayers" :key="'detail-' + p.playerId" class="mmr-player">
      <div class="mmr-p-head">
        <BBAvatar :name="p.playerName" size="sm" />
        <span class="mmr-p-name">{{ p.playerName }}</span>
        <span class="mmr-p-stats">配对 {{ p.matchedPairs }}/{{ p.totalPairs }} · {{ p.moves }} 次翻牌</span>
        <span v-if="p.done" class="mmr-p-time">用时 {{ fmtDur(p.durationMs) }}</span>
      </div>

      <div class="mmr-body">
        <!-- 固定牌面：让复盘者知道这道题的布局 -->
        <div class="mmr-board-wrap">
          <div class="mmr-board-title">牌面布局</div>
          <div class="mmr-board">
            <div
              v-for="(card, idx) in (p.board || [])"
              :key="idx"
              class="mmr-card"
              :class="{ matched: (p.matched || []).includes(idx) }"
            >
              <span class="mmr-emoji">{{ card }}</span>
              <span class="mmr-idx">#{{ idx + 1 }}</span>
            </div>
          </div>
        </div>

        <!-- 每一次翻牌两张牌的过程 -->
        <div class="mmr-history">
          <div class="mmr-board-title">翻牌过程</div>
          <div v-if="(p.history || []).length" class="mmr-hscroll">
            <table class="mmr-table compact">
              <thead>
                <tr>
                  <th>轮次</th>
                  <th>第一张</th>
                  <th>第二张</th>
                  <th>结果</th>
                  <th>用时</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(h, i) in p.history" :key="i" :class="{ good: h.matched, bad: !h.matched }">
                  <td>{{ i + 1 }}</td>
                  <td><span class="mmr-flip">#{{ h.a + 1 }} {{ h.cardA }}</span></td>
                  <td><span class="mmr-flip">#{{ h.b + 1 }} {{ h.cardB }}</span></td>
                  <td :class="h.matched ? 'mmr-ok' : 'mmr-bad'">
                    {{ h.matched ? '✅ 配对成功' : '❌ 未配对' }}
                  </td>
                  <td>{{ fmtOffset(h.at, p.startTime) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="mmr-empty">该选手没有翻牌记录</div>
        </div>
      </div>
    </div>

    <div v-if="!sortedPlayers.length" class="mmr-empty">暂无复盘数据</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BBAvatar from '../BBAvatar.vue'

const props = defineProps<{ meta: any }>()

const totalPairs = computed(() => Number(props.meta?.totalPairs) || 8)

const sortedPlayers = computed(() => {
  const list = [...(props.meta?.players || [])]
  return list.sort((a: any, b: any) => {
    if (!!a.done !== !!b.done) return a.done ? -1 : 1
    const da = a.durationMs == null ? Infinity : a.durationMs
    const db = b.durationMs == null ? Infinity : b.durationMs
    if (da !== db) return da - db
    return (b.matchedPairs || 0) - (a.matchedPairs || 0)
  })
})

function fmtDur(ms: number | null) {
  if (ms == null || !Number.isFinite(ms)) return '-'
  return `${(ms / 1000).toFixed(1)}s`
}
function fmtOffset(at: number, start: number | null) {
  if (!start || !at) return '-'
  const ms = at - start
  if (!Number.isFinite(ms) || ms < 0) return '-'
  return `+${(ms / 1000).toFixed(1)}s`
}
</script>

<style scoped>
.mm-replay { display: flex; flex-direction: column; gap: 14px; }
.mmr-overview { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 10px; padding: 12px; }
.mmr-rules {
  font-size: 13px; color: #b9c6e6; line-height: 1.6; margin-bottom: 10px;
  padding: 8px 10px; background: #b39bff0e; border-left: 3px solid #b39bff; border-radius: 6px;
}
.mmr-rules-title { color: #b39bff; font-weight: 700; margin-right: 8px; }
.mmr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.mmr-table th, .mmr-table td { border: 1px solid #ffffff12; padding: 6px 10px; text-align: center; color: #cfc4ea; }
.mmr-table th { background: #ffffff08; color: #b9c6e6; font-weight: 600; }
.mmr-table td.mmr-name { display: flex; align-items: center; gap: 6px; text-align: left; white-space: nowrap; }
.mmr-pairs { color: #e6c988; font-weight: 700; }
.mmr-ok { color: #7ee0a0; }
.mmr-bad { color: #ff6b6b; }
.mmr-player { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 10px; padding: 12px; }
.mmr-p-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.mmr-p-name { font-size: 15px; color: #ece7fb; font-weight: 700; }
.mmr-p-stats { font-size: 12px; color: #b3a6d6; }
.mmr-p-time { font-size: 12px; color: #e6c988; margin-left: auto; }
.mmr-body { display: grid; grid-template-columns: minmax(160px, 220px) 1fr; gap: 14px; align-items: start; }
.mmr-board-title { font-size: 12px; color: #b39bff; margin-bottom: 6px; font-weight: 600; }
.mmr-board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; }
.mmr-card {
  position: relative; aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; background: #1c1533; border: 1px solid #ffffff14;
}
.mmr-card.matched { border-color: #b39bff; background: #b39bff14; }
.mmr-emoji { font-size: 19px; }
.mmr-idx { position: absolute; right: 2px; bottom: 1px; font-size: 8px; color: #8f83b8; }
.mmr-hscroll { overflow-x: auto; }
.mmr-table.compact th, .mmr-table.compact td { padding: 4px 8px; font-size: 12px; }
.mmr-table tr.good td { background: #7ee0a007; }
.mmr-table tr.bad td { background: #ff6b6b07; }
.mmr-flip { font-weight: 600; color: #e0d7ff; white-space: nowrap; }
.mmr-empty { color: #6b5f92; font-size: 13px; padding: 16px; text-align: center; }
@media (max-width: 700px) {
  .mmr-body { grid-template-columns: 1fr; }
}
</style>
