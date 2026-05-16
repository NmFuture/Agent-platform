# AgentOS 运维手册

本文用于本机启动、验收和排障。命令默认在项目根目录执行。

## 启动与停止

开发态启动：

```bash
npm run start
npm run status
npm run stop
npm run restart
```

部署态启动会先构建前端，再用 Vite preview 承载 `dist/`：

```bash
npm run start:prod
npm run restart:prod
```

等价脚本：

```bash
./start.sh
./stop.sh
./restart.sh
./scripts/demo.sh status
```

`npm run start` 和 `npm run start:prod` 都会启动三个服务：

| 服务 | 端口 | 健康检查 |
| --- | --- | --- |
| AgentOS Web | `5174` | `http://127.0.0.1:5174/` |
| FutureTech Console Proxy | `5175` | `http://127.0.0.1:5175/global/health` |
| FutureTech Runtime | `4096` | `http://127.0.0.1:4096/global/health` |

服务状态记录在 `.runtime/services.json`，日志写入 `.runtime/*.log`。

## 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `FUTURETECH_CONSOLE_TARGET` | `http://127.0.0.1:4096` | Console Proxy 指向的 Runtime 地址 |
| `FUTURETECH_CONSOLE_PROXY` | `http://127.0.0.1:5175` | 前端代理到的 Console Proxy 地址 |
| `FUTURETECH_CONSOLE_PROXY_PORT` | `5175` | Console Proxy 监听端口 |
| `FUTURETECH_WEB_MODE` | `dev` | `preview` 时使用构建后的前端 |
| `FUTURETECH_RUNTIME_COMMAND` | `opencode` | Runtime CLI 启动命令 |
| `FUTURETECH_PYTHON` | 自动选择 | 合同 Skill 执行 Python |
| `FUTURETECH_SKILL_ROOTS` | 空 | 额外 Skill 根目录，多个路径用逗号分隔 |
| `FUTURETECH_CONTRACT_SKILL_ROOT` | 仓库内置 Skill | 覆盖合同提取 Skill 目录 |

## 构建验收

每次改前端、代理或文档入口后，至少跑：

```bash
npm run build
npm run status
curl -sS http://127.0.0.1:5175/global/health
curl -sS http://127.0.0.1:5174/futuretech-admin/runtime-status
```

验收标准：

- `npm run build` 成功。
- `npm run status` 显示三个服务都是 `healthy`。
- `5175/global/health` 返回 `200` JSON，不是跳转。
- `runtime-status` 中 `healthy` 和 `fullConsoleProxy` 都为 `true`。

部署态额外检查：

```bash
npm run restart:prod
npm run status
```

确认 `.runtime/services.json` 中 AgentOS Web 的命令是 `npm run preview -- --port 5174`。

## Console 嵌入检查

通用 Agent 依赖完整 Console 代理。改 `server/futuretechConsoleProxy.mjs` 或 `vite.config.js` 后检查：

```bash
curl -sS -I http://127.0.0.1:5175/global/health
curl -N http://127.0.0.1:5175/event
```

要求：

- `/global/health` 直接返回 Runtime 健康结果。
- `/event` 保持 `text/event-stream`，不能被普通 JSON 或 HTML 替代。
- 页面 iframe 使用 `http://localhost:5175/`。
- 文件、终端、会话、Skill、MCP、WebSocket 能力不能被代理层截断。

## Agent Run 冒烟

创建一次合同提取 Run。先准备一份合同 PDF，并用 `PDF_PATH` 指向它：

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

返回 `run.id` 后轮询：

```bash
curl -sS http://127.0.0.1:5174/futuretech-admin/agent-runs/<run-id>
```

验收标准：

- `status` 最终为 `completed`。
- `exitCode` 为 `0`。
- `artifacts` 中包含 `.runtime/agentos-runs/<run-id>.jsonl`、Excel、summary JSON 和 result JSON。
- 前端 Run 追踪能看到步骤、Runtime 事件摘要和产物路径。

## 状态文件

| 文件 | 用途 |
| --- | --- |
| `.runtime/services.json` | 服务 PID、端口和日志路径 |
| `.runtime/agentos-state.json` | Agent、Run、安全策略、审计事件 |
| `.runtime/agentos-runs/*.jsonl` | 每次 Run 的完整 Runtime 事件 |
| `.runtime/agentos-runs/*-outputs/` | 每次 Run 的 Excel / JSON 产物 |
| `.runtime/uploads/` | 上传文件临时目录 |
| `.runtime/futuretech-runtime.log` | Runtime 服务日志 |
| `.runtime/futuretech-console-proxy.log` | Console Proxy 日志 |
| `.runtime/agentos-web.log` | 前端服务日志 |

`.runtime/` 是运行态目录，不应作为产品配置源提交。

## 常见问题

| 现象 | 检查 |
| --- | --- |
| `5174` 页面打不开 | `npm run status`，再看 `.runtime/agentos-web.log` |
| 通用 Agent 空白 | 检查 `5175/global/health` 和 iframe 地址 |
| 事件流没有输出 | 用 `curl -N http://127.0.0.1:5175/event` 验证 SSE |
| Skill 市场为空 | 检查 `GET /futuretech-admin/skills` 和 Runtime `/skill` |
| Run 一直失败 | 查对应 `.runtime/agentos-runs/<run-id>.jsonl` |
| 模型切换后不生效 | 调用模型激活接口后执行 `npm run restart` |
| 端口被占用 | `npm run stop`，必要时查看 `.runtime/services.json` 中的 PID |

## 品牌检查

AgentOS 外壳页面和文档只应展示 FutureTech、FutureTech Runtime、FutureTech Skill、AgentOS。完整 Console 是透明嵌入，不属于品牌改写范围。改文案后检查根文档、`docs/` 和 `src/App.jsx`，确认 AgentOS 外壳没有出现项目品牌边界外的底层实现品牌：

```bash
rg -n "<brand-denylist>" README.md docs src/App.jsx
```

`<brand-denylist>` 用项目当次约定的禁用品牌词替换。AgentOS 外壳文案和交付文档中不应出现底层实现品牌。
