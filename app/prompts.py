ANALYSIS_PROMPT_VERSION = "teacher-analysis-v2"
DISTILL_PROMPT_VERSION = "teacher-action-guide-v4"


ANALYSIS_SYSTEM = """你是一名高中物理教研员与教师教练。只根据给出的逐字稿证据分析，不补写课堂中没有发生的事实。输出严格 JSON。分析重点不是给课堂贴标签，而是还原教师怎样把学生从当前认知带到学习目标：何时采取动作、具体做什么、希望学生产生什么可观察反应、学生卡住时如何支架。区分原课事实与后续教学建议；本步骤只抽取事实。每个判断尽量给出时间戳和短证据。"""

ANALYSIS_USER = """分析下面这段教师课程逐字稿，返回：
{{
  "lesson_title": "...",
  "knowledge_focus": ["..."],
  "learner_starting_points": [{{"state_or_difficulty":"...","teacher_diagnosis":"...","evidence":[]}}],
  "teaching_moves": [{{"trigger":"学生出现什么状态或教学推进到哪一步","move":"教师具体做什么","purpose":"希望学生发生什么认知变化","observable_student_response":"可观察的学生反应；原课没有则写证据不足","fallback_or_scaffold":"教师使用了什么支架；原课没有则写证据不足","evidence":[{{"timestamp":"MM:SS","quote":"不超过30字"}}]}}],
  "question_patterns": [{{"pattern":"...","purpose":"...","expected_thinking":"希望学生进行什么思考","wait_or_scaffold":"原课中的等待或支架；没有则写证据不足","evidence":[]}}],
  "representation_moves": [{{"from":"现象/语言/图/公式","to":"...","how":"...","evidence":[]}}],
  "misconceptions": [{{"misconception":"...","diagnosis":"...","repair":"...","evidence":[]}}],
  "experiment_reasoning": [{{"move":"...","variables_or_evidence":"...","evidence":[]}}],
  "assessment_moves": [{{"move":"...","observable":"...","evidence":[]}}],
  "lesson_arc": [{{"phase":"...","purpose":"..."}}],
  "transferable_candidates": ["..."],
  "uncertainties": ["证据不足之处"]
}}

课程：{title}
学科：{subject}
逐字稿片段（带时间戳）：
{transcript}
"""

COURSE_REDUCE_SYSTEM = """你是严谨的教研分析员。合并同一课的分段分析，去重并保留时间戳证据。不得发明证据。输出 JSON。"""

COURSE_REDUCE_USER = """将以下同一课的分段分析合并为一个 JSON，沿用原字段。证据冲突时写入 uncertainties。
课程：{title}
分段分析：
{analyses}
"""

SINGLE_DISTILL_SYSTEM = """你是一名资深高中物理教研员。只根据这一节课的分析，提炼少而精、可迁移且有本课证据支持的教学能力。这里不要求跨课程重复；判断标准是教师行动是否明确、是否对应学生认知变化、是否能由时间戳证据追溯。课程知识本身不能冒充教学能力。只做能力识别与证据筛选，不在本步骤展开完整教案。输出严格 JSON。"""

SINGLE_DISTILL_USER = """从下面这一节课的分析中，输出 1–3 个有明确课堂证据、可供其他老师复用的教学能力候选：
{{
  "suite_name": "单课教学能力",
  "methodology": "如何从本课证据判定可迁移教学能力",
  "capabilities": [{{
    "key": "英文小写连字符，如 concept-modeling",
    "name": "中文能力名",
    "summary": "一句话说明这种教法怎样帮助学生学习",
    "teaching_goal": "学生完成这段教学后应该能做什么",
    "use_when": ["可观察的学生状态或课堂触发场景"],
    "prerequisites": ["学生需要的起点认知、教师需要的材料"],
    "quality_checks": ["教师课后或观课者可检查的标准"],
    "failure_modes": ["常见教法失败：具体纠偏动作"],
    "evidence": [{{"lesson":"课程名","timestamp":"MM:SS","quote":"不超过30字","supports":"支持何种教师行动"}}],
    "supporting_lessons": 1,
    "confidence": 0.0
  }}],
  "excluded_course_specific_patterns": ["只有本课知识内容、不可迁移的候选"],
  "limitations": ["单课证据的适用边界"]
}}

要求：每个 capability 至少包含一条来自本课的时间戳证据；能力必须描述教师何时做什么、希望学生发生什么变化，禁止空泛的“因材施教”“启发学生”；不要因为只有一节课而返回空列表；confidence 为 0–1。

课程分析：
{analysis}
"""

DISTILL_SYSTEM = """你是一名资深高中物理教研员。先从多节课中提炼少而精的共性教学能力，只做能力识别与证据筛选，不在本步骤展开完整教案。只保留至少两节课支持的模式；课程特有知识不要伪装成共性。输出严格 JSON。"""

DISTILL_USER = """比较下面 {count} 节课的分析，输出 3–5 个有跨课证据的共性教学能力候选：
{{
  "suite_name": "高中物理共性教学能力",
  "methodology": "如何判定共性",
  "capabilities": [{{
    "key": "英文小写连字符，如 concept-modeling",
    "name": "中文能力名",
    "summary": "一句话说明这种教法怎样帮助学生学习",
    "teaching_goal": "学生完成这段教学后应该能做什么",
    "use_when": ["可观察的学生状态或课堂触发场景"],
    "prerequisites": ["学生需要的起点认知、教师需要的材料"],
    "quality_checks": ["教师课后或观课者可检查的标准"],
    "failure_modes": ["常见教法失败：具体纠偏动作"],
    "evidence": [{{"lesson":"课程名","timestamp":"MM:SS","quote":"不超过30字","supports":"支持何种模式"}}],
    "supporting_lessons": 2,
    "confidence": 0.0
  }}],
  "excluded_course_specific_patterns": ["..."],
  "limitations": ["..."]
}}

要求：每个 capability 至少有两节不同课程的证据；只输出候选能力所需字段，避免展开长篇教案；禁止空泛的“因材施教”“启发学生”；confidence 为 0–1。

课程分析：
{analyses}
"""

GUIDE_SYSTEM = """你是一名资深高中物理教师教练。把一个已有跨课证据的教学能力扩展成老师明天就能照着实施、同时能根据学生反应调整的课堂行动指南。原课短摘录只能留在输入 capability 的 evidence 中；suggested_language 是你新生成的建议话术，不能声称是原课引用。输出严格 JSON，简洁具体。"""

GUIDE_USER = """根据教学能力和课程分析，补全该能力的教师行动指南，只返回下面三个字段：
{{
  "lesson_flow": [{{
    "phase": "本步教学阶段",
    "teacher_action": "教师具体动作，以动词开头",
    "suggested_language": "老师可以怎样问或怎样说",
    "expected_student_response": "学生应出现的可观察回答、操作或表征",
    "if_student_struggles": "学生没有达到预期时，教师下一步支架"
  }}],
  "assessment_checkpoints": [{{
    "check": "教师怎样检查",
    "success_signal": "什么表现说明学生已掌握",
    "next_move_if_not": "未掌握时立即采取什么动作"
  }}],
  "adaptations": [{{"learner_signal":"不同学生表现","adjustment":"对应的教学调整"}}]
}}

要求：lesson_flow 固定 4 步，每一步四个行动字段都要写；assessment_checkpoints 2 个；adaptations 2 个，分别覆盖“学生基础薄弱”和“学生已经掌握”；建议话术要短、自然、可在课堂直接说；不要重复 capability 已有字段。

教学能力：
{capability}

课程分析：
{analyses}
"""
