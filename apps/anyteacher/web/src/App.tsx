import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  DistillMode,
  ExperimentRun,
  Health,
  JobState,
  Modality,
  Project,
  RuntimeSettings,
  Skill,
  SkillDetail,
  TutorMode,
  TutorResult,
  VideoAsset,
} from "../../../../packages/contracts/src/index.js";
import { api, uploadVideo } from "./api.js";
import { formatDate, formatDuration, percent } from "./format.js";
import { Markdown } from "./components/Markdown.js";

type View = "overview" | "sources" | "distill" | "skills" | "tutor" | "experiments";

const NAV: Array<{ key: View; number: string; label: string; hint: string }> = [
  { key: "overview", number: "00", label: "总览", hint: "Observe → Evaluate" },
  { key: "sources", number: "01", label: "课堂素材", hint: "Observe" },
  { key: "distill", number: "02", label: "Skill 蒸馏", hint: "Ground · Distill" },
  { key: "skills", number: "03", label: "Skills", hint: "Compile" },
  { key: "tutor", number: "04", label: "Tutor Lab", hint: "Teach" },
  { key: "experiments", number: "05", label: "Experiments", hint: "Evaluate" },
];

const VIEW_COPY: Record<View, { eyebrow: string; title: string; intro: string }> = {
  overview: { eyebrow: "ANYTEACHER / CONTROL ROOM", title: "从课堂证据，到可验证的教学能力。", intro: "一个项目贯穿素材、蒸馏、执行与实验，不再切换工作台。" },
  sources: { eyebrow: "01 / OBSERVE", title: "课堂素材", intro: "导入真实课堂，保留视频、字幕与后续证据的统一来源。" },
  distill: { eyebrow: "02 / GROUND · DISTILL", title: "Skill 蒸馏", intro: "选择课程范围和证据模态，把教师示范编译为可执行教学策略。" },
  skills: { eyebrow: "03 / COMPILE", title: "Skill Repository", intro: "检查版本、来源、视觉证据与执行边界。" },
  tutor: { eyebrow: "04 / TEACH", title: "Tutor Lab", intro: "Pi Agent 读取 Skill，直接向学生解释、检查并决定下一步。" },
  experiments: { eyebrow: "05 / EVALUATE", title: "Experiments", intro: "在同一问题和同一运行时下比较 Base、Text Skill 与 Vision Skill。" },
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
  const [view, setView] = useState<View>("overview");
  const [health, setHealth] = useState<Health | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [jobs, setJobs] = useState<JobState[]>([]);
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
      return;
    }
    const [nextVideos, nextSkills] = await Promise.all([
      api<VideoAsset[]>(`/api/projects/${projectId}/videos`),
      api<Skill[]>(`/api/projects/${projectId}/skills`),
    ]);
    setVideos(nextVideos);
    setSkills(nextSkills);
  }, [projectId]);

  const loadJobs = useCallback(async () => setJobs(await api<JobState[]>("/api/jobs")), []);

  useEffect(() => {
    Promise.all([api<Health>("/api/health"), loadProjects(), loadJobs()])
      .then(([nextHealth]) => setHealth(nextHealth))
      .catch((cause) => flash(cause instanceof Error ? cause.message : String(cause), true));
  }, [flash, loadJobs, loadProjects]);

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
    await Promise.all([loadProjects(projectId), loadProjectData(), loadJobs()]);
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
    : view === "overview" ? <Overview project={project} videos={videos} skills={skills} jobs={projectJobs} onNavigate={setView} onCreate={() => setProjectDialog(true)} />
    : view === "sources" ? <Sources project={project!} videos={videos} onCreated={async (job) => { setJobs((items) => [job, ...items]); flash("素材任务已开始"); }} flash={flash} />
    : view === "distill" ? <Distill project={project!} videos={videos} onCreated={async (job) => { setJobs((items) => [job, ...items]); setView("overview"); flash("蒸馏任务已开始"); }} flash={flash} />
    : view === "skills" ? <Skills project={project!} skills={skills} onOpen={openSkill} onRefresh={refreshAll} flash={flash} />
    : view === "tutor" ? <Tutor project={project!} skills={skills} />
    : <Experiments project={project!} />;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand-mark"><span>A</span></div>
        <div><strong>AnyTeacher</strong><small>evidence → skill → learning</small></div>
      </div>

      <div className="project-switcher">
        <label>ACTIVE PROJECT</label>
        <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          {!projects.length && <option value="">尚无项目</option>}
          {projects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
        <button className="new-project" onClick={() => setProjectDialog(true)}>＋ 新建研究项目</button>
      </div>

      <nav>{NAV.map((item) => <button key={item.key} className={view === item.key ? "active" : ""} onClick={() => setView(item.key)}>
        <span className="nav-number">{item.number}</span><span><b>{item.label}</b><small>{item.hint}</small></span>
      </button>)}</nav>

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

    <main className="main-stage">
      <header className="topbar">
        <div><span className="context-dot" />{project ? `${project.subject} · ${project.grade}` : "ANYTEACHER RESEARCH SYSTEM"}</div>
        <div className="top-actions">
          {activeJobs.length > 0 && <span className="running-badge">{activeJobs.length} 个任务运行中</span>}
          <button onClick={() => refreshAll().catch((cause) => flash(String(cause), true))}>刷新</button>
        </div>
      </header>

      <section className="page-head">
        <p className="eyebrow">{VIEW_COPY[view].eyebrow}</p>
        <div><h1>{VIEW_COPY[view].title}</h1><p>{VIEW_COPY[view].intro}</p></div>
      </section>

      <section className="content">{content}</section>
    </main>

    <JobRail jobs={projectJobs} onCancel={async (id) => { await api(`/api/jobs/${id}/cancel`, { method: "POST" }); await loadJobs(); }} />
    {notice && <div className="toast success">{notice}</div>}
    {error && <div className="toast error">{error}</div>}
    {projectDialog && <ProjectDialog onClose={() => setProjectDialog(false)} onCreated={async (created) => { setProjectDialog(false); await loadProjects(created.id); setView("sources"); flash("项目已创建"); }} />}
    {settingsDialog && <SettingsDialog onClose={() => setSettingsDialog(false)} onSaved={async () => { setHealth(await api<Health>("/api/health")); flash("设置已保存"); }} />}
    {skillDialog && <SkillDialog detail={skillDialog} onClose={() => setSkillDialog(null)} />}
    {busy && <div className="global-busy"><span /></div>}
  </div>;
}

