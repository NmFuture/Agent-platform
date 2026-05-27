import React, { useState, useRef, useEffect } from "react";
import { Send, Square } from "lucide-react";

export default function ChatInput({ onSend, isStreaming, onAbort }) {
  const [input, setInput] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="chat-input-wrap">
      <div className="chat-input-box">
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          rows={1}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button className="chat-send-btn abort" type="button" onClick={onAbort} title="停止">
            <Square size={16} />
          </button>
        ) : (
          <button
            className="chat-send-btn"
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim()}
            title="发送"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
