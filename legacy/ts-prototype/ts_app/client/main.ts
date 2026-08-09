import type { Health, Project, Skill, TutorMode, TutorResult } from "../shared/types.js";

type State = {
  projects: Project[];
  projectId: string;
  skills: Skill[];
  mode: TutorMode;
  result: TutorResult | null;
  loading: boolean;
  error: string;
};

const state: State = { projects: [], projectId: "", skills: [], mode: "multimodal_skill", result: null, loading: false, error: "" };
const root = document.querySelector<HTMLDivElement>("#app")!;

function esc(value: unknown): string {
  const node = document.createElement("span");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}

function api<T>(path: string, init?: RequestInit): Promise<T> {
  return fetch(path, { headers: { "Content-Type": "application/json" }, ...init }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String((data as { detail?: string }).detail ?? `HTTP ${response.status}`));
    return data as T;
  });
}

function markdown(value: string): string {
  return esc(value)
    .replace(/^### (.+)$/gm, "<strong>$1</strong>")
    .replace(/^## (.+)$/gm, "<strong>$1</strong>")
    .replace(/^[-*] (.+)$/gm, "• $1")
    .replace(/\n/g, "<br />");
}

function currentProject(): Project | undefined { return state.projects.find((item) => item.id === state.projectId); }

function shell(health?: Health): string {
  const project = currentProject();
  return `<div class="shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">✦</span><div><strong>AnyTeacher</strong><small>evidence lab</small></div></div>
      <div><div class="side-label eyebrow">PROJECTS</div><div class="project-list">${state.projects.length ? state.projects.map((item) => `<button class="project-item ${item.id === state.projectId ? "active" : ""}" data-project="${esc(item.id)}"><i class="project-dot"></i><span>${esc(item.name)}</span></button>`).join("") : `<div class="empty">还没有项目。请先在旧工作台导入视频并生成 Skill。</div>`}</div></div>
      <div class="side-footer"><div class="mono">TS STUDIO · PI AGENT</div><div>${health?.python_worker ? "Worker 已连接" : "Worker 未连接"} · <a href="http://127.0.0.1:8000" target="_blank">打开旧工作台 ↗</a></div></div>
    </aside>
    <main class="main">
      <div class="topbar"><span class="eyebrow">CLASSROOM2TUTOR / STUDIO</span><div id="health" class="status"><i></i><span>正在连接运行时…</span></div></div>
      <section class="hero"><div><div class="eyebrow">${esc(project?.subject ?? "MULTIMODAL TEACHING")}</div><h1>把课堂证据，变成<br /><em>会回应的解释。</em></h1></div><p class="hero-copy">用同一组可追溯的教学 Skills，让 Pi Agent 直接面向学生解释、检查并决定下一步。这里是新的轻量实验台。</p></section>
      <section class="workspace">
        <div><div class="composer"><div class="composer-top"><span class="eyebrow">ASK THE TUTOR</span><div class="mode-switch">${modeButton("base", "Base")}${modeButton("text_skill", "Text Skill")}${modeButton("multimodal_skill", "Vision Skill")}</div></div><textarea id="question" placeholder="输入一个概念、题目，或你卡住的那一步…"></textarea><div class="composer-bottom"><span class="helper">${project ? `当前项目 · ${esc(project.name)}` : "先从左侧选择项目"}</span><button class="submit" id="submit" ${project ? "" : "disabled"}>发送给 Pi Agent ↗</button></div></div><div class="response-stack" id="response">${renderResult()}</div></div>
        <aside class="rail"><div class="panel"><div class="eyebrow">ACTIVE SKILLS</div><h3>${state.skills.length ? `${state.skills.length} 个可用 Skill` : "等待选择项目"}</h3><div class="skill-list">${state.skills.length ? state.skills.slice(0, 5).map(renderSkill).join("") : `<div class="empty">选择项目后，这里会显示可用的证据来源。</div>`}</div></div><div class="panel"><div class="eyebrow">RECENT CHECKS</div><h3>最近的实验</h3><div id="history" class="history"><div class="empty">尚未加载记录。</div></div></div></aside>
      </section>
    </main>
  </div>`;
}

function modeButton(mode: TutorMode, label: string): string { return `<button data-mode="${mode}" class="${state.mode === mode ? "active" : ""}">${label}</button>`; }

function renderSkill(skill: Skill): string {
  return `<div class="skill"><strong>${esc(skill.display_name ?? skill.name)}</strong><span>${esc(skill.summary ?? "可追溯教学策略")}</span><span class="mono">${skill.visual_asset_count ? `${skill.visual_asset_count} VISUAL EVIDENCE` : "TEXT EVIDENCE"}</span></div>`;
}

function renderResult(): string {
  if (state.loading) return `<div class="answer-card"><div class="eyebrow">PI AGENT SESSION</div><h2>正在读取证据并组织讲解…</h2><p class="empty">本轮会记录实际模态、视觉数量和工具调用，完成后才会显示结果。</p></div>`;
  if (state.error) return `<div class="error">${esc(state.error)}</div>`;
  if (!state.result) return `<div class="answer-card"><div class="eyebrow">READY WHEN YOU ARE</div><h2>从一个具体卡点开始</h2><p class="empty">例如：为什么位移有方向？先用图讲，再出一道题检查我。</p></div>`;
  const answer = state.result.answer;
  const audit = state.result.execution_audit;
  const check = answer.learning_check.prompts[0];
  const auditClass = audit.include_in_primary_result === false ? "warn" : "good";
  return `<article class="answer-card"><div class="answer-head"><div><div class="eyebrow">PI AGENT · ${esc(state.result.mode)}</div><h2>给学生的解释</h2></div><span class="mono">${esc(answer.assessment.status === "pending" ? "OPEN LOOP" : answer.assessment.status)}</span></div><div class="answer-body">${markdown(answer.answer)}</div>${check ? `<div class="checks"><b>下一步学习检查</b><p>${esc(check)}</p></div>` : ""}${answer.assessment.feedback ? `<div class="checks"><b>对刚才回答的反馈</b><p>${esc(answer.assessment.feedback)}</p></div>` : ""}<div class="audit"><span class="chip ${auditClass}">${esc(audit.requested)} → ${esc(audit.actual)}</span><span class="chip">视觉 ${audit.actual_visual_count}/${audit.attempted_visual_count}</span><span class="chip">工具调用 ${audit.tool_call_count}</span>${audit.fallback_reason ? `<span class="chip warn">已记录回退</span>` : ""}</div></article>`;
}

function bind(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-project]").forEach((button) => button.addEventListener("click", async () => {
    state.projectId = button.dataset.project ?? "";
    state.result = null;
    await loadWorkspace();
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    state.mode = button.dataset.mode as TutorMode;
    render();
  }));
  document.querySelector<HTMLButtonElement>("#submit")?.addEventListener("click", submit);
  document.querySelector<HTMLTextAreaElement>("#question")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
  });
}

