<template>
  <div class="free-team-page">
    <div class="page-header">
      <h1>🙋 自由组建</h1>
      <p>第{{ currentRound }}公演 · 加入你想要的队伍（满员即锁定，首位加入者自动成为队长）</p>
    </div>

    <div v-if="myTeamId" class="my-team-banner">
      你已加入：<strong>{{ myTeamName }}</strong>
    </div>

    <div class="teams-grid">
      <div
        v-for="t in teams"
        :key="t.id"
        class="team-card"
        :class="{ mine: t.id === myTeamId, full: t.memberCount >= t.maxMembers }"
      >
        <div class="tc-head">
          <span class="tc-name">{{ t.name }}</span>
          <span class="tc-count">{{ t.memberCount }}/{{ t.maxMembers }}</span>
        </div>
        <div class="tc-members">
          <span v-for="(m, i) in t.members" :key="i" class="member-chip">
            {{ m.player?.name || m.playerName || m.playerId }}
            <em v-if="m.playerId === t.captainId">队长</em>
          </span>
          <span v-if="t.members.length === 0" class="empty">暂无成员</span>
        </div>
        <div class="tc-actions">
          <t-button v-if="t.id === myTeamId" theme="danger" variant="outline" :loading="busy" @click="handleLeave">退出队伍</t-button>
          <t-button
            v-else-if="!myTeamId && t.memberCount < t.maxMembers"
            theme="primary"
            :loading="busy"
            @click="handleJoin(t.id)"
          >加入</t-button>
          <t-button v-else theme="default" disabled>{{ t.memberCount >= t.maxMembers ? '已满员' : '已加入其他队' }}</t-button>
        </div>
      </div>
      <t-empty v-if="teams.length === 0" description="管理员尚未配置队伍结构" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { getFreeTeams, joinFreeTeam, leaveFreeTeam } from '../../services/api'
import { useSfRefresh } from '../../composables/useSfRefresh'

const route = useRoute()
const currentRound = computed(() => parseInt(route.params.round as string) || 1)
const roundId = computed(() => `round-${currentRound.value}`)

const teams = ref<any[]>([])
const myTeamId = ref<string | null>(null)
const busy = ref(false)

const myTeamName = computed(() => teams.value.find(t => t.id === myTeamId.value)?.name || '')

async function load() {
  try {
    const res: any = await getFreeTeams(roundId.value)
    teams.value = res?.teams || []
    myTeamId.value = res?.myTeamId || null
  } catch (e: any) {
    console.error(e)
  }
}

async function handleJoin(teamId: string) {
  busy.value = true
  try {
    await joinFreeTeam(roundId.value, teamId)
    MessagePlugin.success('已加入队伍')
    await load()
  } catch (e: any) {
    MessagePlugin.error(e?.message || '加入失败')
  } finally {
    busy.value = false
  }
}

async function handleLeave() {
  busy.value = true
  try {
    await leaveFreeTeam(roundId.value)
    MessagePlugin.success('已退出队伍')
    await load()
  } catch (e: any) {
    MessagePlugin.error(e?.message || '退出失败')
  } finally {
    busy.value = false
  }
}

useSfRefresh(() => { load() }, '/teams')
onMounted(load)
</script>

<style scoped lang="scss">
.free-team-page { padding: 16px; max-width: 1000px; margin: 0 auto; }
.page-header { margin-bottom: 16px; h1 { margin: 0 0 6px; font-size: 22px; } p { margin: 0; color: var(--text-secondary); font-size: 13px; } }
.my-team-banner { margin-bottom: 14px; padding: 10px 14px; border-radius: 10px; background: rgba(255,215,0,0.12); border: 1px solid rgba(255,215,0,0.4); strong { color: #ffb300; } }
.teams-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.team-card { border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; background: var(--card-bg); display: flex; flex-direction: column; gap: 10px; }
.team-card.mine { border: 2px solid #ffd700; box-shadow: 0 0 14px rgba(255,215,0,0.4); }
.team-card.full { opacity: 0.85; }
.tc-head { display: flex; justify-content: space-between; align-items: center; }
.tc-head .tc-name { font-size: 16px; font-weight: 700; }
.tc-head .tc-count { font-size: 13px; color: var(--text-secondary); }
.tc-members { display: flex; flex-wrap: wrap; gap: 6px; min-height: 28px; }
.member-chip { padding: 2px 8px; border-radius: 10px; background: var(--hover-bg); font-size: 12px; em { color: #ffb300; font-style: normal; margin-left: 4px; font-size: 11px; } }
.tc-members .empty { font-size: 12px; color: var(--text-tertiary); }
.tc-actions { display: flex; }
</style>
