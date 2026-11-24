const { registerGame } = require('./index')

/**
 * 藏否决权牌寻宝赛（Hide and Go Veto）
 *
 * 流程：
 *  1. 藏牌阶段：每位选手秘密选择一个藏点藏好自己的否决权卡（可多人同点）。
 *  2. 寻宝阶段：随机顺序轮流进屋，每回合限时、限次数翻找藏点。
 *     - 翻出谁的卡，谁立即淘汰；同一点的多张卡一起翻出。
 *     - 可以翻自己的藏点（会先淘汰自己）；若这一翻导致全员出局，翻找者获胜。
 *  3. 最后一张未被找到的卡的主人获胜。
 *
 * 不向选手公布任何房间剩余卡牌数量。
 */

const ROOM_TEMPLATES = [
  {
    id: 'living',
    name: '客厅',
    icon: '🛋️',
    spots: [
      { icon: '🛋️', name: '沙发缝' },
      { icon: '📺', name: '电视柜后' },
      { icon: '🧶', name: '地毯下' },
      { icon: '🐠', name: '鱼缸里' },
      { icon: '🖼️', name: '相框背后' },
      { icon: '🔥', name: '壁炉里' },
      { icon: '📚', name: '书架第三层' },
      { icon: '💡', name: '吊灯上' }
    ]
  },
  {
    id: 'kitchen',
    name: '厨房',
    icon: '🥣',
    spots: [
      { icon: '🥣', name: '麦片盒里' },
      { icon: '🧊', name: '冰箱冷冻层' },
      { icon: '🍞', name: '烤箱内' },
      { icon: '🚰', name: '水槽下' },
      { icon: '🧂', name: '调料架后' },
      { icon: '🗄️', name: '橱柜顶' },
      { icon: '🗑️', name: '垃圾桶底' },
      { icon: '📻', name: '微波炉里' }
    ]
  },
  {
    id: 'bedroom',
    name: '主卧',
    icon: '🛏️',
    spots: [
      { icon: '🛏️', name: '床垫下' },
      { icon: '🛌', name: '枕头套里' },
      { icon: '👗', name: '衣柜顶' },
      { icon: '💄', name: '梳妆台抽屉' },
      { icon: '🪞', name: '穿衣镜后' },
      { icon: '🧺', name: '地毯下' },
      { icon: '💡', name: '床头灯罩内' },
      { icon: '🌬️', name: '空调出风口' }
    ]
  },
  {
    id: 'bathroom',
    name: '卫生间',
    icon: '🚽',
    spots: [
      { icon: '🚽', name: '马桶水箱' },
      { icon: '🚿', name: '浴帘杆上' },
      { icon: '🪥', name: '洗漱台柜' },
      { icon: '🪞', name: '镜子后' },
      { icon: '🧻', name: '毛巾堆' },
      { icon: '🛁', name: '浴缸下' },
      { icon: '🌬️', name: '通风口' },
      { icon: '🗑️', name: '垃圾桶' }
    ]
  },
  {
    id: 'attic',
    name: '阁楼',
    icon: '🏠',
    spots: [
      { icon: '🏠', name: '天花板隔层' },
      { icon: '📦', name: '旧箱子' },
      { icon: '🧣', name: '隔热棉里' },
      { icon: '🎄', name: '圣诞树盒' },
      { icon: '📔', name: '相册夹层' },
      { icon: '🪵', name: '地板缝' },
      { icon: '🛋️', name: '旧沙发垫' },
      { icon: '🪺', name: '鸟巢旁' }
    ]
  },
  {
    id: 'storage',
    name: '储藏室',
    icon: '🧰',
    spots: [
      { icon: '🧰', name: '储物架顶' },
      { icon: '🧰', name: '工具箱里' },
      { icon: '🪴', name: '花盆底' },
      { icon: '🧺', name: '洗衣机后' },
      { icon: '👕', name: '烘干机内' },
      { icon: '📦', name: '纸箱堆' },
      { icon: '🚜', name: '割草机下' },
      { icon: '🐕', name: '狗窝里' }
    ]
  }
]

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

