import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Bot,
  Braces,
  CheckCircle2,
  Circle,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileText,
  GitBranch,
  Grid3X3,
  History,
  LayoutDashboard,
  Layers3,
  LockKeyhole,
  MessageSquare,
  Network,
  Pause,
  Play,
  PlugZap,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  TerminalSquare,
  Upload,
  UserRound,
  Users,
  Workflow,
  Wrench,
} from "lucide-react";
import brandLogo from "./assets/brand-logo.svg";
import {
  agents as seedAgents,
  auditEvents,
  knowledgeBases,
  runSteps,
} from "./data/platformData";
import { agencyAgentsHydrated } from "./data/agencyAgents";
import {
  advanceDemoRun,
  backendContract,
  createDemoRun,
} from "./api/futureTechSkillAdapter";
import ChatView from "./components/chat/ChatView";
import WorkerDashboard from "./components/workers/WorkerDashboard";

const navItems = [
  { id: "chat", label: "对话", icon: MessageSquare },
  { id: "workers", label: "数字员工", icon: Users },
  { id: "dashboard", label: "仪表盘", icon: LayoutDashboard },
  { id: "marketplace", label: "Agent 市场", icon: Store },
  { id: "skills", label: "技能市场", icon: Puzzle },
  { id: "custom", label: "定制中心", icon: SlidersHorizontal },
  { id: "settings", label: "设置", icon: Settings },
];

const topNavItems = ["Agent 矩阵", "解决方案", "能力市场", "帮助中心"];

const promptSuggestions = ["生成销售周报", "合同风险识别", "客户交付复盘", "市场趋势分析"];

const statusMap = {
  done: { label: "完成", icon: CheckCircle2 },
  running: { label: "执行中", icon: RefreshCw },
  pending: { label: "等待", icon: Circle },
};

const defaultConsoleUrl = "http://localhost:5175/";

const viewMeta = {
  chat: {
    eyebrow: "AI Chat",
    title: "对话",
    subtitle: "与数字员工对话，通过 Skill 完成任务。",
  },
  workers: {
    eyebrow: "Digital Workers",
    title: "数字员工",
    subtitle: "配置数字员工的人设、Skill、记忆和模型。",
  },
  dashboard: {
    eyebrow: "Enterprise AI v2.4",
    title: "仪表盘",
    subtitle: "从一个入口进入通用智能体、业务智能体和企业能力市场。",
  },
  general: {
    eyebrow: "FutureTech Console",
    title: "通用 Agent",
    subtitle: "面向员工、实施和运维人员的通用智能体工作入口。",
  },
  marketplace: {
    eyebrow: "Agent Marketplace",
    title: "Agent 市场",
    subtitle: "从统一工作台选择、定制和运行不同场景智能体。",
  },
  skills: {
    eyebrow: "Skill Marketplace",
    title: "技能市场",
    subtitle: "管理可复用 Skill，按场景组合成企业专属 Agent。",
  },
  custom: {
    eyebrow: "Customization Center",
    title: "定制中心",
    subtitle: "通过模板、Skill、知识库和审批规则配置甲方专属智能体。",
  },
  trace: {
    eyebrow: "Run Trace",
    title: "运行追踪",
    subtitle: "查看 Skill 调用、知识来源、人工确认点和结果文件。",
  },
  settings: {
    eyebrow: "Settings",
    title: "设置",
    subtitle: "配置默认模型和平台展示信息。",
  },
};

const agentIconMap = Object.fromEntries(seedAgents.map((agent) => [agent.id, agent.icon]));
const agentColorMap = Object.fromEntries(seedAgents.map((agent) => [agent.id, agent.color]));
const agentShortNameMap = Object.fromEntries(seedAgents.map((agent) => [agent.id, agent.shortName]));
const agentVisualOverrides = {
  "contract-extraction": { icon: FileText, color: "teal", shortName: "合同" },
};

function hydrateAgent(agent) {
  const visual = agentVisualOverrides[agent.id] || {};
  return {
    ...agent,
    icon: visual.icon || agentIconMap[agent.id] || Bot,
    color: visual.color || agentColorMap[agent.id] || "blue",
    shortName: agent.shortName || visual.shortName || agentShortNameMap[agent.id] || agent.name?.slice(0, 2) || "Agent",
    inputs: agent.inputs || (agent.inputSchema || []).map((item) => item.label) || ["任务说明"],
    outputs: agent.outputs || (agent.outputSchema || []).map((item) => item.label) || ["执行结果"],
  };
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    };
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function schemaSummary(schema = []) {
  return schema.map((item) => item.label || item.id).filter(Boolean).join("、") || "-";
}

function publicAgentBlueprint(agent = {}) {
  const {
    runner,
    runnable,
    real,
    source,
    sourceRoot,
    path,
    icon,
    color,
    ...publicDraft
  } = agent;
  return {
    ...publicDraft,
    workflow: runner
      ? {
          mode: runner.type === "skill-script" ? "文件处理流程" : "对话执行流程",
          skill: runner.skillId || agent.skills?.[0] || "",
        }
      : undefined,
  };
}

function toRunView(run) {
  if (!run) return null;
  return {
    ...run,
    real: true,
    steps: run.steps?.length ? run.steps : runSteps.map((step) => ({ ...step, state: "pending" })),
  };
}

function defaultTaskForAgent(agent) {
  return `请以${agent.name}身份执行一次业务任务：先说明可用 Skill、需要的输入、执行计划和人工确认点；如果缺少业务文件，不要编造结果。`;
}

