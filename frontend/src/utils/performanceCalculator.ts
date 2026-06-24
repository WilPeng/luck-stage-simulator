/**
 * 公演结算计算器（前端计算）
 * 评级体系设计：
 *
 * 选手个人得分 = 属性分 × 难度系数 + 发挥加分
 *   属性分 = player.vocal × nVocalW + player.dance × nDanceW + player.charm × nCharmW
 *   难度系数 = 1 - (song.difficulty - 1) × 0.1  (difficulty=1→1.0, 5→0.6)
 *   发挥加分 = performanceValue × 2 (performanceValue: -5~15, 加分: -10~30)
 *   得分范围 ≈ 0~120
 *
 * 评级映射：
 *   S(完美舞台) ≥ 85
 *   A(出色表现) ≥ 65
 *   B(稳定发挥) ≥ 45
 *   C(略有不足) ≥ 25
 *   D(失误较多) <  25
 *
 * 团队得分 = average(成员个人得分) + 团队随机加成(0~20)
 * 团队评级 = 同选手映射
 *
 * 最终票数 = 500 + 团队得分 × 3 + 排名随机波动(-10~20)
 */

import type { TeamPerformanceResult, PlayerPerformanceResult } from '../types/performance'
import type { RoundTeam, RoundTeamMember } from '../types/round'
import type { TeamSong } from '../types/round'
import type { User } from '../types/user'

// 评级阈值
const RATING_THRESHOLDS = [
  { min: 85, rating: 'S', text: '完美舞台' },
  { min: 65, rating: 'A', text: '出色表现' },
  { min: 45, rating: 'B', text: '稳定发挥' },
  { min: 25, rating: 'C', text: '略有不足' },
  { min: 0,  rating: 'D', text: '失误较多' }
]

