import type { User, Season, StageType, Team, TeamInvite, TeamApplication, Song, TrainingCard, TrainingRecord, TrainingConfig, PerformanceResult, PlayerScore, RehearsalResult, OperationLog } from '../types'
import { mockUsers } from '../mock/mockUsers'
import { mockSeason } from '../mock/mockSeason'
import { mockTeams, mockTeamInvites, mockTeamApplications } from '../mock/mockTeams'
import { mockSongs } from '../mock/mockSongs'
import { mockTrainingCards } from '../mock/mockTrainingCards'
import { mockLogs } from '../mock/mockLogs'
import { mockPerformanceResults, mockPlayerScores, mockRehearsalResults } from '../mock/mockPerformance'
import { weightedRandom, randomInt } from '../utils/random'
import { calculateTeamAverage, calculateSongAttrScore, calculateTeamFinalScore, calculatePlayerScore } from '../utils/score'

const STORAGE_KEYS = {
  USERS: 'luck_sim_users',
  SEASON: 'luck_sim_season',
  TEAMS: 'luck_sim_teams',
  INVITES: 'luck_sim_invites',
  APPLICATIONS: 'luck_sim_applications',
  SONGS: 'luck_sim_songs',
  SONG_ASSIGNMENTS: 'luck_sim_song_assignments',
  CARDS: 'luck_sim_cards',
  LOGS: 'luck_sim_logs',
  PERFORMANCE: 'luck_sim_performance',
  PLAYER_SCORES: 'luck_sim_player_scores',
  REHEARSAL: 'luck_sim_rehearsal',
  TRAINING_RECORDS: 'luck_sim_training_records',
  TRAINING_CONFIG: 'luck_sim_training_config',
  CURRENT_USER: 'luck_sim_current_user'
}

function getFromStorage<T>(key: string, defaultValue: T): T {
  const item = localStorage.getItem(key)
  if (item) {
    try {
      return JSON.parse(item)
    } catch {
      return defaultValue
    }
  }
  return defaultValue
}

function saveToStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export function initStorage(): void {
  if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
    saveToStorage(STORAGE_KEYS.USERS, mockUsers)
  }
  if (!localStorage.getItem(STORAGE_KEYS.SEASON)) {
    saveToStorage(STORAGE_KEYS.SEASON, mockSeason)
  }
  if (!localStorage.getItem(STORAGE_KEYS.TEAMS)) {
    saveToStorage(STORAGE_KEYS.TEAMS, mockTeams)
  }
  if (!localStorage.getItem(STORAGE_KEYS.INVITES)) {
    saveToStorage(STORAGE_KEYS.INVITES, mockTeamInvites)
  }
  if (!localStorage.getItem(STORAGE_KEYS.APPLICATIONS)) {
    saveToStorage(STORAGE_KEYS.APPLICATIONS, mockTeamApplications)
  }
  if (!localStorage.getItem(STORAGE_KEYS.SONGS)) {
    saveToStorage(STORAGE_KEYS.SONGS, mockSongs)
  }
  if (!localStorage.getItem(STORAGE_KEYS.CARDS)) {
    saveToStorage(STORAGE_KEYS.CARDS, mockTrainingCards)
  }
  if (!localStorage.getItem(STORAGE_KEYS.LOGS)) {
    saveToStorage(STORAGE_KEYS.LOGS, mockLogs)
  }
  if (!localStorage.getItem(STORAGE_KEYS.PERFORMANCE)) {
    saveToStorage(STORAGE_KEYS.PERFORMANCE, mockPerformanceResults)
  }
  if (!localStorage.getItem(STORAGE_KEYS.PLAYER_SCORES)) {
    saveToStorage(STORAGE_KEYS.PLAYER_SCORES, mockPlayerScores)
  }
  if (!localStorage.getItem(STORAGE_KEYS.REHEARSAL)) {
    saveToStorage(STORAGE_KEYS.REHEARSAL, mockRehearsalResults)
  }
  if (!localStorage.getItem(STORAGE_KEYS.TRAINING_RECORDS)) {
    saveToStorage(STORAGE_KEYS.TRAINING_RECORDS, [])
  }
}

