<template>
  <aside v-if="items.length" class="round-twists" aria-label="本轮变数">
    <article v-for="twist in items" :key="twist.id">
      <h3>{{ twist.icon }} {{ twist.name }}</h3>
      <p>{{ twist.description }}</p>
      <BranchTwistContest v-if="twist.id === 'battle_of_block' || twist.id === 'split_house'"
        :mode="twist.id" :branch="state.branch" :players="state.players" :me="state.me"
        :admin="state.canSetSafety" :busy="busy" @action="branchAction => save(twist.id, { branchAction })" />
      <template v-else-if="twist.id === 'safety_suite'">
        <p v-if="state.safePlayerId" class="state">本轮安全 · {{ name(state.safePlayerId) }}</p>
        <form v-if="state.canPrepare && state.canSetSafety" @submit.prevent="save(twist.id, { target: safe })">
          <select v-model="safe" aria-label="安全挑战胜者">
            <option value="">选择安全挑战胜者</option>
            <option v-for="p in state.players" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button :disabled="!safe || busy">确认挑战结果</button>
        </form>
      </template>
      <template v-else-if="twist.id === 'sealed_replacement' && state.canSetReserve">
        <p v-if="state.reserveIds?.length" class="state">候补顺序 · {{ state.reserveIds.map(name).join(' → ') }}</p>
        <form v-if="state.canPrepare" @submit.prevent="save(twist.id, { targets: [first, second] })">
          <select v-model="first" aria-label="第一候补">
            <option value="">第一候补</option>
            <option v-for="p in state.players" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <select v-model="second" aria-label="第二候补">
            <option value="">第二候补</option>
            <option v-for="p in state.players" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button :disabled="!first || !second || first === second || busy">锁定候补</button>
        </form>
      </template>
      <template v-else-if="twist.id === 'rescue_contract'">
        <p v-if="state.contract" class="state">
          {{ state.contract.ids.map(name).join(' 与 ') }} · {{ state.contract.accepted ? '合约生效' : '等待接受' }}
        </p>
        <form v-if="state.canPrepare && !state.contract && state.players.some(p => p.id === state.me)" @submit.prevent="save(twist.id, { target: partner })">
          <select v-model="partner" aria-label="合约搭档">
            <option value="">选择搭档</option>
            <option v-for="p in state.players.filter(p => p.id !== state.me)" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button :disabled="!partner || busy">公开邀请</button>
        </form>
        <button v-if="state.canPrepare && state.contract?.ids[1] === state.me && !state.contract.accepted"
          :disabled="busy" @click="save(twist.id, { accept: true })">接受合约</button>
      </template>
      <template v-else-if="twist.id === 'voluntary_nominee'">
        <p v-if="state.volunteers?.length">报名 · {{ state.volunteers.map(name).join('、') }}</p>
        <p v-if="state.volunteerId" class="state">已选定 · {{ name(state.volunteerId) }}</p>
        <button v-if="state.canVolunteer && !state.volunteers?.includes(state.me)" :disabled="busy"
          @click="save(twist.id, { action: 'apply' })">自荐挂牌</button>
        <form v-if="state.canSelectVolunteer && state.volunteers?.length" @submit.prevent="save(twist.id, { action: 'choose', target: volunteer })">
          <select v-model="volunteer" aria-label="选择挂牌人">
            <option value="">从报名者中选择</option>
            <option v-for="id in state.volunteers" :key="id" :value="id">{{ name(id) }}</option>
          </select>
          <button :disabled="busy || !volunteer">确认挂牌</button>
        </form>
      </template>
      <template v-else-if="twist.id === 'nomination_appeal'">
        <button v-if="state.canAppeal" :disabled="busy" @click="save(twist.id, { action: 'apply' })">发起申诉</button>
        <p v-if="state.appeal">{{ name(state.appeal.playerId) }} 对阵 {{ name(state.appeal.hohId) }}</p>
        <button v-if="state.canManageAppeal && state.appeal?.status === 'pending'" :disabled="busy"
          @click="save(twist.id, { action:'start' })">开启 30 秒申诉短赛</button>
        <template v-if="state.appeal?.status === 'playing'">
          <p>{{ state.appeal.expression }} = ?</p>
          <form v-if="[state.appeal.playerId, state.appeal.hohId].includes(state.me)" @submit.prevent="save(twist.id, { action:'answer', answer: appealAnswer })">
            <input v-model.number="appealAnswer" type="number" aria-label="申诉短赛答案">
            <button :disabled="busy || appealAnswer === ''">提交答案</button>
          </form>
          <button v-if="state.canManageAppeal" :disabled="busy" @click="save(twist.id, { action:'close' })">超时结算</button>
        </template>
        <p v-if="state.appeal?.status === 'resolved'" class="state">
          {{ state.appeal.winnerId === state.appeal.playerId ? '申诉成功，获得 POV 重试机会' : '申诉结束，本轮照常进行 POV' }}
        </p>
      </template>
      <template v-else-if="twist.id === 'round_rewind'">
        <p v-if="state.rewoundAt" class="state">本轮已回卷。以重赛结果为准。</p>
        <button v-else-if="state.canRewind" :disabled="busy" @click="rewind">归档本轮第一遍结果并回卷</button>
      </template>
      <template v-else-if="twist.id === 'battle_back' || twist.id === 'costly_return'">
        <p v-if="state.revivedId" class="state">已回归 · {{ name(state.revivedId) }}</p>
        <form v-if="state.canRevive" @submit.prevent="save(twist.id, { target: revive })">
          <select v-model="revive" aria-label="复活赛胜者">
            <option value="">选择复活赛胜者</option>
            <option v-for="p in state.revivalPool" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button :disabled="busy || !revive">确认回归</button>
        </form>
      </template>
      <template v-else-if="twist.id === 'coup_detat'">
        <p v-if="state.coupUsed" class="state">已使用 · 以更新后的提名名单为准</p>
        <p v-else-if="state.coupHolderId" class="state">政变权持有者 · {{ name(state.coupHolderId) }}</p>
        <form v-if="state.canAssignCoup && !state.coupHolderId" @submit.prevent="save(twist.id, { target: coupHolder })">
          <select v-model="coupHolder" aria-label="政变权持有者">
            <option value="">选择持有者</option>
            <option v-for="p in state.players" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button :disabled="busy || !coupHolder">公布持有者</button>
        </form>
        <form v-if="state.canUseCoup" @submit.prevent="applyCoup">
          <label v-for="(pair,i) in coupPairs" :key="i" class="coup-pair">
            第 {{ i + 1 }} 组
            <select v-model="pair.out" :aria-label="'撤下第 '+(i+1)+' 名提名者'">
              <option value="">撤下</option>
              <option v-for="id in state.nomineeIds" :key="id" :value="id">{{ name(id) }}</option>
            </select>
            <select v-model="pair.in" :aria-label="'补入第 '+(i+1)+' 名提名者'">
              <option value="">补入</option>
              <option v-for="p in state.players.filter(p => !state.nomineeIds.includes(p.id))" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
          <button :disabled="busy || !coupPairs[0]?.out || !coupPairs[0]?.in">改写提名</button>
        </form>
      </template>
      <template v-else-if="twist.id === 'tie_recall'">
        <p v-if="state.tieRecall?.status === 'pending'" class="state">第一轮最高票并列，等待 HOH 保留一人。</p>
        <p v-if="state.tieRecall?.safeId" class="state">{{ name(state.tieRecall.safeId) }} 已获救，其余提名者进入重投。</p>
        <form v-if="state.canResolveTie" @submit.prevent="save(twist.id, { target: tieSafe })">
          <select v-model="tieSafe" aria-label="平票保留人选">
            <option value="">选择保留人选</option>
            <option v-for="id in state.tieRecall?.tiedIds" :key="id" :value="id">{{ name(id) }}</option>
          </select>
          <button :disabled="busy || !tieSafe">保下一人并准备重投</button>
        </form>
      </template>
      <template v-else-if="twist.id === 'veto_trustee'">
        <p v-if="state.trusteeId" class="state">本轮决定权 · {{ name(state.trusteeId) }}</p>
        <form v-if="state.canTransfer" @submit.prevent="save(twist.id, { target: trustee })">
          <select v-model="trustee" aria-label="POV 托管人">
            <option value="">选择托管人</option>
            <option v-for="p in state.players.filter(p => !state.nomineeIds.includes(p.id))" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button :disabled="!trustee || busy">转交决定权</button>
        </form>
        <form v-if="state.canDecide" @submit.prevent="decide(true)">
          <select v-model="nominee" aria-label="要救下的提名者">
            <option value="">选择要救的人</option>
            <option v-for="id in state.nomineeIds" :key="id" :value="id">{{ name(id) }}</option>
          </select>
          <button :disabled="!nominee || busy">使用 POV</button>
          <button type="button" :disabled="busy" @click="decide(false)">不使用</button>
        </form>
      </template>
    </article>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BranchTwistContest from './BranchTwistContest.vue'
