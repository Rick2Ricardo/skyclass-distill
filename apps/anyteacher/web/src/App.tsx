import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  BenchmarkDataset,
  BenchmarkScenario,
  DistillMode,
  ExperimentRun,
  ExperimentSummary,
  Health,
  JobState,
  Modality,
  Project,
  RuntimeSettings,
  Skill,
  SkillDetail,
  TeachingArtifact,
  TutorConversation,
  TutorConversationSummary,
  TutorMode,
  TutorResult,
  VideoAsset,
} from "../../../../packages/contracts/src/index.js";
import { splitLearningCheck, studentVisibleAnswer } from "../../../../packages/contracts/src/index.js";
import { api, uploadVideo } from "./api.js";
import { formatDate, formatDuration, percent } from "./format.js";
import { Markdown } from "./components/Markdown.js";

type View = "studio" | "overview" | "evidence" | "skills" | "evaluation";

const NAV: Array<{ key: View; number: string; label: string; hint: string }> = [
  { key: "studio", number: "↳", label: "教学会话", hint: "Teacher · Blackboard" },
  { key: "overview", number: "00", label: "项目总览", hint: "Readiness" },
  { key: "evidence", number: "01", label: "课堂证据", hint: "Source · Trace" },
  { key: "skills", number: "02", label: "Skill 工坊", hint: "Distill · Review" },
  { key: "evaluation", number: "03", label: "评估中心", hint: "Dataset · Compare" },
];

const VIEW_COPY: Record<View, { eyebrow: string; title: string; intro: string }> = {
  studio: { eyebrow: "SKYCLASS / TEACHER SESSION", title: "教学会话", intro: "教师调用 Skill 与可视化工具，板书在教学黑板中持续呈现。" },
  overview: { eyebrow: "SKYCLASS DISTILL / PROJECT", title: "从课堂证据，到可复现的教学验证。", intro: "先确认素材与 Skill 是否就绪，再进入固定数据集上的对照实验。" },
  evidence: { eyebrow: "01 / CLASSROOM EVIDENCE", title: "课堂证据", intro: "管理视频、逐字稿和视觉证据，让每个教学结论都能回到真实课堂。" },
  skills: { eyebrow: "02 / SKILL WORKSHOP", title: "Skill 工坊", intro: "蒸馏、检查并调试教学 Skill；只有可追溯版本才进入评估。" },
  evaluation: { eyebrow: "03 / EVALUATION CENTER", title: "评估中心", intro: "用版本化数据集、固定实验条件和运行历史验证 Skill 的真实增益。" },
};

function modeLabel(mode: TutorMode): string {
  return ({ base: "Base", text_skill: "Text Skill", multimodal_skill: "Vision Skill" })[mode];
}

function stageLabel(job: JobState): string {
  if (job.status === "completed") return "完成";
  if (job.status === "failed") return "失败";
  if (job.status === "cancelled") return "已取消";
  return job.stage || "处理中";
}

