<template>
  <div class="house-map">
    <div class="map-title">
      <span class="map-icon">🏠</span>
      <span>BB House 平面图</span>
    </div>

    <!-- HOH Room -->
    <div class="map-row center">
      <div class="room-node" :class="roomClass('hoh_room')" @click="$emit('select-room', 'hoh_room')">
        <span class="room-icon">👑</span>
        <span class="room-name">HOH 房</span>
        <span v-if="roomCounts['hoh_room']" class="room-count">{{ roomCounts['hoh_room'] }}人</span>
      </div>
    </div>

    <!-- Hallway -->
    <div class="map-row center">
      <div class="hallway-line"></div>
      <span class="hallway-label">走廊</span>
      <div class="hallway-line"></div>
    </div>

    <!-- Bedrooms -->
    <div class="map-row spread">
      <div class="room-node" :class="roomClass('bedroom_a')" @click="$emit('select-room', 'bedroom_a')">
        <span class="room-icon">🛏️</span>
        <span class="room-name">卧室 A</span>
        <span v-if="roomCounts['bedroom_a']" class="room-count">{{ roomCounts['bedroom_a'] }}人</span>
      </div>
      <div class="room-node" :class="roomClass('bedroom_b')" @click="$emit('select-room', 'bedroom_b')">
        <span class="room-icon">🛏️</span>
        <span class="room-name">卧室 B</span>
        <span v-if="roomCounts['bedroom_b']" class="room-count">{{ roomCounts['bedroom_b'] }}人</span>
      </div>
    </div>

    <!-- Hallway -->
    <div class="map-row center">
      <div class="hallway-line"></div>
      <span class="hallway-label">走廊</span>
      <div class="hallway-line"></div>
    </div>

    <!-- Living Room (core) -->
    <div class="map-row center">
      <div class="room-node core" :class="roomClass('living_room')" @click="$emit('select-room', 'living_room')">
        <span class="room-icon">🛋️</span>
        <span class="room-name">客厅</span>
        <span class="room-sub">核心枢纽</span>
        <span v-if="roomCounts['living_room']" class="room-count">{{ roomCounts['living_room'] }}人</span>
      </div>
    </div>

    <!-- Connector lines -->
    <div class="map-row center">
      <div class="connector-vertical"></div>
    </div>

    <!-- Connected rooms -->
    <div class="map-row spread">
      <div class="room-node" :class="roomClass('kitchen')" @click="$emit('select-room', 'kitchen')">
        <span class="room-icon">🍳</span>
        <span class="room-name">厨房</span>
        <span v-if="roomCounts['kitchen']" class="room-count">{{ roomCounts['kitchen'] }}人</span>
      </div>
      <div class="room-node" :class="roomClass('gym')" @click="$emit('select-room', 'gym')">
        <span class="room-icon">🏋️</span>
        <span class="room-name">健身房</span>
        <span v-if="roomCounts['gym']" class="room-count">{{ roomCounts['gym'] }}人</span>
      </div>
      <div class="room-node" :class="roomClass('bathroom')" @click="$emit('select-room', 'bathroom')">
        <span class="room-icon">🚿</span>
        <span class="room-name">浴室</span>
        <span v-if="roomCounts['bathroom']" class="room-count">{{ roomCounts['bathroom'] }}人</span>
      </div>
    </div>

    <div class="map-row spread">
      <div class="room-node" :class="roomClass('storage_room')" @click="$emit('select-room', 'storage_room')">
        <span class="room-icon">📦</span>
        <span class="room-name">储物间</span>
        <span v-if="roomCounts['storage_room']" class="room-count">{{ roomCounts['storage_room'] }}人</span>
      </div>
      <div class="room-node" :class="roomClass('have_not_room')" @click="$emit('select-room', 'have_not_room')">
        <span class="room-icon">🥶</span>
        <span class="room-name">贫民屋</span>
        <span v-if="roomCounts['have_not_room']" class="room-count">{{ roomCounts['have_not_room'] }}人</span>
      </div>
      <div class="room-node" :class="roomClass('dining_room')" @click="$emit('select-room', 'dining_room')">
        <span class="room-icon">🍽️</span>
        <span class="room-name">餐厅</span>
        <span v-if="roomCounts['dining_room']" class="room-count">{{ roomCounts['dining_room'] }}人</span>
      </div>
    </div>

    <!-- Backyard door -->
    <div class="map-row center">
      <div class="door-indicator" :class="{ open: backyardDoorOpen }">
        <span class="door-icon">{{ backyardDoorOpen ? '🟢' : '🔴' }}</span>
        <span class="door-label">后院门 {{ backyardDoorOpen ? 'OPEN' : 'CLOSED' }}</span>
      </div>
    </div>

    <!-- Backyard -->
    <div class="map-row center">
      <div class="room-node outdoor" :class="{ ...roomClass('backyard'), locked: !backyardDoorOpen }"
        @click="backyardDoorOpen && $emit('select-room', 'backyard')">
        <span class="room-icon">🌴</span>
        <span class="room-name">后院</span>
        <span v-if="roomCounts['backyard']" class="room-count">{{ roomCounts['backyard'] }}人</span>
        <span v-if="!backyardDoorOpen" class="room-locked">🔒 门已关闭</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BBHouseRoomWithCount } from '../../../types/bigbrother'

