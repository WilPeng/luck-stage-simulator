<template>
  <div class="minigame abraca">
    <!-- 结算 / 结束 -->
    <div v-if="finished" class="ab-finished">
      <div class="ab-finish-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div v-if="winner" class="ab-winner">{{ winnerName }} 获胜！</div>
      <div class="ab-final-list">
        <div v-for="p in players" :key="p.playerId" class="ab-final-row" :class="{ me: p.playerId === myId }">
          <span>{{ p.name }}</span><span>{{ p.scoreTotal }} 分</span>
        </div>
      </div>
    </div>

    <!-- 等待开始 -->
    <div v-else-if="!gameStarted" class="ab-waiting">
      <div class="ab-finish-icon">🎩</div>
      <h2>出包魔法师</h2>
      <p>猜测自己持有的法术编号并施放，连锁自增，先达到 {{ target || 8 }} 分者获胜！</p>
      <div v-if="countdown > 0" class="ab-countdown">{{ countdown }}</div>
      <p v-else class="ab-wait-text">等待管理员开始比赛...</p>
    </div>

    <template v-else>
      <!-- 顶部状态栏 -->
      <div class="ab-topbar">
        <span class="ab-round">第 {{ state.round }} 轮</span>
        <span class="ab-turn">
          {{ state.phase === 'roundEnd' ? '轮次结算' : state.phase === 'gameOver' ? '比赛结束' : `行动中：${turnPlayerName}` }}
        </span>
        <span v-if="state.phase === 'playing' && turnRemain >= 0" class="ab-timer" :class="{ urgent: turnRemain <= 5 }">⏱ {{ turnRemain }}s</span>
        <span class="ab-net" :class="{ on: connected }">{{ connected ? '已连接' : '连接中' }}</span>
      </div>

      <!-- 轮次结算面板 -->
      <div v-if="state.phase === 'roundEnd' && state.roundResults" class="ab-roundend">
        <h3>第 {{ state.roundResults.round }} 轮结束 · {{ reasonText(state.roundResults.reason) }}</h3>
        <div class="ab-result-table">
          <div class="ab-result-row head">
            <span>玩家</span><span>生命</span><span>猫头鹰</span><span>本轮</span><span>累计</span>
          </div>
          <div v-for="r in state.roundResults.players" :key="r.playerId" class="ab-result-row" :class="{ me: r.playerId === myId, out: !r.alive }">
            <span>{{ r.name }}<em v-if="!r.alive">淘汰</em></span>
            <span>{{ r.hp }}</span>
            <span>{{ r.owls }}</span>
            <span>+{{ r.scoreRound }}</span>
            <span>{{ r.scoreTotal }}</span>
          </div>
        </div>
        <p class="ab-next-hint">即将开始下一轮…</p>
      </div>

      <template v-else>
        <div class="ab-layout">
          <!-- 对手信息区 -->
          <div class="ab-opponents">
            <div v-for="p in opponents" :key="p.playerId" class="ab-player" :class="{ turn: p.isTurn, out: !p.alive, me: p.playerId === myId }">
              <div class="ab-p-head">
                <span class="ab-p-name">{{ p.name }}</span>
                <span class="ab-p-seat">#{{ p.seat + 1 }}</span>
              </div>
              <div class="ab-p-stats">
                <span class="ab-hp">❤ {{ p.hp }}</span>
                <span>🎴 {{ p.handCount }}</span>
                <span v-if="p.owlsCount">🦉 {{ p.owlsCount }}</span>
                <span>⭐ {{ p.scoreTotal }}</span>
              </div>
              <!-- 其他人的正常魔法石编号（可见） -->
              <div class="ab-p-hand">
                <span v-for="(s, i) in (p.hand || [])" :key="i" class="ab-stone small" :class="'s' + s">{{ s }}</span>
                <span v-if="!p.hand || !p.hand.length" class="ab-dim">无石</span>
              </div>
              <div v-if="!p.alive" class="ab-out-tag">已淘汰</div>
            </div>
          </div>

          <!-- 中央魔法塔 -->
          <div class="ab-tower">
            <div class="ab-section-title">🏛 中央魔法塔</div>
            <div class="ab-tower-grid">
              <div v-for="s in state.spells" :key="s.id" class="ab-spell" :class="{ disabled: s.remaining <= 0 }">
                <div class="ab-spell-top">
                  <span class="ab-spell-icon">{{ s.icon }}</span>
                  <span class="ab-spell-id">{{ s.id }}</span>
                </div>
                <div class="ab-spell-name">{{ s.name }}</div>
                <div class="ab-spell-stock">库存 {{ s.remaining }}<span class="ab-dim"> /{{ s.total }}</span> · 已施 {{ s.cast }}</div>
                <div v-if="s.lastCasterName" class="ab-spell-last">最近：{{ s.lastCasterName }}</div>
              </div>
            </div>
            <div class="ab-recent">
              <span class="ab-recent-title">最近施法：</span>
              <span v-for="(r, i) in (state.recent || []).slice(0, 8)" :key="i" class="ab-recent-item">{{ r.playerName }} → {{ r.spell }}号</span>
              <span v-if="!state.recent || !state.recent.length" class="ab-dim">暂无</span>
            </div>
          </div>

          <!-- 个人区 -->
          <div class="ab-self">
            <div class="ab-section-title">🎴 我的魔法石（背面）</div>
            <div class="ab-my-hand">
              <span v-for="i in (state.me?.handCount || 0)" :key="i" class="ab-stone back">?</span>
              <span v-if="!state.me?.handCount" class="ab-dim">无石</span>
            </div>
            <div class="ab-my-meta">
              <span>❤ 生命 {{ state.me?.hp }}</span>
              <span>🦉 猫头鹰 {{ owlCount }}</span>
              <span>⭐ 累计 {{ state.me?.scoreTotal }}</span>
            </div>
            <div v-if="owlCount" class="ab-my-owls">
              <span class="ab-owl-title">🦉 秘密石（仅你可见）：</span>
              <span v-for="(s, i) in owlStones" :key="i" class="ab-owl-stone" :class="'s' + s" :title="spellTitle(s)">
                {{ spellIcon(s) }} {{ s }}
              </span>
            </div>

            <!-- 当前操作 -->
            <div v-if="state.me?.canCast" class="ab-actions">
              <div class="ab-turn-hint">轮到你了！可选法术（{{ state.me.minSpell }}~8 号）</div>
              <div class="ab-cast-grid">
                <button
                  v-for="s in state.spells"
                  :key="s.id"
                  class="ab-cast-btn"
                  :class="{ disabled: s.id < state.me.minSpell }"
                  :disabled="s.id < state.me.minSpell"
                  @click="askCast(s)"
                >{{ s.icon }} {{ s.id }}号</button>
              </div>
              <button v-if="state.me.canStop" class="ab-stop-btn" @click="doStop">🛑 结束施法</button>
            </div>
            <div v-else class="ab-actions waiting">
              <span v-if="state.phase === 'playing'">等待 {{ turnPlayerName }} 行动…</span>
              <span v-else>等待…</span>
            </div>
          </div>
        </div>

        <!-- 事件记录 -->
        <div class="ab-log">
          <div class="ab-section-title">📜 事件记录</div>
          <div class="ab-log-list">
            <div v-for="(t, i) in (state.log || []).slice(-12).reverse()" :key="i" class="ab-log-item">{{ t }}</div>
          </div>
        </div>
      </template>
    </template>

    <!-- 施法确认 -->
    <div v-if="pendingSpell" class="ab-confirm-overlay" @click.self="pendingSpell = null">
      <div class="ab-confirm">
        <h3>{{ pendingSpell.icon }} {{ pendingSpell.id }} 号 · {{ pendingSpell.name }}</h3>
        <p>{{ pendingSpell.desc }}</p>
        <p class="ab-warn">若你未持有该法术：失去 1 点生命并结束回合。</p>
        <div class="ab-confirm-actions">
          <button class="ab-btn" @click="pendingSpell = null">取消</button>
          <button class="ab-btn primary" @click="doCast">确认施放</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'

