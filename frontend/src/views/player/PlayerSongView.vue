<template>
  <div class="player-song">
    <div class="song-header">
      <h1>公演歌曲</h1>
      <p class="subtitle">查看本轮公演的歌曲和参赛人员</p>
      <p v-if="isCaptain" class="captain-hint">你是队长，可以抢选歌曲</p>
    </div>

    <!-- 本轮公演歌曲列表 -->
    <div v-if="roundSongs.length > 0" class="round-songs-section">
      <div class="section-title-bar">
        <span class="section-icon">🎵</span>
        <span>本轮公演歌曲（共 {{ roundSongs.length }} 首）</span>
      </div>

      <div class="songs-list">
        <div
          v-for="rs in roundSongs"
          :key="rs.id"
          class="song-card"
          :class="{ 'my-song': isMySong(rs) }"
        >
          <div class="song-card-header">
            <div class="song-title-area">
              <span class="song-emoji">{{ getSongTypeEmoji(rs.songType) }}</span>
              <div class="song-info">
                <span class="song-name">{{ rs.song?.name || '未知歌曲' }}</span>
                <div class="song-tags">
                  <t-tag :theme="getSongTypeTheme(rs.songType)" variant="light" size="small">
                    {{ getSongTypeLabel(rs.songType) }}
                  </t-tag>
                  <t-tag variant="light" size="small">{{ rs.song?.style }}</t-tag>
                  <t-tag v-if="rs.scoringMethod" theme="warning" variant="light" size="small">
                    {{ getScoringMethodLabel(rs.scoringMethod) }}
                  </t-tag>
                </div>
              </div>
            </div>
            <div class="song-score-info">
              <span class="base-score">{{ rs.song?.baseScore }}分</span>
              <div class="difficulty-stars">
                <span v-for="i in 5" :key="i" :class="{ filled: i <= (rs.song?.difficulty || 0) }">★</span>
              </div>
            </div>
          </div>

          <!-- 歌曲权重 -->
          <div class="song-weights">
            <span class="weight-item">🎤 {{ rs.song?.vocalWeight || 0 }}</span>
            <span class="weight-item">💃 {{ rs.song?.danceWeight || 0 }}</span>
            <span class="weight-item">✨ {{ rs.song?.charmWeight || 0 }}</span>
          </div>

          <!-- 分配的队伍和参赛人员 -->
          <div class="song-assignments">
            <div v-if="getAssignment(rs.id)" class="assignment-info">
              <div class="assignment-team">
                <span class="team-icon">👥</span>
                <span class="team-name">{{ getAssignedTeamName(rs.id) }}</span>
              </div>
              <div class="assignment-members" v-if="getAssignment(rs.id) && teamStore.getTeamById(getAssignment(rs.id)!.teamId)?.members?.length">
                <span class="members-label">参赛人员：</span>
                <div class="members-tags">
                  <span
                    v-for="member in teamStore.getTeamById(getAssignment(rs.id)!.teamId)?.members"
                    :key="member.playerId"
                    class="member-tag"
                    :class="{ 'is-me': member.playerId === currentUser?.id }"
                  >
                    {{ member.player?.name || '未知' }}
                    <span v-if="member.playerId === currentUser?.id" class="me-badge">我</span>
                  </span>
                </div>
              </div>
              <div v-else class="no-members">
                <span>暂未分配参赛人员</span>
              </div>
            </div>
            <div v-else-if="rs.released && isCaptain && !getAssignment(rs.id)" class="released-state">
              <div class="released-badge">🔥 已释放 · 可抢选</div>
              <div class="released-song-meta">
                <span class="meta-item">🎤 声乐 {{ rs.song?.vocalWeight || 0 }}</span>
                <span class="meta-item">💃 舞蹈 {{ rs.song?.danceWeight || 0 }}</span>
                <span class="meta-item">✨ 魅力 {{ rs.song?.charmWeight || 0 }}</span>
                <span class="meta-item">⭐ 难度 {{ '★'.repeat(rs.song?.difficulty || 0) }}{'☆'.repeat(5 - (rs.song?.difficulty || 0)) }</span>
              </div>
              <t-button
                v-if="!hasClaimedSong"
                theme="primary"
                size="large"
                block
                :loading="claimingId === rs.id"
                @click="handleClaimSong(rs.id)"
                class="claim-btn"
              >
                🏃 抢选这首歌
              </t-button>
              <t-tag v-else theme="warning" size="large" class="claimed-tag">已抢选过歌曲</t-tag>
            </div>
            <div v-else-if="rs.released" class="released-state-readonly">
              <span class="released-icon">🔥</span>
              <span>歌曲已释放</span>
            </div>
            <div v-else class="no-assignment">
              <span class="no-assign-icon">⏳</span>
              <span>尚未释放</span>
            </div>
          </div>

          <!-- 我的参与标记 -->
          <div v-if="isMySong(rs)" class="my-participation">
            <span class="participation-icon">🌟</span>
            <span>你将参与此歌曲的公演</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <div class="empty-glow"></div>
      <div class="empty-icon-wrap">
        <div class="empty-icon">🎵</div>
        <div class="empty-ring"></div>
      </div>
      <h3>本轮公演歌曲尚未公布</h3>
      <p>请等待管理员选择本轮公演歌曲</p>
      <div class="empty-waiting">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    </div>

    <!-- 我的公演概览 -->
    <div v-if="mySongs.length > 0" class="my-overview">
      <div class="section-title-bar">
        <span class="section-icon">🌟</span>
        <span>我的公演任务</span>
      </div>
      <div class="overview-cards">
        <div v-for="rs in mySongs" :key="'my-' + rs.id" class="overview-card">
          <span class="overview-emoji">{{ getSongTypeEmoji(rs.songType) }}</span>
          <div class="overview-info">
            <span class="overview-song">{{ rs.song?.name }}</span>
            <span class="overview-type">{{ getSongTypeLabel(rs.songType) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useAuthStore } from '../../stores/authStore'
import { useTeamStore } from '../../stores/teamStore'
import { useSongStore } from '../../stores/songStore'

const route = useRoute()
const authStore = useAuthStore()
const teamStore = useTeamStore()
const songStore = useSongStore()

const claimingId = ref<string | null>(null)

const currentUser = computed(() => authStore.currentUser)
const roundSongs = computed(() => songStore.roundSongs)
const teamSongs = computed(() => songStore.teamSongs)

// 从 URL 路由参数获取当前轮次（优先级最高），兜底为 1
const currentRound = computed(() => parseInt(route.params.round as string) || 1)

// 判断当前用户是否是队长
const isCaptain = computed(() => {
  if (!currentUser.value) return false
  const myTeam = teamStore.teams.find(team => 
    team.members?.some(m => m.playerId === currentUser.value!.id)
  )
  return myTeam?.captainId === currentUser.value.id
})

// 判断当前队伍是否已经抢选了歌曲
const hasClaimedSong = computed(() => {
  if (!currentUser.value) return false
  const myTeam = teamStore.teams.find(team => 
    team.members?.some(m => m.playerId === currentUser.value!.id)
  )
  if (!myTeam) return false
  return songStore.teamSongs.some(ts => ts.teamId === myTeam.id)
})

// 获取当前用户所在的队伍
const myTeam = computed(() => {
  if (!currentUser.value) return null
  return teamStore.teams.find(team => 
    team.members?.some(m => m.playerId === currentUser.value!.id)
  ) || null
})

// 获取歌曲的分配信息
function getAssignment(songId: string) {
  return teamSongs.value.find(ts => ts.roundSongId === songId)
}

// 获取分配队伍名称
function getAssignedTeamName(songId: string): string {
  const teamSong = getAssignment(songId)
  if (!teamSong) return '未分配'
  const team = teamStore.getTeamById(teamSong.teamId)
  return team?.name || '未知队伍'
}

// 检查是否是我参与的歌曲
function isMySong(rs: any): boolean {
  const teamSong = getAssignment(rs.id)
  if (!teamSong) return false
  const team = teamStore.getTeamById(teamSong.teamId)
  if (!team?.members) return false
  return team.members.some(m => m.playerId === currentUser.value?.id)
}

// 我参与的歌曲
const mySongs = computed(() => {
  return roundSongs.value.filter(rs => isMySong(rs))
})

// 抢选歌曲
async function handleClaimSong(roundSongId: string) {
  if (!myTeam.value) {
    MessagePlugin.error('你还没有加入队伍')
    return
  }
  
  claimingId.value = roundSongId
  try {
    await songStore.claimSong(roundSongId, myTeam.value.id)
    MessagePlugin.success('抢选成功！')
  } catch (error: any) {
    MessagePlugin.error(error.message || '抢选失败，可能被其他队伍抢走了')
  } finally {
    claimingId.value = null
  }
}

function getSongTypeEmoji(type: string): string {
  const emojis: Record<string, string> = {
    team_show: '🎤',
    team_collab: '🎶',
    captain_show: '👑',
    pk_show: '⚔️'
  }
  return emojis[type] || '🎵'
}

function getSongTypeTheme(type: string): 'primary' | 'success' | 'warning' | 'danger' {
  const themes: Record<string, 'primary' | 'success' | 'warning' | 'danger'> = {
    team_show: 'primary',
    team_collab: 'success',
    captain_show: 'warning',
    pk_show: 'danger'
  }
  return themes[type] || 'primary'
}

function getSongTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    team_show: '团秀',
    team_collab: '合作秀',
    captain_show: '队长秀',
    pk_show: 'PK秀'
  }
  return labels[type] || type
}

function getScoringMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    actual: '按实际得分',
    fixed: '固定分数',
    ranked: '按排名给分'
  }
  return labels[method] || method
}

onMounted(async () => {
  const roundId = `round-${currentRound.value}`
  await Promise.all([
    songStore.fetchRoundSongs(roundId),
    songStore.fetchTeamSongs(roundId),
    teamStore.fetchTeams(roundId)
  ])
})
</script>

<style lang="scss" scoped>
.player-song {
  color: #333;
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 4px;
}

// ===== 头部 =====
.song-header {
  position: relative;
  margin-bottom: 28px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  &::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    width: 80px;
    height: 2px;
    background: linear-gradient(90deg, #ffd700, #ff6b6b);
    border-radius: 2px;
  }

  h1 {
    font-size: 26px;
    font-weight: 800;
    margin: 0 0 8px 0;
    background: linear-gradient(135deg, #ffd700 0%, #ff6b6b 50%, #a29bfe 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: 1px;
  }

  .subtitle {
    color: rgba(255, 255, 255, 0.45);
    margin: 0;
    font-size: 14px;
    letter-spacing: 0.3px;
  }

  .captain-hint {
    margin: 10px 0 0;
    font-size: 13px;
    color: #ffd700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: rgba(255, 215, 0, 0.1);
    border: 1px solid rgba(255, 215, 0, 0.2);
    border-radius: 20px;
    font-weight: 500;
  }
}

// ===== 区块标题 =====
.section-title-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  background: linear-gradient(135deg, rgba(162, 155, 254, 0.1), rgba(108, 92, 231, 0.05));
  border: 1px solid rgba(162, 155, 254, 0.15);
  border-radius: 12px;
  margin-bottom: 16px;
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);

  .section-icon {
    font-size: 20px;
  }
}

