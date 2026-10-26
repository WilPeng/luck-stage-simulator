const { registerGame } = require('./index')

const LOCATIONS = [
  { icon: '🌳', name: '大树后' },
  { icon: '🛏️', name: '床底' },
  { icon: '🚪', name: '衣柜' },
  { icon: '🏠', name: '阁楼' },
  { icon: '🛋️', name: '沙发后' },
  { icon: '🧺', name: '洗衣篮' },
  { icon: '🚗', name: '车后备箱' },
  { icon: '🌲', name: '灌木丛' },
  { icon: '🪟', name: '窗帘后' },
  { icon: '📦', name: '纸箱里' },
  { icon: '🗄️', name: '档案柜' },
  { icon: '🧊', name: '冷库' },
  { icon: '🚿', name: '浴室' },
  { icon: '🍽️', name: '餐桌下' },
  { icon: '🪜', name: '储物间' },
  { icon: '🏚️', name: '地下室' },
  { icon: '🛗', name: '电梯井' },
  { icon: '🌉', name: '桥洞' },
  { icon: '⛺', name: '帐篷' },
  { icon: '🚢', name: '船舱' },
  { icon: '🏝️', name: '小岛' },
  { icon: '🕳️', name: '地洞' },
  { icon: '🌾', name: '麦田' },
  { icon: '🏭', name: '废弃工厂' },
  { icon: '🚇', name: '地铁站' },
  { icon: '🅿️', name: '停车场' },
  { icon: '🎪', name: '马戏团' },
  { icon: '🏰', name: '城堡' },
  { icon: '⛪', name: '教堂' },
  { icon: '🏥', name: '医院' },
  { icon: '🏫', name: '学校' },
  { icon: '📚', name: '图书馆' },
  { icon: '🎭', name: '剧院' },
  { icon: '🍜', name: '面馆' },
  { icon: '☕', name: '咖啡馆' },
  { icon: '🏨', name: '酒店' },
  { icon: '🛒', name: '超市' },
  { icon: '🎡', name: '游乐园' },
  { icon: '🚉', name: '火车站' },
  { icon: '✈️', name: '机场' }
]

const TOTAL = LOCATIONS.length

