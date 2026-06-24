---
name: player-mobile-compatibility
overview: 完善选手端所有页面的移动端兼容性，包括：PlayerCaptainView、PlayerTeamView的全面移动适配，以及其他页面的微小改进。
todos:
  - id: captain-mobile
    content: 为 PlayerCaptainView.vue 添加移动端 CSS：缩小 padding、白色背景改为深色、优化结果条目布局
    status: completed
  - id: team-mobile
    content: 为 PlayerTeamView.vue 添加移动端 CSS：优化按钮组和邀请卡片布局、缩小 padding
    status: completed
  - id: performance-mobile
    content: 修复 PlayerPerformanceView.vue 的 min-height 与底部 tab 栏重叠问题
    status: completed
  - id: history-mobile
    content: 修复 PlayerHistoryView.vue 的 min-height 重叠并优化超小屏显示
    status: completed
---

## 移动端兼容现状

已有移动端适配（无需修改）：

- PlayerHomeView.vue / PlayerProfileView.vue - mobile-first 设计
- PlayerEliminationView.vue - 已有 @media(max-width: 768px)
- PlayerPlaceholderView.vue - 简单居中布局
- PlayerSongSelectionView.vue - 响应式 grid
- PlayerTrainingView.vue - 属性面板 @media(max-width: 600px)
- ChatView.vue - 已有 @media(max-width: 768px)

需要修复的页面：

1. PlayerCaptainView.vue - 无 media queries；padding:24px 窄屏过窄；白色背景在深色主题中突兀；min-width 导致溢出
2. PlayerTeamView.vue - 无 media queries；按钮组在窄屏换行异常；invite-card 布局挤压
3. PlayerPerformanceView.vue - min-height:100vh 与底部 tab 栏重叠
4. PlayerHistoryView.vue - 同上 min-height 重叠，超小屏可优化

## 技术方案

### 实现思路

每个文件按统一策略处理：

1. **添加移动端 media queries**：对无 responsive CSS 的页面添加 @media (max-width: 768px)
2. **修复 min-height 重叠**：将 min-height:100vh 改为 calc(100vh - 56px) 消除底部 tab 栏遮挡
3. **颜色主题统一**：将纯白色背景改为半透明暗色背景，与 PlayerLayout 深色主题一致
4. **窄屏布局优化**：缩小 padding、调整 flex-wrap、控制溢出、缩小字号

### 具体方案

#### PlayerCaptainView.vue

- padding: 24px -> 16px
- candidate-card 白色背景 + 文字颜色改为深色半透明风格
- result-name 去除 min-width:100px，允许 flex 压缩
- vote-button 水平 padding 缩小
- info-icon 缩小

#### PlayerTeamView.vue

- padding: 24px -> 16px
- team-card-header 改为 flex-wrap wrap
- invite-card 改为 flex-direction:column，按钮组放底部
- player-row 中按钮换行保护
- team-overview-name 添加 text-overflow

#### PlayerPerformanceView.vue

- 添加 padding-bottom: 72px 在 main 容器
- 结果展示区添加底部间距

#### PlayerHistoryView.vue

- min-height:100vh -> 自适应
- @media(max-width: 480px) 缩小标题和内边距

### 注意事项

- 不改动已有 @media 的页面
- 不改动 template 和 script 逻辑
- 所有改动集中在 style 区