<template>
  <form v-if="!branch && admin" @submit.prevent="submit({kind:'setup',ids: setup})">
    <label>{{ mode === 'split_house' ? '选择第一组，剩余房客进入第二组' : '确认两位临时 HOH' }}
      <select v-model="setup" multiple :size="Math.min(players.length, 8)">
        <option v-for="p in players" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </label>
    <button :disabled="busy || setup.length !== setupCount">确认 {{ setup.length }} / {{ setupCount }} 人</button>
  </form>
  <p v-else-if="!branch">等待管理员确认开赛名单。</p>
  <template v-else-if="mode === 'battle_of_block'">
    <section v-for="hoh in branch.hohs" :key="hoh" class="track">
      <h4>临时 HOH · {{ name(hoh) }}</h4>
      <p v-if="branch.nominations[hoh]">提名组 · {{ branch.nominations[hoh].map(name).join('、') }}</p>
      <form v-else-if="admin || hoh === me" @submit.prevent="submit({kind:'nominate',hoh,ids:pairs[hoh]})">
        <select v-model="pairs[hoh]" multiple aria-label="本组两名提名者">
          <option v-for="p in battleCandidates" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button :disabled="busy || pairs[hoh]?.length !== 2">提交两名提名者</button>
      </form>
      <button v-if="admin && !branch.done && battleReady" :disabled="busy"
        @click="submit({kind:'result',winner:hoh})">确认这组赢得对抗</button>
    </section>
    <p v-if="branch.done">安全组 · {{ branch.nominations[branch.safeHoh].map(name).join('、') }}。正式 HOH · {{ name(branch.remainingHoh) }}。</p>
  </template>
  <template v-else>
    <section v-for="g in branch.groups" :key="g.index" class="track">
      <h4>第 {{ g.index + 1 }} 组 · {{ phases[g.phase] }}</h4>
      <p>成员 · {{ g.ids.map(name).join('、') }}</p>
      <p v-if="g.hoh">HOH · {{ name(g.hoh) }}</p>
      <p v-if="g.nominees?.length">提名 · {{ g.nominees.map(name).join('、') }}</p>
      <p v-if="g.pov">POV · {{ name(g.pov) }}</p>
      <p v-if="g.saved">获救 · {{ name(g.saved) }}</p>
      <form v-if="g.phase === 'nominate' && (admin || g.hoh === me)" @submit.prevent="submit({kind:'nominate',group:g.index,ids:pairs[g.index]})">
        <select v-model="pairs[g.index]" multiple aria-label="本组两位提名者">
          <option v-for="id in g.ids.filter(id => id !== g.hoh)" :key="id" :value="id">{{ name(id) }}</option>
        </select>
        <button :disabled="busy || pairs[g.index]?.length !== 2">确认提名</button>
      </form>
      <form v-if="canSelect(g)" @submit.prevent="submit({kind:g.phase,group:g.index,target:picks[g.index]})">
        <select v-model="picks[g.index]" aria-label="选择本阶段人选">
          <option value="">{{ g.phase === 'pov-decision' ? '不使用 POV' : '选择房客' }}</option>
          <option v-for="id in options(g)" :key="id" :value="id">{{ name(id) }}</option>
        </select>
        <button :disabled="busy || (!picks[g.index] && g.phase !== 'pov-decision')">{{ actions[g.phase] }}</button>
      </form>
      <p v-if="g.phase === 'vote'">已收 {{ g.voteCount }} 票<span v-if="g.myVote"> · 你投给了 {{ name(g.myVote) }}</span></p>
      <button v-if="admin && g.phase === 'vote'" :disabled="busy" @click="submit({kind:'settle',group:g.index})">结算本组投票</button>
      <p v-if="g.evicted">{{ name(g.evicted) }} 出局 · {{ g.tally?.map(t => name(t.id) + ' ' + t.count + ' 票').join('，') }}</p>
      <details v-if="g.messages?.length || (!branch.done && g.phase !== 'settled')">
        <summary>组内讨论</summary>
        <ul><li v-for="m in g.messages" :key="m.id"><b>{{ name(m.playerId) }}</b> · {{ m.text }}</li></ul>
        <form v-if="!admin && !branch.done && g.phase !== 'settled'" @submit.prevent="send(g.index)">
          <input v-model="message" maxlength="500" aria-label="组内讨论消息" placeholder="输入消息">
          <button :disabled="busy || !message.trim()">发送</button>
        </form>
      </details>
    </section>
    <button v-if="admin && !branch.done && branch.groups.every(g => g.phase === 'settled')" :disabled="busy" @click="submit({kind:'merge'})">公布两组结果并合屋</button>
  </template>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface Group {
  index: number
  ids: string[]
  phase: string
  hoh: string
  pov: string
  saved: string
  evicted: string
  nominees: string[]
  voteCount: number
  myVote?: string
  tally?: { id: string; count: number }[]
  messages?: { id: string; playerId: string; text: string }[]
}
interface Branch {
  done: boolean
  hohs: string[]
  nominations: Record<string, string[]>
  safeHoh: string
  remainingHoh: string
  groups: Group[]
}
const props = defineProps<{ branch?: Branch; mode: string; players: { id: string; name: string }[]; me: string; admin: boolean; busy: boolean }>()
const emit = defineEmits<{ action: [action: Record<string, unknown>] }>()
const setup = ref<string[]>([])
const pairs = ref<Record<string, string[]>>({})
const picks = ref<Record<number, string>>({})
const message = ref('')
const setupCount = computed(() => props.mode === 'split_house' ? Math.floor(props.players.length / 2) : 2)
const battleReady = computed(() => {
  const state = props.branch
  return Boolean(state?.hohs?.every(id => state.nominations[id]))
})
const battleCandidates = computed(() => {
  const state = props.branch
  if (!state) return []
  const taken = new Set([...state.hohs, ...Object.values(state.nominations).flat()])
  return props.players.filter(p => !taken.has(p.id))
})
const phases: Record<string, string> = { hoh: 'HOH 竞争', nominate: '提名', pov: 'POV 竞争', 'pov-decision': 'POV 决定', replace: '补提名', vote: '淘汰投票', settled: '已结算' }
const actions: Record<string, string> = { hoh: '录入 HOH 胜者', pov: '录入 POV 胜者', 'pov-decision': '提交决定', replace: '确认补提名', vote: '投淘汰票' }
function name(id: string) { return props.players.find(p => p.id === id)?.name || id }
function submit(action: Record<string, unknown>) { emit('action', action) }
function send(group: number) {
  submit({ kind: 'message', group, text: message.value })
  message.value = ''
}
function canSelect(group: Group) {
  if (group.phase === 'hoh' || group.phase === 'pov') return props.admin
  if (group.phase === 'pov-decision') return props.admin || group.pov === props.me
  if (group.phase === 'replace') return props.admin || group.hoh === props.me
  return group.phase === 'vote' && !props.admin && !group.nominees.includes(props.me)
}
function options(group: Group) {
  if (group.phase === 'pov-decision' || group.phase === 'vote') return group.nominees
  if (group.phase === 'replace') return group.ids.filter(id => ![group.hoh, group.pov, group.saved, ...group.nominees].includes(id))
  return group.ids
}
</script>

<style scoped>
.track { margin:10px 0; padding:10px; border:1px solid #9078ae; border-radius:8px }
h4,p { margin:0 0 6px }
form, label { display:flex; flex-wrap:wrap; align-items:center; gap:8px }
button,select,input { background:#3c2b55; color:#fff; border:1px solid #9078ae; border-radius:6px; padding:7px; max-width:100% }
ul { max-height:180px; overflow:auto; overflow-wrap:anywhere }
</style>
