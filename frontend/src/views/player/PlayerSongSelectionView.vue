<template>
  <div class="song-selection">
    <div class="page-header">
      <div class="page-header-top">
        <h1>选歌阶段</h1>
        <span class="role-badge" :class="isCaptain ? 'captain' : 'member'">
          {{ isCaptain ? '👑 本轮队长' : '🎭 本轮队员' }}
        </span>
      </div>
      <p class="subtitle">{{ isCaptain ? '从已释放的歌曲中为队伍抢选一首' : '查看本轮公演歌曲' }}</p>
    </div>

    <!-- ===== 队长抢选界面（始终展示，不受阶段状态影响） ===== -->
    <div v-if="isCaptain" class="captain-view">

      <!-- 概览信息 -->
      <div class="selection-info">
        <div class="info-icon">{{ hasClaimedSong ? '✅' : '⚡' }}</div>
        <div class="info-content">
          <h3>{{ hasClaimedSong ? '已抢选完成' : '抢选本轮公演歌曲' }}</h3>
          <p>{{ hasClaimedSong ? '你的队伍已分配到歌曲' : '管理员已释放歌曲，选择一首抢选' }}</p>
        </div>
      </div>

      <!-- 已抢选到的歌曲 -->
      <div v-if="claimedSong" class="claimed-song-section">
        <h2 class="section-title">🏆 你的队伍已抢选</h2>
        <div class="claimed-song-card">
          <div class="claimed-header">
            <span class="claimed-emoji">{{ getSongTypeEmoji(claimedSong.songType) }}</span>
            <div class="claimed-info">
              <span class="claimed-name">{{ claimedSong.song?.name || '未知歌曲' }}</span>
              <div class="claimed-tags">
                <t-tag :theme="getSongTypeTheme(claimedSong.songType)" variant="light" size="small">
                  {{ getSongTypeLabel(claimedSong.songType) }}
                </t-tag>
                <t-tag variant="light" size="small">{{ claimedSong.song?.style }}</t-tag>
              </div>
            </div>
          </div>
          <div class="claimed-weights">
            <span>🎤 {{ claimedSong.song?.vocalWeight || 0 }}</span>
            <span>💃 {{ claimedSong.song?.danceWeight || 0 }}</span>
            <span>✨ {{ claimedSong.song?.charmWeight || 0 }}</span>
            <span>⭐ {{ claimedSong.song?.baseScore }}分</span>
          </div>
        </div>
      </div>

      <!-- 可抢选的已释放歌曲 -->
      <div v-if="releasedSongs.length > 0 && !hasClaimedSong" class="released-section">
        <h2 class="section-title">🔥 可抢选的歌曲 <span class="section-sub">（{{ releasedSongs.length }} 首）</span></h2>
        <div class="songs-grid">
          <div v-for="rs in releasedSongs" :key="rs.id" class="song-card">
                <div class="song-header">
                  <span class="song-emoji">{{ getSongTypeEmoji(rs.songType) }}</span>
                  <div class="song-info">
                    <div class="song-name">{{ rs.song?.name || '未知歌曲' }}</div>
                    <div class="song-tags">
                      <t-tag :theme="getSongTypeTheme(rs.songType)" variant="light" size="small">
                        {{ getSongTypeLabel(rs.songType) }}
                      </t-tag>
                      <t-tag variant="light" size="small">{{ rs.song?.style }}</t-tag>
                    </div>
                  </div>
                </div>

                <div class="song-stats">
                  <div class="stat-item">
                    <span class="stat-label">基础分</span>
                    <span class="stat-value">{{ rs.song?.baseScore }}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">难度</span>
                    <div class="difficulty-stars">
                      <span v-for="i in 5" :key="i" :class="{ filled: i <= (rs.song?.difficulty || 0) }">★</span>
                    </div>
                  </div>
                </div>

                <div class="song-weights">
                  <span class="weight">🎤 {{ rs.song?.vocalWeight || 0 }}</span>
                  <span class="weight">💃 {{ rs.song?.danceWeight || 0 }}</span>
                  <span class="weight">✨ {{ rs.song?.charmWeight || 0 }}</span>
                </div>

                <div class="card-action">
                  <!-- 已被其他队抢走 -->
                  <template v-if="isSongClaimed(rs.id)">
                    <div class="claimed-by-other">
                      <span class="claimed-icon">🔒</span>
                      <span>已被「{{ getClaimedTeamName(rs.id) }}」抢走</span>
                    </div>
                  </template>
                  <!-- 可抢选 -->
                  <t-button
                    v-else
                    theme="primary"
                    size="large"
                    block
                    :loading="claimingId === rs.id"
                    @click="handleClaimSong(rs.id)"
                    class="claim-btn"
                  >
                    🏃 抢选这首歌
                  </t-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 没有可抢选的歌曲 -->
          <div v-if="releasedSongs.length === 0 && !hasClaimedSong" class="empty-release">
            <div class="empty-release-icon">⏳</div>
            <h3>暂无可抢选的歌曲</h3>
            <p>请等待管理员释放歌曲</p>
          </div>
        </div>

    <!-- ===== 队员：等待或已选歌曲 ===== -->
    <div v-if="!isCaptain" class="member-view">
      <!-- 已选到歌曲 -->
      <div v-if="claimedSong" class="claimed-song-section">
        <h2 class="section-title">🏆 本队公演歌曲</h2>
        <div class="claimed-song-card">
          <div class="claimed-header">
            <span class="claimed-emoji">{{ getSongTypeEmoji(claimedSong.songType) }}</span>
            <div class="claimed-info">
              <span class="claimed-name">{{ claimedSong.song?.name || '未知歌曲' }}</span>
              <div class="claimed-tags">
                <t-tag :theme="getSongTypeTheme(claimedSong.songType)" variant="light" size="small">
                  {{ getSongTypeLabel(claimedSong.songType) }}
                </t-tag>
                <t-tag variant="light" size="small">{{ claimedSong.song?.style }}</t-tag>
              </div>
            </div>
          </div>
          <div class="claimed-weights">
            <span>🎤 {{ claimedSong.song?.vocalWeight || 0 }}</span>
            <span>💃 {{ claimedSong.song?.danceWeight || 0 }}</span>
            <span>✨ {{ claimedSong.song?.charmWeight || 0 }}</span>
            <span>⭐ {{ claimedSong.song?.baseScore }}分</span>
          </div>
        </div>
      </div>
      <!-- 等待中 -->
      <div v-else class="member-waiting">
        <div class="waiting-icon">⏳</div>
        <h3>等待队长选歌</h3>
        <p>队长正在为本轮公演选择歌曲，请稍候</p>
      </div>
    </div>

    <StageStatusView :round="round" stage="song">
    <template #completed>
      <div class="result-section">
        <div class="result-title">
          <span class="title-icon">🎵</span>
          <span>本轮公演歌曲</span>
        </div>

        <div v-if="roundSongs.length > 0" class="result-songs">
          <div v-for="rs in roundSongs" :key="rs.id" class="song-result-card">
            <div class="song-result-header">
              <span class="result-emoji">{{ getSongTypeEmoji(rs.songType) }}</span>
              <div class="result-info">
                <div class="result-name">{{ rs.song?.name || '未知歌曲' }}</div>
                <div class="result-tags">
                  <t-tag :theme="getSongTypeTheme(rs.songType)" variant="light" size="small">
                    {{ getSongTypeLabel(rs.songType) }}
                  </t-tag>
                  <t-tag variant="light" size="small">{{ rs.song?.style }}</t-tag>
                </div>
              </div>
            </div>
            <div class="result-stats">
              <span class="result-stat">基础分：{{ rs.song?.baseScore }}</span>
              <span class="result-stat">难度：{{ '★'.repeat(rs.song?.difficulty || 0) }}</span>
            </div>
          </div>
        </div>

        <div v-else class="result-empty">
          <div class="empty-icon">🎵</div>
          <p>本轮公演歌曲尚未公布</p>
        </div>
      </div>
    </template>
  </StageStatusView>
