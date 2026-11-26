<template>
  <section class="standings" aria-label="选手战况">
    <header>
      <div>
        <h3>{{ final ? '最终战况' : '实时战况' }}</h3>
        <p>{{ players.length }} 位选手<span v-if="outCount"> · {{ outCount }} 位出局</span></p>
      </div>
      <label v-if="!metric.statusOnly">排序
        <select v-model="order">
          <option value="game">比赛规则</option>
          <option value="desc">{{ metric.label }}从高到低</option>
          <option value="asc">{{ metric.label }}从低到高</option>
        </select>
      </label>
    </header>
    <div v-if="!metric.statusOnly && top && top.value !== undefined" class="summary">
      <b>{{ metric.label }}</b> · {{ top.playerName }} {{ format(top.value) }}
      <span v-if="target > 0 && gameId === 'dice-duel'"> · 目标 {{ target }} 点（{{ top.value > target ? '超过' : '相差' }} {{ Math.abs(top.value-target) }} 点）</span>
      <span v-else-if="gap != null"> · 与下一位差 {{ format(gap) }}</span>
      <small v-if="gameId === 'reaction' && !final">未完成面板按规则计入暂计用时</small>
      <small v-if="gameId === 'klotski'">胜负以是否完成和完成用时判定</small>
    </div>
    <ul v-if="rows.length">
      <li v-for="(row, i) in rows" :key="row.playerId" :class="{ winning: row.winner, selected: row.playerId === selected }">
        <span v-if="!metric.statusOnly" class="ordinal" aria-hidden="true">{{ i+1 }}</span>
        <span v-if="row.color" class="color-dot" :style="{ background: row.color }" aria-hidden="true"></span>
        <BBAvatar :name="row.playerName" :avatar="row.avatar" size="sm" />
        <div class="player">
          <button v-if="inspectable" type="button" class="inspect" :aria-pressed="selected === row.playerId" @click="$emit('inspect', row.playerId)">{{ row.playerName }}</button>
          <b v-else>{{ row.playerName }}</b>
          <small v-if="row.label">{{ row.label }}</small>
          <progress v-if="row.pct !== undefined && !metric.statusOnly" :aria-label="row.playerName + '的比赛进度'" :value="row.pct" max="100" />
        </div>
        <div class="outcome">
          <strong v-if="!metric.statusOnly">{{ row.value === undefined ? '—' : format(row.value) }}</strong>
          <small v-if="row.winner" class="winner">获胜</small>
          <small v-else-if="row.out">出局</small>
          <small v-else-if="row.done">已完成</small>
          <small v-else-if="!final && row.connected === false">离线</small>
          <small v-else-if="liveActive && (row.value !== undefined || row.label)">进行中</small>
        </div>
      </li>
    </ul>
    <p v-else>暂无选手数据</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import BBAvatar from '../BBAvatar.vue'
import { buildStandings, contestMetric, type ContestPlayer, type ContestState, type SortOrder } from './contestStandings'

const props = withDefaults(defineProps<{
  players: ContestPlayer[]
  states?: Record<string, ContestState>
  scores?: Record<string, number>
  winners?: string[]
  gameId: string
  mode?: string
  target?: number
  selected?: string
  inspectable?: boolean
  final?: boolean
  liveActive?: boolean
}>(), { states: () => ({}), scores: () => ({}), winners: () => [], target: 0 })
defineEmits<{ inspect: [id: string] }>()
const order = ref<SortOrder>('game')
const metric = computed(() => contestMetric(props.gameId, props.mode))
const ranked = (sort: SortOrder) => buildStandings(props.players, props.states, props.scores, props.winners, props.gameId, props.target, sort, props.mode)
const rows = computed(() => ranked(order.value))
const comparable = computed(() => ranked('game').filter(row => row.value !== undefined))
const top = computed(() => comparable.value[0])
const gap = computed(() => {
  const [first, second] = comparable.value
  if (!first || !second || first.out || second.out) return undefined
  if (['klotski', 'spot-difference', 'jigsaw', 'memory-match', 'quick-math', 'reaction'].includes(props.gameId) && !!first.done !== !!second.done) return undefined
  return Math.abs(first.value! - second.value!)
})
const outCount = computed(() => rows.value.filter(row => row.out && !row.winner).length)
function format(value: number) {
  const formatted = props.gameId === 'balance-bar' ? (value / 1000).toFixed(2) : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  return metric.value.unit ? formatted + ' ' + metric.value.unit : formatted
}
</script>

<style scoped>
.standings { background:#1a1529; border:1px solid #75658d70; border-radius:12px; padding:clamp(12px,2vw,18px); margin-bottom:14px; color:#f0eafa; min-width:0 }
header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px }
h3,p { margin:0 } h3 { font-size:17px } p,small,label { color:#c4b9db; font-size:12px }
select { margin-left:6px; padding:6px; color:#f0eafa; background:#2a203c; border:1px solid #847198; border-radius:6px; max-width:100% }
.summary { background:#332946; border-radius:7px; padding:8px 10px; margin:12px 0; font-size:13px; overflow-wrap:anywhere }
.summary small { display:block; margin-top:4px }
ul { list-style:none; display:grid; gap:5px; margin:12px 0 0; padding:0 }
li { display:flex; align-items:center; gap:8px; background:#ffffff08; border:1px solid transparent; border-radius:8px; padding:7px }
li.selected,li.winning { border-color:#c19a66; background:#d3a56d14 }
.color-dot { width:7px; height:7px; border-radius:50%; flex:none }
.ordinal { width:2ch; flex:none; color:#c8b8e5; text-align:center; font-variant-numeric:tabular-nums }
.player { flex:1; min-width:0 } .player small { display:block; overflow-wrap:anywhere }
.inspect { border:0; background:none; padding:0; color:#f6ecff; font:inherit; font-weight:700; text-decoration:underline; text-underline-offset:3px; cursor:pointer; text-align:left }
.outcome { text-align:right; flex:none } .outcome small { display:block } strong { color:#ead3a8; font-variant-numeric:tabular-nums }
.winner { color:#ffdf96 } progress { display:block; max-width:100%; height:5px; margin-top:5px; accent-color:#b7a1eb }
</style>
