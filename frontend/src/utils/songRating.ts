// 公演个人评级概率计算（与后端 performance.js computeRatingFaces/rollPlayerRating 保持一致）
// 用于选手端选歌时展示「主属性区间 → S/A/B/C/D 概率」

export interface SongLike {
  difficulty?: number | null
  risk?: number | null
  baseVocal?: number | null
  baseDance?: number | null
  mainAttribute?: string | null
}

export interface Attrs {
  vocal: number
  dance: number
  charm: number
}

export type MainAttr = 'vocal' | 'dance' | 'charm'

export interface RatingFaces {
  a: number
  b: number
  c: number
  d: number
  total: number
}

export interface RatingInfo {
  mainAttr: MainAttr
  difficulty: number
  risk: number
  baseVocal: number
  baseDance: number
  mainBase: number
  excess: number
  steps: number
  deficit: number
  deficitSteps: number
  faces: RatingFaces
}

function getMainAttr(song: SongLike): MainAttr {
  return song.mainAttribute === 'dance' || song.mainAttribute === 'charm' ? song.mainAttribute : 'vocal'
}

/** 复刻后端 computeRatingFaces */
export function computeRatingFaces(attrs: Attrs, song: SongLike): RatingInfo {
  const mainAttr = getMainAttr(song)
  const d = Math.max(2, Math.round(song.difficulty || 3))
  const risk = Math.max(1, Number(song.risk) || 10)
  const baseVocal = typeof song.baseVocal === 'number' ? song.baseVocal : 30
  const baseDance = typeof song.baseDance === 'number' ? song.baseDance : 30
  const mainBase = mainAttr === 'dance' ? baseDance : (mainAttr === 'charm' ? Math.round((baseVocal + baseDance) / 2) : baseVocal)
  const excess = (attrs[mainAttr] ?? 0) - mainBase
  const steps = Math.max(0, Math.floor(excess / risk))

  const deficit = Math.max(0, baseVocal - (attrs.vocal ?? 0)) + Math.max(0, baseDance - (attrs.dance ?? 0))
  const deficitSteps = deficit > 0 ? Math.ceil(deficit / risk) : 0

  const normalA = Math.min(Math.max(steps - (d - 1), 0), Math.max(0, d - 2))
  const normalAPlusB = Math.min(steps, d - 1)
  const normalB = Math.max(0, normalAPlusB - normalA)
  const normalC = d - normalAPlusB

  // 未达标惩罚：每缺「1 倍风险值」先把最优面降为 C（直至 100% C），
  // 多余的部分再从 C 转为 D（至少保留 1 面 C）。
  let a = normalA
  let b = normalB
  let c = normalC
  let dFace = 0
  let rem = deficitSteps
  const demoteA = Math.min(a, rem); a -= demoteA; c += demoteA; rem -= demoteA
  const demoteB = Math.min(b, rem); b -= demoteB; c += demoteB; rem -= demoteB
  if (rem > 0 && c > 1) {
    const conv = Math.min(rem, c - 1)
    c -= conv
    dFace += conv
  }

  return {
    mainAttr, difficulty: d, risk, baseVocal, baseDance, mainBase,
    excess, steps, deficit, deficitSteps,
    faces: { a, b, c, d: dFace, total: d }
  }
}

export interface RatingProbs {
  S: number
  A: number
  B: number
  C: number
  D: number
}

/** 由骰面得到各评级概率（含 S 的额外判定） */
export function ratingProbs(info: RatingInfo): RatingProbs {
  const d = info.faces.total || info.difficulty
  const { a, b, c, d: dd } = info.faces
  const canS = info.deficitSteps === 0 && info.steps >= (2 * d - 3) && a >= 1
  const S = canS ? 1 / d : 0
  const A = (a - (canS ? 1 : 0)) / d
  return { S, A, B: b / d, C: c / d, D: dd / d }
}

export interface RatingRange {
  from: number
  to: number
  probs: RatingProbs
}

/**
 * 扫描主属性 0..cap，返回主属性区间 → 评级概率（相邻同分布合并）
 * 非主属性固定为传入的 attrs 值
 */
export function mainAttrRatingRanges(song: SongLike, attrs: Attrs, cap = 120): { mainAttr: MainAttr; ranges: RatingRange[] } {
  const mainAttr = getMainAttr(song)
  const ranges: RatingRange[] = []
  let cur: (RatingRange & { sig: string }) | null = null
  for (let v = 0; v <= cap; v++) {
    const testAttrs: Attrs = { ...attrs, [mainAttr]: v }
    const info = computeRatingFaces(testAttrs, song)
    const probs = ratingProbs(info)
    const sig = [probs.S, probs.A, probs.B, probs.C, probs.D].map(x => Math.round(x * 1000)).join(',')
    if (cur && cur.sig === sig) {
      cur.to = v
    } else {
      if (cur) ranges.push({ from: cur.from, to: cur.to, probs: cur.probs })
      cur = { from: v, to: v, probs, sig }
    }
  }
  if (cur) ranges.push({ from: cur.from, to: cur.to, probs: cur.probs })
  return { mainAttr, ranges }
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}