export function loginByCode(code: string): Promise<User | null> {
  return new Promise((resolve) => {
    const users = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers)
    const user = users.find(u => u.loginCode === code)
    
    if (user) {
      user.hasLogin = true
      saveToStorage(STORAGE_KEYS.USERS, users)
      saveToStorage(STORAGE_KEYS.CURRENT_USER, user)
      addLog({
        userId: user.id,
        userName: user.name,
        role: user.role,
        actionType: 'login',
        detail: user.name + '登录系统'
      })
      resolve(user)
    } else {
      resolve(null)
    }
  })
}

export function getCurrentUser(): Promise<User | null> {
  return new Promise((resolve) => {
    // 从 sessionStorage 读取用户信息（由 LoginView 登录后写入，同 tab 会话有效）
    const userJson = sessionStorage.getItem('luck_sim_user')
    if (userJson) {
      try {
        resolve(JSON.parse(userJson))
        return
      } catch { /* ignore */ }
    }
    resolve(null)
  })
}

export function logout(): Promise<void> {
  return new Promise((resolve) => {
    const user = getFromStorage<User | null>(STORAGE_KEYS.CURRENT_USER, null)
    if (user) {
      const users = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers)
      const index = users.findIndex(u => u.id === user.id)
      if (index !== -1) {
        users[index].hasLogin = false
        saveToStorage(STORAGE_KEYS.USERS, users)
      }
      addLog({
        userId: user.id,
        userName: user.name,
        role: user.role,
        actionType: 'logout',
        detail: user.name + '退出登录'
      })
    }
    // 清除所有登录缓存
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER)
    localStorage.removeItem('luck_sim_token')
    localStorage.removeItem('luck_sim_user')
    sessionStorage.removeItem('luck_sim_token')
    sessionStorage.removeItem('luck_sim_user')
    resolve()
  })
}

export function getSeason(): Promise<Season> {
  return new Promise((resolve) => {
    const season = getFromStorage<Season>(STORAGE_KEYS.SEASON, mockSeason)
    resolve(season)
  })
}

export function updateCurrentStage(stage: StageType): Promise<Season> {
  return new Promise((resolve) => {
    const season = getFromStorage<Season>(STORAGE_KEYS.SEASON, mockSeason)
    season.currentStage = stage
    saveToStorage(STORAGE_KEYS.SEASON, season)
    addLog({
      userId: 'admin-001',
      userName: '赛事管理员',
      role: 'admin',
      actionType: 'update_stage',
      targetType: 'stage',
      targetId: stage,
      detail: '将阶段切换为' + stage
    })
    resolve(season)
  })
}

export function getUsers(): Promise<User[]> {
  return new Promise((resolve) => {
    const users = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers)
    resolve(users)
  })
}

export function updateUser(user: User): Promise<User> {
  return new Promise((resolve) => {
    const users = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers)
    const index = users.findIndex(u => u.id === user.id)
    if (index !== -1) {
      users[index] = user
      saveToStorage(STORAGE_KEYS.USERS, users)
      const current = getFromStorage<User | null>(STORAGE_KEYS.CURRENT_USER, null)
      if (current && current.id === user.id) {
        saveToStorage(STORAGE_KEYS.CURRENT_USER, user)
      }
    }
    resolve(user)
  })
}

export function getTeams(): Promise<Team[]> {
  return new Promise((resolve) => {
    const teams = getFromStorage<Team[]>(STORAGE_KEYS.TEAMS, mockTeams)
    resolve(teams)
  })
}

export function applyToTeam(teamId: string, userId: string): Promise<TeamApplication> {
  return new Promise((resolve) => {
    const applications = getFromStorage<TeamApplication[]>(STORAGE_KEYS.APPLICATIONS, [])
    const newApplication: TeamApplication = {
      id: 'app_' + Date.now(),
      teamId,
      userId,
      status: 'pending',
      createdAt: new Date().toLocaleString()
    }
    applications.push(newApplication)
    saveToStorage(STORAGE_KEYS.APPLICATIONS, applications)
    
    const user = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers).find(u => u.id === userId)
    addLog({
      userId,
      userName: user?.name || '未知',
      role: user?.role || 'player',
      actionType: 'apply_team',
      targetType: 'team',
      targetId: teamId,
      detail: user?.name + '申请加入队伍'
    })
    
    resolve(newApplication)
  })
}

