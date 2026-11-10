<template>
  <div class="pd-spectator">
    <div class="pds-header">
      <span v-if="board.phase !== 'seat'" class="pds-round">第 {{ board.round }} 轮</span>
      <span v-else class="pds-round">比赛准备</span>
      <span v-if="board.phase !== 'seat'" class="pds-dealer">庄家：{{ board.dealerName }}</span>
      <span class="pds-phase" :class="board.phase">{{ phaseLabel }}</span>
      <span class="pds-timer" :class="{ urgent: board.secondsLeft <= 5 }">⏱ {{ board.secondsLeft }}s</span>
      <span class="pds-alive">存活 {{ board.aliveCount }} 人</span>
    </div>

    <!-- 选座阶段 -->
    <div v-if="board.phase === 'seat'" class="pds-wheel-wrap">
      <div class="pds-turntable">
        <div class="pds-disc seat-disc"></div>
        <div class="pds-hub">
          <div class="pds-hub-label">自由选座</div>
          <div class="pds-hub-value">{{ chosenSeatCount }}/{{ (board.seats || []).length }}</div>
        </div>
        <div
          v-for="s in board.seats || []"
          :key="s.seat"
          class="pds-seat-pick"
          :class="{ taken: !!s.playerId }"
          :style="ringStyle(s.seat, (board.seats || []).length)"
        >
          <span class="pds-seat-pick-no">座位 {{ s.seat + 1 }}</span>
          <span v-if="s.playerName" class="pds-seat-pick-name">{{ s.playerName }}</span>
          <span v-else class="pds-seat-pick-empty">空位</span>
        </div>
      </div>
      <div class="pds-pick-order">
        <span class="pds-pick-label">选座顺序：</span>
        <span
          v-for="(n, i) in board.seatPickOrderNames || []"
          :key="i"
          class="pds-pick-item"
          :class="{ current: i === board.seatPickIndex, done: i < board.seatPickIndex }"
        >{{ n }}</span>
      </div>
      <div v-if="board.currentSeatChooserId" class="pds-turn">
        当前选座：<strong>{{ nameOf(board.currentSeatChooserId) }}</strong>
      </div>
    </div>

    <!-- 转盘阶段 -->
    <template v-else>
      <div class="pds-wheel-wrap">
        <div class="pds-turntable">
          <div class="pds-disc" :style="{ transform: `rotate(${wheelRotationDeg}deg)` }">
            <div v-for="(cup, i) in wheelCups" :key="i" class="pds-arm" :style="{ transform: `rotate(${i * wheelStepDeg}deg)` }">
              <div class="pds-cup" :class="{ poison: !!cup && cup.poison, empty: !cup }">
                <span v-if="cup">{{ cup.emoji }}</span>
                <span v-else>·</span>
              </div>
            </div>
          </div>
          <div class="pds-hub">
            <div class="pds-hub-label">转盘</div>
            <div class="pds-hub-value">{{ board.currentRotation || 0 }} 格</div>
          </div>
          <div
            v-for="(p, i) in wheelSeats"
            :key="p.playerId"
            class="pds-seat"
            :class="{ dead: !p.alive, dealer: p.isDealer, turn: p.playerId === board.currentActorId }"
            :style="ringStyle(i, wheelSeats.length)"
          >
            <div class="pds-seat-name">{{ p.playerName }}<span v-if="p.isDealer" class="pds-crown">👑</span></div>
            <div class="pds-seat-hp">{{ '❤️'.repeat(Math.max(0, p.hp)) || '💀' }}</div>
            <div v-if="cupAtSeat(i)" class="pds-seat-cup" :class="{ poison: !!cupAtSeat(i)?.poison }">
              <span>{{ cupAtSeat(i)?.emoji }}</span>
              <span class="pds-seat-cup-name">{{ cupAtSeat(i)?.name }}</span>
              <span v-if="cupAtSeat(i)?.poison" class="pds-poison">☠️</span>
            </div>
            <div v-if="!p.alive" class="pds-out">已淘汰</div>
          </div>
        </div>
        <div v-if="board.phase === 'rotate'" class="pds-turn">
          <template v-if="board.currentActorId">当前行动：<strong>{{ nameOf(board.currentActorId) }}</strong></template>
          <template v-else>正在结算…</template>
        </div>
        <div v-else-if="board.phase === 'assign'" class="pds-turn">
          庄家正在分配酒杯（毒酒位置管理员可见）
        </div>
      </div>

      <!-- 本轮酒杯池 -->
      <div v-if="board.phase === 'assign'" class="pds-cups">
        <span v-for="c in board.cups || []" :key="c.id" class="pds-cup-chip" :class="{ poison: c.poison }">
          {{ c.emoji }} {{ c.name }}<span v-if="c.poison" class="pds-poison">☠️</span>
        </span>
      </div>

      <!-- 已公开的旋转选择 -->
      <div v-if="board.rotationHistory && board.rotationHistory.length" class="pds-history">
        <div class="pds-history-title">已公开的选择</div>
        <div class="pds-history-list">
          <span v-for="(h, i) in board.rotationHistory" :key="i" class="pds-history-item" :class="{ auto: h.auto }">
            <b>{{ i + 1 }}. {{ h.playerName }}</b> +{{ h.rotation }} 格 → 转盘 {{ h.cumulativeRotation }} 格
          </span>
        </div>
      </div>

      <!-- 结算结果 -->
      <div v-if="board.phase === 'reveal' && board.lastResult" class="pds-reveal">
        <div class="pds-reveal-title">第 {{ board.lastResult.round }} 轮结算 · 转盘累计 {{ board.lastResult.totalRotation }} 格</div>
        <div class="pds-reveal-list">
          <div
            v-for="r in board.lastResult.rows"
            :key="r.playerId"
            class="pds-reveal-row"
            :class="{ poison: r.poison, out: r.eliminated }"
          >
            <span class="pds-rr-name">{{ r.playerName }}</span>
            <span class="pds-rr-cup">{{ r.emoji }} {{ r.drinkName }}</span>
            <span class="pds-rr-tag" :class="r.poison ? 'bad' : 'good'">{{ r.poison ? '☠️ 毒酒' : '✅ 安全' }}</span>
            <span class="pds-rr-hp">{{ r.hpBefore }} → {{ r.hpAfter }}</span>
            <span v-if="r.eliminated" class="pds-rr-out">出局</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ board: any }>()