</div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useSeasonStore } from '../../stores/seasonStore'
import { useSongStore } from '../../stores/songStore'
import { useAuthStore } from '../../stores/authStore'
import { useTeamStore } from '../../stores/teamStore'
import StageStatusView from '../../components/StageStatusView.vue'

const route = useRoute()
const seasonStore = useSeasonStore()
const songStore = useSongStore()
const authStore = useAuthStore()
const teamStore = useTeamStore()

const round = computed(() => Number(route.params.round))

// 队长判定：通过 team.captainId 匹配，不依赖 user.role 字段
const isCaptain = computed(() => {
  if (!authStore.currentUser) return false
  return teamStore.teams.some(t => t.captainId === authStore.currentUser!.id)
})

const claimingId = ref<string | null>(null)

// 本轮所有轮次歌曲
const roundSongs = computed(() => songStore.roundSongs)

// 已释放的歌曲（可抢选）
const releasedSongs = computed(() => {
  const filtered = roundSongs.value.filter(rs => rs.released)
  console.log('[选歌] roundSongs:', JSON.stringify(roundSongs.value.map(r => ({ id: r.id, songId: r.songId, released: r.released, name: (r as any).song?.name }))))
  console.log('[选歌] releasedSongs:', filtered.length, filtered.map(r => (r as any).song?.name || r.id))
  return filtered
})

