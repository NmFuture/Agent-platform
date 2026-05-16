---
name: contract-e2e-excel
description: This skill should be used when the user asks to "合同PDF转Excel", "输入pdf给Excel", "执行合同抽取e2e", "给你pdf给我Excel", "合同分解规则抽取", "根据合同分解规则生成5个sheet", or wants a wind-power equipment procurement contract PDF extracted into the required Excel workbook.
version: 0.1.0
---

# Contract E2E Excel Skill

将风电设备采购合同 PDF 端到端抽取为一个完整 Excel。最终结果必须是 `.xlsx`，并且包含 5 个 sheet：类型1固定字段、类型2付款条件、类型3违约条款、类型4合同风险、类型5资料交付要求。

## 使用时机

在用户给出合同 PDF，并要求“跑一次 e2e”“输入 PDF 给 Excel”“合同抽取结果 Excel”“按合同分解规则输出 5 个 sheet”时使用本 skill。

## 输入

确认以下输入，不要等待过度澄清：

- 合同 PDF：用户提供的 `.pdf` 文件。
- 规则 JSON：默认使用 skill 内置的 `assets/contract_rules_v1_7.machine.json`；如当前项目下存在更新版 `outputs/contract_rules_v1_7.machine.json`，或用户显式传入 `--rules`，优先使用项目/用户版本。
- 输出目录：默认使用当前项目的 `outputs/`。

## 快速执行

优先运行内置脚本：

```bash
python3 skills/contract-e2e-excel/scripts/contract_pdf_to_excel.py \
  --pdf "/absolute/path/to/contract.pdf" \
  --output-dir "/absolute/path/to/outputs"
```

如不传 `--rules`，脚本会先从当前工作目录自动查找 `contract_rules*.machine.json`，找不到时使用 skill 内置规则。

脚本会输出：

- `outputs/<PDF文件名>_抽取结果.xlsx`
- `outputs/contract_extraction_result.json`
- `outputs/contract_extraction_summary.json`

## 工作流程

1. 定位输入 PDF 和规则 JSON。
2. 运行 `scripts/contract_pdf_to_excel.py`。
3. 读取脚本输出的 JSON 摘要，确认类型1状态统计和类型2-5行数。
4. 用 `openpyxl.load_workbook` 重新打开生成的 `.xlsx`，确认刚好 5 个 sheet。
5. 向用户只交付最终 Excel 路径和简短统计。除非用户要求，不要把中间 JSON 当成主交付。

## 输出结构

完整列定义见 `references/output_excel_contract.md`。必须保持 5 个 sheet 名称稳定：

- `类型1-字段直接提取`
- `类型2-付款条件提取`
- `类型3-违约条款`
- `类型4-合同风险识别`
- `类型5-资料交付要求`

## 内置资产

使用以下内置文件保证后续只输入 PDF 也能完成 e2e：

- `assets/contract_rules_v1_7.machine.json`：合同分解规则的机器可读版本。
- `assets/contract_extraction_output_template.xlsx`：5-sheet 输出模板，作为格式参考和人工兜底模板。
- `assets/contract_extraction_result.schema.json`：中间抽取 JSON 的结构约束。

## 抽取原则

使用“规则 + 证据 + 状态”的方式，不把所有内容写死为纯正则。

- 对合同编号、金额、比例、页码、日期、型号、数量等格式明显的内容，使用正则或锚点抽取。
- 对付款条件、违约责任、风险点、资料交付要求等跨句或跨段内容，使用关键词锚点、章节范围和证据片段组合判断。
- 对无法确认的内容输出 `not_found` 或 `ambiguous`，不要编造值。
- 对项目类型不适用的规则输出 `not_applicable`。
- 每个命中项保留原文依据、页码、状态和置信度。

## 验证要求

生成 Excel 后执行最小校验：

```bash
python3 - <<'PY'
from openpyxl import load_workbook
path = "/absolute/path/to/output.xlsx"
wb = load_workbook(path, read_only=True, data_only=True)
print(wb.sheetnames)
for ws in wb.worksheets:
    print(ws.title, ws.max_row, ws.max_column)
PY
```

通过条件：

- 文件存在且能被 `openpyxl` 打开。
- sheet 名称与 5 个目标名称一致。
- 类型1有规则行；类型2-5至少输出表头和已识别行。
- `found` 或 `ambiguous` 项应有原文依据或原文位置。

## 交付口径

最终回复保持简短：

- 给出 Excel 的绝对路径链接。
- 给出类型1命中统计和类型2-5行数。
- 如存在大量 `not_found` 或 `ambiguous`，说明这些项需要人工复核。

不要声称自动抽取结果等同于法律审核结论。不要修改源 PDF、源规则 Excel 或规则 JSON，除非用户明确要求。