const props = defineProps<{ roomId: string; participants: { playerId: string; playerName: string }[]; myId?: string }>()
const emit = defineEmits<{ (e: 'finished', winner: { playerId: string; playerName: string }): void }>()

const bbAuth = useBbAuthStore()
const roomIdRef = ref(props.roomId)
const { gameState, countdown, winner, finished, connected, connect, sendAction, disconnect } = useMinigameSocket(roomIdRef)

const state = computed<any>(() => gameState.value || {})
// 优先用服务端下发的 me.playerId（每个玩家收到的是自己的视图）
const myId = computed(() => state.value.me?.playerId || props.myId || bbAuth.currentUser?.id || '')
const gameStarted = computed(() => state.value.started !== undefined ? !!state.value.started : (state.value.status === 'playing' && state.value.players))
const players = computed<any[]>(() => state.value.players || [])
const opponents = computed<any[]>(() => players.value.filter(p => p.playerId !== myId.value))
const turnPlayerId = computed(() => state.value.turnPlayerId)
const turnPlayerName = computed(() => players.value.find(p => p.playerId === turnPlayerId.value)?.name || '—')
const winnerName = computed(() => players.value.find(p => p.playerId === winner.value?.playerId)?.name || (winner.value as any)?.playerName || '')
const target = computed(() => state.value.target)