// 当前队伍已抢选的歌曲
const myTeam = computed(() => {
  if (!authStore.currentUser) return null
  return teamStore.teams.find(t =>
    t.members?.some(m => m.playerId === authStore.currentUser!.id)
  ) || null
})

const hasClaimedSong = computed(() => {
  if (!myTeam.value) return false
  return songStore.teamSongs.some(ts => ts.teamId === myTeam.value!.id)
})

const claimedSong = computed(() => {
  if (!myTeam.value) return null
  const ts = songStore.teamSongs.find(t => t.teamId === myTeam.value!.id)
  if (!ts) return null
  return roundSongs.value.find(rs => rs.id === ts.songId || rs.songId === ts.songId) || null
})

// 抢选歌曲
async function handleClaimSong(roundSongId: string) {
  if (!myTeam.value) {
    MessagePlugin.error('你还没有加入队伍')
    return
  }
  // 抢之前检查是否已被其他队抢走
  if (isSongClaimed(roundSongId)) {
    MessagePlugin.warning('该歌曲已被其他队伍抢走')
    return
  }
  claimingId.value = roundSongId
  const roundId = `round-${round.value}`
  try {
    await songStore.claimSong(roundSongId, myTeam.value.id, roundId)
    MessagePlugin.success('抢选成功！')
  } catch (error: any) {
    MessagePlugin.error('抢选失败，该歌曲可能已被其他队伍抢走')
  } finally {
    claimingId.value = null
  }
}

// 检查某首轮次歌曲是否已被其他队伍抢选
function isSongClaimed(roundSongId: string): boolean {
  return songStore.teamSongs.some(ts => ts.songId === roundSongId)
}

// 获取抢占了某首歌曲的队伍名称
function getClaimedTeamName(roundSongId: string): string {
  const ts = songStore.teamSongs.find(t => t.songId === roundSongId)
  if (!ts) return '未知队伍'
  const team = teamStore.getTeamById(ts.teamId)
  return team?.name || '未知队伍'
}

// 工具函数
function getSongTypeEmoji(type: string): string {
  const m: Record<string, string> = { team_show: '🎤', team_collab: '🎶', captain_show: '👑', pk_show: '⚔️' }
  return m[type] || '🎵'
}

