# 宁梦未来企业 Agent 基座

这是宁梦未来科技的企业 AgentOS 项目，用于把 FutureTech Runtime、FutureTech Skill 和业务 Agent 封装成一个可配置、可执行、可追踪的企业智能体工作台。

当前版本已经具备完整本机闭环：前端工作台、完整 Runtime Console 嵌入、Skill 市场、Agent 市场、Agent 定制中心、模型配置、运行追踪，以及一个真实可运行的“合同提取智能体”。

## 产品定位

AgentOS 是企业智能体基座：

- 普通用户通过业务 Agent 完成端到端任务，例如上传合同 PDF 并得到结构化 Excel。
- 高级用户通过通用 Agent 进入完整 FutureTech Runtime Console，保留复杂任务所需的文件、终端、会话、Skill、MCP 和上下文能力。
- 管理员通过 Skill、Agent、Runtime、Security、Model 页面管理能力、身份、模型和权限边界。

## 已实现能力

| 模块 | 当前能力 |
| --- | --- |
| 工作台前端 | 仪表盘、通用 Agent、Agent 市场、技能市场、定制中心、设置页 |
| Runtime Console | `5175` 反向代理到 `4096`，完整保留 Runtime 原生能力 |
| Skill registry | 合并 Runtime `/skill` 和仓库内置 `skills/`，支持分类和搜索 |
| Agent 市场 | 只展示可运行业务 Agent，当前内置合同提取智能体 |
| Agent 定制中心 | 从 Skill 生成 Agent 蓝图，保存身份、提示词、输入输出、绑定 Skill、运行模式 |
| 合同提取 | 上传 PDF，调用内置 `contract-e2e-excel` Skill，输出 5-sheet Excel、summary JSON、result JSON |
| 模型配置 | 前后端模型目录保持一致，保留当前可用模型 |
| 运行追踪 | 记录 Run 步骤、事件摘要、产物路径、退出码和审计事件 |
| 产品化路径 | 合同提取 Skill 已随仓库发布，不依赖个人电脑上的合同项目目录 |

## 项目结构

```text
.
├── src/                         # React 前端
├── server/                      # FutureTech Console Proxy 和 AgentOS 后端接口
├── scripts/                     # 本机启动、停止、状态管理脚本
├── skills/contract-e2e-excel/   # 内置合同提取 Skill、规则、模板和执行脚本
├── docs/                        # 架构、接口、运维和变更文档
├── .runtime/                    # 本机运行态数据，默认不提交
├── package.json
└── README.md
```

## 运行架构

```text
Browser
  -> AgentOS Web               http://localhost:5174
  -> FutureTech Console Proxy  http://localhost:5175
  -> FutureTech Runtime        http://127.0.0.1:4096

Agent Run
  -> /futuretech-admin/agent-runs
  -> Agent 身份 / Skill 白名单 / 输入校验
  -> skills/contract-e2e-excel/scripts/contract_pdf_to_excel.py
  -> .runtime/agentos-runs/<run-id>-outputs/
```

## 环境要求

推荐环境：

- macOS 或 Linux
- Node.js 20.19+，推荐 Node.js 22+
- npm 10+
- Python 3.10+
- FutureTech Runtime CLI 可用，当前启动脚本默认调用 `opencode serve`

确认 Runtime CLI：

```bash
opencode --version
```

如果目标电脑没有 Runtime CLI，需要先安装 Runtime CLI，再启动本项目。合同提取 Skill 已经在仓库内，不需要额外复制你本机的合同提取项目目录。

## 本地开发启动

```bash
git clone https://github.com/SEUWanglibo/nm-agent-platform-demo.git
cd nm-agent-platform-demo
npm ci
npm run start
```

打开：

```text
http://localhost:5174/
```

开发态命令：

```bash
npm run start      # 启动 Runtime、Console Proxy、前端 dev server
npm run stop       # 停止全部服务
npm run restart    # 重启全部服务
npm run status     # 查看健康状态
npm run build      # 构建前端
```

## 单机部署

适合在另一台电脑、演示机或内网服务器上部署。

1. 拉取代码：

```bash
git clone https://github.com/SEUWanglibo/nm-agent-platform-demo.git
cd nm-agent-platform-demo
```

2. 安装依赖：

```bash
npm ci
```

3. 确认 Runtime CLI：

```bash
opencode --version
```

4. 构建并以预览服务启动：

```bash
npm run start:prod
```

如果已经启动过，使用：

