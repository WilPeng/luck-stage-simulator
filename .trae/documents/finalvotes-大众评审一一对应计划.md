# finalVotes 大众评审一一对应改造计划

## 1. Summary

将当前 `finalVotes` 的“纯概率模拟 1000 票”改造为“真实生成 1000 位大众评审并逐人投票”。
这 1000 位评审在 **公演结算时** 生成并给每个舞台投 `yes/no`，后续 **个人喜爱度投票** 复用同一批评审，每人再按权重投 3 位选手。
同时新增大众评审中文姓名（性别相关），并支持查询某位评审为哪些舞台投了 `yes`。

## 2. Current State Analysis

| 模块 | 当前行为 | 问题 |
|------|---------|------|
| `backend/src/routes/performance.js` | `simulateAudienceVotes()` 仅按概率随机生成 `finalVotes`，不创建任何评审实体 | 1000 票是“数字模拟”，无法对应到具体评审，也无法查询某位评审投过哪些舞台 |
| `backend/src/services/audienceVoteService.js` | 在 `generateAudienceVoteForRound()` 里新建 1000 位 `AudienceMember`，每人投 3 位选手 | 这 1000 人与团队票模拟是两套独立数据，不满足“一一对应” |
| `backend/src/models/AudienceMember.js` | 只有 `gender/age/occupation` | 缺少姓名，且性别不用于名字生成 |
| `backend/src/routes/audienceVote.js` | `/seat/:seatNumber` 只返回个人喜爱度 3 票 | 无法查看该评审给哪些舞台投了 `yes` |
| 前端评审席/详情弹窗 | 只展示性别、年龄、职业、3 位选手 | 缺少姓名和舞台投票记录 |

关键文件已确认：
- 结算入口：`backend/src/routes/performance.js` 的 `POST /api/performance/calculate`
- 团队票模拟函数：`simulateAudienceVotes()`（第 317~334 行）
- 个人喜爱度服务：`backend/src/services/audienceVoteService.js`
- 个人喜爱度路由：`backend/src/routes/audienceVote.js`
- 前端评审页面：`frontend/src/views/admin/AudienceVoteView.vue`
- 前端类型：`frontend/src/types/performance.ts`

## 3. Proposed Changes

### 3.1 新增数据模型：大众评审对舞台的 yes/no 投票

**文件：** `backend/src/models/AudienceTeamVote.js`（新建）

```js
/**
 * 大众评审对舞台（团队）的 yes/no 投票
 * 字段: id / roundId / audienceId / seatNumber / teamId / teamName / votedYes / createdAt
 */
class AudienceTeamVote extends BaseModel {
  constructor(data) {
    super('AudienceTeamVote')
    this.roundId = null
    this.audienceId = null
    this.seatNumber = null
    this.teamId = null
    this.teamName = ''
    this.votedYes = false   // true = 投送 yes，false = 未投送
    this.createdAt = new Date().toISOString()
    if (data) Object.assign(this, data)
  }
  // ...标准 toObject / save / find / deleteMany / insertMany
}
```

** why：** 把团队票落到具体评审，才能支持“查询某评审为哪些舞台投了 yes”。

### 3.2 大众评审成员模型增加姓名

**文件：** `backend/src/models/AudienceMember.js`

在 `constructor` 中新增：
```js
this.name = ''   // 中文姓名，与 gender 相关
```

** why：** 满足用户“随机生成大众评审名字，且性别相关”的要求。

### 3.3 大众评审服务改造：支持复用已有评审 + 中文姓名生成

**文件：** `backend/src/services/audienceVoteService.js`

#### 3.3.1 新增姓名生成函数

