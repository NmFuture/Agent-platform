# 宁梦未来企业 Agent 基座

这是宁梦未来科技的企业 AgentOS 本机实现，用于把 `FutureTech Runtime + FutureTech Skill` 产品化成可配置、可执行、可追踪的企业智能体工作台。

当前版本已经具备本机闭环：完整嵌入 FutureTech Runtime Console，读取 Skill registry，保存 Agent 身份配置，并能创建 Run 交给后端执行。

## 一句话定位

AgentOS 是企业智能体基座：

- 普通用户通过业务 Agent 完成合同提取等端到端任务。
- 高级用户通过通用 Agent 进入完整 FutureTech Console。
- 管理员通过 Skill、Agent、Runtime、Security 页面管理能力、身份和边界。

## 已实现能力

| 能力 | 当前状态 |
| --- | --- |
| 完整 Console 嵌入 | `5175` 反向代理到 `4096`，保留会话、文件、终端、事件流、Skill、MCP、项目上下文 |
| Skill registry | 技能市场从 FutureTech Runtime `/skill` 读取 Skill，并支持搜索和分类 |
| Agent 身份 | 定制中心可从 Skill 生成 Agent 蓝图，保存名称、身份提示词、输入输出、绑定 Skill、发布模式 |
| Run 执行 | Agent 市场和定制中心会创建本地 Run；合同提取智能体可输入 PDF 并输出 Excel |
| 运行追踪 | 展示步骤、Runtime 事件摘要、产物路径、退出码和审计事件 |
| Runtime 管理 | 设置页展示服务健康、模型、会话数、Skill 数和完整代理状态 |
| Security 管理 | 设置页展示 Console 权限、Agent Skill 白名单、人工确认、品牌边界 |

## 页面入口

| 页面 | 用途 |
| --- | --- |
| 仪表盘 | 平台入口、推荐 Agent、能力概览 |
| 通用 Agent | 嵌入完整 FutureTech Console，适合复杂自由任务 |
| Agent 市场 | 选择业务 Agent，并启动任务 |
| 技能市场 | 按分类和关键词查找 Runtime 已加载的 Skill |
| 定制中心 | 从 Skill 生成 Agent 蓝图，配置身份、提示词、输入输出和测试运行 |
| 设置 | 模型网关、Runtime 状态、安全策略和平台信息 |

## 本地运行

```bash
npm install
npm run start
```

一键启动会拉起三个服务：

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| AgentOS Web | `http://localhost:5174/` | 主平台前端 |
| FutureTech Console Proxy | `http://localhost:5175/` | 完整 Console 反向代理 |
| FutureTech Runtime | `http://127.0.0.1:4096/` | 本机执行内核 |

常用命令：

```bash
npm run start
npm run stop
npm run restart
npm run status
npm run build
```

也可以直接使用脚本：

```bash
./start.sh
./stop.sh
./restart.sh
./scripts/demo.sh status
```

## 状态文件

运行态文件都写入 `.runtime/`，默认不提交：

```text
.runtime/services.json              # 三个服务的 PID / 端口状态
.runtime/agentos-state.json         # Agent、Run、安全策略、审计事件
.runtime/agentos-runs/*.jsonl       # 每次运行的事件日志
```

## 最小验收

```bash
npm run build
npm run status
curl -sS http://127.0.0.1:5175/global/health
curl -sS http://127.0.0.1:5174/futuretech-admin/runtime-status
```

期望结果：

- `npm run build` 成功。
- `npm run status` 显示 Runtime、Console Proxy、Web 都是 `healthy`。
- `5175/global/health` 返回 `200`，不是跳转。
- `runtime-status` 中 `fullConsoleProxy` 为 `true`。

## 文档入口

- [docs/README.md](./docs/README.md)：文档索引。
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)：架构、数据模型和执行链路。
- [docs/futuretech-skill-integration.md](./docs/futuretech-skill-integration.md)：接口和接入说明。
- [docs/RUNBOOK.md](./docs/RUNBOOK.md)：启动、验证、故障排查。
- [docs/CHANGELOG.md](./docs/CHANGELOG.md)：阶段变更记录。

## 品牌边界

AgentOS 外壳界面和甲方文档只展示：

- FutureTech
- FutureTech Runtime
- FutureTech Skill
- AgentOS

完整 Console 采用透明嵌入，优先保留 Runtime 原生能力，不通过代理改写它的 HTML、JavaScript、JSON、SSE 或 WebSocket 内容。内部配置和脚本可以保留实现细节，通过 AgentOS 外壳文案做品牌隔离。