function App() {
  const [view, setView] = useState<View>("studio");
  const [health, setHealth] = useState<Health | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [datasets, setDatasets] = useState<BenchmarkDataset[]>([]);
  const [experimentRuns, setExperimentRuns] = useState<ExperimentSummary[]>([]);
  const [conversations, setConversations] = useState<TutorConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [conversationDraft, setConversationDraft] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [projectDialog, setProjectDialog] = useState(false);
  const [settingsDialog, setSettingsDialog] = useState(false);
  const [skillDialog, setSkillDialog] = useState<SkillDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const project = useMemo(() => projects.find((item) => item.id === projectId), [projects, projectId]);
  const projectJobs = useMemo(() => jobs.filter((item) => item.project_id === projectId), [jobs, projectId]);
  const activeJobs = projectJobs.filter((item) => item.status === "queued" || item.status === "running");

  const flash = useCallback((message: string, isError = false) => {
    if (isError) setError(message);
    else setNotice(message);
    window.setTimeout(() => isError ? setError("") : setNotice(""), 4800);
  }, []);

  const loadProjects = useCallback(async (preferredId?: string) => {
    const list = await api<Project[]>("/api/projects");
    setProjects(list);
    setProjectId((current) => {
      const desired = preferredId || current;
      return list.some((item) => item.id === desired) ? desired : list[0]?.id ?? "";
    });
  }, []);

  const loadProjectData = useCallback(async () => {
    if (!projectId) {
      setVideos([]);
      setSkills([]);
      setExperimentRuns([]);
      setConversations([]);
      return;
    }
    const [nextVideos, nextSkills, nextRuns, nextConversations] = await Promise.all([
      api<VideoAsset[]>(`/api/projects/${projectId}/videos`),
      api<Skill[]>(`/api/projects/${projectId}/skills`),
      api<ExperimentSummary[]>(`/api/projects/${projectId}/experiments`),
      api<TutorConversationSummary[]>(`/api/projects/${projectId}/conversations`),
    ]);
    setVideos(nextVideos);
    setSkills(nextSkills);
    setExperimentRuns(nextRuns);
    setConversations(nextConversations);
  }, [projectId]);

  const loadJobs = useCallback(async () => setJobs(await api<JobState[]>("/api/jobs")), []);
  const loadDatasets = useCallback(async () => setDatasets(await api<BenchmarkDataset[]>("/api/evaluations/datasets")), []);

  useEffect(() => {
    Promise.all([api<Health>("/api/health"), loadProjects(), loadJobs(), loadDatasets()])
      .then(([nextHealth]) => setHealth(nextHealth))
      .catch((cause) => flash(cause instanceof Error ? cause.message : String(cause), true));
  }, [flash, loadDatasets, loadJobs, loadProjects]);

  useEffect(() => {
    setActiveConversationId("");
    setConversationDraft((value) => value + 1);
  }, [projectId]);

  useEffect(() => {
    loadProjectData().catch((cause) => flash(cause instanceof Error ? cause.message : String(cause), true));
  }, [loadProjectData, flash]);

  useEffect(() => {
    if (!jobs.some((item) => item.status === "queued" || item.status === "running")) return;
    const timer = window.setInterval(() => {
      Promise.all([loadJobs(), loadProjects(projectId), loadProjectData()]).catch(() => undefined);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [jobs, loadJobs, loadProjects, loadProjectData, projectId]);

  async function refreshAll(): Promise<void> {
    await Promise.all([loadProjects(projectId), loadProjectData(), loadJobs(), loadDatasets()]);
  }

  async function openSkill(skill: Skill): Promise<void> {
    if (!skill.job_id) return;
    try {
      setBusy(true);
      setSkillDialog(await api<SkillDetail>(`/api/jobs/${skill.job_id}/skills/${skill.name}`));
    } catch (cause) {
      flash(cause instanceof Error ? cause.message : String(cause), true);
    } finally {
      setBusy(false);
    }
  }

  const content = !project && view !== "overview"
    ? <EmptyProject onCreate={() => setProjectDialog(true)} />
    : view === "studio" ? <Tutor
      key={`${project!.id}:${conversationDraft}`}
      project={project!}
      skills={skills}
      conversationId={activeConversationId}
      conversationDraft={conversationDraft}
      onConversationChange={setActiveConversationId}
      onConversationUpdated={loadProjectData}
      onNewConversation={() => { setActiveConversationId(""); setConversationDraft((value) => value + 1); }}
    />
    : view === "overview" ? <Overview project={project} videos={videos} skills={skills} jobs={projectJobs} datasets={datasets} runs={experimentRuns} onNavigate={setView} onCreate={() => setProjectDialog(true)} />
    : view === "evidence" ? <EvidenceWorkspace project={project!} videos={videos} onCreated={async (job) => { setJobs((items) => [job, ...items]); flash("素材任务已开始"); }} flash={flash} />
    : view === "skills" ? <SkillWorkshop project={project!} videos={videos} skills={skills} onCreated={async (job) => { setJobs((items) => [job, ...items]); flash("蒸馏任务已开始"); }} onOpen={openSkill} onRefresh={refreshAll} flash={flash} />
    : <EvaluationCenter project={project!} datasets={datasets} runs={experimentRuns} onRun={loadProjectData} />;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand-mark"><span>S</span></div>
        <div><strong>空中课堂蒸馏</strong><small>SKYCLASS DISTILL</small></div>
      </div>

      <div className="project-switcher">
        <label>当前研究项目</label>
        <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          {!projects.length && <option value="">尚无项目</option>}
          {projects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
        <button className="new-project" onClick={() => setProjectDialog(true)}>＋ 新建研究项目</button>
      </div>

      <nav>{NAV.map((item) => <button key={item.key} className={view === item.key ? "active" : ""} onClick={() => setView(item.key)}>
        <span className="nav-number">{item.number}</span><span><b>{item.label}</b><small>{item.hint}</small></span>
      </button>)}</nav>

      {view === "studio" && project && <ConversationHistory
        projectId={project.id}
        conversations={conversations}
        activeId={activeConversationId}
        onOpen={setActiveConversationId}
        onNew={() => { setActiveConversationId(""); setConversationDraft((value) => value + 1); }}
        onChanged={loadProjectData}
        flash={flash}
      />}

      <div className="sidebar-foot">
        <button onClick={() => setSettingsDialog(true)}>模型与运行设置</button>
        <div className={`runtime-line ${health?.ts_runtime && health?.pi_agent ? "ready" : ""}`}>
          <i />
          <span>{health?.ts_runtime
            ? health.media_ready
              ? `全 TS Runtime · ${health.model || "Pi Agent"}`
              : "TypeScript Runtime · 媒体 CLI 待配置"
            : "TypeScript 服务未连接"}</span>
        </div>
      </div>
    </aside>

    <main className={`main-stage ${view === "studio" ? "studio-stage" : ""}`}>
      <header className="topbar">
        <div><span className="context-dot" />{project ? `${project.subject} · ${project.grade}` : "SKYCLASS DISTILL RESEARCH SYSTEM"}</div>
        <div className="top-actions">
          {activeJobs.length > 0 && <span className="running-badge">{activeJobs.length} 个任务运行中</span>}
          <button onClick={() => refreshAll().catch((cause) => flash(String(cause), true))}>刷新</button>
        </div>
      </header>

      {view !== "studio" && <section className="page-head">
        <p className="eyebrow">{VIEW_COPY[view].eyebrow}</p>
        <div><h1>{VIEW_COPY[view].title}</h1><p>{VIEW_COPY[view].intro}</p></div>
      </section>}

      <section className={`content ${view === "studio" ? "studio-content" : ""}`}>{content}</section>
    </main>

    {notice && <div className="toast success">{notice}</div>}
    {error && <div className="toast error">{error}</div>}
    {projectDialog && <ProjectDialog onClose={() => setProjectDialog(false)} onCreated={async (created) => { setProjectDialog(false); await loadProjects(created.id); setView("evidence"); flash("项目已创建"); }} />}
    {settingsDialog && <SettingsDialog onClose={() => setSettingsDialog(false)} onSaved={async () => { setHealth(await api<Health>("/api/health")); flash("设置已保存"); }} />}
    {skillDialog && <SkillDialog detail={skillDialog} onClose={() => setSkillDialog(null)} />}
    {busy && <div className="global-busy"><span /></div>}
  </div>;
}

function ConversationHistory({ projectId, conversations, activeId, onOpen, onNew, onChanged, flash }: {
  projectId: string;
  conversations: TutorConversationSummary[];
  activeId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onChanged: () => Promise<void>;
  flash: (message: string, error?: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = conversations.filter((item) => `${item.title} ${item.last_question || ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  async function renameConversation(item: TutorConversationSummary): Promise<void> {
    const title = window.prompt("输入新的会话名称", item.title)?.trim();
    if (!title || title === item.title) return;
    try {
      await api(`/api/projects/${projectId}/conversations/${item.id}`, { method: "PATCH", body: JSON.stringify({ title }) });
      await onChanged();
      flash("会话已重命名");
    } catch (cause) { flash(cause instanceof Error ? cause.message : String(cause), true); }
  }

  async function deleteConversation(item: TutorConversationSummary): Promise<void> {
    if (!window.confirm(`确认删除「${item.title}」？该会话中的回答和黑板板书也会被删除。`)) return;
    try {
      await api(`/api/projects/${projectId}/conversations/${item.id}`, { method: "DELETE" });
      if (activeId === item.id) onNew();
      await onChanged();
      flash("会话已删除");
    } catch (cause) { flash(cause instanceof Error ? cause.message : String(cause), true); }
  }

  return <section className="sidebar-conversations">
    <div className="conversation-sidebar-head"><label>历史会话</label><button onClick={onNew}>＋</button></div>
    {conversations.length > 0 && <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索会话…" aria-label="搜索历史会话" />}
    <div className="sidebar-conversation-list">
      {!activeId && <button className="conversation-draft active" onClick={onNew}><span>✦</span><b>新教学会话</b></button>}
      {filtered.map((item) => <article key={item.id} className={activeId === item.id ? "active" : ""}>
        <button className="conversation-open" onClick={() => onOpen(item.id)}>
          <b>{item.title}</b>
          <small>{item.turn_count} 轮 · {item.artifact_count} 次板书 · {formatDate(item.updated_at)}</small>
        </button>
        <div className="conversation-actions">
          <button title="重命名" aria-label={`重命名 ${item.title}`} onClick={() => void renameConversation(item)}>✎</button>
          <button title="删除" aria-label={`删除 ${item.title}`} onClick={() => void deleteConversation(item)}>×</button>
        </div>
      </article>)}
      {conversations.length > 0 && filtered.length === 0 && <small className="conversation-empty">没有匹配的会话</small>}
      {conversations.length === 0 && <small className="conversation-empty">第一次提问后，会话会自动保存在这里。</small>}
    </div>
  </section>;
}

function Overview({ project, videos, skills, jobs, datasets, runs, onNavigate, onCreate }: {
  project?: Project;
  videos: VideoAsset[];
  skills: Skill[];
  jobs: JobState[];
  datasets: BenchmarkDataset[];
  runs: ExperimentSummary[];
  onNavigate: (view: View) => void;
  onCreate: () => void;
}) {
  if (!project) return <div className="first-run">
    <p className="eyebrow">START HERE</p><h2>建立第一个课堂能力项目</h2>
    <p>项目会把课堂证据、Skill 版本、评估数据集与实验记录绑定在同一条溯源链上。</p>
    <button className="primary" onClick={onCreate}>创建项目</button>
  </div>;
  const latest = jobs.slice(0, 4);
  const readyEvidence = videos.filter((video) => video.status === "ready" && video.artifacts?.transcript_txt).length;
  const scenarioCount = datasets.reduce((sum, dataset) => sum + dataset.scenario_count, 0);
  return <>
    <div className="metric-grid">
      <Metric value={readyEvidence} label="证据已就绪" note={`${videos.length} 段课堂素材`} />
      <Metric value={skills.length} label="可用 Skills" note="待进入版本审核" />
      <Metric value={scenarioCount} label="评估案例" note={`${datasets.length} 个数据集`} />
      <Metric value={runs.length} label="实验记录" note="可用于回归比较" accent />
    </div>
    <div className="overview-grid">
      <section className="paper-panel pipeline-panel">
        <div className="panel-title"><div><p className="eyebrow">VALIDATION PIPELINE</p><h2>从证据到验证的三段主线</h2></div></div>
        <div className="pipeline-flow">
          {[{ n: "01", title: "Evidence", text: "素材与证据就绪", view: "evidence" }, { n: "02", title: "Skill", text: "蒸馏、审核与调试", view: "skills" }, { n: "03", title: "Evaluate", text: "数据集与对照实验", view: "evaluation" }].map((step) => <button key={step.n} onClick={() => onNavigate(step.view as View)}>
            <span>{step.n}</span><b>{step.title}</b><small>{step.text}</small>
          </button>)}
        </div>
      </section>
      <section className="paper-panel jobs-panel">
        <div className="panel-title"><div><p className="eyebrow">RECENT RUNS</p><h2>最近任务</h2></div></div>
        {latest.length ? latest.map((job) => <JobRow key={job.id} job={job} />) : <Blank title="还没有运行记录" text="从导入一段课堂视频开始。" />}
      </section>
    </div>
  </>;
}

function Metric({ value, label, note, accent = false }: { value: number; label: string; note: string; accent?: boolean }) {
  return <div className={`metric ${accent ? "accent" : ""}`}><strong>{String(value).padStart(2, "0")}</strong><div><b>{label}</b><small>{note}</small></div></div>;
}

function WorkspaceTabs<T extends string>({ value, items, onChange }: {
  value: T;
  items: Array<{ key: T; label: string; note?: string }>;
  onChange: (value: T) => void;
}) {
  return <div className="workspace-tabs">{items.map((item) => <button key={item.key} className={value === item.key ? "active" : ""} onClick={() => onChange(item.key)}><b>{item.label}</b>{item.note && <small>{item.note}</small>}</button>)}</div>;
}

function EvidenceWorkspace({ project, videos, onCreated, flash }: {
  project: Project;
  videos: VideoAsset[];
  onCreated: (job: JobState) => void;
  flash: (message: string, error?: boolean) => void;
}) {
  const ready = videos.filter((video) => video.status === "ready").length;
  const transcripts = videos.filter((video) => Boolean(video.artifacts?.transcript_txt)).length;
  const local = videos.filter((video) => video.source_url.startsWith("local://")).length;
  return <div className="workspace-stack">
    <section className="readiness-strip">
      <div><span>01</span><b>课堂素材</b><strong>{ready}/{videos.length}</strong><small>已完成媒体处理</small></div>
      <div><span>02</span><b>逐字稿</b><strong>{transcripts}/{videos.length}</strong><small>具备时间戳证据</small></div>
      <div><span>03</span><b>来源构成</b><strong>{local} 本地</strong><small>{videos.length - local} 条公开来源</small></div>
      <div className={ready && transcripts === videos.length ? "ready" : "pending"}><span>状态</span><b>证据就绪度</b><strong>{ready && transcripts === videos.length ? "可蒸馏" : "待处理"}</strong><small>关键帧将在多模态蒸馏时冻结</small></div>
    </section>
    <Sources project={project} videos={videos} onCreated={onCreated} flash={flash} />
  </div>;
}

type SkillTab = "distill" | "library" | "debug";

function SkillWorkshop({ project, videos, skills, onCreated, onOpen, onRefresh, flash }: {
  project: Project;
  videos: VideoAsset[];
  skills: Skill[];
  onCreated: (job: JobState) => void;
  onOpen: (skill: Skill) => void;
  onRefresh: () => Promise<void>;
  flash: (message: string, error?: boolean) => void;
}) {
  const [tab, setTab] = useState<SkillTab>(skills.length ? "library" : "distill");
  return <div className="workspace-stack">
    <WorkspaceTabs value={tab} onChange={setTab} items={[
      { key: "distill", label: "蒸馏任务", note: "选择课堂与模态" },
      { key: "library", label: `Skills (${skills.length})`, note: "检查产物与证据" },
      { key: "debug", label: "调试运行", note: "单题查看执行 trace" },
    ]} />
    {tab === "distill"
      ? <Distill project={project} videos={videos} onCreated={(job) => { onCreated(job); setTab("library"); }} flash={flash} />
      : tab === "library"
        ? <Skills project={project} skills={skills} onOpen={onOpen} onRefresh={onRefresh} flash={flash} />
        : <Tutor project={project} skills={skills} />}
  </div>;
}

type EvaluationTab = "datasets" | "quick" | "history" | "review";

function EvaluationCenter({ project, datasets, runs, onRun }: {
  project: Project;
  datasets: BenchmarkDataset[];
  runs: ExperimentSummary[];
  onRun: () => Promise<void>;
}) {
  const [tab, setTab] = useState<EvaluationTab>("datasets");
  const [datasetId, setDatasetId] = useState("");
  const [unit, setUnit] = useState("all");
  const [scenario, setScenario] = useState<BenchmarkScenario | undefined>();
  const dataset = datasets.find((item) => item.benchmark_id === datasetId) ?? datasets[0];
  const units = Array.from(new Set(dataset?.scenarios.map((item) => item.unit) ?? []));
  const scenarios = dataset?.scenarios.filter((item) => unit === "all" || item.unit === unit) ?? [];

  useEffect(() => {
    if (!datasetId && datasets[0]) setDatasetId(datasets[0].benchmark_id);
  }, [datasetId, datasets]);

  function useScenario(item: BenchmarkScenario): void {
    setScenario(item);
    setTab("quick");
  }

  return <div className="workspace-stack">
    <WorkspaceTabs value={tab} onChange={setTab} items={[
      { key: "datasets", label: "数据集", note: `${datasets.reduce((sum, item) => sum + item.scenario_count, 0)} 个案例` },
      { key: "quick", label: "快速实验", note: "Base / Text / Vision" },
      { key: "history", label: "运行记录", note: `${runs.length} 次实验` },
      { key: "review", label: "评审与报告", note: "验证闭环" },
    ]} />

    {tab === "datasets" && <section className="paper-panel dataset-panel">
      <div className="dataset-head"><div><p className="eyebrow">VERSIONED BENCHMARK</p><h2>{dataset?.benchmark_id || "尚无评估数据集"}</h2><p>固定案例是可复现实验的起点。选择案例后进入快速实验，不会修改数据集。</p></div>{datasets.length > 1 && <select value={dataset?.benchmark_id} onChange={(event) => setDatasetId(event.target.value)}>{datasets.map((item) => <option key={item.benchmark_id} value={item.benchmark_id}>{item.benchmark_id}</option>)}</select>}</div>
      {dataset && <>
        <div className="dataset-metrics"><span><b>v{dataset.version}</b>数据集版本</span><span><b>{dataset.scenario_count}</b>案例总数</span><span><b>{units.length}</b>知识单元</span><span><b>{dataset.scenarios.filter((item) => item.visual_required).length}</b>视觉必需</span></div>
        <div className="dataset-toolbar"><div className="segmented compact"><button className={unit === "all" ? "active" : ""} onClick={() => setUnit("all")}>全部</button>{units.map((item) => <button key={item} className={unit === item ? "active" : ""} onClick={() => setUnit(item)}>{item}</button>)}</div><small>{scenarios.length} cases</small></div>
        <div className="scenario-grid">{scenarios.map((item) => <article key={item.id}><div><span className="scenario-id">{item.id}</span><span className={`difficulty ${item.difficulty}`}>{item.difficulty}</span>{item.visual_required && <span className="visual-required">视觉</span>}</div><h3>{item.question}</h3><p>{item.unit} · {item.error_type}</p><button onClick={() => useScenario(item)}>用于快速实验 →</button></article>)}</div>
      </>}
    </section>}

    {tab === "quick" && <Experiments project={project} datasetId={dataset?.benchmark_id} scenario={scenario} onRun={onRun} />}

    {tab === "history" && <section className="paper-panel history-panel"><div className="panel-title"><div><p className="eyebrow">IMMUTABLE RUNS</p><h2>实验运行记录</h2></div><span>{runs.length} runs</span></div>{runs.length ? <div className="history-list">{runs.map((run) => <article key={run.id}><span className={`run-status ${run.status}`} /> <div><b>{run.benchmark_id || "单题快速实验"}</b><p>{run.question || `${run.scenario_count} 个评估案例`}</p><small>{formatDate(run.created_at)} · {run.modes.map(modeLabel).join(" / ") || "历史三条件实验"}</small></div><strong>{run.source === "benchmark" ? `${run.scenario_count} cases` : run.status}</strong></article>)}</div> : <Blank title="还没有实验记录" text="从数据集中选择一条案例，运行第一次三条件比较。" />}</section>}

    {tab === "review" && <div className="review-grid">
      <section className="paper-panel review-card active"><span>01</span><p className="eyebrow">AVAILABLE NOW</p><h2>运行审计</h2><p>已记录实际模态、视觉证据数量、工具调用和回退原因，视觉回退不会伪装成有效多模态结果。</p></section>
      <section className="paper-panel review-card"><span>02</span><p className="eyebrow">NEXT / P1</p><h2>单样本 Rubric</h2><p>对正确性、可执行性、学习检查、补救和证据忠实度逐项评分。</p></section>
      <section className="paper-panel review-card"><span>03</span><p className="eyebrow">NEXT / P1</p><h2>盲化成对评审</h2><p>随机隐藏 Base 与 Candidate 身份，记录 A / B / 相当以及评审理由。</p></section>
      <section className="paper-panel review-card"><span>04</span><p className="eyebrow">NEXT / P2</p><h2>验证报告</h2><p>按难度、错误类型和视觉需求输出胜率、回归案例、成本与统计区间。</p></section>
    </div>}
  </div>;
}

function Sources({ project, videos, onCreated, flash }: { project: Project; videos: VideoAsset[]; onCreated: (job: JobState) => void; flash: (message: string, error?: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [limit, setLimit] = useState(1);
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);

  async function importUrl(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      const job = await api<JobState>(`/api/projects/${project.id}/videos`, { method: "POST", body: JSON.stringify({ source_url: url.trim(), limit }) });
      setUrl("");
      onCreated(job);
    } catch (cause) { flash(cause instanceof Error ? cause.message : String(cause), true); }
    finally { setBusy(false); }
  }

  async function importLocal(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!files?.length) return;
    setBusy(true);
    try {
      let uploadId = "";
      for (const file of Array.from(files)) uploadId = (await uploadVideo(file, uploadId)).upload_id;
      const job = await api<JobState>(`/api/projects/${project.id}/videos/local`, { method: "POST", body: JSON.stringify({ upload_id: uploadId }) });
      onCreated(job);
    } catch (cause) { flash(cause instanceof Error ? cause.message : String(cause), true); }
    finally { setBusy(false); }
  }

  return <div className="split-layout">
    <div className="stack">
      <section className="paper-panel form-panel"><p className="eyebrow">PUBLIC SOURCE</p><h2>从公开视频导入</h2>
        <form onSubmit={importUrl} className="form-stack">
          <label>视频或课程地址<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.bilibili.com/video/..." /></label>
          <label>最多处理<select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>{[1, 3, 5, 10].map((value) => <option value={value} key={value}>{value} 个视频</option>)}</select></label>
          <button className="primary" disabled={busy || !url.trim()}>{busy ? "正在创建任务…" : "开始下载与转录"}</button>
        </form>
      </section>
      <section className="paper-panel form-panel"><p className="eyebrow">LOCAL SOURCE</p><h2>上传本地课堂</h2>
        <form onSubmit={importLocal} className="form-stack">
          <label className="drop-field"><input type="file" accept="video/*,audio/*" multiple onChange={(event) => setFiles(event.target.files)} /><span>{files?.length ? `已选择 ${files.length} 个文件` : "选择视频或音频文件"}</span><small>文件只保存在本机项目目录中</small></label>
          <button className="secondary" disabled={busy || !files?.length}>{busy ? "正在上传…" : "上传并转录"}</button>
        </form>
      </section>
    </div>
    <section className="paper-panel library-panel"><div className="panel-title"><div><p className="eyebrow">SOURCE LIBRARY</p><h2>{videos.length} 段课堂素材</h2></div></div>
      <div className="source-list">{videos.length ? videos.map((video, index) => <article key={video.id}>
        <span className="source-index">{String(index + 1).padStart(2, "0")}</span><div><h3>{video.title}</h3><p>{video.source || "local"} · {formatDuration(video.duration)} · {video.status === "ready" ? "已就绪" : "失败"}</p></div><span className={`status-pill ${video.status}`}>{video.status}</span>
      </article>) : <Blank title="素材库为空" text="导入公开视频或上传本地课堂后，任务会在后台完成转录。" />}</div>
    </section>
  </div>;
}

function Distill({ project, videos, onCreated, flash }: { project: Project; videos: VideoAsset[]; onCreated: (job: JobState) => void; flash: (message: string, error?: boolean) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<DistillMode>("single");
  const [modality, setModality] = useState<Modality>("multimodal");
  const [busy, setBusy] = useState(false);
  const required = mode === "common" ? 4 : 1;
  const valid = selected.length >= required && (mode !== "single" || selected.length === 1);

  useEffect(() => {
    if (mode === "single" && selected.length > 1) setSelected(selected.slice(0, 1));
  }, [mode, selected]);

  function toggle(id: string): void {
    setSelected((current) => mode === "single"
      ? current.includes(id) ? [] : [id]
      : current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function start(): Promise<void> {
    if (!valid) return;
    setBusy(true);
    try {
      const job = await api<JobState>(`/api/projects/${project.id}/distill`, {
        method: "POST",
        body: JSON.stringify({ video_ids: selected, mode, modality }),
      });
      onCreated(job);
    } catch (cause) { flash(cause instanceof Error ? cause.message : String(cause), true); }
    finally { setBusy(false); }
  }

  return <div className="distill-layout">
    <section className="paper-panel config-panel">
      <p className="eyebrow">DISTILLATION CONTRACT</p><h2>定义本次蒸馏</h2>
      <div className="choice-group"><label>范围</label><div className="segmented"><button className={mode === "single" ? "active" : ""} onClick={() => setMode("single")}>单课策略</button><button className={mode === "common" ? "active" : ""} onClick={() => setMode("common")}>跨课共性</button></div></div>
      <div className="choice-group"><label>证据</label><div className="segmented"><button className={modality === "text" ? "active" : ""} onClick={() => setModality("text")}>字幕文本</button><button className={modality === "multimodal" ? "active" : ""} onClick={() => setModality("multimodal")}>文本＋视觉</button></div></div>
      <div className="contract-note"><b>产出约束</b><p>Trigger → Teaching Action → Expected Response → Learning Check → Remediation → Evidence</p></div>
      <button className="primary wide" disabled={!valid || busy} onClick={start}>{busy ? "正在创建任务…" : valid ? `蒸馏 ${selected.length} 段课堂` : mode === "common" ? "至少选择 4 段课堂" : "请选择 1 段课堂"}</button>
    </section>
    <section className="paper-panel selection-panel"><div className="panel-title"><div><p className="eyebrow">EVIDENCE SCOPE</p><h2>选择课堂来源</h2></div><span>{selected.length} selected</span></div>
      <div className="video-select-list">{videos.length ? videos.map((video, index) => <button key={video.id} className={selected.includes(video.id) ? "selected" : ""} onClick={() => toggle(video.id)}>
        <span className="check-box">{selected.includes(video.id) ? "✓" : ""}</span><span className="source-index">{String(index + 1).padStart(2, "0")}</span><span><b>{video.title}</b><small>{video.source} · {formatDuration(video.duration)}</small></span>
      </button>) : <Blank title="没有可蒸馏素材" text="先在课堂素材中完成导入和转录。" />}</div>
    </section>
  </div>;
}

function Skills({ project, skills, onOpen, onRefresh, flash }: { project: Project; skills: Skill[]; onOpen: (skill: Skill) => void; onRefresh: () => Promise<void>; flash: (message: string, error?: boolean) => void }) {
  async function remove(skill: Skill): Promise<void> {
    if (!skill.job_id || !window.confirm(`确认从成果库移除「${skill.display_name || skill.name}」？历史任务和原始产物会保留。`)) return;
    try {
      await api(`/api/projects/${project.id}/skills/${skill.job_id}/${skill.name}`, { method: "DELETE" });
      await onRefresh();
      flash("Skill 已从成果库移除");
    } catch (cause) { flash(cause instanceof Error ? cause.message : String(cause), true); }
  }
  return <div className="skill-grid">{skills.length ? skills.map((skill) => <article className="skill-card" key={`${skill.job_id}-${skill.name}`}>
    <div className="skill-card-top"><span className="skill-glyph">↳</span><span className={`status-pill ${skill.valid === false ? "failed" : "ready"}`}>{skill.valid === false ? "needs review" : "validated"}</span></div>
    <p className="eyebrow">{skill.distill_mode === "common" ? "CROSS-LESSON" : "SINGLE-LESSON"} · {skill.distill_modality === "multimodal" ? "VISION" : "TEXT"}</p>
    <h2>{skill.display_name || skill.name}</h2><p>{skill.summary || "可追溯的教学策略 Skill"}</p>
    <div className="skill-meta"><span>{skill.video_ids?.length || 0} 个来源</span><span>{skill.visual_asset_count || 0} 个视觉证据</span></div>
    <div className="card-actions"><button onClick={() => onOpen(skill)}>查看证据</button>{skill.job_id && <a href={`/api/jobs/${skill.job_id}/skills/${skill.name}/download`} download>下载</a>}<button className="danger-link" onClick={() => remove(skill)}>移除</button></div>
  </article>) : <div className="full-empty"><Blank title="Skill 成果库为空" text="完成蒸馏后，每个教学策略都会以可验证版本出现在这里。" /></div>}</div>;
}

function Tutor({ project, skills, conversationId = "", conversationDraft = 0, onConversationChange, onConversationUpdated, onNewConversation }: {
  project: Project;
  skills: Skill[];
  conversationId?: string;
  conversationDraft?: number;
  onConversationChange?: (id: string) => void;
  onConversationUpdated?: () => Promise<void>;
  onNewConversation?: () => void;
}) {
  const [mode, setMode] = useState<TutorMode>("multimodal_skill");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<TutorResult | null>(null);
  const [conversation, setConversation] = useState<TutorConversation | null>(null);
  const [activeArtifactId, setActiveArtifactId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const managed = Boolean(onConversationChange);
  const turns = useMemo(() => conversation?.turns ?? (result ? [{ id: "local", created_at: "", question: result.question, mode: result.mode, result }] : []), [conversation, result]);
  const artifacts = useMemo(() => turns.flatMap((turn) => turn.result.artifacts), [turns]);
  const activeArtifact = useMemo(() => artifacts.find((item) => item.id === activeArtifactId) ?? artifacts.at(-1), [activeArtifactId, artifacts]);

  useEffect(() => {
    if (!managed) return;
    setQuestion("");
    setResult(null);
    setConversation(null);
    setError("");
    setActiveArtifactId("");
    if (!conversationId) {
      setConversation(null);
      setLoading(false);
      return;
    }
    let ignore = false;
    setLoading(true);
    api<TutorConversation>(`/api/projects/${project.id}/conversations/${conversationId}`)
      .then((value) => { if (!ignore) setConversation(value); })
      .catch((cause) => { if (!ignore) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [conversationDraft, conversationId, managed, project.id]);

  useEffect(() => {
    const latest = artifacts.at(-1);
    setActiveArtifactId(latest?.id ?? "");
  }, [artifacts]);

  async function submit(): Promise<void> {
    if (question.trim().length < 4) return;
    setBusy(true); setError("");
    try {
      if (!managed) {
        setResult(await api<TutorResult>("/api/tutor", { method: "POST", body: JSON.stringify({ project_id: project.id, question, mode }) }));
        return;
      }
      let currentId = conversation?.id || conversationId;
      if (!currentId) {
        const created = await api<TutorConversation>(`/api/projects/${project.id}/conversations`, { method: "POST", body: JSON.stringify({}) });
        currentId = created.id;
      }
      const updated = await api<TutorConversation>(`/api/projects/${project.id}/conversations/${currentId}/turns`, {
        method: "POST",
        body: JSON.stringify({ question, mode }),
      });
      setConversation(updated);
      setQuestion("");
      onConversationChange?.(currentId);
      await onConversationUpdated?.();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  function reset(): void {
    if (managed && onNewConversation) {
      onNewConversation();
      return;
    }
    setQuestion("");
    setResult(null);
    setConversation(null);
    setActiveArtifactId("");
    setError("");
  }

  return <div className="teacher-workbench">
    <section className="teacher-thread">
      <header className="thread-head">
        <div><span className="session-orb">T</span><div><b>{conversation?.title || "新教学会话"}</b><small>{project.name} · {project.subject}{conversation ? ` · ${conversation.turns.length} 轮` : ""}</small></div></div>
        <button onClick={reset}>＋ 新会话</button>
      </header>

      <div className="thread-scroll">
        {!turns.length && !busy && !loading && <div className="thread-welcome">
          <span className="teacher-mark">T</span>
          <p className="eyebrow">AGENTIC TEACHER</p>
          <h1>把学生卡住的那一步，交给老师。</h1>
          <p>老师会先诊断问题，再按需读取课堂 Skill、检查视觉证据，并调用板书工具。生成的图示会持续留在左侧教学黑板。</p>
          <div className="starter-grid">
            {["画一张位移与路程的对比图", "用受力图解释斜面问题", "画速度—时间图像并讲斜率"].map((item) => <button key={item} onClick={() => setQuestion(item)}>{item}<span>↗</span></button>)}
          </div>
        </div>}

        {turns.map((turn) => <div className="conversation-turn" key={turn.id}>
          <div className="student-bubble"><span>你</span><p>{turn.question}</p></div>
          {turn.result.tool_trace.length > 0 && <div className="tool-trace">
            <p className="eyebrow">TOOL TRACE</p>
            {turn.result.tool_trace.map((event) => <button key={`${turn.id}-${event.id}`} className={event.artifact_id === activeArtifact?.id ? "active" : ""} disabled={!event.artifact_id} onClick={() => event.artifact_id && setActiveArtifactId(event.artifact_id)}>
              <span className="tool-icon">{event.ok ? "✓" : "!"}</span><span><b>{event.label}</b><small>{event.summary}</small></span>{event.artifact_id && <i>在黑板打开 ↗</i>}
            </button>)}
          </div>}
          <TutorAnswer result={turn.result} workbench />
        </div>)}

        {loading && <div className="agent-running"><span className="pulse" /><div><b>正在恢复会话</b><small>载入历史回答、工具轨迹和黑板板书…</small></div></div>}
        {busy && <div className="agent-running"><span className="pulse" /><div><b>老师正在处理</b><small>诊断问题、选择 Skill，并判断是否需要调用画图工具…</small></div></div>}
        {error && <div className="inline-error">{error}</div>}
      </div>

      <div className="workbench-composer">
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit(); }} placeholder="输入题目、概念，或学生卡住的步骤…" />
        <div className="workbench-composer-foot">
          <div className="mode-picker">{(["base", "text_skill", "multimodal_skill"] as TutorMode[]).map((item) => <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{modeLabel(item)}</button>)}</div>
          <span>{skills.length} Skills</span>
          <button className="send-button" aria-label="发送" disabled={busy || loading || question.trim().length < 4} onClick={submit}>↑</button>
        </div>
      </div>
    </section>

    <aside className="artifact-workspace">
      <header className="artifact-head">
        <div><span className="canvas-icon">板</span><div><b>{activeArtifact?.title || "教学黑板"}</b><small>{activeArtifact ? activeArtifact.summary : "老师的图示与推演会自动写在这里"}</small></div></div>
        <span className="canvas-status"><i /> LIVE BLACKBOARD</span>
      </header>

      <div className="artifact-stage">
        {activeArtifact ? <ArtifactPreview artifact={activeArtifact} /> : <div className="empty-canvas">
          <div className="canvas-grid-preview"><span /><span /><span /><span /></div>
          <p className="eyebrow">BLACKBOARD READY</p>
          <h2>老师会在这里边画边讲。</h2>
          <p>当解释需要视觉结构时，老师会在黑板上生成受力图、坐标图、概念图和步骤流程图。</p>
          <div className="tool-capabilities">{["受力关系", "函数图像", "概念地图", "过程步骤"].map((item) => <span key={item}>◇ {item}</span>)}</div>
        </div>}
      </div>

      <footer className="artifact-dock">
        <div><p className="eyebrow">BLACKBOARD RECORDS</p><b>{artifacts.length} 次板书</b></div>
        <div className="artifact-tabs">{artifacts.map((artifact, index) => <button key={`${artifact.id}-${index}`} className={artifact.id === activeArtifact?.id ? "active" : ""} onClick={() => setActiveArtifactId(artifact.id)}><span>{String(index + 1).padStart(2, "0")}</span>{artifact.title}</button>)}</div>
        {!artifacts.length && <small>发起一个需要画图的教学问题，板书将在本轮会话中持续保留。</small>}
      </footer>
    </aside>
  </div>;
}

function ArtifactPreview({ artifact, compact = false }: { artifact: TeachingArtifact; compact?: boolean }) {
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artifact.svg)}`;
  return <figure className={`artifact-preview ${compact ? "compact" : ""}`}><img src={source} alt={artifact.title} /><figcaption><span>{artifact.kind.replaceAll("_", " ")}</span><b>{artifact.title}</b><small>{artifact.summary}</small></figcaption></figure>;
}

function ComparisonBlackboard({ result }: { result: TutorResult }) {
  const artifact = result.artifacts.at(-1);
  return <section className="comparison-blackboard">
    <div><b>教学黑板</b><small>{result.artifacts.length ? `${result.artifacts.length} 次板书` : "本条件没有板书"}</small></div>
    {artifact ? <ArtifactPreview artifact={artifact} compact /> : <div className="comparison-blackboard-empty"><span>板</span><p>这次回答没有调用板书工具</p></div>}
  </section>;
}

function TutorAnswer({ result, workbench = false }: { result: TutorResult; workbench?: boolean }) {
  const audit = result.execution_audit;
  return <article className={`answer-card paper-panel ${workbench ? "thread-answer" : ""}`}>
    <Markdown>{studentVisibleAnswer(result.answer.answer)}</Markdown>
    <LearningCheck value={result.answer.learning_check.prompts[0]} />
    <div className="audit-row"><span>{audit.requested} → {audit.actual}</span><span>视觉 {audit.actual_visual_count}/{audit.attempted_visual_count}</span><span>工具 {audit.tool_call_count}</span>{audit.fallback_reason && <span className="warn">{audit.fallback_reason}</span>}</div>
  </article>;
}

function LearningCheck({ value, compact = false }: { value?: string; compact?: boolean }) {
  const prompt = value ? splitLearningCheck(value).prompt : "";
  if (!prompt) return null;
  return <div className={compact ? "small-check" : "learning-check"}>{compact ? <b>检查</b> : <span>轮到你了</span>}<Markdown>{prompt}</Markdown></div>;
}

function Experiments({ project, datasetId, scenario, onRun }: {
  project: Project;
  datasetId?: string;
  scenario?: BenchmarkScenario;
  onRun: () => Promise<void>;
}) {
  const [question, setQuestion] = useState(scenario?.question || "");
  const [run, setRun] = useState<ExperimentRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (scenario) {
      setQuestion(scenario.question);
      setRun(null);
    }
  }, [scenario]);

  async function compare(): Promise<void> {
    if (question.trim().length < 4) return;
    setBusy(true); setError("");
    try {
      setRun(await api<ExperimentRun>("/api/experiments/compare", { method: "POST", body: JSON.stringify({ project_id: project.id, question, benchmark_id: datasetId, scenario_id: scenario?.id }) }));
      await onRun();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <div className="experiment-stack">
    <section className="experiment-setup paper-panel"><div><p className="eyebrow">CONTROLLED COMPARISON</p><h2>同题、同模型、同一运行时</h2><p>只改变 Skill 与视觉证据条件。每次结果都会写入不可变运行记录，供后续回归和人工评审。</p>{scenario && <div className="scenario-context"><span>{scenario.id}</span><b>{scenario.unit}</b><small>{scenario.error_type} · {scenario.visual_required ? "视觉必需" : "文本可评"}</small></div>}</div><div className="experiment-input"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="从数据集选择案例，或输入一条临时学生问题……" /><button className="primary" disabled={busy || question.trim().length < 4} onClick={compare}>{busy ? "正在运行 3 个条件…" : "运行并保存实验"}</button></div></section>
    {error && <div className="inline-error">{error}</div>}
    {busy && <div className="compare-loading"><span /><span /><span /></div>}
    {run && !busy && <div className="compare-grid">{run.modes.map((mode) => {
      const result = run.results[mode];
      return <article className="compare-card paper-panel" key={mode}><div className="compare-head"><p className="eyebrow">{modeLabel(mode)}</p>{result && <span>{result.execution_audit.tool_call_count} tool calls</span>}</div>
        {result ? <><ComparisonBlackboard result={result} /><div className="compare-answer"><Markdown>{studentVisibleAnswer(result.answer.answer)}</Markdown><LearningCheck value={result.answer.learning_check.prompts[0]} compact /></div><div className="audit-row"><span>{result.execution_audit.actual}</span><span>{result.execution_audit.actual_visual_count} visuals</span></div></> : <div className="inline-error">{run.errors[mode] || "该条件未返回结果"}</div>}
      </article>;
    })}</div>}
    {!run && !busy && <section className="paper-panel experiment-guide"><p className="eyebrow">EXPERIMENT MATRIX</p><div>{(["base", "text_skill", "multimodal_skill"] as TutorMode[]).map((mode, index) => <article key={mode}><span>0{index + 1}</span><b>{modeLabel(mode)}</b><p>{mode === "base" ? "不读取任何课堂 Skill" : mode === "text_skill" ? "读取结构化教学策略，不提供关键帧" : "读取教学策略并提供可追溯视觉证据"}</p></article>)}</div></section>}
  </div>;
}

function JobRow({ job }: { job: JobState }) {
  return <div className="job-row"><span className={`job-dot ${job.status}`} /><div><b>{job.kind === "ingest" ? "素材处理" : job.kind === "distill" ? "Skill 蒸馏" : job.kind === "qa" ? "教学评测" : "处理任务"}</b><small>{stageLabel(job)} · {formatDate(job.updated_at)}</small></div><span>{job.status === "running" ? percent(job.progress) : job.status}</span></div>;
}

function ProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (project: Project) => void }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("高中物理");
  const [grade, setGrade] = useState("高中");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault(); setBusy(true); setError("");
    try { onCreated(await api<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name, subject, grade, description }) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false); }
  }
  return <Modal title="建立研究项目" eyebrow="NEW PROJECT" onClose={onClose}><form onSubmit={submit} className="form-stack"><label>项目名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：高中物理教学策略" /></label><div className="form-row"><label>学科<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label>学段<input value={grade} onChange={(event) => setGrade(event.target.value)} /></label></div><label>研究说明<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="数据范围、研究问题或课程说明" /></label>{error && <div className="inline-error">{error}</div>}<button className="primary" disabled={busy || !name.trim()}>{busy ? "创建中…" : "创建并进入素材库"}</button></form></Modal>;
}

function SettingsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [settings, setSettings] = useState<RuntimeSettings>({});
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<RuntimeSettings>("/api/settings").then(setSettings).catch((cause) => setMessage(String(cause))); }, []);
  const payload = () => ({ ...settings, llm_api_key: apiKey || undefined });
  async function save(): Promise<void> { setBusy(true); try { setSettings(await api("/api/settings", { method: "PUT", body: JSON.stringify(payload()) })); setApiKey(""); onSaved(); } catch (cause) { setMessage(String(cause)); } finally { setBusy(false); } }
  async function test(): Promise<void> { setBusy(true); setMessage("正在测试模型连接……"); try { const result = await api<{ message?: string }>("/api/settings/test", { method: "POST", body: JSON.stringify(payload()) }); setMessage(result.message || "连接成功"); } catch (cause) { setMessage(String(cause)); } finally { setBusy(false); } }
  return <Modal title="模型与运行设置" eyebrow="LOCAL RUNTIME" onClose={onClose}><div className="form-stack"><label>API Base URL<input value={settings.llm_base_url || ""} onChange={(event) => setSettings({ ...settings, llm_base_url: event.target.value })} placeholder="https://.../v1" /></label><label>API Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.llm_api_key_hint ? `已保存 ${settings.llm_api_key_hint}` : "sk-…"} /></label><label>模型名称<input value={settings.llm_model || ""} onChange={(event) => setSettings({ ...settings, llm_model: event.target.value })} /></label><label>Whisper 模型<select value={settings.whisper_model || "small"} onChange={(event) => setSettings({ ...settings, whisper_model: event.target.value })}>{["tiny", "base", "small", "medium", "large-v3"].map((value) => <option key={value}>{value}</option>)}</select></label>{message && <div className="settings-message">{message}</div>}<div className="dialog-actions"><button className="secondary" disabled={busy} onClick={test}>测试连接</button><button className="primary" disabled={busy} onClick={save}>保存设置</button></div></div></Modal>;
}

