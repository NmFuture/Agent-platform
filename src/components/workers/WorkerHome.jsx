import React, { useState, useEffect } from "react";
import {
  Home, FolderKanban, ListTodo, Zap, Brain, Puzzle, Link2, Shield,
  Plus, Settings, Play, Pause, Trash2, Edit3, ExternalLink, RefreshCw,
} from "lucide-react";

const TABS = [
  { id: "home", label: "主页", icon: Home },
  { id: "project", label: "项目", icon: FolderKanban },
  { id: "task", label: "任务", icon: ListTodo },
  { id: "triggers", label: "自动化", icon: Zap },
  { id: "memory", label: "记忆", icon: Brain },
  { id: "skill", label: "技能", icon: Puzzle },
  { id: "connector", label: "连接器", icon: Link2 },
  { id: "permissions", label: "权限", icon: Shield },
];

export default function WorkerHome({ workerId, onBack, onOpenChat }) {
  const [activeTab, setActiveTab] = useState("home");
  const [worker, setWorker] = useState(null);
  const [projects, setProjects] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [connectors, setConnectors] = useState([]);
  const [editingMd, setEditingMd] = useState(null);
  const [mdContent, setMdContent] = useState("");
  const [loading, setLoading] = useState(true);

  const API = `/futuretech-admin/workers/${workerId}`;

  useEffect(() => {
    loadWorker();
  }, [workerId]);

  const loadWorker = async () => {
    setLoading(true);
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setWorker(data.worker);
      // Load sub-resources in parallel
      const [projRes, trigRes, taskRes, connRes] = await Promise.all([
        fetch(`${API}/projects`).then(r => r.json()).catch(() => ({ projects: [] })),
        fetch(`${API}/triggers`).then(r => r.json()).catch(() => ({ triggers: [] })),
        fetch(`${API}/tasks`).then(r => r.json()).catch(() => ({ tasks: [] })),
        fetch(`${API}/connectors`).then(r => r.json()).catch(() => ({ connectors: [] })),
      ]);
      setProjects(projRes.projects || []);
      setTriggers(trigRes.triggers || []);
      setTasks(taskRes.tasks || []);
      setConnectors(connRes.connectors || []);
    } catch (e) {
      console.error("Failed to load worker:", e);
    }
    setLoading(false);
  };

  const loadMarkdown = async (filename) => {
    const res = await fetch(`${API}/markdown/${filename}`);
    const data = await res.json();
    setEditingMd(filename);
    setMdContent(data.content || "");
  };

  const saveMarkdown = async () => {
    if (!editingMd) return;
    await fetch(`${API}/markdown/${editingMd}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: mdContent }),
    });
    setEditingMd(null);
    loadWorker();
  };

  const createProject = async () => {
    const name = prompt("项目名称:");
    if (!name) return;
    await fetch(`${API}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    loadWorker();
  };

  const createTrigger = async () => {
    const name = prompt("触发器名称:");
    if (!name) return;
    const promptText = prompt("执行提示词:");
    await fetch(`${API}/triggers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, prompt: promptText || "" }),
    });
    loadWorker();
  };

  const deleteTrigger = async (id) => {
    await fetch(`${API}/triggers/${id}`, { method: "DELETE" });
    loadWorker();
  };

  const createConnector = async () => {
    const name = prompt("连接器名称:");
    if (!name) return;
    const type = prompt("类型 (github/jira/slack/generic):") || "generic";
    await fetch(`${API}/connectors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, type }),
    });
    loadWorker();
  };

  const deleteConnector = async (id) => {
    await fetch(`${API}/connectors/${id}`, { method: "DELETE" });
    loadWorker();
  };

  if (loading || !worker) {
    return <div className="worker-home-loading">加载中...</div>;
  }

  const md = worker.markdowns || {};

  return (
    <div className="worker-home">
      {/* Header */}
      <div className="worker-home-header">
        <button className="ghost-button" onClick={onBack}>← 返回</button>
        <div className="worker-home-title">
          <h2>{worker.name}</h2>
          <span>{worker.description}</span>
        </div>
        <button className="primary-button" onClick={() => onOpenChat(workerId)}>
          开始对话
        </button>
      </div>

      {/* Tabs */}
      <div className="worker-tabs" role="tablist">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`worker-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="worker-tab-content">

        {/* ─── Home Tab ─── */}
        {activeTab === "home" && (
          <div className="worker-section-grid">
            <div className="worker-section-card">
              <h3><FolderKanban size={16} /> 项目</h3>
              <p>{projects.length} 个项目</p>
              <ul>{projects.slice(0, 3).map((p) => <li key={p.id}>{p.name}</li>)}</ul>
            </div>
            <div className="worker-section-card">
              <h3><Zap size={16} /> 自动化</h3>
              <p>{triggers.length} 个触发器</p>
              <ul>{triggers.slice(0, 3).map((t) => <li key={t.id}>{t.name}</li>)}</ul>
            </div>
            <div className="worker-section-card">
              <h3><ListTodo size={16} /> 任务</h3>
              <p>{tasks.length} 个任务</p>
            </div>
            <div className="worker-section-card">
              <h3><Brain size={16} /> 记忆</h3>
              <p>{(md.MEMORY || "").split("\n").filter(l => l.startsWith("- ")).length} 条记忆</p>
            </div>
            <div className="worker-section-card">
              <h3><Puzzle size={16} /> 技能</h3>
              <p>{(worker.availableSkills || []).length} 个可用技能</p>
            </div>
            <div className="worker-section-card">
              <h3><Link2 size={16} /> 连接器</h3>
              <p>{connectors.length} 个连接器</p>
            </div>

            {/* Markdown files overview */}
            <div className="worker-section-card wide">
              <h3><Settings size={16} /> 配置文件</h3>
              <div className="md-file-list">
                {["IDENTITY", "PERSONA", "TOOLS", "MEMORY", "WORK_STYLES", "BIBLE", "CORE_CAPABILITIES", "DELIVERY_COMMITMENTS", "USER"].map((name) => (
                  <button
                    key={name}
                    className="md-file-btn"
                    onClick={() => loadMarkdown(`${name}.md`)}
                  >
                    <Edit3 size={13} />
                    <span>{name}</span>
                    <em>{(md[name] || "").length > 0 ? "已配置" : "空"}</em>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── Project Tab ─── */}
        {activeTab === "project" && (
          <div className="worker-list-view">
            <div className="worker-list-header">
              <h3>项目</h3>
              <button className="primary-button compact" onClick={createProject}>
                <Plus size={14} /> 新建项目
              </button>
            </div>
            {projects.length === 0 && <div className="worker-empty">暂无项目</div>}
            {projects.map((p) => (
              <div key={p.id} className="worker-list-item">
                <FolderKanban size={16} />
                <div>
                  <strong>{p.name}</strong>
                  <span>{p.description || p.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Task Tab ─── */}
        {activeTab === "task" && (
          <div className="worker-list-view">
            <div className="worker-list-header">
              <h3>任务</h3>
            </div>
            {tasks.length === 0 && <div className="worker-empty">暂无任务</div>}
            {tasks.map((t) => (
              <div key={t.id} className="worker-list-item">
                <ListTodo size={16} />
                <div>
                  <strong>{t.prompt?.slice(0, 60) || t.id}</strong>
                  <span>{t.status} · {t.createdAt}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Triggers Tab ─── */}
        {activeTab === "triggers" && (
          <div className="worker-list-view">
            <div className="worker-list-header">
              <h3>自动化</h3>
              <button className="primary-button compact" onClick={createTrigger}>
                <Plus size={14} /> 新建触发器
              </button>
            </div>
            {triggers.length === 0 && <div className="worker-empty">暂无触发器</div>}
            {triggers.map((t) => (
              <div key={t.id} className="worker-list-item">
                <Zap size={16} />
                <div className="worker-list-item-body">
                  <strong>{t.name}</strong>
                  <span>{t.triggerKind} · {t.enabled ? "启用" : "禁用"} · 运行 {t.runCount} 次</span>
                </div>
                <div className="worker-list-item-actions">
                  <button className="icon-btn" onClick={() => deleteTrigger(t.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Memory Tab ─── */}
        {activeTab === "memory" && (
          <div className="worker-list-view">
            <div className="worker-list-header">
              <h3>记忆</h3>
              <button className="ghost-button compact" onClick={() => loadMarkdown("MEMORY.md")}>
                <Edit3 size={14} /> 编辑
              </button>
            </div>
            <div className="memory-content">
              {(md.MEMORY || "").split("\n").filter(l => l.trim()).map((line, i) => (
                <div key={i} className="memory-line">{line}</div>
              ))}
              {!(md.MEMORY || "").trim() && <div className="worker-empty">暂无记忆</div>}
            </div>
          </div>
        )}

        {/* ─── Skill Tab ─── */}
        {activeTab === "skill" && (
          <div className="worker-list-view">
            <div className="worker-list-header">
              <h3>技能</h3>
            </div>
            {(worker.availableSkills || []).length === 0 && <div className="worker-empty">暂无可用技能</div>}
            {(worker.availableSkills || []).map((s) => (
              <div key={s.id} className="worker-list-item">
                <Puzzle size={16} />
                <div>
                  <strong>{s.name || s.id}</strong>
                  <span>{s.description || s.category}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Connector Tab ─── */}
        {activeTab === "connector" && (
          <div className="worker-list-view">
            <div className="worker-list-header">
              <h3>连接器</h3>
              <button className="primary-button compact" onClick={createConnector}>
                <Plus size={14} /> 新建连接器
              </button>
            </div>
            {connectors.length === 0 && <div className="worker-empty">暂无连接器</div>}
            {connectors.map((c) => (
              <div key={c.id} className="worker-list-item">
                <Link2 size={16} />
                <div className="worker-list-item-body">
                  <strong>{c.name}</strong>
                  <span>{c.type} · {c.enabled ? "启用" : "禁用"}</span>
                </div>
                <div className="worker-list-item-actions">
                  <button className="icon-btn" onClick={() => deleteConnector(c.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Permissions Tab ─── */}
        {activeTab === "permissions" && (
          <div className="worker-list-view">
            <div className="worker-list-header">
              <h3>权限</h3>
            </div>
            <div className="permissions-grid">
              <div className="permission-item">
                <strong>文件操作</strong>
                <span>允许读写项目文件</span>
              </div>
              <div className="permission-item">
                <strong>命令执行</strong>
                <span>允许执行 Shell 命令</span>
              </div>
              <div className="permission-item">
                <strong>网络访问</strong>
                <span>默认禁用</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Markdown Editor Modal */}
      {editingMd && (
        <div className="worker-editor-overlay">
          <div className="worker-editor" style={{ width: 700, maxHeight: "80vh" }}>
            <div className="worker-editor-header">
              <h3>{editingMd}</h3>
              <button className="icon-btn" onClick={() => setEditingMd(null)}>✕</button>
            </div>
            <div className="worker-editor-body">
              <textarea
                value={mdContent}
                onChange={(e) => setMdContent(e.target.value)}
                style={{ width: "100%", minHeight: 400, fontFamily: "monospace", fontSize: 13 }}
              />
            </div>
            <div className="worker-editor-footer">
              <button className="ghost-button" onClick={() => setEditingMd(null)}>取消</button>
              <button className="primary-button" onClick={saveMarkdown}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
