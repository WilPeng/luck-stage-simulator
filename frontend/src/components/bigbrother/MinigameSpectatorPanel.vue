<template>
  <section class="bb-spectator" aria-label="比赛观战">
    <header class="spectator-header">
      <div>
        <h2>实时观战</h2>
        <p v-if="title">{{ title }}</p>
      </div>
      <span class="stage" :class="status" role="status">{{ statusText }}</span>
    </header>

    <ul class="roster" aria-label="参赛选手进度">
      <li v-for="player in players" :key="player.playerId" class="player">
        <BBAvatar :name="player.playerName" :avatar="player.avatar" size="sm" />
        <div class="player-info">
          <strong>{{ player.playerName }}</strong>
          <span>{{ playerStatus(player) }}</span>
        </div>
        <div class="metrics">
          <span v-if="player.progress !== null && player.max !== null && player.max > 0">
            进度 {{ player.progress }} / {{ player.max }}
          </span>
          <span v-if="player.score !== null && (player.score !== player.progress || !player.max || gameId in scoreLabels)">
            {{ scoreLabel }} {{ formatScore(player.score) }}
          </span>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BBAvatar from './BBAvatar.vue'
import type { MinigameSpectatorPlayer } from '../../types/bigbrother'

const props = defineProps<{
  title?: string
  gameId: string
  status: string
  players: MinigameSpectatorPlayer[]
}>()

const statusText = computed(() => {
  if (props.status === 'countdown') return '即将开始'
  if (props.status === 'paused') return '已暂停'
  return '进行中'
})

const scoreLabels: Record<string, string> = {
  'balance-bar': '累计时长',
  'click-speed': '点击次数',
  'reaction': '耗时',
  'poker17': '筹码',
  'poison-drink': '生命值',
}
const scoreLabel = computed(() => scoreLabels[props.gameId] || '成绩')

function formatScore(score: number) {
  if (props.gameId === 'balance-bar') return `${(score / 1000).toFixed(1)} 秒`
  if (props.gameId === 'reaction') return score > 0 ? `${score} 毫秒` : '待判定'
  return score
}

function playerStatus(player: MinigameSpectatorPlayer) {
  if (player.eliminated) return '已淘汰'
  if (player.done) return '已完成'
  if (!player.connected) return '未连接'
  if (props.status === 'countdown') return '已连接'
  if (props.status === 'paused') return '比赛暂停'
  return '比赛中'
}
</script>

<style scoped>
.bb-spectator {
  margin: 16px 0;
  overflow: hidden;
  color: #f0eafa;
  background: #211833;
  border: 1px solid #6b5883;
  border-radius: 12px;
}
.spectator-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
}
h2, p { margin: 0; }
h2 { font-size: 17px; }
p { margin-top: 4px; color: #c4b6db; font-size: 13px; }
.stage { padding: 4px 9px; border-radius: 8px; background: #382b50; font-size: 12px; white-space: nowrap; }
.stage.playing { color: #b6f2cc; background: #214139; }
.stage.paused { color: #f5d58d; background: #463721; }
.roster { display: grid; margin: 0; padding: 0; list-style: none; }
.player {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 12px 16px;
  border-top: 1px solid #473758;
}
.player-info { display: grid; min-width: 0; flex: 1; gap: 3px; overflow-wrap: anywhere; }
.player-info span, .metrics { color: #c4b6db; font-size: 12px; }
.metrics { display: grid; gap: 4px; text-align: right; font-variant-numeric: tabular-nums; }
</style>
