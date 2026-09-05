<template>
  <div class="bb-season-result" :class="themeClass">
    <div class="page-header">
      <h1>🏆 季终结算</h1>
      <span class="round-tag">第{{ seasonInfo.currentRound }}周 · {{ seasonInfo.seasonStatus }}</span>
      <div class="header-actions">
        <button class="bb-btn" :class="{ active: theme === 'black' }" @click="theme = 'black'">🌙 黑色</button>
        <button class="bb-btn" :class="{ active: theme === 'white' }" @click="theme = 'white'">☀️ 白色</button>
        <button class="bb-btn" @click="exportImage" :disabled="exporting">📷 导出图片</button>
        <button class="bb-btn bb-btn-primary" @click="exportCsv" :disabled="!settlement">📤 导出表格</button>
      </div>
    </div>

    <div v-if="loading" class="loading-hint">加载中...</div>
    <div v-else-if="!settlement" class="loading-hint">暂无数据</div>

    <template v-else>
      <div class="summary-bar">
        <span>参赛人数 {{ settlement.totalPlayers }} · 已完成轮次 {{ settlement.rounds.length }}</span>
        <span class="edit-tip">✏️ 点击任意单元格可编辑（用于填补空档/修正）</span>
        <span v-if="endgameInfo && endgameInfo.fhoh" class="eg-chip">🏁 F3 FHOH：{{ endgameInfo.fhoh.name }}</span>
        <span v-if="endgameInfo && endgameInfo.finalTwo && endgameInfo.finalTwo.length" class="eg-chip gold">
          🏆 决赛二人：{{ endgameInfo.finalTwo.map(f => f.playerName || f.name).join(' · ') }}
        </span>
        <span v-if="endgameInfo && endgameInfo.champion" class="eg-chip gold">
          👑 冠军：{{ endgameInfo.champion.name }}
        </span>
        <span v-if="seasonInfo.seasonStatus === 'finished'" class="done-badge">✅ 赛季已结束</span>
      </div>

      <div class="table-wrap" ref="exportEl">
        <table class="settle-table">
          <thead>
            <tr>
              <th class="label-col">轮次/项目</th>
              <th v-for="c in rounds" :key="c.round" class="round-col" :class="colTitleClass(c)">
                {{ colTitle(c) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <!-- 轮次列块：普通轮=六小格；F3=三轮胜者+淘汰者；冠军=冠军/亚军 -->
            <tr class="block-row">
              <td class="label-col">赛况</td>
              <td v-for="c in rounds" :key="'b'+c.round" class="block-cell" :class="'block-'+colKind(c)">
                <!-- 普通轮六小格 -->
                <template v-if="colKind(c)==='normal'">
                  <div class="mini-cell cell-hoh" @click="startEdit(c.round, 'hohName')">{{ cellValue(c, 'hohName') }}</div>
                  <div class="mini-cell cell-init-nom" @click="startEdit(c.round, 'initial')">{{ cellValue(c, 'initial') }}</div>
                  <div class="mini-cell cell-pov" @click="startEdit(c.round, 'pov')">{{ cellValue(c, 'pov') }}</div>
                  <div class="mini-cell cell-final-nom" @click="startEdit(c.round, 'final')">{{ cellValue(c, 'final') }}</div>
                  <div class="mini-cell cell-ticket" @click="startEdit(c.round, 'ticket')">{{ cellValue(c, 'ticket') }}</div>
                  <div class="mini-cell cell-evicted" @click="startEdit(c.round, 'evicted')">{{ cellValue(c, 'evicted') }}</div>
                </template>
                <!-- F3 特殊列：三轮胜者 + 淘汰者 -->
                <template v-else-if="colKind(c)==='final3'">
                  <div class="mini-cell mini-f3-slot" v-for="w in f3WinnerList(c)" :key="w.round">
                    <span class="f3-tag">第{{ w.round }}场</span>
                    <span class="f3-name" @click="startEdit(c.round, 'f3w'+w.round)">{{ w.name || '-' }}</span>
                  </div>
                  <div class="mini-cell mini-f3-elim">
                    <span class="f3-tag">🚫淘汰</span>
                    <span class="f3-name" @click="startEdit(c.round, 'f3elim')">{{ (c.eliminated && c.eliminated.name) || '-' }}</span>
                  </div>
                </template>
                <!-- 冠军特殊列：冠军/亚军 上下各占一半 -->
                <template v-else-if="colKind(c)==='champion'">
                  <div class="champ-stack">
                    <div class="mini-cell mini-champ">
                      <span class="champ-icon">🏆</span>
                      <span class="champ-name" @click="startEdit(c.round, 'champion')">{{ c.champion?.name || '-' }}</span>
                    </div>
                    <div class="mini-cell mini-runner">
                      <span class="champ-icon runner">🥈</span>
                      <span class="champ-name" @click="startEdit(c.round, 'runner')">{{ c.runnerUp?.name || '-' }}</span>
                    </div>
                  </div>
                </template>
              </td>
            </tr>

            <!-- 玩家行 -->
            <tr v-for="p in orderedPlayers" :key="p.playerId" class="player-row">
              <td class="label-col player-cell">
                <div class="player-label">
                  <span class="player-avatar">{{ (p.name || '?').charAt(0) }}</span>
                  <span class="player-name">{{ p.name }}</span>
                  <span v-if="p.status === 'f2'" class="mini-tag f2">F2</span>
                  <span v-else-if="p.status === 'jury'" class="mini-tag jury">jury</span>
                  <span v-else-if="p.status === 'evicted'" class="mini-tag evt">evicted</span>
                </div>
              </td>
              <template v-for="c in rounds" :key="'v'+p.playerId+'-'+c.round">
                <!-- 普通轮 -->
                <template v-if="colKind(c)==='normal'">
                  <!-- 淘汰后第一个后续普通轮：合并大格直到冠军列前（含后续普通轮与 F3 列） -->
                  <template v-if="p.evictedRound && c.round === p.evictedRound + 1">
                    <td :colspan="evictSpanNormal(p, c)" class="cell-evicted-round">{{ evictedText(p) }}</td>
                  </template>
                  <template v-else-if="!p.evictedRound || c.round <= p.evictedRound">
                    <td class="vote-cell editable-cell" :class="voteClass(p, c)" @click="startPlayerEdit(p.playerId, c.round)">
                      {{ playerCellValue(p, c) }}
                    </td>
                  </template>
                </template>
                <!-- F3 列 -->
                <template v-else-if="colKind(c)==='final3'">
                  <!-- 若玩家被淘汰且无后续普通轮可用（在最后一普通轮被淘汰），在此列输出合并格 -->
                  <template v-if="!isInF3(p.playerId) && p.evictedRound && !hasNormalAfterEvict(p)">
                    <td class="cell-evicted-round">{{ evictedText(p) }}</td>
                  </template>
                  <template v-else-if="isInF3(p.playerId)">
                    <td class="vote-cell" :class="voteClass(p, c)">{{ playerCellValue(p, c) }}</td>
                  </template>
                  <template v-else>
                    <!-- 已被普通轮大格 colspan 覆盖，不输出 -->
                  </template>
                </template>
                <!-- 冠军列：jury 显示所投，其他人显示身份 -->
                <template v-else-if="colKind(c)==='champion'">
                  <td class="vote-cell" :class="champCellClass(p, c)">{{ champCellValue(p, c) }}</td>
                </template>
              </template>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 单元格编辑输入框（浮动） -->
      <div v-if="editing" class="cell-editor" :style="{ left: editing.x + 'px', top: editing.y + 'px' }">
        <input ref="editorInput" v-model="editing.value" class="cell-editor-input" @blur="commitEdit" @keydown.enter="commitEdit" @keydown.esc="cancelEdit" />
        <div class="cell-editor-actions">
          <button class="bb-btn bb-btn-sm" @click="commitEdit">✓</button>
          <button class="bb-btn bb-btn-sm" @click="cancelEdit">✕</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted } from 'vue'
import html2canvas from 'html2canvas'
import { bbGetSeasonSettlement } from '../../../services/bbApi'
import type { BBSettlement, BBSettlementRound } from '../../../types/bigbrother'

const settlement = ref<BBSettlement | null>(null)
const loading = ref(false)
const theme = ref<'black' | 'white'>('black')
const themeClass = computed(() => `theme-${theme.value}`)
const exporting = ref(false)

// 用户手动编辑的覆盖值：key = "r{round}:{field}" 或 "p{playerId}:{round}"
const edits = reactive<Record<string, string>>({})

const rounds = computed(() => settlement.value?.rounds || [])
const seasonInfo = computed(() => ({
  currentRound: settlement.value?.currentRound || 0,
  seasonStatus: settlement.value?.seasonStatus || ''
}))
const endgameInfo = computed(() => settlement.value?.endgame || null)

// 可编辑字段原始文本提取
function rawHoh(r: BBSettlementRound) { return r.hohName || '-' }
function rawInit(r: BBSettlementRound) { return r.initialNomineeNames.join('、') || '-' }
function rawPov(r: BBSettlementRound) { return r.povName || '-' }
function rawFinal(r: BBSettlementRound) { return r.finalNomineeNames.join('、') || '-' }
function rawTicket(r: BBSettlementRound) { return r.ticketText || '-' }
function rawEvicted(r: BBSettlementRound) { return r.evicted.map(e => e.name).join('、') || '-' }

function cellValue(r: BBSettlementRound, field: string): string {
  const k = `r${r.round}:${field}`
  if (edits[k] !== undefined) return edits[k]
  if (field === 'hohName') return rawHoh(r)
  if (field === 'initial') return rawInit(r)
  if (field === 'pov') return rawPov(r)
  if (field === 'final') return rawFinal(r)
  if (field === 'ticket') return rawTicket(r)
  if (field === 'evicted') return rawEvicted(r)
  if (field.startsWith('f3w')) {
    const w = r.f3RoundWinners?.[Number(field.slice(2)) - 1]
    return w?.name || '-'
  }
  if (field === 'f3elim') return r.eliminated?.name || '-'
  if (field === 'champion') return r.champion?.name || '-'
  if (field === 'runner') return r.runnerUp?.name || '-'
  return ''
}

// ===== 终局列辅助 =====
function colKind(c: BBSettlementRound): 'normal' | 'final3' | 'champion' {
  return c.kind || 'normal'
}
function colTitle(c: BBSettlementRound): string {
  if (colKind(c) === 'final3') return `第${c.round}周 F3`
  if (colKind(c) === 'champion') return `第${c.round}周 冠军`
  return `第${c.round}周`
}
function colTitleClass(c: BBSettlementRound): string {
  return colKind(c) === 'normal' ? '' : colKind(c)
}
function f3WinnerList(c: BBSettlementRound): { round: number; playerId: string | null; name: string }[] {
  return c.f3RoundWinners || []
}
function isInF3(playerId: string): boolean {
  const f3 = settlement.value?.rounds.find(c => colKind(c) === 'final3')
  if (!f3) return false
  const names = new Set<string>()
  if (f3.fhohId) names.add(f3.fhohId)
  ;(f3.finalTwo || []).forEach(f => names.add(f.playerId))
  if (f3.eliminated?.id) names.add(f3.eliminated.id)
  return names.has(playerId)
}
function isFinalist(playerId: string): boolean {
  const champ = settlement.value?.rounds.find(c => colKind(c) === 'champion')
  if (!champ) return false
  const names = new Set<string>()
  if (champ.champion?.playerId) names.add(champ.champion.playerId)
  if (champ.runnerUp?.playerId) names.add(champ.runnerUp.playerId)
  return names.has(playerId)
}
// 淘汰后是否还有后续普通轮（决定合并格起点在普通轮还是 F3 列）
function hasNormalAfterEvict(p: any): boolean {
  return rounds.value.some(x => colKind(x) === 'normal' && x.round > (p.evictedRound || 0))
}
// 淘汰后合并列跨度：覆盖后续普通轮 + F3 列（若玩家已被淘汰且不在 F3），到冠军列前为止
function evictSpanNormal(p: any, c: BBSettlementRound): number {
  const afterNormal = rounds.value.filter(x => colKind(x) === 'normal' && x.round > (p.evictedRound || 0)).length
  const hasF3After = rounds.value.some(x => colKind(x) === 'final3' && x.round > (p.evictedRound || 0) && !isInF3(p.playerId))
  return Math.max(afterNormal + (hasF3After ? 1 : 0), 1)
}
// 淘汰合并格文案：jury → "Jury X"（X=进入陪审的顺序），否则 Evicted
function evictedText(p: any): string {
  if (p.status === 'jury') {
    const order = juryOrder(p.playerId)
    return order > 0 ? `Jury ${order}` : 'Jury'
  }
  return 'Evicted'
}
// 进入陪审顺序：所有 jury 按被淘汰轮次先后排序，最早进陪审者=1
const juryOrderMap = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  const jurors = (settlement.value?.players || [])
    .filter(x => x.status === 'jury')
    .sort((a, b) => (a.evictedRound || 0) - (b.evictedRound || 0))
  jurors.forEach((x, i) => { map[x.playerId] = i + 1 })
  return map
})
function juryOrder(playerId: string): number {
  return juryOrderMap.value[playerId] || 0
}
// 冠军列显示：jury→所投；冠军/亚军→身份
function champCellValue(p: any, c: BBSettlementRound): string {
  const k = `p${p.playerId}:c${c.round}`
  if (edits[k] !== undefined) return edits[k]
  if (c.champion?.playerId === p.playerId) return '👑 冠军'
  if (c.runnerUp?.playerId === p.playerId) return '🥈 亚军'
  const jv = (c.juryVotes || []).find(j => j.juryId === p.playerId)
  if (jv && jv.voted) return `投→ ${jv.targetName || '-'}`
  if (p.status === 'jury') return '未投'
  return '-'
}
function champCellClass(p: any, c: BBSettlementRound): string {
  if (c.champion?.playerId === p.playerId) return 'cell-champion'
  if (c.runnerUp?.playerId === p.playerId) return 'cell-runner'
  const jv = (c.juryVotes || []).find(j => j.juryId === p.playerId)
  if (jv && jv.voted) return 'cell-voted'
  if (p.status === 'jury') return ''
  return 'faint-cell'
}