async function submit(): Promise<void> {
  const input = document.querySelector<HTMLTextAreaElement>("#question");
  const question = input?.value.trim() ?? "";
  if (!state.projectId || question.length < 4) return;
  state.loading = true;
  state.error = "";
  render();
  try {
    state.result = await api<TutorResult>("/api/tutor", { method: "POST", body: JSON.stringify({ project_id: state.projectId, question, mode: state.mode }) });
    if (input) input.value = "";
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.loading = false;
    render();
  }
}

async function loadWorkspace(): Promise<void> {
  try {
    state.skills = state.projectId ? await api<Skill[]>(`/api/projects/${state.projectId}/skills`) : [];
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  render();
}

async function load(): Promise<void> {
  const [health, projects] = await Promise.all([api<Health>("/api/health"), api<Project[]>("/api/projects")]);
  state.projects = projects;
  state.projectId = projects[0]?.id ?? "";
  await loadWorkspace();
  const badge = document.querySelector<HTMLDivElement>("#health");
  if (badge) { badge.classList.toggle("ok", health.ok && health.python_worker && health.pi_agent); badge.innerHTML = `<i></i><span>${health.python_worker && health.pi_agent ? `运行时就绪 · ${esc(health.model ?? "Pi Agent")}` : "部分运行时未连接"}</span>`; }
}

function render(): void { root.innerHTML = shell(); bind(); }

render();
void load().catch((error) => { state.error = error instanceof Error ? error.message : String(error); render(); });