```js
const SURNAMES = ['赵','钱','孙','李','周','吴','郑','王','冯','陈','褚','卫','蒋','沈','韩','杨','朱','秦','尤','许','何','吕','施','张','孔','曹','严','华','金','魏','陶','姜','戚','谢','邹','喻','柏','水','窦','章','云','苏','潘','葛','奚','范','彭','郎','鲁','韦','昌','马','苗','凤','花','方','俞','任','袁','柳','酆','鲍','史','唐','费','廉','岑','薛','雷','贺','倪','汤','滕','殷','罗','毕','郝','邬','安','常','乐','于','时','傅','皮','卞','齐','康','伍','余','元','卜','顾','孟','平','黄','和','穆','萧','尹','姚','邵','湛','汪','祁','毛','禹','狄','米','贝','明','臧','计','伏','成','戴','谈','宋','茅','庞','熊','纪','舒','屈','项','祝','董','梁','杜','阮','蓝','闵','席','季','麻','强','贾','路','娄','危','江','童','颜','郭','梅','盛','林','刁','锺','徐','邱','骆','高','夏','蔡','田','樊','胡','凌','霍','虞','万','支','柯','昝','管','卢','莫','经','房','裘','缪','干','解','应','宗','丁','宣','贲','邓','郁','单','杭','洪','包','诸','左','石','崔','吉','钮','龚','程','嵇','邢','滑','裴','陆','荣','翁','荀','羊','於','惠','甄','麴','家','封','芮','羿','储','靳','汲','邴','糜','松','井','段','富','巫','乌','焦','巴','弓','牧','隗','山','谷','车','侯','宓','蓬','全','郗','班','仰','秋','仲','伊','宫','宁','仇','栾','暴','甘','钭','厉','戎','祖','武','符','刘','景','詹','束','龙','叶','幸','司','韶','郜','黎','蓟','薄','印','宿','白','怀','蒲','邰','从','鄂','索','咸','籍','赖','卓','蔺','屠','蒙','池','乔','阴','鬱','胥','能','苍','双','闻','莘','党','翟','谭','贡','劳','逄','姬','申','扶','堵','冉','宰','郦','雍','却','璩','桑','桂','濮','牛','寿','通','边','扈','燕','冀','郏','浦','尚','农','温','别','庄','晏','柴','瞿','阎','充','慕','连','茹','习','宦','艾','鱼','容','向','古','易','慎','戈','廖','庾','终','暨','居','衡','步','都','耿','满','弘','匡','国','文','寇','广','禄','阙','东','欧','殳','沃','利','蔚','越','夔','隆','师','巩','厍','聂','晁','勾','敖','融','冷','訾','辛','阚','那','简','饶','空','曾','毋','沙','乜','养','鞠','须','丰','巢','关','蒯','相','查','后','荆','红','游','竺','权','逯','盖','益','桓','公']

const MALE_NAMES = ['伟','强','磊','军','洋','勇','杰','涛','超','明','辉','刚','平','鹏','飞','波','宇','浩','鑫','俊','峰','建军','志伟','建国','国强','浩然','子轩','梓豪','宇轩','俊杰','博文','天佑','皓轩','昊然','明轩','雨泽','烨磊','晟睿','天佑','文昊','修洁','黎昕','远航','旭尧','鸿涛','伟祺','荣轩','越泽','浩宇','瑾瑜','皓轩','擎苍','擎宇','志泽','子杰','睿渊','弘文','哲瀚','雨泽','楷瑞','建辉','晋鹏','天磊','绍辉','泽洋','明辉','伟诚','明轩','健柏','修杰','志泽','弘文','峻熙','嘉懿','煜城','懿轩','烨伟','苑博','伟泽','熠彤','鸿煊','博涛','烨霖','烨华','煜祺','智宸','正豪','昊然','明杰','立诚','立轩','立辉','峻熙','弘文','熠彤','鸿煊','烨霖','哲瀚','鑫鹏','昊天','思聪','展鹏','笑愚','志强','炫明','雪松','思源','智渊','思淼','晓啸','天宇','浩然','文轩','鹭洋','振家','乐驹','晓博','文博','昊焱','立果','金鑫','锦程','嘉熙','鹏飞','子默','思远','浩轩','语堂','聪健']

const FEMALE_NAMES = ['娜','敏','静','丽','婷','雪','颖','艳','慧','娟','秀英','桂英','秀兰','霞','燕','玲','红','梅','莉','洁','云','倩','璐','茜','欣怡','梓涵','诗涵','梓萱','子涵','雨涵','语桐','梦瑶','若曦','可馨','雨萱','诗琪','佳怡','梦洁','婧琪','雅琳','美莲','欢馨','优璇','雨嘉','明美','可馨','惠茜','漫妮','香茹','月婵','嫦曦','静香','梦洁','凌薇','美莲','雅静','雪丽','依娜','雅芙','雨婷','怡香','珺瑶','梦瑶','婉婷','睿婕','雅琳','静琪','彦妮','馨蕊','雪雁','煜婷','笑怡','优璇','雨嘉','娅楠','明美','可馨','惠茜','漫妮','香茹','月婵','嫦曦','静香','桑榆','倩雪','香怡','灵芸','倩雪','玉珍','茹雪','正梅','美琳','欢馨','优璇','雨嘉','娅楠','明美','可馨','惠茜','漫妮','香茹','月婵','嫦曦','静香','梦洁','凌薇','美莲','雅静','雪丽','依娜','雅芙','雨婷','怡香','珺瑶','梦瑶','婉婷','睿婕','雅琳','静琪','彦妮','馨蕊','雪雁','煜婷','笑怡','优璇','雨嘉','梦璐','白凡','乐菱','惜文','香寒','新柔','语蓉','海安','夜蓉','涵柏','水桃','醉蓝','春儿','语琴','从彤','傲晴','语兰','又菱','碧彤','元霜','怜梦','紫寒','妙彤','曼易','南莲','紫翠','雨寒','易烟','如萱','若南','寻真','晓亦','向珊','慕灵','以蕊','寻雁','映易','雪柳','孤岚','笑霜','海云','凝天','沛珊','寒云','冰旋','宛儿','绿真','盼儿','晓霜','碧凡','夏菡','曼香','若烟','半梦','雅绿','冰蓝','灵槐','平安','书翠','翠风','香巧','代云','梦曼','幼翠','友巧','听寒','梦柏','醉易','访旋','亦玉','凌萱','访卉','怀亦','笑蓝','春翠','靖柏','夜蕾','冰夏','梦松','书雪','乐枫','念薇','靖雁','寻春','恨山','从寒','忆香','觅波','静曼','凡旋','以亦','念露','芷蕾','千兰','新波','代真','新蕾','雁玉','冷卉','紫山','千琴','恨天','傲芙','盼山','怀蝶','冰兰','山柏','翠萱','恨松','问旋','从南','白易','问筠','如霜','半芹','丹珍','冰彤','亦寒','寒雁','怜云','寻文','乐丹','翠柔','谷山','之瑶','冰露','尔珍','谷雪','乐萱','涵菡','海莲','傲蕾','青槐','冬儿','易梦','惜雪','宛海','之柔','夏青','亦瑶','妙菡','春竹','痴梦','紫蓝','晓巧','幻柏','元风','冰枫','访蕊','南春','芷蕊','凡蕾','凡柔','安蕾','天荷','含玉','书兰','雅琴','书瑶','春雁','从安','夏槐','念芹','怀萍','代曼','幻珊','谷丝','秋翠','白晴','海露','代荷','含玉','书蕾','听白','访琴','灵雁','秋春','雪青','乐瑶','含烟','涵双','平蝶','雅蕊','傲之','灵薇','绿春','含蕾','从梦','从蓉','初丹','听兰','听蓉','语芙','夏彤','凌瑶','忆翠','幻灵','怜菡','紫南','依珊','妙竹','访烟','怜蕾','映寒','友绿','冰萍','惜霜','凌香','芷蕾','雁卉','迎梦','元柏','代萱','紫真','千青','凌寒','紫安','寒安','怀蕊','秋荷','涵雁','以山','凡梅','盼曼','翠彤','谷冬','新巧','冷安','千萍','冰烟','雅阳','友绿','南松','诗云','飞风','寄灵','书芹','幼蓉','以蓝','笑寒','忆寒','秋烟','芷巧','水香','映之','醉波','幻莲','夜山','芷卉','向彤','小玉','幼南','凡梦','尔曼','念波','迎松','青寒','笑天','涵蕾','碧菡','映秋','盼烟','忆山','以寒','香寒','小凡','代亦','梦露','映波','友蕊','寄凡','怜蕾','雁枫','水绿','曼荷','笑珊','寒珊','谷南','慕儿','夏岚','友儿','小萱','紫青','妙菱','冬寒','曼柔','语蝶','青筠','夜安','觅海','问安','晓槐','雅山','访云','翠容','寒凡','晓绿','以菱','冬云','含玉','访枫','含卉','夜白','冷安','灵竹','醉薇','元珊','幻桃','觅翠','凡灵','乐珍','寄真','秋荷','雅彤','之槐','听筠','寄蓉','慕卉','静竹','寒松','凌雪','忆翠','幻梅','凌珍','沛文','紫槐','幻柏','采文','雪旋','新之','忆香','香蝶','觅翠','寒凝','寻琴','问夏','元冬','天春','含巧','平春','痴旋','秋蝶','丹亦','谷翠','醉柳','迎夏','幻莲','芷卉','凡双','怜阳','雨安','夜蓉','涵柏','水桃','醉蓝','语琴','从彤','傲晴','语兰','又菱','碧彤','元霜','怜梦','紫寒','妙彤','曼易','南莲','紫翠','雨寒','易烟','如萱','若南','寻真']

function randomChineseName(gender) {
  const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)]
  const pool = gender === '女' ? FEMALE_NAMES : MALE_NAMES
  const given = pool[Math.floor(Math.random() * pool.length)]
  return surname + given
}
```