function Overview({ project, videos, skills, jobs, onNavigate, onCreate }: {
  project?: Project;
  videos: VideoAsset[];
  skills: Skill[];
  jobs: JobState[];
  onNavigate: (view: View) => void;
  onCreate: () => void;
}) {
  if (!project) return <div className="first-run">
    <p className="eyebrow">START HERE</p><h2>建立第一个课堂能力项目</h2>
    <p>项目会把素材、证据、Skills、Tutor 与实验绑定在同一条溯源链上。</p>
    <button className="primary" onClick={onCreate}>创建项目</button>
  </div>;
  const latest = jobs.slice(0, 4);
  return <>
    <div className="metric-grid">
      <Metric value={videos.length} label="课堂素材" note="可用于证据恢复" />
      <Metric value={skills.length} label="有效 Skills" note="可交给 Tutor 执行" />
      <Metric value={jobs.filter((item) => item.status === "completed").length} label="完成任务" note="保留完整溯源" />
      <Metric value={jobs.filter((item) => item.status === "running").length} label="正在运行" note="后台持续处理" accent />
    </div>
    <div className="overview-grid">
      <section className="paper-panel pipeline-panel">
        <div className="panel-title"><div><p className="eyebrow">UNIFIED PIPELINE</p><h2>一条主线完成能力迁移</h2></div></div>
        <div className="pipeline-flow">
          {[{ n: "01", title: "Observe", text: "课堂素材", view: "sources" }, { n: "02", title: "Distill", text: "证据与策略", view: "distill" }, { n: "03", title: "Compile", text: "版本化 Skills", view: "skills" }, { n: "04", title: "Teach", text: "闭环辅导", view: "tutor" }, { n: "05", title: "Evaluate", text: "基线与消融", view: "experiments" }].map((step) => <button key={step.n} onClick={() => onNavigate(step.view as View)}>
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
  </article>) : <div className="full-empty"><Blank title="Skill Repository 为空" text="完成蒸馏后，每个教学策略都会以可验证版本出现在这里。" /></div>}</div>;
}