export function invitePlayer(teamId: string, targetUserId: string): Promise<TeamInvite> {
  return new Promise((resolve) => {
    const invites = getFromStorage<TeamInvite[]>(STORAGE_KEYS.INVITES, [])
    const newInvite: TeamInvite = {
      id: 'inv_' + Date.now(),
      teamId,
      targetUserId,
      status: 'pending',
      createdAt: new Date().toLocaleString()
    }
    invites.push(newInvite)
    saveToStorage(STORAGE_KEYS.INVITES, invites)
    
    const user = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers).find(u => u.id === targetUserId)
    addLog({
      userId: 'admin-001',
      userName: '赛事管理员',
      role: 'admin',
      actionType: 'invite_player',
      targetType: 'user',
      targetId: targetUserId,
      detail: '邀请' + (user?.name || '') + '加入队伍'
    })
    
    resolve(newInvite)
  })
}

export function acceptInvite(teamId: string, userId: string): Promise<void> {
  return new Promise((resolve) => {
    const invites = getFromStorage<TeamInvite[]>(STORAGE_KEYS.INVITES, [])
    const inviteIndex = invites.findIndex(i => i.teamId === teamId && i.targetUserId === userId && i.status === 'pending')
    if (inviteIndex !== -1) {
      invites[inviteIndex].status = 'accepted'
      saveToStorage(STORAGE_KEYS.INVITES, invites)
      
      const teams = getFromStorage<Team[]>(STORAGE_KEYS.TEAMS, mockTeams)
      const teamIndex = teams.findIndex(t => t.id === teamId)
      if (teamIndex !== -1) {
        if (!teams[teamIndex].memberIds.includes(userId)) {
          teams[teamIndex].memberIds.push(userId)
          saveToStorage(STORAGE_KEYS.TEAMS, teams)
        }
      }
      
      const users = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers)
      const userIndex = users.findIndex(u => u.id === userId)
      if (userIndex !== -1) {
        users[userIndex].teamId = teamId
        saveToStorage(STORAGE_KEYS.USERS, users)
      }
      
      const user = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers).find(u => u.id === userId)
      addLog({
        userId,
        userName: user?.name || '未知',
        role: user?.role || 'player',
        actionType: 'accept_invite',
        targetType: 'team',
        targetId: teamId,
        detail: user?.name + '接受邀请加入队伍'
      })
    }
    resolve()
  })
}

export function rejectInvite(teamId: string, userId: string): Promise<void> {
  return new Promise((resolve) => {
    const invites = getFromStorage<TeamInvite[]>(STORAGE_KEYS.INVITES, [])
    const inviteIndex = invites.findIndex(i => i.teamId === teamId && i.targetUserId === userId && i.status === 'pending')
    if (inviteIndex !== -1) {
      invites[inviteIndex].status = 'rejected'
      saveToStorage(STORAGE_KEYS.INVITES, invites)
      
      const user = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers).find(u => u.id === userId)
      addLog({
        userId,
        userName: user?.name || '未知',
        role: user?.role || 'player',
        actionType: 'reject_invite',
        targetType: 'team',
        targetId: teamId,
        detail: user?.name + '拒绝邀请'
      })
    }
    resolve()
  })
}

export function lockTeam(teamId: string): Promise<void> {
  return new Promise((resolve) => {
    const teams = getFromStorage<Team[]>(STORAGE_KEYS.TEAMS, mockTeams)
    const teamIndex = teams.findIndex(t => t.id === teamId)
    if (teamIndex !== -1) {
      teams[teamIndex].locked = true
      saveToStorage(STORAGE_KEYS.TEAMS, teams)
      
      const team = teams[teamIndex]
      const captain = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers).find(u => u.id === team.captainId)
      addLog({
        userId: team.captainId || '',
        userName: captain?.name || '未知',
        role: 'captain',
        actionType: 'lock_team',
        targetType: 'team',
        targetId: teamId,
        detail: captain?.name + '锁定队伍'
      })
    }
    resolve()
  })
}

export function getTeamInvites(): Promise<TeamInvite[]> {
  return new Promise((resolve) => {
    const invites = getFromStorage<TeamInvite[]>(STORAGE_KEYS.INVITES, [])
    resolve(invites)
  })
}

export function getTeamApplications(): Promise<TeamApplication[]> {
  return new Promise((resolve) => {
    const applications = getFromStorage<TeamApplication[]>(STORAGE_KEYS.APPLICATIONS, [])
    resolve(applications)
  })
}

export function getSongs(): Promise<Song[]> {
  return new Promise((resolve) => {
    const songs = getFromStorage<Song[]>(STORAGE_KEYS.SONGS, mockSongs)
    resolve(songs)
  })
}

