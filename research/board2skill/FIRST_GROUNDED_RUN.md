# 首次真实时序板书蒸馏闭环记录

日期：2026-08-11
状态：工程冒烟通过；不是论文结果，不通过 G0-A/G0-B，不允许写入结果表。

## 输入边界

- 来源 bundle：`tbv2-ly-004-01-gold-dev-v1`
- payload SHA-256：`266415d4f9d67d96b4d743140f6d162197454bf5cfdbf4d86ee18386e2f27f20`
- 可复现性：编译时间由仲裁台账冻结；同一输入连续编译两次得到相同 payload SHA-256
- Gold 状态：`engineering_gold_dev_not_paper_gold`、`requires_human_signoff`
- accepted 事件：2 个
  - `B-DELTA-05`：写入支持力与重力的比例约束；对应 `B-EV-D05`
  - `B-DELTA-06`：列出摩擦力与加速度两个待求量；对应 `B-EV-D06`
- 每个事件提交一张 1920×360 的三联 montage：左侧 before，中间将非变化区域压暗并用亮色框标出 delta，右侧 after。图像从证据包读取后校验 PNG 完整解码或 JPEG 真实解码、尺寸、SHA-256 和受控相对路径。当前可信输入收窄为 PNG/JPEG，不把仅验证容器头的 WebP 冒充已支持。
- 同期 ASR 只作为 teacher-stated 证据；没有学生音视频，禁止产生 observed learner outcome。

## 真实运行

- 模型：`gpt-5.5`
- API 路径：`@earendil-works/pi-ai` 的 `openai-completions` 多模态适配器
- 最终验收运行：`run-005`
- 视觉批次：1
- 实际提交 montage：2
- schema 请求：1；首次输出通过 Skill 合同
- 请求中的两张图都带精确 delta/evidence 标签，提交前只读取一次并校验 SHA-256
- provider stop：`stop`
- usage：input 440、cacheRead 4992、output 2034、reasoning 248、total 7466
- 生成：1 个 capability、1 个可编译 Skill
- 早期试跑曾出现一次 `empty_stream` 传输错误；独立的一图/两图烟测、早期双联图 run-003/run-004 与最终三联图 run-005 均成功。该现象记录为运行可靠性风险，不改写为方法失败或成功指标。

## 产物审查

生成能力为“受力问题中先写已知约束再列待求量”。两条 teacher replay action 分别绑定到对应 transition、delta、视觉 evidence 与语音 evidence：

1. 将题目给出的 `N = 1.2mg` 抽象为参数化 `N = λmg`，没有把具体答案或实例常数固化进 Skill；
2. 在已知约束下方列出 `f = ?` 与 `a = ?`，保留了课堂中的空间组织与渐进呈现关系；
3. Board Action IR 不包含 HTML/SVG/Canvas 实现，Render Plan 独立允许 HTML、SVG、Ink，并以 `auto` 为首选；
4. 没有声称学生点头、听懂、作答正确或学习增益；
5. limitations 明确只覆盖两个事件，不能外推为完整受力分析或后续求解策略。

## 能证明与不能证明的事

本次运行能证明：真实板书像素、时序事件、语音、来源 ID、renderer-neutral Skill 和运行审计已经形成一条可执行闭环。

本次运行不能证明：

- 时序板书优于 transcript/static/uniform frame；
- 自动恢复算法能够稳定复原板书；
- Skill 能提高真实学生学习效果；
- 两条事件已经达到论文级 Gold；
- 该能力是跨课程或跨教师共性能力。

下一门仍是：完成 30–50 个双人仲裁事件，并在完全相同模型、Prompt、输出和预算下运行四条件 Oracle Value Gate。