#### 3.3.2 改造 `generateAudienceVoteForRound`

** what：**
- 先查询该轮是否已有 `AudienceMember`，如果有则复用，不再新建。
- 如果没有，则新建 1000 人并写入 `name`。
- `clearAudienceVote()` 增加可选参数 `includeMembers`：在个人喜爱度“重新生成”时，默认不清空成员（因为成员已在公演结算时生成）；只有明确重置整轮投票时才清空成员和团队票。

** why：** 保证同一轮里团队票和个人喜爱度票共用同一批 1000 人。

修改后的核心逻辑：
```js
async function generateAudienceVoteForRound(round, { reuseMembers = true } = {}) {
  // ...前置查询不变...

  let members = reuseMembers ? await AudienceMember.find({ roundId: round.id }) : []

  if (members.length === 0) {
    const newMembers = []
    for (let i = 1; i <= AUDIENCE_COUNT; i++) {
      const age = randomAge()
      const gender = randomGender()
      newMembers.push({
        id: generateId(),
        roundId: round.id,
        seatNumber: i,
        name: randomChineseName(gender),
        gender,
        age,
        occupation: randomOccupation(age)
      })
    }
    members = await AudienceMember.insertMany(newMembers)
  }

  // 清除旧的个人喜爱度票（保留成员）
  await AudienceVote.deleteMany({ roundId: round.id })

  // ...后续按权重抽样投 3 票逻辑不变...
}
```

