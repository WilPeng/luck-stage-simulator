<template>
  <div class="house-map">
    <div class="map-title">
      <span class="map-icon">🏠</span>
      <span>BB House 平面图</span>
    </div>

    <!-- 当前位置 -->
    <div class="current-card">
      <span class="cur-icon">{{ currentRoom?.icon || '🏠' }}</span>
      <div class="cur-info">
        <div class="cur-label">你当前在</div>
        <div class="cur-name">{{ currentRoom?.name || currentRoomId }}</div>
      </div>
      <span v-if="currentCount" class="cur-count">{{ currentCount }} 人</span>
    </div>

    <!-- 可前往 -->
    <div class="section">
      <div class="section-title">🚪 可前往（相邻房间）</div>
      <div class="room-grid">
        <button
          v-for="r in reachableEnterable"
          :key="r.id"
          class="room-node enterable"
          @click="$emit('select-room', r.id)"
        >
          <span class="room-icon">{{ r.icon }}</span>
          <span class="room-name">{{ r.name }}</span>
          <span v-if="countOf(r.id) !== null" class="room-count">{{ countOf(r.id) }}人</span>
        </button>
        <div v-if="!reachableEnterable.length" class="empty">当前没有可进入的相邻房间</div>
      </div>
    </div>

    <!-- 相邻但不可进入 -->
    <div v-if="reachableDenied.length" class="section">
      <div class="section-title">🔒 相邻但暂不可进入</div>
      <div class="room-grid">
        <div v-for="r in reachableDenied" :key="r.id" class="room-node denied">
          <span class="room-icon">{{ r.icon }}</span>
          <span class="room-name">{{ r.name }}</span>
          <span class="deny-reason">{{ r.denyReason || '不可进入' }}</span>
        </div>
      </div>
    </div>

    <!-- 不相邻 -->
    <div v-if="otherRooms.length" class="section">
      <div class="section-title">🗺️ 其他房间（不相邻，需先经过相邻房间）</div>
      <div class="room-grid">
        <div v-for="r in otherRooms" :key="r.id" class="room-node far">
          <span class="room-icon">{{ r.icon }}</span>
          <span class="room-name">{{ r.name }}</span>
        </div>
      </div>
    </div>

    <!-- 后院门（仅在客厅/后院可见） -->
    <div v-if="showBackyardDoor" class="door-indicator" :class="{ open: backyardDoorOpen }">
      <span class="door-icon">{{ backyardDoorOpen ? '🟢' : '🔴' }}</span>
      <span class="door-label">后院门 {{ backyardDoorOpen ? 'OPEN' : 'CLOSED' }}</span>
      <span class="door-hint">{{ backyardDoorOpen ? '可经客厅前往后院' : '后院暂时无法进入' }}</span>
    </div>

    <!-- HOH 房门（仅在 HOH 房/房门口可见） -->
    <div v-if="showHohDoor" class="door-indicator" :class="{ open: hohDoorOpen }">
      <span class="door-icon">{{ hohDoorOpen ? '🟢' : '🔴' }}</span>
      <span class="door-label">HOH 房门 {{ hohDoorOpen ? 'OPEN' : 'CLOSED' }}</span>
      <span class="door-hint">{{ hohDoorOpen ? '可经 HOH 房门口进入' : '门已关闭，可在门口按门铃' }}</span>
    </div>

    <div class="legend">
      <span class="lg enterable">绿框</span>=可前往
      <span class="lg denied">🔒</span>=需条件
      <span class="lg far">灰</span>=不相邻
      <span class="lg-tip">提示：客厅是枢纽，大部分房间都与客厅相连；餐厅需先到厨房。</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BBHouseRoomWithCount } from '../../../types/bigbrother'

const props = defineProps<{
  rooms: BBHouseRoomWithCount[]
  currentRoomId: string
  reachableRooms: any[]
  backyardDoorOpen: boolean
  hohDoorOpen?: boolean
  showBackyardDoor?: boolean
  showHohDoor?: boolean
}>()

defineEmits<{
  (e: 'select-room', roomId: string): void
}>()

const currentRoom = computed(() => props.rooms.find(r => r.id === props.currentRoomId))
const currentCount = computed(() => currentRoom.value?.currentCount ?? null)

const reachableEnterable = computed(() => (props.reachableRooms || []).filter(r => r.canEnter))
const reachableDenied = computed(() => (props.reachableRooms || []).filter(r => !r.canEnter))
const otherRooms = computed(() => {
  const reachableSet = new Set((props.reachableRooms || []).map(r => r.id))
  return props.rooms.filter(r => r.id !== props.currentRoomId && !reachableSet.has(r.id))
})

function countOf(roomId: string) {
  const r = props.rooms.find(x => x.id === roomId)
  return r && r.currentCount != null ? r.currentCount : null
}
</script>

<style scoped>
.house-map {
  background: #0f0f2e;
  border: 1px solid #00ff8822;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.map-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: #e0e0e0; }
.map-icon { font-size: 18px; }

.current-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: linear-gradient(135deg, #0a2e1a, #0f0f2e);
  border: 1px solid #00ff88;
  border-radius: 10px;
  box-shadow: 0 0 14px #00ff8822;
}
.cur-icon { font-size: 30px; }
.cur-info { flex: 1; }
.cur-label { font-size: 11px; color: #7fd8a0; }
.cur-name { font-size: 18px; font-weight: 700; color: #00ff88; }
.cur-count { font-size: 12px; color: #00ff88; background: #00ff8815; padding: 2px 10px; border-radius: 10px; }

.section { display: flex; flex-direction: column; gap: 8px; }
.section-title { font-size: 12px; color: #8a8aa5; font-weight: 600; }
.room-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 8px; }
.empty { color: #666; font-size: 12px; padding: 8px 0; }

.room-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  background: #1a1a3e;
  border: 1px solid #ffffff10;
  border-radius: 10px;
  min-width: 0;
  position: relative;
  text-align: center;
}
.room-node.enterable {
  cursor: pointer;
  border-color: #00ff8844;
  background: #00ff8808;
  transition: all 0.18s ease;
}
.room-node.enterable:hover {
  border-color: #00ff88;
  background: #00ff8818;
  transform: translateY(-2px);
  box-shadow: 0 4px 14px #00ff8822;
}
.room-node.denied { border-color: #ffaa0044; background: #ffaa0008; }
.room-node.far { opacity: 0.5; }
.room-icon { font-size: 22px; }
.room-name { font-size: 12px; color: #ccc; font-weight: 500; }
.room-count { font-size: 10px; color: #00ff88; background: #00ff8815; padding: 1px 6px; border-radius: 8px; position: absolute; top: -6px; right: -6px; }
.deny-reason { font-size: 10px; color: #ffaa00; }

.door-indicator {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 10px; font-size: 12px;
  background: #ff444415; border: 1px solid #ff444433;
}
.door-indicator.open { background: #00ff8815; border-color: #00ff8833; }
.door-icon { font-size: 12px; }
.door-label { color: #aaa; font-weight: 600; }
.door-hint { color: #666; font-size: 11px; margin-left: auto; }

.legend { font-size: 11px; color: #666; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.lg { padding: 1px 8px; border-radius: 6px; }
.lg.enterable { color: #00ff88; background: #00ff8815; }
.lg.denied { color: #ffaa00; background: #ffaa0015; }
.lg.far { color: #aaa; background: #ffffff10; }
.lg-tip { color: #555; flex-basis: 100%; }
</style>