const orderedPlayers = computed(() => {
  const list = [...(settlement.value?.players || [])]
  return list.sort((a, b) => {
    if (a.rank === 0 && b.rank !== 0) return -1
    if (b.rank === 0 && a.rank !== 0) return 1
    return a.rank - b.rank
  })
})

function isHoh(playerId: string, r: BBSettlementRound) { return r.hohId === playerId }
// 仅在「最终提名」中标注 NOM；若玩家只是初始提名（如被 POV 救走）则显示其投票
function isNom(playerId: string, r: BBSettlementRound) {
  return (r.finalNomineeIds || []).includes(playerId)
}
function playerCellValue(p: any, r: BBSettlementRound): string {
  const k = `p${p.playerId}:${r.round}`
  if (edits[k] !== undefined) return edits[k]
  // F3 列：FHOH → HOH；其余在 F3 的两位（被带进 FTC / 被淘汰成为最后陪审）→ NOM
  if (colKind(r) === 'final3') {
    if (r.fhohId === p.playerId) return 'HOH'
    return 'NOM'
  }
  if (isHoh(p.playerId, r)) {
    // HOH 平票裁决：该格显示 HOH 投的人名（仍算 HOH 格）；无裁决才显示 HOH
    return r.hohDecided && r.hohVoteTargetName ? r.hohVoteTargetName : 'HOH'
  }
  if (isNom(p.playerId, r)) return 'NOM'
  const vote = (r.votesDetail || []).find(v => v.voterId === p.playerId)
  return vote ? vote.targetName : (p.evictedRound === r.round ? '（淘汰）' : '')
}
function voteClass(p: any, r: BBSettlementRound): string {
  if (colKind(r) === 'final3') {
    if (r.fhohId === p.playerId) return 'cell-is-hoh'
    return 'cell-is-nom'
  }
  if (isHoh(p.playerId, r)) return 'cell-is-hoh'
  if (isNom(p.playerId, r)) return 'cell-is-nom'
  const vote = (r.votesDetail || []).find(v => v.voterId === p.playerId)
  if (vote) return 'cell-voted'
  return ''
}