// ===== 歌曲列表（桌面端双列网格） =====
.songs-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;

  @media (min-width: 700px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
}

// ===== 歌曲卡片 =====
.song-card {
  position: relative;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
  border-radius: 14px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.3s ease;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    opacity: 0;
    transition: opacity 0.3s;
  }

  &:hover {
    transform: translateY(-3px);
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.03));
    border-color: rgba(255, 255, 255, 0.18);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);

    &::before {
      opacity: 1;
    }
  }

  // 我参与的歌曲高亮
  &.my-song {
    border-color: rgba(255, 215, 0, 0.3);
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.08), rgba(255, 107, 107, 0.04));

    &::before {
      background: linear-gradient(90deg, transparent, #ffd700, transparent);
      opacity: 0.6;
    }

    &:hover {
      border-color: rgba(255, 215, 0, 0.5);
      box-shadow: 0 8px 30px rgba(255, 215, 0, 0.1);
    }
  }

  @media (min-width: 700px) {
    padding: 22px;
  }
}

// ===== 歌曲头部 =====
.song-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 14px;
  gap: 12px;
}

.song-title-area {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.song-emoji {
  font-size: 32px;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;

  @media (min-width: 700px) {
    font-size: 36px;
    width: 50px;
    height: 50px;
  }
}

.song-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.song-name {
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  @media (min-width: 700px) {
    font-size: 19px;
  }
}

.song-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

// ===== 分数区域 =====
.song-score-info {
  text-align: right;
  flex-shrink: 0;
}

.base-score {
  display: block;
  font-size: 20px;
  font-weight: 800;
  background: linear-gradient(135deg, #ffd700, #ffa500);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.2;

  @media (min-width: 700px) {
    font-size: 22px;
  }
}

.difficulty-stars {
  display: flex;
  gap: 2px;
  justify-content: flex-end;
  margin-top: 2px;

  span {
    color: rgba(255, 255, 255, 0.15);
    font-size: 13px;

    &.filled {
      color: #ffd700;
      text-shadow: 0 0 6px rgba(255, 215, 0, 0.4);
    }
  }
}

.score-label {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 2px;
}

// ===== 歌曲权重条 =====
.song-weights {
  display: flex;
  gap: 16px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  margin-bottom: 14px;

  .weight-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
  }
}

// ===== 分配信息 =====
.song-assignments {
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.assignment-info {
  .assignment-team {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    padding: 6px 10px;
    background: rgba(78, 205, 196, 0.08);
    border: 1px solid rgba(78, 205, 196, 0.15);
    border-radius: 8px;

    .team-icon {
      font-size: 16px;
    }

    .team-name {
      font-size: 14px;
      font-weight: 700;
      color: #4ecdc4;
    }
  }

  .assignment-members {
    .members-label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.45);
      margin-bottom: 8px;
      display: block;
    }

    .members-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .member-tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 12px;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 16px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.8);
      transition: all 0.2s;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      &.is-me {
        background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 107, 107, 0.12));
        border-color: rgba(255, 215, 0, 0.35);
        color: #ffd700;
        font-weight: 600;
      }

      .me-badge {
        font-size: 10px;
        padding: 1px 6px;
        background: rgba(255, 215, 0, 0.3);
        border-radius: 6px;
        font-weight: 700;
      }
    }
  }

  .no-members {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.4);
    font-style: italic;
    padding: 6px 0;
  }
}

