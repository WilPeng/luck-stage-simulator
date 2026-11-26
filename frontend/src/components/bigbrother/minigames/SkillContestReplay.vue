<template>
  <section class="contest" v-if="columns.length">
    <header><strong>{{ title }}</strong><label>查看节点
      <select v-model.number="step"><option v-for="(col, i) in columns" :key="i" :value="i">{{ col }}</option></select>
    </label></header>
    <article v-for="(row, i) in table.rows" :key="i">
      <div class="caption"><b>{{ row[0] }}</b><strong>{{ row[step+1] ?? '未记录' }}{{ unit }}</strong></div>
      <progress v-if="meta.type === 'click-speed'" :value="row[step+1]" :max="raceMax"></progress>
      <template v-else-if="meta.type === 'balance-bar' || meta.type === 'swing-pointer'">
        <div v-if="position(i) != null" class="track">
          <span v-if="meta.zone" class="zone" :style="{ left: (50-meta.zone*100)+'%', width: (meta.zone*200)+'%' }"></span>
          <i :style="{ left: (position(i)! * 100)+'%' }"></i>
        </div>
        <small v-else>此节点未记录指针位置</small>
      </template>
      <div v-else class="lamps"><span v-for="(col, j) in columns" :key="j" :class="{ current: j === step }">{{ col }}</span></div>
      <small v-if="signal(i)">信号亮起 {{ signal(i).green }} ms · 点击 {{ signal(i).elapsed }} ms · {{ signal(i).early ? '抢跑' : '有效' }}</small>
    </article>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
const props = defineProps<{ meta: any }>()
const step = ref(0)
const table = computed(() => props.meta.tables?.[0] || {})
const columns = computed<string[]>(() => (table.value.columns || []).slice(1, props.meta.type === 'reaction' ? -1 : undefined))
const titles: Record<string,string> = { 'reaction':'信号面板', 'balance-bar':'平衡区停留时间', 'swing-pointer':'指针落点', 'click-speed':'点击赛道' }
const title = computed(() => titles[props.meta.type])
const unit = computed(() => ({'click-speed':' 次','balance-bar':' 秒'} as Record<string,string>)[props.meta.type] || '')
const raceMax = computed(() => Math.max(1,...(props.meta.players || []).map((p:any)=>p.score)))
function id(i:number) { return props.meta.players?.[i]?.playerId }
function position(i:number):number|undefined {
  if (props.meta.type === 'swing-pointer') return props.meta.positions?.[id(i)]?.[step.value]
  return props.meta.samples?.[id(i)]?.find((p:any)=>p.sec===step.value+1)?.position
}
function signal(i:number) { return props.meta.signals?.[id(i)]?.[step.value] }
</script>
<style scoped>
.contest {background:#17182e;border:1px solid #615486;border-radius:14px;padding:18px;color:#e9e6fa}
header,.caption {display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
select {margin-left:8px;padding:6px;background:#292441;color:inherit}
article {padding:14px 0;border-bottom:1px solid #ffffff19}
strong {color:#e8c989}progress,.track {width:100%;height:12px;margin-top:10px;accent-color:#ad99ed}
.track {background:linear-gradient(90deg,#56344b,#45405f 49%,#fff 50%,#45405f 51%,#56344b);position:relative;border-radius:8px}
.zone,.track i {position:absolute;height:100%;background:#63967b}.track i {background:white;width:4px;transform:translateX(-50%)}
.lamps {display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}.lamps span {padding:6px;background:#302845;border-radius:5px}.lamps .current {background:#a2e4c8;color:#132e27}
small {display:block;color:#bac1d6;margin-top:6px}
</style>