import { doRequest, bbUseVeto, bbSkipVeto } from '../../services/bbApi'
import { useBbRefresh } from '../../composables/useBbRefresh'
import { getAllTwistDefs } from '../../types/bigbrother'


interface RoundTwistState {
  branch?: InstanceType<typeof BranchTwistContest>['$props']['branch']
  ids: string[]
  round: number
  players: { id: string; name: string }[]
  me: string
  canPrepare: boolean
  canSetSafety: boolean
  canSetReserve: boolean
  reserveIds?: string[]
  safePlayerId?: string
  contract?: { ids: string[]; accepted: boolean }
  trusteeId?: string
  volunteers?: string[]
  volunteerId?: string
  canVolunteer?: boolean
  canSelectVolunteer?: boolean
  canAppeal?: boolean
  canManageAppeal?: boolean
  appeal?: { status: string; playerId: string; hohId: string; expression?: string; winnerId?: string }
  canRewind?: boolean
  rewoundAt?: string
  canRevive?: boolean
  revivedId?: string
  revivalPool?: { id: string; name: string }[]
  coupHolderId?: string
  coupUsed?: boolean
  canAssignCoup?: boolean
  canUseCoup?: boolean
  canResolveTie?: boolean
  tieRecall?: { status: 'pending' | 'revote'; tiedIds: string[]; safeId?: string }
  nomineeIds: string[]
  canTransfer: boolean
  canDecide: boolean
}
const props = defineProps<{ currentRound: number; currentStage: string }>()
const state = ref<RoundTwistState>({ ids: [], round: 0, players: [], me: '', canPrepare: false, canSetSafety: false, canSetReserve: false, nomineeIds: [], canTransfer: false, canDecide: false })
const safe = ref('')
const first = ref('')
const second = ref('')
const partner = ref('')
const trustee = ref('')
const nominee = ref('')
const revive = ref('')
const volunteer = ref('')
const appealAnswer = ref<number | ''>('')
const tieSafe = ref('')
const coupHolder = ref('')
const coupPairs = ref([{ out: '', in: '' }, { out: '', in: '' }])
function applyCoup() {
  const pairs = coupPairs.value.filter(pair => pair.out || pair.in)
  return save('coup_detat', { replaced: pairs.map(pair => pair.out), targets: pairs.map(pair => pair.in) })
}
const busy = ref(false)
const error = ref('')
const emit = defineEmits<{ exclusive: [active: boolean] }>()
const items = computed(() => getAllTwistDefs().filter(t => t.group === 2 && state.value.ids.includes(t.id)
  && (t.affectsStages.some(stage => stage === props.currentStage) || (t.id === 'save_vote' && props.currentStage === 'nomination'))))