// ===== 单元格编辑 =====
const editing = ref<{ key: string; value: string; x: number; y: number } | null>(null)
const editorInput = ref<HTMLInputElement | null>(null)
function startEdit(round: number, field: string, evt?: MouseEvent) {
  const pos = evt ? { x: evt.clientX + 8, y: evt.clientY + 8 } : { x: 100, y: 100 }
  const r = rounds.value.find(x => x.round === round)!
  const key = `r${round}:${field}`
  editing.value = { key, value: (edits[key] !== undefined ? edits[key] : cellValue(r, field)) === '-' ? '' : (edits[key] !== undefined ? edits[key] : cellValue(r, field)), x: pos.x, y: pos.y }
  nextTick(() => editorInput.value?.focus())
}
function startPlayerEdit(playerId: string, round: number, evt?: MouseEvent) {
  const p = orderedPlayers.value.find(x => x.playerId === playerId)
  const r = rounds.value.find(x => x.round === round)!
  const pos = evt ? { x: evt.clientX + 8, y: evt.clientY + 8 } : { x: 100, y: 100 }
  const key = `p${playerId}:${round}`
  editing.value = { key, value: edits[key] !== undefined ? edits[key] : playerCellValue(p, r), x: pos.x, y: pos.y }
  nextTick(() => editorInput.value?.focus())
}
function commitEdit() {
  if (!editing.value) return
  edits[editing.value.key] = editing.value.value.trim()
  editing.value = null
}
function cancelEdit() { editing.value = null }