function getSongTypeTheme(type: string): 'primary' | 'success' | 'warning' | 'danger' {
  const m: Record<string, any> = { team_show: 'primary', team_collab: 'success', captain_show: 'warning', pk_show: 'danger' }
  return m[type] || 'primary'
}

function getSongTypeLabel(type: string): string {
  const m: Record<string, string> = { team_show: '团秀', team_collab: '合作秀', captain_show: '队长秀', pk_show: 'PK秀' }
  return m[type] || type
}

onMounted(async () => {
  const roundId = `round-${round.value}`
  console.log('[选歌] 加载 roundId:', roundId)
  await Promise.all([
    songStore.fetchRoundSongs(roundId),
    songStore.fetchTeamSongs(roundId),
    teamStore.fetchTeams(roundId)
  ])
  // 调试：检查 isCaptain 判定所需的数据
  const me = authStore.currentUser
  console.log('[选歌] 当前用户:', me?.id, me?.name, 'role:', me?.role)
  console.log('[选歌] teams captainIds:', teamStore.teams.map(t => ({ id: t.id, name: t.name, captainId: t.captainId })))
  console.log('[选歌] isCaptain 判定:', teamStore.teams.some(t => t.captainId === me?.id))
  console.log('[选歌] 加载完成, roundSongs:', songStore.roundSongs.length,
    'released:', songStore.roundSongs.filter(r => r.released).length,
    'teamSongs:', songStore.teamSongs.length,
    'teams:', teamStore.teams.length)
})
</script>

<style lang="scss" scoped>
// ===== 页面整体 =====
.song-selection {
  color: #333;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 4px;
}

// ===== 页面头部 =====
.page-header {
  position: relative;
  margin-bottom: 28px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  .page-header-top {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 8px;
  }

  .role-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 12px;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 600;

    &.captain {
      background: rgba(255, 215, 0, 0.15);
      border: 1px solid rgba(255, 215, 0, 0.3);
      color: #ffd700;
    }

    &.member {
      background: rgba(162, 155, 254, 0.12);
      border: 1px solid rgba(162, 155, 254, 0.2);
      color: #a29bfe;
    }
  }

  &::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    width: 80px;
    height: 2px;
    background: linear-gradient(90deg, #ffd700, #ff6b6b, #a29bfe);
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
}

// ===== 队长选歌 =====
.selection-info {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 107, 107, 0.06));
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 14px;
  margin-bottom: 28px;

  .info-icon {
    font-size: 44px;
    flex-shrink: 0;
  }

  .info-content {
    h3 {
      margin: 0 0 4px 0;
      font-size: 18px;
      font-weight: 700;
      color: #ffd700;
    }

    p {
      margin: 0;
      color: rgba(255, 255, 255, 0.5);
      font-size: 14px;
    }
  }
}

.song-pool {
  margin-bottom: 28px;

  .pool-title {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 16px 0;
    display: flex;
    align-items: center;
    gap: 8px;

    .pool-count {
      font-size: 13px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.4);
    }
  }
}

.songs-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;

  @media (min-width: 700px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  @media (min-width: 1000px) {
    grid-template-columns: repeat(3, 1fr);
  }
}

.song-card {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 16px;
  transition: all 0.25s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
    transform: translateY(-2px);
  }

  .song-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;

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
    }

    .song-info {
      flex: 1;
      min-width: 0;

      .song-name {
        font-size: 16px;
        font-weight: 700;
        margin-bottom: 6px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .song-tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
    }
  }

  .song-stats {
    display: flex;
    gap: 20px;
    margin-bottom: 12px;

    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .stat-label {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.4);
      }

      .stat-value {
        font-size: 20px;
        font-weight: 800;
        background: linear-gradient(135deg, #ffd700, #ffa500);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .difficulty-stars {
        display: flex;
        gap: 2px;

        span {
          color: rgba(255, 255, 255, 0.15);
          font-size: 14px;

          &.filled {
            color: #ffd700;
            text-shadow: 0 0 6px rgba(255, 215, 0, 0.4);
          }
        }
      }
    }
  }

  .song-weights {
    display: flex;
    gap: 14px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 8px;

    .weight {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.65);
    }
  }

  .card-action {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);

    .claim-btn {
      height: 42px !important;
      font-size: 15px !important;
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
    }

    .claimed-by-other {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.4);

      .claimed-icon {
        font-size: 18px;
      }
    }
  }
}

