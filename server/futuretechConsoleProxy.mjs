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
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
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
