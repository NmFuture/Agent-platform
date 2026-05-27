import React from "react";
import { Plus, MessageSquare, Trash2 } from "lucide-react";

export default function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
}) {
  return (
    <div className="conversation-list">
      <div className="conversation-list-header">
        <span>对话历史</span>
        <button className="icon-btn" type="button" onClick={onCreate} title="新建对话">
          <Plus size={16} />
        </button>
      </div>
      <div className="conversation-items">
        {conversations.length === 0 && (
          <div className="conversation-empty">暂无对话</div>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item ${conv.id === activeConversationId ? "active" : ""}`}
            onClick={() => onSelect(conv.id)}
          >
            <MessageSquare size={14} />
            <span className="conversation-item-title">{conv.title || "新对话"}</span>
            <button
              className="conversation-item-delete"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
              title="删除"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
