<template>
  <div class="admin-ranking">
    <div class="page-header">
      <h2>选手排名总览</h2>
      <p class="page-desc">展示所有选手在各轮公演中的排名变化</p>
    </div>

    <div class="ranking-table-container" v-if="!loading && tableData.length > 0">
      <table class="ranking-table">
        <thead>
          <tr>
            <th class="name-col">姓名</th>
            <th class="avatar-col">头像</th>
              <th v-for="round in totalRounds" :key="round" class="rank-col">
                第{{ round }}次公演
                <div class="col-sub">排名 / 喜爱度 / 所在团</div>
              </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in tableData" :key="row.userId">
            <td class="name-col">
              <span class="player-name">{{ row.userName }}</span>
            </td>
            <td class="avatar-col">
              <div class="player-avatar">
                <img v-if="row.avatar" :src="getAvatarUrl(row.avatar)" :alt="row.userName" />
                <span v-else class="avatar-placeholder">{{ row.userName.charAt(0) }}</span>
              </div>
            </td>
            <td v-for="round in totalRounds" :key="round" class="rank-col">
              <div class="rank-cell" :class="[getRankClass(row.ranks[round]), { 'rank-eliminated': row.eliminatedRound === round }]">
                <span class="rank-number">{{ row.ranks[round] || '-' }}</span>
                <span class="rank-popularity" v-if="row.popularity[round] !== undefined">
                  {{ row.popularity[round] }}票
                </span>
                <span class="rank-team" v-if="row.teams[round]">
                  {{ row.teams[round] }}
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="!loading && tableData.length === 0" class="empty-state">
      <div class="empty-icon">📊</div>
      <p>暂无排名数据</p>
      <p class="empty-hint">请先进行公演结算</p>
    </div>

    <div v-else class="loading-state">
      <t-loading size="large" />
      <p>加载中...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useSeasonStore } from '../../stores/seasonStore'
import { usePlayerStore } from '../../stores/playerStore'
import {
  getPlayerScores,
  getEliminationHistory,
  getAudienceVoteRanking,
  getAvatarUrl
} from '../../services/api'
import type { PlayerResult } from '../../types/performance'

const seasonStore = useSeasonStore()
const playerStore = usePlayerStore()
const loading = ref(false)

// 总轮次数
const totalRounds = computed(() => seasonStore.season?.currentRound || 0)

// 表格数据
interface TableRow {
  userId: string
  userName: string
  avatar: string | null
  teams: Record<number, string> // 每轮的队伍名称
  ranks: Record<number, number> // 每轮的排名
  scores: Record<number, number> // 每轮的评分
  popularity: Record<number, number> // 每轮的个人喜爱度
  lastParticipatedRound: number // 最后参演的轮次
  eliminatedRound?: number // 淘汰轮次
}

const tableData = ref<TableRow[]>([])

// 根据排名获取样式类
function getRankClass(rank: number | undefined): string {
  if (!rank) return ''
  if (rank === 1) return 'rank-gold'
  if (rank === 2) return 'rank-silver'
  if (rank === 3) return 'rank-bronze'
  return ''
}

