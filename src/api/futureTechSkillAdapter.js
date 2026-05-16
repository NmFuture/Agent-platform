import { runSteps } from "../data/platformData";

export function createDemoRun(agentId) {
  return {
    id: `run-${agentId}-${Date.now()}`,
    agentId,
    status: "running",
    startedAt: new Date().toISOString(),
    steps: runSteps.map((step, index) => ({
      ...step,
      state: index === 0 ? "running" : "pending",
    })),
  };
}

export function advanceDemoRun(run, activeIndex) {
  return {
    ...run,
    status: activeIndex >= run.steps.length - 1 ? "completed" : "running",
    steps: run.steps.map((step, index) => {
      if (index < activeIndex) return { ...step, state: "done" };
      if (index === activeIndex) return { ...step, state: "running" };
      return { ...step, state: "pending" };
    }),
  };
}

export const backendContract = {
  createTask: "POST /futuretech-admin/agent-runs",
  getTask: "GET /futuretech-admin/agent-runs/:id",
  saveAgent: "POST /futuretech-admin/agents",
  createBlueprint: "POST /futuretech-admin/agent-blueprints/from-skill",
  listSkills: "GET /futuretech-admin/skills",
  runtimeStatus: "GET /futuretech-admin/runtime-status",
};
