/**
 * 管理员端「完整局面」构造器（含隐藏信息，仅发给 admin，不泄露给选手）
 * 统一形状：{ type, summary: {...}, players: { [playerId]: {...} } }
 * 已自带 getReplaySnapshot 的游戏（abraca / stay-or-fold）优先；自定义游戏走 getReplayMeta。
 */
function pct(a, b) { return b ? Math.round((a / b) * 100) : 0 }

function buildAdminView(minigameId, state) {
  if (!state) return null
  try {
    // 自定义游戏（含模式 1-5）
    if (typeof minigameId === 'string' && minigameId.startsWith('custom-')) {
      const src = state.playerStates || {}
      const pids = Object.keys(src)
      const first = pids.length ? src[pids[0]] : null
      const summary = {}
      if (first && Array.isArray(first.questions)) {
        summary['题目（含正确答案）'] = first.questions.map(q => `${q.text}（${q.correctAnswer ?? '—'}）`)
      }
      if (state.phase) summary['阶段'] = state.phase
      if (state.round != null) summary['轮次'] = state.round
      const players = {}
      for (const pid of pids) {
        const ps = src[pid]
        const row = {}
        if (ps.score != null) row['分数'] = ps.score
        if (ps.correctCount != null) row['答对'] = ps.correctCount
        if (ps.alive != null) row['存活'] = !!ps.alive
        if (ps.eliminated != null) row['出局'] = !!ps.eliminated
        if (Array.isArray(ps.questions) && ps.answers) {
          row['作答'] = ps.questions.map(q => {
            const a = ps.answers[q.id]
            return `${q.text}：${a ? a.userAnswer : '未答'}${a && a.correct === true ? '✓' : (a && a.correct === false ? '✗' : '')}`
          })
        }
        players[pid] = row
      }
      return { type: 'custom', summary, players }
    }
    switch (minigameId) {
      case 'click-speed': {
        const players = {}
        for (const [pid, n] of Object.entries(state.scores || {})) players[pid] = { 点击次数: n }
        return { type: 'click-speed', summary: {}, players }
      }
      case 'memory-match': {
        const players = {}
        for (const [pid, ps] of Object.entries(state.playerStates || {})) {
          players[pid] = { 配对数: (ps.matched || []).length / 2, 步数: ps.moves || 0 }
        }
        return { type: 'memory-match', summary: {}, players }
      }
      case 'quick-math': {
        const pids = Object.keys(state.playerStates || {})
        const src = pids.length ? state.playerStates[pids[0]] : null
        const summary = { 题目: (src?.questions || []).map(q => `${q.expression}=${q.answer}`) }
        const players = {}
        for (const pid of pids) {
          const ps = state.playerStates[pid]
          const answers = (ps.answers || []).map(a => `${a.question}=${a.userAnswer}${a.correct ? '✓' : '✗'}`)
          players[pid] = {
            已作答: answers.length, 答对: ps.currentIndex || 0,
            用时秒: (ps.finishTime && ps.startTime) ? Number(((ps.finishTime - ps.startTime) / 1000).toFixed(1)) : null,
            作答记录: answers
          }
        }
        return { type: 'quick-math', summary, players }
      }
      case 'balance-bar': {
        const players = {}
        for (const [pid, ps] of Object.entries(state.playerStates || {})) {
          players[pid] = { 在区时长秒: Number(((ps.timeInZone || 0) / 1000).toFixed(1)), 位置: Math.round((ps.position || 0) * 100) }
        }
        return { type: 'balance-bar', summary: {}, players }
      }
      case 'dice-duel': {
        const players = {}
        for (const [pid, ps] of Object.entries(state.playerStates || {})) {
          players[pid] = { 总分: ps.totalScore || 0, 轮次: ps.currentRound || 0 }
        }
        return { type: 'dice-duel', summary: {}, players }
      }
      case 'power-challenge': {
        const summary = {
          主题: state.theme || '',
          题目: (state.questions || []).map(q => `${q.text}（答案：${q.correctAnswer}）`),
          已占领: Object.entries(state.questionWinners || {}).map(([qid, w]) => `${qid}→${w.playerName}`)
        }
        const players = {}
        for (const [pid, ps] of Object.entries(state.playerStates || {})) players[pid] = { 已占领: ps.score || 0 }
        return { type: 'power-challenge', summary, players }
      }
      case 'klotski': {
        const players = {}
        for (const [pid, ps] of Object.entries(state.playerStates || {})) {
          players[pid] = { 步数: ps.moves || 0, 已完成: !!ps.solved }
        }
        return { type: 'klotski', summary: {}, players }
      }
      case 'swing-pointer': {
        const players = {}
        for (const [pid, ps] of Object.entries(state.playerStates || {})) {
          players[pid] = { 得分: ps.score || 0, 已检查: (ps.checks || []).length }
        }
        return { type: 'swing-pointer', summary: {}, players }
      }
      case 'minority': {
        const players = {}
        for (const [pid, ps] of Object.entries(state.playerStates || {})) {
          players[pid] = { 存活: !!ps.alive, 出局轮: ps.alive ? null : (ps.eliminatedRound + 1) }
        }
        return { type: 'minority', summary: { 轮次: (state.round || 0) + 1 }, players }
      }
      case 'spot-difference': {
        const players = {}
        for (const [pid, ps] of Object.entries(state.playerStates || {})) {
          players[pid] = { 已标记: (ps.marks || []).length, 已完成: !!ps.done }
        }
        return { type: 'spot-difference', summary: { 不同处数量: (state.diffs || []).length }, players }
      }
      case 'reaction': {
        const players = {}
        for (const [pid, ps] of Object.entries(state.playerStates || {})) {
          const times = (ps.results || []).map(r => r == null ? null : r)
          players[pid] = { 已完成: times.filter(t => t != null).length, 各次ms: times }
        }
        return { type: 'reaction', summary: {}, players }
      }
      case 'sequence-memory': {
        const players = {}
        for (const [pid, ps] of Object.entries(state.playerStates || {})) {
          players[pid] = { 存活: !!ps.alive, 出局轮: ps.alive ? null : (ps.eliminatedRound + 1) }
        }
        return { type: 'sequence-memory', summary: { 轮次: (state.round || 0) + 1 }, players }
      }
      case 'jigsaw': {
        const players = {}
        for (const [pid, ps] of Object.entries(state.playerStates || {})) {
          const placed = (ps.order || []).filter((v, i) => v === i).length
          players[pid] = { 正确片数: placed, 已完成: !!ps.done }
        }
        return { type: 'jigsaw', summary: { imageUrl: state.imageUrl || '' }, players }
      }
      case 'missing-number': {
        const players = {}
        for (const [pid, ps] of Object.entries(state.playerStates || {})) {
          players[pid] = { 提交: ps.value, 尝试次数: ps.attempts || 0, 答对: !!ps.correct }
        }
        return { type: 'missing-number', summary: { 缺失数字: state.missing }, players }
      }
      case 'describe-guess': {
        const players = {}
        for (const pid of Object.keys(state.scores || {})) {
          const recs = state.records?.[pid] || {}
          const list = Object.entries(recs).map(([qi, r]) => `第${Number(qi) + 1}题：${r.value}${r.correct ? '✓' : '✗'}(+${r.gain})`)
          players[pid] = { 得分: state.scores[pid] || 0, 作答记录: list }
        }
        const summary = {
          进度: `${(state.currentIndex || 0) + 1}/${state.N || 0}`,
          已放出描述: state.revealedClues || 0,
          题目: (state.questions || []).map((q, i) => `第${i + 1}题答案：${q.answer}`)
        }
        return { type: 'describe-guess', summary, players }
      }
      case 'custom-mode': {
        const players = {}
        for (const [pid, ps] of Object.entries(state.playerStates || {})) {
          players[pid] = {
            分数: ps.score || 0,
            答对: ps.correctCount || 0,
            存活: ps.alive !== false,
            出局: ps.eliminated === true
          }
        }
        return { type: 'custom-mode', summary: { 阶段: state.phase || '', 轮次: state.round || 0 }, players }
      }
      default: {
        // 兜底：至少给出玩家进度标签
        const players = {}
        const src = state.playerStates || state.scores || {}
        for (const pid of Object.keys(src)) players[pid] = {}
        return { type: minigameId, summary: {}, players }
      }
    }
  } catch (e) {
    return null
  }
}

module.exports = { buildAdminView, pct }
