# 输出契约

每个能力至少包含：

- `key`：英文小写连字符标识。
- `name`、`summary`：中文名与一句话定义。
- `use_when`、`inputs`：触发场景与必要输入。
- `procedure`：4–8 个动词开头的执行步骤。
- `quality_checks`、`failure_modes`：可检查标准与纠偏。
- `evidence`：课程、时间戳、30 字以内短摘录、支持的模式。
- `supporting_lessons`、`confidence`：不同课程支持数与 0–1 置信度。

每个生成 Skill 文件夹包含：

```text
skill-name/
├── SKILL.md
├── agents/openai.yaml
├── references/evidence.md
├── references/pattern.md
└── manifest.json
```

`SKILL.md` frontmatter 只使用 `name` 与 `description`。详细证据放在 references；来源与模型信息放在 manifest。
