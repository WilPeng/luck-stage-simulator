<template>
  <div class="hgv-admin-board">
    <div class="hgvab-head">
      <span class="hgvab-phase">{{ board.phaseLabel || board.phase }}</span>
      <span v-if="board.currentTurnName" class="hgvab-turn">
        行动：{{ board.currentTurnName }}
        <i v-if="board.actionsLeft">（剩 {{ board.actionsLeft }} 次）</i>
      </span>
      <span>存活 {{ board.aliveCount }} 人</span>
      <span>隐藏卡牌 {{ board.hiddenCount }} 张</span>
      <span class="hgvab-destruction">破坏度 {{ board.destruction || 0 }}%</span>
    </div>

    <div class="hgvab-players">
      <span
        v-for="p in board.players || []"
        :key="p.playerId"
        class="hgvab-player"
        :class="{ out: p.eliminated, winner: p.playerId === board.winnerId }"
      >
        <b>{{ p.playerName }}</b>
        <i>🃏 {{ p.hideSpotName }}</i>
        <i>翻 {{ p.searches }} · 找到 {{ p.finds }}</i>
        <em v-if="p.playerId === board.winnerId">🏆</em>
        <em v-else-if="p.eliminated">被 {{ p.foundByName || '?' }} 找到</em>
      </span>
    </div>

    <div class="hgvab-house">
      <section v-for="room in board.rooms || []" :key="room.id" class="hgvab-room">
        <div class="hgvab-room-head">
          <span>{{ room.icon }} {{ room.name }}</span>
          <span class="hgvab-room-tip">👁 管理员可见</span>
        </div>
        <div class="hgvab-spots">
          <div
            v-for="spot in room.spots"
            :key="spot.id"
            class="hgvab-spot"
            :class="{
              hidden: !spot.searched && spot.owners && spot.owners.length,
              empty: spot.searched && !(spot.found && spot.found.length),
              found: spot.searched && spot.found && spot.found.length
            }"
          >
            <div class="hgvab-spot-name">{{ spot.icon }} {{ spot.name }}</div>
            <div v-if="!spot.searched && spot.owners && spot.owners.length" class="hgvab-owners">
              🃏 {{ spot.owners.join('、') }}
            </div>
            <div v-else-if="!spot.searched" class="hgvab-note dim">空</div>
            <div v-else-if="spot.found && spot.found.length" class="hgvab-note found">
              已翻出：{{ spot.found.join('、') }}
              <i v-if="spot.searchedByName">（{{ spot.searchedByName }}）</i>
            </div>
            <div v-else class="hgvab-note dim">已翻空</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ board: any }>()
</script>

<style scoped>
.hgv-admin-board { background: #120a22; border: 1px solid #e6c98833; border-radius: 10px; padding: 10px; }
.hgvab-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; font-size: 12px; color: #b9c6e6; }
.hgvab-phase { color: #e6c988; font-weight: 700; }
.hgvab-turn { color: #b39bff; }
.hgvab-turn i { font-style: normal; color: #8f83b8; }
.hgvab-destruction { margin-left: auto; color: #ff9a9a; }
.hgvab-players { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.hgvab-player { display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; border-radius: 6px; background: #1b1433; border: 1px solid #ffffff10; font-size: 10.5px; color: #b9c6e6; }
.hgvab-player b { color: #e0d7ff; font-weight: 600; }
.hgvab-player i { font-style: normal; color: #8f83b8; }
.hgvab-player em { font-style: normal; color: #ff9a9a; }
.hgvab-player.out { opacity: 0.6; }
.hgvab-player.winner { border-color: #e6c988; background: #e6c98812; }
.hgvab-player.winner em { color: #e6c988; }
.hgvab-house { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.hgvab-room { background: #17112a; border: 1px solid #ffffff0d; border-radius: 8px; padding: 7px; }
.hgvab-room-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px; font-weight: 600; color: #cfc4ea; margin-bottom: 6px; }
.hgvab-room-tip { font-size: 9.5px; color: #6b5f92; font-weight: 400; }
.hgvab-spots { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 4px; }
.hgvab-spot { padding: 5px 6px; border-radius: 6px; background: #1b1433; border: 1px solid #ffffff0e; font-size: 10.5px; color: #b9c6e6; }
.hgvab-spot.hidden { border-color: #e6c98855; background: #221c14; }
.hgvab-spot.found { border-color: #ff6b6b44; background: #2a1118; }
.hgvab-spot.empty { opacity: 0.6; }
.hgvab-spot-name { color: #e0d7ff; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hgvab-owners { color: #e6c988; margin-top: 2px; word-break: break-word; }
.hgvab-note { margin-top: 2px; color: #ff9a9a; word-break: break-word; }
.hgvab-note i { font-style: normal; color: #8f83b8; }
.hgvab-note.dim { color: #4b416b; }
@media (max-width: 640px) {
  .hgvab-house { grid-template-columns: 1fr; }
}
</style>
