<template>
  <div class="challenge-page">
    <header class="page-header"><div><h1>变数挑战</h1><p v-if="data">第 {{ data.round }} 周</p></div>
      <button type="button" @click="load">刷新</button>
    </header>
    <p v-if="data?.admin">上方的本轮变数面板可以手动录入。站内比赛结束后，点击「采用比赛结果」即可推进对应规则。</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="data && !data.slots.length">当前没有可查看的变数比赛。</p>
    <article v-for="slot in data?.slots" :key="slot.key">
      <h2>{{ slot.title }}</h2>
      <p>参赛名单：{{ slot.roster.map(p => p.name).join('、') || '暂无' }}</p>
      <p v-if="slot.room && !slot.room.spectatorState">{{ data?.gameChoices[slot.room.minigameId] }} · {{ statusLabels[slot.room.status] || slot.room.status }}</p>
      <template v-if="data?.admin">
        <form v-if="!slot.room || slot.room.status === 'finished'" @submit.prevent="operate(slot, 'create')">
          <label>小游戏
            <select v-model="choices[slot.key]">
              <option value="">选择小游戏</option>
              <option v-for="(name,id) in data.gameChoices" :key="id" :value="id">{{ name }}</option>
            </select>
          </label>
          <button :disabled="busy || !choices[slot.key] || slot.roster.length < 2">{{ slot.room ? '重新开赛' : '创建比赛房间' }}</button>
        </form>
        <div v-if="slot.room?.status === 'waiting'" class="actions">
          <button :disabled="busy" @click="operate(slot, 'start')">开始 · 倒计时 10 秒</button>
          <button :disabled="busy" @click="operate(slot, 'cancel')">取消房间</button>
        </div>
        <button v-if="slot.room?.status === 'playing'" :disabled="busy" @click="operate(slot,'stop')">停止比赛</button>
        <template v-if="slot.room && !['waiting','finished'].includes(slot.room.status)">
          <button @click="observing = observing === slot.key ? '' : slot.key">{{ observing === slot.key ? '收起观战' : '实时观战' }}</button>
          <MinigameObserver v-if="observing === slot.key" :key="slot.room.roomId" :room-id="slot.room.roomId" :room="slot.room" />
        </template>
        <button v-if="slot.room?.validResult && slot.room.status === 'finished'" :disabled="busy" @click="applyResult(slot)">采用比赛结果</button>
        <p v-if="slot.interrupted">房间已断开，可以重新开赛。</p>
      </template>
      <MinigameSpectatorPanel v-else-if="slot.room?.spectatorState"
        :title="data?.gameChoices[slot.room.minigameId]" :game-id="slot.room.minigameId"
        :status="slot.room.status" :players="slot.room.spectatorState" />
      <template v-else-if="slot.room">
        <MinigameLobby v-if="slot.room.status === 'waiting'" :key="slot.room.roomId" :room-id="slot.room.roomId"
          :game-title="data?.gameChoices[slot.room.minigameId]" :participants="slot.room.participants" :my-id="myId" />
        <component v-else-if="['countdown','playing','paused'].includes(slot.room.status)"
          :is="components[slot.room.minigameId]" :key="slot.room.roomId" :room-id="slot.room.roomId"
          :participants="slot.room.participants" @finished="load" />
      </template>
      <p v-else>等待管理员开启小游戏。</p>
      <p v-if="slot.room?.status === 'finished'" class="result">
        {{ slot.room.validResult ? '小游戏胜者：' + slot.room.winner?.playerName + '。等待管理员确认。' : '本场没有可采用的单一胜者，可以重赛或手动录入。' }}
      </p>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import { doRequest } from '../../services/bbApi'
import { useBbAuthStore } from '../../stores/bbAuthStore'
import MinigameLobby from '../../components/bigbrother/MinigameLobby.vue'
import MinigameObserver from '../../components/bigbrother/MinigameObserver.vue'
import MinigameSpectatorPanel from '../../components/bigbrother/MinigameSpectatorPanel.vue'
import type { MinigameSpectatorPlayer } from '../../types/bigbrother'
import QuickMathGame from '../../components/bigbrother/minigames/QuickMathGame.vue'
import DiceDuelGame from '../../components/bigbrother/minigames/DiceDuelGame.vue'
import ReactionGame from '../../components/bigbrother/minigames/ReactionGame.vue'
import SwingPointerGame from '../../components/bigbrother/minigames/SwingPointerGame.vue'

interface Player { id:string; name:string }
interface Room {
  roomId:string; status:string; minigameId:string
  participants:{playerId:string;playerName:string}[]
  winner?:{playerId:string;playerName:string}; validResult:boolean
  spectatorState?: MinigameSpectatorPlayer[]
}
interface Slot { key:string; title:string; roster:Player[]; room:Room|null; interrupted:boolean }
interface ChallengePage { round:number; admin:boolean; gameChoices:Record<string,string>; slots:Slot[] }
const components:Record<string,Component> = { 'quick-math':QuickMathGame,'dice-duel':DiceDuelGame,'reaction':ReactionGame,'swing-pointer':SwingPointerGame }
const statusLabels:Record<string,string> = { waiting:'等待选手',countdown:'倒计时',playing:'进行中',paused:'已暂停',finished:'已结束' }
const auth = useBbAuthStore()
const myId = computed(() => auth.currentUser?.id || '')
const data = ref<ChallengePage|null>(null)
const choices = ref<Record<string,string>>({})
const observing = ref('')
const error = ref('')
const notice = ref('')
const busy = ref(false)
let timer:ReturnType<typeof setInterval>
let request = 0
async function load() {
  const version = ++request
  try {
    const result = await doRequest<ChallengePage>('/round-twist/challenges')
    if(version === request) data.value = result
  } catch(e) {
    if(version === request && !data.value) error.value = e instanceof Error ? e.message : '加载失败'
  }
}
async function send(path:string, payload:Record<string,unknown>) {
  if(busy.value) return
  busy.value = true
  error.value = notice.value = ''
  try {
    await doRequest(path, {method:'POST',body:JSON.stringify({round:data.value?.round,...payload})})
    if(payload.challengeKey) notice.value = '已采用小游戏结果，本轮赛制已更新。'
    await load()
  } catch(e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally { busy.value = false }
}
function operate(slot:Slot, action:string) {
  return send('/round-twist/challenges', {key:slot.key,action,minigameId:choices.value[slot.key]})
}
function applyResult(slot:Slot) {
  return send('/round-twist', {challengeKey:slot.key})
}
onMounted(() => { load(); timer = setInterval(load, 1800) })
onUnmounted(() => { clearInterval(timer); request++ })
</script>

<style scoped>
.challenge-page { display:grid; gap:14px; max-width:950px; margin:0 auto; color:#f0eafa }
header,.actions,form { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px }
form,.actions { justify-content:flex-start }
h1,h2,p { margin:0 }
h1 {font-size:24px} h2 {font-size:19px}
p { color:#d9cce9; line-height:1.6 }
article { display:grid; gap:10px; padding:15px; background:#211833; border:1px solid #6b5883; border-radius:12px }
button,select { padding:8px 12px; color:#f2ebff; background:#382b50; border:1px solid #a08aba; border-radius:7px }
button { width:fit-content; cursor:pointer } button:disabled { opacity:.5; cursor:default }
select { margin-left:5px } .error { color:#ffb9bc } .result { color:#f2d594 }
</style>
