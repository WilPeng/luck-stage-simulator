<template>
  <div class="mg-replay">
    <div class="page-header">
      <h1>小游戏复盘</h1>
      <div class="filters">
        <select v-model="filterGameType" class="bb-input" @change="loadList">
          <option value="">全部场景</option>
          <option value="hoh">HOH</option>
          <option value="veto">否决权</option>
          <option value="bbbb">BBBB</option>
          <option value="finale">终局</option>
        </select>
        <button class="bb-btn" @click="loadList">🔄 刷新</button>
        <button v-if="!readonly && selectedIds.length" class="bb-btn bb-btn-danger" @click="batchDelete">🗑 批量删除（{{ selectedIds.length }}）</button>
      </div>
    </div>

    <div class="replay-layout" :class="{ opened: detail }">
      <div class="list-panel">
        <div class="list-tools" v-if="list.length && !readonly">
          <label class="sel-all"><input type="checkbox" :checked="allSelected" @change="toggleAll" /> 全选</label>
        </div>
        <div v-if="!list.length" class="empty-hint">暂无复盘记录</div>
        <div
          v-for="r in list"
          :key="r.id"
          class="replay-item"
          :class="{ active: detail && detail.id === r.id }"
          tabindex="0" @keydown.enter.self="openReplay(r.id)" @keydown.space.self.prevent="openReplay(r.id)"
          @click="openReplay(r.id)"
        >
          <label v-if="!readonly" class="item-check" @click.stop>
            <input type="checkbox" :value="r.id" v-model="selectedIds" />
          </label>
          <div class="item-main">
            <div class="ri-top">
              <span class="ri-name">{{ r.minigameName || r.minigameId }}</span>
              <span class="ri-type">{{ gameTypeLabel(r.gameType) }}</span>
            </div>
            <div class="ri-meta">
              {{ fmtDate(r.startedAt) }} · {{ r.participants?.length || 0 }}人 · {{ r.eventCount }} 事件
            </div>
            <div class="ri-winner" v-if="r.winner">🏆 {{ r.winner.playerName }}</div>
            <div class="ri-winner none" v-else-if="r.status !== 'playing'">无胜者</div>
          </div>
        </div>
      </div>

      <div class="detail-panel">
        <div v-if="!detail" class="empty-hint">选择左侧对局查看复盘</div>
        <template v-else>
          <button class="bb-btn back-list" @click="detail = null">‹ 返回对局列表</button>
          <div class="detail-head">
            <div>
              <div class="dh-title">{{ detail.minigameName || detail.minigameId }}</div>
              <div class="dh-sub">
                {{ gameTypeLabel(detail.gameType) }} · {{ fmtDate(detail.startedAt) }}
                <span v-if="detail.roundIndex"> · 第{{ detail.roundIndex }}周</span>
                <span v-if="detail.targetScore"> · 目标 {{ detail.targetScore }}</span>
                <span> · 共 {{ (detail.events || []).length }} 条操作 · 时长 {{ durationText }}</span>
              </div>
            </div>
            <button v-if="!readonly" class="bb-btn bb-btn-danger" @click="removeReplay(detail.id)">删除</button>
          </div>

          <nav class="scene-tabs" aria-label="复盘内容">
            <button v-for="t in tabs" :key="t.id" :aria-pressed="section === t.id" @click="section = t.id">{{ t.name }}</button>
          </nav>
          <template v-if="section === 'result'">
          <!-- 比赛说明 -->
          <div class="dg-block">
            <div class="dg-title">比赛说明</div>
            <div class="game-rule">{{ gameRuleText }}</div>
          </div>

          </template>
          <ContestStandings v-if="section !== 'events'" :key="detail.id" :players="detail.participants || []"
            :states="replayStates" :scores="detail.scores" :game-id="detail.minigameId" :mode="meta?.mode"
            :target="detail.targetScore ?? 0" :winners="winnerIds" :selected="focusedPlayer"
            final :inspectable="!readonly" @inspect="inspectReplayPlayer" />
          <template v-if="section === 'scene'">
            <SkillContestReplay v-if="skillScene" :key="detail.id" :meta="meta" />
            <RoundContestReplay v-if="roundScene" :key="detail.id" :meta="meta" :participants="detail.participants || []" />
            <p v-if="!meta && (!snapshots.length || !boardGame)" class="empty-hint">此记录没有保存比赛盘面，可在「操作记录」查看已保存的动作。</p>
          <!-- 拼图最终盘面 -->
          <div v-if="isJigsawMeta && !snapshots.length" class="dg-block">
            <div class="dg-title">拼图最终盘面</div>
            <JigsawSpectator :board="meta.board" />
          </div>

          </template>
          <!-- 明牌回放：逐步查看每位选手面临决策时的完整局面 -->
          <div v-if="snapshots.length && ((section === 'scene' && boardGame) || (section === 'events' && !boardGame))" class="dg-block">
            <div class="dg-title">明牌回放（{{ snapIndex + 1 }} / {{ snapshots.length }}）</div>
            <div class="snap-controls">
              <button class="bb-btn" :disabled="snapIndex <= 0" @click="snapIndex--">◀ 上一手</button>
              <input aria-label="选择比赛节点" class="snap-range" type="range" :min="0" :max="snapshots.length - 1" v-model.number="snapIndex" />
              <button class="bb-btn" :disabled="snapIndex >= snapshots.length - 1" @click="snapIndex++">下一手 ▶</button>
            </div>
            <label v-if="isAbracaSnap || isJigsawSnap">视角
              <select v-model="viewpoint" class="bb-input"><option value="">赛后全局</option><option v-for="p in detail.participants" :key="p.playerId" :value="p.playerId">{{ p.playerName }}</option></select>
            </label>
            <div class="snap-label">
              {{ curSnap?.label }} · +{{ delta(curSnap?.t) }}s
              <span v-if="curSnap?.data?.round"> · 第{{ curSnap.data.round }}轮</span>
            </div>

            <!-- 毒酒：明牌转盘盘面 -->
            <PoisonDrinkSpectator replay v-if="isPoisonSnap" :board="curSnap?.data?.board" />

            <!-- 拼图：明牌盘面 -->
            <JigsawSpectator v-else-if="isJigsawSnap" :board="viewpoint ? { ...curSnap.data.board, players: curSnap.data.board.players.filter((p:any)=>p.playerId === viewpoint) } : curSnap.data.board" />

            <!-- 出包魔法师：明牌（按快照结构自动识别，无需依赖 meta） -->
            <div v-else-if="isAbracaSnap" class="ab-board">
              <div v-for="p in (curSnap?.data?.players || [])" :key="p.playerId" class="ab-p"
                :class="{ turn: p.isTurn, dead: !p.alive }">
                <div class="ab-p-head">
                  <BBAvatar :name="p.name" size="sm" />
                  <b>{{ p.name }}</b>
                  <span class="ab-seat">#{{ (p.seat ?? 0) + 1 }}</span>
                  <span v-if="p.isTurn" class="ab-turn">🎯 行动</span>
                  <span v-if="!p.alive" class="ab-dead">出局</span>
                </div>
                <div class="ab-p-stats">❤ {{ p.hp }}/{{ p.maxHp }} · 🦉 {{ p.owls?.length || 0 }} · ⭐ {{ p.scoreTotal }}</div>
                <div class="ab-p-hand">
                  <span v-for="(c, i) in p.hand" :key="i" class="ab-card">{{ viewpoint === p.playerId ? '？' : c }}</span>
                  <span v-if="!p.hand || !p.hand.length" class="ab-none">无牌</span>
                </div>
              </div>
              <div class="ab-tower">
                <span v-for="s in towerSpellList" :key="s.id" class="ab-tower-item">
                  {{ s.icon }}{{ s.id }} 余 {{ curSnap?.data?.tower?.[s.id]?.remaining ?? 0 }}/{{ curSnap?.data?.tower?.[s.id]?.total ?? '-' }}
                </span>
              </div>
            </div>

            <!-- Stay or Fold：明牌 -->
            <div v-else-if="isSofSnap" class="sof-snap">
              <div class="snap-sub">阶段：{{ phaseLabel(curSnap?.data?.phase) }} · 目标 emoji {{ curSnap?.data?.target }} · 真实数量 {{ curSnap?.data?.trueCount }}</div>
              <table class="meta-table">
                <thead><tr><th>选手</th><th>估算</th><th>选择</th><th>差值</th><th>分数</th><th>状态</th></tr></thead>
                <tbody>
                  <tr v-for="p in detail.participants" :key="p.playerId">
                    <td class="mc-name">{{ p.playerName }}</td>
                    <td>{{ curSnap?.data?.estimates?.[p.playerId] ?? '-' }}</td>
                    <td>{{ curSnap?.data?.decisions?.[p.playerId] || '-' }}</td>
                    <td>{{ curSnap?.data?.diffs?.[p.playerId] ?? '-' }}</td>
                    <td>{{ curSnap?.data?.scores?.[p.playerId] ?? 0 }}</td>
                    <td>{{ curSnap?.data?.eliminated?.includes(p.playerId) ? '淘汰' : (curSnap?.data?.alive?.includes(p.playerId) ? '存活' : '-') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 弹珠得分：地图 + 落点 -->
            <div v-else-if="isMarbleSnap" class="marble-snap">
              <div class="snap-sub">
                {{ curSnap?.data?.mode === 'single' ? '单轮模式' : '淘汰模式' }}
                · 第 {{ curSnap?.data?.round }} {{ curSnap?.data?.mode === 'single' ? '位' : '轮' }}
                · 已发射 {{ (curSnap?.data?.throws || []).length }} 次
              </div>
              <MarbleMap :map="curSnap?.data?.map" :throws="curSnap?.data?.throws || []" />
            </div>

            <!-- 藏否决权牌寻宝赛：与实时观战一致的全屋明牌 -->
            <div v-else-if="isHgvSnap" class="hgv-replay-snap">
              <HideAndGoVetoSpectator replay :board="curSnap?.data?.board" />
            </div>

            <div v-else-if="curSnap?.data?.type === 'poker17'" class="poker-felt">
              <h3>{{ curSnap.data.phaseLabel }} · 底池 {{ curSnap.data.pot }}</h3>
              <div class="math-players">
                <article v-for="(seat, id) in curSnap.data.players" :key="id" class="math-player">
                  <b>{{ seat.name }} {{ seat.isTurn ? '· 当前行动' : '' }}</b>
                  <span>筹码 {{ seat.chips }} · 已下注 {{ seat.bet }}</span>
                  <span>{{ seat.hand?.join('　') || '手牌未公开' }}</span>
                </article>
              </div>
            </div>
            <!-- 通用：按快照 players 渲染 -->
            <div v-else-if="genericSnapPlayers.length" class="gen-board">
              <div v-for="p in genericSnapPlayers" :key="p.playerId" class="gen-p"
                :class="{ turn: p.isTurn, dead: p.alive === false }">
                <div class="gen-p-head">
                  <BBAvatar :name="p.name" size="sm" />
                  <b>{{ p.name }}</b>
                  <span v-if="p.isTurn" class="ab-turn">🎯</span>
                  <span v-if="p.alive === false" class="ab-dead">出局</span>
                </div>
                <div class="gen-fields">
                  <span v-for="(val, k) in p.fields" :key="k" class="gen-f"><b>{{ k }}：</b>{{ val }}</span>
                </div>
              </div>
            </div>

            <pre v-else class="tl-data">{{ pretty(curSnap?.data) }}</pre>
          </div>

          <!-- 专属复盘：真实答案 / 回合详情 -->
          <div v-if="meta && (section === 'result' || (section === 'scene' && !skillScene && !roundScene && !snapshots.length && !isJigsawMeta) || (section === 'scene' && interactiveMeta.includes(meta.type)))" :key="detail.id" class="dg-block">
            <div class="dg-title">{{ section === 'scene' ? '比赛现场' : '结算明细' }}</div>

            <!-- 毒酒：最终转盘盘面 -->
            <template v-if="meta.type === 'poison-drink' && meta.board">
              <PoisonDrinkSpectator replay :board="meta.board" />
            </template>

            <!-- 记忆翻牌：完整牌面 + 每次翻牌过程 -->
            <template v-else-if="meta.type === 'memory-match'">
              <MemoryMatchReplay :meta="meta" />
            </template>

            <!-- 自定义对战模式：题目、每轮答案、得分与淘汰 -->
            <template v-else-if="meta.type === 'custom-mode'">
              <CustomModeReplay :meta="meta" />
            </template>

            <!-- 藏否决权牌寻宝赛：最终全屋态势 + 明细 -->
            <template v-else-if="meta.type === 'hide-and-go-veto'">
              <div v-if="meta.board" class="hgv-replay-final">
                <div class="snap-sub">
                  最终全屋态势
                  <span v-if="meta.board.winnerName"> · 🏆 {{ meta.board.winnerName }}</span>
                  · 破坏度 {{ meta.board.destruction || 0 }}%
                </div>
                <HideAndGoVetoSpectator replay :board="meta.board" />
              </div>
              <SimpleGameReplay :meta="meta" />
            </template>

            <!-- 积分/技能类游戏：最终排名 + 过程明细表 -->
            <template v-else-if="isSimpleMeta">
              <SimpleGameReplay :meta="meta" />
            </template>

            <!-- 17 Poker：逐轮底池、手牌、牌型与筹码变化 -->
            <template v-else-if="meta.type === 'poker17'">
              <Poker17Replay :meta="meta" :participants="detail.participants" />
            </template>

            <!-- 快速算术 -->
            <template v-else-if="meta.type === 'quick-math'">
              <div v-if="meta.questions?.length" class="math-arena">
                <div class="math-caption">比赛题面 · 第 {{ mathQuestion + 1 }} / {{ meta.questions.length }} 题</div>
                <div class="math-expression">{{ meta.questions[mathQuestion]?.expression }} = ?</div>
                <div class="math-nav">
                  <button class="bb-btn" :disabled="mathQuestion === 0" @click="mathQuestion--">上一题</button>
                  <button class="bb-btn" :disabled="mathQuestion >= meta.questions.length - 1" @click="mathQuestion++">下一题</button>
                </div>
                <details :key="mathQuestion" class="math-answer"><summary>查看标准答案</summary>{{ meta.questions[mathQuestion]?.answer }}</details>
                <div class="math-players">
                  <div v-for="p in detail.participants" :key="p.playerId" class="math-player">
                    <b>{{ p.playerName }}</b>
                    <span>提交：{{ answerOf('quick-math', p.playerId, mathQuestion)?.userAnswer ?? '未记录' }}</span>
                    <span v-if="answerOf('quick-math', p.playerId, mathQuestion)">{{ answerOf('quick-math', p.playerId, mathQuestion)?.correct ? '正确' : '错误' }}</span>
                  </div>
                </div>
              </div>
              <div v-if="section === 'result'" class="golden-answers">
                <span v-for="(q, i) in meta.questions" :key="i" class="ga-item">
                  {{ q.expression }} = <strong>{{ q.answer }}</strong>
                </span>
              </div>
              <table v-if="section === 'result'" class="meta-table">
                <thead><tr><th>选手</th><th v-for="(_, i) in meta.questions" :key="i">#{{ i + 1 }}</th><th>用时</th></tr></thead>
                <tbody>
                  <tr v-for="p in detail.participants" :key="p.playerId">
                    <td class="mc-name">{{ p.playerName }}</td>
                    <td v-for="(_, i) in meta.questions" :key="i" class="mc" :class="cellClass(answerOf('quick-math', p.playerId, i))">
                      {{ answerOf('quick-math', p.playerId, i)?.userAnswer ?? '-' }}
                    </td>
                    <td>{{ dur(meta.players?.[p.playerId]?.durationMs) }}</td>
                  </tr>
                </tbody>
              </table>
            </template>

            <!-- 找出遗失的数字 -->
            <template v-else-if="meta.type === 'missing-number'">
              <div class="missing-arena">
                <div class="missing-label">比赛题面 · 7 × 7 数字矩阵</div>
                <div v-if="meta.cells?.length" class="missing-grid">
                  <button v-for="(cell,i) in meta.cells" :key="i" :aria-pressed="markedCells.includes(i)" @click="markedCells = markedCells.includes(i) ? markedCells.filter(n=>n!==i) : [...markedCells,i]">{{ cell }}</button>
                </div>
                <div v-else class="empty-hint">该记录未保存题面矩阵</div>
              </div>
              <details><summary>揭晓缺失数字</summary><strong>{{ meta.missing }}</strong></details>
              <table class="meta-table">
                <thead><tr><th>选手</th><th>提交</th><th>次数</th><th>判定</th></tr></thead>
                <tbody>
                  <tr v-for="p in detail.participants" :key="p.playerId">
                    <td class="mc-name">{{ p.playerName }}</td>
                    <td>{{ meta.players?.[p.playerId]?.value ?? '-' }}</td>
                    <td>{{ meta.players?.[p.playerId]?.attempts ?? 0 }}</td>
                    <td class="mc" :class="meta.players?.[p.playerId]?.correct ? 'ok' : 'bad'">
                      {{ meta.players?.[p.playerId]?.correct ? '正确' : '未答对' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </template>

            <!-- 描述猜谜 -->
            <template v-else-if="meta.type === 'describe-guess'">
              <div class="reveal-big">最终得分</div>
              <table class="meta-table">
                <thead><tr><th>名次</th><th>选手</th><th>总分</th><th>答题总用时</th></tr></thead>
                <tbody>
                  <tr v-for="(row, i) in dgStandings" :key="row.playerId">
                    <td>{{ i + 1 }}</td>
                    <td class="mc-name">{{ row.playerName }}</td>
                    <td class="mc ok">{{ row.score }}</td>
                    <td>{{ dur(row.submitMs) }}</td>
                  </tr>
                </tbody>
              </table>

              <div class="race-list">
                <div v-for="(q, qi) in meta.questions" :key="qi" class="race-item">
                  <div class="race-head">第 {{ qi + 1 }} 题 · 答案：<strong>{{ q.answer }}</strong></div>
                  <div class="race-clues">
                    <span v-for="(c, ci) in q.clues" :key="ci" class="race-clue">{{ ci + 1 }}. {{ c }}</span>
                  </div>
                  <table class="meta-table">
                    <thead><tr><th>选手</th><th>作答</th><th>本题得分</th><th>累计</th></tr></thead>
                    <tbody>
                      <tr v-for="p in detail.participants" :key="p.playerId">
                        <td class="mc-name">{{ p.playerName }}</td>
                        <td>{{ dgRecord(p.playerId, qi)?.value ?? '未作答' }}</td>
                        <td class="mc" :class="dgRecord(p.playerId, qi)?.correct ? 'ok' : 'bad'">
                          {{ dgRecord(p.playerId, qi) ? `+${dgRecord(p.playerId, qi).gain}` : 0 }}
                        </td>
                        <td>{{ dgCumulative(p.playerId, qi) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>

            <!-- Stay or Fold -->
            <template v-else-if="meta.type === 'stay-or-fold'">
              <div class="race-list">
                <div v-for="r in meta.history" :key="r.round" class="race-item">
                  <div class="race-head">
                    第 {{ r.round }} 轮 · 目标 {{ r.target }} · 真实数量 <strong>{{ r.trueCount }}</strong>
                  </div>
                  <table class="meta-table">
                    <thead><tr><th>选手</th><th>估算</th><th>选择</th><th>差值</th><th>结果</th></tr></thead>
                    <tbody>
                      <tr v-for="p in detail.participants" :key="p.playerId">
                        <td class="mc-name">{{ p.playerName }}</td>
                        <td>{{ r.estimates?.[p.playerId] ?? '-' }}</td>
                        <td>{{ r.decisions?.[p.playerId] === 'stay' ? 'Stay' : (r.decisions?.[p.playerId] === 'fold' ? 'Fold' : '-') }}</td>
                        <td>{{ r.diffs?.[p.playerId] ?? '-' }}</td>
                        <td>
                          <span v-if="r.closest?.includes(p.playerId)" class="mc ok">+1</span>
                          <span v-if="r.eliminated?.includes(p.playerId)" class="mc bad">淘汰</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>

            <!-- 德国心脏病 -->
            <template v-else-if="meta.type === 'german-heart'">
              <div class="reveal-big">目标分数：<strong>{{ meta.targetPoints }}</strong> 分</div>
              <div class="race-list">
                <div v-for="r in meta.history" :key="r.round" class="race-item">
                  <div class="race-head">
                    第 {{ r.round }} 轮 ·
                    <strong>{{ r.valid ? `出现 5 个 ${r.fruit}` : '没有 5 个相同水果' }}</strong>
                  </div>
                  <div v-if="r.winnerId" class="mc ok">抢铃成功：{{ playerName(r.winnerId) }} +1</div>
                  <div v-if="r.wrong && r.wrong.length" class="mc bad">
                    错误抢铃：{{ r.wrong.map(playerName).join('、') }}（各 -3，下一轮禁抢）
                  </div>
                  <div v-if="!r.winnerId && (!r.wrong || !r.wrong.length)" class="empty-hint">本轮无人抢铃</div>
                  <div class="snap-sub">牌面：{{ r.counts ? Object.entries(r.counts).map(([f, n]) => `${f}×${n}`).join(' ') : '-' }}</div>
                </div>
              </div>
            </template>

            <!-- 数字占卜术 -->
            <template v-else-if="meta.type === 'number-divination'">
              <div class="reveal-big">共 <strong>{{ meta.totalRounds }}</strong> 轮</div>
              <div class="race-list">
                <div v-for="r in meta.history || []" :key="r.round" class="race-item">
                  <div class="race-head">第 {{ r.round }} 轮</div>
                  <table class="meta-table">
                    <thead><tr><th>选手</th><th>数字</th><th>本轮得分</th></tr></thead>
                    <tbody>
                      <tr v-for="p in detail.participants" :key="p.playerId">
                        <td class="mc-name">{{ p.playerName }}</td>
                        <td>{{ r.choices?.[p.playerId] ?? '-' }}</td>
                        <td class="mc" :class="(r.deltas?.[p.playerId] || 0) > 0 ? 'ok' : ((r.deltas?.[p.playerId] || 0) < 0 ? 'bad' : '')">
                          {{ (r.deltas?.[p.playerId] || 0) > 0 ? '+' : '' }}{{ r.deltas?.[p.playerId] || 0 }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>

            <!-- 抓小三 -->
            <template v-else-if="meta.type === 'catch-mistress'">
              <div v-if="meta.winnerName" class="reveal-big">获胜者：<strong>{{ meta.winnerName }}</strong></div>
              <table class="meta-table">
                <thead><tr><th>选手</th><th>藏身点</th><th>状态</th></tr></thead>
                <tbody>
                  <tr v-for="p in detail.participants" :key="p.playerId">
                    <td class="mc-name">{{ p.playerName }}</td>
                    <td>{{ meta.choices?.[p.playerId] || '-' }}</td>
                    <td class="mc" :class="(meta.winnerId === p.playerId || meta.alive?.includes(p.playerId)) ? 'ok' : 'bad'">
                      {{ meta.winnerId === p.playerId ? '获胜' : (meta.alive?.includes(p.playerId) ? '存活' : '淘汰') }}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="meta.revealLog && meta.revealLog.length" class="race-list" style="margin-top: 12px">
                <div v-for="(r, i) in meta.revealLog" :key="i" class="race-item">
                  <div class="race-head">{{ r.locationName }} · {{ r.byName }}</div>
                  <div>
                    {{ r.special ? '全员淘汰，揭开者获胜' : (r.empty ? '无人被抓住' : eliminatedNames(r.eliminated) + ' 淘汰') }}
                  </div>
                </div>
              </div>
            </template>

            <!-- 出包魔法师 -->
            <template v-else-if="meta.type === 'abraca'">
              <div class="spell-grid">
                <div v-for="s in meta.spells" :key="s.id" class="spell-card">
                  <div class="spell-title">{{ s.icon }} {{ s.id }} · {{ s.name }}</div>
                  <div class="spell-desc">{{ s.desc }}</div>
                  <div class="spell-stock">库存 {{ meta.tower?.[s.id]?.remaining }}/{{ meta.tower?.[s.id]?.total }} · 已施 {{ meta.tower?.[s.id]?.cast }}</div>
                </div>
              </div>
              <table class="meta-table">
                <thead><tr><th>选手</th><th>生命</th><th>猫头鹰</th><th>总分</th><th>本轮分</th></tr></thead>
                <tbody>
                  <tr v-for="p in (meta.players || [])" :key="p.playerId">
                    <td class="mc-name">{{ p.name }}</td>
                    <td>{{ p.hp }}/{{ p.maxHp }}</td>
                    <td>{{ p.owls }}</td>
                    <td>{{ p.scoreTotal }}</td>
                    <td>{{ p.scoreRound }}</td>
                  </tr>
                </tbody>
              </table>
            </template>

            <!-- 少数决 -->
            <template v-else-if="meta.type === 'minority'">
              <div v-if="meta.rounds?.length" class="vote-arena">
                <div class="math-caption">比赛现场 · 第 {{ voteRound + 1 }} 轮</div>
                <div class="vote-question">{{ meta.rounds[voteRound]?.question?.text || '题目未记录' }}</div>
                <div class="math-nav"><button class="bb-btn" :disabled="voteRound === 0" @click="voteRound--">上一轮</button><button class="bb-btn" :disabled="voteRound >= meta.rounds.length - 1" @click="voteRound++">下一轮</button></div>
                <div class="vote-options"><div v-for="(option, oi) in meta.rounds[voteRound]?.question?.options || []" :key="oi" class="vote-option"><b>{{ option }}</b><span>{{ meta.rounds[voteRound]?.counts?.[oi] ?? 0 }} 票</span></div></div>
                <div class="math-players"><div v-for="p in meta.rounds[voteRound]?.participants || []" :key="p.playerId" class="math-player"><b>{{ p.playerName }}</b><span>{{ p.noAnswer ? '未作答' : p.label }}</span><span>{{ p.eliminated || !p.aliveAfter ? '出局' : '存活' }}</span></div></div>
                <p class="math-answer">{{ meta.rounds[voteRound]?.outcomeText }}</p>
              </div>
              <div v-if="section === 'result'" class="reveal-big">
                共 <strong>{{ meta.totalRounds || 0 }}</strong> 轮
                <span v-if="meta.winnerName"> · 胜者：<strong>{{ meta.winnerName }}</strong></span>
              </div>
              <div v-if="section === 'result'" class="race-list">
                <div v-for="r in meta.rounds || []" :key="r.round" class="race-item">
                  <div class="race-head">
                    第 {{ r.round }} 轮 · {{ r.question?.text || '' }}
                    <span v-if="r.wonBySpeed" class="mc ok">（比手速）</span>
                  </div>
                  <div class="snap-sub">
                    票数：
                    <strong>{{ r.question?.options?.[0] ?? 'A' }} {{ r.counts?.[0] ?? 0 }}</strong>
                    :
                    <strong>{{ r.counts?.[1] ?? 0 }} {{ r.question?.options?.[1] ?? 'B' }}</strong>
                    <span v-if="r.noAnswer?.length"> · 未作答：{{ r.noAnswer.map(playerName).join('、') }}</span>
                    <span v-if="r.eliminated?.length"> · 本轮出局：{{ r.eliminated.map(playerName).join('、') }}</span>
                  </div>
                  <table class="meta-table">
                    <thead><tr><th>选手</th><th>选择</th><th>作答用时</th><th>本轮结果</th></tr></thead>
                    <tbody>
                      <tr v-for="p in r.participants || []" :key="p.playerId">
                        <td class="mc-name">{{ p.playerName }}</td>
                        <td>{{ p.noAnswer ? '未作答' : p.label }}</td>
                        <td>{{ p.timeMs == null ? '-' : (p.timeMs / 1000).toFixed(2) + 's' }}</td>
                        <td>
                          <span v-if="r.winnerId === p.playerId" class="mc ok">🏆 获胜</span>
                          <span v-else-if="p.eliminated || !p.aliveAfter" class="mc bad">出局</span>
                          <span v-else class="mc ok">存活</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div class="snap-sub" style="margin-top: 6px">判定：{{ r.outcomeText }}</div>
                </div>
              </div>
            </template>

            <!-- 弹珠得分：地图、落点与逐轮得分 -->
            <template v-else-if="meta.type === 'marble-score'">
              <MarbleScoreReplay :meta="meta" />
            </template>

            <!-- 自定义游戏 -->
            <template v-else-if="meta.type === 'custom'">
              <table class="meta-table">
                <thead>
                  <tr><th>题目</th><th>正确答案</th><th v-for="p in detail.participants" :key="p.playerId">{{ p.playerName }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="q in meta.questions" :key="q.id">
                    <td class="mq-text">{{ q.text }}</td>
                    <td class="mq-ans">{{ q.correctAnswer || '（管理员评判）' }}</td>
                    <td v-for="p in detail.participants" :key="p.playerId" class="mc" :class="customCellClass(p.playerId, q.id)">
                      {{ customAnswer(p.playerId, q.id) ?? '-' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </template>

            <!-- 实力大挑战（抢答） -->
            <template v-else-if="meta.type === 'power-challenge'">
              <table class="meta-table">
                <thead><tr><th>题目</th><th>正确答案</th><th>占领者</th></tr></thead>
                <tbody>
                  <tr v-for="q in meta.questions" :key="q.id">
                    <td class="mq-text">{{ q.text }}</td>
                    <td class="mq-ans">{{ q.correctAnswer }}</td>
                    <td>{{ meta.questionWinners?.[q.id]?.playerName || '无人' }}</td>
                  </tr>
                </tbody>
              </table>
            </template>

            <div v-else class="empty-hint">该游戏暂无专属复盘数据（可在通用“比赛过程”中查看）</div>
          </div>

          <template v-if="section === 'events'">
          <label class="event-player">选手 <select v-model="focusedPlayer" @change="expanded = {}">
            <option value="">全部选手</option>
            <option v-for="p in detail.participants || []" :key="p.playerId" :value="p.playerId">{{ p.playerName }}</option>
          </select></label>
          <!-- 每位选手的比赛过程（可反映具体提交值与判定） -->
          <div class="dg-block">
            <div class="dg-title">比赛过程（按选手）</div>
            <div class="player-logs">
              <div v-for="grp in byPlayer.filter(g => !focusedPlayer || g.pid === focusedPlayer)" :key="grp.pid" class="plog">
                <div class="plog-head">
                  <BBAvatar :name="grp.name" size="sm" />
                  <span class="plog-name">{{ grp.name }}</span>
                  <span class="plog-count">{{ grp.events.length }} 次操作</span>
                </div>
                <div class="plog-rows">
                  <div v-for="(e, i) in grp.events" :key="i" class="plog-row" :class="e.type">
                    <span class="plog-time">+{{ delta(e.t) }}s</span>
                    <span class="plog-action">{{ e.text || e.type }}</span>
                    <span v-if="actionValue(e)" class="plog-value">值：{{ actionValue(e) }}</span>
                    <span v-if="actionResult(e)" class="plog-result" :class="resultClass(e)">{{ actionResult(e) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 完整事件时间线 -->
          <div class="dg-block">
            <div class="dg-title">
              完整事件（{{ filteredEvents.length }}）
              <span class="ev-filters">
                <button v-for="f in eventFilters" :key="f.value" class="ev-filter"
                  :class="{ active: eventFilter === f.value }" @click="eventFilter = f.value">{{ f.label }}</button>
              </span>
            </div>
            <div class="timeline">
              <div v-for="(e, i) in filteredEvents" :key="i" class="tl-row" :class="e.type">
                <span class="tl-time">{{ fmtTime(e.t) }}</span>
                <span class="tl-delta">+{{ delta(e.t) }}s</span>
                <span class="tl-text">{{ e.playerName ? `[${e.playerName}] ` : '' }}{{ e.text }}</span>
                <button v-if="e.data" class="tl-more" @click="toggle(i)">{{ expanded[i] ? '收起' : '详情' }}</button>
                <pre v-if="expanded[i]" class="tl-data">{{ pretty(e.data) }}</pre>
              </div>
              <div v-if="!filteredEvents.length" class="empty-hint">暂无事件</div>
            </div>
          </div>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { bbGetMinigameReplays, bbGetMinigameReplay, bbDeleteMinigameReplay, bbBatchDeleteMinigameReplays } from '../../../services/bbApi'
import SkillContestReplay from '../../../components/bigbrother/minigames/SkillContestReplay.vue'
import RoundContestReplay from '../../../components/bigbrother/minigames/RoundContestReplay.vue'
import ContestStandings from '../../../components/bigbrother/minigames/ContestStandings.vue'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'
import JigsawSpectator from '../../../components/bigbrother/minigames/JigsawSpectator.vue'
import MemoryMatchReplay from '../../../components/bigbrother/minigames/MemoryMatchReplay.vue'
import PoisonDrinkSpectator from '../../../components/bigbrother/minigames/PoisonDrinkSpectator.vue'
import CustomModeReplay from '../../../components/bigbrother/minigames/CustomModeReplay.vue'
import SimpleGameReplay from '../../../components/bigbrother/minigames/SimpleGameReplay.vue'
import Poker17Replay from '../../../components/bigbrother/minigames/Poker17Replay.vue'
import MarbleScoreReplay from '../../../components/bigbrother/minigames/MarbleScoreReplay.vue'
import MarbleMap from '../../../components/bigbrother/minigames/MarbleMap.vue'
import HideAndGoVetoSpectator from '../../../components/bigbrother/minigames/HideAndGoVetoSpectator.vue'

defineProps<{ readonly?: boolean }>()

const list = ref<any[]>([])
const detail = ref<any>(null)
const filterGameType = ref('')
const eventFilter = ref('all')
const markedCells = ref<number[]>([])
const mathQuestion = ref(0)
const voteRound = ref(0)
const section = ref('scene')
const tabs = [{id:'scene',name:'比赛现场'}, {id:'result',name:'赛后结算'}, {id:'events',name:'操作记录'}]
const interactiveMeta = ['memory-match','quick-math','minority','poker17','missing-number','klotski','spot-difference','dice-duel','sequence-memory','marble-score']
const boardGame = computed(() => ['poker17','jigsaw','abraca','hide-and-go-veto','poison-drink','marble-score'].includes(meta.value?.type || detail.value?.minigameId))
const skillScene = computed(() => ['click-speed','balance-bar','reaction','swing-pointer'].includes(meta.value?.type))
const roundScene = computed(() => ['german-heart','number-divination','stay-or-fold','catch-mistress','otev','describe-guess','custom','custom-mode','power-challenge'].includes(meta.value?.type))
const expanded = ref<Record<number, boolean>>({})
const selectedIds = ref<string[]>([])

const eventFilters = [
  { value: 'all', label: '全部' },
  { value: 'answer', label: '作答' },
  { value: 'round', label: '回合' },
  { value: 'eliminate', label: '出局' },
  { value: 'finish', label: '结果' }
]

const GAME_RULES: Record<string, string> = {
  'click-speed': '限定时间内尽可能多地点击目标，点击次数/得分最高者获胜。',
  'memory-match': '4×4 共 8 对卡片，翻开两张相同图案即可配对；完成全部配对用时最短者获胜。',
  'quick-math': '连续完成算术题，答对得分；按正确题数/用时排名。',
  'balance-bar': '控制平衡杆停留在目标区域，累计停留时间最长者获胜。',
  'dice-duel': '按轮次掷骰子比大小，累计得分最高者获胜。',
  'power-challenge': '抢答题目并占领题目，答对最多/占领最多者获胜。',
  'klotski': '移动滑块将目标块移到出口，步数最少/用时最短者获胜。',
  'swing-pointer': '在指针摆到目标区域时点击，命中次数/得分最高者获胜。',
  'minority': '每轮在选项中选择少数派，少数派存活，最后存活者获胜。',
  'spot-difference': '在限定时间内找出图片中的所有不同处，找得最多/最快者获胜。',
  'reaction': '看到信号后尽快点击，反应时间最短者获胜。',
  'sequence-memory': '记住并复现逐渐变长的序列，坚持轮次最多者获胜。',
  'jigsaw': '5×5 拼图，交换拼图块还原完整图片；第一个拼对并提交者获胜。',
  'missing-number': '观察数字序列，找出缺失的数字；答对且用时最短者获胜。',
  'abraca': '出包魔法师：使用法术卡牌进行对战，最后存活者获胜。',
  'describe-guess': '根据逐渐放出的描述猜答案，答对得分，总分最高者获胜。',
  'stay-or-fold': '估算目标 emoji 的数量，选择 Stay 或 Fold，积分最高者获胜。',
  'catch-mistress': '选择藏身地点并抓捕/躲避，最后存活或获胜者获胜。',
  'german-heart': '德国心脏：抢在正确时机按铃，先达到目标分数者获胜。',
  'number-divination': '数字占卜：选择数字并预测结果，累计得分最高者获胜。',
  'poker17': '17 张扑克对战，按牌型与筹码结算，最终筹码最多者获胜。',
  'poison-drink': '毒酒：庄家分配酒杯，玩家轮流转动转盘；喝到毒酒扣血，最后存活者获胜。',
  'marble-score': '弹珠得分：随机生成固定得分地图，方向箭与蓄力条以不同周期摆动；支持淘汰、单轮、多轮积分、轮流积分与随机PK淘汰五种模式。',
  'hide-and-go-veto': '藏否决权牌寻宝赛：每人秘密藏好写有自己名字的否决权卡，随后轮流进屋翻找；卡被翻出即淘汰，最后一张没被找到的卡获胜。',
  'otev': 'OTEV 抢座问答赛：所有玩家共享公共牌池，查看不锁定、拿走才独占；答案可能是 1 人或 2 人，必须找到精确匹配的牌；提交后按顺序揭晓，答错或最后提交者淘汰。',
  'custom': '自定义游戏，按管理员配置的题目、计分与胜负规则结算。'
}

const gameRuleText = computed(() => {
  const id = detail.value?.minigameId || ''
  if (GAME_RULES[id]) return GAME_RULES[id]
  if (id.startsWith('custom-')) return GAME_RULES['custom']
  return '按游戏内规则进行，最终结果与过程详见下方复盘。'
})

const allSelected = computed(() => list.value.length > 0 && list.value.every(r => selectedIds.value.includes(r.id)))

function toggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  selectedIds.value = checked ? list.value.map(r => r.id) : []
}

const filteredEvents = computed(() => {
  const evs = (detail.value?.events || []).filter((e: any) => !focusedPlayer.value || e.playerId === focusedPlayer.value)
  if (eventFilter.value === 'all') return evs
  if (eventFilter.value === 'finish') return evs.filter((e: any) => e.type === 'finish' || e.type === 'game_end' || e.type === 'game_stop')
  if (eventFilter.value === 'answer') return evs.filter((e: any) => e.type === 'answer' || e.type === 'choose')
  return evs.filter((e: any) => e.type === eventFilter.value)
})

const focusedPlayer = ref('')
const winnerIds = computed(() => [
  detail.value?.winner?.playerId,
  ...(detail.value?.winners || []).map((p: any) => typeof p === 'string' ? p : p.playerId)
].filter(Boolean) as string[])
const replayStates = computed(() => Object.fromEntries((detail.value?.participants || []).map((p: any) => {
  const state = detail.value?.finalStates?.[p.playerId] || {}
  const entry = Array.isArray(meta.value?.players) ? meta.value.players.find((x: any) => x.playerId === p.playerId) : null
  const boardEntry = meta.value?.board?.players?.find((x: any) => x.playerId === p.playerId)
  return [p.playerId, {
    ...state,
    alive: state.alive ?? entry?.alive,
    eliminated: state.eliminated ?? boardEntry?.eliminated ?? entry?.eliminated,
    color: state.color ?? entry?.color
  }]
})))
function inspectReplayPlayer(id: string) {
  focusedPlayer.value = id
  expanded.value = {}
  eventFilter.value = 'all'
  section.value = 'events'
}
function playerName(pid: string) {
  return detail.value?.participants?.find((p: any) => p.playerId === pid)?.playerName || pid
}

const meta = computed<any>(() => detail.value?.meta || null)
const isJigsawMeta = computed(() => meta.value?.type === 'jigsaw' && !!meta.value?.board)
const SIMPLE_META_TYPES = ['click-speed', 'balance-bar', 'dice-duel', 'reaction', 'swing-pointer', 'klotski', 'spot-difference', 'sequence-memory', 'hide-and-go-veto', 'otev']
const isSimpleMeta = computed(() => SIMPLE_META_TYPES.includes(meta.value?.type))
const snapshots = computed<any[]>(() => detail.value?.snapshots || [])
const snapIndex = ref(0)
const viewpoint = ref('')
const curSnap = computed<any>(() => snapshots.value[snapIndex.value] || null)
const isJigsawSnap = computed(() => {
  const d = curSnap.value?.data
  return !!(d && d.type === 'jigsaw' && d.board)
})
const isPoisonSnap = computed(() => {
  const d = curSnap.value?.data
  return !!(d && d.type === 'poison-drink' && d.board)
})
const SPELL_ICON: Record<string, string> = { 1: '🐉', 2: '👻', 3: '💤', 4: '🦉', 5: '⚡', 6: '❄️', 7: '🔥', 8: '🧪' }
const isAbracaSnap = computed(() => { const d = curSnap.value?.data; return !!(d && Array.isArray(d.players) && d.tower) })
const isSofSnap = computed(() => { const d = curSnap.value?.data; return !!(d && d.estimates !== undefined && (d.scores !== undefined || d.trueCount !== undefined)) })
const isMarbleSnap = computed(() => {
  const d = curSnap.value?.data
  return !!(d && d.type === 'marble-score' && d.map)
})
const isHgvSnap = computed(() => {
  const d = curSnap.value?.data
  return !!(d && d.type === 'hide-and-go-veto' && d.board)
})
const towerSpellList = computed(() => {
  const spells = meta.value?.spells
  if (Array.isArray(spells) && spells.length) return spells
  return Object.keys(curSnap.value?.data?.tower || {}).map(id => ({ id, icon: SPELL_ICON[id] || '🔮' }))
})
function fmtFields(obj: any) {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null || v === '') continue
    if (Array.isArray(v)) out[k] = v.length ? v.map((x: any) => typeof x === 'object' ? JSON.stringify(x) : x).join('、') : '—'
    else if (typeof v === 'object') out[k] = JSON.stringify(v)
    else out[k] = v
  }
  return out
}
const genericSnapPlayers = computed(() => {
  const d = curSnap.value?.data
  if (!d || !d.players || isAbracaSnap.value || isSofSnap.value || isHgvSnap.value) return []
  const nameOf = (pid: string) => detail.value?.participants?.find((p: any) => p.playerId === pid)?.playerName || pid
  const list: any[] = []
  if (Array.isArray(d.players)) {
    for (const p of d.players) {
      const { playerId, name, isTurn, alive, ...rest } = p
      list.push({ playerId, name: name || nameOf(playerId), isTurn, alive, fields: fmtFields(rest) })
    }
  } else if (typeof d.players === 'object') {
    for (const [pid, obj] of Object.entries(d.players)) {
      list.push({ playerId: pid, name: nameOf(pid), fields: fmtFields(obj) })
    }
  }
  return list
})
function phaseLabel(p: string) {
  return ({ show: '展示', estimate: '估算', reveal: '公布估算', decide: 'Stay/Fold', resolve: '结算' } as Record<string, string>)[p] || p || ''
}

function eliminatedNames(list: any[]) {
  return (list || []).map((e: any) => e.playerName).join('、')
}

function dur(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return '-'
  return `${(ms / 1000).toFixed(1)}s`
}
function cellClass(a: any) {
  if (!a || a.correct == null) return ''
  return a.correct ? 'ok' : 'bad'
}
function answerOf(type: string, pid: string, i: number) {
  if (!meta.value) return null
  if (type === 'quick-math') {
    const answers = meta.value.players?.[pid]?.answers || []
    let questionIndex = 0
    let last = null
    for (const answer of answers) {
      if (questionIndex === i) last = answer
      if (answer.correct) questionIndex++
      if (questionIndex > i) break
    }
    return last
  }
  return null
}
function dgRecord(pid: string, qi: number) {
  const recs = meta.value?.players?.[pid]?.records || {}
  return recs[qi] || recs[String(qi)] || null
}
const dgStandings = computed(() => {
  const parts = detail.value?.participants || []
  const rows = parts.map((p: any) => {
    const mp = meta.value?.players?.[p.playerId] || {}
    const score = mp.score ?? detail.value?.scores?.[p.playerId] ?? 0
    const submitMs = mp.submitMs ?? null
    return { playerId: p.playerId, playerName: p.playerName, score, submitMs }
  })
  return rows.sort((a: any, b: any) => {
    if (b.score !== a.score) return b.score - a.score
    const ta = a.submitMs == null ? Infinity : a.submitMs
    const tb = b.submitMs == null ? Infinity : b.submitMs
    return ta - tb
  })
})
function dgCumulative(pid: string, qi: number) {
  let sum = 0
  for (let i = 0; i <= qi; i++) {
    const r = dgRecord(pid, i)
    if (r) sum += (r.gain || 0)
  }
  return sum
}
function customAnswer(pid: string, qid: string) {
  const ans = meta.value?.players?.[pid]?.answers || []
  const hit = ans.find((a: any) => a.qid === qid)
  return hit ? hit.userAnswer : null
}
function customCellClass(pid: string, qid: string) {
  const ans = meta.value?.players?.[pid]?.answers || []
  const hit = ans.find((a: any) => a.qid === qid)
  if (!hit || hit.correct == null) return ''
  return hit.correct ? 'ok' : 'bad'
}

// 按选手分组
const byPlayer = computed(() => {
  const map: Record<string, { pid: string; name: string; events: any[] }> = {}
  for (const e of (detail.value?.events || [])) {
    if (!e.playerId) continue
    if (!map[e.playerId]) map[e.playerId] = { pid: e.playerId, name: e.playerName || e.playerId, events: [] }
    map[e.playerId].events.push(e)
  }
  const arr = Object.values(map)
  for (const g of arr) for (const e of g.events) if (!g.name && e.playerName) g.name = e.playerName
  return arr
})

// 从事件 data 中提取选手提交的具体值（作答/数字/法术等）
function actionValue(e: any): string {
  const a = e?.data?.action
  if (!a) return ''
  const v = a.answer ?? a.value ?? a.spell ?? a.choice ?? a.count ?? a.answers
  if (v == null) return ''
  if (typeof v === 'object') { try { return JSON.stringify(v) } catch { return '' } }
  return String(v)
}
function actionResult(e: any): string {
  const r = e?.data?.result
  if (!r) return ''
  if (r.correct === true) return '✅ 正确'
  if (r.correct === false) return '❌ 错误'
  if (r.success === true) return '成功'
  if (r.success === false) return '失败'
  if (r.gradedCount !== undefined) return `答对 ${r.gradedCorrect ?? 0}/${r.gradedCount}`
  return ''
}
function resultClass(e: any) {
  const r = e?.data?.result
  if (!r) return ''
  if (r.correct === true || r.success === true) return 'ok'
  if (r.correct === false || r.success === false) return 'bad'
  return ''
}

const durationText = computed(() => {
  const d = detail.value
  if (!d?.startedAt || !d?.endedAt) return '-'
  const ms = new Date(d.endedAt).getTime() - new Date(d.startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '-'
  return `${Math.round(ms / 1000)}s`
})

function gameTypeLabel(t: string) {
  return ({ hoh: 'HOH', veto: '否决权', bbbbb: 'BBBB', bbbb: 'BBBB', finale: '终局' } as Record<string, string>)[t] || t
}
function fmtDate(t: string) { return t ? new Date(t).toLocaleString('zh-CN') : '' }
function fmtTime(t: number) {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
function delta(t: number) {
  const start = detail.value?.startedAt ? new Date(detail.value.startedAt).getTime() : t
  return ((t - start) / 1000).toFixed(1)
}
function pretty(d: any) { try { return JSON.stringify(d, null, 2) } catch { return String(d) } }
function toggle(i: number) { expanded.value = { ...expanded.value, [i]: !expanded.value[i] } }

async function loadList() {
  try {
    list.value = await bbGetMinigameReplays({ gameType: filterGameType.value || undefined, limit: 200 })
    selectedIds.value = selectedIds.value.filter(id => list.value.some(r => r.id === id))
  } catch { list.value = [] }
}
let requestNumber = 0
async function openReplay(id: string) {
  const current = ++requestNumber
  try {
    const replay = await bbGetMinigameReplay(id)
    if (requestNumber !== current) return
    detail.value = replay
    expanded.value = {}
    markedCells.value = []
    snapIndex.value = mathQuestion.value = voteRound.value = 0
    viewpoint.value = ''
    focusedPlayer.value = ''
    eventFilter.value = 'all'
    section.value = 'scene'
  } catch (e: any) {
    if (requestNumber === current) alert(e?.message || '加载失败')
  }
}
async function removeReplay(id: string) {
  if (!confirm('确定删除该复盘记录？')) return
  try { await bbDeleteMinigameReplay(id); detail.value = null; await loadList() } catch (e: any) { alert(e?.message || '删除失败') }
}
async function batchDelete() {
  if (!selectedIds.value.length) return
  if (!confirm(`确定删除选中的 ${selectedIds.value.length} 条复盘记录吗？`)) return
  try {
    const res = await bbBatchDeleteMinigameReplays(selectedIds.value)
    if (detail.value && selectedIds.value.includes(detail.value.id)) detail.value = null
    selectedIds.value = []
    await loadList()
    alert(`已删除 ${res?.deleted ?? ''} 条`)
  } catch (e: any) { alert(e?.message || '批量删除失败') }
}

onMounted(loadList)
</script>

<style scoped>
.event-player {display:flex;gap:8px;align-items:center;margin-bottom:10px}.event-player select {background:#251b37;color:#e6d8fa;border:1px solid #7e6b9a;border-radius:6px;padding:6px}
.poker-felt {padding:24px 12px;text-align:center;background:#17453a;border:2px solid #679984;border-radius:44px;color:#fff}
.back-list {display:none}
@media(max-width:800px){.opened>.list-panel {display:none}.back-list {display:inline-block;margin-bottom:12px}.replay-layout:not(.opened)>.detail-panel {display:none}}

.scene-tabs {display:flex;gap:6px;margin:14px 0 18px;flex-wrap:wrap}
.scene-tabs button {padding:9px 16px;background:#201a32;border:1px solid #554965;border-radius:8px;color:#d4cce4;cursor:pointer}
.scene-tabs button[aria-pressed=true] {background:#3c3254;border-color:#c8a8f2;color:white}
.detail-panel {min-width:0;overflow-wrap:anywhere}.dg-block {overflow-x:auto}
.math-arena { background: linear-gradient(145deg, #17294b, #10182a); border: 1px solid #ffffff20; border-radius: 14px; padding: 20px; margin-bottom: 14px; text-align: center; }
.math-caption { color: #a9bbdb; font-size: 13px; }
.math-expression { color: #fff; font-size: clamp(30px, 6vw, 54px); font-weight: 800; padding: 24px 0; }
.math-nav { display: flex; justify-content: center; gap: 10px; }
.math-answer { color: #e6c988; margin: 16px 0; }
.math-players { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.math-player { display: flex; flex-direction: column; gap: 5px; background: #ffffff0c; border-radius: 8px; padding: 10px 16px; color: #dce7ff; }
.vote-arena { background: linear-gradient(145deg, #272047, #10182a); border: 1px solid #ffffff20; border-radius: 14px; padding: 20px; text-align: center; margin-bottom: 14px; }
.vote-question { color: white; font-size: 22px; font-weight: 700; padding: 20px; }
.vote-options { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin: 16px 0; }
.vote-option { display: flex; flex-direction: column; gap: 8px; padding: 16px; border: 1px solid #a894ed66; border-radius: 10px; color: #eee8ff; min-width: 140px; }
.missing-arena { background: linear-gradient(145deg, #17294b, #10182a); border: 1px solid #ffffff20; border-radius: 14px; padding: 20px; margin-bottom: 14px; }
.missing-label { color: #b9c6e6; font-size: 13px; margin-bottom: 12px; }
.missing-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; max-width: 420px; margin: auto; }
.missing-grid button[aria-pressed=true] {background:#544865;color:#ffde91}.missing-grid button {cursor:pointer; display: grid; place-items: center; aspect-ratio: 1; background: #253b62; border: 1px solid #6681ab55; border-radius: 6px; font-weight: 700; color: #f3f6ff; }
.mg-replay { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #ece7fb; margin: 0; }
.filters { margin-left: auto; display: flex; gap: 10px; flex-wrap: wrap; }
.bb-input { padding: 8px 12px; background: #120a22; border: 1px solid #b39bff33; border-radius: 6px; color: #ece7fb; font-size: 13px; }
.replay-layout { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; }
.list-panel { background: #1b1130; border: 1px solid #b39bff22; border-radius: 12px; padding: 12px; max-height: 82vh; overflow-y: auto; }
.list-tools { margin-bottom: 8px; }
.sel-all { font-size: 12px; color: #a99bd0; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.replay-item { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border: 1px solid #ffffff10; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; }
.replay-item:hover { border-color: #4488ff66; }
.replay-item.active { border-color: #4488ff; background: #4488ff12; }
.item-check { padding-top: 2px; }
.item-main { flex: 1; min-width: 0; }
.ri-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.ri-name { font-size: 13px; color: #ece7fb; font-weight: 600; }
.ri-type { font-size: 11px; color: #4488ff; }
.ri-meta { font-size: 12px; color: #b3a6d6; }
.ri-winner { font-size: 12px; color: #e6c988; margin-top: 4px; }
.ri-winner.none { color: #6b5f92; }
.detail-panel { background: #1b1130; border: 1px solid #b39bff22; border-radius: 12px; padding: 18px; min-width: 0; }
.detail-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; gap: 12px; }
.dh-title { font-size: 18px; font-weight: 700; color: #ece7fb; }
.dh-sub { font-size: 13px; color: #b3a6d6; margin-top: 4px; }
.dg-block { margin-bottom: 18px; }
.dg-title { font-size: 14px; color: #b39bff; font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.game-rule { font-size: 13px; color: #b9c6e6; line-height: 1.7; padding: 10px 12px; background: #b39bff0e; border-left: 3px solid #b39bff; border-radius: 6px; }
.player-logs { display: flex; flex-direction: column; gap: 12px; }
.plog { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 10px; padding: 10px 12px; }
.plog-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.plog-name { font-size: 14px; color: #ece7fb; font-weight: 600; }
.plog-count { font-size: 12px; color: #b3a6d6; margin-left: auto; }
.plog-rows { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow-y: auto; }
.plog-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; padding: 4px 8px; background: #ffffff05; border-radius: 6px; flex-wrap: wrap; }
.plog-row.eliminate { background: #ff444414; }
.plog-time { color: #4488ff; font-variant-numeric: tabular-nums; min-width: 48px; }
.plog-action { color: #ddd; }
.plog-value { color: #e6e6ff; }
.plog-result.ok { color: #b39bff; }
.plog-result.bad { color: #ff6b6b; }
.ev-filters { display: flex; gap: 6px; }
.ev-filter { background: transparent; border: 1px solid #ffffff22; color: #a99bd0; border-radius: 6px; padding: 2px 10px; font-size: 12px; cursor: pointer; }
.ev-filter.active { border-color: #b39bff; color: #b39bff; }
.timeline { display: flex; flex-direction: column; gap: 4px; max-height: 50vh; overflow-y: auto; }
.tl-row { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: #ffffff05; border-radius: 6px; font-size: 13px; flex-wrap: wrap; }
.tl-row.eliminate { background: #ff444414; }
.tl-row.finish, .tl-row.game_end, .tl-row.game_stop { background: #e6c98814; }
.tl-row.round { background: #4488ff12; }
.tl-time { color: #6b5f92; font-size: 11px; font-variant-numeric: tabular-nums; }
.tl-delta { color: #4488ff; font-size: 11px; font-variant-numeric: tabular-nums; min-width: 48px; }
.tl-text { color: #ddd; flex: 1; }
.tl-more { background: transparent; border: 1px solid #ffffff22; color: #a99bd0; border-radius: 4px; padding: 1px 8px; font-size: 11px; cursor: pointer; }
.tl-data { flex-basis: 100%; margin: 4px 0 0; padding: 8px; background: #120a22; border-radius: 6px; color: #b9c6e6; font-size: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
.empty-hint { color: #6b5f92; font-size: 13px; padding: 24px 0; text-align: center; }
.bb-btn { background: transparent; border: 1px solid #b39bff44; color: #b39bff; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.bb-btn:hover { background: #b39bff22; }
.bb-btn-danger { border-color: #ff444466; color: #ff4444; }
.bb-btn-danger:hover { background: #ff444422; }
.golden-answers { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.ga-item { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 6px; padding: 4px 10px; font-size: 13px; color: #ddd; }
.ga-item strong { color: #b39bff; }
.reveal-big { font-size: 15px; color: #ddd; margin-bottom: 12px; }
.reveal-big strong { color: #e6c988; font-size: 20px; }
.meta-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.meta-table th, .meta-table td { border: 1px solid #ffffff12; padding: 6px 10px; text-align: center; color: #cfc4ea; }
.meta-table th { background: #ffffff08; color: #b9c6e6; font-weight: 600; }
.mc-name { text-align: left; color: #ece7fb; white-space: nowrap; }
.mc.ok { color: #b39bff; }
.mc.bad { color: #ff6b6b; }
.mq-text { text-align: left; max-width: 320px; }
.mq-ans { color: #b39bff; }
.race-list { display: flex; flex-direction: column; gap: 12px; }
.race-item { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 10px; padding: 10px 12px; }
.race-head { font-size: 14px; color: #ddd; margin-bottom: 8px; }
.race-head strong { color: #e6c988; }
.race-clues { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
.race-clue { font-size: 12.5px; color: #b9c6e6; }
.spell-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 12px; }
.spell-card { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 10px; padding: 10px 12px; }
.spell-title { font-size: 14px; color: #ece7fb; font-weight: 600; }
.spell-desc { font-size: 12px; color: #b3a6d6; margin: 4px 0; line-height: 1.4; }
.spell-stock { font-size: 12px; color: #b9c6e6; }
.snap-controls { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.snap-range { flex: 1; accent-color: #b39bff; }
.snap-label { font-size: 13px; color: #b9c6e6; margin-bottom: 10px; }
.snap-sub { font-size: 13px; color: #ddd; margin-bottom: 8px; }
.hgv-replay-snap { margin-bottom: 12px; }
.hgv-replay-final { margin-bottom: 14px; }
.ab-board { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.ab-p { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 10px; padding: 10px 12px; }
.ab-p.turn { border-color: #b39bff; background: #b39bff12; }
.ab-p.dead { opacity: 0.5; }
.ab-p-head { display: flex; align-items: center; gap: 6px; font-size: 14px; color: #ece7fb; }
.ab-turn { margin-left: auto; font-size: 11px; color: #b39bff; }
.ab-dead { margin-left: auto; font-size: 11px; color: #ff6b6b; }
.ab-p-stats { font-size: 12px; color: #b9c6e6; margin: 6px 0; }
.ab-p-hand { display: flex; flex-wrap: wrap; gap: 6px; }
.ab-card { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 36px; background: #2a1a4a; border: 1px solid #b39bff55; border-radius: 5px; color: #ece7fb; font-weight: 700; font-size: 14px; }
.ab-none { color: #6b5f92; font-size: 12px; }
.ab-tower { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.ab-tower-item { font-size: 12px; color: #e0d7ff; background: #ffffff08; border-radius: 6px; padding: 2px 8px; }
.ab-seat { color: #b3a6d6; font-size: 11px; }
.gen-board { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.gen-p { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 10px; padding: 10px 12px; }
.gen-p.turn { border-color: #b39bff; background: #b39bff12; }
.gen-p.dead { opacity: 0.55; }
.gen-p-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 14px; color: #ece7fb; }
.gen-fields { display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; color: #e0d7ff; }
.gen-f b { color: #b3a6d6; font-weight: 500; }
@media (max-width: 760px) {
  .replay-layout { grid-template-columns: 1fr; }
  .list-panel { max-height: 40vh; }
  .detail-panel { padding: 12px; }
  .meta-table { display: block; overflow-x: auto; white-space: nowrap; }
  .board-grid, .ab-board, .spell-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
}
</style>