```bash
npm run restart:prod
```

5. 检查状态：

```bash
npm run status
curl -sS http://127.0.0.1:5175/global/health
curl -sS http://127.0.0.1:5174/futuretech-admin/runtime-status
```

期望：

- FutureTech Runtime、Console Proxy、AgentOS Web 都是 `healthy`。
- `5175/global/health` 返回 JSON。
- `runtime-status` 中 `fullConsoleProxy` 为 `true`。

## 端口

| 服务 | 端口 | 说明 |
| --- | --- | --- |
| AgentOS Web | `5174` | 主工作台 |
| FutureTech Console Proxy | `5175` | 完整 Console 反向代理和 AgentOS 后端接口 |
| FutureTech Runtime | `4096` | 本机执行内核 |

如果端口被占用，先停止旧服务：

```bash
npm run stop
```

再检查占用：

```bash
lsof -iTCP:5174 -sTCP:LISTEN
lsof -iTCP:5175 -sTCP:LISTEN
lsof -iTCP:4096 -sTCP:LISTEN
```

## 配置项

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `FUTURETECH_CONSOLE_TARGET` | `http://127.0.0.1:4096` | Console Proxy 指向的 Runtime 地址 |
| `FUTURETECH_CONSOLE_PROXY` | `http://127.0.0.1:5175` | 前端代理到的 Console Proxy 地址 |
| `FUTURETECH_CONSOLE_PROXY_PORT` | `5175` | Console Proxy 监听端口 |
| `FUTURETECH_WEB_MODE` | `dev` | `preview` 时用构建后的前端启动 |
| `FUTURETECH_RUNTIME_COMMAND` | `opencode` | Runtime CLI 启动命令 |
| `FUTURETECH_PYTHON` | 自动选择 | 合同 Skill 执行 Python |
| `FUTURETECH_SKILL_ROOTS` | 空 | 额外 Skill 根目录，多个路径用逗号分隔 |
| `FUTURETECH_CONTRACT_SKILL_ROOT` | 仓库内置 Skill | 覆盖合同提取 Skill 目录 |

示例：

```bash
FUTURETECH_WEB_MODE=preview FUTURETECH_PYTHON=/usr/bin/python3 npm run restart
```

## 合同提取验收

页面验收：

1. 打开 `http://localhost:5174/`。
2. 进入 Agent 市场。
3. 选择“合同提取智能体”。
4. 上传合同 PDF。
5. 点击运行。
6. 在运行追踪中确认输出 Excel、summary JSON 和 result JSON。

接口验收：

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

成功标准：

- `status` 为 `completed`
- `exitCode` 为 `0`
- `artifacts` 包含 Excel、summary JSON、result JSON
- Excel 包含 5 个业务 sheet

## 运行态数据

`.runtime/` 是本机运行目录，默认不提交到 Git。

```text
.runtime/services.json              # 服务 PID、端口和日志路径
.runtime/agentos-state.json         # Agent、Run、安全策略、审计事件
.runtime/agentos-runs/*.jsonl       # 每次 Run 的完整事件日志
.runtime/agentos-runs/*-outputs/    # Run 产物目录
.runtime/uploads/                   # 上传文件临时目录
```

迁移到新电脑时，只需要代码仓库和 Runtime CLI。除非要迁移历史运行记录，否则不需要复制 `.runtime/`。

## Git 发布流程

```bash
git status --short --branch
npm run build
npm run status
git add .
git commit -m "Describe the change"
git push origin main
```

提交前确认：

- 不提交 `.runtime/`
- 不提交 `.env`
- 不提交任何明文 API Key
- 新增 Skill 必须把脚本、规则、模板、schema 一起放入 `skills/<skill-id>/`

## 文档入口

- [docs/README.md](./docs/README.md)：文档索引
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)：架构、数据模型和执行链路
- [docs/futuretech-skill-integration.md](./docs/futuretech-skill-integration.md)：接口和接入说明
- [docs/RUNBOOK.md](./docs/RUNBOOK.md)：启动、验证、故障排查
- [docs/CHANGELOG.md](./docs/CHANGELOG.md)：阶段变更记录

## 品牌边界

对用户和甲方展示时统一使用：

- FutureTech
- FutureTech Runtime
- FutureTech Skill
- AgentOS

完整 Console 采用透明嵌入，优先保留 Runtime 原生能力。外壳界面和产品文档不展示底层实现品牌；部署脚本中的命令名属于工程实现细节。
