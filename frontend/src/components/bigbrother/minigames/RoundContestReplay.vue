<template>
  <section class="stage">
    <header><h3>{{ titles[type] }}</h3>
      <label v-if="nodes.length">查看节点 <select v-model.number="index" @change="reset">
        <option v-for="(item, i) in nodes" :key="i" :value="i">{{ nodeLabel(item,i) }}</option>
      </select></label>
    </header>
    <p v-if="!node">这场比赛未保存对应的回合记录。</p>
    <div v-else :key="index">
      <template v-if="type==='german-heart'">
        <div v-if="node.cards" class="tiles"><b v-for="(card,i) in node.cards" :key="i">{{ card }}</b></div>
        <div v-else class="tiles"><b v-for="(count,fruit) in node.counts" :key="fruit">{{ fruit }} × {{ count }}</b></div>
        <details><summary>查看抢铃判定</summary><p>{{ node.valid ? node.fruit+' 恰好出现五次' : '没有水果恰好出现五次' }}</p>
          <p>抢铃成功 · {{ name(node.winnerId) }}</p><p v-if="node.wrong?.length">错误抢铃 · {{ node.wrong.map(name).join('、') }}</p></details>
      </template>
      <template v-else-if="type==='stay-or-fold'">
        <h4>找出 {{ node.target }}</h4><div v-if="node.grid" class="emoji">{{ node.grid.join(' ') }}</div><p v-else>本轮未保存原始图案排列。</p>
        <div class="seats"><article v-for="(estimate,id) in node.estimates" :key="id"><small>{{ name(id) }}</small><b>{{ estimate }}</b>{{ node.decisions?.[id] || '未决定' }}</article></div>
        <details><summary>揭晓真实数量</summary><h4>{{ node.trueCount }} 个</h4><p>本轮出局 · {{ node.eliminated?.map(name).join('、') || '无人' }}</p></details>
      </template>
      <template v-else-if="type==='number-divination'">
        <div class="tiles"><article v-for="(count,n) in node.counts" :key="n"><b>{{ n }}</b><small>{{ count }} 人出牌</small></article></div>
        <div class="seats"><article v-for="(n,id) in node.choices" :key="id"><small>{{ name(id) }}</small><b>{{ n }}</b>本轮 {{ node.deltas?.[id] ?? '—' }} 分</article></div>
      </template>
      <template v-else-if="type==='catch-mistress'">
        <div class="trail"><span v-for="location in meta.locations || []" :key="location" :class="{ searched:searchedPlaces.has(location), focus:location===node.locationName }">{{ location }}</span></div>
        <h4>{{ node.byName }} 揭开了 {{ node.locationName }}</h4>
        <details><summary>查看藏身点</summary><p>{{ node.special ? '全员被发现，揭开者获胜' : node.empty ? '这里没有人' : node.eliminated?.map((p:any)=>p.playerName).join('、')+' 被发现' }}</p></details>
      </template>
      <template v-else-if="type==='otev'">
        <h4>{{ node.clues?.join(' · ') }}</h4>
        <div class="seats"><article v-for="s in node.submissions" :key="s.position"><small>第 {{ s.position }} 位 · {{ s.playerName }}</small><b>{{ s.names?.join(' + ') }}</b>{{ s.auto ? '自动提交' : '主动提交' }}</article></div>
        <details><summary>查看抢座结果</summary><p>正确答案 · {{ node.answerNames?.join(' + ') }}</p><p>出局 · {{ node.eliminated?.playerName }}</p></details>
      </template>
      <template v-else-if="type==='describe-guess'">
        <h4>{{ node.clues?.[clue] || '描述未记录' }}</h4>
        <div class="trail"><button v-for="(_,i) in node.clues" :key="i" @click="clue=i">线索 {{ i+1 }}</button></div>
        <details><summary>查看猜测与答案</summary><p>答案 · {{ node.answer }}</p><div class="seats"><article v-for="p in participants" :key="p.playerId"><small>{{ p.playerName }}</small><b>{{ record(p.playerId)?.value ?? '未作答' }}</b><span v-if="record(p.playerId)?.clueCount">第 {{ record(p.playerId).clueCount }} 条线索时提交</span></article></div></details>
      </template>
      <template v-else>
        <div class="question-text" v-html="sanitizeRichText(question.text) || '无文字题面'"></div>
        <MediaPlayer v-if="question.media?.url" :key="question.id" :media="{ ...question.media, playMode:'free' }" />
        <div class="tiles"><span v-for="option in question.options || []" :key="String(option)">{{ option }}</span></div>
        <details><summary>查看提交与判定</summary>
          <p>标准答案 · {{ question.correctAnswer || '管理员评判' }}</p>
          <p v-if="type==='power-challenge'">占领者 · {{ meta.questionWinners?.[question.id]?.playerName || '无人' }}</p>
          <div v-else class="seats"><article v-for="p in participants" :key="p.playerId"><small>{{ p.playerName }}</small><b>{{ submitted(p.playerId) ?? '未作答' }}</b></article></div>
        </details>
      </template>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import MediaPlayer from './MediaPlayer.vue'
