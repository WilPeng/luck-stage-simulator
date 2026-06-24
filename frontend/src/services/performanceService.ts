/**
 * 公演数据持久化服务
 * 当前使用 localStorage 实现（前端本地存储），后续可无缝切换到后端 API
 */

const PERF_PREFIX = 'luck_sim_perf_'

// ==================== 选手发挥状态 ====================

export interface PlayerStatus {
  playerId: string
  playerName: string
  teamId: string
  teamName: string
  generated: boolean
  performanceValue: number | null
}

export function savePlayerStatuses(roundId: string, statuses: PlayerStatus[]): void {
  localStorage.setItem(`${PERF_PREFIX}${roundId}_playerStatuses`, JSON.stringify(statuses))
}

export function loadPlayerStatuses(roundId: string): PlayerStatus[] {
  const data = localStorage.getItem(`${PERF_PREFIX}${roundId}_playerStatuses`)
  return data ? JSON.parse(data) : []
}

// ==================== 公演开启状态 ====================

export function savePerformanceStarted(roundId: string, started: boolean): void {
  localStorage.setItem(`${PERF_PREFIX}${roundId}_started`, JSON.stringify(started))
}

export function loadPerformanceStarted(roundId: string): boolean {
  const data = localStorage.getItem(`${PERF_PREFIX}${roundId}_started`)
  return data ? JSON.parse(data) : false
}

// ==================== 团队揭晓状态 ====================

export function saveRevealedTeams(roundId: string, teamIds: string[]): void {
  localStorage.setItem(`${PERF_PREFIX}${roundId}_revealedTeams`, JSON.stringify(teamIds))
}

export function loadRevealedTeams(roundId: string): string[] {
  const data = localStorage.getItem(`${PERF_PREFIX}${roundId}_revealedTeams`)
  return data ? JSON.parse(data) : []
}

// ==================== 清除本轮数据 ====================

export function clearRoundPerformanceData(roundId: string): void {
  const keys = [
    `${PERF_PREFIX}${roundId}_playerStatuses`,
    `${PERF_PREFIX}${roundId}_started`,
    `${PERF_PREFIX}${roundId}_revealedTeams`,
    `${PERF_PREFIX}${roundId}_teamResults`,
    `${PERF_PREFIX}${roundId}_playerResults`
  ]
  keys.forEach(key => localStorage.removeItem(key))
}
