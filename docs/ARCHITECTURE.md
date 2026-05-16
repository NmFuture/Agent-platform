# AgentOS 架构

本文说明当前本机实现如何工作，以及后续替换企业后端时应保留的边界。

## 总体结构

```text
浏览器
  -> AgentOS Web (5174)
      -> /futuretech-admin/* 本机平台 API
      -> iframe http://localhost:5175/ 完整 Console

FutureTech Console Proxy (5175)
  -> 管理 AgentOS 本地状态
  -> 反向代理 FutureTech Runtime
  -> 透明转发完整 Console

FutureTech Runtime (4096)
  -> 会话 / 文件 / 终端 / Skill / MCP / 事件流
  -> 执行 Agent Run
```

## 服务职责

| 服务 | 文件 | 职责 |
| --- | --- | --- |
| AgentOS Web | `src/App.jsx` | 页面、Agent 配置、Run 追踪、Runtime/Security 设置 |
| 前端契约 | `src/api/futureTechSkillAdapter.js` | 前端使用的本机接口清单 |
| Console Proxy | `server/futuretechConsoleProxy.mjs` | 反向代理、Admin API、状态持久化、Run 执行 |
| 服务管理 | `scripts/manage-demo.mjs` | 启动、停止、重启、状态检查 |

## 数据模型

本机状态文件：`.runtime/agentos-state.json`。

| 对象 | 关键字段 | 说明 |
| --- | --- | --- |
| Agent | `id`, `name`, `rolePrompt`, `skills`, `knowledgeBases`, `permissions`, `outputPolicy` | 有身份和边界的业务智能体 |
| Skill | `id`, `name`, `description`, `version`, `sourceRoot`, `path` | 从 Runtime `/skill` 读取 |
| Run | `id`, `agentId`, `status`, `steps`, `events`, `artifacts`, `exitCode` | 一次任务执行 |
| Artifact | `type`, `name`, `path` | 当前主要是 Runtime JSONL 日志 |
| AuditEvent | `time`, `user`, `action`, `target` | 保存关键管理和运行事件 |
| SecurityPolicy | `runtimeConsole`, `defaultRunMode`, `rules` | 控制 Console 完整能力和业务 Agent 边界 |

## 执行链路

```text
用户点击运行
  -> POST /futuretech-admin/agent-runs
  -> 读取 Agent 身份和 Skill 白名单
  -> 生成 Runtime prompt
  -> 调用 FutureTech Runtime 执行
  -> 写入 .runtime/agentos-runs/<run-id>.jsonl
  -> 更新 .runtime/agentos-state.json
  -> 前端轮询 GET /futuretech-admin/agent-runs/:id
  -> 展示步骤、事件摘要、产物和退出码
```

## Console 嵌入原则

通用 Agent 不是弱化聊天框，而是完整 FutureTech Console：

- iframe 地址必须走 `http://localhost:5175/`。
- `5175` 必须透明转发 Runtime 静态资源、API、SSE 和 WebSocket。
- 不得切断文件、终端、Skill、MCP、项目上下文和会话能力。
- 不得为品牌展示改写 Console 的 HTML、JavaScript、JSON、SSE 或 WebSocket 内容。
- 品牌隔离只做在 AgentOS 外壳页面和平台文档，不动完整 Console 协议。
- 前端展示 Skill registry 时不展示本机内部目录路径或来源编号。

## 安全策略

当前实现的策略是最小本机治理，不是生产权限系统：

| 规则 | 当前决策 |
| --- | --- |
| `runtime-full-console` | 通用 Console 完整保留 Runtime 能力 |
| `agent-skill-allowlist` | 业务 Agent 默认使用绑定 Skill |
| `human-gates` | 高风险动作需要人工确认和审计 |
| `brand-boundary` | 用户界面只展示 FutureTech / AgentOS 体系 |

后续企业版应把这些策略迁移到服务端权限系统，并接入用户、角色、项目、资料密级和审批流。

## 设计取舍

- 本机版本用 `.runtime/*.json` 做状态存储，便于快速验证；企业版应替换为数据库。
- Run 事件在状态文件中只保存摘要，完整原始事件保存在 JSONL 日志，避免 UI 暴露过多内部信息。
- Agent 市场和定制中心共用同一份 Agent registry，避免出现“展示 Agent”和“运行 Agent”不一致。
- Skill 市场从 Runtime 实时读取，避免手工维护静态 Skill 清单。
