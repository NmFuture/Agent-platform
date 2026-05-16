# 变更记录

## 2026-05-16

### AgentOS 闭环

- 将通用 Agent 从跳转式入口改为完整 FutureTech Console 嵌入。
- `5175` 代理完整转发 Runtime 页面、API、SSE 和 WebSocket。
- 新增 `/futuretech-admin/*` 本机平台 API，覆盖 Agent、Run、Skill、Runtime、Security、Model Profile。
- Agent 市场只展示绑定 runner 的可运行 Agent。
- 合同提取智能体接入 `contract-e2e-excel`，可输入 PDF 并输出 Excel、summary JSON 和 result JSON。
- 定制中心可从 Skill 生成 Agent 蓝图，保留普通表单和高级 JSON 两种编辑方式。
- Agent 市场和定制中心可创建 Run，由后端执行。
- Run 追踪展示步骤、事件摘要、产物路径和退出码。
- Agent 身份、安全策略、审计事件保存到 `.runtime/agentos-state.json`。
- 每次 Run 的完整事件写入 `.runtime/agentos-runs/*.jsonl`。
- Skill 市场改为读取 Runtime 的 Skill registry，并支持搜索和分类。

### 产品与品牌

- AgentOS 外壳界面统一为 FutureTech、FutureTech Runtime、FutureTech Skill、AgentOS。
- 完整 Console 改为透明嵌入，不再为了品牌展示改写 Runtime 客户端内容。
- 设置页拆分为模型网关、Runtime、Security、平台信息。
- Runtime 和 Security 页面展示接口返回，不再是静态说明。
- Skill 市场遮罩本机内部目录路径，只展示 FutureTech Registry。

### 文档同步

- 重写根 `README.md`，作为新人入口和本机运行指南。
- 新增 `docs/README.md` 文档索引。
- 新增 `docs/ARCHITECTURE.md` 架构、数据模型和执行链路。
- 重写 `docs/futuretech-skill-integration.md` 接入指南。
- 新增 `docs/RUNBOOK.md` 运维、验收和排障手册。
