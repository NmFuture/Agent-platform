const API_BASE = "/futuretech-admin";

export async function listConversations(workerId) {
  const params = workerId ? `?workerId=${encodeURIComponent(workerId)}` : "";
  const res = await fetch(`${API_BASE}/conversations${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).conversations || [];
}

export async function getConversation(id) {
  const res = await fetch(`${API_BASE}/conversations/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).conversation;
}

export async function createConversation(workerId, title) {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workerId, title }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).conversation;
}

export async function deleteConversation(id) {
  const res = await fetch(`${API_BASE}/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json());
}
