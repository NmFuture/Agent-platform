import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  BadgeCheck,
  Bot,
  BookOpen,
  Brain,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Code,
  FileText,
  FolderKanban,
  Link2,
  ListTodo,
  Mail,
  Megaphone,
  MessageSquare,
  Microscope,
  PenTool,
  Plus,
  Puzzle,
  Search,
  Settings,
  Scale,
  Shield,
  Sparkles,
  Timer,
  TrendingUp,
  UserRound,
  WalletCards,
  Zap,
  FolderOpen,
  Headphones,
} from "lucide-react";
import { createWorker, deleteWorker, getWorkerOverview, listWorkerPresets, listWorkers, updateWorker } from "../../api/workerApi";
import WorkerProfileDialog, { emptyWorkerDraft } from "./WorkerProfileDialog";

const iconMap = {
  Bot,
  FileText,
  PenTool,
  Briefcase,
  Mail,
  Code,
  Settings,
  Microscope,
  Scale,
  Megaphone,
  FolderOpen,
  Headphones,
};
const colorMap = {
  blue: "#1d4ed8",
  teal: "#0f766e",
  green: "#15803d",
  amber: "#b45309",
  purple: "#7c3aed",
  rose: "#be123c",
};

const tabs = [
  { id: "overview", label: "概览", icon: Activity },
  { id: "tasks", label: "任务", icon: ListTodo },
  { id: "automations", label: "自动化", icon: Zap },
  { id: "memory", label: "记忆", icon: Brain },
  { id: "skills", label: "技能", icon: Puzzle },
  { id: "connectors", label: "连接器", icon: Link2 },
  { id: "permissions", label: "权限", icon: Shield },
];

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms) {
  const value = Number(ms || 0);
  if (!value) return "-";
  if (value < 1000) return `${value} ms`;
  if (value < 60_000) return `${Math.round(value / 1000)} 秒`;
  return `${Math.round(value / 60_000)} 分钟`;
}

function formatMoney(value, currency = "USD") {
  const amount = Number(value || 0);
  if (!amount) return currency === "CNY" ? "¥0.00" : "$0.00";
  const prefix = currency === "CNY" ? "¥" : "$";
  return `${prefix}${amount.toFixed(amount < 0.01 ? 4 : 2)}`;
}

function formatCost(cost = {}, field = "totalCost") {
  if (!cost.rateConfigured) return "待配置";
  return formatMoney(cost[field], cost.currency);
}

function statusText(status) {
  const map = {
    online: "在线",
    completed: "完成",
    failed: "失败",
    running: "执行中",
    queued: "排队中",
    active: "活跃",
    idle: "空闲",
  };
  return map[status] || status || "在线";
}

function sourceText(source) {
  const map = {
    chat: "对话",
    "agent-run": "任务",
    automation: "自动化",
    manual: "手动",
  };
  return map[source] || source || "记录";
}

function growthTypeText(type) {
  const map = {
    created: "创建",
    profile: "档案",
    memory: "记忆",
    skill: "技能",
    connector: "连接器",
    permission: "权限",
    project: "项目",
    automation: "自动化",
    work: "工作",
  };
  return map[type] || "动态";
}

function EmptyState({ children }) {
  return <div className="employee-empty">{children}</div>;
}

function WorkerAvatar({ worker, large = false }) {
  const Icon = iconMap[worker?.avatar] || Bot;
  const color = colorMap[worker?.color] || colorMap.blue;
  return (
    <div className={`employee-avatar ${large ? "large" : ""}`} style={{ background: `${color}18`, color }}>
      <Icon size={large ? 30 : 18} />
    </div>
  );
}

