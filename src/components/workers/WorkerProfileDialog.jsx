import React, { useEffect, useState } from "react";
import {
  Bot,
  Briefcase,
  Code,
  FileText,
  FolderOpen,
  Headphones,
  Mail,
  Megaphone,
  Microscope,
  PenTool,
  Scale,
  Settings,
  Trash2,
  X,
} from "lucide-react";

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

export function emptyWorkerDraft(worker = null) {
  return {
    id: worker?.id || "",
    templateId: worker?.templateId || "",
    name: worker?.name || "",
    employeeType: worker?.employeeType || worker?.role || "",
    description: worker?.description || "",
    model: worker?.model || "",
    avatar: worker?.avatar || "",
    color: worker?.color || "",
    skills: Array.isArray(worker?.skills) ? worker.skills : [],
    skillLabels: Array.isArray(worker?.skillLabels) ? worker.skillLabels : [],
    identity: worker?.identity || "",
    persona: worker?.persona || "",
    tools: worker?.tools || "",
    memoryMd: worker?.memoryMd || "",
    workStyles: worker?.workStyles || "",
    coreCapabilities: worker?.coreCapabilities || "",
    deliveryCommitments: worker?.deliveryCommitments || "",
    userMd: worker?.userMd || "",
  };
}

export default function WorkerProfileDialog({
  draft,
  mode,
  error,
  saving,
  deleting,
  deleteDisabled,
  presets = [],
  onChange,
  onApplyPreset,
  onClose,
  onSave,
  onDelete,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
  }, [draft.id, mode]);

  const canDelete = mode === "edit" && onDelete;

  return (
    <div className="employee-editor-overlay" role="presentation">
      <form className="employee-profile-dialog" onSubmit={onSave}>
        <div className="employee-profile-dialog-head">
          <div>
            <span>{mode === "create" ? "新建数字员工" : "编辑员工档案"}</span>
            <strong>{mode === "create" ? "设置一个可识别的员工名称" : "更新名称、岗位和简介"}</strong>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </div>

        <div className="employee-profile-form">
          {mode === "create" && presets.length > 0 && (
            <div className="employee-template-section">
              <div className="employee-template-head">
                <span>常用员工模板</span>
                <strong>选择后会自动带入岗位、技能和档案摘要</strong>
              </div>
              <div className="employee-template-grid">
                {presets.map((preset) => (
                  (() => {
                    const Icon = iconMap[preset.avatar] || Bot;
                    return (
                      <button
                        className={`employee-template-card ${draft.templateId === preset.id ? "active" : ""}`}
                        key={preset.id}
                        type="button"
                        onClick={() => onApplyPreset?.(preset)}
                      >
                        <span className="employee-template-icon" aria-hidden="true">
                          <Icon size={24} />
                        </span>
                        <span className="employee-template-copy">
                          <strong>{preset.name}</strong>
                          <small>{preset.employeeType}</small>
                          <p>{preset.description}</p>
                          <em>{(preset.skillLabels || preset.skills || []).slice(0, 3).join("、") || "待绑定技能"}</em>
                        </span>
                      </button>
                    );
                  })()
                ))}
              </div>
            </div>
          )}
          <label className="employee-field">
            <span>员工名称</span>
            <input
              autoFocus
              value={draft.name}
              onChange={(event) => onChange("name", event.target.value)}
              placeholder="例如：投标数字员工、合同数字员工"
              maxLength={32}
            />
          </label>
          <label className="employee-field">
            <span>岗位 / 角色</span>
            <input
              value={draft.employeeType}
              onChange={(event) => onChange("employeeType", event.target.value)}
              placeholder="例如：投标助理、科研助理、客服助理"
              maxLength={40}
            />
          </label>
          <label className="employee-field wide">
            <span>一句话简介</span>
            <textarea
              value={draft.description}
              onChange={(event) => onChange("description", event.target.value)}
              placeholder="描述这个数字员工负责什么、适合处理哪些工作"
              rows={4}
              maxLength={180}
            />
          </label>
          <label className="employee-field wide">
            <span>指定模型</span>
            <input
              value={draft.model}
              onChange={(event) => onChange("model", event.target.value)}
              placeholder="留空则使用当前默认模型"
              maxLength={80}
            />
          </label>
          <div className="employee-editor-note">
            名称会立即同步到员工列表、主页、对话选择器和本地状态。
          </div>
          {error && <div className="employee-inline-error">{error}</div>}
        </div>

        <div className="employee-profile-dialog-foot">
          <div className="employee-profile-danger-zone">
            {canDelete && deleteDisabled && <span>默认数字员工不能删除</span>}
            {canDelete && !deleteDisabled && !confirmDelete && (
              <button className="danger-button subtle" type="button" onClick={() => setConfirmDelete(true)} disabled={saving || deleting}>
                <Trash2 size={15} />
                删除员工
              </button>
            )}
            {canDelete && !deleteDisabled && confirmDelete && (
              <div className="delete-confirm-inline">
                <span>确认删除这个员工？</span>
                <button className="danger-button" type="button" onClick={onDelete} disabled={saving || deleting}>
                  {deleting ? "删除中..." : "确认删除"}
                </button>
                <button className="ghost-button compact-button" type="button" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                  取消
                </button>
              </div>
            )}
          </div>
          <div className="dialog-foot-actions">
            <button className="ghost-button" type="button" onClick={onClose} disabled={saving || deleting}>
              取消
            </button>
            <button className="primary-button" type="submit" disabled={saving || deleting}>
              {saving ? "保存中..." : mode === "create" ? "创建员工" : "保存档案"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