function pickRoomCount(playerCount) {
  if (playerCount <= 3) return 2
  if (playerCount <= 6) return 3
  if (playerCount <= 9) return 4
  if (playerCount <= 13) return 5
  return 6
}

function buildBoard(playerCount) {
  const chosen = shuffle(ROOM_TEMPLATES).slice(0, pickRoomCount(playerCount))
  const rooms = []
  const spots = []
  for (const room of chosen) {
    const spotIds = []
    room.spots.forEach((sp, index) => {
      const id = `${room.id}-${index}`
      spotIds.push(id)
      spots.push({
        id,
        roomId: room.id,
        roomName: room.name,
        roomIcon: room.icon,
        icon: sp.icon,
        name: sp.name,
        searched: false,
        searchedBy: null,
        searchedByName: '',
        at: 0,
        found: []
      })
    })
    rooms.push({ id: room.id, name: room.name, icon: room.icon, spotIds })
  }
  return { rooms, spots }
}

function nameOf(state, playerId) {
  const p = state.players[playerId]
  return p ? p.playerName : playerId
}

function alivePlayers(state) {
  return Object.values(state.players).filter(p => !p.eliminated)
}

function cardsAtSpot(state, spotId) {
  return Object.values(state.players).filter(p => !p.eliminated && p.hideSpot === spotId)
}

function spotLabel(spot) {
  if (!spot) return ''
  return `${spot.roomName}·${spot.name}`
}

function pushEvent(state, type, text, data, playerId, playerName) {
  if (!state._replayEvents) state._replayEvents = []
  state._replayEvents.push({
    type,
    text,
    data: data || null,
    playerId: playerId || null,
    playerName: playerName || ''
  })
}

function phaseLabel(phase) {
  if (phase === 'hiding') return '藏牌阶段'
  if (phase === 'searching') return '寻宝阶段'
  if (phase === 'finished') return '已结束'
  return '准备中'
}

function finishReasonText(reason) {
  if (reason === 'mutual') return '（一记自杀式翻找，全员同归于尽）'
  if (reason === 'timeout') return '（时间耗尽，按找到卡牌数判定）'
  if (reason === 'exhausted') return '（藏点全部翻完）'
  if (reason === 'last') return '（最后一张没被找到的卡）'
  return ''
}

function tiebreakWinner(state) {
  const alive = alivePlayers(state)
  if (!alive.length) return null
  const sorted = [...alive].sort((a, b) => {
    if (b.finds !== a.finds) return b.finds - a.finds
    if (b.searches !== a.searches) return b.searches - a.searches
    return a.seat - b.seat
  })
  return sorted[0].playerId
}

function winnerIdOf(state) {
  if (state.winnerId) return state.winnerId
  if (state.finished) return tiebreakWinner(state)
  return null
}

function finishWith(state, winnerId, reason) {
  if (state.finished) return true
  state.finished = true
  state.status = 'finished'
  state.phase = 'finished'
  state.winnerId = winnerId || null
  state.finishReason = reason || 'last'
  state.hideEndsAt = 0
  state.turnEndsAt = 0
  state.actionsLeft = 0
  const winner = winnerId ? state.players[winnerId] : null
  pushEvent(
    state,
    'finish',
    winner
      ? `${winner.playerName} 赢得否决权！${finishReasonText(state.finishReason)}`
      : '游戏结束（无胜者）',
    { winnerId: winnerId || null, reason: state.finishReason }
  )
  return true
}

function startTurn(state, now) {
  state.actionsLeft = state.searchesPerTurn
  state.turnEndsAt = now + state.turnTime * 1000
}

