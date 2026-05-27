import React, { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";

export function emptyWorkerDraft(worker = null) {
  return {
    id: worker?.id || "",
    name: worker?.name || "",
    employeeType: worker?.employeeType || worker?.role || "",
    description: worker?.description || "",
    model: worker?.model || "",
  };
}

export default function WorkerProfileDialog({
  draft,
  mode,
  error,
  saving,
  deleting,
  deleteDisabled,
  onChange,
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
          <label className="employee-field">
            <span>员工名称</span>
            <input
              autoFocus
              value={draft.name}
              onChange={(event) => onChange("name", event.target.value)}
              placeholder="例如：合同审查官、投标材料专员"
              maxLength={32}
            />
          </label>
          <label className="employee-field">
            <span>岗位 / 角色</span>
            <input
              value={draft.employeeType}
              onChange={(event) => onChange("employeeType", event.target.value)}
              placeholder="例如：合同风控、标书助理、数据分析"
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