// ===== 导出图片 =====
async function exportImage() {
  const wrapEl = document.querySelector('.table-wrap') as HTMLElement
  if (!wrapEl) return
  exporting.value = true
  try {
    // 导出前隐藏浮动编辑器
    const wasEditing = editing.value
    editing.value = null
    await nextTick()

    // 整表真实尺寸（横向可滚动内容不被裁掉）
    const tableEl = wrapEl.querySelector('.settle-table') as HTMLElement
    const width = tableEl?.scrollWidth || wrapEl.scrollWidth
    const height = tableEl?.scrollHeight || wrapEl.scrollHeight

    // 克隆节点时解除滚动容器约束，确保导出全部列
    const canvas = await html2canvas(wrapEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: theme.value === 'white' ? '#ffffff' : '#0f0f2e',
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
      logging: false,
      allowTaint: false,
      onclone: (doc) => {
        const c = doc.querySelector('.table-wrap') as HTMLElement
        if (c) {
          c.style.overflow = 'visible'
          c.style.width = `${width}px`
          c.style.height = 'auto'
        }
      }
    })
    canvas.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.download = `季终结算_${new Date().toISOString().slice(0, 10)}.png`
      a.href = URL.createObjectURL(blob)
      a.click()
      URL.revokeObjectURL(a.href)
      exporting.value = false
    })
    editing.value = wasEditing
  } catch (e) {
    console.error('导出图片失败', e)
    exporting.value = false
  }
}

