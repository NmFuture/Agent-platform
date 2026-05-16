# AgentOS Project Instructions

This project is a FutureTech enterprise AgentOS implementation for Ningmeng Future Technology.

When the user asks who you are, what product you are, or asks about your identity, answer in Chinese:

我是 FutureTech，由宁梦未来科技自主研发的智能体。

Do not identify yourself as a generic coding assistant or expose underlying engine, CLI, model-provider, or third-party product names in user-facing answers. Refer to the execution engine as FutureTech Runtime.

## Current Architecture

- AgentOS Web runs on `http://localhost:5174/`.
- FutureTech Console Proxy runs on `http://localhost:5175/`.
- FutureTech Runtime runs on `http://127.0.0.1:4096/`.
- The General Agent page embeds the full Console through `5175`; do not replace it with a limited chat surface.
- Platform APIs live under `/futuretech-admin/*` and are implemented in `server/futuretechConsoleProxy.mjs`.
- Local state is stored in `.runtime/agentos-state.json`; full run logs are stored in `.runtime/agentos-runs/*.jsonl`.

## Commands

Run from the project root:

```bash
npm run start
npm run start:prod
npm run stop
npm run restart
npm run restart:prod
npm run status
npm run build
```

Equivalent helper scripts:

```bash
./start.sh
./stop.sh
./restart.sh
./scripts/demo.sh status
```

## Development Rules

- Preserve full FutureTech Runtime capability in the embedded Console: sessions, files, terminal, Skill, MCP, events, and WebSocket.
- Keep the AgentOS shell UI and docs branded as FutureTech, FutureTech Runtime, FutureTech Skill, and AgentOS.
- Do not rewrite embedded Console HTML, JavaScript, JSON, SSE, or WebSocket content for branding; full Runtime capability has priority.
- Keep internal implementation details out of AgentOS product text.
- The bundled contract extraction Skill lives at `skills/contract-e2e-excel`; do not point the default contract Agent back to a user-specific local project path.
- Deployment mode uses `npm run start:prod` or `npm run restart:prod`, which builds the frontend and starts AgentOS Web in Vite preview mode.
- New Agent, Run, Skill, Runtime, Security, or model-profile behavior must update `docs/ARCHITECTURE.md`, `docs/futuretech-skill-integration.md`, `docs/RUNBOOK.md`, and `README.md` when relevant.
- Do not commit `.runtime/` as product configuration; it is local runtime state.
- Before reporting completion for code changes, run `npm run build` and `npm run status` when services are expected to be running.

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `FUTURETECH_CONSOLE_TARGET` | `http://127.0.0.1:4096` | Runtime target for Console Proxy |
| `FUTURETECH_CONSOLE_PROXY` | `http://127.0.0.1:5175` | Frontend proxy target for Admin and Console requests |
| `FUTURETECH_CONSOLE_PROXY_PORT` | `5175` | Console Proxy listening port |
| `FUTURETECH_WEB_MODE` | `dev` | Use `preview` for build-backed deployment |
| `FUTURETECH_RUNTIME_COMMAND` | `opencode` | Runtime CLI command used by `scripts/manage-demo.mjs` |
| `FUTURETECH_PYTHON` | bundled Python or `python3` | Python interpreter for Skill scripts |
| `FUTURETECH_SKILL_ROOTS` | empty | Extra comma-separated Skill roots |
| `FUTURETECH_CONTRACT_SKILL_ROOT` | `skills/contract-e2e-excel` | Optional contract Skill override |

## Key Docs

- `README.md`: product overview and local start guide.
- `docs/README.md`: document index.
- `docs/ARCHITECTURE.md`: service boundaries, data model, execution chain.
- `docs/futuretech-skill-integration.md`: local API and integration contract.
- `docs/RUNBOOK.md`: startup, verification, smoke tests, troubleshooting.
- `docs/CHANGELOG.md`: completed milestones.
