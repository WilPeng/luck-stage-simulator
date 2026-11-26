export interface ContestPlayer {
  playerId: string
  playerName: string
  avatar?: string | null
  color?: string
  connected?: boolean
}

export interface ContestState {
  score?: number
  progress?: number
  max?: number
  label?: string
  done?: boolean
  alive?: boolean
  eliminated?: boolean
  color?: string
}

export type SortOrder = 'game' | 'desc' | 'asc'
type Metric = { label: string; unit?: string; progress?: boolean; lower?: boolean; statusOnly?: boolean }

const metrics: Record<string, Metric> = {
  'reaction': { label: '总计用时', unit: 'ms', lower: true },
  'balance-bar': { label: '区内时长', unit: 's' },
  'klotski': { label: '移动步数', unit: '步', lower: true },
  'click-speed': { label: '点击次数', unit: '次' },
  'memory-match': { label: '已配对', unit: '对' },
  'quick-math': { label: '答对题数', unit: '题' },
  'jigsaw': { label: '正确拼块', unit: '块', progress: true },
  'spot-difference': { label: '标记数', unit: '处', progress: true },
  'power-challenge': { label: '占领题数', unit: '题' },
  'dice-duel': { label: '总点数', unit: '点' },
  'poison-drink': { label: '生命', unit: '点' },
  'poker17': { label: '筹码' },
  'minority': { label: '选手状态', statusOnly: true },
  'sequence-memory': { label: '选手状态', statusOnly: true },
  'catch-mistress': { label: '选手状态', statusOnly: true },
  'hide-and-go-veto': { label: '选手状态', statusOnly: true },
  'missing-number': { label: '选手状态', statusOnly: true }
}

export function contestMetric(id: string, mode?: string): Metric {
  if (mode === 'lives-build') return { label: '剩余生命', unit: '点' }
  if (['elim-last', 'first-pick', 'duel', 'survive-tb'].includes(mode || '')) return { label: '选手状态', statusOnly: true }
  return metrics[id] || { label: '积分', unit: '分' }
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function buildStandings(
  players: ContestPlayer[],
  states: Record<string, ContestState>,
  scores: Record<string, number>,
  winners: string[],
  id: string,
  target: number,
  order: SortOrder,
  mode?: string
) {
  const metric = contestMetric(id, mode)
  const rows = players.map(player => {
    const state = states[player.playerId] || {}
    const value = metric.statusOnly ? undefined : numeric(metric.progress ? state.progress : state.score ?? scores[player.playerId])
    return {
      ...player, ...state, value,
      winner: winners.includes(player.playerId),
      out: state.eliminated === true || state.alive === false || (['minority', 'sequence-memory'].includes(id) && state.done === true && state.score === 0),
      pct: state.max && state.max > 0 && state.progress != null
        ? Math.min(100, Math.max(0, state.progress / state.max * 100)) : undefined
    }
  })
  return rows.sort((a, b) => {
    if (order === 'game') {
      if (a.winner !== b.winner) return a.winner ? -1 : 1
      if (!metric.statusOnly && (a.value === undefined) !== (b.value === undefined)) {
        return a.value === undefined ? 1 : -1
      }
      if (a.out !== b.out) return a.out ? 1 : -1
      if (['klotski', 'reaction', 'jigsaw', 'spot-difference', 'memory-match', 'quick-math'].includes(id) && Boolean(a.done) !== Boolean(b.done)) {
        return a.done ? -1 : 1
      }
    }
    if (a.value === undefined) return b.value === undefined ? 0 : 1
    if (b.value === undefined) return -1
    if (order === 'game' && id === 'dice-duel' && target > 0) {
      const aOver = a.value > target
      const bOver = b.value > target
      if (aOver !== bOver) return aOver ? 1 : -1
      return Math.abs(a.value - target) - Math.abs(b.value - target)
    }
    return (order === 'asc' || (order === 'game' && metric.lower)) ? a.value - b.value : b.value - a.value
  })
}