// ===== 区块标题 =====
.section-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;

  .section-sub {
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.4);
  }
}

// ===== 已抢选成功卡片 =====
.claimed-song-section {
  margin-bottom: 28px;
}

.claimed-song-card {
  background: linear-gradient(135deg, rgba(78, 205, 196, 0.1), rgba(0, 191, 255, 0.05));
  border: 1px solid rgba(78, 205, 196, 0.25);
  border-radius: 14px;
  padding: 20px;

  .claimed-header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 14px;

    .claimed-emoji {
      font-size: 36px;
      flex-shrink: 0;
      width: 50px;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(78, 205, 196, 0.1);
      border-radius: 10px;
    }

    .claimed-info {
      flex: 1;

      .claimed-name {
        font-size: 18px;
        font-weight: 700;
        display: block;
        margin-bottom: 6px;
      }

      .claimed-tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
    }
  }

  .claimed-weights {
    display: flex;
    gap: 16px;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 10px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
  }
}

// ===== 可抢选歌曲列表 =====
.released-section {
  margin-bottom: 28px;
}

// ===== 无可抢选 =====
.empty-release {
  text-align: center;
  padding: 80px 20px;
  background: linear-gradient(180deg, rgba(162, 155, 254, 0.04), rgba(108, 92, 231, 0.02));
  border: 1px dashed rgba(162, 155, 254, 0.15);
  border-radius: 18px;

  .empty-release-icon {
    font-size: 56px;
    margin-bottom: 16px;
    opacity: 0.5;
    animation: float 3s ease-in-out infinite;
  }

  h3 {
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 8px 0;
    color: rgba(255, 255, 255, 0.65);
  }

  p {
    color: rgba(255, 255, 255, 0.4);
    margin: 0;
    font-size: 14px;
  }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

// ===== 队员等待 =====
.member-waiting {
  text-align: center;
  padding: 80px 20px;
  background: linear-gradient(180deg, rgba(162, 155, 254, 0.04), rgba(108, 92, 231, 0.02));
  border: 1px dashed rgba(162, 155, 254, 0.15);
  border-radius: 18px;

  .waiting-icon {
    font-size: 56px;
    margin-bottom: 16px;
    opacity: 0.5;
    animation: float 3s ease-in-out infinite;
  }

  h3 {
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 8px 0;
    color: rgba(255, 255, 255, 0.65);
  }

  p {
    color: rgba(255, 255, 255, 0.4);
    margin: 0;
    font-size: 14px;
  }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

// ===== 已完成 =====
.result-section {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 16px;
  padding: 24px;

  .result-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    font-size: 18px;
    font-weight: 700;

    .title-icon {
      font-size: 24px;
    }
  }

  .result-songs {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;

    @media (min-width: 700px) {
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
  }

  .song-result-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 16px;
    transition: all 0.2s;

    &:hover {
      border-color: rgba(255, 255, 255, 0.15);
    }

    .song-result-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;

      .result-emoji {
        font-size: 28px;
        flex-shrink: 0;
      }

      .result-info {
        flex: 1;

        .result-name {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 6px;
        }

        .result-tags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
      }
    }

    .result-stats {
      display: flex;
      gap: 16px;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);

      .result-stat {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.6);
      }
    }
  }

  .result-empty {
    text-align: center;
    padding: 50px 20px;

    .empty-icon {
      font-size: 48px;
      margin-bottom: 12px;
      opacity: 0.4;
    }

    p {
      color: rgba(255, 255, 255, 0.4);
      margin: 0;
      font-size: 14px;
    }
  }
}
</style>
