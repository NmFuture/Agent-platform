import React, { useState, useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import ConversationList from "./ConversationList";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import WorkerList from "../workers/WorkerList";
import WorkerProfileDialog, { emptyWorkerDraft } from "../workers/WorkerProfileDialog";
import { useChatStreaming } from "../../hooks/useChatStreaming";
import { listWorkers, listWorkerPresets, createWorker, updateWorker } from "../../api/workerApi";
import { listConversations, getConversation, createConversation, deleteConversation } from "../../api/chatApi";

export default function ChatView({ initialWorkerId = "", onWorkerChange }) {
  const [workers, setWorkers] = useState([]);
  const [activeWorkerId, setActiveWorkerId] = useState(initialWorkerId || "");
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [skills, setSkills] = useState([]);
  const [profileMode, setProfileMode] = useState("");
  const [profileDraft, setProfileDraft] = useState(emptyWorkerDraft());
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [workerPresets, setWorkerPresets] = useState([]);
  const messagesEndRef = useRef(null);

  const { messages, setMessages, isStreaming, error, sendMessage, abort, clearMessages } =
    useChatStreaming();

  useEffect(() => {
    listWorkers().then((w) => {
      setWorkers(w);
      if (w.length > 0 && !activeWorkerId) setActiveWorkerId(initialWorkerId || w[0].id);
    });
    listWorkerPresets().then(setWorkerPresets).catch(() => setWorkerPresets([]));
    fetch("/futuretech-admin/skills").then((r) => r.json()).then((d) => setSkills(d.skills || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeWorkerId) return;
    onWorkerChange?.(activeWorkerId);
    setActiveConversationId("");
    clearMessages();
    listConversations(activeWorkerId).then(setConversations).catch(() => {});
  }, [activeWorkerId]);

  useEffect(() => {
    if (initialWorkerId && initialWorkerId !== activeWorkerId) {
      setActiveWorkerId(initialWorkerId);
    }
  }, [initialWorkerId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleCreateConversation = async () => {
    if (!activeWorkerId) return;
    const conv = await createConversation(activeWorkerId);
    setActiveConversationId(conv.id);
    clearMessages();
    setConversations((prev) => [conv, ...prev]);
  };

  const handleSelectConversation = async (convId) => {
    setActiveConversationId(convId);
    try { const conv = await getConversation(convId); setMessages(conv.messages || []); }
    catch { clearMessages(); }
  };

  const handleDeleteConversation = async (convId) => {
    await deleteConversation(convId);
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeConversationId === convId) { setActiveConversationId(""); clearMessages(); }
  };

  const handleSendMessage = async (content) => {
    let convId = activeConversationId;
    if (!convId) {
      const conv = await createConversation(activeWorkerId);
      convId = conv.id;
      setActiveConversationId(convId);
      setConversations((prev) => [conv, ...prev]);
    }
    sendMessage(convId, content);
  };

  const handleCreateWorker = async () => {
    setProfileMode("create");
    setProfileDraft({
      ...emptyWorkerDraft(),
      employeeType: "待配置",
      description: "准备配置身份、技能、记忆和工作规则。",
    });
    setProfileError("");
  };

  const handleEditWorker = (workerId) => {
    const worker = workers.find((item) => item.id === workerId);
    if (!worker) return;
    setProfileMode("edit");
    setProfileDraft(emptyWorkerDraft(worker));
    setProfileError("");
  };

  const closeProfileEditor = () => {
    if (profileSaving) return;
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
        if (profileMode === "create") return [worker, ...current.filter((item) => item.id !== worker.id)];
        return current.map((item) => (item.id === worker.id ? worker : item));
      });
      setActiveWorkerId(worker.id);
      setProfileMode("");
    } catch (err) {
      setProfileError(err.message || "保存失败，请稍后重试。");
    } finally {
      setProfileSaving(false);
    }
  };

  const activeWorker = workers.find((w) => w.id === activeWorkerId);

  return (
    <div className="chat-view">
      <div className="chat-sidebar">
        <WorkerList
          workers={workers}
          activeWorkerId={activeWorkerId}
          onSelect={setActiveWorkerId}
          onCreate={handleCreateWorker}
          onOpenHome={handleEditWorker}
        />
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={handleSelectConversation}
          onCreate={handleCreateConversation}
          onDelete={handleDeleteConversation}
        />
      </div>

      <div className="chat-main">
        <div className="chat-header">
          <div className="chat-header-info">
            <MessageSquare size={18} />
            <span>{activeWorker?.name || "选择数字员工"}</span>
          </div>
        </div>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-welcome">
              <h3>{activeWorker?.name || "开始对话"}</h3>
              <p>{activeWorker?.description || "选择一个数字员工，或新建对话开始交流。"}</p>
            </div>
          )}
          {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
          {isStreaming && messages.length > 0 && messages[messages.length - 1].role === "assistant" && messages[messages.length - 1].content === "" && (
            <div className="chat-thinking">
              <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && <div className="chat-error">{error}</div>}
        <ChatInput onSend={handleSendMessage} isStreaming={isStreaming} onAbort={abort} />
      </div>
      {profileMode && (
        <WorkerProfileDialog
          draft={profileDraft}
          mode={profileMode}
          error={profileError}
          saving={profileSaving}
          presets={workerPresets}
          onChange={updateProfileDraft}
          onApplyPreset={applyWorkerPreset}
          onClose={closeProfileEditor}
          onSave={saveProfile}
        />
      )}
    </div>
  );
}