// 加载所有轮次的排名数据
async function loadRankings() {
  if (totalRounds.value === 0) {
    tableData.value = []
    return
  }

  loading.value = true
  try {
    // 获取所有用户信息（包含头像）
    await playerStore.fetchUsers()
    const userMap = new Map(playerStore.users.map(u => [u.id, u]))

    // 获取所有轮次的选手得分数据
    const allRoundsData: Record<number, PlayerResult[]> = {}
    // 获取所有轮次的喜爱度数据（按 playerId 索引）
    const allPopularityData: Record<number, Record<string, { votes: number; rank: number }>> = {}
    // 获取所有轮次的团队名称数据（从喜爱度API提取，因为 performance API 不返回 teamName）
    const allTeamNames: Record<number, Record<string, string>> = {}
    
    for (let round = 1; round <= totalRounds.value; round++) {
      const roundId = `round-${round}`
      
      // 获取选手得分（仅用于 playerName 回退）
      try {
        const players = await getPlayerScores(round)
        allRoundsData[round] = players || []
      } catch (e) {
        allRoundsData[round] = []
      }

      // 获取喜爱度排名（排名按票数降序，是展示用的排名依据）
      try {
        const popularityRes = await getAudienceVoteRanking(roundId)
        if (popularityRes.success) {
          const popMap: Record<string, { votes: number; rank: number }> = {}
          const teamMap: Record<string, string> = {}
          ;(popularityRes.rankings || []).forEach((item: any) => {
            popMap[item.playerId] = { votes: item.votes, rank: item.rank }
            teamMap[item.playerId] = item.teamName
          })
          allPopularityData[round] = popMap
          allTeamNames[round] = teamMap
        }
      } catch (e) {
        allPopularityData[round] = {}
        allTeamNames[round] = {}
      }
    }

    // 获取淘汰历史
    const eliminationHistory = await getEliminationHistory()
    const eliminationMap = new Map<string, number>() // userId -> eliminatedRound
    eliminationHistory.forEach(record => {
      if (record.eliminated) {
        eliminationMap.set(record.userId, record.round)
      }
    })

    // 组装表格数据
    const playerMap = new Map<string, TableRow>()

    // 遍历所有轮次的数据
    for (let round = 1; round <= totalRounds.value; round++) {
      // 1. 从选手得分数据中获取选手名称（回退用）
      const players = allRoundsData[round] || []
      players.forEach((player: any) => {
        const playerId = player.playerId || player.userId || player.id || ''
        const playerName = player.playerName || player.userName || player.name || ''
        const playerScore = player.finalScore || player.score || player.totalScore
        
        if (!playerMap.has(playerId)) {
          const user = userMap.get(playerId)
          playerMap.set(playerId, {
            userId: playerId,
            userName: playerName || user?.name || '未知',
            avatar: user?.avatar || null,
            teams: {},
            ranks: {},
            scores: {},
            popularity: {},
            lastParticipatedRound: 0,
            eliminatedRound: eliminationMap.get(playerId)
          })
        }
        
        const row = playerMap.get(playerId)!
        // 更新名称（如果之前是未知）
        if (row.userName === '未知' && playerName) {
          row.userName = playerName
        }
        if (playerScore) row.scores[round] = playerScore
        row.lastParticipatedRound = round
      })

      // 2. 从喜爱度API中获取排名（按票数降序）、团队名称和喜爱度票数
      //    排名应该基于个人喜爱度从高到低，而非公演得分
      const popData = allPopularityData[round] || {}
      const teamData = allTeamNames[round] || {}
      Object.keys(popData).forEach(playerId => {
        const { votes, rank } = popData[playerId]
        
        if (!playerMap.has(playerId)) {
          playerMap.set(playerId, {
            userId: playerId,
            userName: '未知',
            avatar: null,
            teams: {},
            ranks: {},
            scores: {},
            popularity: {},
            lastParticipatedRound: 0,
            eliminatedRound: eliminationMap.get(playerId)
          })
        }
        const row = playerMap.get(playerId)!
        // 排名基于喜爱度票数
        if (rank !== undefined && rank !== null) row.ranks[round] = rank
        row.popularity[round] = votes
        if (teamData[playerId]) {
          row.teams[round] = teamData[playerId]
        }
      })
    }

    // 转换为数组并按最后参演轮次的排名排序
    tableData.value = Array.from(playerMap.values()).sort((a, b) => {
      const aRank = a.ranks[a.lastParticipatedRound] || 999
      const bRank = b.ranks[b.lastParticipatedRound] || 999
      
      if (a.lastParticipatedRound === b.lastParticipatedRound) {
        return aRank - bRank
      }
      
      return b.lastParticipatedRound - a.lastParticipatedRound
    })
  } catch (e: any) {
    MessagePlugin.error(e.message || '加载排名数据失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await seasonStore.fetchPerformanceRound()
  await loadRankings()
})
</script>

<style lang="scss" scoped>
.admin-ranking {
  padding: 20px;
  min-height: 100%;
}

.page-header {
  margin-bottom: 24px;

  h2 {
    font-size: 20px;
    font-weight: 600;
    color: #1a1a1a;
    margin: 0 0 8px 0;
  }

  .page-desc {
    font-size: 14px;
    color: #666;
    margin: 0;
  }
}

.ranking-table-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow: auto;
  margin-bottom: 20px;
}

