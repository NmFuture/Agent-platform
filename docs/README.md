# AgentOS 文档索引

本目录面向第一次接手项目的人类同事和后续 Agent。先读本文件，再按任务进入对应文档。

## 快速路径

| 你要做什么 | 先读 |
| --- | --- |
| 了解项目是什么 | [../README.md](../README.md) |
| 理解系统怎么工作 | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 接本机接口或企业后端 | [futuretech-skill-integration.md](./futuretech-skill-integration.md) |
| 启动、验收、排障 | [RUNBOOK.md](./RUNBOOK.md) |
| 看当前阶段完成了什么 | [CHANGELOG.md](./CHANGELOG.md) |
| 了解视觉规范来源 | [../DESIGN.md](../DESIGN.md) |

## 当前能力边界

截至 2026-05-16，本项目已经实现本机闭环：

- `5175` 是完整 FutureTech Console 反向代理，不再只是跳转。
- `5174` 前端通过 `/futuretech-admin/*` 管理 AgentOS 状态。
- `4096` FutureTech Runtime 负责执行。
- `skills/contract-e2e-excel` 随仓库发布，合同提取只需要上传 PDF。
- Agent 身份、Run、Security policy、Audit 写入 `.runtime/agentos-state.json`。
- Run 的完整事件日志写入 `.runtime/agentos-runs/*.jsonl`。

## 不要混淆的三件事

| 概念 | 说明 |
| --- | --- |
| 通用 Agent | 嵌入完整 FutureTech Console，保留底层执行能力 |
| 业务 Agent | 有身份、Skill 白名单、知识范围和输出策略的业务入口 |
| Skill 市场 | 合并 Runtime Skill 与仓库内置 `skills/`，支持分类、搜索和生成 Agent |

## 文档维护规则

- 新增接口时，同步更新 `futuretech-skill-integration.md`。
- 改运行方式、端口、状态文件或环境变量时，同步更新 `RUNBOOK.md`、根 `README.md` 和根 `AGENTS.md`。
- 改 Agent / Skill / Run / Security 数据模型时，同步更新 `ARCHITECTURE.md`。
- 完成阶段性能力时，同步更新 `CHANGELOG.md`。
- 产品介绍、交付说明和外壳文案不要暴露底层实现品牌；工程部署段可以保留真实 CLI 命令名。