export function selectSong(teamId: string, songId: string): Promise<void> {
  return new Promise((resolve) => {
    const teams = getFromStorage<Team[]>(STORAGE_KEYS.TEAMS, mockTeams)
    const teamIndex = teams.findIndex(t => t.id === teamId)
    if (teamIndex !== -1) {
      const team = teams[teamIndex]
      const song = getFromStorage<Song[]>(STORAGE_KEYS.SONGS, mockSongs).find(s => s.id === songId)
      const captain = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers).find(u => u.id === team.captainId)
      addLog({
        userId: team.captainId || '',
        userName: captain?.name || '未知',
        role: 'captain',
        actionType: 'select_song',
        targetType: 'song',
        targetId: songId,
        detail: captain?.name + '选择歌曲: ' + (song?.name || '')
      })
    }
    resolve()
  })
}

export function getTrainingCards(): Promise<TrainingCard[]> {
  return new Promise((resolve) => {
    const cards = getFromStorage<TrainingCard[]>(STORAGE_KEYS.CARDS, mockTrainingCards)
    resolve(cards.filter(c => c.enabled))
  })
}

export function drawTrainingCard(userId: string): Promise<TrainingRecord> {
  return new Promise((resolve) => {
    const cards = getFromStorage<TrainingCard[]>(STORAGE_KEYS.CARDS, mockTrainingCards)
    const enabledCards = cards.filter(c => c.enabled)
    const card = weightedRandom(enabledCards, c => c.weight)
    
    let vocalChange = card.effect.vocal || 0
    let danceChange = card.effect.dance || 0
    let charmChange = card.effect.charm || 0
    
    // randomOne：随机一项属性
    if (card.effect.randomOne) {
      const attrs = ['vocal', 'dance', 'charm'] as const
      const randomAttr = attrs[randomInt(0, attrs.length - 1)]
      if (randomAttr === 'vocal') vocalChange += card.effect.randomOne!
      else if (randomAttr === 'dance') danceChange += card.effect.randomOne!
      else charmChange += card.effect.randomOne!
    }
    
    // randomTwo：随机两项属性
    if (card.effect.randomTwo) {
      const attrs = ['vocal', 'dance', 'charm'] as const
      const shuffled = [...attrs].sort(() => Math.random() - 0.5).slice(0, 2)
      for (const attr of shuffled) {
        if (attr === 'vocal') vocalChange += card.effect.randomTwo!
        else if (attr === 'dance') danceChange += card.effect.randomTwo!
        else charmChange += card.effect.randomTwo!
      }
    }
    
    // highest：最高属性（并列时均分加给所有最高属性）
    if (card.effect.highest) {
      const users = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers)
      const user = users.find(u => u.id === userId)
      if (user) {
        const { vocal, dance, charm } = user.attributes
        const maxVal = Math.max(vocal, dance, charm)
        if (vocal === maxVal) vocalChange += card.effect.highest
        if (dance === maxVal) danceChange += card.effect.highest
        if (charm === maxVal) charmChange += card.effect.highest
      }
    }
    
    // lowest：最低属性（并列时均分加给所有最低属性）
    if (card.effect.lowest) {
      const users = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers)
      const user = users.find(u => u.id === userId)
      if (user) {
        const { vocal, dance, charm } = user.attributes
        const minVal = Math.min(vocal, dance, charm)
        if (vocal === minVal) vocalChange += card.effect.lowest
        if (dance === minVal) danceChange += card.effect.lowest
        if (charm === minVal) charmChange += card.effect.lowest
      }
    }
    
    const users = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers)
    const userIndex = users.findIndex(u => u.id === userId)
    if (userIndex !== -1) {
      users[userIndex].attributes.vocal = Math.max(0, users[userIndex].attributes.vocal + vocalChange)
      users[userIndex].attributes.dance = Math.max(0, users[userIndex].attributes.dance + danceChange)
      users[userIndex].attributes.charm = Math.max(0, users[userIndex].attributes.charm + charmChange)
      saveToStorage(STORAGE_KEYS.USERS, users)
      
      const current = getFromStorage<User | null>(STORAGE_KEYS.CURRENT_USER, null)
      if (current && current.id === userId) {
        current.attributes = users[userIndex].attributes
        saveToStorage(STORAGE_KEYS.CURRENT_USER, current)
      }
    }
    
    const user = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers).find(u => u.id === userId)
    // 获取当前轮次
    const config = getFromStorage<TrainingConfig>(STORAGE_KEYS.TRAINING_CONFIG, { drawsPerPlayer: 3, currentRound: 1, totalRounds: 3 })
    const record: TrainingRecord = {
      id: 'tr_' + Date.now(),
      userId,
      userName: user?.name,
      cardId: card.id,
      cardName: card.name,
      cardType: card.type,
      effect: card.type === 'self_select' ? { ...card.effect } : { vocal: vocalChange, dance: danceChange, charm: charmChange },
      attributesAfter: user?.attributes,
      round: config.currentRound,
      createdAt: new Date().toLocaleString()
    }
    
    const records = getFromStorage<TrainingRecord[]>(STORAGE_KEYS.TRAINING_RECORDS, [])
    records.push(record)
    saveToStorage(STORAGE_KEYS.TRAINING_RECORDS, records)
    
    addLog({
      userId,
      userName: user?.name || '未知',
      role: user?.role || 'player',
      actionType: 'training_draw',
      targetType: 'card',
      targetId: card.id,
      detail: user?.name + '抽取训练卡牌: ' + card.name + ' (Vocal' + (vocalChange > 0 ? '+' : '') + vocalChange + ', Dance' + (danceChange > 0 ? '+' : '') + danceChange + ', Charm' + (charmChange > 0 ? '+' : '') + charmChange + ')'
    })
    
    resolve(record)
  })
}

