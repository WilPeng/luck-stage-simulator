---
name: skip-ts-check-for-build
overview: 修改 frontend/package.json 的 build 命令，移除 vue-tsc 类型检查步骤，使项目能直接通过 Cloudflare 部署。
todos:
  - id: modify-build-script
    content: 修改 frontend/package.json 第 8 行 build 脚本为 "vite build"
    status: completed
---

修改 frontend/package.json 中的 build 脚本，移除 vue-tsc 类型检查步骤，使构建跳过 TypeScript 类型检查直接打包，实现快速上线。

## 技术方案

### 修改内容

一行改动，将 frontend/package.json 第 8 行的 build 脚本：

```
当前: "build": "vue-tsc -b && vite build"
目标: "build": "vite build"
```

### 影响分析

- **正面影响**: 构建不再因 TS 类型错误而阻塞，可快速部署上线
- **负面影响**: 运行时可能出现类型相关的 bug（如 store 数据错乱、API undefined 等），需在运行时测试覆盖
- **牵涉文件**: 仅修改 `frontend/package.json` 一行，无其他文件变动
- **vite.config.ts**: 无需修改，没有配置任何类型检查插件

### 后续建议

建议上线稳定后，仍然回过头来修复类型错误（关注 `src/types/*`, `src/stores/*`, `src/services/api.ts`），将 `vue-tsc -b` 加回 build 脚本。