const phaseLabel = computed(() => ({
  seat: '自由选座',
  assign: '庄家分配酒杯',
  rotate: '转盘操作',
  reveal: '结算中',
  finished: '已结束'
} as Record<string, string>)[props.board?.phase] || props.board?.phase || '')

const revealActive = computed(() => props.board?.phase === 'reveal' || !!props.board?.finished)
const chosenSeatCount = computed(() => (props.board?.seats || []).filter((s: any) => s.playerId).length)

const wheelSeats = computed<any[]>(() => {
  const rows = props.board?.lastResult?.rows
  if (revealActive.value && Array.isArray(rows) && rows.length) {
    const ids = new Set(rows.map((r: any) => r.playerId))
    const list = (props.board?.players || []).filter((p: any) => ids.has(p.playerId))
    if (list.length) return list
  }
  return (props.board?.players || []).filter((p: any) => p.alive)
})

const wheelStepDeg = computed(() => wheelSeats.value.length ? 360 / wheelSeats.value.length : 0)
const wheelRotationDeg = computed(() => {
  if (props.board?.phase === 'assign') return 0
  const raw = (props.board?.rotationHistory || []).reduce((sum: number, h: any) => sum + (Number(h.rotation) || 0), 0)
  return raw * wheelStepDeg.value
})

const cupMap = computed<Map<string, any>>(() => new Map<string, any>(
  (props.board?.cups || []).map((c: any) => [c.id, c] as [string, any])
))

const wheelCups = computed<any[]>(() => {
  const seats = wheelSeats.value
  if (props.board?.phase === 'assign') {
    return seats.map((_: any, i: number) => (props.board.cups || [])[i] || null)
  }
  return seats.map((p: any) => {
    const cid = props.board?.assignments?.[p.playerId]
    return cid ? (cupMap.value.get(cid) || null) : null
  })
})

