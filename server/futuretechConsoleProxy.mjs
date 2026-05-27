import http from "node:http";
import { execFile } from "node:child_process";
import net from "node:net";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const target = new URL(process.env.FUTURETECH_CONSOLE_TARGET || "http://127.0.0.1:4096");
const port = Number(process.env.FUTURETECH_CONSOLE_PROXY_PORT || 5175);
const opencodeConfigPath = join(homedir(), ".config", "opencode", "opencode.json");
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const runtimeDir = join(root, ".runtime");
const statePath = join(runtimeDir, "services.json");
const agentosStatePath = join(runtimeDir, "agentos-state.json");
const runLogDir = join(runtimeDir, "agentos-runs");
const workersDir = join(runtimeDir, "workers");
const conversationsDir = join(runtimeDir, "conversations");
const bundledSkillRoot = join(root, "skills");
const runtimePort = Number(target.port || 4096);
const runtimeHost = target.hostname || "127.0.0.1";
const opencodeSkillRoots = [
  ...(process.env.FUTURETECH_SKILL_ROOTS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolve(item)),
  bundledSkillRoot,
  join(homedir(), ".opencode", "skills"),
  join(root, ".opencode", "skills"),
].filter((item, index, list) => list.indexOf(item) === index);
const bundledContractSkillRoot = join(bundledSkillRoot, "contract-e2e-excel");
const userContractSkillRoot = join(homedir(), ".opencode", "skills", "contract-e2e-excel");
const contractSkillRoot = resolve(
  process.env.FUTURETECH_CONTRACT_SKILL_ROOT ||
    (existsSync(join(bundledContractSkillRoot, "scripts", "contract_pdf_to_excel.py"))
      ? bundledContractSkillRoot
      : userContractSkillRoot)
);
const contractSkillScript = join(contractSkillRoot, "scripts", "contract_pdf_to_excel.py");
const bundledPython = join(
  homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "python",
  "bin",
  "python3"
);
const pythonCommand = process.env.FUTURETECH_PYTHON || (existsSync(bundledPython) ? bundledPython : "python3");
const requestBodyLimitBytes = 80 * 1024 * 1024;
const productModelCatalog = {
  "seuapi/gpt-5.4": {
    label: "GPT-5.4",
    providerName: "SEU API",
    description: "当前主力模型。",
    order: 10,
  },
  "minimax/MiniMax-M2.7": {
    label: "MiniMax M2.7",
    providerName: "MiniMax",
    description: "保留唯一可用的 MiniMax 模型。",
    order: 20,
  },
  "siliconflow-cn/Qwen/Qwen3.5-397B-A17B": {
    label: "Qwen3.5 满血版",
    providerName: "硅基流动",
    description: "千问 3.5 最大参数版本。",
    order: 30,
  },
  "siliconflow-cn/Pro/moonshotai/Kimi-K2.6": {
    label: "Kimi K2.6 满血版",
    providerName: "硅基流动",
    description: "Kimi K2.6 Pro 版本。",
    order: 40,
  },
  "deepseek/deepseek-v4-pro": {
    label: "DeepSeek V4 Pro",
    providerName: "DeepSeek 官方",
    description: "DeepSeek 官方 V4 Pro 模型。",
    order: 50,
  },
};

const defaultAgents = [
  {
    id: "contract-extraction",
    name: "合同提取智能体",
    shortName: "合同",
    owner: "经营中心 / 法务",
    status: "可运行",
    category: "合同与表格",
    marketplace: true,
    runnable: true,
    description: "输入一份风电设备采购合同 PDF，按合同分解规则输出完整 5-sheet Excel 工作簿。",
    rolePrompt:
      "你是风电设备采购合同抽取专员，负责把合同 PDF 按规则抽取成可复核的 Excel。必须保留原文依据、位置、状态和置信度；找不到依据时标记 not_found、ambiguous 或 not_applicable，不编造结论。",
    businessGoal: "合同 PDF 转 5-sheet Excel",
    skills: ["contract-e2e-excel"],
    knowledgeBases: ["合同分解规则 V1.7", "内置 Excel 输出模板"],
    model: "",
    permissions: {
      filesystem: "project-and-inputs",
      terminal: "runner-only",
      network: "disabled-by-default",
      artifacts: "write-runtime",
    },
    inputSchema: [
      {
        id: "pdf",
        label: "合同 PDF",
        type: "file",
        accept: ".pdf,application/pdf",
        required: true,
        description: "上传需要抽取的合同 PDF。",
      },
    ],
    outputSchema: [
      {
        id: "excel",
        label: "合同抽取结果 Excel",
        type: "xlsx",
        required: true,
        description: "包含类型1-类型5共 5 个业务 sheet。",
      },
      {
        id: "summary",
        label: "抽取统计",
        type: "json",
        required: true,
        description: "类型1命中统计和类型2-5行数。",
      },
    ],
    runner: {
      type: "skill-script",
      skillId: "contract-e2e-excel",
      command: pythonCommand,
      script: contractSkillScript,
      cwd: root,
      outputDirMode: "per-run",
    },
    validation: ["xlsx-openable", "five-contract-sheets", "summary-json"],
    outputPolicy: "必须输出 Excel 产物路径、类型1命中统计、类型2-5行数和需要人工复核的说明。",
  },
];

const defaultSecurityPolicy = {
  version: 1,
  updatedAt: new Date().toISOString(),
  runtimeConsole: "full-access",
  defaultRunMode: "approval-gated",
  rules: [
    {
      id: "runtime-full-console",
      scope: "FutureTech Console",
      decision: "完整保留",
      detail: "Console 入口保留文件、会话、终端、Skill、MCP、事件流和项目上下文能力。",
    },
    {
      id: "agent-skill-allowlist",
      scope: "业务 Agent",
      decision: "按 Agent 白名单调用",
      detail: "业务 Agent 只能默认使用自身绑定的 Skill，临时追加 Skill 要写入运行记录。",
    },
    {
      id: "human-gates",
      scope: "高风险动作",
      decision: "需要人工确认",
      detail: "外部承诺、文件覆盖、终端命令、敏感资料导出和正式交付产物必须留痕。",
    },
    {
      id: "brand-boundary",
      scope: "对外展示",
      decision: "AgentOS 外壳品牌隔离",
      detail: "AgentOS 外壳只展示 FutureTech 体系；完整 Console 透明嵌入，不改写 Runtime 客户端协议。",
    },
  ],
};

function stripThinkBlocks(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, "")
    .replace(/^<\/think>\s*/i, "")
    .trimStart();
}

function rewriteFutureTechText(text) {
  const branded = text
    .replace(/\bopen\s*code\b/gi, "FutureTech")
    .replace(/\bopencode\b/gi, "FutureTech")
    .replace(/\bOpenCode\b/g, "FutureTech")
    .replace(/\bopenCode\b/g, "FutureTech");

  const trimmed = branded.trim();
  const identityPatterns = [
    /^我是\s*FutureTech(?:[，,。.\s]|$)/i,
    /^我是\s*(?:MiniMax|GPT|OpenAI|Claude|AI\s*编程助手|AI助手|一个\s*AI)/i,
    /^I am\s*(?:FutureTech|OpenCode|Open Code|MiniMax|GPT|OpenAI|Claude)/i,
    /^I'm\s*(?:FutureTech|OpenCode|Open Code|MiniMax|GPT|OpenAI|Claude)/i,
  ];

  if (
    trimmed.length <= 220 &&
    identityPatterns.some((pattern) => pattern.test(trimmed))
  ) {
    return "我是 FutureTech，由宁梦未来科技自主研发的智能体。";
  }

  return branded;
}

function maskSecret(value = "") {
  if (!value) return "";
  if (value.length <= 12) return "****";
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function sanitizeJsonValue(value, key = "") {
  if (typeof value === "string") {
    if (/api[-_]?key|token|secret|authorization/i.test(key)) {
      return maskSecret(value);
    }

    return rewriteFutureTechText(stripThinkBlocks(value));
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item, key));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([itemKey, item]) => [
        itemKey,
        sanitizeJsonValue(item, itemKey),
      ])
    );
  }

  return value;
}

function readOpencodeConfig() {
  return JSON.parse(readFileSync(opencodeConfigPath, "utf8"));
}

function writeOpencodeConfig(config) {
  writeFileSync(opencodeConfigPath, `${JSON.stringify(config, null, 2)}\n`);
}

function compactMarkdown(text = "") {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_>#~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  return Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z0-9_-]+):\s*"?(.+?)"?\s*$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value])
  );
}

function extractSection(content, headingPattern) {
  const lines = content.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => headingPattern.test(line));
  if (startIndex < 0) return "";
  const collected = [];

  for (const line of lines.slice(startIndex + 1)) {
    if (/^#{1,6}\s+/.test(line)) break;
    collected.push(line);
  }

  return collected.join("\n").trim();
}

function extractFirstParagraph(content) {
  const withoutFrontmatter = content.replace(/^---\s*\n[\s\S]*?\n---/, "");
  const paragraphs = withoutFrontmatter
    .split(/\n\s*\n/)
    .map((paragraph) => compactMarkdown(paragraph))
    .filter((paragraph) => paragraph && !paragraph.startsWith("#"));

  return paragraphs[0] || "";
}

function extractFeatureList(content) {
  const section = extractSection(content, /^#{2,3}\s*(核心特性|功能列表|Features|Capabilities)\s*$/i);
  const items = section
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
      return match ? compactMarkdown(match[1]) : "";
    })
    .filter(Boolean);

  return [...new Set(items)].slice(0, 4);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function labelSkillRoot(skillRoot) {
  if (skillRoot === bundledSkillRoot) {
    return "内置 Skill";
  }

  if (skillRoot.startsWith(homedir())) {
    return skillRoot.replace(homedir(), "~");
  }

  return skillRoot;
}

const skillCategoryRules = [
  {
    id: "contract-bid",
    label: "合同与标书",
    keywords: ["合同", "标书", "投标", "bid", "contract", "clause", "tender", "excel"],
  },
  {
    id: "document-table",
    label: "文档与表格",
    keywords: ["docx", "pdf", "xlsx", "spreadsheet", "document", "word", "ppt", "slide", "office", "表格", "文档"],
  },
  {
    id: "research-writing",
    label: "研究写作",
    keywords: ["paper", "research", "arxiv", "citation", "review", "论文", "研究", "文献"],
  },
  {
    id: "code-dev",
    label: "开发与代码",
    keywords: ["code", "dev", "bug", "debug", "tdd", "architecture", "frontend", "backend", "mcp", "代码", "开发"],
  },
  {
    id: "content-publish",
    label: "内容发布",
    keywords: ["wechat", "weibo", "xhs", "twitter", "markdown", "html", "cover", "comic", "post", "发布", "图片"],
  },
  {
    id: "automation-integration",
    label: "自动化与集成",
    keywords: ["lark", "feishu", "workflow", "n8n", "calendar", "mail", "task", "自动化", "飞书"],
  },
  {
    id: "data-analysis",
    label: "数据分析",
    keywords: ["analyze", "results", "experiment", "csv", "data", "统计", "分析"],
  },
  {
    id: "system-tool",
    label: "系统工具",
    keywords: ["git", "release", "install", "setup", "monitor", "browser", "chrome", "系统", "工具"],
  },
];

function inferSkillCategory(skill) {
  const text = `${skill.id || ""} ${skill.name || ""} ${skill.description || ""} ${skill.path || ""}`.toLowerCase();
  return (
    skillCategoryRules.find((category) =>
      category.keywords.some((keyword) => text.includes(keyword.toLowerCase()))
    ) || { id: "other", label: "其他能力", keywords: [] }
  );
}

function inferSkillIo(skill) {
  const text = `${skill.id || ""} ${skill.name || ""} ${skill.description || ""}`.toLowerCase();
  if (text.includes("contract") || text.includes("合同")) return { inputs: ["PDF"], outputs: ["Excel", "抽取统计"] };
  if (text.includes("pdf")) return { inputs: ["PDF"], outputs: ["文档结果"] };
  if (text.includes("docx") || text.includes("word")) return { inputs: ["Word / 文档"], outputs: ["DOCX / 文档结果"] };
  if (text.includes("xlsx") || text.includes("spreadsheet") || text.includes("excel")) return { inputs: ["表格 / 数据"], outputs: ["Excel / 分析结果"] };
  if (text.includes("image") || text.includes("图片")) return { inputs: ["文本 / 图片"], outputs: ["图片 / 视觉素材"] };
  if (text.includes("paper") || text.includes("research") || text.includes("论文")) return { inputs: ["研究主题 / 文献"], outputs: ["论文 / 综述 / 计划"] };
  if (text.includes("code") || text.includes("bug") || text.includes("dev")) return { inputs: ["代码仓库 / 需求"], outputs: ["代码变更 / 审查结果"] };
  return { inputs: ["任务说明"], outputs: ["执行结果"] };
}

function enrichSkill(skill) {
  const category = inferSkillCategory(skill);
  const io = inferSkillIo(skill);
  return {
    ...skill,
    category: category.label,
    categoryId: category.id,
    inputs: skill.inputs || io.inputs,
    outputs: skill.outputs || io.outputs,
    tags: [...new Set([category.label, ...(skill.features || []).slice(0, 2)])],
  };
}