.ranking-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 600px;

  thead {
    background: linear-gradient(135deg, #f0f5ff 0%, #fff 100%);
    position: sticky;
    top: 0;
    z-index: 10;

    th {
      padding: 16px 12px;
      text-align: center;
      font-weight: 600;
      font-size: 14px;
      color: #333;
      border-bottom: 2px solid #e8e8e8;
      white-space: nowrap;

      &.name-col {
        text-align: left;
        min-width: 150px;
      }

      &.avatar-col {
        text-align: center;
        min-width: 80px;
      }

      &.rank-col {
        min-width: 120px;

        .col-sub {
          font-size: 11px;
          font-weight: 400;
          color: #999;
          margin-top: 2px;
        }
      }
    }
  }

  tbody {
    tr {
      transition: background 0.2s;

      &:hover {
        background: #f9f9f9;
      }

      &:not(:last-child) {
        td {
          border-bottom: 1px solid #f0f0f0;
        }
      }
    }

    td {
      padding: 16px 12px;
      vertical-align: middle;

      &.name-col {
        text-align: left;

        .player-info {
          display: flex;
          flex-direction: column;
          gap: 4px;

          .player-name {
            font-weight: 500;
            color: #1a1a1a;
            font-size: 15px;
          }

          .player-team {
            font-size: 12px;
            color: #999;
          }
        }
      }

      &.avatar-col {
        text-align: center;

        .player-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          overflow: hidden;
          margin: 0 auto;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;

          img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .avatar-placeholder {
            color: white;
            font-weight: 600;
            font-size: 16px;
          }
        }
      }

      &.rank-col {
        text-align: center;

        .rank-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;

          .rank-number {
            font-size: 20px;
            font-weight: 700;
            color: #333;
            line-height: 1.2;
          }

          .rank-popularity {
            font-size: 11px;
            color: #e67e22;
            background: rgba(230, 126, 34, 0.1);
            padding: 1px 8px;
            border-radius: 6px;
            white-space: nowrap;
            font-weight: 500;
          }

          .rank-team {
            font-size: 11px;
            color: #888;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 90px;
          }

          &.rank-gold {
            .rank-number {
              color: #d4af37;
              text-shadow: 0 0 8px rgba(212, 175, 55, 0.3);
            }
          }

          &.rank-silver {
            .rank-number {
              color: #c0c0c0;
              text-shadow: 0 0 8px rgba(192, 192, 192, 0.3);
            }
          }

          &.rank-bronze {
            .rank-number {
              color: #cd7f32;
              text-shadow: 0 0 8px rgba(205, 127, 50, 0.3);
            }
          }

          &.rank-eliminated {
            .rank-number,
            .rank-popularity,
            .rank-team {
              color: #e74c3c !important;
              background: rgba(231, 76, 60, 0.06);
            }
          }
        }
      }
    }
  }
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }

  p {
    margin: 8px 0;
    color: #666;
    font-size: 16px;

    &.empty-hint {
      font-size: 14px;
      color: #999;
    }
  }
}

.loading-state {
  text-align: center;
  padding: 80px 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

  p {
    margin-top: 16px;
    color: #666;
    font-size: 14px;
  }
}

// 移动端适配
@media (max-width: 768px) {
  .admin-ranking {
    padding: 16px;
  }

  .page-header {
    margin-bottom: 16px;

    h2 {
      font-size: 18px;
    }

    .page-desc {
      font-size: 13px;
    }
  }

  .ranking-table-container {
    border-radius: 10px;
  }

  .ranking-table {
    thead {
      th {
        padding: 12px 8px;
        font-size: 13px;

        &.name-col {
          min-width: 120px;
        }

        &.rank-col {
          min-width: 80px;
        }
      }
    }

    tbody {
      td {
        padding: 12px 8px;

        &.name-col {
          .player-info {
            .player-name {
              font-size: 14px;
            }

            .player-team {
              font-size: 11px;
            }
          }
        }

        &.rank-col {
          .rank-cell {
            .rank-number {
              font-size: 16px;
            }

            .rank-popularity {
              font-size: 10px;
            }
          }
        }
      }
    }
  }
}

@media (max-width: 480px) {
  .admin-ranking {
    padding: 12px;
  }

  .page-header {
    margin-bottom: 12px;

    h2 {
      font-size: 17px;
    }

    .page-desc {
      font-size: 12px;
    }
  }

  .ranking-table {
    thead {
      th {
        padding: 10px 6px;
        font-size: 12px;

        &.name-col {
          min-width: 100px;
        }

        &.rank-col {
          min-width: 70px;
        }
      }
    }

    tbody {
      td {
        padding: 10px 6px;

        &.name-col {
          .player-info {
            .player-name {
              font-size: 13px;
            }

            .player-team {
              font-size: 10px;
            }
          }
        }

        &.rank-col {
          .rank-cell {
            .rank-number {
              font-size: 15px;
            }

            .rank-popularity {
              font-size: 9px;
            }
          }
        }
      }
    }
  }
}
</style>