const props = defineProps<{
  rooms: BBHouseRoomWithCount[]
  currentRoomId: string
  reachableIds: string[]
  backyardDoorOpen: boolean
}>()

defineEmits<{
  (e: 'select-room', roomId: string): void
}>()

const roomCounts: Record<string, number> = {}
for (const r of props.rooms) {
  roomCounts[r.id] = r.currentCount
}

function roomClass(roomId: string): Record<string, boolean> {
  return {
    active: roomId === props.currentRoomId,
    reachable: props.reachableIds.includes(roomId) && roomId !== props.currentRoomId,
    current: roomId === props.currentRoomId,
  }
}
</script>

<style scoped>
.house-map {
  background: #0f0f2e;
  border: 1px solid #00ff8822;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.map-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #e0e0e0;
  margin-bottom: 8px;
}
.map-icon { font-size: 18px; }
.map-row {
  display: flex;
  gap: 10px;
}
.map-row.center { justify-content: center; }
.map-row.spread { justify-content: space-between; }

.room-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  background: #1a1a3e;
  border: 1px solid #ffffff10;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 90px;
  position: relative;
}
.room-node:hover {
  border-color: #00ff8844;
  background: #1a1a3e;
}
.room-node.reachable {
  border-color: #00ff8844;
  background: #00ff8808;
}
.room-node.reachable:hover {
  border-color: #00ff88;
  background: #00ff8815;
  transform: translateY(-1px);
}
.room-node.current, .room-node.active {
  border-color: #00ff88;
  background: #00ff8815;
  box-shadow: 0 0 12px #00ff8822;
}
.room-node.core {
  min-width: 140px;
  padding: 14px 20px;
}
.room-node.outdoor {
  border-style: dashed;
}
.room-node.locked {
  opacity: 0.5;
  cursor: not-allowed;
}
.room-icon { font-size: 22px; }
.room-name { font-size: 12px; color: #ccc; font-weight: 500; }
.room-sub { font-size: 10px; color: #666; }
.room-count {
  font-size: 10px;
  color: #00ff88;
  background: #00ff8815;
  padding: 1px 6px;
  border-radius: 8px;
  position: absolute;
  top: -6px;
  right: -6px;
}
.room-locked {
  font-size: 10px;
  color: #ff6b6b;
}

.hallway-line {
  width: 40px;
  height: 1px;
  background: #ffffff15;
}
.hallway-label {
  font-size: 10px;
  color: #555;
  padding: 0 6px;
}
.connector-vertical {
  width: 1px;
  height: 12px;
  background: #ffffff15;
}

.door-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 11px;
  background: #ff444415;
  border: 1px solid #ff444433;
}
.door-indicator.open {
  background: #00ff8815;
  border-color: #00ff8833;
}
.door-icon { font-size: 12px; }
.door-label { color: #aaa; font-weight: 500; }
</style>
