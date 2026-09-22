<template>
  <div class="free-team-page">
    <div class="page-header">
      <h1>🙋 自由组建</h1>
      <p>第{{ currentRound }}公演 · 选择歌曲加入对应队伍（满员即锁定，首位加入者自动成为队长）</p>
    </div>

    <div v-if="myTeamId" class="my-team-banner">
      你已加入：<strong>{{ myTeamName }}</strong>
    </div>

    <!-- 按歌曲选择（管理员已为每首歌指定队伍） -->
    <div v-if="songOptions.length > 0" class="song-section">
      <div class="section-title">🎵 按歌曲选择队伍</div>
      <div class="teams-grid">
        <div
          v-for="opt in songOptions"
          :key="opt.songId"
          class="team-card song-card"
          :class="{ mine: opt.teamId === myTeamId, full: opt.teamId && opt.memberCount >= opt.maxMembers }"
        >
          <div class="tc-head">
            <div class="sc-song-info">
              <span class="sc-song">{{ opt.songName }}</span>
              <span class="sc-style">{{ opt.style }}</span>
            </div>
            <span class="tc-count">{{ opt.memberCount }}/{{ opt.maxMembers }}</span>
          </div>
          <div class="sc-team">队伍：{{ opt.teamName }}</div>
          <div class="sc-meta">
            <span>🎲 {{ opt.difficulty ?? '-' }} 面</span>
            <span>⚠️ {{ opt.risk ?? '-' }}</span>
            <span>🎤 {{ opt.baseVocal ?? '-' }}</span>
            <span>💃 {{ opt.baseDance ?? '-' }}</span>
            <span>★ {{ ({ vocal: '声乐', dance: '舞蹈', charm: '魅力' } as Record<string,string>)[opt.mainAttribute || ''] || '-' }}</span>
          </div>
          <div class="tc-members">
            <span v-for="(m, i) in membersOf(opt.teamId)" :key="i" class="member-chip">
              <UserAvatar class="chip-av" :name="m.player?.name || m.playerName" :avatar="m.player?.avatar" />
              {{ m.player?.name || m.playerName || m.playerId }}
              <em v-if="isCaptain(opt.teamId, m.playerId)">队长</em>
            </span>
            <span v-if="membersOf(opt.teamId).length === 0" class="empty">暂无成员</span>
          </div>
          <div class="tc-actions">
            <t-button v-if="opt.teamId === myTeamId" theme="danger" variant="outline" :loading="busy" @click="handleLeave">退出队伍</t-button>
            <t-button
              v-else-if="!myTeamId && opt.teamId && opt.memberCount < opt.maxMembers"
              theme="primary"
              :loading="busy"
              @click="handleJoinSong(opt.songId)"
            >选择此歌</t-button>
            <t-button v-else theme="default" disabled>
              {{ opt.teamId && opt.memberCount >= opt.maxMembers ? '已满员' : '已加入其他队' }}
            </t-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 队伍列表（无歌曲映射时可直接加入） -->
    <div class="section-title" style="margin-top: 20px">
      {{ songOptions.length > 0 ? '队伍一览' : '可加入的队伍' }}
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
            <UserAvatar class="chip-av" :name="m.player?.name || m.playerName" :avatar="m.player?.avatar" />
            {{ m.player?.name || m.playerName || m.playerId }}
            <em v-if="m.playerId === t.captainId">队长</em>
          </span>
          <span v-if="t.members.length === 0" class="empty">暂无成员</span>
        </div>
        <div class="tc-actions">
          <t-button v-if="t.id === myTeamId" theme="danger" variant="outline" :loading="busy" @click="handleLeave">退出队伍</t-button>
          <t-button
            v-else-if="songOptions.length === 0 && !myTeamId && t.memberCount < t.maxMembers"
            theme="primary"
            :loading="busy"
            @click="handleJoin(t.id)"
          >加入</t-button>
          <t-button v-else theme="default" disabled>
            {{ t.memberCount >= t.maxMembers ? '已满员' : (songOptions.length > 0 ? '按歌曲选择' : '已加入其他队') }}
          </t-button>
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
import { getFreeTeams, joinFreeTeam, leaveFreeTeam, getSongGroupOptions, selectSongForGroup } from '../../services/api'
import type { SongGroupOption } from '../../services/api'
import { useSfRefresh } from '../../composables/useSfRefresh'
import UserAvatar from '../../components/common/UserAvatar.vue'

const route = useRoute()
const currentRound = computed(() => parseInt(route.params.round as string) || 1)
const roundId = computed(() => `round-${currentRound.value}`)

const teams = ref<any[]>([])
const songOptions = ref<SongGroupOption[]>([])
const myTeamId = ref<string | null>(null)
const busy = ref(false)

const myTeamName = computed(() => teams.value.find(t => t.id === myTeamId.value)?.name || '')

function membersOf(teamId: string | null) {
  if (!teamId) return []
  return teams.value.find(t => t.id === teamId)?.members || []
}

function isCaptain(teamId: string | null, playerId: string) {
  if (!teamId) return false
  return teams.value.find(t => t.id === teamId)?.captainId === playerId
}

async function load() {
  try {
    const [res, songRes] = await Promise.all([
      getFreeTeams(roundId.value),
      getSongGroupOptions(roundId.value).catch(() => ({ options: [] } as any))
    ])
    teams.value = res?.teams || []
    myTeamId.value = res?.myTeamId || null
    songOptions.value = (songRes?.options || []).filter((o: SongGroupOption) => o.teamId)
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

async function handleJoinSong(songId: string) {
  busy.value = true
  try {
    await selectSongForGroup(roundId.value, songId)
    MessagePlugin.success('已加入该歌曲对应的队伍')
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
.section-title { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
.my-team-banner { margin-bottom: 14px; padding: 10px 14px; border-radius: 10px; background: rgba(255,215,0,0.12); border: 1px solid rgba(255,215,0,0.4); strong { color: #ffb300; } }
.teams-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.team-card { border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; background: var(--card-bg); display: flex; flex-direction: column; gap: 10px; }
.team-card.mine { border: 2px solid #ffd700; box-shadow: 0 0 14px rgba(255,215,0,0.4); }
.team-card.full { opacity: 0.85; }
.team-card.song-card { border-left: 4px solid #667eea; }
.tc-head { display: flex; justify-content: space-between; align-items: center; }
.tc-head .tc-name { font-size: 16px; font-weight: 700; }
.tc-head .tc-count { font-size: 13px; color: var(--text-secondary); }
.sc-song-info { display: flex; flex-direction: column; }
.sc-song { font-size: 15px; font-weight: 700; }
.sc-style { font-size: 12px; color: var(--text-tertiary); }
.sc-team { font-size: 13px; color: var(--text-secondary); }
.sc-meta { display: flex; flex-wrap: wrap; gap: 6px; span { font-size: 11px; padding: 1px 7px; border-radius: 7px; background: var(--hover-bg); color: var(--text-secondary); } }
.tc-members { display: flex; flex-wrap: wrap; gap: 6px; min-height: 28px; }
.member-chip { padding: 2px 8px; border-radius: 10px; background: var(--hover-bg); font-size: 12px; display: inline-flex; align-items: center; gap: 5px; em { color: #ffb300; font-style: normal; margin-left: 4px; font-size: 11px; } }
.member-chip .chip-av { width: 18px; height: 18px; border-radius: 50%; overflow: hidden; display: inline-flex; flex-shrink: 0; background: var(--card-bg); }
.tc-members .empty { font-size: 12px; color: var(--text-tertiary); }
.tc-actions { display: flex; }
</style>
