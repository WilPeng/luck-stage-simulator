# 乘风2026歌曲库性别分类改造计划

## 1. 摘要

在乘风2026（`shengfeng2026`）的歌曲库中引入**歌手性别**维度：
- 后端歌曲模型增加 `singerGender` 字段。
- `backend/src/data/songLibrary.json` 中每首歌曲增加 `gender: 'male' | 'female'`（人工按歌手资料标注，当前曲库以中文歌为主，目标保持中文歌占比 ≥ 90%）。
- 后台“歌曲库管理”页面新增两个按钮：**添加一首男歌手歌曲**、**添加一首女歌手歌曲**，点击后从对应性别子库中随机抽取一首并自动生成属性。
- 同时新增性别筛选、列表性别列、新增/编辑/批量导入表单的性别字段。

## 2. 现状分析

已阅读的关键文件：

- 后端歌曲模型：`backend/src/models/Song.js` — 当前字段没有歌手性别。
- 后端歌曲路由：`backend/src/routes/songs.js` — `/random` 从 `backend/src/data/songLibrary.json` 全量随机抽取；`GET /`、`POST /`、`POST /batch`、`PUT /:id` 均未处理性别。
- 随机属性生成器：`backend/src/utils/randomSong.js` — 只负责生成游戏属性，不关心歌曲来源性别。
- 曲库数据源：`backend/src/data/songLibrary.json` — 共 1877 条，每条 `{ title, artist }`，无性别字段，全部为中文歌。
- 前端类型：`frontend/src/types/song.ts` — `Song` 接口无 `singerGender`。
- 前端服务：`frontend/src/services/api.ts` — `randomSong()` 无性别参数；`createSong`/`updateSong`/`batchCreateSongs` 类型未包含性别。
- 歌曲库管理页：`frontend/src/views/admin/AdminSongManageView.vue` — 当前只有“随机产生歌曲”“批量导入”“新增歌曲”三个按钮，筛选栏无性别，表格无性别列，表单无性别字段。

问题点：
1. 数据层缺少性别字段。
2. 随机接口无法按性别抽取。
3. 前端没有按性别添加/筛选/展示的入口。

## 3. 改造方案

### 3.1 曲库数据整理（`backend/src/data/songLibrary.json`）

- 读取全部 1877 条记录，提取唯一歌手列表。
- 根据公开资料为每位歌手标注性别：
  - 男歌手 → `gender: "male"`
  - 女歌手 → `gender: "female"`
  - 对于组合/男女对唱，以主唱或作品主要演绎性别为准，统一归入 `male` 或 `female`（优先保证只有两类，与按钮对应）。
- 将 `gender` 字段写入每条记录。
- 统计中文歌比例：当前数据均为中文，预计不需要额外调整；若出现非中文条目，确保中文占比 ≥ 90%，不足时补充中文歌曲。

### 3.2 后端模型与接口改造

#### 3.2.1 `backend/src/models/Song.js`

在构造函数中新增字段：
```js
this.singerGender = data.singerGender || '' // 'male' | 'female'
```
`toObject()` 无需特殊处理，继承展开即可。

#### 3.2.2 `backend/src/routes/songs.js`

1. **GET /** 列表接口
   - 读取 `req.query.singerGender`，支持按 `male`/`female` 过滤。
   - 返回数据中保留 `singerGender` 字段。

2. **POST /** 新增接口
   - 从 `req.body` 读取 `singerGender`，存入新歌曲。
   - 为空时默认 `'male'` 或保持空字符串（建议默认空，不强制）。

3. **POST /batch** 批量导入
   - 读取每条 `item.singerGender` 并保存。

4. **PUT /:id** 更新接口
   - 在允许更新的字段列表中加入 `'singerGender'`。

5. **GET /random** 随机产生歌曲
   - 读取 `req.query.gender`（`male`/`female`）。
   - 过滤 `songLibrary` 为对应性别子数组后随机抽取。
   - 生成的歌曲 `singerGender` 与曲库条目一致。
   - 若该性别子数组为空，返回 400/500 提示“无对应性别歌曲”。

#### 3.2.3 初始种子数据（可选）

`backend/src/index.js` 中初始化默认歌曲时，为每条硬编码歌曲补充 `singerGender`。

### 3.3 前端类型与服务改造

#### 3.3.1 `frontend/src/types/song.ts`

`Song` 接口增加：
```ts
singerGender?: 'male' | 'female'
```

#### 3.3.2 `frontend/src/services/api.ts`

- `getSongs(params)` 增加 `singerGender?: string` 参数并拼入 query。
- `createSong` / `updateSong` / `batchCreateSongs` 参数类型中允许 `singerGender`。
- `randomSong(gender?: 'male' | 'female')` 改为调用 `/songs/random?gender=${gender}`。

### 3.4 前端页面改造（`frontend/src/views/admin/AdminSongManageView.vue`）

1. **头部按钮**
   - 保留“批量导入”“新增歌曲”。
   - 将原来的“随机产生歌曲”拆分为两个按钮：
     - `随机添加男歌手歌曲`（蓝色/主色）
     - `随机添加女歌手歌曲`（粉色/辅色）
   - 点击后调用 `randomSong('male')` / `randomSong('female')`，成功提示并刷新列表。

2. **筛选栏**
   - 新增“歌手性别”下拉框：全部 / 男歌手 / 女歌手。
   - 选择后 `loadSongs()` 传入 `singerGender`。

3. **表格列**
   - 新增“歌手性别”列，显示标签：男歌手 / 女歌手。

4. **新增/编辑弹窗表单**
   - 新增“歌手性别”选择：`t-radio-group` 或 `t-select`，选项 `male`/`female`。
   - 校验：可选，不强制。

5. **批量导入弹窗**
   - 每行批量表单增加“歌手性别”选择框。

### 3.5 Mock 数据（`frontend/src/mock/mockSongs.ts`）

- 为现有 mock 歌曲补充 `singerGender` 字段，确保本地无后端时类型不报错。

## 4. 假设与决策

- **性别来源**：以 `backend/src/data/songLibrary.json` 中的 `artist` 为准，按歌手实际性别人工标注；不依赖自动推断规则。
- **组合/对唱处理**：统一归入男歌手或女歌手（按主唱或最常见演唱性别），不引入 `mixed` 类型，保证与页面两个按钮一一对应。
- **中文歌占比**：现有曲库全部为中文，改造后默认满足 ≥ 90%；若未来补充非中文歌曲，再单独审计。
- **按钮行为**：点击“添加男/女歌手歌曲”立即随机生成并保存一首，不弹窗。
- **默认值**：新增歌曲时 `singerGender` 默认为空，管理员可手动选择；随机生成时由曲库决定。

## 5. 验证步骤

1. 启动后端 `npm run dev`（端口 3000）和前端 `npm run dev`（端口 5173）。
2. 登录管理员，进入“歌曲库管理”。
3. 点击“随机添加男歌手歌曲”→ 列表新增一首歌曲，且 `歌手性别` 列为男歌手。
4. 点击“随机添加女歌手歌曲”→ 列表新增一首歌曲，且 `歌手性别` 列为女歌手。
5. 使用筛选栏“歌手性别”分别选男/女，列表正确过滤。
6. 点击“新增歌曲”，填写信息并选择性别，保存后列表展示正确。
7. 编辑一首歌曲，切换性别，保存后生效。
8. 批量导入 2-3 首带性别的歌曲，保存后列表展示正确。
9. 运行 `npm run build`（前端）无 TypeScript/构建错误。
