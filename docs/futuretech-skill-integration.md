# FutureTech Runtime + Skill 接入指南

本文面向要接入 AgentOS 的前端、后端或下游系统。当前接口是本机最小实现，企业后端可按同一语义替换。

## 分层定位

| 层级 | 职责 | 当前实现 |
| --- | --- | --- |
| 平台 API | Agent、Run、Security、Audit、Runtime 状态 | `server/futuretechConsoleProxy.mjs` 的 `/futuretech-admin/*` |
| 执行内核 | 会话、文件、终端、Skill、MCP、事件流 | FutureTech Runtime `4096` |
| 业务 Skill | 文档解析、素材检索、写作、组装、审查 | Runtime `/skill` 与仓库内置 `skills/` 合并后的 Skill registry |
| 前端工作台 | Agent 市场、Skill 市场、Run 追踪、设置页 | `src/App.jsx` |

## 本机接口

所有本机平台接口都通过 AgentOS Web 访问：

```text
http://127.0.0.1:5174/futuretech-admin/*
```

Vite 会把这些请求代理到 `5175`。

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/futuretech-admin/agentos` | 返回 Agent、Run、Skill、Runtime、安全策略和审计汇总 |
| `GET` | `/futuretech-admin/runtime-status` | 返回 Runtime / Proxy / Web 健康状态、模型、会话数、Skill 数 |
| `GET` | `/futuretech-admin/skills` | 读取 Runtime Skill 与仓库内置 Skill，返回分类、输入输出摘要和来源标签 |
| `GET` | `/futuretech-admin/agents` | 返回已配置 Agent |
| `POST` | `/futuretech-admin/agents` | 新增或更新 Agent 身份配置 |
| `POST` | `/futuretech-admin/agent-blueprints/from-skill` | 根据 Skill 生成可编辑 Agent 蓝图 |
| `GET` | `/futuretech-admin/agent-runs` | 返回 Run 列表 |
| `POST` | `/futuretech-admin/agent-runs` | 创建 Run；合同提取智能体会调用 Skill 脚本生成 Excel |
| `GET` | `/futuretech-admin/agent-runs/:id` | 查询 Run 状态、事件摘要、产物和退出码 |
| `GET` | `/futuretech-admin/security-policy` | 读取安全策略 |
| `POST` | `/futuretech-admin/security-policy` | 更新安全策略 |
| `GET` | `/futuretech-admin/model-profiles` | 读取模型配置摘要 |
| `POST` | `/futuretech-admin/model-profiles/activate` | 切换模型并重启 Runtime |

## Console 代理

完整 Console 地址：

```text
http://127.0.0.1:5175/
```

代理要求：

- `GET /global/health` 返回 Runtime 健康状态，不能 307 跳转。
- `GET /event` 保持 `text/event-stream`。
- 静态资源、会话 API、文件 API、终端、Skill、MCP、WebSocket 都透传。
- 不改写 Console 的 HTML、JavaScript、JSON、SSE 或 WebSocket 内容；品牌隔离由 AgentOS 外壳承担。

## 示例

### 读取 Runtime 状态

```bash
curl -sS http://127.0.0.1:5174/futuretech-admin/runtime-status
```

关键字段：

```json
{
  "healthy": true,
  "version": "1.14.41",
  "skillCount": 170,
  "sessionCount": 70,
  "fullConsoleProxy": true
}
```

### 生成合同提取 Agent 蓝图

```bash
curl -sS -X POST http://127.0.0.1:5174/futuretech-admin/agent-blueprints/from-skill \
  -H 'content-type: application/json' \
  -d '{
    "skillId": "contract-e2e-excel"
  }'
```

返回值包含 `agent` 蓝图，前端定制中心可以继续编辑名称、身份提示词、输入输出和发布状态。

### 创建合同提取 Run

```bash
PDF_PATH="/absolute/path/to/contract.pdf" node - <<'NODE'
const { readFileSync } = await import("node:fs");
const { basename } = await import("node:path");
const pdfPath = process.env.PDF_PATH;
const response = await fetch("http://127.0.0.1:5174/futuretech-admin/agent-runs", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    agentId: "contract-extraction",
    message: "按默认规则输出合同抽取 Excel。",
    inputs: {
      files: [{
        field: "pdf",
        name: basename(pdfPath),
        mimeType: "application/pdf",
        dataBase64: readFileSync(pdfPath).toString("base64"),
      }],
    },
  }),
});
console.log(await response.text());
NODE
```

返回值包含 `run.id`。随后轮询：

```bash
curl -sS http://127.0.0.1:5174/futuretech-admin/agent-runs/<run-id>
```

`status` 可能值：

| 状态 | 含义 |
| --- | --- |
| `running` | Runtime 正在执行 |
| `completed` | 执行完成，`exitCode` 为 `0` |
| `failed` | 执行失败，查看 `events` 和 JSONL 日志 |

合同提取 Run 只接受上传文件形式的 PDF。请求体中的 `inputs.files[]` 至少要包含一个 `field` 为 `pdf` 或文件名以 `.pdf` 结尾的条目；平台会把上传文件写入 `.runtime/uploads/<run-id>/`，再调用仓库内置 `skills/contract-e2e-excel/scripts/contract_pdf_to_excel.py`。

成功后 `run.artifacts` 至少包含：

| 类型 | 说明 |
| --- | --- |
| `runtime-log` | `.runtime/agentos-runs/<run-id>.jsonl` |
| `excel` | 合同抽取结果 Excel |
| `summary` | 抽取统计 JSON |
| `json` | 结构化抽取结果 JSON |

## 部署配置

本机实现支持以下环境变量，企业后端替换时应保留同等语义：

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `FUTURETECH_CONSOLE_TARGET` | `http://127.0.0.1:4096` | Console Proxy 指向的 Runtime 地址 |
| `FUTURETECH_CONSOLE_PROXY` | `http://127.0.0.1:5175` | 前端代理到的 Console Proxy 地址 |
| `FUTURETECH_CONSOLE_PROXY_PORT` | `5175` | Console Proxy 监听端口 |
| `FUTURETECH_WEB_MODE` | `dev` | `preview` 时使用构建后的前端 |
| `FUTURETECH_RUNTIME_COMMAND` | `opencode` | Runtime CLI 启动命令 |
| `FUTURETECH_PYTHON` | 自动选择 | Skill 脚本 Python |
| `FUTURETECH_SKILL_ROOTS` | 空 | 额外 Skill 根目录 |
| `FUTURETECH_CONTRACT_SKILL_ROOT` | `skills/contract-e2e-excel` | 合同 Skill 目录覆盖 |

## 生产后端建议

企业后端替换本机实现时，建议保留语义：

| 本机对象 | 企业后端建议 |
| --- | --- |
| `.runtime/agentos-state.json` | 数据库表：agents、runs、audit_events、security_policies |
| `.runtime/agentos-runs/*.jsonl` | 对象存储或日志系统 |
| `POST /futuretech-admin/agent-runs` | 平台任务 API，异步执行 |
| 轮询 Run | SSE 或 WebSocket 推送 |
| 本机 Security policy | 用户、角色、项目、资料密级、审批流 |

生产版不要把执行内核直接暴露给业务用户。平台 API 应封装任务、权限、审计和产物，完整 Console 只开放给授权高级用户。