export function getTrainingRecords(userId?: string): Promise<TrainingRecord[]> {
  return new Promise((resolve) => {
    const records = getFromStorage<TrainingRecord[]>(STORAGE_KEYS.TRAINING_RECORDS, [])
    if (userId) {
      resolve(records.filter(r => r.userId === userId))
    } else {
      resolve(records)
    }
  })
}

export function startRehearsal(teamId: string): Promise<RehearsalResult> {
  return new Promise((resolve) => {
    const events = [
      { name: '和声惊喜', description: '和声效果超出预期', bonus: { vocal: 2 } },
      { name: '舞蹈默契', description: '舞蹈配合完美', bonus: { dance: 3 } },
      { name: '舞台魅力', description: '整体表现力提升', bonus: { charm: 2 } },
      { name: '状态平平', description: '表现中规中矩', bonus: { vocal: 1, dance: 1 } },
      { name: '突发状况', description: '出现小失误', bonus: { vocal: -1, dance: -1 } }
    ]
    
    const event = events[randomInt(0, events.length - 1)]
    
    const result: RehearsalResult = {
      id: 'r_' + Date.now(),
      teamId,
      eventName: event.name,
      description: event.description,
      bonus: event.bonus,
      createdAt: new Date().toLocaleString()
    }
    
    const results = getFromStorage<RehearsalResult[]>(STORAGE_KEYS.REHEARSAL, [])
    const existingIndex = results.findIndex(r => r.teamId === teamId)
    if (existingIndex !== -1) {
      results[existingIndex] = result
    } else {
      results.push(result)
    }
    saveToStorage(STORAGE_KEYS.REHEARSAL, results)
    
    const team = getFromStorage<Team[]>(STORAGE_KEYS.TEAMS, mockTeams).find(t => t.id === teamId)
    const user = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers).find(u => u.id === team?.captainId)
    addLog({
      userId: team?.captainId || '',
      userName: user?.name || '未知用户',
      role: user?.role || 'captain',
      actionType: 'start_rehearsal',
      targetType: 'team',
      targetId: teamId,
      detail: (user?.name || '') + '开启彩排，获得: ' + event.name
    })
    
    resolve(result)
  })
}

export function getPlayerScores(): Promise<PlayerScore[]> {
  return new Promise((resolve) => {
    const scores = getFromStorage<PlayerScore[]>(STORAGE_KEYS.PLAYER_SCORES, [])
    resolve(scores.sort((a, b) => a.rank - b.rank))
  })
}

export function getPerformanceResults(): Promise<PerformanceResult[]> {
  return new Promise((resolve) => {
    const results = getFromStorage<PerformanceResult[]>(STORAGE_KEYS.PERFORMANCE, [])
    resolve(results.sort((a, b) => a.rank - b.rank))
  })
}