function App() {
  const [view, setView] = useState("chat");
  const [selectedAgentId, setSelectedAgentId] = useState("contract-extraction");
  const [run, setRun] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [settingsTab, setSettingsTab] = useState("model");
  const [chatWorkerId, setChatWorkerId] = useState("");
  const [consoleUrl, setConsoleUrl] = useState(defaultConsoleUrl);
  const [consoleFrameKey, setConsoleFrameKey] = useState(0);
  const [platformState, setPlatformState] = useState(null);
  const [platformError, setPlatformError] = useState("");
  const [builderSeedSkillId, setBuilderSeedSkillId] = useState("contract-e2e-excel");

  const agents = useMemo(() => {
    const platformAgents = platformState?.agents?.length ? platformState.agents : seedAgents;
    return [...platformAgents, ...agencyAgentsHydrated].map(hydrateAgent);
  }, [platformState]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [agents, selectedAgentId]
  );

  const progress = run
    ? Math.round(
        (run.steps.filter((step) => step.state === "done").length /
          run.steps.length) *
          100
      )
    : 0;

  const openNativeConsole = () => {
    setConsoleUrl(defaultConsoleUrl);
    setConsoleFrameKey((key) => key + 1);
  };

  const reloadConsole = () => {
    setConsoleFrameKey((key) => key + 1);
  };

  const openCustomWithSkill = (skillId = "") => {
    if (typeof skillId === "string" && skillId) setBuilderSeedSkillId(skillId);
    setView("custom");
  };

  useEffect(() => {
    if (view === "general") {
      openNativeConsole();
    }
  }, [view]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [view]);

  const refreshPlatformState = async () => {
    try {
      const response = await fetch("/futuretech-admin/agentos");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setPlatformState(data);
      setPlatformError("");
    } catch (error) {
      setPlatformError(error.message || "平台状态读取失败");
    }
  };

  useEffect(() => {
    refreshPlatformState();
  }, []);

  useEffect(() => {
    if (!run || run.real || run.status === "completed") return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => {
        const nextIndex = Math.min(current + 1, runSteps.length - 1);
        setRun((currentRun) =>
          currentRun ? advanceDemoRun(currentRun, nextIndex) : currentRun
        );
        return nextIndex;
      });
    }, 1500);

    return () => window.clearInterval(timer);
  }, [run]);

  useEffect(() => {
    if (!run?.real || !["running", "queued"].includes(run.status)) return undefined;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/futuretech-admin/agent-runs/${run.id}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setRun(toRunView(data.run));
      } catch (error) {
        setRun((currentRun) =>
          currentRun
            ? {
                ...currentRun,
                events: [
                  ...(currentRun.events || []),
                  {
                    time: new Date().toISOString(),
                    type: "platform.poll.error",
                    payload: error.message,
                  },
                ],
              }
            : currentRun
        );
      }
    }, 1600);

    return () => window.clearInterval(timer);
  }, [run?.id, run?.real, run?.status]);

  const startRun = async (agentId = selectedAgentId, message = "", inputs = {}) => {
    const agent = agents.find((item) => item.id === agentId) ?? selectedAgent;
    setSelectedAgentId(agentId);
    setActiveIndex(0);
    setRun({
      ...createDemoRun(agentId),
      real: true,
      status: "running",
      agentName: agent.name,
      events: [
        {
          time: new Date().toISOString(),
          type: "platform.run.requested",
          payload: "正在提交到 FutureTech Runtime",
        },
      ],
    });
    setView("trace");

    try {
      const response = await fetch("/futuretech-admin/agent-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId,
          message: message || defaultTaskForAgent(agent),
          skillIds: agent.skills || [],
          inputs,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setRun(toRunView(data.run));
      refreshPlatformState();
    } catch (error) {
      setRun((currentRun) => ({
        ...(currentRun || createDemoRun(agentId)),
        real: true,
        status: "failed",
        events: [
          ...((currentRun && currentRun.events) || []),
          {
            time: new Date().toISOString(),
            type: "platform.run.failed",
            payload: error.message || "任务启动失败",
          },
        ],
      }));
    }
  };

  const activeRunStep = run?.steps.find((step) => step.state === "running");
  const meta = viewMeta[view] ?? viewMeta.dashboard;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <img className="brand-logo" src={brandLogo} alt="宁梦未来" />
          <div>
            <div className="brand-title">宁梦未来</div>
            <div className="brand-subtitle">AgentOS 企业AI操作系统</div>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${view === item.id ? "active" : ""}`}
                onClick={() => setView(item.id)}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="edition-card">
          <div className="edition-icon">
            <ShieldCheck size={18} />
          </div>
          <strong>企业版</strong>
          <span>安全、稳定、专属支持</span>
          <button className="edition-link" type="button">
            升级方案
            <ArrowRight size={13} />
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="app-topbar">
          <nav className="top-nav" aria-label="顶部导航">
            {topNavItems.map((item) => (
              <button key={item} type="button">
                {item}
              </button>
            ))}
          </nav>
          <div className="account-menu">
            <span className="topbar-divider" aria-hidden="true" />
            <button className="avatar-chip" type="button" aria-label="当前用户">
              DZ
            </button>
            <button className="account-name" type="button">
              Dr. Zero
              <ArrowRight size={14} />
            </button>
          </div>
        </header>

        {view !== "dashboard" && (
          <section className="page-title">
            <div>
              <p className="eyebrow">{meta.eyebrow}</p>
              <h1>{meta.title}</h1>
              <p>{meta.subtitle}</p>
            </div>
          </section>
        )}

        {view === "chat" && (
          <ChatView
            initialWorkerId={chatWorkerId}
            onWorkerChange={setChatWorkerId}
          />
        )}

        {view === "workers" && (
          <WorkerDashboard
            onOpenChat={(workerId) => {
              setChatWorkerId(workerId);
              setView("chat");
            }}
          />
        )}

        {view === "dashboard" && (
          <Dashboard
            agents={agents}
            platformState={platformState}
            onStartRun={startRun}
            onOpenGeneral={() => setView("general")}
            onOpenMarketplace={() => setView("marketplace")}
            onOpenSkills={() => setView("skills")}
            onOpenCustom={openCustomWithSkill}
          />
        )}

        {view === "general" && (
        <GeneralAgent
          consoleUrl={consoleUrl}
          frameKey={consoleFrameKey}
        />
      )}

        {view === "marketplace" && (
          <AgentMarketplace
            agents={agents}
            selectedAgentId={selectedAgentId}
            onSelectAgent={setSelectedAgentId}
            onStartRun={startRun}
            onCustomize={() => setView("custom")}
          />
        )}

        {view === "skills" && (
          <SkillMarketplace
            onOpenCustom={openCustomWithSkill}
          />
        )}

        {view === "custom" && (
          <CustomCenter
            agents={agents}
            selectedAgent={selectedAgent}
            selectedAgentId={selectedAgentId}
            onSelectAgent={setSelectedAgentId}
            onStartRun={startRun}
            onOpenGeneral={() => setView("general")}
            onPlatformRefresh={refreshPlatformState}
            seedSkillId={builderSeedSkillId}
          />
        )}

        {view === "trace" && (
          <TraceView
            run={run}
            progress={progress}
            activeRunStep={activeRunStep}
            onStartRun={() => startRun("contract-extraction")}
            platformError={platformError}
          />
        )}

        {view === "settings" && (
          <SettingsPage
            activeTab={settingsTab}
            onTabChange={setSettingsTab}
            platformState={platformState}
            onPlatformRefresh={refreshPlatformState}
          />
        )}
      </main>
    </div>
  );
}

function Dashboard({
  agents,
  platformState,
  onStartRun,
  onOpenGeneral,
  onOpenMarketplace,
  onOpenSkills,
  onOpenCustom,
}) {
  const runnableCount = agents.filter((agent) => agent.runnable !== false && agent.runner).length;
  const skillCount = platformState?.skills?.count ?? 0;
  const runCount = platformState?.runs?.length ?? 0;
  return (
    <section className="dashboard-grid customer-dashboard">
      <article className="command-panel">
        <div className="command-copy">
          <h2>宁梦相伴，未来已来</h2>
          <p>
            从一个入口进入通用智能体、业务智能体和企业能力市场。
          </p>
        </div>
        <div className="command-box">
          <Sparkles className="command-spark" size={24} />
          <input
            aria-label="输入指令"
            placeholder="输入任务，例如：生成本周客户交付复盘..."
          />
          <button className="primary-button" type="button" onClick={onOpenGeneral}>
            <Sparkles size={16} />
            执行指令
          </button>
        </div>
        <div className="prompt-suggestions" aria-label="快捷任务">
          <button className="suggestion-orb" type="button" aria-label="智能推荐">
            <Sparkles size={17} />
          </button>
          {promptSuggestions.map((suggestion) => (
            <button key={suggestion} type="button" onClick={onOpenGeneral}>
              {suggestion}
            </button>
          ))}
        </div>
      </article>

      <aside className="scenario-panel">
        <PanelTitle icon={Sparkles} title="推荐入口" />
        <ScenarioShortcut
          icon={Bot}
          title="通用 Agent"
          text="自由对话、文档处理、临时任务。"
          onClick={onOpenGeneral}
        />
        <ScenarioShortcut
          icon={FileText}
          title="合同提取智能体"
          text="输入 PDF，输出 5-sheet Excel。"
          onClick={onOpenMarketplace}
        />
        <ScenarioShortcut
          icon={SlidersHorizontal}
          title="定制中心"
          text="配置客户专属 Agent 和流程。"
          onClick={onOpenCustom}
        />
      </aside>

      <div className="metric-card">
        <PanelTitle icon={Bot} title="业务 Agent" />
        <strong>{runnableCount}</strong>
        <span>当前可用的业务入口</span>
      </div>
      <div className="metric-card">
        <PanelTitle icon={Puzzle} title="能力包" />
        <strong>{skillCount || "-"}</strong>
        <span>按类别检索并可包装成 Agent</span>
      </div>
      <div className="metric-card">
        <PanelTitle icon={History} title="运行记录" />
        <strong>{runCount}</strong>
        <span>任务记录和结果文件</span>
      </div>

      <div className="quick-deploy">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>核心能力</h2>
          </div>
          <button className="text-button" type="button" onClick={onOpenMarketplace}>
            进入市场
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="deploy-grid">
          <DeployCard
            icon={FileText}
            title="合同提取智能体"
            label="推荐"
            text="输入合同 PDF，输出 5-sheet Excel。"
            onClick={onOpenMarketplace}
          />
          <DeployCard
            icon={Puzzle}
            title="技能市场"
            label="新版本"
            text="把解析、写作、比对能力封装成可复用 Skill。"
            onClick={onOpenSkills}
          />
          <DeployCard
            icon={SlidersHorizontal}
            title="定制 Agent"
            label="自定义"
            text="面向客户部门配置专属入口、能力包和发布规则。"
            onClick={onOpenCustom}
          />
        </div>
      </div>
    </section>
  );
}

function GeneralAgent({ consoleUrl, frameKey }) {
  return (
    <section className="general-layout focused-general">
      <div className="console-shell">
        <div className="console-toolbar">
          <div>
            <span className="tiny-chip">通用会话</span>
            <h2>FutureTech 通用 Agent</h2>
          </div>
          <div className="console-toolbar-actions">
            <a
              className="ghost-button"
              href={defaultConsoleUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={17} />
              独立打开
            </a>
          </div>
        </div>
        <iframe
          key={frameKey}
          title="FutureTech Web Console"
          src={consoleUrl}
          className="console-frame"
        />
      </div>
    </section>
  );
}

function AgentMarketplace({ agents, selectedAgentId, onSelectAgent, onStartRun, onCustomize }) {
  const displayAgents = agents; // Show all agents including agency-agents imports
  const selectedAgent = displayAgents.find((agent) => agent.id === selectedAgentId) || displayAgents[0];
  const [pdfFile, setPdfFile] = useState(null);
  const [message, setMessage] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");

  const submitRun = async () => {
    if (!selectedAgent) return;
    setSubmitMessage("正在提交任务");
    try {
      const inputs = {};
      if (pdfFile) {
        inputs.files = [
          {
            field: "pdf",
            name: pdfFile.name,
            mimeType: pdfFile.type,
            dataBase64: await readFileAsBase64(pdfFile),
          },
        ];
      }
      await onStartRun(selectedAgent.id, message, inputs);
      setSubmitMessage("");
    } catch (error) {
      setSubmitMessage(error.message || "任务提交失败");
    }
  };

  return (
    <section className="content-grid">
      <div className="section-wide">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Agent Catalog</p>
            <h2>业务 Agent</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onCustomize}>
            <SlidersHorizontal size={17} />
            从 Skill 创建
          </button>
        </div>

        <div className="agent-grid">
          {displayAgents.map((agent, index) => {
            const Icon = agent.icon;
            return (
              <article
                key={`${agent.id}-${index}`}
                className={`agent-card ${selectedAgent?.id === agent.id ? "selected" : ""}`}
                onClick={() => onSelectAgent(agent.id)}
              >
                <div className={`agent-icon ${agent.color}`}>
                  <Icon size={21} />
                </div>
                <div className="agent-card-main">
                  <div className="agent-title-row">
                    <h3>{agent.name}</h3>
                    <span className="status-pill">{agent.category || agent.status}</span>
                  </div>
                  <p>{agent.description}</p>
                </div>
                <div className="agent-card-footer">
                  <span>{agent.vibe || agent.owner || ""}</span>
                  <button
                    className="ghost-button compact-button"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCustomize();
                    }}
                  >
                    <Wrench size={15} />
                    配置
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectAgent(agent.id);
                    }}
                  >
                    <Play size={15} />
                    填写输入
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {displayAgents.length === 0 && (
          <div className="empty-state">
            <Bot size={22} />
            <strong>还没有可用 Agent</strong>
            <span>请先在定制中心从 Skill 创建并发布 Agent。</span>
          </div>
        )}
      </div>

      <aside className="right-rail">
        <PanelTitle icon={Play} title="运行输入" />
        {selectedAgent ? (
          <div className="run-input-panel">
            <strong>{selectedAgent.name}</strong>
            <p>{selectedAgent.description}</p>
            <label>
              合同 PDF
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => setPdfFile(event.target.files?.[0] || null)}
              />
            </label>
            <label>
              补充说明
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="可选，例如：按默认规则输出 Excel。"
              />
            </label>
            {submitMessage && <div className="form-message">{submitMessage}</div>}
            <button className="primary-button full-width-button" type="button" onClick={submitRun}>
              <Play size={17} />
              开始运行
            </button>
          </div>
        ) : (
          <div className="empty-state compact">请先选择 Agent</div>
        )}

        {selectedAgent && (
          <>
            <PanelTitle icon={Download} title="输入 / 输出" />
            <div className="summary-stack">
              <SummaryLine label="输入" value={schemaSummary(selectedAgent.inputSchema)} />
              <SummaryLine label="输出" value={schemaSummary(selectedAgent.outputSchema)} />
              <SummaryLine label="能力" value={(selectedAgent.skills || []).join(", ")} />
            </div>
          </>
        )}
      </aside>
    </section>
  );
}

function SkillMarketplace({ onOpenCustom }) {
  const [skillState, setSkillState] = useState({ roots: [], skills: [], categories: [], count: 0 });
  const [skillLoading, setSkillLoading] = useState(true);
  const [skillError, setSkillError] = useState("");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const allSkills = skillState.skills ?? [];
  const visibleSkills = allSkills.filter((skill) => {
    const q = query.trim().toLowerCase();
    const inCategory = activeCategory === "all" || skill.categoryId === activeCategory;
    if (!inCategory) return false;
    if (!q) return true;
    return [skill.id, skill.name, skill.description, skill.category, ...(skill.inputs || []), ...(skill.outputs || [])]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
  const categories = [{ id: "all", label: "全部", count: allSkills.length }, ...(skillState.categories || [])];

  useEffect(() => {
    let cancelled = false;

    async function loadFutureTechSkills() {
      try {
        setSkillLoading(true);
        const response = await fetch("/futuretech-admin/skills");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        if (!cancelled) {
          setSkillState(payload);
          setSkillError("");
        }
      } catch (error) {
        if (!cancelled) {
          setSkillError(error.message || "读取失败");
        }
      } finally {
        if (!cancelled) {
          setSkillLoading(false);
        }
      }
    }

    loadFutureTechSkills();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="skills-layout">
      <div className="skills-main">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Skill Catalog</p>
            <h2>可复用能力包</h2>
          </div>
          <div className="trace-actions">
            <button className="ghost-button" type="button" onClick={onOpenCustom}>
              <Plus size={17} />
              从 Skill 创建 Agent
            </button>
            <button className="primary-button" type="button" onClick={() => onOpenCustom("contract-e2e-excel")}>
              <Sparkles size={17} />
              创建合同提取 Agent
            </button>
          </div>
        </div>

        <div className="skill-source-bar" aria-live="polite">
          <div>
            <span>能力目录</span>
            <strong>
              {skillLoading ? "正在读取能力包" : `${visibleSkills.length} / ${allSkills.length} 个能力包`}
            </strong>
          </div>
        </div>

        <div className="skill-search-panel">
          <div className="search-box wide-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 Skill 名称、描述、输入或输出"
            />
          </div>
          <div className="category-filter">
            {categories.map((category) => (
              <button
                key={category.id}
                className={activeCategory === category.id ? "active" : ""}
                type="button"
                onClick={() => setActiveCategory(category.id)}
              >
                <span>{category.label}</span>
                <em>{category.count}</em>
              </button>
            ))}
          </div>
        </div>

        {skillError && (
          <div className="empty-state compact">
            <AlertTriangle size={18} />
            <span>读取 FutureTech Skill 失败：{skillError}</span>
          </div>
        )}

        {!skillLoading && !skillError && visibleSkills.length === 0 && (
          <div className="empty-state">
            <Puzzle size={22} />
            <strong>没有匹配的能力包</strong>
            <span>换一个关键词，或切换到全部分类。</span>
          </div>
        )}

        <div className="skill-market-grid real-skill-grid">
          {visibleSkills.map((skill, index) => {
            return (
              <article className="skill-card" key={`${skill.id}-${index}`}>
                <div className="skill-card-head">
                  <div className="agent-icon blue">
                    <Puzzle size={20} />
                  </div>
                  <div>
                    <h3>{skill.name}</h3>
                    <span>{skill.id}</span>
                  </div>
                  <em>{skill.status}</em>
                </div>
                <p>{skill.description}</p>
                <div className="skill-meta-grid">
                  <span>{skill.category}</span>
                  <span>{skill.version}</span>
                  <span>{skill.updated}</span>
                </div>
                <div className="skill-io">
                  <div>
                    <strong>输入</strong>
                    <span>{(skill.inputs || []).join("、")}</span>
                  </div>
                  <div>
                    <strong>输出</strong>
                    <span>{(skill.outputs || []).join("、")}</span>
                  </div>
                </div>
                {skill.features.length > 0 && (
                  <div className="skill-feature-list">
                    {skill.features.map((feature) => (
                      <span key={feature}>{feature}</span>
                    ))}
                  </div>
                )}
                <div className="skill-card-footer">
                  <span>{skill.id}</span>
                  <button className="text-button" type="button" onClick={() => onOpenCustom(skill.id)}>
                    生成 Agent
                    <ArrowRight size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <aside className="right-rail">
        <PanelTitle icon={Wrench} title="分类" />
        <div className="category-list">
          {categories.slice(1).map((category) => (
            <button
              key={category.id}
              className={activeCategory === category.id ? "active" : ""}
              type="button"
              onClick={() => setActiveCategory(category.id)}
            >
              <span>{category.label}</span>
              <strong>{category.count}</strong>
            </button>
          ))}
        </div>

      </aside>
    </section>
  );
}

function CustomCenter({
  agents,
  selectedAgent,
  selectedAgentId,
  onSelectAgent,
  onStartRun,
  onOpenGeneral,
  onPlatformRefresh,
  seedSkillId,
}) {
  const [skills, setSkills] = useState([]);
  const [selectedSkillId, setSelectedSkillId] = useState(seedSkillId || "contract-e2e-excel");
  const [simpleForm, setSimpleForm] = useState({
    name: selectedAgent.name || "",
    businessGoal: selectedAgent.businessGoal || "",
    rolePrompt: selectedAgent.rolePrompt || "",
    inputsText: schemaSummary(selectedAgent.inputSchema),
    outputsText: schemaSummary(selectedAgent.outputSchema),
    skillsText: (selectedAgent.skills || []).join(", "),
    marketplace: selectedAgent.marketplace !== false,
  });
  const [agentDraft, setAgentDraft] = useState(selectedAgent);
  const [blueprintText, setBlueprintText] = useState(JSON.stringify(publicAgentBlueprint(selectedAgent), null, 2));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const [runMessage, setRunMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadSkills() {
      try {
        const response = await fetch("/futuretech-admin/skills");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (!cancelled) setSkills(payload.skills || []);
      } catch {
        if (!cancelled) setSkills([]);
      }
    }
    loadSkills();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (seedSkillId) setSelectedSkillId(seedSkillId);
  }, [seedSkillId]);

  const applyAgentDraft = (agent) => {
    const normalized = {
      ...agent,
      marketplace: agent.marketplace !== false,
    };
    setAgentDraft(normalized);
    setSimpleForm({
      name: normalized.name || "",
      businessGoal: normalized.businessGoal || normalized.description || "",
      rolePrompt: normalized.rolePrompt || "",
      inputsText: schemaSummary(normalized.inputSchema),
      outputsText: schemaSummary(normalized.outputSchema),
      skillsText: (normalized.skills || []).join(", "),
      marketplace: normalized.marketplace !== false,
    });
    setBlueprintText(JSON.stringify(publicAgentBlueprint(normalized), null, 2));
  };

  const generateFromSkill = async (skillId = selectedSkillId) => {
    setSaveMessage("正在从 Skill 生成 Agent 草案");
    try {
      const response = await fetch("/futuretech-admin/agent-blueprints/from-skill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skillId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      applyAgentDraft(data.agent);
      setSaveMessage("已生成 Agent 草案，可以直接保存或展开高级配置。");
    } catch (error) {
      setSaveMessage(error.message || "生成失败");
    }
  };

  useEffect(() => {
    if (selectedSkillId) generateFromSkill(selectedSkillId);
  }, [selectedSkillId]);

  const updateSimpleForm = (field, value) => {
    setSimpleForm((current) => ({ ...current, [field]: value }));
  };

  const buildAgentPayload = () => {
    let blueprint = {};
    try {
      blueprint = JSON.parse(blueprintText || "{}");
    } catch {
      blueprint = {};
    }
    const { workflow, runner, runnable, ...publicBlueprint } = blueprint;
    const skillsList = simpleForm.skillsText
      .split(/[,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const inputSchema = simpleForm.inputsText
      .split(/[、,，\n]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((label, index) => ({
        id: index === 0 ? "input" : `input${index + 1}`,
        label,
        type: /pdf/i.test(label) || /PDF/.test(label) ? "file" : "text",
        required: index === 0,
      }));
    const outputSchema = simpleForm.outputsText
      .split(/[、,，\n]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((label, index) => ({
        id: index === 0 ? "output" : `output${index + 1}`,
        label,
        type: /excel|xlsx/i.test(label) || /Excel/.test(label) ? "xlsx" : "artifact",
        required: index === 0,
      }));
    return {
      ...agentDraft,
      ...publicBlueprint,
      name: simpleForm.name,
      businessGoal: simpleForm.businessGoal,
      description: simpleForm.businessGoal || blueprint.description,
      rolePrompt: simpleForm.rolePrompt,
      skills: skillsList,
      inputSchema,
      outputSchema,
      marketplace: simpleForm.marketplace,
      runner: agentDraft.runner,
      runnable: true,
    };
  };

  const saveAgentConfig = async () => {
    setSaveMessage("正在保存 Agent 蓝图");
    try {
      const agent = buildAgentPayload();
      const response = await fetch("/futuretech-admin/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setSaveMessage("Agent 蓝图已保存，Agent 市场会使用这份配置。");
      onSelectAgent(data.agent.id);
      onPlatformRefresh?.();
      return data.agent;
    } catch (error) {
      setSaveMessage(error.message || "保存失败");
      return null;
    }
  };

  const testRun = async () => {
    const agent = await saveAgentConfig();
    if (!agent) return;
    try {
      const inputs = {};
      if (pdfFile) {
        inputs.files = [
          {
            field: "pdf",
            name: pdfFile.name,
            mimeType: pdfFile.type,
            dataBase64: await readFileAsBase64(pdfFile),
          },
        ];
      }
      await onStartRun(agent.id, runMessage, inputs);
    } catch (error) {
      setSaveMessage(error.message || "试运行失败");
    }
  };

  return (
    <section className="custom-layout">
      <div className="custom-main">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Agent Builder</p>
            <h2>Agent 定制中心</h2>
          </div>
          <div className="trace-actions">
            <button className="ghost-button" type="button" onClick={onOpenGeneral}>
              <TerminalSquare size={17} />
              打开通用入口
            </button>
            <button className="ghost-button" type="button" onClick={saveAgentConfig}>
              <Upload size={17} />
              保存 Agent
            </button>
            <button className="primary-button" type="button" onClick={testRun}>
              <Play size={17} />
              试运行
            </button>
          </div>
        </div>

        <div className="builder-steps" aria-label="定制步骤">
          <BuilderStep index="1" title="选择 Skill" text="系统自动生成 Agent 草案。" active />
          <BuilderStep index="2" title="填写目标" text="普通用户只填输入、输出和职责。" active />
          <BuilderStep index="3" title="高级蓝图" text="保留流程、权限和校验自由度。" active />
        </div>

        <div className="builder-panel simple-builder-panel">
          <div className="builder-form">
            <label className="wide-field">
              选择 Skill
              <select value={selectedSkillId} onChange={(event) => setSelectedSkillId(event.target.value)}>
                {skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.category} / {skill.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Agent 名称
              <input value={simpleForm.name} onChange={(event) => updateSimpleForm("name", event.target.value)} />
            </label>
            <label>
              是否发布到市场
              <select
                value={simpleForm.marketplace ? "yes" : "no"}
                onChange={(event) => updateSimpleForm("marketplace", event.target.value === "yes")}
              >
                <option value="yes">发布</option>
                <option value="no">仅保存草案</option>
              </select>
            </label>
            <label className="wide-field">
              业务目标
              <input
                value={simpleForm.businessGoal}
                onChange={(event) => updateSimpleForm("businessGoal", event.target.value)}
                placeholder="例如：输入合同 PDF，输出 5-sheet Excel"
              />
            </label>
            <label className="wide-field">
              Agent 身份
              <textarea value={simpleForm.rolePrompt} onChange={(event) => updateSimpleForm("rolePrompt", event.target.value)} />
            </label>
            <label>
              输入
              <textarea value={simpleForm.inputsText} onChange={(event) => updateSimpleForm("inputsText", event.target.value)} />
            </label>
            <label>
              输出
              <textarea value={simpleForm.outputsText} onChange={(event) => updateSimpleForm("outputsText", event.target.value)} />
            </label>
            <label className="wide-field">
              绑定 Skill
              <input value={simpleForm.skillsText} onChange={(event) => updateSimpleForm("skillsText", event.target.value)} />
            </label>
            {saveMessage && <div className="form-message">{saveMessage}</div>}
          </div>

          <div className="orchestration-panel">
            <PanelTitle icon={Workflow} title="试运行输入" />
            <div className="run-input-panel flat">
              <label>
                PDF 文件
                <input type="file" accept=".pdf,application/pdf" onChange={(event) => setPdfFile(event.target.files?.[0] || null)} />
              </label>
              <label>
                补充说明
                <textarea value={runMessage} onChange={(event) => setRunMessage(event.target.value)} />
              </label>
            </div>
            <button className="ghost-button" type="button" onClick={() => setAdvancedOpen((value) => !value)}>
              <Braces size={17} />
              {advancedOpen ? "收起高级蓝图" : "展开高级蓝图"}
            </button>
            {advancedOpen && (
              <label className="blueprint-editor">
                高级配置 JSON
                <textarea value={blueprintText} onChange={(event) => setBlueprintText(event.target.value)} />
              </label>
            )}
          </div>
        </div>
      </div>

      <aside className="right-rail">
        <PanelTitle icon={Store} title="已保存 Agent" />
        <div className="agent-switcher">
          {agents.map((agent, index) => {
            const Icon = agent.icon;
            return (
              <button
                key={`${agent.id}-${index}`}
                className={selectedAgentId === agent.id ? "active" : ""}
                type="button"
                onClick={() => onSelectAgent(agent.id)}
              >
                <Icon size={17} />
                <span>{agent.shortName}</span>
              </button>
            );
          })}
        </div>

        <PanelTitle icon={FileText} title="当前配置摘要" />
        <div className="summary-stack">
          <SummaryLine label="Skill" value={selectedSkillId || "-"} />
          <SummaryLine label="输入" value={simpleForm.inputsText || "-"} />
          <SummaryLine label="输出" value={simpleForm.outputsText || "-"} />
          <SummaryLine label="市场" value={simpleForm.marketplace ? "发布" : "草案"} />
        </div>

        <div className="human-gate">
          <AlertTriangle size={18} />
          <div>
            <strong>人工确认</strong>
            <p>普通用户填写目标，高级用户可以展开蓝图调整流程、权限、校验和发布边界。</p>
          </div>
        </div>
      </aside>
    </section>
  );
}

function TraceView({ run, progress, activeRunStep, onStartRun, platformError }) {
  const visibleSteps = run?.steps ?? runSteps.map((step) => ({ ...step, state: "pending" }));
  const runEvents = run?.events ?? [];
  const artifacts = run?.artifacts ?? [];

  return (
    <section className="trace-layout">
      <div className="trace-main">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Run Trace</p>
            <h2>执行过程可追踪</h2>
          </div>
          <div className="trace-actions">
            <button className="ghost-button" type="button" title="暂停当前任务">
              <Pause size={17} />
              <span>暂停</span>
            </button>
            <button className="primary-button" type="button" onClick={onStartRun}>
              <Play size={17} />
              <span>重新运行</span>
            </button>
          </div>
        </div>

        <div className="run-summary">
          <div>
            <span className="summary-label">当前任务</span>
            <strong>{run ? `${run.agentName || "Agent"} / 任务记录` : "等待启动任务"}</strong>
          </div>
          <div>
            <span className="summary-label">当前步骤</span>
            <strong>{activeRunStep?.title ?? "未开始"}</strong>
          </div>
          <div>
            <span className="summary-label">完成度</span>
            <strong>{progress}%</strong>
          </div>
        </div>

        <div className="progress-bar" aria-label="任务进度">
          <div style={{ width: `${progress}%` }} />
        </div>

        <div className="timeline">
          {visibleSteps.map((step) => {
            const StatusIcon = statusMap[step.state]?.icon ?? Circle;
            return (
              <article className={`timeline-item ${step.state}`} key={step.key}>
                <div className="timeline-status">
                  <StatusIcon size={19} />
                </div>
                <div className="timeline-body">
                  <div className="timeline-title">
                    <h3>{step.title}</h3>
                    <span>{statusMap[step.state]?.label}</span>
                  </div>
                  <p>{step.detail}</p>
                  <div className="timeline-meta">
                    <span>
                      <Wrench size={14} />
                      {step.tool || "FutureTech Runtime"}
                    </span>
                    <span>
                      <Database size={14} />
                      {step.source || "AgentOS run state"}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {platformError && (
          <div className="model-message">
            <AlertTriangle size={18} />
            <span>{platformError}</span>
          </div>
        )}

        {runEvents.length > 0 && (
          <div className="contract-box runtime-events">
            <PanelTitle icon={TerminalSquare} title="Runtime 事件流" />
            {runEvents.slice(-12).map((event, index) => (
              <div className="runtime-event-row" key={`${event.time}-${event.type}-${index}`}>
                <code>{event.type}</code>
                <span>
                  {typeof event.payload === "string"
                    ? event.payload
                    : JSON.stringify(event.payload || event.status || "")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="right-rail">
        <PanelTitle icon={Eye} title="人工确认点" />
        <div className="human-gate">
          <AlertTriangle size={18} />
          <div>
            <strong>缺口字段待确认</strong>
            <p>投标机型参数、项目里程碑、商务响应边界。</p>
          </div>
        </div>

        <PanelTitle icon={History} title="审计记录" />
        <div className="audit-list">
          {auditEvents.map((event) => (
            <div className="audit-row" key={`${event.time}-${event.action}`}>
              <time>{event.time}</time>
              <div>
                <strong>{event.action}</strong>
                <span>{event.user} · {event.target}</span>
              </div>
            </div>
          ))}
        </div>

        {artifacts.length > 0 && (
          <>
            <PanelTitle icon={Download} title="产物" />
            <div className="artifact-list">
              {artifacts.map((artifact) => (
                <div className="artifact-row" key={artifact.path || artifact.name}>
                  <FileText size={17} />
                  <span>{artifact.name || artifact.path}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </aside>
    </section>
  );
}

function SettingsPage({ activeTab, onTabChange, platformState, onPlatformRefresh }) {
  const [modelState, setModelState] = useState(null);
  const [modelMessage, setModelMessage] = useState("");
  const [switchingProfile, setSwitchingProfile] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const [modelScope, setModelScope] = useState("connected");
  const [modelProvider, setModelProvider] = useState("all");
  const [runtimeStatus, setRuntimeStatus] = useState(platformState?.runtime || null);
  const [securityPolicy, setSecurityPolicy] = useState(platformState?.securityPolicy || null);
  const [settingsMessage, setSettingsMessage] = useState("");
  const tabs = [
    { id: "model", label: "模型" },
    { id: "runtime", label: "Runtime" },
    { id: "security", label: "Security" },
    { id: "brand", label: "平台信息" },
  ];
  const visibleTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : "model";

  const loadModelProfiles = async () => {
    try {
      const response = await fetch("/futuretech-admin/model-profiles");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setModelState(data);
      setModelMessage("");
    } catch {
      setModelMessage("无法读取本机 FutureTech 模型配置，请确认 5175 代理服务已启动。");
    }
  };

  const activateModelProfile = async (profile) => {
    setSwitchingProfile(profile.modelName);
    setModelMessage("");

    try {
      const response = await fetch("/futuretech-admin/model-profiles/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelName: profile.modelName }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setModelState(data);
      setModelMessage(
        data.runtimeRestarted
          ? "模型已切换，FutureTech Runtime 已自动重启并生效。"
          : "模型已切换，但 Runtime 自动重启未完成，可执行 ./restart.sh 兜底。"
      );
    } catch (error) {
      setModelMessage(error.message || "模型切换失败。");
    } finally {
      setSwitchingProfile("");
    }
  };

  const loadRuntimeStatus = async () => {
    try {
      const response = await fetch("/futuretech-admin/runtime-status");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setRuntimeStatus(await response.json());
      setSettingsMessage("");
    } catch (error) {
      setSettingsMessage(error.message || "Runtime 状态读取失败");
    }
  };

  const loadSecurityPolicy = async () => {
    try {
      const response = await fetch("/futuretech-admin/security-policy");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSecurityPolicy(await response.json());
      setSettingsMessage("");
    } catch (error) {
      setSettingsMessage(error.message || "安全策略读取失败");
    }
  };

  const toggleRunMode = async () => {
    if (!securityPolicy) return;
    const nextMode =
      securityPolicy.defaultRunMode === "approval-gated" ? "runtime-native" : "approval-gated";
    try {
      const response = await fetch("/futuretech-admin/security-policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ defaultRunMode: nextMode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setSecurityPolicy(data);
      setSettingsMessage("安全策略已保存");
      onPlatformRefresh?.();
    } catch (error) {
      setSettingsMessage(error.message || "安全策略保存失败");
    }
  };

  useEffect(() => {
    if (visibleTab === "model") {
      loadModelProfiles();
    }
    if (visibleTab === "runtime") {
      loadRuntimeStatus();
    }
    if (visibleTab === "security") {
      loadSecurityPolicy();
    }
  }, [visibleTab]);

  const modelProviders = modelState?.providers ?? [];
  const modelProfiles = modelState?.profiles ?? [];
  const filteredModelProfiles = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    return modelProfiles.filter((profile) => {
      if (modelScope === "connected" && !profile.connected) return false;
      if (modelScope === "configured" && !profile.configured) return false;
      if (modelProvider !== "all" && profile.providerID !== modelProvider) return false;
      if (!q) return true;
      return [
        profile.label,
        profile.displayModelName,
        profile.modelName,
        profile.providerName,
        profile.family,
        profile.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [modelProfiles, modelProvider, modelQuery, modelScope]);
  const visibleModelProfiles = filteredModelProfiles.slice(0, 120);
  const currentProfile = modelProfiles.find((profile) => profile.active);
  const providerChoices = modelProviders.filter((provider) => {
    if (modelScope === "connected") return provider.connected;
    if (modelScope === "configured") return provider.configured;
    return true;
  });

  return (
    <section className="base-layout">
      <div className="section-heading">
        <div>
          <p className="eyebrow">System Settings</p>
          <h2>平台设置</h2>
        </div>
      </div>

      <div className="segmented" role="tablist" aria-label="设置分类">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={visibleTab === tab.id ? "active" : ""}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {visibleTab === "runtime" && (
        <div className="settings-grid">
          <div className="model-card">
            <Server size={22} />
            <div>
              <h3>FutureTech Runtime</h3>
              <p>完整 Console 反向代理已启用，保留会话、文件、终端、Skill、MCP 和事件流能力。</p>
            </div>
            <span>{runtimeStatus?.healthy ? "在线" : "离线"}</span>
          </div>
          <div className="model-card">
            <PlugZap size={22} />
            <div>
              <h3>Skill 调度</h3>
              <p>从 FutureTech Runtime 读取 Skill registry，并在 Agent 运行时写入 Skill 上下文。</p>
            </div>
            <span>{runtimeStatus ? `${runtimeStatus.skillCount} 个` : "-"}</span>
          </div>
          <div className="model-card">
            <MessageSquare size={22} />
            <div>
              <h3>会话与模型</h3>
              <p>当前模型：{runtimeStatus?.model || "-"}；会话数：{runtimeStatus?.sessionCount ?? "-"}。</p>
            </div>
            <span>{runtimeStatus?.version || "-"}</span>
          </div>
          <div className="model-card">
            <Network size={22} />
            <div>
              <h3>代理入口</h3>
              <p>
                {runtimeStatus?.proxy || "http://127.0.0.1:5175"} {"->"}{" "}
                {runtimeStatus?.target || "Runtime"}
              </p>
            </div>
            <span>{runtimeStatus?.fullConsoleProxy ? "完整代理" : "待检查"}</span>
          </div>
          <div className="contract-box settings-wide">
            <PanelTitle icon={Server} title="服务状态" />
            {(runtimeStatus?.services ?? []).map((service) => (
              <div className="contract-row" key={service.id}>
                <code>{service.name}</code>
                <span>
                  port {service.port} / {service.healthy ? "healthy" : "down"} / pid{" "}
                  {service.pids?.length ? service.pids.join(", ") : "-"}
                </span>
              </div>
            ))}
          </div>
          <div className="contract-box settings-wide">
            <PanelTitle icon={Puzzle} title="Runtime 能力" />
            <div className="skill-chips capability-chips">
              {(runtimeStatus?.capabilities ?? []).map((capability) => (
                <span key={capability}>{capability}</span>
              ))}
            </div>
          </div>
          <div className="contract-box settings-wide">
            <PanelTitle icon={GitBranch} title="后端接口边界" />
            {Object.entries(backendContract).map(([name, path]) => (
              <div className="contract-row" key={name}>
                <code>{name}</code>
                <span>{path}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {visibleTab === "model" && (
        <div className="model-settings">
          <div className="model-toolbar">
            <div className="search-box model-search">
              <Search size={16} />
              <input
                value={modelQuery}
                onChange={(event) => setModelQuery(event.target.value)}
                placeholder="搜索模型、Provider、系列"
              />
            </div>
            <label>
              范围
              <select value={modelScope} onChange={(event) => setModelScope(event.target.value)}>
                <option value="connected">可切换</option>
                <option value="configured">已配置</option>
                <option value="all">全部模型</option>
              </select>
            </label>
            <label>
              Provider
              <select value={modelProvider} onChange={(event) => setModelProvider(event.target.value)}>
                <option value="all">全部 Provider</option>
                {providerChoices.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}（{provider.modelCount}）
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="model-overview-grid">
            <div className="contract-box">
              <PanelTitle icon={Cpu} title="当前模型" />
              <SummaryLine label="模型" value={currentProfile?.displayModelName || modelState?.activeModel || "-"} />
              <SummaryLine label="Provider" value={currentProfile?.providerName || "-"} />
              <SummaryLine label="状态" value={currentProfile?.connected ? "可切换" : "需检查"} />
            </div>
            <div className="contract-box">
              <PanelTitle icon={Network} title="模型目录" />
              <SummaryLine label="Provider" value={`${modelState?.providerCount ?? 0} 个`} />
              <SummaryLine label="模型" value={`${modelState?.modelCount ?? 0} 个`} />
              <SummaryLine label="可切换 Provider" value={`${modelState?.connectedProviderCount ?? 0} 个`} />
            </div>
            <div className="contract-box">
              <PanelTitle icon={ShieldCheck} title="配置写回" />
              <SummaryLine label="配置写回" value="本机模型配置" />
              <SummaryLine label="生效方式" value={modelState?.restartRequired ? "等待重启" : "切换后自动重启"} />
              <SummaryLine label="当前筛选" value={`${filteredModelProfiles.length} 个`} />
            </div>
          </div>

          <div className="model-profile-grid">
            {visibleModelProfiles.map((profile) => (
              <article
                className={`model-profile-card ${profile.active ? "active" : ""}`}
                key={profile.id}
              >
                <div className="model-profile-head">
                  <div className={`agent-icon ${profile.connected ? "blue" : "slate"}`}>
                    <Server size={20} />
                  </div>
                  <div>
                    <h3>{profile.label}</h3>
                    <span>{profile.displayModelName || profile.modelName}</span>
                  </div>
                  <em>{profile.active ? "当前" : profile.available ? "可切换" : "未连接"}</em>
                </div>
                <div className="model-meta-grid">
                  <span>{profile.providerName}</span>
                  <span>{profile.family || "通用"}</span>
                  <span>{profile.limit?.context ? `${profile.limit.context.toLocaleString()} ctx` : "context -"}</span>
                  <span>{profile.status || "catalog"}</span>
                </div>
                <div className="model-capability-list">
                  {profile.capabilities?.reasoning && <span>推理</span>}
                  {profile.capabilities?.toolcall && <span>工具调用</span>}
                  {profile.capabilities?.imageInput && <span>图片输入</span>}
                  {profile.capabilities?.pdfInput && <span>PDF 输入</span>}
                  {!profile.capabilities?.reasoning &&
                    !profile.capabilities?.toolcall &&
                    !profile.capabilities?.imageInput &&
                    !profile.capabilities?.pdfInput && <span>文本</span>}
                </div>
                <button
                  className={profile.active ? "ghost-button" : "primary-button"}
                  type="button"
                  disabled={!profile.available || profile.active || switchingProfile === profile.modelName}
                  onClick={() => activateModelProfile(profile)}
                >
                  {profile.active && <CheckCircle2 size={17} />}
                  {!profile.active && <RefreshCw size={17} />}
                  {switchingProfile === profile.modelName
                    ? "切换中"
                    : profile.active
                      ? "正在使用"
                      : "切换并重启"}
                </button>
              </article>
            ))}
          </div>

          {filteredModelProfiles.length > visibleModelProfiles.length && (
            <div className="model-message">
              <Search size={18} />
              <span>当前筛选命中 {filteredModelProfiles.length} 个模型，已显示前 {visibleModelProfiles.length} 个；继续输入关键词可以快速定位。</span>
            </div>
          )}

          {!modelState && (
            <div className="contract-box">
              <PanelTitle icon={Cpu} title="模型配置" />
              <p className="muted-copy">正在读取本机 FutureTech 模型配置。</p>
            </div>
          )}

          <div className="contract-box">
            <PanelTitle icon={Cpu} title="当前配置" />
            <SummaryLine label="当前模型" value={currentProfile?.displayModelName || modelState?.activeModel || "-"} />
            <SummaryLine label="全部模型" value={`${modelState?.modelCount ?? 0} 个`} />
            <SummaryLine
              label="生效方式"
              value={modelState?.restartRequired ? "等待重启" : "切换后自动重启"}
            />
          </div>

          {modelMessage && (
            <div className="model-message">
              <AlertTriangle size={18} />
              <span>{modelMessage}</span>
            </div>
          )}
        </div>
      )}

      {visibleTab === "security" && (
        <div className="settings-grid">
          <div className="model-card">
            <ShieldCheck size={22} />
            <div>
              <h3>运行模式</h3>
              <p>业务 Agent 默认运行策略：{securityPolicy?.defaultRunMode || "-"}。</p>
            </div>
            <button className="ghost-button" type="button" onClick={toggleRunMode}>
              切换
            </button>
          </div>
          <div className="model-card">
            <LockKeyhole size={22} />
            <div>
              <h3>Console 能力</h3>
              <p>通用入口保留完整 Runtime 能力，业务 Agent 通过策略限制 Skill 和产物边界。</p>
            </div>
            <span>{securityPolicy?.runtimeConsole || "full-access"}</span>
          </div>
          <div className="table-panel settings-wide">
            <div className="table-header">
              <span>规则</span>
              <span>范围</span>
              <span>决策</span>
              <span>说明</span>
            </div>
            {(securityPolicy?.rules ?? []).map((rule) => (
              <div className="table-row" key={rule.id}>
                <span>{rule.id}</span>
                <span>{rule.scope}</span>
                <span className="state-dot">{rule.decision}</span>
                <span>{rule.detail}</span>
              </div>
            ))}
          </div>
          <div className="audit-wide settings-wide">
            {(platformState?.auditEvents ?? auditEvents).slice(0, 12).map((event) => (
              <div className="audit-row" key={`${event.time}-${event.target}`}>
                <time>{String(event.time).slice(11, 16)}</time>
                <div>
                  <strong>{event.action}</strong>
                  <span>{event.user} · {event.target}</span>
                </div>
                <ArrowRight size={16} />
              </div>
            ))}
          </div>
          {settingsMessage && (
            <div className="model-message settings-wide">
              <AlertTriangle size={18} />
              <span>{settingsMessage}</span>
            </div>
          )}
        </div>
      )}

      {visibleTab === "brand" && (
        <div className="settings-grid">
          <div className="brand-preview">
            <div className="brand-mark large-brand">
              <Bot size={28} />
            </div>
            <div>
              <h3>AgentOS</h3>
              <p>Enterprise AI v2.4</p>
            </div>
          </div>
          <div className="contract-box">
            <PanelTitle icon={SlidersHorizontal} title="展示字段" />
            <SummaryLine label="平台名称" value="AgentOS" />
            <SummaryLine label="通用入口" value="FutureTech 通用 Agent" />
            <SummaryLine label="服务形态" value="企业专属部署" />
          </div>
          <div className="kb-grid settings-wide">
            {knowledgeBases.map((kb) => (
              <article className="kb-card" key={kb.name}>
                <Database size={20} />
                <h3>{kb.name}</h3>
                <p>{kb.type}</p>
                <div>
                  <strong>{kb.count}</strong>
                  <span>{kb.freshness}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function BuilderStep({ index, title, text, active = false }) {
  return (
    <div className={`builder-step ${active ? "active" : ""}`}>
      <span>{index}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

function SummaryLine({ label, value }) {
  return (
    <div className="summary-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelTitle({ icon: Icon, title }) {
  return (
    <div className="panel-title">
      <Icon size={18} />
      <h3>{title}</h3>
    </div>
  );
}

function Capability({ icon: Icon, title, text }) {
  return (
    <div className="capability">
      <Icon size={18} />
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}

function TaskEvent({ title, status, text }) {
  return (
    <div className="task-event">
      <span className="event-dot" />
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
      <em>{status}</em>
    </div>
  );
}

function ScenarioShortcut({ icon: Icon, title, text, onClick }) {
  return (
    <button className="scenario-shortcut" type="button" onClick={onClick}>
      <Icon size={18} />
      <span>
        <strong>{title}</strong>
        <em>{text}</em>
      </span>
      <ArrowRight size={15} />
    </button>
  );
}

function PlatformSignal({ icon: Icon, label, value, tone }) {
  return (
    <div className={`platform-signal ${tone}`}>
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DeployCard({ icon: Icon, title, label, text, onClick }) {
  return (
    <button className="deploy-card" type="button" onClick={onClick}>
      <div>
        <Icon size={20} />
        <span>{label}</span>
      </div>
      <strong>{title}</strong>
      <p>{text}</p>
      <b>
        进入配置
        <ArrowRight size={14} />
      </b>
    </button>
  );
}

export default App;
