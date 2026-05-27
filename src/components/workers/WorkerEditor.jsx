import React, { useState, useEffect } from "react";
import { X, Plus, Trash2 } from "lucide-react";

export default function WorkerEditor({ worker, skills, onSave, onClose }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    rolePrompt: "",
    skills: [],
    model: "",
    memory: [],
  });
  const [memoryKey, setMemoryKey] = useState("");
  const [memoryValue, setMemoryValue] = useState("");

  useEffect(() => {
    if (worker) {
      setForm({
        name: worker.name || "",
        description: worker.description || "",
        rolePrompt: worker.rolePrompt || "",
        skills: worker.skills || [],
        model: worker.model || "",
        memory: worker.memory || [],
      });
    }
  }, [worker]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const toggleSkill = (skillId) => {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(skillId)
        ? f.skills.filter((s) => s !== skillId)
        : [...f.skills, skillId],
    }));
  };

  const addMemory = () => {
    if (!memoryKey.trim()) return;
    setForm((f) => ({
      ...f,
      memory: [...f.memory, { key: memoryKey.trim(), value: memoryValue.trim() }],
    }));
    setMemoryKey("");
    setMemoryValue("");
  };

  const removeMemory = (key) => {
    setForm((f) => ({
      ...f,
      memory: f.memory.filter((m) => m.key !== key),
    }));
  };

  const handleSave = () => {
    onSave({
      name: form.name,
      description: form.description,
      rolePrompt: form.rolePrompt,
      skills: form.skills,
      model: form.model || null,
      memory: form.memory,
    });
  };

  if (!worker) return null;

  return (
    <div className="worker-editor-overlay">
      <div className="worker-editor">
        <div className="worker-editor-header">
          <h3>数字员工配置</h3>
          <button className="icon-btn" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="worker-editor-body">
          <label className="field-label">
            名称
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="例如：合同审查官"
            />
          </label>

          <label className="field-label">
            描述
            <input
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="一句话描述这个员工的能力"
            />
          </label>

          <label className="field-label wide">
            人设 / 身份
            <textarea
              value={form.rolePrompt}
              onChange={(e) => update("rolePrompt", e.target.value)}
              placeholder="定义这个数字员工的角色、能力和行为准则..."
              rows={5}
            />
          </label>

          <div className="field-label wide">
            绑定 Skill
            <div className="skill-checkbox-list">
              {skills.length === 0 && (
                <div className="skill-empty">暂无可用 Skill</div>
              )}
              {skills.map((skill) => (
                <label key={skill.id} className="skill-checkbox">
                  <input
                    type="checkbox"
                    checked={form.skills.includes(skill.id)}
                    onChange={() => toggleSkill(skill.id)}
                  />
                  <span>{skill.name || skill.id}</span>
                  <em>{skill.category}</em>
                </label>
              ))}
            </div>
          </div>

          <div className="field-label wide">
            记忆
            <div className="memory-list">
              {form.memory.map((m) => (
                <div key={m.key} className="memory-item">
                  <span className="memory-key">{m.key}</span>
                  <span className="memory-value">{m.value}</span>
                  <button
                    className="icon-btn small"
                    type="button"
                    onClick={() => removeMemory(m.key)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="memory-add">
              <input
                value={memoryKey}
                onChange={(e) => setMemoryKey(e.target.value)}
                placeholder="键（如：偏好）"
                className="memory-input"
              />
              <input
                value={memoryValue}
                onChange={(e) => setMemoryValue(e.target.value)}
                placeholder="值"
                className="memory-input"
              />
              <button className="icon-btn" type="button" onClick={addMemory}>
                <Plus size={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="worker-editor-footer">
          <button className="ghost-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="button" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