function beginHiding(state, now) {
  state.phase = 'hiding'
  state.startedAt = now
  state.hideEndsAt = now + state.hideTime * 1000
  state.endsAt = state.timeLimit > 0 ? now + state.timeLimit * 1000 : 0
  pushEvent(
    state,
    'phase',
    `藏牌阶段开始：共 ${state.totalSpots} 个藏点，${state.hideTime} 秒内藏好你的否决权卡`,
    { phase: 'hiding', totalSpots: state.totalSpots }
  )
}

function assignRandomHides(state, now) {
  const late = []
  for (const p of Object.values(state.players)) {
    if (p.hideSpot == null) {
      p.hideSpot = state.spots[Math.floor(Math.random() * state.spots.length)].id
      p.hideAuto = true
      late.push(p.playerName)
    }
  }
  if (late.length) {
    pushEvent(
      state,
      'info',
      `${late.join('、')} 没来得及藏好，卡片被工作人员随手塞进了某个角落`,
      { late }
    )
  }
}

function beginSearching(state, now) {
  assignRandomHides(state, now)
  state.phase = 'searching'
  state.hideEndsAt = 0
  state.turnOrder = shuffle(Object.keys(state.players))
  let first = state.turnOrder.findIndex(pid => state.players[pid] && !state.players[pid].eliminated)
  if (first < 0) first = 0
  state.turnIndex = first
  startTurn(state, now)
  pushEvent(
    state,
    'phase',
    `藏牌结束！行动顺序：${state.turnOrder.map(pid => nameOf(state, pid)).join(' → ')}`,
    { phase: 'searching', turnOrder: [...state.turnOrder] }
  )
}

function nextAliveIndex(state, fromIndex) {
  const total = state.turnOrder.length
  for (let step = 1; step <= total; step++) {
    const idx = (fromIndex + step) % total
    const p = state.players[state.turnOrder[idx]]
    if (p && !p.eliminated) return idx
  }
  return -1
}

function advanceTurn(state, now) {
  if (state.finished) return true
  const alive = alivePlayers(state)
  if (alive.length <= 1) {
    finishWith(state, alive[0] ? alive[0].playerId : null, 'last')
    return true
  }
  const idx = nextAliveIndex(state, state.turnIndex)
  if (idx < 0) {
    finishWith(state, alive[0].playerId, 'last')
    return true
  }
  state.turnIndex = idx
  startTurn(state, now)
  return false
}

function doSearch(state, playerId, spotId, now, auto) {
  const player = state.players[playerId]
  if (!player || player.eliminated || state.finished) return { ok: false, finished: state.finished }
  if (state.phase !== 'searching') return { ok: false, finished: false }
  if (state.turnOrder[state.turnIndex] !== playerId) return { ok: false, finished: false }
  if (state.actionsLeft <= 0) return { ok: false, finished: false }

  const spot = state.spots.find(s => s.id === spotId)
  if (!spot || spot.searched) return { ok: false, finished: false }

  const cards = cardsAtSpot(state, spotId)
  const selfEliminated = cards.some(c => c.playerId === playerId)

  spot.searched = true
  spot.searchedBy = playerId
  spot.searchedByName = player.playerName
  spot.at = now
  spot.found = cards.map(c => ({ playerId: c.playerId, playerName: c.playerName }))

  for (const card of cards) {
    const owner = state.players[card.playerId]
    owner.eliminated = true
    owner.foundBy = playerId
    owner.foundAt = now
    owner.foundSpotName = spotLabel(spot)
  }

  player.searches += 1
  player.finds += cards.length
  state.actionsLeft -= 1
  state.searchLog.push({
    at: now,
    playerId,
    playerName: player.playerName,
    spotId,
    roomId: spot.roomId,
    roomName: spot.roomName,
    spotName: spot.name,
    found: spot.found.map(c => ({ ...c })),
    auto: !!auto
  })
  if (state.searchLog.length > 600) state.searchLog = state.searchLog.slice(-600)

  if (auto) {
    const prefix = '超时，'
    const selfNote = selfEliminated ? '（翻了自己的藏点）' : ''
    if (cards.length) {
      pushEvent(
        state,
        'eliminate',
        `${prefix}${selfNote}${player.playerName} 在 ${spotLabel(spot)} 翻出了 ${cards.map(c => c.playerName).join('、')} 的卡牌！`,
        { spotId, playerId, found: spot.found.map(c => ({ ...c })), auto: true },
        playerId,
        player.playerName
      )
    } else {
      pushEvent(
        state,
        'search',
        `${prefix}${player.playerName} 翻遍了 ${spotLabel(spot)}，只有灰尘…`,
        { spotId, playerId, auto: true },
        playerId,
        player.playerName
      )
    }
  }

  const result = {
    spotId,
    roomName: spot.roomName,
    spotName: spot.name,
    found: spot.found.map(c => ({ ...c })),
    selfEliminated,
    auto: !!auto
  }

  const alive = alivePlayers(state)
  if (alive.length === 0) {
    finishWith(state, playerId, 'mutual')
    return { ok: true, finished: true, result }
  }
  if (alive.length === 1) {
    finishWith(state, alive[0].playerId, 'last')
    return { ok: true, finished: true, result }
  }
  if (selfEliminated || state.actionsLeft <= 0) {
    state.actionsLeft = 0
    const finished = advanceTurn(state, now)
    return { ok: true, finished, result }
  }
  return { ok: true, finished: false, result }
}

