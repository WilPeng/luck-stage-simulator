<template>
  <div class="bb-guest-state">
    <div class="page-header">
      <h1>😴🚿 房客睡眠 / 洗澡记录</h1>
      <span class="today">今天：{{ today }}</span>
    </div>

    <div class="table-wrapper">
      <table class="state-table">
        <thead>
          <tr>
            <th>房客</th>
            <th>位置</th>
            <th>睡觉</th>
            <th>洗澡</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in guests.filter(x => x.role === 'houseguest')" :key="g.id">
            <td class="name-cell">
              <BBAvatar :name="g.name" :avatar="g.avatar" size="sm" />
              <span>{{ g.name }}</span>
            </td>
            <td>{{ roomName(g.currentRoomId) }}</td>
            <td>
              <span v-if="g.isSleeping" class="badge sleeping">睡眠中</span>
              <span v-else-if="g.lastSleepDate === today" class="badge ok">今天已睡</span>
              <span v-else class="badge none">未完成</span>
            </td>
            <td>
              <span v-if="g.isShowering" class="badge showering">洗澡中</span>
              <span v-else-if="g.lastShowerDate === today" class="badge ok">今天已洗</span>
              <span v-else class="badge none">未完成</span>
            </td>
            <td class="actions">
              <button class="bb-btn-xs" @click="setSleep(g, true)">设为已睡</button>
              <button class="bb-btn-xs" @click="setSleep(g, false)">清除睡眠</button>
              <button class="bb-btn-xs" @click="setShower(g, true)">设为已洗</button>
              <button class="bb-btn-xs" @click="setShower(g, false)">清除洗澡</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { bbAdminGuestStates, bbAdminSetSleep, bbAdminSetShower, bbGetHouseRooms } from '../../../services/bbHouseApi'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'

const guests = ref<any[]>([])
const rooms = ref<any[]>([])
const today = ref('')
let timer: ReturnType<typeof setInterval> | null = null

function roomName(id: string) {
  return rooms.value.find(r => r.id === id)?.name || id
}

async function load() {
  try {
    const res = await bbAdminGuestStates()
    guests.value = res?.data || []
    today.value = res?.today || ''
  } catch {}
}

async function setSleep(g: any, sleeping: boolean) {
  try { await bbAdminSetSleep(g.id, sleeping); await load() } catch (e: any) { alert(e?.message || '失败') }
}
async function setShower(g: any, showered: boolean) {
  try { await bbAdminSetShower(g.id, showered); await load() } catch (e: any) { alert(e?.message || '失败') }
}

onMounted(async () => {
  try { rooms.value = await bbGetHouseRooms() || [] } catch {}
  await load()
  timer = setInterval(load, 8000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.bb-guest-state { max-width: 1000px; margin: 0 auto; padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h1 { font-size: 22px; color: #e0e0e0; margin: 0; }
.today { color: #888; font-size: 13px; }
.table-wrapper { overflow-x: auto; }
.state-table { width: 100%; border-collapse: collapse; }
.state-table th, .state-table td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #ffffff12; font-size: 13px; color: #ddd; }
.state-table th { color: #888; font-size: 12px; }
.name-cell { display: flex; align-items: center; gap: 8px; }
.badge { padding: 2px 10px; border-radius: 10px; font-size: 11px; }
.badge.ok { background: #00ff8822; color: #00ff88; }
.badge.sleeping { background: #4488ff22; color: #7fb0ff; }
.badge.showering { background: #00c8ff22; color: #7fd8ff; }
.badge.none { background: #ffffff10; color: #888; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.bb-btn-xs { padding: 3px 10px; font-size: 11px; background: transparent; border: 1px solid #00ff8844; color: #00ff88; border-radius: 4px; cursor: pointer; }
.bb-btn-xs:hover { background: #00ff8822; }
</style>
