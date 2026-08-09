// ts_app/client/main.ts
var state = { projects: [], projectId: "", skills: [], mode: "multimodal_skill", result: null, loading: false, error: "" };
var root = document.querySelector("#app");
function esc(value) {
  const node = document.createElement("span");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}
function api(path, init) {
  return fetch(path, { headers: { "Content-Type": "application/json" }, ...init }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(data.detail ?? `HTTP ${response.status}`));
    return data;
  });
}
function markdown(value) {
  return esc(value).replace(/^### (.+)$/gm, "<strong>$1</strong>").replace(/^## (.+)$/gm, "<strong>$1</strong>").replace(/^[-*] (.+)$/gm, "\u2022 $1").replace(/\n/g, "<br />");
}
function currentProject() {
  return state.projects.find((item) => item.id === state.projectId);
}
function shell(health) {
  const project = currentProject();
  return `<div class="shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">\u2726</span><div><strong>AnyTeacher</strong><small>evidence lab</small></div></div>
      <div><div class="side-label eyebrow">PROJECTS</div><div class="project-list">${state.projects.length ? state.projects.map((item) => `<button class="project-item ${item.id === state.projectId ? "active" : ""}" data-project="${esc(item.id)}"><i class="project-dot"></i><span>${esc(item.name)}</span></button>`).join("") : `<div class="empty">\u8FD8\u6CA1\u6709\u9879\u76EE\u3002\u8BF7\u5148\u5728\u65E7\u5DE5\u4F5C\u53F0\u5BFC\u5165\u89C6\u9891\u5E76\u751F\u6210 Skill\u3002</div>`}</div></div>
      <div class="side-footer"><div class="mono">TS STUDIO \xB7 PI AGENT</div><div>${health?.python_worker ? "Worker \u5DF2\u8FDE\u63A5" : "Worker \u672A\u8FDE\u63A5"} \xB7 <a href="http://127.0.0.1:8000" target="_blank">\u6253\u5F00\u65E7\u5DE5\u4F5C\u53F0 \u2197</a></div></div>
    </aside>
    <main class="main">
      <div class="topbar"><span class="eyebrow">CLASSROOM2TUTOR / STUDIO</span><div id="health" class="status"><i></i><span>\u6B63\u5728\u8FDE\u63A5\u8FD0\u884C\u65F6\u2026</span></div></div>
      <section class="hero"><div><div class="eyebrow">${esc(project?.subject ?? "MULTIMODAL TEACHING")}</div><h1>\u628A\u8BFE\u5802\u8BC1\u636E\uFF0C\u53D8\u6210<br /><em>\u4F1A\u56DE\u5E94\u7684\u89E3\u91CA\u3002</em></h1></div><p class="hero-copy">\u7528\u540C\u4E00\u7EC4\u53EF\u8FFD\u6EAF\u7684\u6559\u5B66 Skills\uFF0C\u8BA9 Pi Agent \u76F4\u63A5\u9762\u5411\u5B66\u751F\u89E3\u91CA\u3001\u68C0\u67E5\u5E76\u51B3\u5B9A\u4E0B\u4E00\u6B65\u3002\u8FD9\u91CC\u662F\u65B0\u7684\u8F7B\u91CF\u5B9E\u9A8C\u53F0\u3002</p></section>
      <section class="workspace">
        <div><div class="composer"><div class="composer-top"><span class="eyebrow">ASK THE TUTOR</span><div class="mode-switch">${modeButton("base", "Base")}${modeButton("text_skill", "Text Skill")}${modeButton("multimodal_skill", "Vision Skill")}</div></div><textarea id="question" placeholder="\u8F93\u5165\u4E00\u4E2A\u6982\u5FF5\u3001\u9898\u76EE\uFF0C\u6216\u4F60\u5361\u4F4F\u7684\u90A3\u4E00\u6B65\u2026"></textarea><div class="composer-bottom"><span class="helper">${project ? `\u5F53\u524D\u9879\u76EE \xB7 ${esc(project.name)}` : "\u5148\u4ECE\u5DE6\u4FA7\u9009\u62E9\u9879\u76EE"}</span><button class="submit" id="submit" ${project ? "" : "disabled"}>\u53D1\u9001\u7ED9 Pi Agent \u2197</button></div></div><div class="response-stack" id="response">${renderResult()}</div></div>
        <aside class="rail"><div class="panel"><div class="eyebrow">ACTIVE SKILLS</div><h3>${state.skills.length ? `${state.skills.length} \u4E2A\u53EF\u7528 Skill` : "\u7B49\u5F85\u9009\u62E9\u9879\u76EE"}</h3><div class="skill-list">${state.skills.length ? state.skills.slice(0, 5).map(renderSkill).join("") : `<div class="empty">\u9009\u62E9\u9879\u76EE\u540E\uFF0C\u8FD9\u91CC\u4F1A\u663E\u793A\u53EF\u7528\u7684\u8BC1\u636E\u6765\u6E90\u3002</div>`}</div></div><div class="panel"><div class="eyebrow">RECENT CHECKS</div><h3>\u6700\u8FD1\u7684\u5B9E\u9A8C</h3><div id="history" class="history"><div class="empty">\u5C1A\u672A\u52A0\u8F7D\u8BB0\u5F55\u3002</div></div></div></aside>
      </section>
    </main>
  </div>`;
}
function modeButton(mode, label) {
  return `<button data-mode="${mode}" class="${state.mode === mode ? "active" : ""}">${label}</button>`;
}
function renderSkill(skill) {
  return `<div class="skill"><strong>${esc(skill.display_name ?? skill.name)}</strong><span>${esc(skill.summary ?? "\u53EF\u8FFD\u6EAF\u6559\u5B66\u7B56\u7565")}</span><span class="mono">${skill.visual_asset_count ? `${skill.visual_asset_count} VISUAL EVIDENCE` : "TEXT EVIDENCE"}</span></div>`;
}
function renderResult() {
  if (state.loading) return `<div class="answer-card"><div class="eyebrow">PI AGENT SESSION</div><h2>\u6B63\u5728\u8BFB\u53D6\u8BC1\u636E\u5E76\u7EC4\u7EC7\u8BB2\u89E3\u2026</h2><p class="empty">\u672C\u8F6E\u4F1A\u8BB0\u5F55\u5B9E\u9645\u6A21\u6001\u3001\u89C6\u89C9\u6570\u91CF\u548C\u5DE5\u5177\u8C03\u7528\uFF0C\u5B8C\u6210\u540E\u624D\u4F1A\u663E\u793A\u7ED3\u679C\u3002</p></div>`;
  if (state.error) return `<div class="error">${esc(state.error)}</div>`;
  if (!state.result) return `<div class="answer-card"><div class="eyebrow">READY WHEN YOU ARE</div><h2>\u4ECE\u4E00\u4E2A\u5177\u4F53\u5361\u70B9\u5F00\u59CB</h2><p class="empty">\u4F8B\u5982\uFF1A\u4E3A\u4EC0\u4E48\u4F4D\u79FB\u6709\u65B9\u5411\uFF1F\u5148\u7528\u56FE\u8BB2\uFF0C\u518D\u51FA\u4E00\u9053\u9898\u68C0\u67E5\u6211\u3002</p></div>`;
  const answer = state.result.answer;
  const audit = state.result.execution_audit;
  const check = answer.learning_check.prompts[0];
  const auditClass = audit.include_in_primary_result === false ? "warn" : "good";
  return `<article class="answer-card"><div class="answer-head"><div><div class="eyebrow">PI AGENT \xB7 ${esc(state.result.mode)}</div><h2>\u7ED9\u5B66\u751F\u7684\u89E3\u91CA</h2></div><span class="mono">${esc(answer.assessment.status === "pending" ? "OPEN LOOP" : answer.assessment.status)}</span></div><div class="answer-body">${markdown(answer.answer)}</div>${check ? `<div class="checks"><b>\u4E0B\u4E00\u6B65\u5B66\u4E60\u68C0\u67E5</b><p>${esc(check)}</p></div>` : ""}${answer.assessment.feedback ? `<div class="checks"><b>\u5BF9\u521A\u624D\u56DE\u7B54\u7684\u53CD\u9988</b><p>${esc(answer.assessment.feedback)}</p></div>` : ""}<div class="audit"><span class="chip ${auditClass}">${esc(audit.requested)} \u2192 ${esc(audit.actual)}</span><span class="chip">\u89C6\u89C9 ${audit.actual_visual_count}/${audit.attempted_visual_count}</span><span class="chip">\u5DE5\u5177\u8C03\u7528 ${audit.tool_call_count}</span>${audit.fallback_reason ? `<span class="chip warn">\u5DF2\u8BB0\u5F55\u56DE\u9000</span>` : ""}</div></article>`;
}
function bind() {
  document.querySelectorAll("[data-project]").forEach((button) => button.addEventListener("click", async () => {
    state.projectId = button.dataset.project ?? "";
    state.result = null;
    await loadWorkspace();
  }));
  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    render();
  }));
  document.querySelector("#submit")?.addEventListener("click", submit);
  document.querySelector("#question")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
  });
}
async function submit() {
  const input = document.querySelector("#question");
  const question = input?.value.trim() ?? "";
  if (!state.projectId || question.length < 4) return;
  state.loading = true;
  state.error = "";
  render();
  try {
    state.result = await api("/api/tutor", { method: "POST", body: JSON.stringify({ project_id: state.projectId, question, mode: state.mode }) });
    if (input) input.value = "";
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.loading = false;
    render();
  }
}
async function loadWorkspace() {
  try {
    state.skills = state.projectId ? await api(`/api/projects/${state.projectId}/skills`) : [];
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  render();
}
async function load() {
  const [health, projects] = await Promise.all([api("/api/health"), api("/api/projects")]);
  state.projects = projects;
  state.projectId = projects[0]?.id ?? "";
  await loadWorkspace();
  const badge = document.querySelector("#health");
  if (badge) {
    badge.classList.toggle("ok", health.ok && health.python_worker && health.pi_agent);
    badge.innerHTML = `<i></i><span>${health.python_worker && health.pi_agent ? `\u8FD0\u884C\u65F6\u5C31\u7EEA \xB7 ${esc(health.model ?? "Pi Agent")}` : "\u90E8\u5206\u8FD0\u884C\u65F6\u672A\u8FDE\u63A5"}</span>`;
  }
}
function render() {
  root.innerHTML = shell();
  bind();
}
render();
void load().catch((error) => {
  state.error = error instanceof Error ? error.message : String(error);
  render();
});
