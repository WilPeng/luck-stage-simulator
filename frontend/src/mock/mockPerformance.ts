import type { PerformanceResult, PlayerScore, RehearsalResult } from '../types/performance'

export const mockPerformanceResults: PerformanceResult[] = []

export const mockPlayerScores: PlayerScore[] = []

export const mockRehearsalResults: RehearsalResult[] = [
  {
    id: 'r001',
    teamId: 't001',
    eventName: '和声惊喜',
    description: '和声效果超出预期',
    bonus: { vocal: 2 },
    createdAt: '2026-06-08 18:00:00'
  },
  {
    id: 'r002',
    teamId: 't002',
    eventName: '舞蹈默契',
    description: '舞蹈配合完美',
    bonus: { dance: 3 },
    createdAt: '2026-06-08 18:30:00'
  }
]