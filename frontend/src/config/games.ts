export interface GameConfig {
  id: string
  name: string
  description: string
  icon: string
  loginCodePrefix: string
}

export const GAMES: GameConfig[] = [
  {
    id: 'shengfeng2026',
    name: '乘风2026',
    description: '乘风2026运气赛模拟',
    icon: '🎤',
    loginCodePrefix: 'CF2026',
  },
  {
    id: 'bigbrother',
    name: 'Big Brother',
    description: '老大哥真人秀模拟',
    icon: '📹',
    loginCodePrefix: 'BB',
  },
  {
    id: 'lovevariety',
    name: '恋综',
    description: '恋综配对模拟',
    icon: '💕',
    loginCodePrefix: 'LV',
  },
]

export function getGameById(id: string): GameConfig | undefined {
  return GAMES.find((g) => g.id === id)
}

export const DEFAULT_GAME_ID = 'shengfeng2026'
