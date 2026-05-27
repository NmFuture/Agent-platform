import React from "react";
import { Plus, Bot, FileText, PenTool, Briefcase, Mail, Code, Settings, ExternalLink } from "lucide-react";

const iconMap = { Bot, FileText, PenTool, Briefcase, Mail, Code, Settings };
const colorMap = {
  blue: "#3b82f6", teal: "#14b8a6", green: "#22c55e",
  amber: "#f59e0b", purple: "#a855f7", rose: "#f43f5e",
};

export default function WorkerList({
  workers,
  activeWorkerId,
  onSelect,
  onCreate,
  onEdit,
  onOpenHome,
}) {
  return (
    <div className="worker-list">
      <div className="worker-list-header">
        <span>数字员工</span>
        <button className="icon-btn" type="button" onClick={onCreate} title="新建数字员工" aria-label="新建数字员工">
          <Plus size={16} />
        </button>
      </div>
      <div className="worker-items">
        {workers.map((worker) => {
          const Icon = iconMap[worker.avatar] || Bot;
          const color = colorMap[worker.color] || colorMap.blue;
          return (
            <div
              key={worker.id}
              className={`worker-card ${worker.id === activeWorkerId ? "active" : ""}`}
              onClick={() => onSelect(worker.id)}
            >
              <div className="worker-avatar" style={{ background: `${color}20`, color }}>
                <Icon size={18} />
              </div>
              <div className="worker-info">
                <div className="worker-name">{worker.name}</div>
                <div className="worker-desc">{worker.description || "暂无描述"}</div>
              </div>
              <button
                className="worker-edit-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenHome(worker.id);
                }}
                title="编辑档案"
                aria-label={`编辑 ${worker.name} 档案`}
              >
                <Settings size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