// ===== 已释放（队长可抢选，完整详情） =====
.released-state {
  padding: 16px;
  background: linear-gradient(135deg, rgba(255, 69, 0, 0.08), rgba(255, 165, 0, 0.05));
  border: 1px solid rgba(255, 69, 0, 0.2);
  border-radius: 12px;
  text-align: center;

  .released-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 14px;
    background: rgba(255, 69, 0, 0.15);
    border: 1px solid rgba(255, 69, 0, 0.25);
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    color: #ff6b35;
    margin-bottom: 14px;
    animation: pulse 2s ease-in-out infinite;
  }

  .released-song-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin-bottom: 16px;

    .meta-item {
      padding: 5px 12px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.75);
    }
  }

  .claim-btn {
    height: 44px !important;
    font-size: 16px !important;
    font-weight: 700 !important;
    background: linear-gradient(135deg, #ff6b35, #ff4500) !important;
    border: none !important;
    border-radius: 10px !important;
    letter-spacing: 1px;
    box-shadow: 0 4px 15px rgba(255, 69, 0, 0.3);
    transition: all 0.2s !important;

    &:hover:not(.t-is-loading) {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(255, 69, 0, 0.4) !important;
    }

    &:active {
      transform: translateY(0);
    }
  }

  .claimed-tag {
    display: block;
    text-align: center;
  }
}

// ===== 已释放（非队长只读提示） =====
.released-state-readonly {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: rgba(255, 165, 0, 0.6);

  .released-icon {
    font-size: 16px;
    animation: pulse 2s ease-in-out infinite;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}

// ===== 未释放 =====
.no-assignment {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.35);

  .no-assign-icon {
    font-size: 18px;
    animation: spin 3s linear infinite;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

// ===== 我参与标记 =====
.my-participation {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 14px;
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.12), rgba(255, 107, 107, 0.08));
  border-radius: 10px;
  border: 1px solid rgba(255, 215, 0, 0.25);

  .participation-icon {
    font-size: 18px;
  }

  span {
    font-size: 13px;
    color: #ffd700;
    font-weight: 600;
  }
}

// ===== 空状态 =====
.empty-state {
  position: relative;
  text-align: center;
  padding: 80px 20px 60px;
  background: linear-gradient(180deg, rgba(162, 155, 254, 0.05) 0%, rgba(108, 92, 231, 0.02) 100%);
  border-radius: 20px;
  border: 1px dashed rgba(162, 155, 254, 0.15);
  overflow: hidden;

  .empty-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 200px;
    height: 200px;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle, rgba(162, 155, 254, 0.08) 0%, transparent 70%);
    pointer-events: none;
  }

  .empty-icon-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
    width: 80px;
    height: 80px;
  }

  .empty-icon {
    font-size: 48px;
    position: relative;
    z-index: 1;
    filter: grayscale(0.3);
    animation: float 3s ease-in-out infinite;
  }

  .empty-ring {
    position: absolute;
    inset: 0;
    border: 2px solid rgba(162, 155, 254, 0.15);
    border-radius: 50%;
    animation: ringPulse 2.5s ease-in-out infinite;
  }

  h3 {
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 10px 0;
    color: rgba(255, 255, 255, 0.65);
    letter-spacing: 0.5px;
  }

  p {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.35);
    margin: 0;
    letter-spacing: 0.3px;
  }

  .empty-waiting {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-top: 24px;

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(162, 155, 254, 0.3);
      animation: dotBounce 1.4s ease-in-out infinite;

      &:nth-child(2) { animation-delay: 0.2s; }
      &:nth-child(3) { animation-delay: 0.4s; }
    }
  }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes ringPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.4; }
}

@keyframes dotBounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
  40% { transform: translateY(-12px); opacity: 1; }
}

// ===== 我的公演概览 =====
.my-overview {
  margin-top: 28px;
}

.overview-cards {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.overview-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 107, 107, 0.06));
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 12px;
  transition: all 0.2s;
  flex: 1;
  min-width: 160px;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(255, 215, 0, 0.08);
  }

  .overview-emoji {
    font-size: 24px;
  }

  .overview-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .overview-song {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
  }

  .overview-type {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.45);
  }
}
</style>
