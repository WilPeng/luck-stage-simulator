<template>
  <div class="mg-replay">
    <div class="page-header">
      <h1>小游戏复盘</h1>
      <div class="filters">
        <select v-model="filterGameType" class="bb-input" @change="loadList">
          <option value="">全部场景</option>
          <option value="hoh">HOH</option>
          <option value="veto">否决权</option>
          <option value="bbbb">BBBB</option>
          <option value="finale">终局</option>
        </select>
        <button class="bb-btn" @click="loadList">🔄 刷新</button>
        <button v-if="selectedIds.length" class="bb-btn bb-btn-danger" @click="batchDelete">🗑 批量删除（{{ selectedIds.length }}）</button>
      </div>
    </div>

    <div class="replay-layout">
      <div class="list-panel">
        <div class="list-tools" v-if="list.length">
          <label class="sel-all"><input type="checkbox" :checked="allSelected" @change="toggleAll" /> 全选</label>
        </div>
        <div v-if="!list.length" class="empty-hint">暂无复盘记录</div>
        <div
          v-for="r in list"
          :key="r.id"
          class="replay-item"
          :class="{ active: detail && detail.id === r.id }"
          @click="openReplay(r.id)"
        >
          <label class="item-check" @click.stop>
            <input type="checkbox" :value="r.id" v-model="selectedIds" />
          </label>
          <div class="item-main">
            <div class="ri-top">
              <span class="ri-name">{{ r.minigameName || r.minigameId }}</span>
              <span class="ri-type">{{ gameTypeLabel(r.gameType) }}</span>
            </div>
            <div class="ri-meta">
              {{ fmtDate(r.startedAt) }} · {{ r.participants?.length || 0 }}人 · {{ r.eventCount }} 事件
            </div>
            <div class="ri-winner" v-if="r.winner">🏆 {{ r.winner.playerName }}</div>
            <div class="ri-winner none" v-else-if="r.status !== 'playing'">无胜者</div>
          </div>
        </div>
      </div>

      <div class="detail-panel">
        <div v-if="!detail" class="empty-hint">选择左侧对局查看复盘</div>
        <template v-else>
          <div class="detail-head">
            <div>
              <div class="dh-title">{{ detail.minigameName || detail.minigameId }}</div>
              <div class="dh-sub">
                {{ gameTypeLabel(detail.gameType) }} · {{ fmtDate(detail.startedAt) }}
                <span v-if="detail.roundIndex"> · 第{{ detail.roundIndex }}周</span>
                <span v-if="detail.targetScore"> · 目标 {{ detail.targetScore }}</span>
                <span> · 共 {{ (detail.events || []).length }} 条操作 · 时长 {{ durationText }}</span>
              </div>
            </div>
            <button class="bb-btn bb-btn-danger" @click="removeReplay(detail.id)">删除</button>
          </div>

          <!-- 最终战况板 -->
          <div class="dg-block">
            <div class="dg-title">最终战况</div>
            <div class="board-grid">
              <div v-for="p in boardPlayers" :key="p.playerId" class="board-card"
                :class="{ winner: detail.winner && detail.winner.playerId === p.playerId }">
                <div class="board-top">
                  <BBAvatar :name="p.playerName" :avatar="p.avatar" size="sm" />
                  <span class="board-name">{{ p.playerName }}</span>
                  <span v-if="detail.winner && detail.winner.playerId === p.playerId" class="board-crown">🏆</span>
                  <span v-else-if="isEliminated(p.playerId)" class="board-out">出局</span>
                </div>
                <div class="board-stats">
                  <span v-if="fs(p.playerId) && fs(p.playerId).label" class="board-stat">{{ fs(p.playerId).label }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 明牌回放：逐步查看每位选手面临决策时的完整局面 -->
          <div v-if="snapshots.length" class="dg-block">
            <div class="dg-title">明牌回放（{{ snapIndex + 1 }} / {{ snapshots.length }}）</div>
            <div class="snap-controls">
              <button class="bb-btn" :disabled="snapIndex <= 0" @click="snapIndex--">◀ 上一手</button>
              <input class="snap-range" type="range" :min="0" :max="snapshots.length - 1" v-model.number="snapIndex" />
              <button class="bb-btn" :disabled="snapIndex >= snapshots.length - 1" @click="snapIndex++">下一手 ▶</button>
            </div>
            <div class="snap-label">
              {{ curSnap?.label }} · +{{ delta(curSnap?.t) }}s
              <span v-if="curSnap?.data?.round"> · 第{{ curSnap.data.round }}轮</span>
            </div>

            <!-- 出包魔法师：明牌（按快照结构自动识别，无需依赖 meta） -->
            <div v-if="isAbracaSnap" class="ab-board">
              <div v-for="p in (curSnap?.data?.players || [])" :key="p.playerId" class="ab-p"
                :class="{ turn: p.isTurn, dead: !p.alive }">
                <div class="ab-p-head">
                  <BBAvatar :name="p.name" size="sm" />
                  <b>{{ p.name }}</b>
                  <span class="ab-seat">#{{ (p.seat ?? 0) + 1 }}</span>
                  <span v-if="p.isTurn" class="ab-turn">🎯 行动</span>
                  <span v-if="!p.alive" class="ab-dead">出局</span>
                </div>
                <div class="ab-p-stats">❤ {{ p.hp }}/{{ p.maxHp }} · 🦉 {{ p.owls?.length || 0 }} · ⭐ {{ p.scoreTotal }}</div>
                <div class="ab-p-hand">
                  <span v-for="(c, i) in p.hand" :key="i" class="ab-card">{{ c }}</span>
                  <span v-if="!p.hand || !p.hand.length" class="ab-none">无牌</span>
                </div>
              </div>
              <div class="ab-tower">
                <span v-for="s in towerSpellList" :key="s.id" class="ab-tower-item">
                  {{ s.icon }}{{ s.id }} 余 {{ curSnap?.data?.tower?.[s.id]?.remaining ?? 0 }}/{{ curSnap?.data?.tower?.[s.id]?.total ?? '-' }}
                </span>
              </div>
            </div>

            <!-- Stay or Fold：明牌 -->
            <div v-else-if="isSofSnap" class="sof-snap">
              <div class="snap-sub">阶段：{{ phaseLabel(curSnap?.data?.phase) }} · 目标 emoji {{ curSnap?.data?.target }} · 真实数量 {{ curSnap?.data?.trueCount }}</div>
              <table class="meta-table">
                <thead><tr><th>选手</th><th>估算</th><th>选择</th><th>差值</th><th>分数</th><th>状态</th></tr></thead>
                <tbody>
                  <tr v-for="p in detail.participants" :key="p.playerId">
                    <td class="mc-name">{{ p.playerName }}</td>
                    <td>{{ curSnap?.data?.estimates?.[p.playerId] ?? '-' }}</td>
                    <td>{{ curSnap?.data?.decisions?.[p.playerId] || '-' }}</td>
                    <td>{{ curSnap?.data?.diffs?.[p.playerId] ?? '-' }}</td>
                    <td>{{ curSnap?.data?.scores?.[p.playerId] ?? 0 }}</td>
                    <td>{{ curSnap?.data?.eliminated?.includes(p.playerId) ? '淘汰' : (curSnap?.data?.alive?.includes(p.playerId) ? '存活' : '-') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 通用：按快照 players 渲染 -->
            <div v-else-if="genericSnapPlayers.length" class="gen-board">
              <div v-for="p in genericSnapPlayers" :key="p.playerId" class="gen-p"
                :class="{ turn: p.isTurn, dead: p.alive === false }">
                <div class="gen-p-head">
                  <BBAvatar :name="p.name" size="sm" />
                  <b>{{ p.name }}</b>
                  <span v-if="p.isTurn" class="ab-turn">🎯</span>
                  <span v-if="p.alive === false" class="ab-dead">出局</span>
                </div>
                <div class="gen-fields">
                  <span v-for="(val, k) in p.fields" :key="k" class="gen-f"><b>{{ k }}：</b>{{ val }}</span>
                </div>
              </div>
            </div>

            <pre v-else class="tl-data">{{ pretty(curSnap?.data) }}</pre>
          </div>

          <!-- 专属复盘：真实答案 / 回合详情 -->
          <div v-if="meta" class="dg-block">
            <div class="dg-title">专属复盘 · 真实答案与过程</div>

            <!-- 快速算术 -->
            <template v-if="meta.type === 'quick-math'">
              <div class="golden-answers">
                <span v-for="(q, i) in meta.questions" :key="i" class="ga-item">
                  {{ q.expression }} = <strong>{{ q.answer }}</strong>
                </span>
              </div>
              <table class="meta-table">
                <thead><tr><th>选手</th><th v-for="(q, i) in meta.questions" :key="i">#{{ i + 1 }}</th><th>用时</th></tr></thead>
                <tbody>
                  <tr v-for="p in detail.participants" :key="p.playerId">
                    <td class="mc-name">{{ p.playerName }}</td>
                    <td v-for="(q, i) in meta.questions" :key="i" class="mc" :class="cellClass(answerOf('quick-math', p.playerId, i))">
                      {{ answerOf('quick-math', p.playerId, i)?.userAnswer ?? '-' }}
                    </td>
                    <td>{{ dur(meta.players?.[p.playerId]?.durationMs) }}</td>
                  </tr>
                </tbody>
              </table>
            </template>

            <!-- 找出遗失的数字 -->
            <template v-else-if="meta.type === 'missing-number'">
              <div class="reveal-big">缺失数字：<strong>{{ meta.missing }}</strong></div>
              <table class="meta-table">
                <thead><tr><th>选手</th><th>提交</th><th>次数</th><th>判定</th></tr></thead>
                <tbody>
                  <tr v-for="p in detail.participants" :key="p.playerId">
                    <td class="mc-name">{{ p.playerName }}</td>
                    <td>{{ meta.players?.[p.playerId]?.value ?? '-' }}</td>
                    <td>{{ meta.players?.[p.playerId]?.attempts ?? 0 }}</td>
                    <td class="mc" :class="meta.players?.[p.playerId]?.correct ? 'ok' : 'bad'">
                      {{ meta.players?.[p.playerId]?.correct ? '正确' : '未答对' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </template>

            <!-- 描述猜谜 -->
            <template v-else-if="meta.type === 'describe-guess'">
              <div class="race-list">
                <div v-for="(q, qi) in meta.questions" :key="qi" class="race-item">
                  <div class="race-head">第 {{ qi + 1 }} 题 · 答案：<strong>{{ q.answer }}</strong></div>
                  <div class="race-clues">
                    <span v-for="(c, ci) in q.clues" :key="ci" class="race-clue">{{ ci + 1 }}. {{ c }}</span>
                  </div>
                  <table class="meta-table">
                    <thead><tr><th>选手</th><th>作答</th><th>得分</th></tr></thead>
                    <tbody>
                      <tr v-for="p in detail.participants" :key="p.playerId">
                        <td class="mc-name">{{ p.playerName }}</td>
                        <td>{{ dgRecord(p.playerId, qi)?.value ?? '未作答' }}</td>
                        <td class="mc" :class="dgRecord(p.playerId, qi)?.correct ? 'ok' : 'bad'">
                          {{ dgRecord(p.playerId, qi) ? `+${dgRecord(p.playerId, qi).gain}` : 0 }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>

            <!-- Stay or Fold -->
            <template v-else-if="meta.type === 'stay-or-fold'">
              <div class="race-list">
                <div v-for="r in meta.history" :key="r.round" class="race-item">
                  <div class="race-head">
                    第 {{ r.round }} 轮 · 目标 {{ r.target }} · 真实数量 <strong>{{ r.trueCount }}</strong>
                  </div>
                  <table class="meta-table">
                    <thead><tr><th>选手</th><th>估算</th><th>选择</th><th>差值</th><th>结果</th></tr></thead>
                    <tbody>
                      <tr v-for="p in detail.participants" :key="p.playerId">
                        <td class="mc-name">{{ p.playerName }}</td>
                        <td>{{ r.estimates?.[p.playerId] ?? '-' }}</td>
                        <td>{{ r.decisions?.[p.playerId] === 'stay' ? 'Stay' : (r.decisions?.[p.playerId] === 'fold' ? 'Fold' : '-') }}</td>
                        <td>{{ r.diffs?.[p.playerId] ?? '-' }}</td>
                        <td>
                          <span v-if="r.closest?.includes(p.playerId)" class="mc ok">+1</span>
                          <span v-if="r.eliminated?.includes(p.playerId)" class="mc bad">淘汰</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>

            <!-- 出包魔法师 -->
            <template v-else-if="meta.type === 'abraca'">
              <div class="spell-grid">
                <div v-for="s in meta.spells" :key="s.id" class="spell-card">
                  <div class="spell-title">{{ s.icon }} {{ s.id }} · {{ s.name }}</div>
                  <div class="spell-desc">{{ s.desc }}</div>
                  <div class="spell-stock">库存 {{ meta.tower?.[s.id]?.remaining }}/{{ meta.tower?.[s.id]?.total }} · 已施 {{ meta.tower?.[s.id]?.cast }}</div>
                </div>
              </div>
              <table class="meta-table">
                <thead><tr><th>选手</th><th>生命</th><th>猫头鹰</th><th>总分</th><th>本轮分</th></tr></thead>
                <tbody>
                  <tr v-for="p in (meta.players || [])" :key="p.playerId">
                    <td class="mc-name">{{ p.name }}</td>
                    <td>{{ p.hp }}/{{ p.maxHp }}</td>
                    <td>{{ p.owls }}</td>
                    <td>{{ p.scoreTotal }}</td>
                    <td>{{ p.scoreRound }}</td>
                  </tr>
                </tbody>
              </table>
            </template>

            <!-- 自定义游戏 -->
            <template v-else-if="meta.type === 'custom'">
              <table class="meta-table">
                <thead>
                  <tr><th>题目</th><th>正确答案</th><th v-for="p in detail.participants" :key="p.playerId">{{ p.playerName }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="q in meta.questions" :key="q.id">
                    <td class="mq-text">{{ q.text }}</td>
                    <td class="mq-ans">{{ q.correctAnswer || '（管理员评判）' }}</td>
                    <td v-for="p in detail.participants" :key="p.playerId" class="mc" :class="customCellClass(p.playerId, q.id)">
                      {{ customAnswer(p.playerId, q.id) ?? '-' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </template>

            <!-- 实力大挑战（抢答） -->
            <template v-else-if="meta.type === 'power-challenge'">
              <table class="meta-table">
                <thead><tr><th>题目</th><th>正确答案</th><th>占领者</th></tr></thead>
                <tbody>
                  <tr v-for="q in meta.questions" :key="q.id">
                    <td class="mq-text">{{ q.text }}</td>
                    <td class="mq-ans">{{ q.correctAnswer }}</td>
                    <td>{{ meta.questionWinners?.[q.id]?.playerName || '无人' }}</td>
                  </tr>
                </tbody>
              </table>
            </template>

            <div v-else class="empty-hint">该游戏暂无专属复盘数据（可在通用“比赛过程”中查看）</div>
          </div>

          <!-- 每位选手的比赛过程（可反映具体提交值与判定） -->
          <div class="dg-block">
            <div class="dg-title">比赛过程（按选手）</div>
            <div class="player-logs">
              <div v-for="grp in byPlayer" :key="grp.pid" class="plog">
                <div class="plog-head">
                  <BBAvatar :name="grp.name" size="sm" />
                  <span class="plog-name">{{ grp.name }}</span>
                  <span class="plog-count">{{ grp.events.length }} 次操作</span>
                </div>
                <div class="plog-rows">
                  <div v-for="(e, i) in grp.events" :key="i" class="plog-row" :class="e.type">
                    <span class="plog-time">+{{ delta(e.t) }}s</span>
                    <span class="plog-action">{{ e.text || e.type }}</span>
                    <span v-if="actionValue(e)" class="plog-value">值：{{ actionValue(e) }}</span>
                    <span v-if="actionResult(e)" class="plog-result" :class="resultClass(e)">{{ actionResult(e) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 完整事件时间线 -->
          <div class="dg-block">
            <div class="dg-title">
              完整事件（{{ filteredEvents.length }}）
              <span class="ev-filters">
                <button v-for="f in eventFilters" :key="f.value" class="ev-filter"
                  :class="{ active: eventFilter === f.value }" @click="eventFilter = f.value">{{ f.label }}</button>
              </span>
            </div>
            <div class="timeline">
              <div v-for="(e, i) in filteredEvents" :key="i" class="tl-row" :class="e.type">
                <span class="tl-time">{{ fmtTime(e.t) }}</span>
                <span class="tl-delta">+{{ delta(e.t) }}s</span>
                <span class="tl-text">{{ e.playerName ? `[${e.playerName}] ` : '' }}{{ e.text }}</span>
                <button v-if="e.data" class="tl-more" @click="toggle(i)">{{ expanded[i] ? '收起' : '详情' }}</button>
                <pre v-if="expanded[i]" class="tl-data">{{ pretty(e.data) }}</pre>
              </div>
              <div v-if="!filteredEvents.length" class="empty-hint">暂无事件</div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { bbGetMinigameReplays, bbGetMinigameReplay, bbDeleteMinigameReplay, bbBatchDeleteMinigameReplays } from '../../../services/bbApi'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'

const list = ref<any[]>([])
const detail = ref<any>(null)
const filterGameType = ref('')
const eventFilter = ref('all')
const expanded = ref<Record<number, boolean>>({})
const selectedIds = ref<string[]>([])

const eventFilters = [
  { value: 'all', label: '全部' },
  { value: 'answer', label: '作答' },
  { value: 'round', label: '回合' },
  { value: 'eliminate', label: '出局' },
  { value: 'finish', label: '结果' }
]

const allSelected = computed(() => list.value.length > 0 && list.value.every(r => selectedIds.value.includes(r.id)))

function toggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  selectedIds.value = checked ? list.value.map(r => r.id) : []
}

const filteredEvents = computed(() => {
  const evs = detail.value?.events || []
  if (eventFilter.value === 'all') return evs
  if (eventFilter.value === 'finish') return evs.filter((e: any) => e.type === 'finish' || e.type === 'game_end' || e.type === 'game_stop')
  return evs.filter((e: any) => e.type === eventFilter.value)
})

const boardPlayers = computed(() => {
  const parts = detail.value?.participants || []
  return [...parts].sort((a: any, b: any) => {
    const sa = detail.value?.scores?.[a.playerId]
    const sb = detail.value?.scores?.[b.playerId]
    if (sa == null && sb == null) return 0
    if (sa == null) return 1
    if (sb == null) return -1
    return sb - sa
  })
})

function fs(pid: string) { return detail.value?.finalStates?.[pid] || null }
function isEliminated(pid: string) {
  const s = fs(pid)
  return !!(s && s.done && detail.value?.winner && detail.value.winner.playerId !== pid)
}

const meta = computed<any>(() => detail.value?.meta || null)
const snapshots = computed<any[]>(() => detail.value?.snapshots || [])
const snapIndex = ref(0)
const curSnap = computed<any>(() => snapshots.value[snapIndex.value] || null)
const SPELL_ICON: Record<string, string> = { 1: '🐉', 2: '👻', 3: '💤', 4: '🦉', 5: '⚡', 6: '❄️', 7: '🔥', 8: '🧪' }
const isAbracaSnap = computed(() => { const d = curSnap.value?.data; return !!(d && Array.isArray(d.players) && d.tower) })
const isSofSnap = computed(() => { const d = curSnap.value?.data; return !!(d && d.estimates !== undefined && (d.scores !== undefined || d.trueCount !== undefined)) })
const towerSpellList = computed(() => {
  const spells = meta.value?.spells
  if (Array.isArray(spells) && spells.length) return spells
  return Object.keys(curSnap.value?.data?.tower || {}).map(id => ({ id, icon: SPELL_ICON[id] || '🔮' }))
})
function fmtFields(obj: any) {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null || v === '') continue
    if (Array.isArray(v)) out[k] = v.length ? v.map((x: any) => typeof x === 'object' ? JSON.stringify(x) : x).join('、') : '—'
    else if (typeof v === 'object') out[k] = JSON.stringify(v)
    else out[k] = v
  }
  return out
}
const genericSnapPlayers = computed(() => {
  const d = curSnap.value?.data
  if (!d || !d.players || isAbracaSnap.value || isSofSnap.value) return []
  const nameOf = (pid: string) => detail.value?.participants?.find((p: any) => p.playerId === pid)?.playerName || pid
  const list: any[] = []
  if (Array.isArray(d.players)) {
    for (const p of d.players) {
      const { playerId, name, isTurn, alive, ...rest } = p
      list.push({ playerId, name: name || nameOf(playerId), isTurn, alive, fields: fmtFields(rest) })
    }
  } else if (typeof d.players === 'object') {
    for (const [pid, obj] of Object.entries(d.players)) {
      list.push({ playerId: pid, name: nameOf(pid), fields: fmtFields(obj) })
    }
  }
  return list
})
function phaseLabel(p: string) {
  return ({ show: '展示', estimate: '估算', reveal: '公布估算', decide: 'Stay/Fold', resolve: '结算' } as Record<string, string>)[p] || p || ''
}

function dur(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return '-'
  return `${(ms / 1000).toFixed(1)}s`
}
function cellClass(a: any) {
  if (!a || a.correct == null) return ''
  return a.correct ? 'ok' : 'bad'
}
function answerOf(type: string, pid: string, i: number) {
  if (!meta.value) return null
  if (type === 'quick-math') return meta.value.players?.[pid]?.answers?.[i] || null
  return null
}
function dgRecord(pid: string, qi: number) {
  const recs = meta.value?.players?.[pid]?.records || {}
  return recs[qi] || recs[String(qi)] || null
}
function customAnswer(pid: string, qid: string) {
  const ans = meta.value?.players?.[pid]?.answers || []
  const hit = ans.find((a: any) => a.qid === qid)
  return hit ? hit.userAnswer : null
}
function customCellClass(pid: string, qid: string) {
  const ans = meta.value?.players?.[pid]?.answers || []
  const hit = ans.find((a: any) => a.qid === qid)
  if (!hit || hit.correct == null) return ''
  return hit.correct ? 'ok' : 'bad'
}

// 按选手分组
const byPlayer = computed(() => {
  const map: Record<string, { pid: string; name: string; events: any[] }> = {}
  for (const e of (detail.value?.events || [])) {
    if (!e.playerId) continue
    if (!map[e.playerId]) map[e.playerId] = { pid: e.playerId, name: e.playerName || e.playerId, events: [] }
    map[e.playerId].events.push(e)
  }
  const arr = Object.values(map)
  for (const g of arr) for (const e of g.events) if (!g.name && e.playerName) g.name = e.playerName
  return arr
})

// 从事件 data 中提取选手提交的具体值（作答/数字/法术等）
function actionValue(e: any): string {
  const a = e?.data?.action
  if (!a) return ''
  const v = a.answer ?? a.value ?? a.spell ?? a.choice ?? a.count ?? a.answers
  if (v == null) return ''
  if (typeof v === 'object') { try { return JSON.stringify(v) } catch { return '' } }
  return String(v)
}
function actionResult(e: any): string {
  const r = e?.data?.result
  if (!r) return ''
  if (r.correct === true) return '✅ 正确'
  if (r.correct === false) return '❌ 错误'
  if (r.success === true) return '成功'
  if (r.success === false) return '失败'
  if (r.gradedCount !== undefined) return `答对 ${r.gradedCorrect ?? 0}/${r.gradedCount}`
  return ''
}
function resultClass(e: any) {
  const r = e?.data?.result
  if (!r) return ''
  if (r.correct === true || r.success === true) return 'ok'
  if (r.correct === false || r.success === false) return 'bad'
  return ''
}

const durationText = computed(() => {
  const d = detail.value
  if (!d?.startedAt || !d?.endedAt) return '-'
  const ms = new Date(d.endedAt).getTime() - new Date(d.startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '-'
  return `${Math.round(ms / 1000)}s`
})

function gameTypeLabel(t: string) {
  return ({ hoh: 'HOH', veto: '否决权', bbbbb: 'BBBB', bbbb: 'BBBB', finale: '终局' } as Record<string, string>)[t] || t
}
function fmtDate(t: string) { return t ? new Date(t).toLocaleString('zh-CN') : '' }
function fmtTime(t: number) {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
function delta(t: number) {
  const start = detail.value?.startedAt ? new Date(detail.value.startedAt).getTime() : t
  return ((t - start) / 1000).toFixed(1)
}
function pretty(d: any) { try { return JSON.stringify(d, null, 2) } catch { return String(d) } }
function toggle(i: number) { expanded.value = { ...expanded.value, [i]: !expanded.value[i] } }

async function loadList() {
  try {
    list.value = await bbGetMinigameReplays({ gameType: filterGameType.value || undefined, limit: 200 })
    selectedIds.value = selectedIds.value.filter(id => list.value.some(r => r.id === id))
  } catch { list.value = [] }
}
async function openReplay(id: string) {
  try { detail.value = await bbGetMinigameReplay(id); expanded.value = {}; snapIndex.value = 0 } catch (e: any) { alert(e?.message || '加载失败') }
}
async function removeReplay(id: string) {
  if (!confirm('确定删除该复盘记录？')) return
  try { await bbDeleteMinigameReplay(id); detail.value = null; await loadList() } catch (e: any) { alert(e?.message || '删除失败') }
}
async function batchDelete() {
  if (!selectedIds.value.length) return
  if (!confirm(`确定删除选中的 ${selectedIds.value.length} 条复盘记录吗？`)) return
  try {
    const res = await bbBatchDeleteMinigameReplays(selectedIds.value)
    if (detail.value && selectedIds.value.includes(detail.value.id)) detail.value = null
    selectedIds.value = []
    await loadList()
    alert(`已删除 ${res?.deleted ?? ''} 条`)
  } catch (e: any) { alert(e?.message || '批量删除失败') }
}

onMounted(loadList)
</script>

<style scoped>
.mg-replay { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.filters { margin-left: auto; display: flex; gap: 10px; flex-wrap: wrap; }
.bb-input { padding: 8px 12px; background: #0a0a1a; border: 1px solid #00ff8833; border-radius: 6px; color: #e0e0e0; font-size: 13px; }
.replay-layout { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; }
.list-panel { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 12px; padding: 12px; max-height: 82vh; overflow-y: auto; }
.list-tools { margin-bottom: 8px; }
.sel-all { font-size: 12px; color: #aaa; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.replay-item { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border: 1px solid #ffffff10; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; }
.replay-item:hover { border-color: #4488ff66; }
.replay-item.active { border-color: #4488ff; background: #4488ff12; }
.item-check { padding-top: 2px; }
.item-main { flex: 1; min-width: 0; }
.ri-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.ri-name { font-size: 13px; color: #e0e0e0; font-weight: 600; }
.ri-type { font-size: 11px; color: #4488ff; }
.ri-meta { font-size: 12px; color: #8a8aa5; }
.ri-winner { font-size: 12px; color: #ffaa00; margin-top: 4px; }
.ri-winner.none { color: #666; }
.detail-panel { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 12px; padding: 18px; min-width: 0; }
.detail-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; gap: 12px; }
.dh-title { font-size: 18px; font-weight: 700; color: #e0e0e0; }
.dh-sub { font-size: 13px; color: #8a8aa5; margin-top: 4px; }
.dg-block { margin-bottom: 18px; }
.dg-title { font-size: 14px; color: #00ff88; font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.board-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.board-card { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 10px; padding: 10px 12px; }
.board-card.winner { border-color: #ffaa00; background: #ffaa0012; }
.board-top { display: flex; align-items: center; gap: 8px; }
.board-name { font-size: 14px; color: #e0e0e0; font-weight: 600; }
.board-crown { margin-left: auto; }
.board-out { margin-left: auto; font-size: 11px; color: #ff6b6b; }
.board-stats { margin-top: 6px; font-size: 12px; color: #9fb3d1; }
.player-logs { display: flex; flex-direction: column; gap: 12px; }
.plog { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 10px; padding: 10px 12px; }
.plog-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.plog-name { font-size: 14px; color: #e0e0e0; font-weight: 600; }
.plog-count { font-size: 12px; color: #8a8aa5; margin-left: auto; }
.plog-rows { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow-y: auto; }
.plog-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; padding: 4px 8px; background: #ffffff05; border-radius: 6px; flex-wrap: wrap; }
.plog-row.eliminate { background: #ff444414; }
.plog-time { color: #4488ff; font-variant-numeric: tabular-nums; min-width: 48px; }
.plog-action { color: #ddd; }
.plog-value { color: #e6e6ff; }
.plog-result.ok { color: #00ff88; }
.plog-result.bad { color: #ff6b6b; }
.ev-filters { display: flex; gap: 6px; }
.ev-filter { background: transparent; border: 1px solid #ffffff22; color: #aaa; border-radius: 6px; padding: 2px 10px; font-size: 12px; cursor: pointer; }
.ev-filter.active { border-color: #00ff88; color: #00ff88; }
.timeline { display: flex; flex-direction: column; gap: 4px; max-height: 50vh; overflow-y: auto; }
.tl-row { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: #ffffff05; border-radius: 6px; font-size: 13px; flex-wrap: wrap; }
.tl-row.eliminate { background: #ff444414; }
.tl-row.finish, .tl-row.game_end, .tl-row.game_stop { background: #ffaa0014; }
.tl-row.round { background: #4488ff12; }
.tl-time { color: #666; font-size: 11px; font-variant-numeric: tabular-nums; }
.tl-delta { color: #4488ff; font-size: 11px; font-variant-numeric: tabular-nums; min-width: 48px; }
.tl-text { color: #ddd; flex: 1; }
.tl-more { background: transparent; border: 1px solid #ffffff22; color: #aaa; border-radius: 4px; padding: 1px 8px; font-size: 11px; cursor: pointer; }
.tl-data { flex-basis: 100%; margin: 4px 0 0; padding: 8px; background: #0a0a1a; border-radius: 6px; color: #9fd8b8; font-size: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
.empty-hint { color: #666; font-size: 13px; padding: 24px 0; text-align: center; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn-danger { border-color: #ff444466; color: #ff4444; }
.bb-btn-danger:hover { background: #ff444422; }
.golden-answers { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.ga-item { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 6px; padding: 4px 10px; font-size: 13px; color: #ddd; }
.ga-item strong { color: #00ff88; }
.reveal-big { font-size: 15px; color: #ddd; margin-bottom: 12px; }
.reveal-big strong { color: #ffaa00; font-size: 20px; }
.meta-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.meta-table th, .meta-table td { border: 1px solid #ffffff12; padding: 6px 10px; text-align: center; color: #ccc; }
.meta-table th { background: #ffffff08; color: #9fb3d1; font-weight: 600; }
.mc-name { text-align: left; color: #e0e0e0; white-space: nowrap; }
.mc.ok { color: #00ff88; }
.mc.bad { color: #ff6b6b; }
.mq-text { text-align: left; max-width: 320px; }
.mq-ans { color: #00ff88; }
.race-list { display: flex; flex-direction: column; gap: 12px; }
.race-item { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 10px; padding: 10px 12px; }
.race-head { font-size: 14px; color: #ddd; margin-bottom: 8px; }
.race-head strong { color: #ffaa00; }
.race-clues { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
.race-clue { font-size: 12.5px; color: #9fb3d1; }
.spell-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 12px; }
.spell-card { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 10px; padding: 10px 12px; }
.spell-title { font-size: 14px; color: #e0e0e0; font-weight: 600; }
.spell-desc { font-size: 12px; color: #8a8aa5; margin: 4px 0; line-height: 1.4; }
.spell-stock { font-size: 12px; color: #9fb3d1; }
.snap-controls { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.snap-range { flex: 1; accent-color: #00ff88; }
.snap-label { font-size: 13px; color: #9fb3d1; margin-bottom: 10px; }
.snap-sub { font-size: 13px; color: #ddd; margin-bottom: 8px; }
.ab-board { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.ab-p { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 10px; padding: 10px 12px; }
.ab-p.turn { border-color: #00ff88; background: #00ff8812; }
.ab-p.dead { opacity: 0.5; }
.ab-p-head { display: flex; align-items: center; gap: 6px; font-size: 14px; color: #e0e0e0; }
.ab-turn { margin-left: auto; font-size: 11px; color: #00ff88; }
.ab-dead { margin-left: auto; font-size: 11px; color: #ff6b6b; }
.ab-p-stats { font-size: 12px; color: #9fb3d1; margin: 6px 0; }
.ab-p-hand { display: flex; flex-wrap: wrap; gap: 6px; }
.ab-card { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 36px; background: #1a1a3e; border: 1px solid #00ff8855; border-radius: 5px; color: #e0e0e0; font-weight: 700; font-size: 14px; }
.ab-none { color: #666; font-size: 12px; }
.ab-tower { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.ab-tower-item { font-size: 12px; color: #cfe3ff; background: #ffffff08; border-radius: 6px; padding: 2px 8px; }
.ab-seat { color: #8a8aa5; font-size: 11px; }
.gen-board { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.gen-p { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 10px; padding: 10px 12px; }
.gen-p.turn { border-color: #00ff88; background: #00ff8812; }
.gen-p.dead { opacity: 0.55; }
.gen-p-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 14px; color: #e0e0e0; }
.gen-fields { display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; color: #cfe3ff; }
.gen-f b { color: #8a8aa5; font-weight: 500; }
@media (max-width: 760px) {
  .replay-layout { grid-template-columns: 1fr; }
  .list-panel { max-height: 40vh; }
  .detail-panel { padding: 12px; }
  .meta-table { display: block; overflow-x: auto; white-space: nowrap; }
  .board-grid, .ab-board, .spell-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
}
</style>
