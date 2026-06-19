import React, { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, CheckCircle2 } from "lucide-react";

export default function ToolCallCard({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = !!toolCall.result;

  return (
    <div className="tool-call-card">
      <button
        className="tool-call-header"
        type="button"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {hasResult ? (
          <CheckCircle2 size={14} className="tool-call-icon done" />
        ) : (
          <Loader2 size={14} className="tool-call-icon spinning" />
        )}
        <span className="tool-call-name">{toolCall.name || "工具调用"}</span>
      </button>
      {expanded && (
        <div className="tool-call-detail">
          {toolCall.args && Object.keys(toolCall.args).length > 0 && (
            <div className="tool-call-section">
              <strong>参数</strong>
              <pre>{JSON.stringify(toolCall.args, null, 2)}</pre>
            </div>
          )}
          {hasResult && (
            <div className="tool-call-section">
              <strong>结果</strong>
              <pre>{typeof toolCall.result === "string" ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
