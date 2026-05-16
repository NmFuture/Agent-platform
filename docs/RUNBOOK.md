# AgentOS 运维手册

本文用于本机启动、验收和排障。命令默认在项目根目录执行：

```bash
cd /Users/wlb/Agent/nm-agent-platform-demo
```

## 启动与停止

```bash
npm run start
npm run status
npm run stop
npm run restart
```

等价脚本：

```bash
./start.sh
./stop.sh
./restart.sh
./scripts/demo.sh status
```

`npm run start` 会启动三个服务：

| 服务 | 端口 | 健康检查 |
| --- | --- | --- |
| AgentOS Web | `5174` | `http://127.0.0.1:5174/` |
| FutureTech Console Proxy | `5175` | `http://127.0.0.1:5175/global/health` |
| FutureTech Runtime | `4096` | `http://127.0.0.1:4096/global/health` |

服务状态记录在 `.runtime/services.json`，日志写入 `.runtime/*.log`。

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

创建一次合同提取 Run：

```bash
curl -sS -X POST http://127.0.0.1:5174/futuretech-admin/agent-runs \
  -H 'content-type: application/json' \
  -d '{
    "agentId": "contract-extraction",
    "message": "按默认规则输出合同抽取 Excel。",
    "inputs": {
      "pdfPath": "/Users/wlb/Desktop/OhMy/合同提取/某某风电项目合同.pdf"
    }
  }'
```

返回 `run.id` 后轮询：

```bash
curl -sS http://127.0.0.1:5174/futuretech-admin/agent-runs/<run-id>
```

验收标准：

- `status` 最终为 `completed`。
- `exitCode` 为 `0`。
- `artifacts` 中包含 `.runtime/agentos-runs/<run-id>.jsonl`。
- 前端 Run 追踪能看到步骤、Runtime 事件摘要和产物路径。

## 状态文件

| 文件 | 用途 |
| --- | --- |
| `.runtime/services.json` | 服务 PID、端口和日志路径 |
| `.runtime/agentos-state.json` | Agent、Run、安全策略、审计事件 |
| `.runtime/agentos-runs/*.jsonl` | 每次 Run 的完整 Runtime 事件 |
| `.runtime/futuretech-runtime.log` | Runtime 服务日志 |
| `.runtime/futuretech-console-proxy.log` | Console Proxy 日志 |
| `.runtime/agentos-web.log` | 前端开发服务日志 |

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