#### 3.3.3 新增/调整清空函数

```js
async function clearAudienceVote(roundId, includeMembers = false) {
  const targets = [AudienceVoteSession.deleteMany({ roundId }), AudienceVote.deleteMany({ roundId })]
  if (includeMembers) {
    targets.push(AudienceMember.deleteMany({ roundId }))
    targets.push(AudienceTeamVote.deleteMany({ roundId }))
  }
  await Promise.all(targets)
}
```

### 3.4 公演结算路由改造：先创建评审，再逐人投团队票

**文件：** `backend/src/routes/performance.js`

#### 3.4.1 引入依赖

顶部新增：
```js
const AudienceMember = require('../models/AudienceMember')
const AudienceTeamVote = require('../models/AudienceTeamVote')
```

#### 3.4.2 替换 `simulateAudienceVotes`

原函数（概率模拟）改造为基于真实评审列表投票：

```js
async function simulateAudienceVotesForTeams(roundId, teamsData, totalAudience = 1000) {
  // 1. 先清空旧团队票，再生成/复用 1000 位评审
  await AudienceTeamVote.deleteMany({ roundId })
  let members = await AudienceMember.find({ roundId })

  if (members.length === 0) {
    const newMembers = []
    for (let i = 1; i <= totalAudience; i++) {
      const age = randomAge()
      const gender = randomGender()
      newMembers.push({
        id: generateId(),
        roundId,
        seatNumber: i,
        name: randomChineseName(gender),
        gender,
        age,
        occupation: randomOccupation(age)
      })
    }
    members = await AudienceMember.insertMany(newMembers)
  }

  // 2. 逐队逐人模拟 yes/no
  const results = []
  for (const team of teamsData) {
    const appeal = team.teamScore + team.teamCharm * 0.5
    let yesRate = appeal / 150
    yesRate = Math.max(0.05, Math.min(0.95, yesRate))
    yesRate += (team.eventVotes || 0) / totalAudience
    yesRate = Math.max(0.05, Math.min(0.95, yesRate))

    const teamVotes = []
    let finalVotes = 0
    for (const m of members) {
      const votedYes = Math.random() < yesRate
      if (votedYes) finalVotes++
      teamVotes.push({
        id: generateId(),
        roundId,
        audienceId: m.id,
        seatNumber: m.seatNumber,
        teamId: team.teamId,
        teamName: team.teamName,
        votedYes,
        createdAt: new Date().toISOString()
      })
    }
    await AudienceTeamVote.insertMany(teamVotes)
    results.push({ teamId: team.teamId, finalVotes, yesRate })
  }

  return results
}
```