watch(() => items.value.some(item => (item.id === 'split_house' || item.id === 'battle_of_block')
  && props.currentStage === 'hoh_competition'), active => emit('exclusive', active), { immediate: true })
let request = 0
async function reload() {
  const ticket = ++request
  try {
    const received = await doRequest<RoundTwistState | null>('/round-twist')
    if (received && ticket === request) state.value = received
  } catch {
    if (ticket === request) state.value = { ...state.value, ids: [] }
  }
}
function name(id: string) { return state.value.players.find(p => p.id === id)?.name || id }
async function perform(operation: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await operation()
    await reload()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    busy.value = false
  }
}
function save(twist: string, data: object) {
  return perform(() => doRequest('/round-twist', {
    method: 'POST', body: JSON.stringify({ twist, round: state.value.round, ...data })
  }))
}
function rewind() {
  if (confirm('确认归档第一遍的 HOH、提名和 POV，然后从本轮 HOH 重新开始？')) return save('round_rewind', {})
}
function decide(use: boolean) {
  return perform(() => use ? bbUseVeto(nominee.value, name(nominee.value)) : bbSkipVeto())
}
watch(() => [props.currentRound, props.currentStage], () => {
  safe.value = first.value = second.value = partner.value = trustee.value = nominee.value = error.value = ''
  volunteer.value = appealAnswer.value = ''
  revive.value = tieSafe.value = coupHolder.value = ''
  coupPairs.value = [{ out: '', in: '' }, { out: '', in: '' }]
  reload()
}, { immediate: true })
useBbRefresh(reload)
</script>

<style scoped>
.round-twists { display:grid; gap:10px; margin-bottom:14px; color:#eee7fa }
article { background:#261c3b; border:1px solid #bba0f269; border-radius:10px; padding:14px }
h3,p { margin:0 0 7px }
p { color:#d8cee6; font-size:13px; line-height:1.5 }
.state { color:#f4d79c }
form { display:flex; flex-wrap:wrap; gap:7px }
select,button,input { border:1px solid #8e75ad; color:#faf2ff; background:#34254c; padding:7px; border-radius:6px; max-width:100% }
button { cursor:pointer }
button:disabled { cursor:default; opacity:.5 }
.error { color:#ffb9bd }
</style>