function autoSearchTurn(state, now) {
  if (state.finished) return true
  const pid = state.turnOrder[state.turnIndex]
  const player = state.players[pid]
  if (!player || player.eliminated) return advanceTurn(state, now)
  if (state.actionsLeft <= 0) return advanceTurn(state, now)

  const total = Math.max(1, state.actionsLeft)
  for (let i = 0; i < total; i++) {
    if (state.finished || state.phase !== 'searching') return state.finished
    if (state.turnOrder[state.turnIndex] !== pid) return state.finished
    if (state.actionsLeft <= 0) return state.finished

    let pool = state.spots.filter(s => !s.searched && s.id !== player.hideSpot)
    if (!pool.length) pool = state.spots.filter(s => !s.searched)
    if (!pool.length) {
      const alive = alivePlayers(state)
      finishWith(state, alive[0] ? alive[0].playerId : null, 'exhausted')
      return true
    }
    const spot = pool[Math.floor(Math.random() * pool.length)]
    const res = doSearch(state, pid, spot.id, now, true)
    if (res.finished) return true
    if (!res.ok) return advanceTurn(state, now)
    if (player.eliminated) return state.finished
  }

  if (!state.finished && state.phase === 'searching' && state.turnOrder[state.turnIndex] === pid) {
    return advanceTurn(state, now)
  }
  return state.finished
}