// 自己持有的猫头鹰秘密石（服务端仅对本人下发具体编号）
const owlStones = computed<number[]>(() => Array.isArray(state.value.me?.owls) ? state.value.me.owls : [])
const owlCount = computed(() => owlStones.value.length)
function spellIcon(id: number) { const s = (state.value.spells || []).find((x: any) => x.id === id); return s?.icon || '🦉' }
function spellTitle(id: number) { const s = (state.value.spells || []).find((x: any) => x.id === id); return s ? `${s.id} 号 · ${s.name}` : `${id} 号` }

const nowTick = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null
onMounted(() => { clock = setInterval(() => { nowTick.value = Date.now() }, 300) })
onUnmounted(() => { if (clock) clearInterval(clock) })

const turnRemain = computed(() => {
  if (!state.value.turnDeadline) return -1
  return Math.max(0, Math.ceil((state.value.turnDeadline - nowTick.value) / 1000))
})

const pendingSpell = ref<any>(null)
function askCast(s: any) {
  if (!state.value.me?.canCast) return
  if (s.id < (state.value.me?.minSpell || 1)) return
  pendingSpell.value = s
}
function doCast() {
  if (!pendingSpell.value) return
  sendAction({ type: 'cast', spell: pendingSpell.value.id, opId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })
  pendingSpell.value = null
}
function doStop() {
  sendAction({ type: 'stop', opId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })
}

let startSent = false
watch(() => state.value.status, (v) => {
  if (v === 'playing' && !startSent) { startSent = true; sendAction({ type: 'start' }) }
})
watch(finished, (v) => { if (v && winner.value) emit('finished', winner.value) })

function reasonText(r: string) {
  return ({ death: '有玩家被淘汰', lastStanding: '仅剩一名存活玩家', spentAll: '有玩家施放完所有魔法石' } as Record<string, string>)[r] || r
}

onMounted(() => connect())
onUnmounted(() => disconnect())
</script>

