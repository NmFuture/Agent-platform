import { FileText } from "lucide-react";

export const agents = [
  {
    id: "contract-extraction",
    name: "合同提取智能体",
    shortName: "合同",
    icon: FileText,
    color: "teal",
    status: "已启用",
    owner: "法务 / 商务 / 项目交付",
    description: "读取合同 PDF，按内置规则输出五类结构化 Excel 和抽取统计。",
    inputs: ["合同 PDF", "本机 PDF 路径"],
    outputs: ["合同抽取结果 Excel", "抽取统计 JSON", "结构化抽取 JSON"],
    skills: ["contract-e2e-excel"],
    runnable: true,
    runner: {
      type: "skill-script",
      skillId: "contract-e2e-excel",
    },
  },
];

export const runSteps = [
  {
    key: "input",
    title: "读取输入",
    detail: "接收上传 PDF 或本机 PDF 绝对路径，创建本次任务工作目录。",
    tool: "contract-e2e-excel",
    source: "合同 PDF",
  },
  {
    key: "extract",
    title: "执行 Skill",
    detail: "调用合同提取 Skill，完成字段、付款、违约、风险和资料交付要求抽取。",
    tool: "contract-e2e-excel",
    source: "FutureTech Skill",
  },
  {
    key: "validate",
    title: "校验输出",
    detail: "检查 Excel、summary JSON 和 result JSON 是否完整生成。",
    tool: "openpyxl",
    source: "任务输出目录",
  },
  {
    key: "deliver",
    title: "交付产物",
    detail: "回写运行记录、产物路径和抽取统计，供前端追踪和下载。",
    tool: "AgentOS",
    source: ".runtime/agentos-runs",
  },
];

export const knowledgeBases = [
  { name: "合同提取规则包", count: "248", freshness: "本机 Skill", type: "字段规则" },
  { name: "Excel 输出模板", count: "5 sheets", freshness: "本机 Skill", type: "交付模板" },
  { name: "运行产物目录", count: ".runtime", freshness: "实时写入", type: "审计记录" },
];

export const baseSkills = [];

export const skillCatalog = [];

export const customizationTemplates = [];

export const auditEvents = [
  { time: "当前", user: "operator", action: "启动合同提取智能体", target: "合同 PDF -> Excel" },
  { time: "当前", user: "平台", action: "调用 Skill", target: "contract-e2e-excel" },
  { time: "当前", user: "平台", action: "生成结果文件", target: "五类合同抽取 Excel" },
];