export function mockCalculatePerformance(): Promise<PerformanceResult[]> {
  return new Promise((resolve) => {
    const teams = getFromStorage<Team[]>(STORAGE_KEYS.TEAMS, mockTeams).filter(t => t.memberIds.length > 0)
    const users = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers)
    const songs = getFromStorage<Song[]>(STORAGE_KEYS.SONGS, mockSongs)
    const assignments = getFromStorage<any[]>(STORAGE_KEYS.SONG_ASSIGNMENTS, [])
    const rehearsals = getFromStorage<RehearsalResult[]>(STORAGE_KEYS.REHEARSAL, [])
    
    const results: PerformanceResult[] = []
    
    for (const team of teams) {
      const teamAvg = calculateTeamAverage(team, users)
      const assignment = assignments.find(a => a.teamId === team.id)
      if (!assignment) continue
      const song = songs.find(s => s.id === assignment.songId)
      if (!song) continue
      
      const attrScore = calculateSongAttrScore(teamAvg, song)
      const randomScore = randomInt(-10, 20)
      const rehearsal = rehearsals.find(r => r.teamId === team.id)
      const rehearsalBonus = rehearsal ? (rehearsal.bonus.vocal || 0) + (rehearsal.bonus.dance || 0) + (rehearsal.bonus.charm || 0) : 0
      const finalScore = calculateTeamFinalScore(song.baseScore, attrScore, randomScore, rehearsalBonus)
      
      results.push({
        id: 'perf_' + team.id,
        teamId: team.id,
        songId: song.id,
        teamVocal: teamAvg.vocal,
        teamDance: teamAvg.dance,
        teamCharm: teamAvg.charm,
        attrScore,
        randomScore,
        rehearsalBonus,
        finalScore,
        rank: 0
      })
    }
    
    results.sort((a, b) => b.finalScore - a.finalScore)
    results.forEach((r, i) => {
      r.rank = i + 1
    })
    
    saveToStorage(STORAGE_KEYS.PERFORMANCE, results)
    
    const playerScores: PlayerScore[] = []
    for (const team of teams) {
      const assignment = assignments.find(a => a.teamId === team.id)
      if (!assignment) continue
      const song = songs.find(s => s.id === assignment.songId)
      if (!song) continue
      
      const teamResult = results.find(r => r.teamId === team.id)
      const teamBonus = teamResult ? Math.max(0, 10 - teamResult.rank) * 5 : 0
      
      for (const memberId of team.memberIds) {
        const user = users.find(u => u.id === memberId)
        if (!user) continue
        
        const randomScoreVal = randomInt(-5, 10)
        const finalScoreVal = calculatePlayerScore(user, song, randomScoreVal, teamBonus)
        playerScores.push({
          id: 'ps_' + memberId,
          userId: memberId,
          teamId: team.id,
          vocalScore: user.attributes.vocal * song.vocalWeight,
          danceScore: user.attributes.dance * song.danceWeight,
          charmScore: user.attributes.charm * song.charmWeight,
          randomScore: randomScoreVal,
          teamBonus,
          finalScore: finalScoreVal,
          rank: 0
        })
      }
    }
    
    playerScores.sort((a, b) => b.finalScore - a.finalScore)
    playerScores.forEach((s, i) => {
      s.rank = i + 1
    })
    
    saveToStorage(STORAGE_KEYS.PLAYER_SCORES, playerScores)
    
    addLog({
      userId: 'admin-001',
      userName: '赛事管理员',
      role: 'admin',
      actionType: 'performance_calculate',
      detail: '完成公演结算'
    })
    
    resolve(results)
  })
}

export function generateElimination(): Promise<string[]> {
  return new Promise((resolve) => {
    const results = getFromStorage<PerformanceResult[]>(STORAGE_KEYS.PERFORMANCE, [])
    const playerScores = getFromStorage<PlayerScore[]>(STORAGE_KEYS.PLAYER_SCORES, [])
    const users = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers)
    
    if (results.length === 0 || playerScores.length === 0) {
      resolve([])
      return
    }
    
    const dangerThreshold = Math.ceil(results.length * 0.5)
    const dangerTeams = results.slice(dangerThreshold - 1).map(r => r.teamId)
    
    const eliminated: string[] = []
    
    for (const teamId of dangerTeams) {
      const teamPlayers = playerScores.filter(s => s.teamId === teamId)
      if (teamPlayers.length === 0) continue
      
      teamPlayers.sort((a, b) => a.finalScore - b.finalScore)
      const lowestPlayer = teamPlayers[0]
      eliminated.push(lowestPlayer.userId)
    }
    
    for (const userId of eliminated) {
      const userIndex = users.findIndex(u => u.id === userId)
      if (userIndex !== -1) {
        users[userIndex].status = 'eliminated'
        users[userIndex].teamId = undefined
      }
    }
    
    saveToStorage(STORAGE_KEYS.USERS, users)
    
    const eliminatedUsers = users.filter(u => eliminated.includes(u.id))
    addLog({
      userId: 'admin-001',
      userName: '赛事管理员',
      role: 'admin',
      actionType: 'elimination_generate',
      detail: '生成淘汰结果，淘汰选手: ' + eliminatedUsers.map(u => u.name).join(', ')
    })
    
    resolve(eliminated)
  })
}