import { sanitizeRichText } from '../../../utils/richText'
const props = defineProps<{meta:any;participants:any[]}>()
const titles:Record<string,string>={'german-heart':'抢铃牌桌','stay-or-fold':'估算现场','number-divination':'数字出牌台','catch-mistress':'地点搜索','otev':'抢座顺序','describe-guess':'描述线索','power-challenge':'题目争夺','custom':'比赛题面','custom-mode':'回合题面'}
const type=computed(()=>props.meta.type)
const nodes=computed<any[]>(()=>props.meta.revealLog || props.meta.history || props.meta.rounds || props.meta.questions || [])
const index=ref(0), clue=ref(0)
const node=computed(()=>nodes.value[index.value])
const searchedPlaces=computed(()=>new Set(nodes.value.slice(0,index.value+1).map(r=>r.locationName)))
const question=computed(()=>node.value?.question || node.value || {})
function reset(){clue.value=0}
function name(id:unknown){return props.participants.find(p=>p.playerId===id)?.playerName || id || '无人'}
function nodeLabel(n:any,i:number){return n.locationName || (n.round!=null?'第 '+n.round+' 轮':'第 '+(i+1)+' 项')}
function record(id:string){return props.meta.players?.[id]?.records?.[index.value]}
function submitted(id:string){
  if(type.value==='custom-mode') return node.value.players?.find((p:any)=>p.playerId===id)?.answer
  return props.meta.players?.[id]?.answers?.find((a:any)=>a.qid===question.value.id)?.userAnswer
}
</script>
<style scoped>
.stage {background:linear-gradient(135deg,#24213d,#14192d);border:1px solid #584d76;border-radius:14px;padding:clamp(14px,3vw,26px);color:#e5e1ef}
header,.tiles,.seats,.trail {display:flex;flex-wrap:wrap;gap:10px;align-items:center}
header {justify-content:space-between}h3 {margin:0;font-size:16px;color:#e9d59e}h4,.question-text {font-size:clamp(20px,3vw,30px);line-height:1.45;margin:16px 0}
.question-text {font-weight:700;white-space:pre-line;overflow-wrap:anywhere}
select,button {background:#302944;color:#ede8ff;border:1px solid #716388;border-radius:6px;padding:7px;cursor:pointer}
.trail>span {padding:7px;background:#242237;border-radius:5px}.trail>.searched {color:#b0d6d1}.trail>.focus {outline:2px solid #e6c988}
.tiles,.seats,.trail,.emoji {margin:18px 0}.tiles>b,.tiles>span,.tiles>article {background:#f4eee1;color:#262239;border-radius:7px;padding:9px 13px;font-size:20px}
article {display:grid;gap:6px}.seats article {padding:12px;background:#ffffff0b;border-radius:9px;min-width:100px}
small {font-size:12px}.emoji {line-height:1.45;max-height:320px;overflow:auto}details {margin-top:15px;border-top:1px solid #ffffff21;padding-top:12px}summary {cursor:pointer;color:#c9b5ed}
</style>