function cupAtSeat(i: number): any {
  const seats = wheelSeats.value
  const n = seats.length
  if (!n) return null
  const rotation = props.board?.phase === 'assign' ? 0 : (props.board?.currentRotation || 0)
  const sourceIndex = ((i - rotation) % n + n) % n
  const pid = seats[sourceIndex]?.playerId
  const cid = pid ? props.board?.assignments?.[pid] : null
  return cid ? (cupMap.value.get(cid) || null) : null
}

function ringStyle(index: number, total: number) {
  const angle = (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2
  const radius = 41
  return {
    left: `${50 + radius * Math.cos(angle)}%`,
    top: `${50 + radius * Math.sin(angle)}%`
  }
}

function nameOf(pid: string | null | undefined) {
  if (!pid) return ''
  const p = (props.board?.players || []).find((x: any) => x.playerId === pid)
  return p ? p.playerName : pid
}
</script>

<style scoped>
.pd-spectator {
  background: #120a22;
  border: 1px solid #b39bff22;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
}
.pds-header { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 13px; color: #a99bd0; }
.pds-round { color: #ece7fb; font-weight: 600; }
.pds-dealer { color: #e6c988; }
.pds-phase { padding: 2px 10px; border-radius: 999px; font-size: 12px; background: #b39bff1a; color: #b39bff; }
.pds-phase.seat { background: #e6c9881a; color: #e6c988; }
.pds-phase.rotate { background: #00c8ff1a; color: #7fd8ff; }
.pds-phase.reveal, .pds-phase.finished { background: #e6c9881a; color: #e6c988; }
.pds-timer { font-weight: 700; color: #b3a6d6; }
.pds-timer.urgent { color: #ff4444; }
.pds-alive { margin-left: auto; font-size: 12px; color: #8f83b8; }

.pds-wheel-wrap { max-width: 520px; margin: 0 auto; }
.pds-turntable { position: relative; width: 100%; aspect-ratio: 1; margin: 0 auto; }
.pds-disc {
  position: absolute; inset: 16%; border-radius: 50%;
  border: 3px solid #b39bff55;
  background:
    repeating-conic-gradient(from 0deg, #241640 0deg 12deg, #1a1030 12deg 24deg),
    radial-gradient(circle at 50% 45%, #2b1b50, #10081f);
  box-shadow: inset 0 0 46px #00000099, 0 0 32px #b39bff22;
  transition: transform 0.65s cubic-bezier(0.22, 0.85, 0.25, 1);
  z-index: 1;
}
.pds-disc.seat-disc { opacity: 0.75; }
.pds-arm { position: absolute; inset: 0; }
.pds-cup {
  position: absolute; left: 50%; top: 3%; transform: translateX(-50%);
  width: 42px; height: 42px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; background: #24163f; border: 1px solid #b39bff66;
  box-shadow: 0 2px 10px #00000088;
}
.pds-cup.poison { border-color: #ff4444; background: #3a1620; box-shadow: 0 0 16px #ff444488; }
.pds-cup.empty { opacity: 0.22; }
.pds-hub {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 26%; aspect-ratio: 1; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #3a2568, #140b26);
  border: 2px solid #b39bff66;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  z-index: 2; box-shadow: 0 0 26px #b39bff33;
}
.pds-hub-label { font-size: 11px; color: #a99bd0; }
.pds-hub-value { font-size: 18px; font-weight: 800; color: #e6c988; }

.pds-seat {
  position: absolute; transform: translate(-50%, -50%);
  width: 92px; padding: 4px 6px; border-radius: 9px;
  background: #1b1130ee; border: 1px solid #ffffff18;
  text-align: center; z-index: 3;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.pds-seat.dealer { border-color: #e6c98877; }
.pds-seat.turn { border-color: #00c8ff; box-shadow: 0 0 0 2px #00c8ff44, 0 0 18px #00c8ff55; }
.pds-seat.dead { opacity: 0.65; border-color: #ff444488; background: #2a1420ee; }
.pds-seat-name { font-size: 11px; color: #ece7fb; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pds-crown { margin-left: 2px; }
.pds-seat-hp { font-size: 10px; letter-spacing: -1px; }
.pds-seat-cup {
  display: flex; align-items: center; justify-content: center; gap: 3px; margin-top: 2px;
  font-size: 11px; color: #e0d7ff; background: #ffffff08; border-radius: 5px; padding: 1px 3px;
}
.pds-seat-cup-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 58px; }
.pds-seat-cup.poison { color: #ff8f8f; background: #ff44441a; }
.pds-poison { font-size: 10px; color: #ff6b6b; }
.pds-out { margin-top: 2px; font-size: 10px; color: #ff6b6b; font-weight: 700; }

.pds-seat-pick {
  position: absolute; transform: translate(-50%, -50%);
  width: 88px; min-height: 58px; padding: 6px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  border-radius: 10px; background: #1b1130ee; border: 1px solid #ffffff18;
  color: #b3a6d6; z-index: 3;
}
.pds-seat-pick.taken { background: #ffffff0a; color: #cfc4ea; }
.pds-seat-pick-no { font-size: 10px; color: #8f83b8; }
.pds-seat-pick-name { font-size: 13px; font-weight: 700; color: #e0d7ff; max-width: 76px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pds-seat-pick-empty { font-size: 11px; color: #6b5f92; }

.pds-pick-order { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; justify-content: center; }
.pds-pick-label { font-size: 12px; color: #8f83b8; }
.pds-pick-item { font-size: 12px; color: #cfc4ea; background: #ffffff08; border: 1px solid #ffffff12; border-radius: 999px; padding: 2px 9px; }
.pds-pick-item.done { opacity: 0.5; text-decoration: line-through; }
.pds-pick-item.current { color: #00c8ff; border-color: #00c8ff66; background: #00c8ff14; font-weight: 700; }
.pds-turn { margin-top: 10px; text-align: center; font-size: 13px; color: #b3a6d6; }
.pds-turn strong { color: #00c8ff; }

.pds-cups { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; justify-content: center; }
.pds-cup-chip { font-size: 12px; color: #e0d7ff; background: #ffffff08; border: 1px solid #ffffff14; border-radius: 8px; padding: 5px 9px; }
.pds-cup-chip.poison { border-color: #ff444466; background: #ff444414; }

.pds-history { margin-top: 12px; border-top: 1px dashed #ffffff14; padding-top: 8px; }
.pds-history-title { font-size: 12px; color: #8f83b8; margin-bottom: 6px; }
.pds-history-list { display: flex; flex-wrap: wrap; gap: 6px; }
.pds-history-item { font-size: 12px; color: #cfc4ea; background: #ffffff08; border: 1px solid #ffffff12; border-radius: 999px; padding: 3px 9px; }
.pds-history-item b { color: #e6c988; }
.pds-history-item.auto { border-color: #e6c98844; color: #e6c988; }

.pds-reveal { margin-top: 12px; }
.pds-reveal-title { font-size: 13px; color: #e6c988; margin-bottom: 8px; }
.pds-reveal-list { display: flex; flex-direction: column; gap: 6px; }
.pds-reveal-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 8px 10px; background: #ffffff06; border: 1px solid #ffffff12; border-radius: 8px; font-size: 12.5px; color: #ddd; }
.pds-reveal-row.poison { border-color: #ff444466; background: #ff444410; }
.pds-reveal-row.out { opacity: 0.65; }
.pds-rr-name { font-weight: 600; min-width: 64px; }
.pds-rr-cup { color: #e0d7ff; }
.pds-rr-tag { padding: 1px 8px; border-radius: 999px; font-size: 12px; }
.pds-rr-tag.bad { color: #ff6b6b; background: #ff44441a; }
.pds-rr-tag.good { color: #7ee0a0; background: #7ee0a01a; }
.pds-rr-hp { color: #e6c988; }
.pds-rr-out { color: #ff6b6b; margin-left: auto; }
@media (max-width: 560px) {
  .pds-seat { width: 74px; padding: 3px 4px; }
  .pds-seat-pick { width: 72px; min-height: 52px; padding: 4px; }
  .pds-seat-name { font-size: 10px; }
  .pds-seat-cup-name { max-width: 42px; }
  .pds-cup { width: 34px; height: 34px; font-size: 18px; }
  .pds-hub-value { font-size: 14px; }
}
</style>
