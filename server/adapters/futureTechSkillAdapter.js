/**
 * Backend adapter sketch.
 *
 * Keep the FutureTech runtime behind the platform API. The frontend should only know
 * agent-run IDs, streamed events, approval gates, and output artifacts.
 */

export function buildFutureTechTask({ agentId, files, parameters }) {
  const skillPlan = resolveSkillPlan(agentId);

  return {
    agentId,
    files,
    parameters,
    skillPlan,
    runtime: "FutureTech",
    expectedArtifacts: ["execution-report.json", "draft.docx", "review-report.docx"],
  };
}

export function resolveSkillPlan(agentId) {
  const plans = {
    bid: [
      "bid-tender-parser",
      "bid-outline-planner",
      "gap-fact-builder",
      "material-retriever",
      "docx-assembler",
      "compliance-reviewer",
    ],
    compare: ["document-diff", "clause-risk-check", "evidence-citation"],
    report: ["report-outline", "case-retrieval", "technical-writing"],
  };

  return plans[agentId] ?? ["generic-agent-runner"];
}
