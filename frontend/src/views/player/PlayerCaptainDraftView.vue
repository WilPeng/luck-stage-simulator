<template>
  <div class="draft-page">
    <div class="page-header">
      <h1>🐍 队长蛇形选人</h1>
      <p>第{{ currentRound }}公演 · 队长轮流从候选池选人，蛇形往返</p>
    </div>

    <div v-if="!draft || !draft.exists" class="waiting">
      <span class="waiting-icon">⏳</span>
      <p>等待管理员开始互动选秀...</p>
    </div>

    <template v-else>
      <!-- 当前轮次提示 -->
      <div class="turn-banner" :class="{ mine: isMyTurn }">
        <template v-if="draft.status === 'completed'">
          ✅ 选秀已结束，队伍组建完成
        </template>
        <template v-else-if="isMyTurn">
          🎯 轮到你选人（{{ currentTeamName }}）
        </template>
        <template v-else>
          ⏳ 等待 <strong>{{ currentCaptain?.name || '队长' }}</strong> 为「{{ currentTeamName }}」选人
        </template>
      </div>

      <!-- 候选池 -->
      <div v-if="draft.status === 'active' && isMyTurn" class="available-section">
        <div class="section-title">可选选手（{{ draft.available.length }}）</div>
        <div class="player-grid">
          <button
            v-for="p in draft.available"
            :key="p.id"
            class="player-card"
            :disabled="busy"
            @click="handlePick(p)"
          >
            <UserAvatar class="pc-av" :name="p.name" :avatar="p.avatar" />
            <span class="pc-name">{{ p.name }}</span>
          </button>
          <div v-if="draft.available.length === 0" class="empty">没有可选选手</div>
        </div>
      </div>

      <!-- 队伍面板 -->
      <div class="section-title" style="margin-top: 18px">队伍（蛇形顺序）</div>
      <div class="teams-grid">
        <div
          v-for="t in draft.teams"
          :key="t.id"
          class="team-card"
          :class="{ current: t.id === draft.currentTeamId, mine: t.id === myTeamId }"
        >
          <div class="tc-head">
            <span class="tc-name">{{ t.name }}</span>
            <span class="tc-count">{{ t.members.length }}/{{ t.maxMembers }}</span>
          </div>
          <div class="tc-members">
            <span v-for="m in t.members" :key="m.playerId" class="member-chip">
              <UserAvatar class="chip-av" :name="m.playerName" :avatar="m.avatar" />
              {{ m.playerName }}
              <em v-if="m.isCaptain">队长</em>
            </span>
            <span v-if="t.members.length === 0" class="empty">暂无成员</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { getCaptainDraft, pickCaptainDraft } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { useSfRefresh } from '../../composables/useSfRefresh'
import UserAvatar from '../../components/common/UserAvatar.vue'

const route = useRoute()
const authStore = useAuthStore()
const currentRound = computed(() => parseInt(route.params.round as string) || 1)
const roundId = computed(() => `round-${currentRound.value}`)

const draft = ref<any>(null)
const busy = ref(false)

const myId = computed(() => authStore.currentUser?.id || '')
const myTeamId = computed(() => {
  const caps = draft.value?.captains || {}
  for (const [teamId, capId] of Object.entries(caps)) {
    if (capId === myId.value) return teamId
  }
  const t = (draft.value?.teams || []).find((x: any) => (x.members || []).some((m: any) => m.isCaptain && m.playerId === myId.value))
  return t?.id || null
})
const isMyTurn = computed(() => draft.value?.status === 'active' && draft.value?.currentTeamId && draft.value.currentTeamId === myTeamId.value)
const currentTeamName = computed(() => (draft.value?.teams || []).find((t: any) => t.id === draft.value?.currentTeamId)?.name || '')
const currentCaptain = computed(() => {
  const teamId = draft.value?.currentTeamId
  if (!teamId) return null
  return (draft.value?.teams || []).find((t: any) => t.id === teamId)?.members?.find((m: any) => m.isCaptain) || null
})

async function load() {
  try {
    const res: any = await getCaptainDraft(roundId.value)
    draft.value = res
  } catch (e: any) {
    console.error(e)
  }
}

async function handlePick(p: any) {
  if (busy.value) return
  const ok = window.confirm(`确定选择「${p.name}」加入你的队伍吗？`)
  if (!ok) return
  busy.value = true
  try {
    const res: any = await pickCaptainDraft(roundId.value, p.id)
    draft.value = res
    MessagePlugin.success(`已选中 ${p.name}`)
  } catch (e: any) {
    MessagePlugin.error(e?.message || '选人失败')
  } finally {
    busy.value = false
  }
}

useSfRefresh(() => { load() }, '/teams/')
onMounted(load)
</script>

<style scoped lang="scss">
.draft-page { padding: 16px; max-width: 1000px; margin: 0 auto; }
.page-header { margin-bottom: 16px; h1 { margin: 0 0 6px; font-size: 22px; } p { margin: 0; color: var(--text-secondary); font-size: 13px; } }
.section-title { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
.waiting { text-align: center; padding: 60px 0; color: var(--text-secondary); .waiting-icon { font-size: 40px; display: block; margin-bottom: 10px; } }
.turn-banner { margin-bottom: 16px; padding: 12px 16px; border-radius: 10px; background: var(--hover-bg); border: 1px solid var(--border-color); font-size: 14px; }
.turn-banner.mine { background: rgba(102,126,234,0.14); border-color: #667eea; color: #4a5bd0; font-weight: 700; }
.available-section { margin-bottom: 8px; }
.player-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
.player-card { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--card-bg); cursor: pointer; transition: all 0.15s; &:hover:not(:disabled) { border-color: #667eea; box-shadow: 0 0 10px rgba(102,126,234,0.3); } &:disabled { opacity: 0.6; cursor: not-allowed; } }
.pc-av { width: 24px; height: 24px; border-radius: 50%; overflow: hidden; display: inline-flex; flex-shrink: 0; background: var(--card-bg); }
.pc-name { font-size: 13px; }
.teams-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.team-card { border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; background: var(--card-bg); display: flex; flex-direction: column; gap: 10px; }
.team-card.current { border: 2px solid #667eea; box-shadow: 0 0 14px rgba(102,126,234,0.35); }
.team-card.mine { background: rgba(255,215,0,0.06); }
.tc-head { display: flex; justify-content: space-between; align-items: center; .tc-name { font-size: 16px; font-weight: 700; } .tc-count { font-size: 13px; color: var(--text-secondary); } }
.tc-members { display: flex; flex-wrap: wrap; gap: 6px; min-height: 28px; }
.member-chip { padding: 2px 8px; border-radius: 10px; background: var(--hover-bg); font-size: 12px; display: inline-flex; align-items: center; gap: 5px; em { color: #ffb300; font-style: normal; margin-left: 4px; font-size: 11px; } }
.member-chip .chip-av { width: 18px; height: 18px; border-radius: 50%; overflow: hidden; display: inline-flex; flex-shrink: 0; background: var(--card-bg); }
.empty { font-size: 12px; color: var(--text-tertiary); }
</style>