registerGame({
  id: 'hide-and-go-veto',
  name: '藏否决权牌寻宝赛',
  icon: '🃏',
  description: '每人秘密藏好写有自己名字的否决权卡，随后轮流进屋限时翻找；翻到谁的卡谁淘汰，最后一张没被找到的卡获胜',
  category: 'strategy',
  playerCount: { min: 2, max: 20 },
  duration: 900,
  needsServerTick: true,
  serverTickMs: 500,
  broadcastState: true,
  privateActions: ['hide'],

  init(participants, _pool, options = {}) {
    const hideTime = clampInt(options.hideTime, 10, 120, 40)
    const turnTime = clampInt(options.turnTime, 5, 120, 20)
    const searchesPerTurn = clampInt(options.searchesPerTurn, 1, 3, 1)
    const timeLimit = options.timeLimit === 0 ? 0 : clampInt(options.timeLimit, 60, 7200, 900)
    const { rooms, spots } = buildBoard(participants.length)

    const players = {}
    participants.forEach((p, index) => {
      players[p.playerId] = {
        playerId: p.playerId,
        playerName: p.playerName,
        seat: index,
        eliminated: false,
        hideSpot: null,
        hideAuto: false,
        searches: 0,
        finds: 0,
        foundBy: null,
        foundAt: null,
        foundSpotName: ''
      }
    })

    return {
      status: 'ready',
      started: false,
      finished: false,
      phase: 'idle',
      players,
      rooms,
      spots,
      turnOrder: [],
      turnIndex: 0,
      hideEndsAt: 0,
      turnEndsAt: 0,
      actionsLeft: 0,
      hideTime,
      turnTime,
      searchesPerTurn,
      timeLimit,
      endsAt: 0,
      totalSpots: spots.length,
      searchLog: [],
      winnerId: null,
      finishReason: '',
      startTime: null,
      _replayEvents: []
    }
  },

  tick(state) {
    if (state.status !== 'playing') return false
    const now = Date.now()
    if (!state.started) {
      state.started = true
      state.startTime = now
      beginHiding(state, now)
      return false
    }
    if (state.finished) return true
    if (state.endsAt && now >= state.endsAt) {
      finishWith(state, tiebreakWinner(state), 'timeout')
      return true
    }
    if (state.phase === 'hiding') {
      const allHidden = Object.values(state.players).every(p => p.hideSpot != null)
      if (allHidden || now >= state.hideEndsAt) {
        beginSearching(state, now)
        return state.finished
      }
      return false
    }
    if (state.phase === 'searching' && now >= state.turnEndsAt) {
      return autoSearchTurn(state, now)
    }
    return false
  },

  handleAction(state, playerId, action) {
    const player = state.players[playerId]
    if (!player || !action) return { updated: false }
    if (state.finished) return { updated: false, finished: true, winner: state.winnerId || undefined }

    if (action.type === 'hide') {
      if (state.phase !== 'hiding' || player.hideSpot != null || player.eliminated) {
        return { updated: false }
      }
      const spotId = String(action.spotId || '')
      if (!state.spots.some(s => s.id === spotId)) return { updated: false }
      player.hideSpot = spotId
      player.hideAuto = false
      return { updated: true, finished: false, result: { submitted: true } }
    }

    if (action.type === 'search') {
      if (state.phase !== 'searching' || player.eliminated) return { updated: false }
      if (state.turnOrder[state.turnIndex] !== playerId) return { updated: false }
      const res = doSearch(state, playerId, String(action.spotId || ''), Date.now(), false)
      if (!res.ok) return { updated: false }
      return {
        updated: true,
        finished: res.finished,
        winner: res.finished ? (state.winnerId || undefined) : undefined,
        result: res.result
      }
    }

    return { updated: false }
  },

  isFinished(state) {
    return state.finished === true
  },

  computeWinner(state) {
    return winnerIdOf(state)
  },

  getWinners(state) {
    const wid = winnerIdOf(state) || tiebreakWinner(state)
    return wid ? [wid] : []
  },

  getState(state, playerId) {
    const now = Date.now()
    const me = state.players[playerId] || null
    const currentPid = state.phase === 'searching' ? (state.turnOrder[state.turnIndex] || null) : null
    let secondsLeft = 0
    if (state.phase === 'hiding' && state.hideEndsAt) {
      secondsLeft = Math.max(0, Math.ceil((state.hideEndsAt - now) / 1000))
    } else if (state.phase === 'searching' && state.turnEndsAt) {
      secondsLeft = Math.max(0, Math.ceil((state.turnEndsAt - now) / 1000))
    }

    const revealed = state.finished
    const spotById = new Map(state.spots.map(s => [s.id, s]))
    const alive = alivePlayers(state)
    const winnerId = winnerIdOf(state)
    const destruction = Math.min(100, Math.round(state.searchLog.length / Math.max(1, state.totalSpots) * 100))

    const rooms = state.rooms.map(r => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      spots: r.spotIds.map(id => {
        const s = spotById.get(id)
        return {
          id: s.id,
          icon: s.icon,
          name: s.name,
          searched: s.searched,
          searchedByName: s.searched ? s.searchedByName : '',
          found: s.searched ? s.found.map(c => ({ playerId: c.playerId, playerName: c.playerName })) : []
        }
      })
    }))

    const allCards = revealed
      ? Object.values(state.players).map(p => {
          const s = p.hideSpot ? spotById.get(p.hideSpot) : null
          return {
            playerId: p.playerId,
            playerName: p.playerName,
            spotId: p.hideSpot,
            spotName: s ? spotLabel(s) : '',
            eliminated: p.eliminated,
            foundByName: p.foundBy ? nameOf(state, p.foundBy) : ''
          }
        })
      : null

    const searchLog = state.searchLog.slice(-40).map(r => ({
      at: r.at,
      playerId: r.playerId,
      playerName: r.playerName,
      roomName: r.roomName,
      spotName: r.spotName,
      found: (r.found || []).map(c => ({ playerId: c.playerId, playerName: c.playerName })),
      auto: !!r.auto
    }))

    const mySpot = me && me.hideSpot ? spotById.get(me.hideSpot) : null

    return {
      gameType: 'hide-and-go-veto',
      status: state.status,
      started: state.started,
      finished: state.finished,
      phase: state.phase,
      serverNow: now,
      secondsLeft,
      hideEndsAt: state.hideEndsAt || 0,
      turnEndsAt: state.turnEndsAt || 0,
      startTime: state.startTime || 0,
      totalSpots: state.totalSpots,
      rooms,
      playerCount: Object.keys(state.players).length,
      hideSubmittedCount: Object.values(state.players).filter(p => p.hideSpot != null).length,
      myHideSpot: me ? me.hideSpot : null,
      myHideSpotName: mySpot ? spotLabel(mySpot) : '',
      myAlive: me ? !me.eliminated : false,
      myCardFound: me ? !!me.eliminated : false,
      myFoundBy: me && me.foundBy ? nameOf(state, me.foundBy) : '',
      mySearches: me ? me.searches : 0,
      myFinds: me ? me.finds : 0,
      currentTurnId: currentPid,
      currentTurnName: currentPid ? nameOf(state, currentPid) : '',
      isMyTurn: !!(me && !me.eliminated && currentPid === playerId && state.phase === 'searching'),
      actionsLeft: state.actionsLeft || 0,
      searchesPerTurn: state.searchesPerTurn,
      aliveCount: alive.length,
      hiddenCount: alive.length,
      totalSearches: state.searchLog.length,
      destruction,
      players: Object.values(state.players).sort((a, b) => a.seat - b.seat).map(p => {
        const visible = revealed || p.eliminated || (me && p.playerId === me.playerId)
        const s = p.hideSpot ? spotById.get(p.hideSpot) : null
        return {
          playerId: p.playerId,
          playerName: p.playerName,
          alive: !p.eliminated,
          eliminated: p.eliminated,
          searches: p.searches,
          finds: p.finds,
          foundByName: p.foundBy ? nameOf(state, p.foundBy) : '',
          hideSpot: visible ? p.hideSpot : null,
          hideSpotName: visible && s ? spotLabel(s) : ''
        }
      }),
      searchLog,
      allCards,
      winnerId: winnerId || null,
      winnerName: winnerId ? nameOf(state, winnerId) : '',
      finishReason: state.finishReason || ''
    }
  },

  getAllStates(state) {
    const out = {}
    const winnerId = winnerIdOf(state)
    for (const p of Object.values(state.players)) {
      let label = '潜藏中'
      if (state.finished && winnerId === p.playerId) {
        label = state.finishReason === 'mutual' ? '同归于尽获胜' : '获胜'
      } else if (p.eliminated) {
        label = `被 ${p.foundBy ? nameOf(state, p.foundBy) : '?'} 找到`
      } else if (state.phase === 'hiding') {
        label = p.hideSpot ? '已藏好' : '藏牌中'
      } else if (state.phase === 'searching') {
        label = '卡牌仍隐藏'
      }
      out[p.playerId] = {
        score: state.finished && winnerId === p.playerId ? 1 : 0,
        progress: p.eliminated ? 0 : 1,
        max: 1,
        done: p.eliminated || state.finished,
        label,
        alive: !p.eliminated
      }
    }
    return out
  },

  checkTarget() {
    return false
  },

  describeEvent(state, playerId, action, result) {
    if (!action) return null
    if (action.type === 'hide') {
      return { text: '已藏好否决权卡' }
    }
    if (action.type === 'search') {
      const r = result || {}
      const place = `${r.roomName || ''}·${r.spotName || ''}`
      const found = r.found || []
      const self = r.selfEliminated ? '（翻了自己的藏点）' : ''
      if (found.length) {
        return {
          text: `${self}在 ${place} 翻出了 ${found.map(c => c.playerName).join('、')} 的卡牌！`,
          data: { spotId: r.spotId, found }
        }
      }
      return { text: `翻遍了 ${place}，只有灰尘…`, data: { spotId: r.spotId } }
    }
    return null
  },

  takeReplayEvents(state) {
    const events = state._replayEvents || []
    state._replayEvents = []
    return events
  },

  getReplaySnapshot(state) {
    const currentPid = state.phase === 'searching' ? (state.turnOrder[state.turnIndex] || null) : null
    const spotById = new Map(state.spots.map(s => [s.id, s]))
    const destruction = Math.min(100, Math.round(state.searchLog.length / Math.max(1, state.totalSpots) * 100))
    const summary = {
      阶段: phaseLabel(state.phase),
      当前行动: currentPid ? `${nameOf(state, currentPid)}${state.actionsLeft ? `（剩 ${state.actionsLeft} 次）` : ''}` : '—',
      存活: `${alivePlayers(state).length}/${Object.keys(state.players).length}`,
      已翻找: `${state.searchLog.length} 处 / ${state.totalSpots} 个藏点`,
      破坏度: `${destruction}%`
    }
    const wid = winnerIdOf(state)
    if (wid) summary['获胜者'] = nameOf(state, wid)

    const players = {}
    for (const p of Object.values(state.players)) {
      const s = p.hideSpot ? spotById.get(p.hideSpot) : null
      let status = p.eliminated ? '淘汰' : (state.finished ? '幸存' : '存活')
      if (wid === p.playerId) status = state.finishReason === 'mutual' ? '同归于尽获胜' : '获胜'
      players[p.playerId] = {
        状态: status,
        藏点: s ? spotLabel(s) : '未藏',
        翻找次数: p.searches,
        找到卡牌: p.finds,
        被谁找到: p.foundBy ? nameOf(state, p.foundBy) : '—'
      }
    }
    return { type: 'hide-and-go-veto', phase: state.phase, summary, players }
  },

  getAdminState(state) {
    const spotById = new Map(state.spots.map(s => [s.id, s]))
    const currentPid = state.phase === 'searching' ? (state.turnOrder[state.turnIndex] || null) : null
    const destruction = Math.min(100, Math.round(state.searchLog.length / Math.max(1, state.totalSpots) * 100))
    const wid = winnerIdOf(state)
    return {
      phase: state.phase,
      phaseLabel: phaseLabel(state.phase),
      currentTurnName: currentPid ? nameOf(state, currentPid) : '',
      actionsLeft: state.actionsLeft || 0,
      aliveCount: alivePlayers(state).length,
      hiddenCount: alivePlayers(state).length,
      totalSpots: state.totalSpots,
      destruction,
      winnerId: wid || '',
      winnerName: wid ? nameOf(state, wid) : '',
      players: Object.values(state.players).sort((a, b) => a.seat - b.seat).map(p => {
        const s = p.hideSpot ? spotById.get(p.hideSpot) : null
        return {
          playerId: p.playerId,
          playerName: p.playerName,
          eliminated: p.eliminated,
          hideSpotName: s ? spotLabel(s) : '未藏',
          searches: p.searches,
          finds: p.finds,
          foundByName: p.foundBy ? nameOf(state, p.foundBy) : ''
        }
      }),
      rooms: state.rooms.map(r => ({
        id: r.id,
        name: r.name,
        icon: r.icon,
        spots: r.spotIds.map(id => {
          const s = spotById.get(id)
          return {
            id,
            icon: s.icon,
            name: s.name,
            searched: s.searched,
            searchedByName: s.searched ? s.searchedByName : '',
            found: s.searched ? s.found.map(c => c.playerName) : [],
            owners: s.searched ? [] : cardsAtSpot(state, id).map(p => p.playerName)
          }
        })
      }))
    }
  },

  getReplayMeta(state) {
    const spotById = new Map(state.spots.map(s => [s.id, s]))
    const winnerId = winnerIdOf(state)
    const destruction = Math.min(100, Math.round(state.searchLog.length / Math.max(1, state.totalSpots) * 100))
    const sorted = [...Object.values(state.players)].sort((a, b) => {
      if (a.playerId === winnerId) return -1
      if (b.playerId === winnerId) return 1
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1
      if (a.eliminated && b.eliminated) return (b.foundAt || 0) - (a.foundAt || 0)
      return b.finds - a.finds
    })

    const players = sorted.map(p => {
      const s = p.hideSpot ? spotById.get(p.hideSpot) : null
      let status = '淘汰'
      if (p.playerId === winnerId) status = state.finishReason === 'mutual' ? '同归于尽获胜' : '获胜'
      else if (!p.eliminated) status = '幸存'
      return {
        playerId: p.playerId,
        playerName: p.playerName,
        score: p.finds,
        status,
        details: [
          { label: '藏牌点', value: s ? spotLabel(s) : '未藏' },
          { label: '翻找', value: `${p.searches} 次` },
          { label: '找到卡牌', value: `${p.finds} 张` },
          { label: '被谁找到', value: p.foundBy ? nameOf(state, p.foundBy) : '—' }
        ]
      }
    })

    const cardRows = sorted.map(p => {
      const s = p.hideSpot ? spotById.get(p.hideSpot) : null
      return [
        p.playerName,
        s ? spotLabel(s) : '未藏',
        p.playerId === winnerId ? (state.finishReason === 'mutual' ? '同归于尽获胜' : '获胜') : (p.eliminated ? '淘汰' : '幸存'),
        p.foundBy ? nameOf(state, p.foundBy) : '—',
        `${p.searches} 次`,
        `${p.finds} 张`
      ]
    })

    const logRows = state.searchLog.map(r => [
      state.startTime ? `+${((r.at - state.startTime) / 1000).toFixed(1)}s` : '—',
      r.playerName,
      `${r.roomName}·${r.spotName}`,
      (r.found && r.found.length) ? r.found.map(c => c.playerName).join('、') : '空的',
      r.auto ? '超时自动' : '手动'
    ])

    return {
      type: 'hide-and-go-veto',
      title: '藏否决权牌寻宝赛',
      description: '秘密藏卡 → 轮流翻找 → 卡被翻出即淘汰；最后一张没被找到的卡获胜。允许翻自己的藏点，若因此导致全员出局，翻找者获胜。',
      summary: [
        { label: '参赛人数', value: Object.keys(state.players).length },
        { label: '开放房间', value: `${state.rooms.length} 间 / ${state.totalSpots} 个藏点` },
        { label: '翻找次数', value: state.searchLog.length },
        { label: '破坏度', value: `${destruction}%` },
        { label: '结束方式', value: `${phaseLabel('finished')}${finishReasonText(state.finishReason)}` },
        { label: '获胜者', value: winnerId ? nameOf(state, winnerId) : '—' }
      ],
      players,
      tables: [
        {
          title: '最终藏牌点',
          columns: ['选手', '藏牌点', '结果', '被谁找到', '翻找次数', '找到卡牌'],
          rows: cardRows
        },
        {
          title: '翻找记录',
          columns: ['时间', '选手', '藏点', '结果', '方式'],
          rows: logRows
        }
      ]
    }
  }
})