function Tutor({ project, skills }: { project: Project; skills: Skill[] }) {
  const [mode, setMode] = useState<TutorMode>("multimodal_skill");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<TutorResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    if (question.trim().length < 4) return;
    setBusy(true); setError("");
    try { setResult(await api<TutorResult>("/api/tutor", { method: "POST", body: JSON.stringify({ project_id: project.id, question, mode }) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <div className="tutor-layout">
    <section className="tutor-main">
      <div className="composer paper-panel"><div className="composer-head"><p className="eyebrow">STUDENT TURN</p><div className="segmented compact">{(["base", "text_skill", "multimodal_skill"] as TutorMode[]).map((item) => <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{modeLabel(item)}</button>)}</div></div>
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit(); }} placeholder="输入一个概念、题目，或者学生卡住的那一步……" />
        <div className="composer-foot"><span>⌘ / Ctrl + Enter 发送</span><button className="primary" disabled={busy || question.trim().length < 4} onClick={submit}>{busy ? "Pi 正在读取策略…" : "开始教学"}</button></div>
      </div>
      {error && <div className="inline-error">{error}</div>}
      {busy && <div className="answer-placeholder paper-panel"><span className="pulse" /><h2>正在诊断学生状态并读取 Skill</h2><p>本轮会记录实际模态、证据数量和工具调用。</p></div>}
      {!busy && result && <TutorAnswer result={result} />}
      {!busy && !result && <div className="answer-placeholder paper-panel"><span className="empty-orbit">A</span><h2>从一个真实卡点开始</h2><p>例如：为什么位移是矢量？先画图解释，再出一道题检查我。</p></div>}
    </section>
    <aside className="evidence-rail"><section className="paper-panel"><p className="eyebrow">AVAILABLE SKILLS</p><h2>{skills.length} 个可执行策略</h2>{skills.slice(0, 6).map((skill) => <div className="mini-skill" key={skill.name}><b>{skill.display_name || skill.name}</b><small>{skill.distill_modality === "multimodal" ? "视觉证据" : "文本证据"} · {skill.video_ids?.length || 0} 来源</small></div>)}</section>
      <section className="paper-panel protocol"><p className="eyebrow">RUNTIME PROTOCOL</p><p>诊断 → 选 Skill → 执行动作 → 学习检查 → 补救或继续</p></section>
    </aside>
  </div>;
}

function TutorAnswer({ result }: { result: TutorResult }) {
  const audit = result.execution_audit;
  return <article className="answer-card paper-panel">
    <div className="answer-title"><div><p className="eyebrow">PI AGENT · {modeLabel(result.mode).toUpperCase()}</p><h2>给学生的解释</h2></div><span className="open-loop">OPEN LOOP</span></div>
    <Markdown>{result.answer.answer}</Markdown>
    {result.answer.learning_check.prompts.length > 0 && <div className="learning-check"><span>LEARNING CHECK</span><p>{result.answer.learning_check.prompts[0]}</p></div>}
    <div className="audit-row"><span>{audit.requested} → {audit.actual}</span><span>视觉 {audit.actual_visual_count}/{audit.attempted_visual_count}</span><span>工具 {audit.tool_call_count}</span>{audit.fallback_reason && <span className="warn">{audit.fallback_reason}</span>}</div>
  </article>;
}

function Experiments({ project }: { project: Project }) {
  const [question, setQuestion] = useState("");
  const [run, setRun] = useState<ExperimentRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function compare(): Promise<void> {
    if (question.trim().length < 4) return;
    setBusy(true); setError("");
    try { setRun(await api<ExperimentRun>("/api/experiments/compare", { method: "POST", body: JSON.stringify({ project_id: project.id, question }) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <div className="experiment-stack">
    <section className="experiment-setup paper-panel"><div><p className="eyebrow">CONTROLLED COMPARISON</p><h2>同题、同模型、同一运行时</h2><p>只改变 Skill 与视觉证据条件，避免不同代码路径造成基线偏差。</p></div><div className="experiment-input"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="输入一条用于比较的学生问题……" /><button className="primary" disabled={busy || question.trim().length < 4} onClick={compare}>{busy ? "正在运行 3 个条件…" : "运行配对实验"}</button></div></section>
    {error && <div className="inline-error">{error}</div>}
    {busy && <div className="compare-loading"><span /><span /><span /></div>}
    {run && !busy && <div className="compare-grid">{run.modes.map((mode) => {
      const result = run.results[mode];
      return <article className="compare-card paper-panel" key={mode}><div className="compare-head"><p className="eyebrow">{modeLabel(mode)}</p>{result && <span>{result.execution_audit.tool_call_count} tool calls</span>}</div>
        {result ? <><Markdown>{result.answer.answer}</Markdown>{result.answer.learning_check.prompts[0] && <div className="small-check"><b>检查</b><p>{result.answer.learning_check.prompts[0]}</p></div>}<div className="audit-row"><span>{result.execution_audit.actual}</span><span>{result.execution_audit.actual_visual_count} visuals</span></div></> : <div className="inline-error">{run.errors[mode] || "该条件未返回结果"}</div>}
      </article>;
    })}</div>}
    {!run && !busy && <section className="paper-panel experiment-guide"><p className="eyebrow">EXPERIMENT MATRIX</p><div>{(["base", "text_skill", "multimodal_skill"] as TutorMode[]).map((mode, index) => <article key={mode}><span>0{index + 1}</span><b>{modeLabel(mode)}</b><p>{mode === "base" ? "不读取任何课堂 Skill" : mode === "text_skill" ? "读取结构化教学策略，不提供关键帧" : "读取教学策略并提供可追溯视觉证据"}</p></article>)}</div></section>}
  </div>;
}

function JobRail({ jobs, onCancel }: { jobs: JobState[]; onCancel: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const active = jobs.filter((item) => item.status === "running" || item.status === "queued");
  return <aside className={`job-rail ${open ? "open" : ""}`}>
    <button className="job-trigger" onClick={() => setOpen(!open)}><span>{active.length || jobs.length}</span><div><b>{active.length ? "后台任务进行中" : "任务记录"}</b><small>{active.length ? active.map((job) => `${percent(job.progress)} ${job.stage}`).join(" · ") : "查看最近处理状态"}</small></div><i>{open ? "×" : "↑"}</i></button>
    {open && <div className="job-drawer"><div className="job-drawer-head"><p className="eyebrow">BACKGROUND RUNS</p><h2>任务与溯源</h2></div>{jobs.length ? jobs.slice(0, 8).map((job) => <div className="job-detail" key={job.id}><JobRow job={job} />{(job.status === "running" || job.status === "queued") && <><div className="progress"><span style={{ width: percent(job.progress) }} /></div><button onClick={() => onCancel(job.id)}>取消任务</button></>}</div>) : <Blank title="没有任务" text="新任务会在这里持续更新。" />}</div>}
  </aside>;
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