#### 3.4.3 修改 `POST /api/performance/calculate`

在“计算完所有队伍 `teamScore`/`teamCharm`/`eventVotes`”之后、保存 `TeamPerformance` 之前：

1. 组装 `teamsData` 数组（含 `teamId / teamName / teamScore / teamCharm / eventVotes`）。
2. 调用 `simulateAudienceVotesForTeams(dbRoundId, teamsData, 1000)` 得到每队 `finalVotes` 和 `yesRate`。
3. 回写到各队伍的 `teamResults` 中（替换原 `simulateAudienceVotes` 的返回值）。
4. 保存 `TeamPerformance` 时 `finalVotes` 来自真实计数。
5. 删除旧 `AudienceVote` / `AudienceVoteSession`，但**保留**刚生成的 `AudienceMember`，供后续个人喜爱度复用。
6. 调用 `generateAudienceVoteForRound(round, { reuseMembers: true })` 生成个人喜爱度投票。

注意：结算时如果重新计算，需要**同时清空旧的团队票 + 个人喜爱度票 + 成员**（因为团队票依赖成员，成员档案改变后团队票必须重算）。因此在 `TeamPerformance.deleteMany` 之后追加：
```js
await AudienceMember.deleteMany({ roundId: { $in: [dbRoundId, frontRoundId] } })
await AudienceTeamVote.deleteMany({ roundId: { $in: [dbRoundId, frontRoundId] } })
await clearAudienceVote(dbRoundId, false)   // 不清成员，因为上面已经清空了
await clearAudienceVote(frontRoundId, false)
```

### 3.5 个人喜爱度路由增强：返回姓名和舞台 yes 票

**文件：** `backend/src/routes/audienceVote.js`

#### 3.5.1 `/seats` 与 `/player-seats`

座位对象增加 `name`：
```js
seats.push({
  id: `seat-${i}`,
  seatNumber: i,
  voted: !!m,
  name: m ? m.name : null,
  gender: m ? m.gender : null,
  age: m ? m.age : null,
  occupation: m ? m.occupation : null
})
```

#### 3.5.2 `/seat/:seatNumber` 与 `/player-seat/:seatNumber`

查询该评审对所有舞台的 yes 票：
```js
const teamVotes = await AudienceTeamVote.find({ roundId: round.id, audienceId: member.id, votedYes: true })
const teamVoteList = teamVotes.map(tv => ({ teamId: tv.teamId, teamName: tv.teamName }))
```

返回结构增加：
```js
detail: {
  seatNumber,
  name: member.name || null,
  gender: member.gender || null,
  age: member.age || null,
  occupation: member.occupation || null,
  teamVotes: teamVoteList,   // 该评审投 yes 的舞台列表
  votes: [ /* 个人喜爱度 3 票，保持原结构 */ ]
}
```

