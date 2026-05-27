# simonDbCat 🐬

一个基于 Vue 3 的数据库管理桌面工具，支持 MySQL 数据库的连接管理、表浏览和 SQL 查询。

## 技术栈

- **前端**: Vue 3 + TypeScript + Vite + Element Plus + Pinia
- **后端**: Express + mysql2
- **配置存储**: SQLite (better-sqlite3)
- **桌面端**: Electron + electron-builder

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发模式（前端 + 后端）
npm run dev

# 分别启动
npm run dev:client   # 前端 http://localhost:3000
npm run dev:server   # 后端 http://localhost:3100
```

## 功能

- **连接管理** — 新增/编辑/删除/测试 MySQL 数据库连接，配置持久化本地
- **数据面板** — 查看数据库列表、数据表结构、表数据预览
- **SQL 查询** — 自由编写 SQL，支持选择数据库、查询历史
- **表详情** — 查看表字段结构，预览前 200 行数据

## 桌面端

```bash
# 开发模式（Electron 窗口 + 热更新）
npm run electron:dev

# 打包桌面应用
npm run build          # 先构建前端
npx electron-builder   # 再打包

# 或一键发布（构建 + 打包 + GitHub Release）
npm run release
```

桌面端打包产物位于 `release/` 目录，支持 macOS (DMG/ZIP)、Windows (NSIS/portable)、Linux (AppImage/deb)。

## 发布

```bash
# 前置条件
gh auth login

# 完整流程：构建 → 打包 → Tag → GitHub Release
npm run release

# 仅用已有产物创建 Release
npm run release:upload
```

## 项目结构

```
simonDbCat/
├── electron/
│   └── main.cjs          # Electron 主进程
├── server/
│   ├── index.cjs         # Express API 服务
│   ├── connections.cjs   # 连接配置 CRUD
│   └── database.cjs      # 本地 SQLite 配置库
├── src/
│   ├── api/              # API 客户端
│   ├── router/           # Vue Router
│   ├── stores/           # Pinia 状态管理
│   ├── types/            # TypeScript 类型
│   └── views/            # 页面组件
├── scripts/
│   └── release.sh        # 发布脚本
└── package.json
```