<style scoped>
.abraca { width: 100%; max-width: 1100px; margin: 0 auto; padding: clamp(8px, 2vw, 16px); color: #e0e0e0; box-sizing: border-box; }
.ab-waiting, .ab-finished { text-align: center; padding: 40px 16px; }
.ab-finish-icon { font-size: 60px; }
.ab-countdown { font-size: 72px; font-weight: 800; color: #00ff88; margin: 16px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.ab-wait-text { color: #666; }
.ab-winner { font-size: 26px; font-weight: 800; color: #ffaa00; margin: 10px 0; }
.ab-final-list { max-width: 360px; margin: 16px auto; }
.ab-final-row { display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #ffffff14; }
.ab-final-row.me { color: #00ff88; }

.ab-topbar { display: flex; align-items: center; gap: 16px; padding: 10px 14px; background: #0f0f2c; border: 1px solid #ffffff14; border-radius: 10px; margin-bottom: 12px; font-size: 14px; }
.ab-round { color: #00ff88; font-weight: 700; }
.ab-turn { flex: 1; }
.ab-timer { font-weight: 700; color: #00ff88; }
.ab-timer.urgent { color: #ff4444; }
.ab-net { font-size: 12px; color: #888; }
.ab-net.on { color: #00ff88; }

.ab-roundend { background: #141430; border: 1px solid #00ff8833; border-radius: 12px; padding: 18px; }
.ab-roundend h3 { margin: 0 0 14px; color: #00ff88; }
.ab-result-table { display: flex; flex-direction: column; }
.ab-result-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap: 8px; padding: 8px 6px; border-bottom: 1px solid #ffffff12; font-size: 14px; }
.ab-result-row.head { color: #8a8aa5; font-size: 12px; }
.ab-result-row.me { color: #00ff88; }
.ab-result-row.out { opacity: 0.55; }
.ab-result-row em { font-style: normal; color: #ff6b6b; font-size: 11px; margin-left: 6px; }
.ab-next-hint { color: #8a8aa5; font-size: 13px; margin: 12px 0 0; }

.ab-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  grid-template-areas:
    'opp   opp'
    'tower self';
  gap: 12px;
  align-items: start;
}
.ab-opponents { grid-area: opp; }
.ab-tower { grid-area: tower; }
.ab-self { grid-area: self; }
.ab-section-title { font-size: 14px; font-weight: 700; color: #00ff88; margin-bottom: 8px; }

.ab-opponents { display: flex; flex-direction: row; flex-wrap: wrap; gap: 8px; min-width: 0; }
.ab-player { flex: 1 1 180px; min-width: 160px; max-width: 240px; }
.ab-player { background: #0f0f2c; border: 1px solid #ffffff14; border-radius: 10px; padding: 10px; position: relative; }
.ab-player.turn { border-color: #00c8ff; box-shadow: 0 0 0 1px #00c8ff55; }
.ab-player.me { border-color: #00ff8866; }
.ab-player.out { opacity: 0.5; }
.ab-p-head { display: flex; justify-content: space-between; font-size: 14px; font-weight: 600; }
.ab-p-seat { color: #8a8aa5; font-size: 12px; }
.ab-p-stats { display: flex; gap: 10px; font-size: 12px; color: #bdbdd8; margin: 6px 0; }
.ab-hp { color: #ff6b6b; }
.ab-p-hand { display: flex; flex-wrap: wrap; gap: 4px; }
.ab-out-tag { position: absolute; top: 8px; right: 8px; color: #ff4444; font-size: 11px; }

.ab-stone { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; font-weight: 700; font-size: 13px; background: #2a2a55; color: #fff; border: 1px solid #ffffff22; }
.ab-stone.small { width: 22px; height: 22px; font-size: 12px; }
.ab-stone.back { background: linear-gradient(135deg, #3a2a55, #1a1030); color: #9a8ab5; }
.ab-stone.s1 { background: #c0392b; } .ab-stone.s2 { background: #8e44ad; } .ab-stone.s3 { background: #2980b9; } .ab-stone.s4 { background: #d35400; }
.ab-stone.s5 { background: #f1c40f; color: #222; } .ab-stone.s6 { background: #16a085; } .ab-stone.s7 { background: #e67e22; } .ab-stone.s8 { background: #27ae60; }

.ab-tower { background: #0f0f2c; border: 1px solid #ffffff14; border-radius: 10px; padding: 12px; }
.ab-tower-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.ab-spell { background: #141430; border: 1px solid #ffffff14; border-radius: 8px; padding: 8px; }
.ab-spell.disabled { opacity: 0.45; }
.ab-spell-top { display: flex; justify-content: space-between; align-items: center; }
.ab-spell-icon { font-size: 20px; }
.ab-spell-id { color: #00ff88; font-weight: 800; }
.ab-spell-name { font-size: 13px; font-weight: 600; margin: 2px 0; }
.ab-spell-stock { font-size: 11px; color: #8a8aa5; }
.ab-spell-last { font-size: 11px; color: #bdbdd8; margin-top: 2px; }
.ab-recent { margin-top: 10px; font-size: 12px; color: #bdbdd8; }
.ab-recent-title { color: #8a8aa5; }
.ab-recent-item { display: inline-block; margin-right: 10px; }
.ab-dim { color: #666; }

.ab-self { background: #0f0f2c; border: 1px solid #ffffff14; border-radius: 10px; padding: 12px; }
.ab-my-hand { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.ab-my-hand .ab-stone.back { width: 34px; height: 46px; font-size: 18px; }
.ab-my-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 13px; color: #bdbdd8; margin-bottom: 10px; }
.ab-my-owls { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 12px; }
.ab-owl-title { font-size: 12px; color: #d8b25a; }
.ab-owl-stone { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 8px; font-size: 12px; font-weight: 700; color: #fff; border: 1px solid #ffaa0055; background: #3a2a55; }
.ab-owl-stone.s1 { background: #c0392b; } .ab-owl-stone.s2 { background: #8e44ad; } .ab-owl-stone.s3 { background: #2980b9; } .ab-owl-stone.s4 { background: #d35400; }
.ab-owl-stone.s5 { background: #f1c40f; color: #222; } .ab-owl-stone.s6 { background: #16a085; } .ab-owl-stone.s7 { background: #e67e22; } .ab-owl-stone.s8 { background: #27ae60; }
.ab-actions { border-top: 1px solid #ffffff14; padding-top: 12px; }
.ab-turn-hint { color: #00ff88; font-size: 13px; margin-bottom: 8px; }
.ab-cast-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.ab-cast-btn { padding: 10px; border: 2px solid #00ff8833; border-radius: 8px; background: #0a1a1044; color: #e0e0e0; cursor: pointer; font-size: 14px; }
.ab-cast-btn:hover:not(.disabled) { border-color: #00ff88; }
.ab-cast-btn.disabled { opacity: 0.35; cursor: not-allowed; }
.ab-stop-btn { width: 100%; margin-top: 8px; padding: 10px; border: 1px solid #ffaa0066; border-radius: 8px; background: #ffaa0022; color: #ffaa00; cursor: pointer; font-weight: 600; }
.ab-actions.waiting { color: #8a8aa5; font-size: 13px; }

.ab-log { margin-top: 12px; background: #0f0f2c; border: 1px solid #ffffff14; border-radius: 10px; padding: 12px; }
.ab-log-list { max-height: 160px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #bdbdd8; }
.ab-log-item { padding: 2px 0; border-bottom: 1px dashed #ffffff0e; }

.ab-confirm-overlay { position: fixed; inset: 0; background: #000000aa; display: flex; align-items: center; justify-content: center; z-index: 1000; }
.ab-confirm { background: #141430; border: 1px solid #00ff8855; border-radius: 12px; padding: 20px; width: 340px; }
.ab-confirm h3 { margin: 0 0 8px; color: #00ff88; }
.ab-confirm p { font-size: 14px; color: #cfcfe6; margin: 4px 0; }
.ab-warn { color: #ff8866 !important; font-size: 12px !important; }
.ab-confirm-actions { display: flex; gap: 10px; margin-top: 14px; }
.ab-btn { flex: 1; padding: 10px; border: 1px solid #00ff8844; border-radius: 8px; background: transparent; color: #00ff88; cursor: pointer; }
.ab-btn.primary { background: #00ff8822; border-color: #00ff88; }

/* 中等屏幕：保持 塔 + 个人 两列，个人列略窄 */
@media (max-width: 1024px) {
  .ab-layout {
    grid-template-columns: minmax(0, 1fr) 260px;
    grid-template-areas:
      'opp opp'
      'tower self';
  }
}
/* 手机竖屏：单列，对手 → 魔法塔 → 个人 */
@media (max-width: 760px) {
  .ab-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'opp' 'tower' 'self';
  }
  .ab-opponents {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .ab-opponents .ab-player { flex: 0 0 auto; min-width: 150px; max-width: 190px; }
  .ab-tower-grid { grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); }
  .ab-cast-grid { grid-template-columns: repeat(4, 1fr); }
  .ab-result-row { font-size: 12px; grid-template-columns: 1.6fr 1fr 1fr 1fr 1fr; }
  .ab-topbar { flex-wrap: wrap; gap: 8px 12px; }
  .ab-my-hand .ab-stone.back { width: 30px; height: 42px; }
}
@media (max-width: 420px) {
  .ab-tower-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
