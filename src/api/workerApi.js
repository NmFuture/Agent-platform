const API_BASE = "/futuretech-admin";

export async function listWorkers() {
  const res = await fetch(`${API_BASE}/workers`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).workers || [];
}

export async function getWorker(id) {
  const res = await fetch(`${API_BASE}/workers/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).worker;
}

export async function getWorkerOverview(id, range = "7d") {
  const res = await fetch(`${API_BASE}/workers/${id}/overview?range=${encodeURIComponent(range)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function createWorker(data) {
  const res = await fetch(`${API_BASE}/workers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).worker;
}

export async function updateWorker(id, data) {
  const res = await fetch(`${API_BASE}/workers/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).worker;
}

export async function deleteWorker(id) {
  const res = await fetch(`${API_BASE}/workers/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json());
}

export async function updateWorkerMemory(workerId, action, key, value) {
  const res = await fetch(`${API_BASE}/workers/${workerId}/memory`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, key, value }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).memory || [];
}