function SummaryList({ title, items = [], empty, compact = false }) {
  return (
    <div className={`profile-summary-card ${compact ? "compact" : ""}`}>
      <span>{title}</span>
      {items.length === 0 ? (
        <em>{empty}</em>
      ) : (
        <ul>
          {items.slice(0, compact ? 4 : 5).map((item, index) => (
            <li key={`${title}-${index}-${item}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WorkRecord({ view, overview }) {
  const timeline = overview.workRecord?.timeline || overview.recentWork || [];
  const groups = overview.workRecord?.taskGroups || {};

  if (view === "tasks") {
    const sections = [
      ["running", "执行中"],
      ["completed", "已完成"],
      ["failed", "失败"],
      ["idle", "空闲/待处理"],
    ];
    return (
      <div className="task-group-list">
        {sections.map(([key, label]) => {
          const items = groups[key] || [];
          return (
            <div className="task-group" key={key}>
              <div className="task-group-head">
                <strong>{label}</strong>
                <span>{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div className="mini-empty">暂无{label}记录</div>
              ) : (
                items.slice(0, 4).map((item) => <WorkRecordRow item={item} key={`${key}-${item.source}-${item.sourceId}`} />)
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="work-record-list timeline-list">
      {timeline.length === 0 && <EmptyState>{overview.profileSummary?.emptyHints?.workRecord || "完成一次对话后会沉淀第一条工作记录。"}</EmptyState>}
      {timeline.map((item) => <WorkRecordRow item={item} key={`${item.source}-${item.sourceId}`} timeline />)}
    </div>
  );
}

function WorkRecordRow({ item, timeline = false }) {
  return (
    <div className={`work-record-row ${timeline ? "timeline" : ""}`}>
      <div className="record-marker" aria-hidden="true" />
      <div>
        <strong>{item.title || sourceText(item.source)}</strong>
        <span>{sourceText(item.source)} · {formatDate(item.finishedAt)} · {formatDuration(item.durationMs)}</span>
      </div>
      <em className={`status-chip ${item.status}`}>{statusText(item.status)}</em>
      <span>{formatNumber(item.totalTokens)} Token{item.estimated ? " · 估算" : ""}</span>
    </div>
  );
}

function ProfileCompleteness({ profileCompleteness = {}, onEdit, onBindSkill }) {
  const score = Number(profileCompleteness.score || 0);
  const missing = profileCompleteness.missingFields || [];
  return (
    <div className="profile-completeness">
      <div>
        <span>档案完成度</span>
        <strong>{score}%</strong>
      </div>
      <div className="profile-completeness-bar" aria-label="档案完成度">
        <span style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      {missing.length > 0 ? (
        <em>待补充：{missing.slice(0, 3).join("、")}</em>
      ) : (
        <em>档案已具备可交付基础</em>
      )}
      <div className="profile-next-actions">
        <button className="text-button" type="button" onClick={onEdit}>
          <PenTool size={14} />
          补充档案
        </button>
        <button className="text-button" type="button" onClick={onBindSkill}>
          <Puzzle size={14} />
          绑定技能
        </button>
      </div>
    </div>
  );
}

function BusinessSummaryStrip({ overview, cost }) {
  const items = [
    { label: "今日 Token", value: formatNumber(overview.metrics.todayTokens), hint: overview.metrics.estimated ? "含估算" : "实时记录", icon: WalletCards },
    { label: "本周 Token", value: formatNumber(overview.metrics.weekTokens), hint: `${formatNumber(overview.metrics.inputTokens)} 输入`, icon: BarChart3 },
    { label: "成本状态", value: formatCost(cost), hint: cost.rateConfigured ? "本地估算" : "待配置单价", icon: Sparkles },
    { label: "成功率", value: `${overview.metrics.successRate}%`, hint: "完成 / 失败", icon: CheckCircle2 },
    { label: "最近活跃", value: formatDate(overview.metrics.lastActiveAt), hint: "员工动态", icon: Timer },
  ];
  return (
    <div className="business-summary-strip">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div className="business-summary-item" key={item.label}>
            <Icon size={17} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <em>{item.hint}</em>
          </div>
        );
      })}
    </div>
  );
}

function WorkRecordSummary({ activity = {} }) {
  const summary = activity.summary || {};
  const stats = [
    { label: "活跃天数", value: `${formatNumber(activity.awakeDays || 0)} 天`, icon: CalendarDays },
    { label: "自动化", value: formatNumber(summary.automations || 0), icon: Zap },
    { label: "任务", value: formatNumber(summary.tasks || 0), icon: ListTodo },
    { label: "项目", value: formatNumber(summary.projects || 0), icon: FolderKanban },
  ];
  return (
    <div className="work-record-summary">
      {stats.map((item) => {
        const Icon = item.icon;
        return (
          <div className="work-record-stat" key={item.label}>
            <Icon size={17} />
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ActivityHeatmap({ days = [] }) {
  const monthLabels = [];
  let lastMonth = "";
  days.forEach((day) => {
    const month = day.date?.slice(5, 7);
    if (month && month !== lastMonth) {
      monthLabels.push(`${Number(month)}月`);
      lastMonth = month;
    }
  });
  return (
    <div className="activity-heatmap">
      <div className="activity-heatmap-head">
        <div>
          <span>Activity heatmap</span>
          <strong>365 天工作热力图</strong>
        </div>
        <div className="heatmap-legend">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((level) => <i key={level} className={`heat-${level}`} />)}
          <span>多</span>
        </div>
      </div>
      <div className="heatmap-scroll">
        <div className="heatmap-months">
          {monthLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
        </div>
        <div className="heatmap-body">
          <div className="heatmap-weekdays">
            <span>Mon</span>
            <span>Wed</span>
            <span>Fri</span>
          </div>
          <div className="heatmap-grid" aria-label="365 天工作热力图">
            {days.map((day) => (
              <span
                key={day.date}
                className={`heatmap-cell heat-${day.intensity || 0}`}
                title={`${day.date} 工作量：${day.count || 0}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MemoryGrowthPanel({ overview, onEditProfile, onOpenMemory, onBindSkill }) {
  const growth = overview.growth || { recent: [], learned: [], summary: {} };
  const recent = growth.recent || [];
  const learned = growth.learned || [];
  return (
    <section className="employee-panel memory-growth-panel">
      <div className="employee-panel-head">
        <div>
          <span>记忆与成长</span>
          <strong>记忆与成长</strong>
        </div>
        <button className="text-button" type="button" onClick={onOpenMemory}>
          <Brain size={15} />
          查看记忆
        </button>
      </div>
      <div className="growth-grid">
        <div className="growth-timeline">
          <div className="growth-column-title">
            <TrendingUp size={16} />
            最近成长
          </div>
          {recent.length === 0 ? (
            <div className="growth-empty">
              <strong>还没有成长动态</strong>
              <span>编辑档案、补充记忆或绑定技能后会出现第一条动态。</span>
              <button className="text-button" type="button" onClick={onEditProfile}>编辑档案</button>
            </div>
          ) : (
            recent.slice(0, 6).map((item) => <GrowthEventRow item={item} key={item.id || `${item.type}-${item.occurredAt}`} />)
          )}
        </div>
        <div className="learned-list">
          <div className="growth-column-title">
            <BookOpen size={16} />
            最近学习
          </div>
          {learned.length === 0 ? (
            <div className="growth-empty compact">
              <span>补充能力、记忆或技能后会形成学习摘要。</span>
              <button className="text-button" type="button" onClick={onBindSkill}>绑定技能</button>
            </div>
          ) : (
            learned.map((item, index) => (
              <div className="learned-item" key={`${item.title}-${item.detail}-${index}`}>
                <BadgeCheck size={15} />
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function GrowthEventRow({ item }) {
  return (
    <div className="growth-event-row">
      <span className={`growth-event-dot ${item.type || "activity"}`}>{growthTypeText(item.type).slice(0, 1)}</span>
      <div>
        <strong>{item.title || growthTypeText(item.type)}</strong>
        <span>{item.detail || "员工状态已更新。"}</span>
      </div>
      <em>{formatDate(item.occurredAt)}</em>
    </div>
  );
}

export default function WorkerDashboard({ onOpenChat }) {
  const [workers, setWorkers] = useState([]);
  const [activeWorkerId, setActiveWorkerId] = useState("");
  const [overviewById, setOverviewById] = useState({});
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("7d");
  const [activeTab, setActiveTab] = useState("overview");
  const [trendMode, setTrendMode] = useState("tokens");
  const [recordView, setRecordView] = useState("timeline");
  const [profileMode, setProfileMode] = useState("");
  const [profileDraft, setProfileDraft] = useState(emptyWorkerDraft());
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileDeleting, setProfileDeleting] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [workerPresets, setWorkerPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = async (workerId, nextRange = range) => {
    if (!workerId) return null;
    const overview = await getWorkerOverview(workerId, nextRange);
    setOverviewById((current) => ({ ...current, [workerId]: overview }));
    return overview;
  };

  const loadWorkers = async () => {
    setLoading(true);
    setError("");
    try {
      const list = await listWorkers();
      setWorkers(list);
      const nextActive = activeWorkerId || list[0]?.id || "";
      setActiveWorkerId(nextActive);
      const results = await Promise.allSettled(list.map((worker) => getWorkerOverview(worker.id, range)));
      const nextOverview = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled") nextOverview[list[index].id] = result.value;
      });
      setOverviewById(nextOverview);
    } catch (err) {
      setError(err.message || "数字员工读取失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkers();
    listWorkerPresets().then(setWorkerPresets).catch(() => setWorkerPresets([]));
  }, []);

  useEffect(() => {
    if (!activeWorkerId) return;
    setActiveTab("overview");
    loadOverview(activeWorkerId).catch((err) => setError(err.message || "看板读取失败"));
  }, [activeWorkerId, range]);

  const activeOverview = overviewById[activeWorkerId];
  const activeWorker = activeOverview?.worker || workers.find((worker) => worker.id === activeWorkerId);
  const overviewCost = activeOverview?.cost || {
    todayCost: 0,
    weekCost: 0,
    totalCost: 0,
    currency: "USD",
    estimated: false,
    rateConfigured: false,
  };
  const profileSummary = activeOverview?.profileSummary || {
    capabilities: [],
    workStyles: [],
    riskLabels: [],
    emptyHints: {
      capabilities: "补充核心能力后，员工主页会更像正式岗位档案。",
      workStyles: "补充工作风格后，执行边界会更清楚。",
      workRecord: "完成一次对话或任务后，会自动沉淀第一条工作记录。",
    },
  };
  const profileCompleteness = activeOverview?.profileCompleteness || { score: 0, missingFields: [], nextActions: [] };
  const activity = activeOverview?.activity || {
    awakeDays: 0,
    heatmapDays: [],
    summary: { automations: 0, tasks: 0, projects: 0, conversations: 0 },
  };
  const filteredWorkers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return workers;
    return workers.filter((worker) =>
      [worker.name, worker.description, worker.employeeType, worker.model]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [workers, query]);

  const openCreateWorker = () => {
    setProfileMode("create");
    setProfileDeleting(false);
    setProfileDraft({
      ...emptyWorkerDraft(),
      employeeType: "待配置",
      description: "准备配置身份、技能、记忆和工作规则。",
    });
    setProfileError("");
  };

  const openEditWorker = (worker) => {
    setProfileMode("edit");
    setProfileDeleting(false);
    setProfileDraft(emptyWorkerDraft(worker));
    setProfileError("");
  };

  const closeProfileEditor = () => {
    if (profileSaving || profileDeleting) return;
    setProfileMode("");
    setProfileError("");
  };

  const updateProfileDraft = (field, value) => {
    setProfileDraft((current) => ({ ...current, [field]: value }));
  };

  const applyWorkerPreset = (preset) => {
    setProfileDraft((current) => ({
      ...current,
      templateId: preset.id,
      name: preset.name,
      employeeType: preset.employeeType || "数字员工",
      description: preset.description || "",
      avatar: preset.avatar || current.avatar,
      color: preset.color || current.color,
      skills: preset.skills || [],
      skillLabels: preset.skillLabels || [],
      identity: preset.identity || "",
      persona: preset.persona || "",
      tools: preset.tools || "",
      memoryMd: preset.memoryMd || "",
      workStyles: preset.workStyles || "",
      coreCapabilities: preset.coreCapabilities || "",
      deliveryCommitments: preset.deliveryCommitments || "",
      userMd: preset.userMd || "",
    }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const name = profileDraft.name.trim();
    if (!name) {
      setProfileError("请先填写数字员工名称。");
      return;
    }

    const payload = {
      name,
      employeeType: profileDraft.employeeType.trim() || "数字员工",
      description: profileDraft.description.trim(),
      model: profileDraft.model.trim() || null,
    };
    if (profileMode === "create") {
      Object.assign(payload, {
        presetId: profileDraft.templateId,
        avatar: profileDraft.avatar || undefined,
        color: profileDraft.color || undefined,
        skills: profileDraft.skills || [],
        skillLabels: profileDraft.skillLabels || [],
        identity: profileDraft.identity,
        persona: profileDraft.persona,
        tools: profileDraft.tools,
        memoryMd: profileDraft.memoryMd,
        workStyles: profileDraft.workStyles,
        coreCapabilities: profileDraft.coreCapabilities,
        deliveryCommitments: profileDraft.deliveryCommitments,
        userMd: profileDraft.userMd,
      });
    }

    setProfileSaving(true);
    setProfileError("");
    try {
      const worker = profileMode === "create"
        ? await createWorker(payload)
        : await updateWorker(profileDraft.id, payload);
      setWorkers((current) => {
        const rest = current.filter((item) => item.id !== worker.id);
        if (profileMode === "create") return [worker, ...rest];
        return current.map((item) => (item.id === worker.id ? worker : item));
      });
      setActiveWorkerId(worker.id);
      setProfileMode("");
      await loadOverview(worker.id);
    } catch (err) {
      setProfileError(err.message || "保存失败，请稍后重试。");
    } finally {
      setProfileSaving(false);
    }
  };

  const deleteProfile = async () => {
    const workerId = profileDraft.id;
    if (!workerId) return;
    if (workerId === "worker-default") {
      setProfileError("默认数字员工用于兜底，不支持删除。");
      return;
    }

    setProfileDeleting(true);
    setProfileError("");
    try {
      await deleteWorker(workerId);
      const nextWorkers = workers.filter((worker) => worker.id !== workerId);
      setWorkers(nextWorkers);
      setOverviewById((current) => {
        const next = { ...current };
        delete next[workerId];
        return next;
      });
      const nextActive = activeWorkerId === workerId ? nextWorkers[0]?.id || "" : activeWorkerId;
      setActiveWorkerId(nextActive);
      setProfileMode("");
      if (nextActive) {
        await loadOverview(nextActive).catch((err) => setError(err.message || "看板读取失败"));
      }
    } catch (err) {
      setProfileError(err.message || "删除失败，请稍后重试。");
    } finally {
      setProfileDeleting(false);
    }
  };

  const maxTrendValue = Math.max(1, ...(activeOverview?.trend || []).map((item) => trendMode === "cost" ? item.cost : item.totalTokens));
  const inputShare = activeOverview?.metrics.totalTokens
    ? Math.round((activeOverview.metrics.inputTokens / activeOverview.metrics.totalTokens) * 100)
    : 0;
  const outputShare = Math.max(0, 100 - inputShare);

  return (
    <section className="employee-workbench">
      <aside className="employee-directory">
        <div className="employee-directory-head">
          <div>
            <span>数字员工</span>
            <strong>{workers.length} 位成员</strong>
          </div>
          <button className="icon-button" type="button" onClick={openCreateWorker} aria-label="新建数字员工">
            <Plus size={17} />
          </button>
        </div>

        <label className="employee-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索员工、模型、职责" />
        </label>

        <div className="employee-directory-list">
          {filteredWorkers.map((worker) => {
            const overview = overviewById[worker.id];
            const score = overview?.profileCompleteness?.score ?? 0;
            return (
              <button
                key={worker.id}
                className={`employee-directory-card ${worker.id === activeWorkerId ? "active" : ""}`}
                type="button"
                onClick={() => setActiveWorkerId(worker.id)}
              >
                <WorkerAvatar worker={worker} />
                <div>
                  <strong>{worker.name}</strong>
                  <span>{worker.employeeType || worker.description || "数字员工"}</span>
                </div>
                <div className="employee-directory-usage">
                  <em>{score}%</em>
                  <span>档案</span>
                  <small>今日 {formatNumber(overview?.metrics?.todayTokens || 0)} Token</small>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="employee-main">
        {loading && <EmptyState>正在读取数字员工看板...</EmptyState>}
        {error && !loading && <EmptyState>{error}</EmptyState>}
        {!loading && !activeWorker && (
          <div className="employee-empty empty-with-action">
            <span>还没有数字员工，请先新建一个。</span>
            <button className="primary-button" type="button" onClick={openCreateWorker}>
              <Plus size={16} />
              新建数字员工
            </button>
          </div>
        )}
        {!loading && activeWorker && activeOverview && (
          <>
            <header className="employee-home-grid">
              <section className="employee-profile-card employee-profile-wide">
                <div className="employee-profile-top">
                  <div className="employee-identity">
                    <WorkerAvatar worker={activeWorker} large />
                    <div className="employee-profile-main">
                      <div className="employee-kicker">
                        <span className="live-dot" />
                        {statusText(activeWorker.status)}
                        <span>{activeWorker.role || activeWorker.employeeType || "数字员工"}</span>
                        <span>员工 ID {activeWorker.id}</span>
                      </div>
                      <h2>{activeWorker.name}</h2>
                      <p>{activeWorker.description || "这个数字员工还没有填写说明。"}</p>
                    </div>
                  </div>
                  <div className="employee-actions">
                    <button className="ghost-button" type="button" onClick={() => openEditWorker(activeWorker)}>
                      <PenTool size={16} />
                      编辑档案
                    </button>
                    <button className="primary-button" type="button" onClick={() => onOpenChat?.(activeWorker.id)}>
                      <MessageSquare size={16} />
                      开始对话
                    </button>
                    <button className="ghost-button" type="button" onClick={() => setActiveTab("tasks")}>
                      <ListTodo size={16} />
                      新建任务
                    </button>
                    <button className="ghost-button" type="button" onClick={() => setActiveTab("skills")}>
                      <Puzzle size={16} />
                      绑定技能
                    </button>
                  </div>
                </div>

                <div className="employee-profile-meta-row">
                  <div className="employee-meta-cards">
                    <div className="meta-card"><span><UserRound size={11} />岗位</span><strong>{activeWorker.role || activeWorker.employeeType || "数字员工"}</strong></div>
                    <div className="meta-card"><span>模型</span><strong>{activeWorker.model || "默认"}</strong></div>
                    <div className="meta-card"><span>入职</span><strong>{formatDate(activeWorker.createdAt)}</strong></div>
                    <div className="meta-card"><span>最近活跃</span><strong>{formatDate(activeOverview.metrics.lastActiveAt)}</strong></div>
                    <div className="meta-card"><span><Brain size={11} />记忆</span><strong>{activeOverview.memory.count}</strong></div>
                    <div className="meta-card"><span><Puzzle size={11} />技能</span><strong>{activeOverview.skills.count}</strong></div>
                    <div className="meta-card"><span><MessageSquare size={11} />会话</span><strong>{activeOverview.metrics.conversationCount || 0}</strong></div>
                    <div className="meta-card"><span><ListTodo size={11} />任务</span><strong>{activeOverview.metrics.taskCount || 0}</strong></div>
                  </div>
                  <ProfileCompleteness
                    profileCompleteness={profileCompleteness}
                    onEdit={() => openEditWorker(activeWorker)}
                    onBindSkill={() => setActiveTab("skills")}
                  />
                </div>

                <BusinessSummaryStrip overview={activeOverview} cost={overviewCost} />

                <div className="profile-summary-grid">
                  <SummaryList
                    title="核心能力"
                    items={profileSummary.capabilities}
                    empty={profileSummary.emptyHints.capabilities}
                  />
                  <SummaryList
                    title="工作风格"
                    items={profileSummary.workStyles}
                    empty={profileSummary.emptyHints.workStyles}
                  />
                  <SummaryList
                    title="风险状态"
                    items={profileSummary.riskLabels}
                    empty="暂无风险标签"
                    compact
                  />
                </div>
              </section>
            </header>

            <section className="employee-panel work-ledger-panel">
              <div className="employee-panel-head">
                <div>
                  <span>工作记录</span>
                  <strong>工作履历</strong>
                </div>
                <div className="range-toggle" aria-label="工作记录视图">
                  <button className={recordView === "timeline" ? "active" : ""} type="button" onClick={() => setRecordView("timeline")}>时间线</button>
                  <button className={recordView === "tasks" ? "active" : ""} type="button" onClick={() => setRecordView("tasks")}>任务</button>
                </div>
              </div>
              <WorkRecordSummary activity={activity} />
              <ActivityHeatmap days={activity.heatmapDays || []} />
              <div className="work-record-detail-head">
                <strong>{recordView === "timeline" ? "最近工作时间线" : "任务状态分组"}</strong>
                <span>完成对话、绑定技能、创建任务后会产生更完整的工作记录。</span>
              </div>
              <WorkRecord
                view={recordView}
                overview={activeOverview}
              />
            </section>

            <div className="employee-dashboard-grid">
              <section className="employee-panel usage-panel">
                <div className="employee-panel-head">
                  <div>
                    <span>消耗与价值</span>
                    <strong>{trendMode === "cost" ? "成本趋势" : "Token 趋势"}</strong>
                  </div>
                  <div className="panel-head-actions">
                    <div className="range-toggle" aria-label="时间范围">
                      <button className={range === "7d" ? "active" : ""} type="button" onClick={() => setRange("7d")}>7 天</button>
                      <button className={range === "30d" ? "active" : ""} type="button" onClick={() => setRange("30d")}>30 天</button>
                    </div>
                    <div className="range-toggle" aria-label="趋势指标">
                      <button className={trendMode === "tokens" ? "active" : ""} type="button" onClick={() => setTrendMode("tokens")}>Token</button>
                      <button className={trendMode === "cost" ? "active" : ""} type="button" onClick={() => setTrendMode("cost")}>成本</button>
                    </div>
                  </div>
                </div>
                {!overviewCost.rateConfigured && trendMode === "cost" && (
                  <div className="cost-note">模型单价未配置，成本趋势暂显示为 0。</div>
                )}
                <div className="usage-bars">
                  {activeOverview.trend.map((item) => (
                    <div className="usage-bar" key={item.date}>
                      <div className="usage-bar-track">
                        <span style={{ height: `${Math.max(4, (((trendMode === "cost" ? item.cost : item.totalTokens) || 0) / maxTrendValue) * 100)}%` }} />
                      </div>
                      <strong>{item.label}</strong>
                      <em>{trendMode === "cost" ? formatMoney(item.cost, overviewCost.currency) : item.runs}</em>
                    </div>
                  ))}
                </div>
                <div className="token-split compact">
                  <div>
                    <span>输入 Token</span>
                    <strong>{formatNumber(activeOverview.metrics.inputTokens)}</strong>
                  </div>
                  <div>
                    <span>输出 Token</span>
                    <strong>{formatNumber(activeOverview.metrics.outputTokens)}</strong>
                  </div>
                </div>
                <div className="token-share" aria-label="输入输出 Token 占比">
                  <span style={{ width: `${inputShare}%` }} />
                  <em style={{ width: `${outputShare}%` }} />
                </div>
              </section>

              <MemoryGrowthPanel
                overview={activeOverview}
                onEditProfile={() => openEditWorker(activeWorker)}
                onOpenMemory={() => setActiveTab("memory")}
                onBindSkill={() => setActiveTab("skills")}
              />
            </div>

            <section className="employee-resources">
              <div className="employee-tabs" role="tablist">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      className={activeTab === tab.id ? "active" : ""}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <Icon size={15} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <ResourcePanel overview={activeOverview} activeTab={activeTab} />
            </section>
          </>
        )}
      </div>
      {profileMode && (
        <WorkerProfileDialog
          draft={profileDraft}
          mode={profileMode}
          error={profileError}
          saving={profileSaving}
          deleting={profileDeleting}
          deleteDisabled={profileDraft.id === "worker-default"}
          presets={workerPresets}
          onChange={updateProfileDraft}
          onApplyPreset={applyWorkerPreset}
          onClose={closeProfileEditor}
          onSave={saveProfile}
          onDelete={deleteProfile}
        />
      )}
    </section>
  );
}

function ResourcePanel({ overview, activeTab }) {
  const resources = overview.resources || {};
  if (activeTab === "overview") {
    return (
      <div className="resource-grid">
        <ResourceStat icon={FolderKanban} label="项目" value={overview.metrics.projectCount} />
        <ResourceStat icon={Zap} label="自动化" value={overview.metrics.automationCount} />
        <ResourceStat icon={MessageSquare} label="会话" value={overview.metrics.conversationCount} />
        <ResourceStat icon={Brain} label="记忆" value={overview.memory.count} />
        <ResourceStat icon={Puzzle} label="绑定技能" value={overview.skills.count} />
        <ResourceStat icon={Link2} label="连接器" value={resources.connectors?.length || 0} />
      </div>
    );
  }

  if (activeTab === "tasks") {
    const items = [...(resources.tasks || []), ...(resources.runs || [])].slice(0, 12);
    return <SimpleRows items={items} empty="暂无任务" getTitle={(item) => item.name || item.agentName || item.title || item.id} getMeta={(item) => `${statusText(item.status)} · ${formatDate(item.updatedAt || item.finishedAt || item.createdAt)}`} />;
  }

  if (activeTab === "automations") {
    return <SimpleRows items={resources.automations || []} empty="暂无自动化" getTitle={(item) => item.name} getMeta={(item) => `${item.enabled === false ? "已停用" : "启用"} · ${item.triggerKind || "manual"}`} />;
  }

  if (activeTab === "memory") {
    return (
      <div className="memory-preview">
        {overview.memory.preview.length === 0 && <EmptyState>暂无记忆</EmptyState>}
        {overview.memory.preview.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
      </div>
    );
  }

  if (activeTab === "skills") {
    const labels = overview.skills.labels || [];
    const items = (overview.skills.bound || []).map((id, index) => ({ id, name: labels[index] || id }));
    return <SimpleRows items={items} empty="暂未绑定技能" getTitle={(item) => item.name} getMeta={(item) => item.id} />;
  }

  if (activeTab === "connectors") {
    return <SimpleRows items={resources.connectors || []} empty="暂无连接器" getTitle={(item) => item.name} getMeta={(item) => `${item.type || "generic"} · ${item.enabled === false ? "停用" : "启用"}`} />;
  }

  return (
    <div className="permission-summary">
      <strong>{overview.permissions.summary}</strong>
      {Object.entries(overview.permissions.items || {}).map(([key, value]) => (
        <div key={key}>
          <span>{key}</span>
          <em>{String(value)}</em>
        </div>
      ))}
    </div>
  );
}

function ResourceStat({ icon: Icon, label, value }) {
  return (
    <div className="resource-stat">
      <Icon size={18} />
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function SimpleRows({ items, empty, getTitle, getMeta }) {
  if (!items.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="simple-row-list">
      {items.map((item, index) => (
        <div className="simple-row" key={item.id || item.sourceId || `${getTitle(item)}-${index}`}>
          <strong>{getTitle(item)}</strong>
          <span>{getMeta(item)}</span>
        </div>
      ))}
    </div>
  );
}