### 3.6 前端类型更新

**文件：** `frontend/src/types/performance.ts`

- `AudienceMember` / `AudienceSeat` 增加 `name?: string | null`
- `AudienceVoteDetail` 增加 `name?: string | null` 和 `teamVotes?: { teamId: string; teamName: string }[]`

### 3.7 前端 UI 更新

**文件：** `frontend/src/views/admin/AudienceVoteView.vue`

1. 评审席 tooltip 显示姓名：
   ```
   {{ seat.seatNumber }}号评审 · {{ seat.name }}
   {{ seat.gender }} · {{ seat.age }}岁 · {{ seat.occupation }}
   ```
2. 详情弹窗“评审档案”区域显示姓名标签：
   ```
   <span class="profile-tag name">{{ store.selectedAudienceDetail.name }}</span>
   ```
3. 新增“舞台 yes 票”展示区域：
   - 如果 `teamVotes` 有数据，列出“为 XX、YY 舞台投送 yes”。
   - 如果没有（例如老数据），显示“暂无舞台投票记录”。

### 3.8 性能与一致性兜底

- 在 `audienceVoteService.js` 的 `generateAudienceVoteForRound` 开头断言：`AudienceMember` 必须已存在。不存在时抛出明确错误“请先完成公演结算以生成大众评审”。
- `performance.js` 结算完成后，如果 `generateAudienceVoteForRound` 失败，记录 error 但不阻塞结算返回（保持现有行为）。

## 4. Assumptions & Decisions

| 决策点 | 选择 | 原因 |
|--------|------|------|
| 评审生成时机 | 公演结算时生成 | 用户明确选择；团队票需要成员实体，先生成成员再投个人票最自然 |
| 团队票存储 | 新建 `AudienceTeamVote` 集合 | 与个人喜爱度 `AudienceVote` 解耦，避免字段含义混乱 |
| 姓名风格 | 中文姓名，按性别分男女名库 | 用户明确选择；符合乘风2026中文语境 |
| 重算策略 | 重新结算时清空成员+团队票+个人票，重新生成 | 保证团队票与个人票始终一一对应，避免脏数据 |
| 个人喜爱度复用 | `generateAudienceVoteForRound` 遇到已有成员直接复用 | 不破坏原有接口签名，仅内部逻辑调整 |
| 查询舞台 yes 票 | 只返回投了 yes 的舞台列表 | 满足用户“查询到这名大众评审为哪些舞台投送了 yes 票数” |

## 5. Verification Steps

1. **数据生成验证**
   - 调用 `POST /api/performance/calculate` 结算一轮。
   - 检查数据库 `AudienceMember` 有 1000 条记录，每条含 `name`、`gender`、`age`、`occupation`，且 `name` 性别符合 `gender`。
   - 检查 `AudienceTeamVote` 有 `1000 × 队伍数` 条记录，`votedYes` 分布合理。

2. **票数一致性验证**
   - 取某队伍 `TeamPerformance.finalVotes`，与 `AudienceTeamVote.count({ roundId, teamId, votedYes: true })` 对比，应完全相等。
   - 调用 `POST /api/admin/audience-vote/generate` 生成个人喜爱度。
   - 检查 `AudienceMember` 数量仍为 1000，没有新增或删除。

3. **接口查询验证**
   - 调用 `GET /api/admin/audience-vote/seat/:seatNumber`。
   - 返回应包含 `name`、`teamVotes`（列出该评审投 yes 的舞台）。
   - 调用 `GET /api/audience-vote/player-seat/:seatNumber` 同样返回姓名和舞台 yes 票。

4. **前端验证**
   - 打开管理员“大众评审投票”页面，评审席 tooltip 显示姓名。
   - 点击某个座位，详情弹窗显示姓名和“舞台 yes 票”列表。

5. **重算验证**
   - 重新调用 `POST /api/performance/calculate`。
   - 检查 `AudienceTeamVote` 和 `AudienceVote` 被清空重算，`AudienceMember` 重新生成（ID 变化，姓名可能变化）。