function buildSkillCatalogPayload(source, roots, skills) {
  const enrichedSkills = skills.map(enrichSkill).sort((left, right) =>
    `${left.category}/${left.name}`.localeCompare(`${right.category}/${right.name}`)
  );
  const categoryCounts = new Map();
  for (const skill of enrichedSkills) {
    categoryCounts.set(skill.categoryId, {
      id: skill.categoryId,
      label: skill.category,
      count: (categoryCounts.get(skill.categoryId)?.count || 0) + 1,
    });
  }
  return {
    source,
    roots,
    count: enrichedSkills.length,
    categories: [...categoryCounts.values()].sort((left, right) => right.count - left.count),
    skills: enrichedSkills,
  };
}

function parseSkillFile(skillPath, id, skillRoot) {
  const content = readFileSync(skillPath, "utf8");
  const frontmatter = readFrontmatter(content);
  const headingName = content.match(/^#\s+(.+)$/m)?.[1];
  const overview = compactMarkdown(extractSection(content, /^#{2,3}\s*(概述|Overview|Description|说明)\s*$/i));
  const version =
    frontmatter.version ||
    content.match(/当前版本[:：]\s*\*{0,2}([^\s*]+)/)?.[1] ||
    "内置版本";
  const stats = statSync(skillPath);

  return enrichSkill({
    id,
    name: compactMarkdown(frontmatter.name || headingName || id),
    description:
      compactMarkdown(frontmatter.description || overview || extractFirstParagraph(content)) ||
      "FutureTech Skill。",
    version,
    status: "可用",
    source: "FutureTech",
    sourceRoot: labelSkillRoot(skillRoot),
    path: skillPath,
    updated: formatDate(stats.mtime),
    features: extractFeatureList(content),
  });
}

function skillRootFromLocation(location = "") {
  const index = location.indexOf("/skills/");
  if (index >= 0) return location.slice(0, index + "/skills".length);
  return dirname(location);
}

function sourceNameFromRoot(skillRoot = "") {
  if (skillRoot === bundledSkillRoot) return "FutureTech Skills";
  if (skillRoot.includes("/.agents/skills")) return "Agents Skills";
  if (skillRoot.includes("/.claude/skills")) return "Claude Skills";
  if (skillRoot.includes("/.opencode/skills")) return "FutureTech Skills";
  return "Skill Path";
}

function parseVersion(content = "") {
  const frontmatter = readFrontmatter(content);
  return (
    frontmatter.version ||
    content.match(/当前版本[:：]\s*\*{0,2}([^\s*]+)/)?.[1] ||
    content.match(/^version:\s*"?(.+?)"?\s*$/m)?.[1] ||
    "运行时版本"
  );
}

function buildRuntimeSkill(item) {
  const location = item.location || "";
  const skillRoot = skillRootFromLocation(location);
  const id = location.includes("/skills/")
    ? location.split("/skills/")[1].split("/")[0]
    : item.name;
  let updated = "";

  try {
    if (location && existsSync(location)) updated = formatDate(statSync(location).mtime);
  } catch {
    updated = "";
  }

  return enrichSkill({
    id,
    name: compactMarkdown(item.name || id),
    description:
      compactMarkdown(item.description || extractFirstParagraph(item.content || "")) ||
      "FutureTech Runtime 已加载的 Skill。",
    version: parseVersion(item.content || ""),
    status: "已加载",
    source: sourceNameFromRoot(skillRoot),
    sourceRoot: labelSkillRoot(skillRoot),
    path: location,
    updated,
    features: extractFeatureList(item.content || ""),
  });
}

function listLocalOpencodeSkillFiles() {
  const roots = opencodeSkillRoots.map((skillRoot) => ({
    path: skillRoot,
    label: labelSkillRoot(skillRoot),
    exists: existsSync(skillRoot),
  }));

  const skills = roots.flatMap((skillRoot) => {
    if (!skillRoot.exists) return [];

    return readdirSync(skillRoot.path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const skillPath = join(skillRoot.path, entry.name, "SKILL.md");
        if (!existsSync(skillPath)) return null;

        try {
          return parseSkillFile(skillPath, entry.name, skillRoot.path);
        } catch (error) {
          return {
            id: entry.name,
            name: entry.name,
            description: "Skill 配置读取失败，请检查 SKILL.md。",
            version: "未知",
            status: "需检查",
            source: "FutureTech",
            sourceRoot: skillRoot.label,
            path: skillPath,
            updated: "",
            features: [error.message],
          };
        }
      })
      .filter(Boolean);
  });

  return buildSkillCatalogPayload(
    "local-scan",
    roots,
    skills.sort((left, right) => left.id.localeCompare(right.id))
  );
}

async function listOpencodeSkills() {
  const localCatalog = listLocalOpencodeSkillFiles();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${target.origin}/skill`, { signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) {
      const runtimeSkills = await response.json();
      if (Array.isArray(runtimeSkills)) {
        const skills = runtimeSkills.map(buildRuntimeSkill);
        const rootMap = new Map();

        for (const skill of skills) {
          if (!rootMap.has(skill.sourceRoot)) {
            rootMap.set(skill.sourceRoot, {
              path: skillRootFromLocation(skill.path),
              label: skill.sourceRoot,
              exists: true,
              count: 0,
            });
          }
          rootMap.get(skill.sourceRoot).count += 1;
        }

        const byId = new Map(skills.map((skill) => [skill.id, skill]));
        for (const skill of localCatalog.skills || []) {
          if (!byId.has(skill.id) || String(skill.path || "").startsWith(bundledSkillRoot)) {
            byId.set(skill.id, skill);
          }
        }
        const roots = [...rootMap.values(), ...(localCatalog.roots || [])].filter(
          (rootItem, index, list) =>
            list.findIndex((item) => `${item.path || ""}|${item.label || ""}` === `${rootItem.path || ""}|${rootItem.label || ""}`) === index
        );
        return buildSkillCatalogPayload("futuretech-runtime+bundled", roots, [...byId.values()]);
      }
    }
  } catch {
    // If the runtime is not ready, fall back to the local compatibility scan.
  }

  return localCatalog;
}

async function readRuntimeProviderCatalog() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${target.origin}/provider`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function configuredProviderToRuntimeShape(providerID, provider = {}) {
  return {
    id: providerID,
    name: provider.name || providerID,
    source: "config",
    env: [],
    options: provider.options || {},
    models: provider.models || {},
  };
}

function modelLimitSummary(model = {}) {
  const limit = model.limit || {};
  return {
    context: limit.context || null,
    output: limit.output || null,
  };
}

function modelCapabilitySummary(model = {}) {
  const capabilities = model.capabilities || {};
  return {
    reasoning: Boolean(capabilities.reasoning),
    toolcall: Boolean(capabilities.toolcall),
    attachment: Boolean(capabilities.attachment),
    imageInput: Boolean(capabilities.input?.image),
    pdfInput: Boolean(capabilities.input?.pdf),
    audioInput: Boolean(capabilities.input?.audio),
    videoInput: Boolean(capabilities.input?.video),
  };
}

function filterProviderCatalogForProduct(catalog) {
  if (!catalog || typeof catalog !== "object") return catalog;
  const allowedByProvider = new Map();
  for (const [modelName, meta] of Object.entries(productModelCatalog)) {
    const slash = modelName.indexOf("/");
    if (slash < 0) continue;
    const providerID = modelName.slice(0, slash);
    const modelID = modelName.slice(slash + 1);
    if (!allowedByProvider.has(providerID)) allowedByProvider.set(providerID, new Map());
    allowedByProvider.get(providerID).set(modelID, meta);
  }

  const filterProvider = (provider) => {
    const allowedModels = allowedByProvider.get(provider?.id);
    if (!provider || !allowedModels) return null;
    const models = {};
    for (const [modelID, model] of Object.entries(provider.models || {})) {
      const productModel = allowedModels.get(modelID);
      if (!productModel) continue;
      models[modelID] = {
        ...model,
        name: productModel.label || model.name || modelID,
      };
    }
    if (Object.keys(models).length === 0) return null;
    const providerDisplayName = [...allowedModels.values()].find((item) => item.providerName)?.providerName;
    return {
      ...provider,
      name: providerDisplayName || provider.name,
      models,
    };
  };

  const all = (Array.isArray(catalog.all) ? catalog.all : [])
    .map(filterProvider)
    .filter(Boolean);
  const allowedProviderIDs = new Set(all.map((provider) => provider.id));
  return {
    ...catalog,
    all,
    default: Object.fromEntries(all.map((provider) => [provider.id, provider])),
    connected: (Array.isArray(catalog.connected) ? catalog.connected : []).filter((providerID) =>
      allowedProviderIDs.has(providerID)
    ),
  };
}

async function buildModelProfileState(config) {
  const activeModel = config.model || "";
  const catalog = await readRuntimeProviderCatalog();
  const connectedProviders = new Set(Array.isArray(catalog?.connected) ? catalog.connected : []);
  const providerMap = new Map();

  for (const provider of Array.isArray(catalog?.all) ? catalog.all : []) {
    if (provider?.id) providerMap.set(provider.id, provider);
  }

  for (const [providerID, provider] of Object.entries(config.provider || {})) {
    if (!providerMap.has(providerID)) {
      providerMap.set(providerID, configuredProviderToRuntimeShape(providerID, provider));
    }
  }

  const profiles = [];
  const providers = [];

  for (const [providerID, provider] of providerMap.entries()) {
    const configuredProvider = config.provider?.[providerID];
    const models = provider.models || {};
    const modelEntries = Object.entries(models);
    const connected = connectedProviders.has(providerID) || provider.source === "config" || Boolean(configuredProvider);
    const providerProfiles = [];
    const providerName = rewriteFutureTechText(provider.name || configuredProvider?.name || providerID);
    const baseURL = provider.options?.baseURL || configuredProvider?.options?.baseURL || "";
    const apiKeyMasked = maskSecret(provider.options?.apiKey || configuredProvider?.options?.apiKey || "");

    for (const [modelID, model] of modelEntries) {
      const modelName = `${providerID}/${modelID}`;
      const productModel = productModelCatalog[modelName];
      if (!productModel) continue;
      providerProfiles.push({
        id: modelName,
        label: productModel.label || rewriteFutureTechText(model.name || modelID),
        providerID,
        providerName: productModel.providerName || providerName,
        providerSource: provider.source || (configuredProvider ? "config" : "catalog"),
        modelID,
        modelName,
        displayModelName: rewriteFutureTechText(modelName),
        family: model.family || "",
        status: model.status || "",
        releaseDate: model.release_date || model.releaseDate || "",
        description: productModel.description || model.description || "",
        order: productModel.order || 999,
        active: activeModel === modelName,
        available: connected,
        connected,
        configured: Boolean(configuredProvider),
        baseURL,
        apiKeyMasked,
        limit: modelLimitSummary(model),
        capabilities: modelCapabilitySummary(model),
      });
    }

    if (providerProfiles.length === 0) continue;
    providers.push({
      id: providerID,
      name: providerProfiles[0]?.providerName || providerName,
      source: provider.source || (configuredProvider ? "config" : "catalog"),
      configured: Boolean(configuredProvider),
      connected,
      available: connected,
      modelCount: providerProfiles.length,
      baseURL,
      apiKeyMasked,
    });
    profiles.push(...providerProfiles);
  }

  providers.sort((left, right) => {
    const rank = (provider) => (provider.connected ? 0 : 1) + (provider.configured ? -1 : 0);
    return rank(left) - rank(right) || left.name.localeCompare(right.name);
  });

  profiles.sort((left, right) => {
    const rank = (profile) =>
      (profile.active ? -10 : 0) +
      (profile.available ? 0 : 20) +
      (profile.configured ? -2 : 0);
    return rank(left) - rank(right) || (left.order || 999) - (right.order || 999) || left.providerName.localeCompare(right.providerName) || left.label.localeCompare(right.label);
  });

  return {
    activeModel,
    restartRequired: false,
    catalogSource: catalog ? "runtime-provider" : "config",
    providerCount: providers.length,
    modelCount: profiles.length,
    connectedProviderCount: providers.filter((provider) => provider.connected).length,
    configuredProviderCount: providers.filter((provider) => provider.configured).length,
    providers,
    profiles,
  };
}

function isRunnableAgent(agent) {
  return Boolean(agent?.runner || agent?.id === "contract-extraction");
}

function normalizeAgent(agent) {
  const skills = Array.isArray(agent.skills) ? agent.skills : [];
  const inputSchema = Array.isArray(agent.inputSchema) ? agent.inputSchema : [];
  const outputSchema = Array.isArray(agent.outputSchema) ? agent.outputSchema : [];
  return {
    ...agent,
    skills,
    inputSchema,
    outputSchema,
    knowledgeBases: Array.isArray(agent.knowledgeBases) ? agent.knowledgeBases : [],
    validation: Array.isArray(agent.validation) ? agent.validation : [],
    marketplace: agent.marketplace !== false,
    runnable: isRunnableAgent(agent),
  };
}

function normalizeContractAgent(agent = {}) {
  const base = defaultAgents[0];
  return normalizeAgent({
    ...base,
    ...agent,
    id: base.id,
    skills: base.skills,
    knowledgeBases: base.knowledgeBases,
    permissions: base.permissions,
    inputSchema: base.inputSchema,
    outputSchema: base.outputSchema,
    runner: base.runner,
    validation: base.validation,
    outputPolicy: base.outputPolicy,
    marketplace: true,
    runnable: true,
  });
}

function normalizeAgentList(storedAgents = []) {
  const byId = new Map(defaultAgents.map((agent) => [agent.id, normalizeAgent(agent)]));
  for (const agent of storedAgents) {
    if (!agent?.id || !isRunnableAgent(agent)) continue;
    const normalized =
      agent.id === defaultAgents[0].id
        ? normalizeContractAgent(agent)
        : normalizeAgent({ ...byId.get(agent.id), ...agent });
    byId.set(agent.id, normalized);
  }
  return [...byId.values()].filter((agent) => agent.runnable);
}

function slugifyId(value = "agent") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "agent";
}

function buildAgentBlueprintFromSkill(skill) {
  if (skill?.id === "contract-e2e-excel") return normalizeAgent(defaultAgents[0]);

  const id = `agent-${slugifyId(skill?.id || skill?.name || "custom")}`;
  return normalizeAgent({
    id,
    name: `${skill?.name || skill?.id || "自定义"} Agent`,
    shortName: "自定",
    owner: "业务部门",
    status: "草稿",
    category: skill?.category || "自定义",
    marketplace: false,
    description: `围绕 ${skill?.name || skill?.id || "选定 Skill"} 封装的业务 Agent。`,
    businessGoal: skill?.description || "调用绑定 Skill 完成业务任务。",
    rolePrompt: `你是一个围绕「${skill?.name || skill?.id || "选定 Skill"}」工作的业务 Agent。先确认输入，再调用绑定 Skill，最后交付可追踪的结果和产物路径。`,
    skills: [skill?.id || "custom-skill"].filter(Boolean),
    knowledgeBases: [],
    permissions: {
      filesystem: "project-and-inputs",
      terminal: "approval-required",
      network: "disabled-by-default",
      artifacts: "write-runtime",
    },
    inputSchema: (skill?.inputs || ["任务说明"]).map((item, index) => ({
      id: index === 0 ? "task" : `input${index + 1}`,
      label: item,
      type: index === 0 ? "text" : "text",
      required: index === 0,
    })),
    outputSchema: (skill?.outputs || ["执行结果"]).map((item, index) => ({
      id: index === 0 ? "result" : `output${index + 1}`,
      label: item,
      type: "artifact",
      required: index === 0,
    })),
    runner: {
      type: "runtime-prompt",
      skillId: skill?.id || "",
    },
    validation: ["runtime-completed"],
    outputPolicy: "输出执行摘要、关键依据、结果产物路径和需要人工复核的事项。",
  });
}

function makeDefaultAgentosState() {
  return {
    version: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    agents: defaultAgents.map(normalizeAgent),
    runs: [],
    workers: [
      {
        id: "worker-default",
        name: "通用助手",
        avatar: "Bot",
        color: "blue",
        description: "通用 AI 助手，可处理各类任务。",
        rolePrompt: "你是宁梦未来的通用 AI 助手。你可以帮助用户完成各类任务，包括文档处理、数据分析、代码编写等。请用中文回复。",
        skills: [],
        model: null,
        mcps: [],
        memory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    conversations: [],
    workerUsageEvents: [],
    workerGrowthEvents: [],
    auditEvents: [
      {
        id: `audit-${Date.now()}`,
        time: new Date().toISOString(),
        user: "system",
        action: "初始化 AgentOS 状态",
        target: "Agent / Skill / Security registry",
      },
    ],
    securityPolicy: defaultSecurityPolicy,
  };
}

function loadAgentosState() {
  try {
    const state = JSON.parse(readFileSync(agentosStatePath, "utf8"));
    const agents = normalizeAgentList(Array.isArray(state.agents) ? state.agents : []);
    const normalizedState = {
      ...makeDefaultAgentosState(),
      ...state,
      version: 2,
      agents,
      runs: Array.isArray(state.runs) ? state.runs : [],
      workerUsageEvents: Array.isArray(state.workerUsageEvents) ? state.workerUsageEvents : [],
      workerGrowthEvents: Array.isArray(state.workerGrowthEvents) ? state.workerGrowthEvents : [],
      auditEvents: Array.isArray(state.auditEvents) ? state.auditEvents : [],
      securityPolicy: state.securityPolicy || defaultSecurityPolicy,
    };
    if (JSON.stringify(state.agents || []) !== JSON.stringify(agents)) {
      saveAgentosState(normalizedState);
    }
    return normalizedState;
  } catch {
    const state = makeDefaultAgentosState();
    saveAgentosState(state);
    return state;
  }
}

function saveAgentosState(state) {
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(
    agentosStatePath,
    `${JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2)}\n`
  );
}

function recordAudit(action, targetText, user = "platform") {
  const state = loadAgentosState();
  state.auditEvents = [
    {
      id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      time: new Date().toISOString(),
      user,
      action,
      target: targetText,
    },
    ...(state.auditEvents || []),
  ].slice(0, 200);
  saveAgentosState(state);
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function estimateTokensFromText(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function readTokenUsage(payload) {
  const tokens = payload?.part?.tokens || payload?.tokens || payload?.usage || null;
  if (!tokens) return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  if (typeof tokens === "number") {
    return { inputTokens: 0, outputTokens: 0, totalTokens: numberOrZero(tokens) };
  }

  const inputTokens = numberOrZero(
    tokens.input ||
      tokens.inputTokens ||
      tokens.prompt ||
      tokens.promptTokens ||
      tokens.prompt_tokens
  );
  const outputTokens = numberOrZero(
    tokens.output ||
      tokens.outputTokens ||
      tokens.completion ||
      tokens.completionTokens ||
      tokens.completion_tokens
  );
  const totalTokens = numberOrZero(tokens.total || tokens.totalTokens || tokens.total_tokens) || inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

function mergeTokenUsage(base, next) {
  return {
    inputTokens: numberOrZero(base.inputTokens) + numberOrZero(next.inputTokens),
    outputTokens: numberOrZero(base.outputTokens) + numberOrZero(next.outputTokens),
    totalTokens: numberOrZero(base.totalTokens) + numberOrZero(next.totalTokens),
  };
}

function collectRunTokenUsage(run) {
  return (run?.events || []).reduce((usage, event) => {
    const payload = event?.payload;
    if (payload?.type === "step_finish" && payload.tokens) {
      return mergeTokenUsage(usage, { totalTokens: payload.tokens });
    }
    return mergeTokenUsage(usage, readTokenUsage(payload));
  }, { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
}

function eventTextForEstimate(event) {
  const payload = event?.payload;
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.payload === "string") return payload.payload;
  if (typeof payload.message === "string") return payload.message;
  return "";
}

function recordWorkerUsageEvent(event) {
  const state = loadAgentosState();
  const workerId = event.workerId || "worker-default";
  const source = event.source || "manual";
  const sourceId = event.sourceId || `${source}-${Date.now()}`;
  const normalized = {
    id: event.id || `usage-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    workerId,
    source,
    sourceId,
    conversationId: event.conversationId || "",
    title: event.title || "未命名任务",
    status: event.status || "completed",
    model: event.model || "",
    inputTokens: numberOrZero(event.inputTokens),
    outputTokens: numberOrZero(event.outputTokens),
    totalTokens: numberOrZero(event.totalTokens),
    estimated: Boolean(event.estimated),
    durationMs: numberOrZero(event.durationMs),
    startedAt: event.startedAt || new Date().toISOString(),
    finishedAt: event.finishedAt || new Date().toISOString(),
  };

  state.workerUsageEvents = [
    normalized,
    ...(state.workerUsageEvents || []).filter((item) => !(item.source === source && item.sourceId === sourceId)),
  ].slice(0, 500);
  saveAgentosState(state);
  return normalized;
}

function recordWorkerGrowthEvent(event) {
  const state = loadAgentosState();
  const workerId = event.workerId || "worker-default";
  const type = event.type || "activity";
  const sourceId = event.sourceId || "";
  const normalized = {
    id: event.id || `growth-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    workerId,
    type,
    title: event.title || "员工动态",
    detail: event.detail || "",
    sourceId,
    occurredAt: event.occurredAt || new Date().toISOString(),
  };
  const duplicate = (item) =>
    item.workerId === workerId &&
    item.type === type &&
    sourceId &&
    item.sourceId === sourceId;
  state.workerGrowthEvents = [
    normalized,
    ...(state.workerGrowthEvents || []).filter((item) => !duplicate(item)),
  ].slice(0, 500);
  saveAgentosState(state);
  return normalized;
}

function recordAgentRunUsage(runId, agent, status) {
  const state = loadAgentosState();
  const run = (state.runs || []).find((item) => item.id === runId);
  if (!run) return;

  let usage = collectRunTokenUsage(run);
  let estimated = false;
  if (!usage.totalTokens) {
    const outputEstimate = estimateTokensFromText((run.events || []).map(eventTextForEstimate).join("\n"));
    usage = {
      inputTokens: estimateTokensFromText(`${agent?.rolePrompt || ""}\n${run.message || ""}`),
      outputTokens: outputEstimate,
      totalTokens: 0,
    };
    usage.totalTokens = usage.inputTokens + usage.outputTokens;
    estimated = true;
  }

  recordWorkerUsageEvent({
    workerId: run.workerId || "worker-default",
    source: "agent-run",
    sourceId: run.id,
    title: run.agentName || agent?.name || "Agent Run",
    status,
    model: run.model || agent?.model || "",
    ...usage,
    estimated,
    durationMs: run.startedAt && run.finishedAt ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime() : 0,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt || new Date().toISOString(),
  });
}

function compactRun(run) {
  return {
    ...run,
    events: (run.events || []).slice(-80).map(summarizeRunEvent),
    stdout: undefined,
    stderr: undefined,
  };
}

function updateStoredRun(runId, updater) {
  const state = loadAgentosState();
  const index = state.runs.findIndex((run) => run.id === runId);
  if (index < 0) return null;

  const nextRun = updater(state.runs[index]);
  state.runs[index] = nextRun;
  saveAgentosState(state);
  return nextRun;
}

function summarizeRunEvent(event) {
  if (event.type !== "runtime.stdout") return event;

  const payload = event.payload;
  if (typeof payload === "string") {
    return {
      ...event,
      payload: payload.slice(0, 600),
    };
  }

  if (!payload || typeof payload !== "object") return event;

  if (payload.type === "text") {
    return {
      ...event,
      payload: payload.part?.text || "",
    };
  }

  if (payload.type === "tool_use") {
    return {
      ...event,
      payload: {
        type: "tool_use",
        tool: payload.part?.tool || "tool",
        status: payload.part?.state?.status || "",
        input: payload.part?.state?.input || undefined,
        title: payload.part?.state?.title || "",
      },
    };
  }

  if (payload.type === "step_finish") {
    return {
      ...event,
      payload: {
        type: "step_finish",
        reason: payload.part?.reason || "",
        tokens: payload.part?.tokens?.total || undefined,
      },
    };
  }

  return {
    ...event,
    payload: {
      type: payload.type || "runtime-event",
    },
  };
}

function appendRunEvent(runId, event) {
  mkdirSync(runLogDir, { recursive: true });
  appendFileSync(
    join(runLogDir, `${runId}.jsonl`),
    `${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`
  );

  const summary = summarizeRunEvent({ time: new Date().toISOString(), ...event });
  updateStoredRun(runId, (run) => ({
    ...run,
    events: [...(run.events || []), summary].slice(-120),
  }));
}

function buildAgentPrompt(agent, body) {
  const task = body.message || `请以${agent.name}身份完成一次真实任务执行，并输出可追踪的执行摘要。`;
  const selectedSkills = Array.isArray(body.skillIds) && body.skillIds.length
    ? body.skillIds
    : agent.skills;

  return [
    `你正在 FutureTech AgentOS 中以「${agent.name}」身份执行任务。`,
    "",
    `身份与职责：${agent.rolePrompt || agent.description}`,
    `绑定 Skill：${selectedSkills.join(", ") || "未配置"}`,
    `知识范围：${(agent.knowledgeBases || []).join(", ") || "未配置"}`,
    `权限策略：${JSON.stringify(agent.permissions || {}, null, 2)}`,
    `输出要求：${agent.outputPolicy || "输出执行摘要、过程证据和后续建议。"}`,
    "",
    "执行约束：",
    "1. 只在当前项目目录内工作，除非用户明确要求跨目录。",
    "2. 需要使用 Skill 时优先调用绑定 Skill；缺少输入时先说明缺口。",
    "3. 不要暴露底层实现品牌，对外统一称为 FutureTech Runtime。",
    "4. 对可能产生业务承诺或修改文件的动作，先给出人工确认点。",
    "",
    `用户任务：${task}`,
  ].join("\n");
}

function createRunSteps(agent = {}) {
  if (agent.runner?.type === "skill-script") {
    return [
      { key: "input", title: "读取输入", state: "running", detail: "读取 PDF 输入并写入任务工作区。" },
      { key: "skill", title: "执行 Skill", state: "pending", detail: "调用绑定 Skill 完成合同抽取。" },
      { key: "validate", title: "校验输出", state: "pending", detail: "校验 Excel、摘要和 5 个业务 sheet。" },
      { key: "artifact", title: "交付产物", state: "pending", detail: "记录 Excel、摘要和运行日志路径。" },
    ];
  }
  return [
    { key: "queued", title: "创建任务", state: "done", detail: "AgentOS 已写入任务、身份、Skill 和权限上下文。" },
    { key: "runtime", title: "FutureTech Runtime 执行", state: "running", detail: "通过完整 Runtime 能力执行会话、工具、Skill 和上下文任务。" },
    { key: "skill", title: "Skill 编排", state: "pending", detail: "按 Agent 绑定的 Skill 白名单组织执行。" },
    { key: "artifact", title: "产物与审计", state: "pending", detail: "记录日志、结果、产物路径和审计事件。" },
  ];
}

function finishRunSteps(status, agent = {}) {
  if (agent.runner?.type === "skill-script") {
    const done = status === "completed" ? "done" : "pending";
    return [
      { key: "input", title: "读取输入", state: status === "failed" ? "pending" : "done", detail: "PDF 输入已写入任务工作区。" },
      { key: "skill", title: "执行 Skill", state: status === "failed" ? "pending" : "done", detail: "绑定 Skill 执行已结束。" },
      { key: "validate", title: "校验输出", state: done, detail: "Excel 和摘要校验已完成。" },
      { key: "artifact", title: "交付产物", state: done, detail: "结果产物和审计日志已落盘。" },
    ];
  }
  const finalState = status === "completed" ? "done" : "pending";
  return [
    { key: "queued", title: "创建任务", state: "done", detail: "任务已创建。" },
    { key: "runtime", title: "FutureTech Runtime 执行", state: status === "failed" ? "pending" : "done", detail: "Runtime 执行已结束。" },
    { key: "skill", title: "Skill 编排", state: finalState, detail: "Skill 调用与过程事件已记录。" },
    { key: "artifact", title: "产物与审计", state: finalState, detail: "运行日志和审计事件已落盘。" },
  ];
}

function safeFileName(name = "input.pdf") {
  return String(name)
    .replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "input.pdf";
}

function resolveRunPdfInput(runId, body = {}) {
  const inputs = body.inputs || {};
  const files = Array.isArray(inputs.files) ? inputs.files : [];
  const file = files.find((item) => item.field === "pdf" || /\.pdf$/i.test(item.name || ""));
  if (!file?.dataBase64) {
    throw new Error("请上传合同 PDF。");
  }

  const uploadDir = join(runtimeDir, "uploads", runId);
  mkdirSync(uploadDir, { recursive: true });
  const pdfPath = join(uploadDir, safeFileName(file.name || "contract.pdf"));
  writeFileSync(pdfPath, Buffer.from(file.dataBase64, "base64"));
  return pdfPath;
}

function discoverContractArtifacts(outputDir) {
  const files = existsSync(outputDir) ? readdirSync(outputDir) : [];
  const excel = files.find((file) => /_抽取结果\.xlsx$/i.test(file)) || files.find((file) => /\.xlsx$/i.test(file));
  const summary = files.find((file) => file === "contract_extraction_summary.json");
  const result = files.find((file) => file === "contract_extraction_result.json");
  return {
    excelPath: excel ? join(outputDir, excel) : "",
    summaryPath: summary ? join(outputDir, summary) : "",
    resultPath: result ? join(outputDir, result) : "",
  };
}

function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function updateRunArtifacts(runId, agent, code, outputDir) {
  const artifacts = discoverContractArtifacts(outputDir);
  const summary = artifacts.summaryPath ? readJsonFile(artifacts.summaryPath, null) : null;
  const status = code === 0 && artifacts.excelPath ? "completed" : "failed";
  appendRunEvent(runId, {
    type: "agent.output.summary",
    payload: summary || { error: artifacts.excelPath ? "" : "未找到 Excel 输出文件" },
  });
  updateStoredRun(runId, (current) => ({
    ...current,
    status,
    exitCode: code,
    summary,
    outputs: artifacts,
    artifacts: [
      ...(current.artifacts || []),
      artifacts.excelPath
        ? { type: "excel", name: "合同抽取结果 Excel", path: artifacts.excelPath }
        : null,
      artifacts.summaryPath
        ? { type: "summary", name: "抽取统计 JSON", path: artifacts.summaryPath }
        : null,
      artifacts.resultPath
        ? { type: "json", name: "结构化抽取结果", path: artifacts.resultPath }
        : null,
    ].filter(Boolean),
    steps: finishRunSteps(status, agent),
    finishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  recordAgentRunUsage(runId, agent, status);
  recordAudit(status === "completed" ? "任务执行完成" : "任务执行失败", `${agent.name} / ${runId}`, "runtime");
}

function createContractExtractionRun(agent, body) {
  const runId = `run-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const logPath = join(runLogDir, `${runId}.jsonl`);
  const outputDir = join(runLogDir, `${runId}-outputs`);
  const selectedSkills = Array.isArray(body.skillIds) && body.skillIds.length ? body.skillIds : agent.skills;
  const uploadedFiles = Array.isArray(body.inputs?.files) ? body.inputs.files : [];
  const uploadedPdf = uploadedFiles.find((item) => item.field === "pdf" || /\.pdf$/i.test(item.name || ""));
  const run = {
    id: runId,
    real: true,
    agentId: agent.id,
    agentName: agent.name,
    workerId: body.workerId || agent.workerId || "worker-default",
    status: "running",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    message: body.message || "",
    skills: selectedSkills,
    inputs: { fileName: uploadedPdf?.name || "", uploaded: Boolean(uploadedPdf) },
    steps: createRunSteps(agent),
    events: [],
    artifacts: [{ type: "runtime-log", name: "AgentOS 运行日志", path: logPath }],
  };

  mkdirSync(runLogDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });
  const state = loadAgentosState();
  state.runs = [run, ...(state.runs || [])].slice(0, 80);
  state.auditEvents = [
    {
      id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      time: new Date().toISOString(),
      user: "operator",
      action: `启动 ${agent.name}`,
      target: selectedSkills.join(" / "),
    },
    ...(state.auditEvents || []),
  ].slice(0, 200);
  saveAgentosState(state);

  let pdfPath = "";
  try {
    pdfPath = resolveRunPdfInput(runId, body);
  } catch (error) {
    appendRunEvent(runId, { type: "agent.run.failed", payload: error.message });
    updateStoredRun(runId, (current) => ({
      ...current,
      status: "failed",
      error: error.message,
      steps: finishRunSteps("failed", agent),
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    recordAgentRunUsage(runId, agent, "failed");
    return compactRun({ ...run, status: "failed", error: error.message });
  }

  appendRunEvent(runId, { type: "agent.input.ready", payload: { pdfPath, outputDir } });

  const args = [agent.runner.script, "--pdf", pdfPath, "--output-dir", outputDir];
  const child = spawn(agent.runner.command || pythonCommand, args, {
    cwd: agent.runner.cwd || root,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  updateStoredRun(runId, (current) => ({ ...current, runtimePid: child.pid, updatedAt: new Date().toISOString() }));

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8").trim();
    if (text) appendRunEvent(runId, { type: "skill.stdout", payload: text.slice(0, 1200) });
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8").trim();
    if (text) appendRunEvent(runId, { type: "skill.stderr", payload: text.slice(0, 1200) });
  });
  child.on("error", (error) => {
    appendRunEvent(runId, { type: "skill.error", payload: error.message });
    updateStoredRun(runId, (current) => ({
      ...current,
      status: "failed",
      error: error.message,
      steps: finishRunSteps("failed", agent),
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    recordAgentRunUsage(runId, agent, "failed");
  });
  child.on("close", (code) => {
    appendRunEvent(runId, { type: "skill.finished", payload: { exitCode: code } });
    updateRunArtifacts(runId, agent, code, outputDir);
  });

  return compactRun(run);
}

function createAgentRun(body) {
  const state = loadAgentosState();
  const agent = state.agents.find((item) => item.id === body.agentId) || state.agents[0];
  if (agent.runner?.type === "skill-script" && agent.runner?.skillId === "contract-e2e-excel") {
    return createContractExtractionRun(agent, body);
  }
  const runId = `run-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const logPath = join(runLogDir, `${runId}.jsonl`);
  const prompt = buildAgentPrompt(agent, body);
  const selectedSkills = Array.isArray(body.skillIds) && body.skillIds.length
    ? body.skillIds
    : agent.skills;
  const run = {
    id: runId,
    real: true,
    agentId: agent.id,
    agentName: agent.name,
    workerId: body.workerId || agent.workerId || "worker-default",
    status: "running",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    message: body.message || "",
    skills: selectedSkills,
    steps: createRunSteps(agent),
    events: [],
    artifacts: [
      {
        type: "runtime-log",
        name: "FutureTech Runtime JSONL 日志",
        path: logPath,
      },
    ],
  };

  mkdirSync(runLogDir, { recursive: true });
  state.runs = [run, ...(state.runs || [])].slice(0, 80);
  state.auditEvents = [
    {
      id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      time: new Date().toISOString(),
      user: "operator",
      action: `启动 ${agent.name}`,
      target: selectedSkills.join(" / "),
    },
    ...(state.auditEvents || []),
  ].slice(0, 200);
  saveAgentosState(state);
  appendRunEvent(runId, { type: "agent.run.started", message: body.message || "默认任务", agent: agent.name });

  const args = [
    "run",
    "--format",
    "json",
    "--attach",
    target.origin,
    "--dir",
    root,
    "--title",
    `AgentOS ${agent.name}`,
  ];
  if (agent.model) args.push("--model", agent.model);
  args.push(prompt);

  const child = spawn("opencode", args, {
    cwd: root,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  updateStoredRun(runId, (current) => ({
    ...current,
    runtimePid: child.pid,
    updatedAt: new Date().toISOString(),
  }));

  let stdoutBuffer = "";
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let payload = line;
      try {
        payload = sanitizeJsonValue(JSON.parse(line));
      } catch {
        payload = rewriteFutureTechText(stripThinkBlocks(line));
      }
      appendRunEvent(runId, { type: "runtime.stdout", payload });
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = rewriteFutureTechText(stripThinkBlocks(chunk.toString("utf8")));
    if (text.trim()) appendRunEvent(runId, { type: "runtime.stderr", payload: text.trim() });
  });

  child.on("error", (error) => {
    appendRunEvent(runId, { type: "runtime.error", payload: error.message });
    updateStoredRun(runId, (current) => ({
      ...current,
      status: "failed",
      error: error.message,
      steps: finishRunSteps("failed", agent),
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    recordAgentRunUsage(runId, agent, "failed");
    recordAudit("任务执行失败", `${agent.name} / ${error.message}`, "runtime");
  });

  child.on("close", (code) => {
    if (stdoutBuffer.trim()) {
      appendRunEvent(runId, { type: "runtime.stdout", payload: stdoutBuffer.trim() });
    }

    const status = code === 0 ? "completed" : "failed";
    appendRunEvent(runId, { type: "agent.run.finished", status, exitCode: code });
    updateStoredRun(runId, (current) => ({
      ...current,
      status,
      exitCode: code,
      steps: finishRunSteps(status, agent),
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    recordAgentRunUsage(runId, agent, status);
    recordAudit(status === "completed" ? "任务执行完成" : "任务执行失败", `${agent.name} / ${runId}`, "runtime");
  });

  return compactRun(run);
}

async function fetchRuntimeJson(pathname, fallback) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    const response = await fetch(`${target.origin}${pathname}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return fallback;
    return sanitizeJsonValue(await response.json());
  } catch {
    return fallback;
  }
}

async function buildRuntimeStatus() {
  const [runtimePids, proxyPids, webPids] = await Promise.all([
    pidsOnPort(runtimePort),
    pidsOnPort(port),
    pidsOnPort(5174),
  ]);
  const [health, skills, sessions] = await Promise.all([
    fetchRuntimeJson("/global/health", null),
    listOpencodeSkills(),
    fetchRuntimeJson("/session", []),
  ]);
  let modelState = { activeModel: "", profiles: [] };
  try {
    modelState = await buildModelProfileState(readOpencodeConfig());
  } catch {
    // Missing local config should not break the runtime status page.
  }
  const activeProfile = modelState.profiles?.find((profile) => profile.active);

  return {
    target: target.origin,
    proxy: `http://127.0.0.1:${port}`,
    healthy: Boolean(health?.healthy),
    version: health?.version || "",
    services: [
      { id: "runtime", name: "FutureTech Runtime", port: runtimePort, healthy: Boolean(health?.healthy), pids: runtimePids },
      { id: "proxy", name: "FutureTech Console Proxy", port, healthy: proxyPids.length > 0, pids: proxyPids },
      { id: "web", name: "AgentOS Web", port: 5174, healthy: webPids.length > 0, pids: webPids },
    ],
    model: activeProfile?.displayModelName || rewriteFutureTechText(modelState.activeModel),
    skillCount: skills.count || 0,
    sessionCount: Array.isArray(sessions) ? sessions.length : 0,
    fullConsoleProxy: true,
    capabilities: [
      "会话",
      "文件",
      "事件流",
      "终端",
      "Skill",
      "MCP",
      "项目上下文",
      "模型网关",
    ],
  };
}

function loadRuntimeState() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

function saveRuntimeState(state) {
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function execFileText(command, args) {
  return new Promise((resolveText) => {
    execFile(command, args, { cwd: root }, (error, stdout) => {
      resolveText(error ? "" : stdout.trim());
    });
  });
}

function isPidAlive(pid) {
  if (!pid) return false;

  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function pidsOnPort(listenPort) {
  const output = await execFileText("lsof", [`-tiTCP:${listenPort}`, "-sTCP:LISTEN"]);
  return output
    .split(/\s+/)
    .map((pid) => Number(pid))
    .filter(Boolean);
}

async function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function waitForRuntime(timeoutMs = 20000) {
  const startedAt = Date.now();
  const healthUrl = `${target.origin}/global/health`;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);
      const response = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (response.ok) return true;
    } catch {
      // Runtime is expected to be unavailable while it restarts.
    }

    await wait(500);
  }

  return false;
}

async function killPid(pid, signal = "SIGTERM") {
  if (!isPidAlive(pid)) return;

  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Already gone or owned by another process.
    }
  }
}

async function stopRuntime() {
  const state = loadRuntimeState();
  const knownPid = state.runtime?.pid;
  const portPids = await pidsOnPort(runtimePort);
  const pids = [...new Set([knownPid, ...portPids].filter(Boolean).map(Number))];

  await Promise.all(pids.map((pid) => killPid(pid, "SIGTERM")));

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const remaining = await pidsOnPort(runtimePort);
    if (remaining.length === 0 && (!knownPid || !isPidAlive(knownPid))) return;
    await wait(250);
  }

  const remaining = [
    ...new Set([knownPid, ...(await pidsOnPort(runtimePort))].filter(Boolean).map(Number)),
  ];
  await Promise.all(remaining.map((pid) => killPid(pid, "SIGKILL")));
}

async function startRuntime() {
  const state = loadRuntimeState();
  const existing = await pidsOnPort(runtimePort);

  if (existing.length > 0) {
    state.runtime = {
      pid: existing[0],
      port: runtimePort,
      external: true,
      adoptedAt: new Date().toISOString(),
    };
    saveRuntimeState(state);
    return { pid: existing[0], adopted: true, ready: await waitForRuntime(3000) };
  }

  mkdirSync(runtimeDir, { recursive: true });
  const logPath = join(runtimeDir, "futuretech-runtime.log");
  const logFd = openSync(logPath, "a");
  const args = [
    "serve",
    "--port",
    String(runtimePort),
    "--hostname",
    runtimeHost,
    "--cors",
    "http://localhost:5174",
    "--cors",
    "http://127.0.0.1:5174",
    "--cors",
    "http://localhost:5175",
    "--cors",
    "http://127.0.0.1:5175",
    "--print-logs",
  ];
  const child = spawn("opencode", args, {
    cwd: root,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
    },
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });

  child.unref();
  const ready = await waitForRuntime();

  state.runtime = {
    pid: child.pid,
    port: runtimePort,
    log: logPath,
    command: `opencode ${args.join(" ")}`,
    startedAt: new Date().toISOString(),
  };
  saveRuntimeState(state);

  return { pid: child.pid, adopted: false, ready };
}

async function restartRuntime() {
  await stopRuntime();
  return startRuntime();
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > requestBodyLimitBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("access-control-allow-origin", "http://localhost:5174");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.end(JSON.stringify(payload));
}

async function handleAdmin(req, res) {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return true;
  }

  if (url.pathname === "/futuretech-admin/agentos" && req.method === "GET") {
    const state = loadAgentosState();
    sendJson(res, 200, {
      agents: state.agents,
      runs: (state.runs || []).map(compactRun),
      auditEvents: state.auditEvents || [],
      securityPolicy: state.securityPolicy || defaultSecurityPolicy,
      skills: await listOpencodeSkills(),
      runtime: await buildRuntimeStatus(),
    });
    return true;
  }

  if (url.pathname === "/futuretech-admin/runtime-status" && req.method === "GET") {
    sendJson(res, 200, await buildRuntimeStatus());
    return true;
  }

  if (url.pathname === "/futuretech-admin/security-policy" && req.method === "GET") {
    const state = loadAgentosState();
    sendJson(res, 200, state.securityPolicy || defaultSecurityPolicy);
    return true;
  }

  if (url.pathname === "/futuretech-admin/security-policy" && req.method === "POST") {
    const body = await readRequestJson(req);
    const incoming = body.policy || body;
    const state = loadAgentosState();
    const { policy: _legacyNestedPolicy, ...currentPolicy } = state.securityPolicy || {};
    state.securityPolicy = {
      ...currentPolicy,
      ...incoming,
      updatedAt: new Date().toISOString(),
    };
    saveAgentosState(state);
    recordAudit("更新安全策略", "Security policy", "operator");
    sendJson(res, 200, state.securityPolicy);
    return true;
  }

  if (url.pathname === "/futuretech-admin/agents" && req.method === "GET") {
    sendJson(res, 200, { agents: loadAgentosState().agents });
    return true;
  }

  if (url.pathname === "/futuretech-admin/agents" && req.method === "POST") {
    const body = await readRequestJson(req);
    const incoming = body.agent || body;
    const state = loadAgentosState();
    const id = incoming.id || `agent-${Date.now()}`;
    const agentDraft = normalizeAgent({
      ...defaultAgents[0],
      ...incoming,
      id,
      skills: Array.isArray(incoming.skills) ? incoming.skills : [],
      knowledgeBases: Array.isArray(incoming.knowledgeBases) ? incoming.knowledgeBases : [],
      updatedAt: new Date().toISOString(),
    });
    const agent = id === defaultAgents[0].id ? normalizeContractAgent(agentDraft) : agentDraft;
    const existingIndex = state.agents.findIndex((item) => item.id === id);
    if (existingIndex >= 0) state.agents[existingIndex] = agent;
    else state.agents = [agent, ...state.agents];
    saveAgentosState(state);
    recordAudit("保存 Agent 身份", agent.name, "operator");
    sendJson(res, 200, { agent, agents: state.agents });
    return true;
  }

  if (url.pathname === "/futuretech-admin/agent-blueprints/from-skill" && req.method === "POST") {
    const body = await readRequestJson(req);
    const catalog = await listOpencodeSkills();
    const skill = catalog.skills.find((item) => item.id === body.skillId) || catalog.skills[0];
    if (!skill) {
      sendJson(res, 404, { error: "Skill not found" });
      return true;
    }
    sendJson(res, 200, { agent: buildAgentBlueprintFromSkill(skill), skill });
    return true;
  }

  if (url.pathname === "/futuretech-admin/agent-runs" && req.method === "GET") {
    sendJson(res, 200, { runs: (loadAgentosState().runs || []).map(compactRun) });
    return true;
  }

  if (url.pathname === "/futuretech-admin/agent-runs" && req.method === "POST") {
    try {
      const body = await readRequestJson(req);
      sendJson(res, 202, { run: createAgentRun(body) });
    } catch (error) {
      sendJson(res, 500, { error: "Failed to start Agent run", detail: error.message });
    }
    return true;
  }

  const runMatch = url.pathname.match(/^\/futuretech-admin\/agent-runs\/([^/]+)$/);
  if (runMatch && req.method === "GET") {
    const run = loadAgentosState().runs.find((item) => item.id === runMatch[1]);
    if (!run) {
      sendJson(res, 404, { error: "Run not found" });
      return true;
    }
    sendJson(res, 200, { run: compactRun(run) });
    return true;
  }

  if (url.pathname === "/futuretech-admin/model-profiles" && req.method === "GET") {
    try {
      sendJson(res, 200, await buildModelProfileState(readOpencodeConfig()));
    } catch (error) {
      sendJson(res, 500, { error: "Failed to read model profiles", detail: error.message });
    }
    return true;
  }

  if (
    url.pathname === "/futuretech-admin/model-profiles/activate" &&
    req.method === "POST"
  ) {
    try {
      const body = await readRequestJson(req);
      const config = readOpencodeConfig();
      const modelState = await buildModelProfileState(config);
      const legacyModelName =
        body.profileId === "minimax"
          ? "minimax/MiniMax-M2.7"
          : body.profileId === "gpt54"
            ? "seuapi/gpt-5.4"
            : "";
      const requestedModelName = body.modelName || legacyModelName || body.profileId || "";
      const profile = modelState.profiles.find((item) => item.id === requestedModelName || item.modelName === requestedModelName);

      if (!profile) {
        sendJson(res, 404, { error: "Unknown model profile", modelName: requestedModelName });
        return true;
      }

      if (!profile.available) {
        sendJson(res, 400, {
          error: "Model provider is not connected",
          modelName: profile.modelName,
        });
        return true;
      }

      if (config.provider?.[profile.providerID]) {
        config.provider[profile.providerID].models = {
          ...(config.provider[profile.providerID].models || {}),
          [profile.modelID]: {
            name: profile.label || profile.modelID,
          },
        };
      }

      config.model = profile.modelName;
      writeOpencodeConfig(config);
      const runtime = await restartRuntime();
      sendJson(res, 200, {
        ...(await buildModelProfileState(config)),
        restartRequired: !runtime.ready,
        runtimeRestarted: runtime.ready,
        runtime,
      });
    } catch (error) {
      sendJson(res, 500, { error: "Failed to activate model profile", detail: error.message });
    }
    return true;
  }

  if (
    (url.pathname === "/futuretech-admin/opencode-skills" ||
      url.pathname === "/futuretech-admin/skills") &&
    req.method === "GET"
  ) {
    try {
      sendJson(res, 200, await listOpencodeSkills());
    } catch (error) {
      sendJson(res, 500, { error: "Failed to read FutureTech skills", detail: error.message });
    }
    return true;
  }

  // ─── 数字员工（Worker）API ────────────────────────────────────────────

  const WORKER_MD_FILES = [
    "IDENTITY.md", "PERSONA.md", "TOOLS.md", "MEMORY.md",
    "WORK_STYLES.md", "BIBLE.md", "CORE_CAPABILITIES.md",
    "DELIVERY_COMMITMENTS.md", "USER.md",
  ];

  function loadWorkerDir(workerId) {
    const dir = join(workersDir, workerId);
    const qoderDir = join(dir, ".qoder");
    mkdirSync(qoderDir, { recursive: true });
    return { dir, qoderDir };
  }

  function readWorkerMarkdowns(qoderDir) {
    const files = {};
    for (const name of WORKER_MD_FILES) {
      const filePath = join(qoderDir, name);
      files[name.replace(".md", "")] = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
    }
    return files;
  }

  function writeWorkerMarkdown(qoderDir, filename, content) {
    writeFileSync(join(qoderDir, filename), content, "utf8");
  }

  function readWorkerMeta(workerId) {
    const metaPath = join(workersDir, workerId, "meta.json");
    if (!existsSync(metaPath)) return null;
    try { return JSON.parse(readFileSync(metaPath, "utf8")); } catch { return null; }
  }

  function writeWorkerMeta(workerId, meta) {
    const { dir } = loadWorkerDir(workerId);
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  }

  function seedDefaultWorker() {
    const defaultId = "worker-default";
    const metaPath = join(workersDir, defaultId, "meta.json");
    if (existsSync(metaPath)) return;
    const now = new Date().toISOString();
    const meta = {
      id: defaultId, name: "通用助手", avatar: "Bot", color: "blue",
      description: "通用 AI 助手，可处理各类任务。", model: null, employeeType: "",
      createdAt: now, updatedAt: now,
    };
    const { qoderDir } = loadWorkerDir(defaultId);
    writeWorkerMeta(defaultId, meta);
    writeWorkerMarkdown(qoderDir, "IDENTITY.md", "# Identity — 通用助手\n\n你是宁梦未来的通用 AI 助手。你可以帮助用户完成各类任务，包括文档处理、数据分析、代码编写等。请用中文回复。\n\n## 能力边界\n\n| 能做 | 不做 |\n|------|------|\n| 文档处理、数据分析、代码编写、问题解答 | 越权操作、破坏性命令 |\n");
    writeWorkerMarkdown(qoderDir, "PERSONA.md", "# Persona — 通用助手\n\n## 性格特征\n\n- 友好耐心\n- 逻辑清晰\n- 注重细节\n");
    writeWorkerMarkdown(qoderDir, "TOOLS.md", "# 工具使用说明\n\n## 可用工具\n\n- **Read**: 读取文件内容\n- **Write**: 创建或覆盖文件\n- **Edit**: 修改文件部分内容\n- **Bash**: 执行 shell 命令\n");
    writeWorkerMarkdown(qoderDir, "MEMORY.md", "# Memory Index\n\n## User Preferences\n\n## Working Rules\n\n## Feedback History\n");
    writeWorkerMarkdown(qoderDir, "WORK_STYLES.md", '[{"name":"代码先行","description":"小改动直接做，大改动先简述思路再实现"}]');
    writeWorkerMarkdown(qoderDir, "BIBLE.md", "");
    writeWorkerMarkdown(qoderDir, "CORE_CAPABILITIES.md", "");
    writeWorkerMarkdown(qoderDir, "DELIVERY_COMMITMENTS.md", "");
    writeWorkerMarkdown(qoderDir, "USER.md", "");
    mkdirSync(join(qoderDir, "memory"), { recursive: true });
    mkdirSync(join(qoderDir, "sessions"), { recursive: true });
  }

  function listAllWorkers() {
    mkdirSync(workersDir, { recursive: true });
    seedDefaultWorker();
    const dirs = readdirSync(workersDir).filter((d) => {
      try { return statSync(join(workersDir, d)).isDirectory(); } catch { return false; }
    });
    return dirs.map((id) => readWorkerMeta(id)).filter(Boolean).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  function dateKey(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  function formatDayLabel(key) {
    const date = new Date(`${key}T00:00:00Z`);
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  }

  function buildDayKeys(days) {
    const list = [];
    const now = new Date();
    for (let index = days - 1; index >= 0; index -= 1) {
      const date = new Date(now);
      date.setUTCDate(now.getUTCDate() - index);
      list.push(date.toISOString().slice(0, 10));
    }
    return list;
  }

  function startOfTodayMs() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function startOfWeekMs() {
    return Date.now() - 6 * 24 * 60 * 60 * 1000;
  }

  function countMemory(markdowns, meta) {
    const memoryLines = String(markdowns.MEMORY || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- ") || /^#+\s+/.test(line));
    return memoryLines.length + ((meta.memory || []).length || 0);
  }

  const modelCostRates = {
    "minimax/MiniMax-M2.7": { inputPerMillion: 0.4, outputPerMillion: 1.2, currency: "USD" },
    "seuapi/gpt-5.4": { inputPerMillion: 1.25, outputPerMillion: 10, currency: "USD" },
  };

  function parseMarkdownSummary(content, fallback = []) {
    const text = String(content || "").trim();
    if (!text) return fallback;
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("#"))
      .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
      .filter((line) => line && !/^\|?[-:\s|]+\|?$/.test(line))
      .filter((line) => !line.includes("|------"));
    return lines.slice(0, 5);
  }

  function parseWorkStyles(content) {
    const text = String(content || "").trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => [item.name, item.description].filter(Boolean).join("："))
          .filter(Boolean)
          .slice(0, 5);
      }
    } catch {
      // Fall through to markdown parsing.
    }
    return parseMarkdownSummary(text);
  }

  function eventTimeMs(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 0;
    return date.getTime();
  }

  function profileCompletenessFor(meta, markdowns, skills, connectors) {
    const checks = [
      { key: "name", label: "员工名称", complete: Boolean(meta.name && meta.name !== "新数字员工") },
      { key: "role", label: "岗位角色", complete: Boolean(meta.employeeType || meta.role) },
      { key: "description", label: "员工简介", complete: Boolean(meta.description) },
      { key: "capabilities", label: "核心能力", complete: parseMarkdownSummary(markdowns.CORE_CAPABILITIES).length > 0 },
      { key: "memory", label: "长期记忆", complete: countMemory(markdowns, meta) > 0 },
      { key: "skills", label: "绑定 Skill", complete: (skills || []).length > 0 },
      { key: "connectors", label: "连接器", complete: (connectors || []).length > 0 },
    ];
    const completed = checks.filter((item) => item.complete).length;
    const missingFields = checks.filter((item) => !item.complete).map((item) => item.label);
    return {
      score: Math.round((completed / checks.length) * 100),
      missingFields,
      nextActions: missingFields.slice(0, 3).map((label) => `补充${label}`),
    };
  }

  function buildActivity(workerId, usageEvents, conversations, runs, tasks, triggers, projects) {
    const heatmapKeys = buildDayKeys(365);
    const heatmapMap = Object.fromEntries(heatmapKeys.map((key) => [key, {
      date: key,
      label: formatDayLabel(key),
      count: 0,
      intensity: 0,
      sources: { chat: 0, run: 0, task: 0, automation: 0 },
    }]));
    const addActivity = (value, source, weight = 1) => {
      if (!eventTimeMs(value)) return;
      const key = dateKey(value);
      if (!heatmapMap[key]) return;
      heatmapMap[key].count += weight;
      if (source && heatmapMap[key].sources[source] !== undefined) {
        heatmapMap[key].sources[source] += weight;
      }
    };

    for (const event of usageEvents) {
      addActivity(event.finishedAt || event.startedAt, event.source === "chat" ? "chat" : "run", 1);
    }
    for (const conv of conversations) addActivity(conv.updatedAt || conv.createdAt, "chat", 1);
    for (const run of runs) addActivity(run.finishedAt || run.updatedAt || run.startedAt, "run", 1);
    for (const task of tasks) addActivity(task.updatedAt || task.createdAt, "task", 1);
    for (const trigger of triggers) {
      if (trigger.lastRunAt) addActivity(trigger.lastRunAt, "automation", Math.max(1, numberOrZero(trigger.runCount)));
      else addActivity(trigger.updatedAt || trigger.createdAt, "automation", 1);
    }

    const maxCount = Math.max(1, ...Object.values(heatmapMap).map((item) => item.count));
    const heatmapDays = Object.values(heatmapMap).map((item) => ({
      ...item,
      intensity: item.count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((item.count / maxCount) * 4))),
    }));

    return {
      awakeDays: heatmapDays.filter((item) => item.count > 0).length,
      heatmapDays,
      summary: {
        automations: triggers.length,
        tasks: tasks.length + runs.length,
        projects: projects.length,
        conversations: conversations.length,
        maxDailyWork: maxCount,
        workerId,
      },
    };
  }

  function growthTitle(type) {
    const map = {
      created: "员工创建",
      profile: "档案更新",
      memory: "记忆更新",
      skill: "Skill 更新",
      connector: "连接器变化",
      permission: "权限变化",
      project: "项目更新",
      automation: "自动化更新",
      work: "完成关键工作",
    };
    return map[type] || "员工动态";
  }

  function buildGrowth(meta, markdowns, profileSummary, usageEvents, growthEvents) {
    const inferred = [
      {
        id: `inferred-created-${meta.id}`,
        workerId: meta.id,
        type: "created",
        title: "员工创建",
        detail: `${meta.name || "数字员工"} 已加入 AgentOS。`,
        sourceId: meta.id,
        occurredAt: meta.createdAt,
      },
    ];
    for (const event of usageEvents.filter((item) => item.status === "completed").slice(0, 3)) {
      inferred.push({
        id: `inferred-work-${event.id}`,
        workerId: meta.id,
        type: "work",
        title: "完成关键工作",
        detail: event.title || "完成一次工作记录",
        sourceId: event.sourceId || event.id,
        occurredAt: event.finishedAt || event.startedAt,
      });
    }
    const seenRecent = new Set();
    const recent = [...growthEvents, ...inferred]
      .filter((item) => item.occurredAt)
      .filter((item) => {
        const key = `${item.type || "activity"}:${item.sourceId || item.id || item.occurredAt}`;
        if (seenRecent.has(key)) return false;
        seenRecent.add(key);
        return true;
      })
      .sort((a, b) => eventTimeMs(b.occurredAt) - eventTimeMs(a.occurredAt))
      .slice(0, 8)
      .map((item) => ({ ...item, title: item.title || growthTitle(item.type) }));

    const learned = [
      ...profileSummary.capabilities.map((item) => ({ title: "核心能力", detail: item })),
      ...profileSummary.workStyles.map((item) => ({ title: "工作风格", detail: item })),
      ...(meta.skills || []).map((item) => ({ title: "已绑定 Skill", detail: item })),
      ...String(markdowns.MEMORY || "").split(/\r?\n/).filter((line) => line.trim()).slice(0, 3).map((line) => ({ title: "记忆沉淀", detail: line.replace(/^#+\s+/, "").replace(/^[-*]\s+/, "") })),
    ].filter((item, index, list) => item.detail && list.findIndex((candidate) => candidate.detail === item.detail) === index).slice(0, 5);

    return {
      recent,
      learned,
      summary: {
        eventCount: growthEvents.length,
        learnedCount: learned.length,
        lastGrowthAt: recent[0]?.occurredAt || meta.updatedAt || meta.createdAt,
      },
    };
  }

  function costForEvent(event) {
    const rate = modelCostRates[event.model || ""];
    if (!rate) {
      return { amount: 0, currency: "USD", rateConfigured: false };
    }
    const inputCost = (numberOrZero(event.inputTokens) / 1_000_000) * rate.inputPerMillion;
    const outputCost = (numberOrZero(event.outputTokens) / 1_000_000) * rate.outputPerMillion;
    return {
      amount: inputCost + outputCost,
      currency: rate.currency || "USD",
      rateConfigured: true,
    };
  }

  function compactWorkItem(item) {
    return {
      id: item.id,
      source: item.source,
      sourceId: item.sourceId,
      title: item.title,
      status: item.status,
      model: item.model || "",
      inputTokens: numberOrZero(item.inputTokens),
      outputTokens: numberOrZero(item.outputTokens),
      totalTokens: numberOrZero(item.totalTokens),
      estimated: Boolean(item.estimated),
      durationMs: numberOrZero(item.durationMs),
      startedAt: item.startedAt || item.finishedAt,
      finishedAt: item.finishedAt || item.startedAt,
      cost: costForEvent(item).amount,
      rateConfigured: costForEvent(item).rateConfigured,
    };
  }

  function groupWorkItems(items) {
    const groups = {
      running: [],
      completed: [],
      failed: [],
      idle: [],
    };
    for (const item of items) {
      if (["running", "queued"].includes(item.status)) groups.running.push(item);
      else if (item.status === "completed") groups.completed.push(item);
      else if (item.status === "failed") groups.failed.push(item);
      else groups.idle.push(item);
    }
    return groups;
  }

  function compactConversation(conv) {
    const lastMessage = (conv.messages || [])[conv.messages?.length - 1] || null;
    return {
      id: conv.id,
      title: conv.title,
      workerId: conv.workerId,
      messageCount: (conv.messages || []).length,
      lastMessage: lastMessage?.content?.slice(0, 120) || "",
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  }

  function buildWorkerOverview(workerId, range = "7d") {
    const meta = readWorkerMeta(workerId);
    if (!meta) return null;

    const state = loadAgentosState();
    const { qoderDir } = loadWorkerDir(workerId);
    const markdowns = readWorkerMarkdowns(qoderDir);
    const projects = (state.projects || []).filter((item) => item.workerId === workerId);
    const triggers = (state.triggers || []).filter((item) => item.workerId === workerId);
    const tasks = (state.tasks || []).filter((item) => item.workerId === workerId);
    const connectors = (state.connectors || []).filter((item) => item.workerId === workerId);
    const conversations = (state.conversations || []).filter((item) => item.workerId === workerId);
    const runs = (state.runs || []).filter((item) => item.workerId === workerId || (workerId === "worker-default" && !item.workerId));
    const usageEvents = (state.workerUsageEvents || []).filter((item) => item.workerId === workerId);
    const growthEvents = (state.workerGrowthEvents || []).filter((item) => item.workerId === workerId);
    const todayMs = startOfTodayMs();
    const weekMs = startOfWeekMs();
    const todayEvents = usageEvents.filter((item) => new Date(item.finishedAt || item.startedAt).getTime() >= todayMs);
    const weekEvents = usageEvents.filter((item) => new Date(item.finishedAt || item.startedAt).getTime() >= weekMs);
    const finishedEvents = usageEvents.filter((item) => ["completed", "failed"].includes(item.status));
    const completedEvents = finishedEvents.filter((item) => item.status === "completed");
    const durationEvents = usageEvents.filter((item) => item.durationMs > 0);
    const days = range === "30d" ? 30 : 7;
    const dayKeys = buildDayKeys(days);
    const trendMap = Object.fromEntries(dayKeys.map((key) => [key, { date: key, label: formatDayLabel(key), totalTokens: 0, cost: 0, runs: 0, estimated: false, rateConfigured: false }]));

    for (const event of usageEvents) {
      const key = dateKey(event.finishedAt || event.startedAt);
      if (!trendMap[key]) continue;
      const cost = costForEvent(event);
      trendMap[key].totalTokens += numberOrZero(event.totalTokens);
      trendMap[key].cost += cost.amount;
      trendMap[key].runs += 1;
      trendMap[key].estimated = trendMap[key].estimated || Boolean(event.estimated);
      trendMap[key].rateConfigured = trendMap[key].rateConfigured || cost.rateConfigured;
    }

    const recentUsage = usageEvents.map(compactWorkItem);
    const usageConversationIds = new Set(usageEvents.map((event) => event.conversationId).filter(Boolean));
    const usageConversationTitles = new Set(usageEvents.filter((event) => event.source === "chat").map((event) => event.title).filter(Boolean));
    const recentConversations = conversations.filter((conv) => !usageConversationIds.has(conv.id) && !usageConversationTitles.has(conv.title)).map((conv) => ({
      id: conv.id,
      source: "chat",
      sourceId: conv.id,
      title: conv.title,
      status: "active",
      model: "",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimated: true,
      durationMs: 0,
      startedAt: conv.createdAt,
      finishedAt: conv.updatedAt,
      cost: 0,
      rateConfigured: false,
    }));
    const recentRuns = runs.map((run) => ({
      id: run.id,
      source: "agent-run",
      sourceId: run.id,
      title: run.agentName || "Agent Run",
      status: run.status,
      model: run.model || "",
      inputTokens: collectRunTokenUsage(run).inputTokens,
      outputTokens: collectRunTokenUsage(run).outputTokens,
      totalTokens: collectRunTokenUsage(run).totalTokens,
      estimated: false,
      durationMs: run.startedAt && run.finishedAt ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime() : 0,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt || run.updatedAt || run.startedAt,
      cost: costForEvent(run).amount,
      rateConfigured: costForEvent(run).rateConfigured,
    }));
    const recentWork = [...recentUsage, ...recentConversations, ...recentRuns]
      .sort((a, b) => new Date(b.finishedAt || 0).getTime() - new Date(a.finishedAt || 0).getTime())
      .filter((item, index, arr) => arr.findIndex((candidate) => candidate.source === item.source && candidate.sourceId === item.sourceId) === index)
      .slice(0, 10);

    const sum = (items, field) => items.reduce((total, item) => total + numberOrZero(item[field]), 0);
    const usageWithCost = usageEvents.map((event) => ({ ...event, cost: costForEvent(event).amount, rateConfigured: costForEvent(event).rateConfigured }));
    const configuredCostEvents = usageWithCost.filter((item) => item.rateConfigured);
    const totalCost = sum(usageWithCost, "cost");
    const todayCost = sum(todayEvents.map((event) => ({ cost: costForEvent(event).amount })), "cost");
    const weekCost = sum(weekEvents.map((event) => ({ cost: costForEvent(event).amount })), "cost");
    const timeline = recentWork.map((item) => ({ ...item, cost: numberOrZero(item.cost), rateConfigured: Boolean(item.rateConfigured) }));
    const profileSummary = {
      capabilities: parseMarkdownSummary(markdowns.CORE_CAPABILITIES, parseMarkdownSummary(markdowns.IDENTITY, ["处理对话任务", "调用绑定 Skill", "沉淀长期记忆"])),
      workStyles: parseWorkStyles(markdowns.WORK_STYLES).length ? parseWorkStyles(markdowns.WORK_STYLES) : ["先确认目标，再执行任务", "结果优先，必要时提示风险"],
      riskLabels: [
        meta.permissions ? "权限已配置" : "默认权限",
        (meta.skills || []).length ? "Skill 已绑定" : "待绑定 Skill",
        connectors.length ? "连接器已接入" : "未接入连接器",
      ],
      emptyHints: {
        capabilities: "补充核心能力后，员工主页会更像正式岗位档案。",
        workStyles: "补充工作风格后，执行边界会更清楚。",
        workRecord: "完成一次对话或任务后，会自动沉淀第一条工作记录。",
      },
    };
    const activity = buildActivity(workerId, usageEvents, conversations, runs, tasks, triggers, projects);
    const profileCompleteness = profileCompletenessFor(meta, markdowns, meta.skills || [], connectors);
    const growth = buildGrowth(meta, markdowns, profileSummary, usageEvents, growthEvents);

    return {
      worker: {
        ...meta,
        role: meta.employeeType || meta.role || "数字员工",
        status: meta.status || "online",
        markdowns,
      },
      metrics: {
        todayTokens: sum(todayEvents, "totalTokens"),
        weekTokens: sum(weekEvents, "totalTokens"),
        totalTokens: sum(usageEvents, "totalTokens"),
        inputTokens: sum(usageEvents, "inputTokens"),
        outputTokens: sum(usageEvents, "outputTokens"),
        estimated: usageEvents.some((item) => item.estimated),
        taskCount: tasks.length + runs.length,
        automationCount: triggers.length,
        projectCount: projects.length,
        conversationCount: conversations.length,
        runCount: runs.length,
        successRate: finishedEvents.length ? Math.round((completedEvents.length / finishedEvents.length) * 100) : 0,
        averageDurationMs: durationEvents.length ? Math.round(sum(durationEvents, "durationMs") / durationEvents.length) : 0,
        averageTokens: usageEvents.length ? Math.round(sum(usageEvents, "totalTokens") / usageEvents.length) : 0,
        lastActiveAt: usageEvents[0]?.finishedAt || conversations[0]?.updatedAt || meta.updatedAt || meta.createdAt,
      },
      trend: Object.values(trendMap),
      recentWork,
      profileSummary,
      profileCompleteness,
      cost: {
        todayCost,
        weekCost,
        totalCost,
        currency: configuredCostEvents[0] ? costForEvent(configuredCostEvents[0]).currency : "USD",
        estimated: usageEvents.some((item) => item.estimated),
        rateConfigured: configuredCostEvents.length > 0,
      },
      workRecord: {
        timeline,
        taskGroups: groupWorkItems(timeline),
      },
      activity,
      growth,
      resources: {
        projects,
        automations: triggers,
        tasks,
        connectors,
        conversations: conversations.map(compactConversation).slice(0, 10),
        runs: runs.map(compactRun).slice(0, 10),
      },
      memory: {
        count: countMemory(markdowns, meta),
        preview: String(markdowns.MEMORY || "").split(/\r?\n/).filter(Boolean).slice(0, 8),
      },
      skills: {
        count: (meta.skills || []).length,
        bound: meta.skills || [],
      },
      permissions: {
        summary: meta.permissions ? "已配置权限边界" : "默认安全边界",
        items: meta.permissions || {
          filesystem: "项目与输入文件",
          terminal: "需要确认",
          network: "默认关闭",
        },
      },
    };
  }

  if (url.pathname === "/futuretech-admin/workers" && req.method === "GET") {
    sendJson(res, 200, { workers: listAllWorkers() });
    return true;
  }

  if (url.pathname === "/futuretech-admin/workers" && req.method === "POST") {
    const body = await readRequestJson(req);
    const id = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const meta = {
      id, name: body.name || "新数字员工",
      avatar: body.avatar || "Bot", color: body.color || "blue",
      description: body.description || "", model: body.model || null,
      employeeType: body.employeeType || "",
      createdAt: now, updatedAt: now,
    };
    const { qoderDir } = loadWorkerDir(id);
    writeWorkerMeta(id, meta);
    writeWorkerMarkdown(qoderDir, "IDENTITY.md", body.identity || `# Identity — ${meta.name}\n\n${meta.description}\n`);
    writeWorkerMarkdown(qoderDir, "PERSONA.md", body.persona || `# Persona — ${meta.name}\n\n## Character Traits\n\n- Helpful and precise\n`);
    writeWorkerMarkdown(qoderDir, "TOOLS.md", body.tools || "# 工具使用说明\n\n## 可用工具\n\n- **Read**: 读取文件\n- **Write**: 写入文件\n- **Bash**: 执行命令\n");
    writeWorkerMarkdown(qoderDir, "MEMORY.md", body.memoryMd || "# Memory Index\n\n## User Preferences\n\n## Working Rules\n\n## Feedback History\n");
    writeWorkerMarkdown(qoderDir, "WORK_STYLES.md", body.workStyles || "[]");
    writeWorkerMarkdown(qoderDir, "BIBLE.md", body.bible || "");
    writeWorkerMarkdown(qoderDir, "CORE_CAPABILITIES.md", body.coreCapabilities || "");
    writeWorkerMarkdown(qoderDir, "DELIVERY_COMMITMENTS.md", body.deliveryCommitments || "");
    writeWorkerMarkdown(qoderDir, "USER.md", body.userMd || "");
    mkdirSync(join(qoderDir, "memory"), { recursive: true });
    mkdirSync(join(qoderDir, "sessions"), { recursive: true });
    const state = loadAgentosState();
    state.workers = [meta, ...(state.workers || []).filter((item) => item.id !== id)];
    saveAgentosState(state);
    recordWorkerGrowthEvent({
      workerId: id,
      type: "created",
      title: "员工创建",
      detail: `${meta.name} 已加入 AgentOS。`,
      sourceId: id,
      occurredAt: now,
    });
    recordAudit("创建数字员工", meta.name, "operator");
    sendJson(res, 200, { worker: meta });
    return true;
  }

  // Worker sub-resource routes: /futuretech-admin/workers/:id[/subpath]
  const workerRouteMatch = url.pathname.match(/^\/futuretech-admin\/workers\/([^/]+)(.*)?$/);
  if (workerRouteMatch) {
    const workerId = workerRouteMatch[1];
    const subPath = (workerRouteMatch[2] || "").replace(/\/$/, "");
    const meta = readWorkerMeta(workerId);

    if (!meta) {
      sendJson(res, 404, { error: "Worker not found" });
      return true;
    }

    if (subPath === "/overview" && req.method === "GET") {
      const overview = buildWorkerOverview(workerId, url.searchParams.get("range") || "7d");
      if (!overview) {
        sendJson(res, 404, { error: "Worker not found" });
        return true;
      }
      sendJson(res, 200, overview);
      return true;
    }

    // GET /workers/:id — full detail with markdown files
    if (!subPath && req.method === "GET") {
      const { qoderDir } = loadWorkerDir(workerId);
      const markdowns = readWorkerMarkdowns(qoderDir);
      const catalog = await listOpencodeSkills();
      sendJson(res, 200, { worker: { ...meta, markdowns, availableSkills: catalog.skills || [] } });
      return true;
    }

    // PUT /workers/:id — update meta
    if (!subPath && req.method === "PUT") {
      const body = await readRequestJson(req);
      const updated = { ...meta, ...body, id: meta.id, createdAt: meta.createdAt, updatedAt: new Date().toISOString() };
      writeWorkerMeta(workerId, updated);
      const state = loadAgentosState();
      state.workers = [updated, ...(state.workers || []).filter((item) => item.id !== workerId)];
      saveAgentosState(state);
      recordWorkerGrowthEvent({
        workerId,
        type: "profile",
        title: "档案更新",
        detail: `${updated.name} 的基础档案已更新。`,
        sourceId: `${workerId}-${updated.updatedAt}`,
        occurredAt: updated.updatedAt,
      });
      if (JSON.stringify(meta.skills || []) !== JSON.stringify(updated.skills || [])) {
        recordWorkerGrowthEvent({
          workerId,
          type: "skill",
          title: "Skill 更新",
          detail: (updated.skills || []).length ? `已绑定 ${(updated.skills || []).length} 个 Skill。` : "已清空绑定 Skill。",
          sourceId: `${workerId}-skills-${updated.updatedAt}`,
          occurredAt: updated.updatedAt,
        });
      }
      if (JSON.stringify(meta.permissions || null) !== JSON.stringify(updated.permissions || null)) {
        recordWorkerGrowthEvent({
          workerId,
          type: "permission",
          title: "权限变化",
          detail: updated.permissions ? "权限边界已更新。" : "权限边界恢复默认。",
          sourceId: `${workerId}-permissions-${updated.updatedAt}`,
          occurredAt: updated.updatedAt,
        });
      }
      recordAudit("更新数字员工", updated.name, "operator");
      sendJson(res, 200, { worker: updated });
      return true;
    }

    // DELETE /workers/:id
    if (!subPath && req.method === "DELETE") {
      if (workerId === "worker-default") {
        sendJson(res, 400, { error: "Default worker cannot be deleted" });
        return true;
      }
      try { const { rmSync } = await import("node:fs"); rmSync(join(workersDir, workerId), { recursive: true, force: true }); } catch {}
      const state = loadAgentosState();
      state.workers = (state.workers || []).filter((item) => item.id !== workerId);
      state.workerGrowthEvents = (state.workerGrowthEvents || []).filter((item) => item.workerId !== workerId);
      state.workerUsageEvents = (state.workerUsageEvents || []).filter((item) => item.workerId !== workerId);
      saveAgentosState(state);
      recordAudit("删除数字员工", meta.name, "operator");
      sendJson(res, 200, { ok: true });
      return true;
    }

    // GET/PUT /workers/:id/markdown/:filename — read/write markdown files
    const mdMatch = subPath.match(/^\/markdown\/(.+)$/);
    if (mdMatch) {
      const filename = mdMatch[1];
      if (!WORKER_MD_FILES.includes(filename)) {
        sendJson(res, 400, { error: "Invalid filename" });
        return true;
      }
      const { qoderDir } = loadWorkerDir(workerId);
      if (req.method === "GET") {
        const content = existsSync(join(qoderDir, filename)) ? readFileSync(join(qoderDir, filename), "utf8") : "";
        sendJson(res, 200, { filename, content });
        return true;
      }
      if (req.method === "PUT") {
        const body = await readRequestJson(req);
        writeWorkerMarkdown(qoderDir, filename, body.content || "");
        const now = new Date().toISOString();
        const growthType = filename === "MEMORY.md"
          ? "memory"
          : filename === "CORE_CAPABILITIES.md" || filename === "WORK_STYLES.md" || filename === "IDENTITY.md"
            ? "profile"
            : "activity";
        recordWorkerGrowthEvent({
          workerId,
          type: growthType,
          title: growthType === "memory" ? "记忆更新" : "员工资料更新",
          detail: `${filename} 已更新。`,
          sourceId: `${workerId}-${filename}-${now}`,
          occurredAt: now,
        });
        sendJson(res, 200, { filename, ok: true });
        return true;
      }
    }

    // ─── Projects API ───
    if (subPath === "/projects") {
      const state = loadAgentosState();
      const projects = (state.projects || []).filter((p) => p.workerId === workerId);
      if (req.method === "GET") {
        sendJson(res, 200, { projects });
        return true;
      }
      if (req.method === "POST") {
        const body = await readRequestJson(req);
        const project = {
          id: `proj-${Date.now().toString(36)}`,
          workerId, name: body.name || "新项目",
          status: "active", ephemeral: false,
          description: body.description || "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.projects = [...(state.projects || []), project];
        saveAgentosState(state);
        recordWorkerGrowthEvent({
          workerId,
          type: "project",
          title: "项目更新",
          detail: `新增项目：${project.name}`,
          sourceId: project.id,
          occurredAt: project.createdAt,
        });
        sendJson(res, 200, { project });
        return true;
      }
    }

    // ─── Triggers API ───
    if (subPath === "/triggers") {
      const state = loadAgentosState();
      const triggers = (state.triggers || []).filter((t) => t.workerId === workerId);
      if (req.method === "GET") {
        sendJson(res, 200, { triggers });
        return true;
      }
      if (req.method === "POST") {
        const body = await readRequestJson(req);
        const trigger = {
          id: `trig-${Date.now().toString(36)}`,
          workerId, name: body.name || "新触发器",
          prompt: body.prompt || "", model: body.model || "",
          enabled: body.enabled !== false,
          triggerKind: body.triggerKind || "manual",
          scheduleType: body.scheduleType || "",
          lastRunStatus: null, lastRunAt: null, nextRunAt: null,
          runCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.triggers = [...(state.triggers || []), trigger];
        saveAgentosState(state);
        recordWorkerGrowthEvent({
          workerId,
          type: "automation",
          title: "自动化更新",
          detail: `新增自动化：${trigger.name}`,
          sourceId: trigger.id,
          occurredAt: trigger.createdAt,
        });
        sendJson(res, 200, { trigger });
        return true;
      }
    }

    const trigMatch = subPath.match(/^\/triggers\/([^/]+)$/);
    if (trigMatch) {
      const trigId = trigMatch[1];
      const state = loadAgentosState();
      const trigger = (state.triggers || []).find((t) => t.id === trigId);
      if (!trigger) { sendJson(res, 404, { error: "Trigger not found" }); return true; }
      if (req.method === "GET") { sendJson(res, 200, { trigger }); return true; }
      if (req.method === "PUT") {
        const body = await readRequestJson(req);
        Object.assign(trigger, body, { id: trigger.id, workerId: trigger.workerId, updatedAt: new Date().toISOString() });
        saveAgentosState(state);
        recordWorkerGrowthEvent({
          workerId,
          type: "automation",
          title: "自动化更新",
          detail: `自动化已更新：${trigger.name}`,
          sourceId: `${trigger.id}-${trigger.updatedAt}`,
          occurredAt: trigger.updatedAt,
        });
        sendJson(res, 200, { trigger });
        return true;
      }
      if (req.method === "DELETE") {
        state.triggers = (state.triggers || []).filter((t) => t.id !== trigId);
        saveAgentosState(state);
        recordWorkerGrowthEvent({
          workerId,
          type: "automation",
          title: "自动化更新",
          detail: `自动化已删除：${trigger.name}`,
          sourceId: `${trigId}-deleted-${Date.now()}`,
        });
        sendJson(res, 200, { ok: true });
        return true;
      }
    }

    // ─── Tasks API ───
    if (subPath === "/tasks") {
      const state = loadAgentosState();
      const tasks = (state.tasks || []).filter((t) => t.workerId === workerId);
      sendJson(res, 200, { tasks });
      return true;
    }

    // ─── Connectors API ───
    if (subPath === "/connectors") {
      const state = loadAgentosState();
      const connectors = (state.connectors || []).filter((c) => c.workerId === workerId);
      if (req.method === "GET") {
        sendJson(res, 200, { connectors });
        return true;
      }
      if (req.method === "POST") {
        const body = await readRequestJson(req);
        const connector = {
          id: `conn-${Date.now().toString(36)}`,
          workerId, name: body.name || "新连接器",
          type: body.type || "generic", enabled: true,
          config: body.config || {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.connectors = [...(state.connectors || []), connector];
        saveAgentosState(state);
        recordWorkerGrowthEvent({
          workerId,
          type: "connector",
          title: "连接器变化",
          detail: `新增连接器：${connector.name}`,
          sourceId: connector.id,
          occurredAt: connector.createdAt,
        });
        sendJson(res, 200, { connector });
        return true;
      }
    }

    const connMatch = subPath.match(/^\/connectors\/([^/]+)$/);
    if (connMatch) {
      const connId = connMatch[1];
      const state = loadAgentosState();
      const connector = (state.connectors || []).find((c) => c.id === connId);
      if (!connector) { sendJson(res, 404, { error: "Connector not found" }); return true; }
      if (req.method === "PUT") {
        const body = await readRequestJson(req);
        Object.assign(connector, body, { id: connector.id, workerId: connector.workerId, updatedAt: new Date().toISOString() });
        saveAgentosState(state);
        recordWorkerGrowthEvent({
          workerId,
          type: "connector",
          title: "连接器变化",
          detail: `连接器已更新：${connector.name}`,
          sourceId: `${connector.id}-${connector.updatedAt}`,
          occurredAt: connector.updatedAt,
        });
        sendJson(res, 200, { connector });
        return true;
      }
      if (req.method === "DELETE") {
        state.connectors = (state.connectors || []).filter((c) => c.id !== connId);
        saveAgentosState(state);
        recordWorkerGrowthEvent({
          workerId,
          type: "connector",
          title: "连接器变化",
          detail: `连接器已删除：${connector.name}`,
          sourceId: `${connId}-deleted-${Date.now()}`,
        });
        sendJson(res, 200, { ok: true });
        return true;
      }
    }
  }

  if (url.pathname === "/futuretech-admin/conversations" && req.method === "GET") {
    const state = loadAgentosState();
    let conversations = state.conversations || [];
    const workerId = url.searchParams.get("workerId");
    if (workerId) {
      conversations = conversations.filter((c) => c.workerId === workerId);
    }
    sendJson(res, 200, {
      conversations: conversations.map(({ messages, ...rest }) => rest),
    });
    return true;
  }

  if (url.pathname === "/futuretech-admin/conversations" && req.method === "POST") {
    const body = await readRequestJson(req);
    const state = loadAgentosState();
    const worker = readWorkerMeta(body.workerId || "worker-default") || (state.workers || []).find((w) => w.id === body.workerId);
    const conversation = {
      id: `conv-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      workerId: body.workerId || "worker-default",
      workerName: worker?.name || "通用助手",
      title: body.title || "新对话",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.conversations = [...(state.conversations || []), conversation];
    saveAgentosState(state);
    sendJson(res, 200, { conversation: { ...conversation } });
    return true;
  }

  if (url.pathname.startsWith("/futuretech-admin/conversations/") && !url.pathname.includes("/messages") && req.method === "GET") {
    const convId = url.pathname.split("/").pop();
    const state = loadAgentosState();
    const conv = (state.conversations || []).find((c) => c.id === convId);
    if (!conv) {
      sendJson(res, 404, { error: "Conversation not found" });
      return true;
    }
    sendJson(res, 200, { conversation: conv });
    return true;
  }

  if (url.pathname.startsWith("/futuretech-admin/conversations/") && !url.pathname.includes("/messages") && req.method === "DELETE") {
    const convId = url.pathname.split("/").pop();
    const state = loadAgentosState();
    state.conversations = (state.conversations || []).filter((c) => c.id !== convId);
    saveAgentosState(state);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // ─── SSE 流式消息端点 ─────────────────────────────────────────────────

  if (url.pathname.startsWith("/futuretech-admin/conversations/") && url.pathname.endsWith("/messages") && req.method === "POST") {
    const convId = url.pathname.split("/")[3];
    const body = await readRequestJson(req);
    const state = loadAgentosState();
    const conv = (state.conversations || []).find((c) => c.id === convId);
    if (!conv) {
      sendJson(res, 404, { error: "Conversation not found" });
      return true;
    }

    const worker = readWorkerMeta(conv.workerId) || (state.workers || []).find((w) => w.id === conv.workerId);
    const workerMarkdowns = worker ? readWorkerMarkdowns(loadWorkerDir(conv.workerId).qoderDir) : {};
    const userMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: body.content || "",
      timestamp: new Date().toISOString(),
    };
    conv.messages.push(userMessage);
    if (conv.messages.length === 1) {
      conv.title = body.content.slice(0, 40) || "新对话";
    }
    conv.updatedAt = new Date().toISOString();
    saveAgentosState(state);

    // 设置 SSE 响应头
    res.statusCode = 200;
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-cache");
    res.setHeader("connection", "keep-alive");
    res.setHeader("access-control-allow-origin", "http://localhost:5174");
    res.setHeader("access-control-allow-methods", "POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");

    const sendEvent = (eventName, data) => {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const skillContext = (worker?.skills || []).length > 0
      ? `\n你绑定的 Skill: ${(worker.skills || []).join(", ")}。请在合适时调用相关 Skill。`
      : "";
    const memoryItems = [
      ...((worker?.memory || []).map((m) => `- ${m.key}: ${m.value}`)),
      ...(workerMarkdowns.MEMORY ? [workerMarkdowns.MEMORY] : []),
    ].filter(Boolean);
    const memoryContext = memoryItems.length > 0
      ? `\n你的记忆:\n${memoryItems.join("\n")}`
      : "";
    const systemPrompt = (worker?.rolePrompt || workerMarkdowns.IDENTITY || "你是一个AI助手。") + skillContext + memoryContext;

    const messagesForPrompt = [
      { role: "system", content: systemPrompt },
      ...conv.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const assistantMessage = {
      id: `msg-${Date.now() + 1}`,
      role: "assistant",
      content: "",
      toolCalls: [],
      timestamp: new Date().toISOString(),
    };

    try {
      const prompt = messagesForPrompt.map((m) => {
        if (m.role === "system") return `[System] ${m.content}`;
        if (m.role === "user") return `[User] ${m.content}`;
        return m.content;
      }).join("\n\n");

      const runId = `run-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
      const startedAt = new Date().toISOString();
      let tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      const child = spawn("opencode", [
        "run", "--format", "json",
        "--attach", target.origin,
        "--dir", root,
        "--title", `AgentOS ${worker?.name || "chat"}`,
        prompt,
      ], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });

      let buffer = "";
      child.stdout.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "message" || event.type === "text") {
              const text = event.content || event.text || "";
              if (text) {
                assistantMessage.content += text;
                sendEvent("message_delta", { text });
              }
            } else if (event.type === "tool_use" || event.type === "tool_call") {
              const toolCall = { name: event.name || event.tool || "", args: event.args || event.input || {} };
              assistantMessage.toolCalls.push(toolCall);
              sendEvent("tool_call", toolCall);
            } else if (event.type === "tool_result") {
              sendEvent("tool_result", { name: event.name || "", result: event.content || event.result || "" });
            }
            tokenUsage = mergeTokenUsage(tokenUsage, readTokenUsage(event));
          } catch {}
        }
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8").trim();
        if (text && !text.includes("<think>")) {
          sendEvent("message_delta", { text: "" });
        }
      });

      child.on("close", (code) => {
        assistantMessage.timestamp = new Date().toISOString();
        conv.messages.push(assistantMessage);
        conv.updatedAt = new Date().toISOString();
        saveAgentosState(state);
        const estimated = !tokenUsage.totalTokens;
        const finalUsage = estimated
          ? {
              inputTokens: estimateTokensFromText(prompt),
              outputTokens: estimateTokensFromText(assistantMessage.content),
              totalTokens: estimateTokensFromText(prompt) + estimateTokensFromText(assistantMessage.content),
            }
          : tokenUsage;
        recordWorkerUsageEvent({
          workerId: conv.workerId || "worker-default",
          source: "chat",
          sourceId: assistantMessage.id,
          conversationId: conv.id,
          title: conv.title || "新对话",
          status: code === 0 ? "completed" : "failed",
          model: worker?.model || "",
          ...finalUsage,
          estimated,
          durationMs: new Date(assistantMessage.timestamp).getTime() - new Date(startedAt).getTime(),
          startedAt,
          finishedAt: assistantMessage.timestamp,
        });
        sendEvent("message_complete", { messageId: assistantMessage.id, exitCode: code });
        res.end();
      });

      child.on("error", (error) => {
        assistantMessage.content += `\n[执行错误: ${error.message}]`;
        assistantMessage.timestamp = new Date().toISOString();
        conv.messages.push(assistantMessage);
        conv.updatedAt = new Date().toISOString();
        saveAgentosState(state);
        const inputTokens = estimateTokensFromText(prompt);
        const outputTokens = estimateTokensFromText(assistantMessage.content);
        recordWorkerUsageEvent({
          workerId: conv.workerId || "worker-default",
          source: "chat",
          sourceId: assistantMessage.id,
          conversationId: conv.id,
          title: conv.title || "新对话",
          status: "failed",
          model: worker?.model || "",
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimated: true,
          durationMs: new Date(assistantMessage.timestamp).getTime() - new Date(startedAt).getTime(),
          startedAt,
          finishedAt: assistantMessage.timestamp,
        });
        sendEvent("message_complete", { messageId: assistantMessage.id, error: error.message });
        res.end();
      });
    } catch (error) {
      sendEvent("message_complete", { error: error.message });
      res.end();
    }

    return true;
  }

  return false;
}

async function forward(req, res) {
  if ((req.url || "").startsWith("/futuretech-admin/")) {
    const handled = await handleAdmin(req, res);
    if (handled) return;
  }

  const upstreamUrl = new URL(req.url || "/", target);
  if (req.method === "GET" && upstreamUrl.pathname === "/provider") {
    const catalog = await readRuntimeProviderCatalog();
    if (catalog) {
      sendJson(res, 200, filterProviderCatalogForProduct(catalog));
      return;
    }
  }

  const headers = {
    ...req.headers,
    host: target.host,
    origin: target.origin,
    "accept-encoding": "identity",
  };

  const upstreamReq = http.request(
    upstreamUrl,
    {
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      Object.entries(upstreamRes.headers).forEach(([key, value]) => {
        if (key.toLowerCase() !== "content-security-policy") {
          res.setHeader(key, value);
        }
      });
      res.statusCode = upstreamRes.statusCode || 200;
      upstreamRes.pipe(res);
    }
  );

  upstreamReq.on("error", (error) => {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "FutureTech console proxy failed", detail: error.message }));
  });

  req.pipe(upstreamReq);
}

const server = http.createServer(forward);

server.on("upgrade", (req, socket, head) => {
  if ((req.url || "").startsWith("/futuretech-admin/")) {
    socket.destroy();
    return;
  }

  const upstream = net.connect(runtimePort, runtimeHost, () => {
    const headers = {
      ...req.headers,
      host: target.host,
      origin: target.origin,
    };
    const headerLines = Object.entries(headers)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\r\n");

    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headerLines}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });

  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(port, "127.0.0.1", () => {
  console.log(`FutureTech console proxy listening on http://127.0.0.1:${port}`);
  console.log(`Forwarding to ${target.origin}`);
});