// ===== 导出 CSV =====
function exportCsv() {
  if (!settlement.value) return
  const rs = rounds.value
  const header = ['轮次/项目', ...rs.map(colTitle)]
  const lines: string[][] = []
  lines.push(header)
  // 普通轮信息（终局列自动留空），再单独输出终局字段
  lines.push(['HOH', ...rs.map(r => colKind(r) === 'normal' ? cellValue(r, 'hohName') : '')])
  lines.push(['初始提名', ...rs.map(r => colKind(r) === 'normal' ? cellValue(r, 'initial') : '')])
  lines.push(['POV', ...rs.map(r => colKind(r) === 'normal' ? cellValue(r, 'pov') : '')])
  lines.push(['最终提名', ...rs.map(r => colKind(r) === 'normal' ? cellValue(r, 'final') : '')])
  lines.push(['票型', ...rs.map(r => colKind(r) === 'normal' ? cellValue(r, 'ticket') : '')])
  lines.push(['淘汰者', ...rs.map(r => colKind(r) === 'normal' ? cellValue(r, 'evicted') : (r.eliminated?.name || ''))])
  lines.push(['F3 第1场', ...rs.map(r => (r.f3RoundWinners && r.f3RoundWinners[0]?.name) || '')])
  lines.push(['F3 第2场', ...rs.map(r => (r.f3RoundWinners && r.f3RoundWinners[1]?.name) || '')])
  lines.push(['F3 第3场(FHOH)', ...rs.map(r => (r.f3RoundWinners && r.f3RoundWinners[2]?.name) || '')])
  lines.push(['冠军', ...rs.map(r => colKind(r) === 'champion' ? (r.champion?.name || '') : '')])
  lines.push(['亚军', ...rs.map(r => colKind(r) === 'champion' ? (r.runnerUp?.name || '') : '')])
  lines.push([])
  orderedPlayers.value.forEach(p => {
    const row = [p.name]
    let wroteEvict = false
    rs.forEach(r => {
      if (colKind(r) === 'champion') {
        row.push(champCellValue(p, r))
      } else if (colKind(r) === 'final3') {
        if (isInF3(p.playerId)) row.push(playerCellValue(p, r))
        else if (p.evictedRound && !hasNormalAfterEvict(p) && !wroteEvict) { row.push(evictedText(p)); wroteEvict = true }
        else row.push('')
      } else {
        if (p.evictedRound && r.round > p.evictedRound) {
          if (!wroteEvict) { row.push(evictedText(p)); wroteEvict = true } else row.push('')
        } else row.push(playerCellValue(p, r))
      }
    })
    lines.push(row)
  })
  const csv = lines.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `季终结算_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function fetchData() {
  loading.value = true
  try {
    settlement.value = await bbGetSeasonSettlement()
  } catch { settlement.value = null }
  loading.value = false
}

onMounted(fetchData)
</script>

<style scoped>
/* 主题色变量 */
.bb-season-result.theme-black {
  --bg: #0f0f2e;
  --bg2: #0a0a20;
  --text: #ccc;
  --text-strong: #e0e0e0;
  --border: #00ff8815;
  --head-bg: #0a0a20;
  --hover: rgba(255, 255, 255, 0.03);
}
.bb-season-result.theme-white {
  --bg: #ffffff;
  --bg2: #f5f6fa;
  --text: #555;
  --text-strong: #222;
  --border: #d5dbe6;
  --head-bg: #eef1f7;
  --hover: rgba(0, 0, 0, 0.03);
}
.bb-season-result { --bg:#0f0f2e; --bg2:#0a0a20; --text:#ccc; --text-strong:#e0e0e0; --border:#00ff8815; --head-bg:#0a0a20; --hover:rgba(255,255,255,.03); max-width: 1400px; margin: 0 auto; padding: 16px; background: transparent; color: var(--text-strong); }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.page-header h1 { font-size: 22px; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.header-actions { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }
.bb-btn { background: transparent; border: 1px solid currentColor; color: var(--text); padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.bb-btn:hover:not(:disabled) { opacity: .85; }
.bb-btn:disabled { opacity: .4; cursor: not-allowed; }
.bb-btn.active { background: #00ff8822; color: #00ff88; }
.bb-btn-primary { color: #00ff88; border-color: #00ff88; background: #00ff8811; }
.loading-hint { text-align: center; color: var(--text); padding: 60px; font-size: 14px; }
.summary-bar { display: flex; gap: 16px; align-items: center; color: var(--text); font-size: 13px; margin-bottom: 12px; flex-wrap: wrap; }
.edit-tip { color: #4488ff; font-size: 12px; }
.done-badge { color: #00ff88; }
.eg-chip { font-size: 12px; color: #888; padding: 2px 10px; background: #4488ff11; border: 1px solid #4488ff44; border-radius: 10px; }
.eg-chip.gold { color: #ffaa00; border-color: #ffaa0055; background: #ffaa0011; }

.table-wrap { overflow-x: auto; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; }
.settle-table { border-collapse: collapse; width: 100%; min-width: 720px; }
.settle-table th, .settle-table td { border: 1px solid var(--border); padding: 6px 10px; font-size: 12px; text-align: center; white-space: nowrap; }
.settle-table th { color: var(--text); }
.label-col { background: var(--head-bg); text-align: left !important; min-width: 120px; position: sticky; left: 0; color: var(--text); font-weight: 500; }
.round-col { font-weight: 600; }
.cell-hoh { background: #00ff8818; color: #00ff88; font-weight: 600; }
.cell-init-nom { background: #ffaa0015; color: #ffaa00; }
.cell-pov { background: #4488ff18; color: #4488ff; }
.cell-final-nom { background: #ff660015; color: #ff6633; }
.cell-ticket { color: var(--text); }
.cell-evicted { background: #88888818; color: var(--text); }

.editable-cell { cursor: text; }
.editable-cell:hover { outline: 1px dashed #4488ff88; outline-offset: -1px; }

.player-row:hover td { background: var(--hover); }
.player-cell { text-align: left; }
.player-label { display: flex; align-items: center; gap: 6px; }
.player-avatar { width: 20px; height: 20px; border-radius: 50%; background: #00ff8822; color: #00ff88; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }
.player-name { font-weight: 500; }
.mini-tag { font-size: 9px; padding: 1px 5px; border-radius: 6px; }
.mini-tag.f2 { background: #ffaa0022; color: #ffaa00; border: 1px solid #ffaa0055; }
.mini-tag.jury { background: #9b59b622; color: #9b59b6; border: 1px solid #9b59b644; }
.mini-tag.evt { background: #88888822; border: 1px solid #88888844; }
.vote-cell { color: var(--text); }
.cell-is-hoh { background: #00ff8833; font-weight: 700; }
.cell-is-nom { background: #ff880033; font-weight: 700; }
.cell-voted { opacity: .9; }
.cell-evicted-round { background: #ff444418; color: #ff5555; font-weight: 600; }
.cell-champion { background: #ffaa0033; font-weight: 800; color: #ffaa00; }
.cell-runner { background: #4488ff22; font-weight: 700; color: #4488ff; }

/* ===== 逐轮列块布局 ===== */
.block-cell { vertical-align: top; padding: 0 !important; min-width: 110px; position: relative; }
.block-cell.block-final3 { background: #4488ff08; }
.block-cell.block-champion { background: #ffaa000a; }
/* 冠军列：绝对定位铺满该 td，冠军/亚军两半各占 50%；
   不设固定高度 → 单元格高度由普通轮列自然撑起，前面部分不产生多余空行 */
.champ-stack { position: absolute; inset: 0; display: flex; flex-direction: column; }
.champ-stack .mini-cell { flex: 1; display: flex; align-items: center; justify-content: center; border-bottom: none; overflow: hidden; }
.mini-cell { padding: 6px 8px; font-size: 12px; border-bottom: 1px solid var(--border); text-align: center; white-space: nowrap; min-height: 22px; }
.mini-cell:last-child { border-bottom: none; }
.mini-cell.cell-hoh { background: #00ff8818; color: #00ff88; font-weight: 700; }
.mini-cell.cell-init-nom { background: #ffaa0015; color: #ffaa00; }
.mini-cell.cell-pov { background: #4488ff18; color: #4488ff; }
.mini-cell.cell-final-nom { background: #ff660015; color: #ff6633; }
.mini-cell.cell-ticket { color: var(--text); font-weight: 600; }
.mini-cell.cell-evicted { background: #88888818; color: var(--text); }
.mini-cell.mini-f3w { background: #4488ff22; color: #4488ff; font-weight: 700; font-size: 11px; }
.mini-cell.mini-f3-slot { background: #ffffff05; color: #ffaa00; font-weight: 600; }
.mini-cell.mini-f3-elim { background: #ff444418; color: #ff5555; font-weight: 600; }
.mini-cell.mini-champ { background: #ffaa0022; color: #ffaa00; font-weight: 800; font-size: 14px; }
.mini-cell.mini-runner { background: #4488ff18; color: #4488ff; font-weight: 700; }
.champ-icon { margin-right: 4px; }
.champ-icon.runner { font-size: 11px; }
.f3-tag { display: block; font-size: 10px; color: var(--text); opacity: .7; }
.f3-name { font-size: 12px; }
.faint-cell { color: var(--text); opacity: .4; }

/* 浮动编辑器 */
.cell-editor { position: fixed; z-index: 999; display: flex; flex-direction: column; gap: 4px; background: var(--bg); border: 1px solid #00ff88; border-radius: 6px; padding: 4px; box-shadow: 0 4px 16px rgba(0,0,0,.4); }
.cell-editor-input { background: var(--bg2); border: 1px solid var(--border); color: var(--text-strong); padding: 6px 8px; border-radius: 4px; font-size: 13px; min-width: 160px; outline: none; }
.cell-editor-actions { display: flex; gap: 4px; }
.bb-btn-sm { padding: 2px 8px; font-size: 12px; }
</style>