function clampInt(v, min, max, dflt) {
  const n = parseInt(v)
  if (Number.isNaN(n)) return dflt
  return Math.max(min, Math.min(max, n))
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function locName(index) {
  const l = LOCATIONS[index]
  return l ? `${l.icon} ${l.name}` : `#${index + 1}`
}

function alivePlayers(state) {
  return Object.values(state.players).filter(p => p.alive)
}

function unrevealedIndices(state) {
  const out = []
  for (let i = 0; i < TOTAL; i++) if (!state.revealed[i]) out.push(i)
  return out
}

function nameOf(state, playerId) {
  return state.players[playerId] ? state.players[playerId].playerName : playerId
}

function pushEvent(state, type, text, data) {
  if (!state._replayEvents) state._replayEvents = []
  state._replayEvents.push({ type, text, data: data || null })
}

function finishWith(state, winnerId) {
  state.finished = true
  state.phase = 'finished'
  state.winnerId = winnerId || null
  state.turnEndsAt = 0
  state.hideEndsAt = 0
  pushEvent(
    state,
    'finish',
    winnerId ? `${nameOf(state, winnerId)} 获胜` : '游戏结束（无胜者）',
    { winnerId: winnerId || null }
  )
}

function beginHiding(state, now) {
  state.phase = 'hiding'
  state.hideEndsAt = now + state.hideTime * 1000
  pushEvent(state, 'phase', `请选择藏身地点，共 ${TOTAL} 个地点`, { phase: 'hiding' })
}

function beginRevealing(state, now) {
  const unrevealed = unrevealedIndices(state)
  for (const p of Object.values(state.players)) {
    if (p.choice == null && unrevealed.length) {
      p.choice = unrevealed[Math.floor(Math.random() * unrevealed.length)]
    }
  }
  state.turnOrder = shuffle(Object.keys(state.players))
  state.turnIndex = 0
  state.phase = 'revealing'
  state.hideEndsAt = 0
  state.turnEndsAt = now + state.turnTime * 1000
  const alive = alivePlayers(state)
  if (alive.length <= 1) {
    finishWith(state, alive[0] ? alive[0].playerId : null)
    return true
  }
  let first = state.turnOrder.findIndex(pid => state.players[pid] && state.players[pid].alive)
  if (first < 0) first = 0
  state.turnIndex = first
  state.turnEndsAt = now + state.turnTime * 1000
  pushEvent(
    state,
    'phase',
    `藏身完毕，开始按随机顺序揭开地点：${state.turnOrder.map(pid => nameOf(state, pid)).join(' → ')}`,
    { phase: 'revealing', turnOrder: [...state.turnOrder] }
  )
  return false
}

function advanceTurn(state, now) {
  const alive = alivePlayers(state)
  if (alive.length <= 1) {
    finishWith(state, alive[0] ? alive[0].playerId : null)
    return true
  }
  const total = state.turnOrder.length
  for (let step = 1; step <= total; step++) {
    const idx = (state.turnIndex + step) % total
    const pid = state.turnOrder[idx]
    if (state.players[pid] && state.players[pid].alive) {
      state.turnIndex = idx
      state.turnEndsAt = now + state.turnTime * 1000
      return false
    }
  }
  finishWith(state, alive[0] ? alive[0].playerId : null)
  return true
}

function doReveal(state, playerId, location, now, auto) {
  if (!Number.isInteger(location) || location < 0 || location >= TOTAL) return false
  if (state.revealed[location]) return false

  const alive = alivePlayers(state)
  const beforeUnrevealed = TOTAL - state.revealed.filter(Boolean).length
  const targets = alive.filter(p => p.choice === location)
  const special = beforeUnrevealed === 1 && alive.length > 1 && alive.every(p => p.choice === location)

  state.revealed[location] = true

  if (special) {
    state.lastReveal = {
      location,
      locationName: locName(location),
      by: playerId,
      byName: nameOf(state, playerId),
      eliminated: [],
      empty: false,
      special: true,
      auto: !!auto
    }
    state.revealLog.push({ ...state.lastReveal, eliminated: [] })
    pushEvent(
      state,
      'finish',
      `${auto ? '超时，' : ''}${nameOf(state, playerId)} 揭开最后的藏身点 ${locName(location)}，率先揭开者获胜`,
      { location, playerId, special: true }
    )
    finishWith(state, playerId)
    return true
  }

  const eliminated = targets.map(p => p.playerId)
  for (const pid of eliminated) {
    state.players[pid].alive = false
    state.players[pid].eliminated = true
  }

  state.lastReveal = {
    location,
    locationName: locName(location),
    by: playerId,
    byName: nameOf(state, playerId),
    eliminated: eliminated.map(pid => ({ playerId: pid, playerName: nameOf(state, pid) })),
    empty: eliminated.length === 0,
    special: false,
    auto: !!auto
  }
  state.revealLog.push({ ...state.lastReveal, eliminated: [...state.lastReveal.eliminated] })

  if (eliminated.length) {
    pushEvent(
      state,
      'eliminate',
      `${auto ? '超时，' : ''}${nameOf(state, playerId)} 揭开 ${locName(location)}，${eliminated.map(pid => nameOf(state, pid)).join('、')} 被淘汰`,
      { location, playerId, eliminated }
    )
  } else {
    pushEvent(
      state,
      'reveal',
      `${auto ? '超时，' : ''}${nameOf(state, playerId)} 揭开 ${locName(location)}，无人被抓住`,
      { location, playerId, eliminated: [] }
    )
  }

  const remaining = alivePlayers(state)
  if (remaining.length <= 1) {
    finishWith(state, remaining[0] ? remaining[0].playerId : null)
    return true
  }
  return advanceTurn(state, now)
}

registerGame({
  id: 'catch-mistress',
  name: '抓小三',
  icon: '🕵️',
  description: '40 个藏身地点，每人秘密选择 1 个；随机顺序逐一揭开，被揭中者淘汰，躲到最后的人获胜',
  category: 'strategy',
  playerCount: { min: 2, max: 20 },
  duration: 900,
  needsServerTick: true,
  serverTickMs: 500,
  broadcastState: true,
  privateActions: ['hide'],

  init(participants, _pool, options = {}) {
    const hideTime = clampInt(options.hideTime, 5, 120, 30)
    const turnTime = clampInt(options.turnTime, 5, 120, 20)
    const players = {}
    participants.forEach(p => {
      players[p.playerId] = {
        playerId: p.playerId,
        playerName: p.playerName,
        alive: true,
        eliminated: false,
        choice: null
      }
    })
    return {
      status: 'ready',
      started: false,
      finished: false,
      phase: 'idle',
      players,
      turnOrder: [],
      turnIndex: 0,
      hideEndsAt: 0,
      turnEndsAt: 0,
      revealed: new Array(TOTAL).fill(false),
      revealLog: [],
      lastReveal: null,
      winnerId: null,
      hideTime,
      turnTime,
      _replayEvents: []
    }
  },

  tick(state) {
    if (state.status !== 'playing') return false
    const now = Date.now()
    if (!state.started) {
      state.started = true
      beginHiding(state, now)
      return false
    }
    if (state.finished) return true

    if (state.phase === 'hiding') {
      const allChosen = Object.values(state.players).every(p => p.choice != null)
      if (allChosen || now >= state.hideEndsAt) {
        return beginRevealing(state, now)
      }
      return false
    }

    if (state.phase === 'revealing') {
      const alive = alivePlayers(state)
      if (alive.length <= 1) {
        finishWith(state, alive[0] ? alive[0].playerId : null)
        return true
      }
      if (now >= state.turnEndsAt) {
        const unrevealed = unrevealedIndices(state)
        if (!unrevealed.length) {
          finishWith(state, alive[0] ? alive[0].playerId : null)
          return true
        }
        const location = unrevealed[Math.floor(Math.random() * unrevealed.length)]
        const pid = state.turnOrder[state.turnIndex]
        return doReveal(state, pid, location, now, true)
      }
    }
    return false
  },

  handleAction(state, playerId, action) {
    const player = state.players[playerId]
    if (!player || !action) return { updated: false }
    if (state.finished) return { updated: false, finished: true }

    if (action.type === 'hide') {
      if (state.phase !== 'hiding' || !player.alive) return { updated: false }
      const location = Number(action.location)
      if (!Number.isInteger(location) || location < 0 || location >= TOTAL) return { updated: false }
      if (player.choice === location) return { updated: false }
      player.choice = location
      const allChosen = Object.values(state.players).every(p => p.choice != null)
      if (allChosen) {
        const finished = beginRevealing(state, Date.now())
        return { updated: true, finished, winner: state.winnerId || undefined }
      }
      return { updated: true, finished: false }
    }

    if (action.type === 'reveal') {
      if (state.phase !== 'revealing' || !player.alive) return { updated: false }
      if (state.turnOrder[state.turnIndex] !== playerId) return { updated: false }
      const location = Number(action.location)
      const finished = doReveal(state, playerId, location, Date.now(), false)
      return { updated: true, finished, winner: state.winnerId || undefined }
    }

    return { updated: false }
  },

  isFinished(state) {
    return state.finished === true
  },

  getWinners(state) {
    return state.winnerId ? [state.winnerId] : []
  },

  computeWinner(state) {
    return state.winnerId || null
  },

  getState(state, playerId) {
    const now = Date.now()
    const me = state.players[playerId] || null
    const currentTurnId = state.phase === 'revealing' ? (state.turnOrder[state.turnIndex] || null) : null
    let secondsLeft = 0
    if (state.phase === 'hiding' && state.hideEndsAt) secondsLeft = Math.max(0, Math.ceil((state.hideEndsAt - now) / 1000))
    if (state.phase === 'revealing' && state.turnEndsAt) secondsLeft = Math.max(0, Math.ceil((state.turnEndsAt - now) / 1000))

    const revealLog = state.revealLog.map(r => ({
      location: r.location,
      locationName: locName(r.location),
      by: r.by,
      byName: nameOf(state, r.by),
      eliminated: (r.eliminated || []).map(e => ({ playerId: e.playerId, playerName: e.playerName })),
      empty: !!r.empty,
      special: !!r.special,
      auto: !!r.auto
    }))

    return {
      gameType: 'catch-mistress',
      status: state.status,
      started: state.started,
      finished: state.finished,
      phase: state.phase,
      serverNow: now,
      secondsLeft,
      hideEndsAt: state.hideEndsAt || 0,
      turnEndsAt: state.turnEndsAt || 0,
      totalLocations: TOTAL,
      locations: LOCATIONS.map((l, i) => ({ id: i, icon: l.icon, name: l.name })),
      revealed: state.revealed.map((v, i) => (v ? i : -1)).filter(i => i >= 0),
      revealLog,
      lastReveal: state.lastReveal
        ? {
            location: state.lastReveal.location,
            locationName: locName(state.lastReveal.location),
            by: state.lastReveal.by,
            byName: state.lastReveal.byName,
            eliminated: (state.lastReveal.eliminated || []).map(e => ({ playerId: e.playerId, playerName: e.playerName })),
            empty: !!state.lastReveal.empty,
            special: !!state.lastReveal.special,
            auto: !!state.lastReveal.auto
          }
        : null,
      currentTurnId,
      currentTurnName: currentTurnId ? nameOf(state, currentTurnId) : '',
      isMyTurn: !!(me && me.alive && currentTurnId === playerId),
      canHide: !!(me && me.alive && state.phase === 'hiding'),
      canReveal: !!(me && me.alive && state.phase === 'revealing' && currentTurnId === playerId),
      aliveCount: alivePlayers(state).length,
      revealedCount: state.revealed.filter(Boolean).length,
      myChoice: me ? me.choice : null,
      myAlive: me ? !!me.alive : false,
      players: Object.values(state.players).map(p => ({
        playerId: p.playerId,
        playerName: p.playerName,
        alive: p.alive,
        eliminated: p.eliminated,
        choice: state.finished || !p.alive ? p.choice : null
      })),
      winnerId: state.winnerId || null,
      winnerName: state.winnerId ? nameOf(state, state.winnerId) : ''
    }
  },

  getAllStates(state) {
    const out = {}
    for (const p of Object.values(state.players)) {
      let label = '存活'
      if (state.finished && state.winnerId === p.playerId) label = '获胜'
      else if (!p.alive) label = '已淘汰'
      else if (state.phase === 'hiding') label = p.choice != null ? '已藏好' : '选择中'
      out[p.playerId] = {
        score: p.alive ? 1 : 0,
        progress: p.alive ? 1 : 0,
        max: 1,
        done: !p.alive || state.finished === true,
        label,
        alive: p.alive
      }
    }
    return out
  },

  checkTarget() {
    return false
  },

  describeEvent(state, playerId, action) {
    if (!action) return null
    if (action.type === 'hide') {
      return { text: '已选定藏身地点' }
    }
    if (action.type === 'reveal') {
      const location = Number(action.location)
      return { text: `揭开 ${locName(location)}` }
    }
    return null
  },

  takeReplayEvents(state) {
    const evs = state._replayEvents || []
    state._replayEvents = []
    return evs
  },

  getReplayMeta(state) {
    const choices = {}
    for (const p of Object.values(state.players)) {
      choices[p.playerId] = p.choice != null ? locName(p.choice) : ''
    }
    return {
      type: 'catch-mistress',
      winnerId: state.winnerId || null,
      winnerName: state.winnerId ? nameOf(state, state.winnerId) : '',
      choices,
      alive: Object.values(state.players).filter(p => p.alive).map(p => p.playerId),
      revealLog: (state.revealLog || []).map(r => ({
        location: r.location,
        locationName: locName(r.location),
        byName: nameOf(state, r.by),
        eliminated: (r.eliminated || []).map(e => ({ playerId: e.playerId, playerName: e.playerName })),
        empty: !!r.empty,
        special: !!r.special,
        auto: !!r.auto
      }))
    }
  },

  getReplaySnapshot(state) {
    const currentTurnId = state.phase === 'revealing' ? (state.turnOrder[state.turnIndex] || null) : null
    const players = {}
    for (const p of Object.values(state.players)) {
      players[p.playerId] = {
        存活: p.alive ? '是' : '否',
        藏身点: p.choice != null ? locName(p.choice) : '未选择',
        出局: p.eliminated ? '是' : '否'
      }
    }
    const phaseLabel = state.phase === 'hiding'
      ? '选择藏身地点'
      : state.phase === 'revealing'
        ? '揭开地点'
        : state.phase === 'finished'
          ? '已结束'
          : '准备中'
    return {
      phase: state.phase,
      summary: {
        阶段: phaseLabel,
        已揭开: `${state.revealed.filter(Boolean).length}/${TOTAL}`,
        当前行动: currentTurnId ? nameOf(state, currentTurnId) : '—'
      },
      players
    }
  }
})