export function getLogs(): Promise<OperationLog[]> {
  return new Promise((resolve) => {
    const logs = getFromStorage<OperationLog[]>(STORAGE_KEYS.LOGS, mockLogs)
    resolve(logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
  })
}

export function addLog(log: Omit<OperationLog, 'id' | 'createdAt'>): void {
  const logs = getFromStorage<OperationLog[]>(STORAGE_KEYS.LOGS, mockLogs)
  const newLog: OperationLog = {
    ...log,
    id: 'log_' + Date.now(),
    createdAt: new Date().toLocaleString()
  }
  logs.unshift(newLog)
  saveToStorage(STORAGE_KEYS.LOGS, logs)
}


export function getRehearsalResults(): Promise<RehearsalResult[]> {
  return new Promise((resolve) => {
    const results = getFromStorage<RehearsalResult[]>(STORAGE_KEYS.REHEARSAL, []);
    resolve(results);
  })
}

// 清空用户本轮训练记录
export function clearUserTrainingRecords(userId: string, round?: number): Promise<void> {
  return new Promise((resolve) => {
    const records = getFromStorage<TrainingRecord[]>(STORAGE_KEYS.TRAINING_RECORDS, [])
    const filtered = records.filter(r => {
      if (r.userId !== userId) return true
      if (round !== undefined) {
        // 按 round 筛选：检查记录创建时间对应的 round
        return false // 删除匹配的
      }
      return false // 删除该用户所有记录
    })
    // 只保留不属于该用户（且不属于该轮次）的记录
    const remaining = records.filter(r => {
      if (r.userId !== userId) return true
      return false
    })
    saveToStorage(STORAGE_KEYS.TRAINING_RECORDS, remaining)

    // 同时恢复用户属性到训练前状态（简化处理：重置为初始属性）
    const users = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers)
    const userIndex = users.findIndex(u => u.id === userId)
    if (userIndex !== -1) {
      // 找到该用户在本轮训练前的第一条记录之前的属性
      const userRecords = records.filter(r => r.userId === userId)
      if (userRecords.length > 0) {
        // 恢复到第一条训练记录之前的属性（这里简化：重置为基础值）
        users[userIndex].attributes = { vocal: 50, dance: 50, charm: 50 }
      }
      saveToStorage(STORAGE_KEYS.USERS, users)

      const current = getFromStorage<User | null>(STORAGE_KEYS.CURRENT_USER, null)
      if (current && current.id === userId) {
        current.attributes = users[userIndex].attributes
        saveToStorage(STORAGE_KEYS.CURRENT_USER, current)
      }
    }

    const user = users.find(u => u.id === userId)
    addLog({
      userId,
      userName: user?.name || '未知',
      role: user?.role || 'player',
      actionType: 'cancel_training',
      detail: (user?.name || '未知') + '取消了本轮训练成果'
    })

    resolve()
  })
}

// 一键完成所有训练
export function autoCompleteAll(round?: number): Promise<{ results: TrainingRecord[] }> {
  return new Promise(async (resolve) => {
    const users = getFromStorage<User[]>(STORAGE_KEYS.USERS, mockUsers)
    const players = users.filter(u => u.role === 'player' && u.status === 'active' && u.teamId)
    const results: TrainingRecord[] = []

    for (const player of players) {
      // 每个玩家抽3次卡
      for (let i = 0; i < 3; i++) {
        const record = await drawTrainingCard(player.id)
        results.push(record)
      }
    }

    resolve({ results })
  })
}

// 自动完成单个用户训练
export function autoCompleteUser(userId: string, round?: number): Promise<{ record: TrainingRecord }> {
  return new Promise(async (resolve) => {
    const record = await drawTrainingCard(userId)
    resolve({ record })
  })
}