function getRating(score: number): { rating: string; text: string } {
  for (const t of RATING_THRESHOLDS) {
    if (score >= t.min) return { rating: t.rating, text: t.text }
  }
  return { rating: 'D', text: '失误较多' }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * 归一化歌曲权重（确保三个权重之和为 1.0）
 */
function normalizeWeights(vocal: number, dance: number, charm: number): { vocal: number; dance: number; charm: number } {
  const total = vocal + dance + charm
  if (total === 0) return { vocal: 0.34, dance: 0.33, charm: 0.33 }
  return {
    vocal: vocal / total,
    dance: dance / total,
    charm: charm / total
  }
}

/**
 * 计算选手个人得分和评级
 */
function calculatePlayerScore(
  playerAttr: { vocal: number; dance: number; charm: number },
  songWeights: { vocal: number; dance: number; charm: number },
  songDifficulty: number,
  performanceValue: number  // 选手端生成的随机发挥值 (-5~15)
): { playerScore: number; stageRating: string; stageRatingText: string } {
  const nw = normalizeWeights(songWeights.vocal, songWeights.dance, songWeights.charm)

  // 1. 属性分 (0~100)
  const attrScore = playerAttr.vocal * nw.vocal + playerAttr.dance * nw.dance + playerAttr.charm * nw.charm

  // 2. 难度系数 (difficulty: 1 → 1.0, 5 → 0.6)
  const difficultyFactor = 1 - (songDifficulty - 1) * 0.1

  // 3. 发挥加分 (performanceValue: -5~15 → 加分: -10~30)
  const performanceBonus = performanceValue * 2

  // 4. 最终得分
  const playerScore = Math.round(attrScore * difficultyFactor + performanceBonus)
  const clamped = Math.max(0, Math.min(120, playerScore))

  // 5. 评级
  const { rating, text } = getRating(clamped)
  return { playerScore: clamped, stageRating: rating, stageRatingText: text }
}

/**
 * 前端计算公演结果
 * @param teams 队伍列表
 * @param teamSongs 队伍歌曲分配
 * @param users 选手列表
 * @param roundId 轮次ID
 * @param playerPerformanceMap 选手发挥值映射 { playerId: performanceValue }
 * @returns 公演结果
 */
export function calculatePerformanceResults(
  teams: RoundTeam[],
  teamSongs: TeamSong[],
  users: User[],
  roundId: string,
  playerPerformanceMap?: Record<string, number>
): { teamResults: TeamPerformanceResult[]; playerResults: PlayerPerformanceResult[] } {
  const teamResults: TeamPerformanceResult[] = []
  const playerResults: PlayerPerformanceResult[] = []

  // 计算队伍结果
  for (const team of teams) {
    if (!team.members || team.members.length === 0) continue

    const teamSong = teamSongs.find(ts => ts.teamId === team.id)
    if (!teamSong) continue

    const song = teamSong.song
    const songDifficulty = song?.difficulty || 3
    const songName = song?.name || '未分配歌曲'
    const songWeights = song ? {
      vocal: song.vocalWeight || 0.33,
      dance: song.danceWeight || 0.34,
      charm: song.charmWeight || 0.33
    } : { vocal: 0.33, dance: 0.34, charm: 0.33 }

    // 计算每个成员的个人得分
    const memberScores: { member: RoundTeamMember; score: number; rating: string; ratingText: string }[] = []

    for (const member of team.members) {
      const playerAttr = member.player?.attributes
        ? { vocal: member.player.attributes.vocal, dance: member.player.attributes.dance, charm: member.player.attributes.charm }
        : (() => {
            const user = users.find(u => u.id === member.playerId)
            return user?.attributes || { vocal: 50, dance: 50, charm: 50 }
          })()

      // 获取选手的发挥值（从映射或生成随机）
      const perfValue = playerPerformanceMap?.[member.playerId] ?? randomInt(-5, 15)

      const { playerScore, stageRating, stageRatingText } = calculatePlayerScore(
        playerAttr, songWeights, songDifficulty, perfValue
      )

      memberScores.push({ member, score: playerScore, rating: stageRating, ratingText: stageRatingText })
    }

    // 团队得分 = 成员平均分 + 随机加成(0~20)
    const avgMemberScore = Math.round(memberScores.reduce((s, m) => s + m.score, 0) / memberScores.length)
    const teamBonus = randomInt(0, 20)
    const teamScore = avgMemberScore + teamBonus
    const teamRating = getRating(teamScore)

    // 最终票数 = 基础票数 + 团队得分 × 3 + 排名波动
    const rankFluctuation = randomInt(-10, 20)
    const finalVotes = 500 + teamScore * 3 + rankFluctuation

    teamResults.push({
      roundId,
      teamId: team.id,
      teamName: team.name || `队伍${team.id}`,
      songId: teamSong.songId || '',
      songName,
      memberCount: team.members.length,
      baseVotes: 500,
      attributeVotes: avgMemberScore,
      performanceVotes: rankFluctuation,
      compatibilityVotes: 0,
      eventVotes: teamBonus,
      finalVotes: Math.max(0, finalVotes),
      rank: 0,
      status: 'calculated',
      teamScore,
      teamRating: teamRating.rating,
      teamRatingText: teamRating.text,
      songWeights,
      teamAttributes: {
        vocal: Math.round(memberScores.reduce((s, m) => s + (m.member.player?.attributes?.vocal || 50), 0) / memberScores.length),
        dance: Math.round(memberScores.reduce((s, m) => s + (m.member.player?.attributes?.dance || 50), 0) / memberScores.length),
        charm: Math.round(memberScores.reduce((s, m) => s + (m.member.player?.attributes?.charm || 50), 0) / memberScores.length),
      },
      compatibilityScore: 0,
      playerPerformances: []
    })

    // 记录选手结果
    let rankInTeam = 1
    for (const ms of memberScores) {
      playerResults.push({
        roundId,
        playerId: ms.member.playerId,
        playerName: ms.member.player?.name || '未知',
        teamId: team.id,
        teamName: team.name || '',
        performanceValue: playerPerformanceMap?.[ms.member.playerId] ?? randomInt(-5, 15),
        contribution: ms.score,
        rankInTeam: rankInTeam++,
        playerScore: ms.score,
        stageRating: ms.rating,
        stageRatingText: ms.ratingText,
        performanceText: `${ms.ratingText} (${ms.score}分)`
      })
    }
  }

  // 排序并计算排名
  teamResults.sort((a, b) => b.finalVotes - a.finalVotes)
  teamResults.forEach((team, index) => {
    team.rank = index + 1
  })

  // 更新队伍结果中的选手表演详情
  for (const teamResult of teamResults) {
    teamResult.playerPerformances = playerResults.filter(pr => pr.teamId === teamResult.teamId)
  }

  return { teamResults, playerResults }
}