function SkillDialog({ detail, onClose }: { detail: SkillDetail; onClose: () => void }) {
  const tabs = Object.entries(detail.documents).filter(([, value]) => value);
  const [tab, setTab] = useState(tabs[0]?.[0] || "skill");
  return <Modal title={detail.display_name} eyebrow={detail.valid ? "VALIDATED SKILL" : "NEEDS REVIEW"} onClose={onClose} wide><div className="document-tabs">{tabs.map(([key]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{({ skill: "Skill", pattern: "策略", evidence: "证据", visual: "视觉", code: "资产" } as Record<string, string>)[key] || key}</button>)}</div><pre className="skill-document">{detail.documents[tab]}</pre>{detail.errors.length > 0 && <div className="inline-error">{detail.errors.join("；")}</div>}</Modal>;
}

function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className={`modal ${wide ? "wide" : ""}`}><button className="modal-close" onClick={onClose}>×</button><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{children}</section></div>;
}

function EmptyProject({ onCreate }: { onCreate: () => void }) { return <div className="first-run"><p className="eyebrow">PROJECT REQUIRED</p><h2>先创建一个研究项目</h2><p>课堂素材、蒸馏任务和实验结果都会绑定到项目。</p><button className="primary" onClick={onCreate}>创建项目</button></div>; }
function Blank({ title, text }: { title: string; text: string }) { return <div className="blank"><span>○</span><b>{title}</b><p>{text}</p></div>; }

export default App;
