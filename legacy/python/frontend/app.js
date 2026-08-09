const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = {projects:[], projectId:"", videos:[], skills:[], selected:new Set(), videoSelected:new Set(), mode:"single", modality:"text", executableAssets:false, sourceMode:"remote", job:null, timer:null, documents:{}, pendingProjectId:"", qaMode:"qa", qaModality:"multimodal", qaHistory:[], qaJobId:"", qaResult:null, qaContextTab:"skills", qaSearch:""};

async function api(path, options={}) {
  const response = await fetch(path, {headers:{"Content-Type":"application/json"}, ...options});
  const data = await response.json().catch(()=>({detail:"服务返回了非 JSON 内容"}));
  if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
  return data;
}
function esc(value="") { const node=document.createElement("div"); node.textContent=String(value); return node.innerHTML; }
function inlineMd(value="") { return esc(value).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/`([^`]+)`/g,"<code>$1</code>"); }
function md(value="") {
  return String(value).split(/\n/).map(line=>{
    if(/^###\s+/.test(line))return `<h4>${inlineMd(line.replace(/^###\s+/,""))}</h4>`;
    if(/^##\s+/.test(line))return `<h3>${inlineMd(line.replace(/^##\s+/,""))}</h3>`;
    if(/^#\s+/.test(line))return `<h2>${inlineMd(line.replace(/^#\s+/,""))}</h2>`;
    if(/^\s*[-*]\s+/.test(line))return `<div class="md-bullet"><i></i><span>${inlineMd(line.replace(/^\s*[-*]\s+/,""))}</span></div>`;
    if(/^\s*\d+[.)]\s+/.test(line))return `<div class="md-step"><b>${esc((line.match(/^\s*(\d+)[.)]/)||[])[1]||"")}</b><span>${inlineMd(line.replace(/^\s*\d+[.)]\s+/,""))}</span></div>`;
    return line.trim()?`<p>${inlineMd(line)}</p>`:'<span class="md-space"></span>';
  }).join("");
}
function duration(seconds) { if(!seconds)return "时长未知"; const m=Math.floor(seconds/60),s=Math.round(seconds%60); return `${m}:${String(s).padStart(2,"0")}`; }
function currentProject(){ return state.projects.find(item=>item.id===state.projectId); }
function notify(message){ $("#importHint").textContent=message; }

const viewMeta={
  projects:["PROJECT WORKSPACE","教学项目池"], videos:["VIDEO ASSET MANAGEMENT","下载与转录"],
  distill:["EVIDENCE-BASED DISTILLATION","Skill 蒸馏"], skills:["GENERATED ARTIFACTS","Skills 成果库"],
  qa:["STUDENT-FACING SKILL AGENT","Skill 老师与 A/B 实验"],
};
function openView(name){
  $$(".view").forEach(el=>el.classList.toggle("active",el.id===`view-${name}`));
  $$(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.view===name));
  $("#viewEyebrow").textContent=viewMeta[name][0]; $("#viewTitle").textContent=viewMeta[name][1];
  document.body.classList.toggle("qa-open",name==="qa");
}
$$('[data-view]').forEach(button=>button.addEventListener("click",()=>openView(button.dataset.view)));

async function health(){
  try{const data=await api("/api/health"),ok=data.runtime.ffmpeg&&data.runtime.yt_dlp;$("#runtimeDot").classList.toggle("ok",ok);$("#runtimeText").textContent=ok?(data.api_configured?"转录与 API 均就绪":"转录就绪 · API 未配置"):"运行依赖未就绪";}catch{$("#runtimeText").textContent="本地服务未连接";}
}

async function loadProjects(preferred=""){
  const previousProjectId=state.projectId;
  state.projects=await api("/api/projects");
  $("#projectTotal").textContent=state.projects.length;
  $("#projectSelect").innerHTML='<option value="">请选择项目</option>'+state.projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
  if(preferred || (state.projectId && state.projects.some(p=>p.id===state.projectId))) state.projectId=preferred||state.projectId;
  else if(state.projects.length===1) state.projectId=state.projects[0].id;
  else state.projectId="";
  if(previousProjectId!==state.projectId)resetQAView();
  $("#projectSelect").value=state.projectId;
  renderProjects(); updateProjectLabels();
  if(state.projectId) await loadWorkspace(); else clearWorkspace();
}
function renderProjects(){
  $("#projectGrid").innerHTML=state.projects.length?state.projects.map((p,index)=>`
    <div class="project-card-wrap"><button class="project-card ${p.id===state.projectId?"selected":""}" data-project-id="${p.id}">
      <div class="project-number">${String(index+1).padStart(2,"0")}</div>
      <div class="project-card-main"><span>${esc(p.grade)} · ${esc(p.subject)}</span><h3>${esc(p.name)}</h3><p>${esc(p.description||"独立管理视频、转写与教学 Skills")}</p></div>
      <div class="project-metrics"><b>${p.video_count||0}<small>视频</small></b><b>${p.skill_count||0}<small>Skills</small></b></div>
      <i>打开项目 →</i>
    </button><button class="project-delete" data-delete-project="${p.id}" title="删除项目">×</button></div>`).join(""):'<div class="empty-state">还没有项目。先创建一个“高中物理”项目。</div>';
}
$("#projectGrid").addEventListener("click",async event=>{const remove=event.target.closest("[data-delete-project]");if(remove){const project=state.projects.find(item=>item.id===remove.dataset.deleteProject);state.pendingProjectId=remove.dataset.deleteProject;$("#deleteProjectName").textContent=project?.name||"未命名项目";$("#deleteProjectMessage").textContent="";$("#deleteProjectDialog").showModal();return;}const card=event.target.closest("[data-project-id]");if(!card)return;if(state.projectId!==card.dataset.projectId)resetQAView();state.projectId=card.dataset.projectId;$("#projectSelect").value=state.projectId;renderProjects();updateProjectLabels();await loadWorkspace();openView("videos");});
async function removePendingProject(permanent){if(!state.pendingProjectId)return;if(permanent&&!confirm("永久删除会清理该项目的全部视频、转录、Skills 和任务记录，且不可恢复。\n\n确定继续吗？"))return;const button=permanent?$("#removeProjectPermanent"):$("#removeProjectSoft");button.disabled=true;$("#deleteProjectMessage").textContent=permanent?"正在统计并删除磁盘文件…":"正在移出项目池…";try{const query=permanent?"?permanent=true":"";const result=await api(`/api/projects/${state.pendingProjectId}${query}`,{method:"DELETE"});if(state.projectId===state.pendingProjectId)state.projectId="";state.pendingProjectId="";$("#deleteProjectDialog").close();await loadProjects();if(permanent){const mb=((result.released_bytes||0)/1024/1024).toFixed(1);alert(`永久删除完成：已清理 ${result.video_count||0} 个视频、${result.job_count||0} 个任务，释放约 ${mb} MB。`);}}catch(error){$("#deleteProjectMessage").textContent=`删除失败：${error.message}`;}finally{button.disabled=false;}}
$("#removeProjectSoft").addEventListener("click",()=>removePendingProject(false));
$("#removeProjectPermanent").addEventListener("click",()=>removePendingProject(true));
$("#projectSelect").addEventListener("change",async event=>{if(state.projectId!==event.target.value)resetQAView();state.projectId=event.target.value;state.selected.clear();state.videoSelected.clear();renderProjects();updateProjectLabels();if(state.projectId)await loadWorkspace();else clearWorkspace();});
function updateProjectLabels(){const project=currentProject();$$('[data-project-name]').forEach(node=>node.textContent=project?.name||"未选择项目");$$('.requires-project input,.requires-project button').forEach(node=>{if(!node.matches('[data-source-mode]'))node.disabled=!project;});}
function clearWorkspace(){state.videos=[];state.skills=[];state.qaHistory=[];state.selected.clear();state.videoSelected.clear();resetQAView();renderVideos();renderDistillVideos();renderSkills();renderQAHistory();updateProjectLabels();}
async function loadWorkspace(){await Promise.all([loadVideos(),loadSkills(),loadQAHistory()]);}

$("#newProjectBtn").addEventListener("click",()=>$("#projectDialog").showModal());
$("#createProject").addEventListener("click",async()=>{
  const button=$("#createProject"); button.disabled=true;
  try{const project=await api("/api/projects",{method:"POST",body:JSON.stringify({name:$("#projectName").value.trim(),subject:$("#projectSubject").value.trim(),grade:$("#projectGrade").value.trim(),description:$("#projectDescription").value.trim()})});$("#projectDialog").close();$("#projectForm").reset();$("#projectSubject").value="高中物理";$("#projectGrade").value="高中";await loadProjects(project.id);openView("videos");}catch(error){alert(`创建失败：${error.message}`);}finally{button.disabled=false;}
});

async function loadVideos(){state.videos=await api(`/api/projects/${state.projectId}/videos`);state.selected=new Set([...state.selected].filter(id=>state.videos.some(v=>v.id===id)));state.videoSelected=new Set([...state.videoSelected].filter(id=>state.videos.some(v=>v.id===id)));renderVideos();renderDistillVideos();}
function renderVideos(){
  $("#videoTotal").textContent=state.videos.length;$("#videoCountPill").textContent=`${state.videos.length} 个视频`;
  $("#videoList").innerHTML=state.videos.length?state.videos.map((video,index)=>`
    <label class="video-row ${state.videoSelected.has(video.id)?"selected":""}"><input class="video-pick" type="checkbox" value="${video.id}" ${state.videoSelected.has(video.id)?"checked":""}><span class="row-check">✓</span><span class="video-index">${String(index+1).padStart(2,"0")}</span><div class="video-title"><strong>${esc(video.title)}</strong><small>${esc(video.source)} · ${duration(video.duration)}</small></div><div class="asset-state"><i></i><span>转写就绪<small>WHISPER READY</small></span></div><span class="video-date">${new Date(video.created_at).toLocaleDateString("zh-CN")}</span></label>`).join(""):'<div class="empty-state">这个项目还没有视频。请从上方导入。</div>';
  const count=state.videoSelected.size;$("#deleteVideos").disabled=!count;$("#deleteVideos").textContent=count?`删除所选 (${count})`:"删除所选";$("#selectAllVideos").disabled=!state.videos.length;$("#selectAllVideos").textContent=state.videos.length&&count===state.videos.length?"取消全选":"全选";
}
$("#videoList").addEventListener("change",event=>{if(!event.target.matches(".video-pick"))return;event.target.checked?state.videoSelected.add(event.target.value):state.videoSelected.delete(event.target.value);renderVideos();});
$("#selectAllVideos").addEventListener("click",()=>{state.videoSelected=state.videoSelected.size===state.videos.length?new Set():new Set(state.videos.map(video=>video.id));renderVideos();});
$("#deleteVideos").addEventListener("click",async()=>{const count=state.videoSelected.size;if(!count||!confirm(`确认从当前项目删除所选 ${count} 个视频？\n\n历史 Skill 和任务记录会保留。`))return;const button=$("#deleteVideos");button.disabled=true;try{await api(`/api/projects/${state.projectId}/videos`,{method:"DELETE",body:JSON.stringify({video_ids:[...state.videoSelected]})});state.videoSelected.clear();await loadProjects(state.projectId);}catch(error){alert(`删除失败：${error.message}`);}finally{button.disabled=false;}});
$$('[data-source-mode]').forEach(button=>button.addEventListener("click",()=>{state.sourceMode=button.dataset.sourceMode;$$('[data-source-mode]').forEach(b=>b.classList.toggle("active",b===button));const local=state.sourceMode==="local";$("#remoteField").hidden=local;$("#localField").hidden=!local;$("#limitField").hidden=local;notify(local?"选择的视频会上传到本机数据目录并使用 Whisper 转录。":"网络内容仅支持公开、无 DRM 且你有权处理的视频。");}));
async function uploadFiles(files){let uploadId="";for(let index=0;index<files.length;index++){notify(`正在上传 ${index+1}/${files.length} · ${files[index].name}`);const query=new URLSearchParams({filename:files[index].name});if(uploadId)query.set("upload_id",uploadId);const response=await fetch(`/api/uploads?${query}`,{method:"POST",headers:{"Content-Type":files[index].type||"application/octet-stream"},body:files[index]});const data=await response.json();if(!response.ok)throw new Error(data.detail||"上传失败");uploadId=data.upload_id;}return uploadId;}
$("#videoImportForm").addEventListener("submit",async event=>{
  event.preventDefault();if(!state.projectId)return alert("请先选择项目");const button=event.submitter;button.disabled=true;
  try{let job;if(state.sourceMode==="local"){const files=[...$("#localFiles").files];if(!files.length)throw new Error("请选择本地视频");const uploadId=await uploadFiles(files);job=await api(`/api/projects/${state.projectId}/videos/local`,{method:"POST",body:JSON.stringify({upload_id:uploadId})});}else{const url=$("#sourceUrl").value.trim();if(!url)throw new Error("请输入视频网址");job=await api(`/api/projects/${state.projectId}/videos`,{method:"POST",body:JSON.stringify({source_url:url,limit:Number($("#videoLimit").value)})});}watchJob(job,"视频下载与转录");notify("任务已创建，可在右下角查看进度。");}catch(error){notify(`导入失败：${error.message}`);}finally{button.disabled=false;}
});

function renderDistillVideos(){
  $("#selectedTotal").textContent=state.selected.size;
  $("#distillVideoList").innerHTML=state.videos.length?state.videos.map(video=>`<label class="select-video ${state.selected.has(video.id)?"selected":""}"><input type="checkbox" value="${video.id}" ${state.selected.has(video.id)?"checked":""}><span class="check">✓</span><div><strong>${esc(video.title)}</strong><small>${esc(video.source)} · ${duration(video.duration)}</small></div><b>${state.modality==="multimodal"?"转写 + 画面":"转写就绪"}</b></label>`).join(""):'<div class="empty-state">项目中还没有已转录视频，请先去视频库导入。</div>';
  updateDistillAction();
}
$("#distillVideoList").addEventListener("change",event=>{if(!event.target.matches('input[type="checkbox"]'))return;const id=event.target.value;if(state.mode==="single"){state.selected.clear();if(event.target.checked)state.selected.add(id);}else{event.target.checked?state.selected.add(id):state.selected.delete(id);}renderDistillVideos();});
$$('input[name="distillMode"]').forEach(input=>input.addEventListener("change",()=>{state.mode=input.value;state.selected.clear();$$('.mode-card').forEach(card=>card.classList.toggle("active",card.contains(input)));renderDistillVideos();}));
$$('input[name="distillModality"]').forEach(input=>input.addEventListener("change",()=>{state.modality=input.value;$$('.modality-card').forEach(card=>card.classList.toggle("active",card.contains(input)));renderDistillVideos();}));
$("#generateExecutableAssets").addEventListener("change",event=>{state.executableAssets=event.target.checked;event.target.closest(".asset-toggle").classList.toggle("active",event.target.checked);updateDistillAction();});
function updateDistillAction(){const count=state.selected.size,valid=state.mode==="single"?count===1:count>=4,modalityHint=state.modality==="multimodal"?"将额外提取关键帧，需当前模型支持图像输入。":"仅使用逐字稿。",assetHint=state.executableAssets?"对适合的能力额外生成参数化 SVG 与可执行渲染器。":"";$("#selectionRule").textContent=state.mode==="single"?`${count}/1 已选择`:`${count}/4 最少选择`;const scopeHint=state.mode==="single"?(valid?"已满足条件，可以提炼单课教学 Skill。":"单视频模式必须选择且只能选择 1 个视频。"):(valid?`已选择 ${count} 个视频，可以开始寻找共性能力。`:`还需选择 ${Math.max(0,4-count)} 个视频才能蒸馏共性 Skills。`);$("#distillHelp").textContent=`${scopeHint} ${modalityHint} ${assetHint}`;$("#startDistill").disabled=!state.projectId||!valid;}
$("#startDistill").addEventListener("click",async()=>{const button=$("#startDistill");button.disabled=true;try{const job=await api(`/api/projects/${state.projectId}/distill`,{method:"POST",body:JSON.stringify({video_ids:[...state.selected],mode:state.mode,modality:state.modality,generate_executable_assets:state.executableAssets})});const scope=state.mode==="single"?"单视频 Skill":"共性 Skills",modality=state.modality==="multimodal"?"多模态":"纯文本",assets=state.executableAssets?" · 可执行资产":"";watchJob(job,`${scope} · ${modality}${assets}蒸馏`);}catch(error){alert(`无法开始蒸馏：${error.message}`);}finally{updateDistillAction();}});

async function loadSkills(){state.skills=await api(`/api/projects/${state.projectId}/skills`);renderSkills();}
function renderSkills(){
  $("#skillTotal").textContent=state.skills.filter(s=>s.valid).length;
  $("#qaSkillTotal").textContent=state.skills.filter(s=>s.valid).length;
  $("#runQA").disabled=!state.projectId||!state.skills.some(skill=>skill.valid);
  $("#skillLibrary").innerHTML=state.skills.length?state.skills.map((skill,index)=>`<article class="skill-card"><div class="skill-glyph">✦</div><span class="skill-mode">${skill.distill_mode==="common"?"共性":"单课"} · ${skill.distill_modality==="multimodal"?"多模态":"文本"}${skill.has_executable_asset?" · CODE":""}</span><h3>${esc(skill.display_name)}</h3><p>${esc(skill.name)}</p><div><span>${skill.video_ids.length} 个来源视频</span><span class="valid">${skill.valid?"✓ 格式通过":"需检查"}</span></div><div class="skill-actions"><button data-open-skill data-job-id="${skill.job_id}" data-skill-name="${skill.name}">查看</button><a href="/api/jobs/${skill.job_id}/skills/${skill.name}/download" download>下载 ZIP</a><button class="danger" data-delete-skill data-job-id="${skill.job_id}" data-skill-name="${skill.name}">删除</button></div></article>`).join(""):'<div class="empty-state">当前项目还没有 Skills。完成一次蒸馏后会显示在这里。</div>';
  renderQAContext();
}
$("#skillLibrary").addEventListener("click",async event=>{const remove=event.target.closest("[data-delete-skill]");if(remove){if(!confirm("确认从成果库删除这个 Skill？\n\n历史任务和磁盘产物会保留。"))return;remove.disabled=true;try{await api(`/api/projects/${state.projectId}/skills/${remove.dataset.jobId}/${remove.dataset.skillName}`,{method:"DELETE"});await loadProjects(state.projectId);}catch(error){alert(`删除失败：${error.message}`);}finally{remove.disabled=false;}return;}const button=event.target.closest("[data-open-skill]");if(!button)return;button.disabled=true;try{const data=await api(`/api/jobs/${button.dataset.jobId}/skills/${button.dataset.skillName}`);state.documents=data.documents||{};$("#skillDialogTitle").textContent=data.display_name;$("#skillDialogMeta").textContent=data.valid?"格式校验通过 · 可直接作为 Codex Skill 使用":`格式问题：${(data.errors||[]).join("；")}`;showDocument("skill");$("#skillDialog").showModal();}catch(error){alert(`读取失败：${error.message}`);}finally{button.disabled=false;}});
function showDocument(name){$("#skillDocument").textContent=state.documents[name]||"该文档为空。";$$('[data-doc]').forEach(button=>button.classList.toggle("active",button.dataset.doc===name));}
$$('[data-doc]').forEach(button=>button.addEventListener("click",()=>showDocument(button.dataset.doc)));

function setQAMode(mode){
  state.qaMode=mode;
  $$("[data-qa-mode]").forEach(button=>button.classList.toggle("active",button.dataset.qaMode===mode));
  const ab=mode==="ab";
  $("#qaProtocol").innerHTML=ab
    ?'<i>A/B</i><span>对比普通回答与 Skill 老师的授课效果</span>'
    :'<i>QA</i><span>Skill 老师正在直接为你授课</span>';
  $("#runQA").title=ab?"运行匿名 A/B":"使用 Skills 回答";
  $("#runQA").setAttribute("aria-label",$("#runQA").title);
  $("#qaQuestion").placeholder=ab?"输入一个学习问题，生成匿名 A/B 对照…":"把不会的概念、题目或实验发给我…";
}
function resetQAView(){state.qaJobId="";state.qaResult=null;renderQAResult(null);}
$$("[data-qa-mode]").forEach(button=>button.addEventListener("click",()=>setQAMode(button.dataset.qaMode)));
$$('input[name="qaModality"]').forEach(input=>input.addEventListener("change",()=>{
  state.qaModality=input.value;
  $$(".qa-modality-pill").forEach(option=>option.classList.toggle("active",option.contains(input)));
}));

function qaSkillChips(skills=[]){
  return skills.length?`<div class="qa-used-skills">${skills.map(skill=>`<span><b>${esc(skill.name)}</b><small>${(skill.modalities||[]).map(value=>esc(value.toUpperCase())).join(" · ")}</small></span>`).join("")}</div>`:'<p class="qa-muted">本次没有可展示的 Skill。</p>';
}
function answerMeta(answer={}){
  const assumptions=(answer.assumptions||[]),checks=(answer.learning_check?.prompts||answer.teacher_checks||[]),assessment=answer.assessment||{},next=answer.next_action||{};
  const feedback=assessment.feedback||"",nextInstruction=next.instruction&&!checks.includes(next.instruction)?next.instruction:"";
  if(!assumptions.length&&!checks.length&&!feedback&&!nextInstruction)return "";
  return `<div class="qa-answer-meta">${assumptions.length?`<div><strong>学习前提</strong>${assumptions.map(item=>`<span>${esc(item)}</span>`).join("")}</div>`:""}${feedback?`<div><strong>对你刚才回答的反馈</strong><span>${esc(feedback)}</span></div>`:""}${checks.length?`<div><strong>马上自检</strong>${checks.map(item=>`<span>${esc(item)}</span>`).join("")}</div>`:""}${nextInstruction?`<div><strong>下一步</strong><span>${esc(nextInstruction)}</span></div>`:""}</div>`;
}
function answerCard(label,answer={},role=""){
  const roleLabel=role==="skills"?"使用 Skills":role==="baseline"?"无 Skill 基线":"";
  return `<article class="qa-answer-card"><header><span>${esc(label)}</span>${roleLabel?`<b class="${role}">${roleLabel}</b>`:""}</header><div class="qa-answer-content">${md(answer.answer||"")}</div>${answerMeta(answer)}</article>`;
}
function qaUserMessage(question){
  return `<article class="qa-user-message"><span>你</span><p>${esc(question||"")}</p></article>`;
}
function qaDeliveryNote(answer={}){
  const delivery=answer.delivery||{};
  const modality=`请求 ${delivery.requested||"text"} → 实际 ${delivery.actual||"text"}`;
  const counts=`实际视觉 ${Number(delivery.actual_visual_count||delivery.visual_count||0)} · 工具调用 ${Number(delivery.tool_call_count||(delivery.tool_calls||[]).length||0)}`;
  if(delivery.engine==="pi-agent"){
    const fallback=delivery.fallback_reason?`；模态回退：${esc(delivery.fallback_reason)}`:"";
    return `<div class="qa-delivery-note agent"><b>Pi Agent</b><span>本轮通过独立临时 AgentSession 完成；${esc(modality)} · ${esc(counts)}${fallback}。</span></div>`;
  }
  if(delivery.agent_fallback_reason){
    return `<div class="qa-delivery-note"><b>直接生成回退</b><span>${esc(modality)} · ${esc(counts)}；Pi Agent 未完成：${esc(delivery.agent_fallback_reason)}</span></div>`;
  }
  if(!delivery.fallback_reason)return `<div class="qa-delivery-note"><b>执行审计</b><span>${esc(modality)} · ${esc(counts)}</span></div>`;
  const local=delivery.actual==="local";
  return `<div class="qa-delivery-note"><b>${local?"本地 Skill 授课":"已安全回退"}</b><span>${esc(modality)} · ${esc(counts)}；${local?"中转接口暂不可用，本轮直接使用所选 Skill 的结构化字段。":"视觉输入失败，本轮结果不会计入有效多模态主结果。"}</span></div>`;
}
function qaExecutionAudit(result={}){
  const audit=result.execution_audit||{};
  if(audit.arms){
    const reveal=result.reveal||{};
    const rows=Object.entries(audit.arms).map(([label,item])=>`<span><b>答案 ${esc(label)}${reveal[label]?` · ${reveal[label]==="skills"?"Skills":"Baseline"}`:""}</b>${esc(item.requested)} → ${esc(item.actual)} · 视觉 ${Number(item.actual_visual_count||0)} · 工具 ${Number(item.tool_call_count||0)} · ${item.include_in_primary_result?"纳入主结果":"排除"}</span>`).join("");
    return `<div class="qa-answer-meta"><div><strong>实验执行审计</strong>${rows}</div><div><strong>主结果资格</strong><span>${audit.include_in_primary_result?"有效":"无效：多模态回退样本不会计入主结果"}</span></div></div>`;
  }
  if(!Object.keys(audit).length)return "";
  return `<div class="qa-answer-meta"><div><strong>实验执行审计</strong><span>${esc(audit.requested)} → ${esc(audit.actual)} · 视觉 ${Number(audit.actual_visual_count||0)} · 工具 ${Number(audit.tool_call_count||0)} · ${audit.include_in_primary_result?"纳入主结果":"排除"}</span></div></div>`;
}
function qaThread(question,content){
  return `<div class="qa-thread">${qaUserMessage(question)}<article class="qa-agent-message"><div class="qa-agent-avatar">✦</div><div class="qa-agent-body">${content}</div></article></div>`;
}
function qaAgentTurn(answer={}){
  return `<article class="qa-agent-message"><div class="qa-agent-avatar">✦</div><div class="qa-agent-body">${answerCard("SKILL 老师",answer,"skills")}</div></article>`;
}
function qaConversationThread(result,latestContent){
  const turns=(result.conversation||[]).slice(0,-1);
  const history=turns.map(turn=>turn.role==="student"?qaUserMessage(turn.content):qaAgentTurn(turn.answer)).join("");
  return `<div class="qa-thread">${history}<article class="qa-agent-message"><div class="qa-agent-avatar">✦</div><div class="qa-agent-body">${latestContent}</div></article></div>`;
}
function qaPendingFollowup(result,studentResponse,content){
  const history=(result.conversation||[]).map(turn=>turn.role==="student"?qaUserMessage(turn.content):qaAgentTurn(turn.answer)).join("");
  return `<div class="qa-thread">${history}${qaUserMessage(studentResponse)}<article class="qa-agent-message"><div class="qa-agent-avatar">✦</div><div class="qa-agent-body">${content}</div></article></div>`;
}
function judgePanel(result){
  const judge=result.judge||{},reveal=result.reveal||{};
  if(!judge.axis_scores)return "";
  const rows=Object.values(judge.axis_scores).map(axis=>`<tr><th>${esc(axis.label)}</th><td>${Number(axis.A||0).toFixed(1)}</td><td>${Number(axis.B||0).toFixed(1)}</td></tr>`).join("");
  const winner=judge.winner==="tie"?"平局":`答案 ${judge.winner}`;
  const winnerRole=judge.winner==="tie"?"":reveal[judge.winner]==="skills"?"（使用 Skills）":"（无 Skill）";
  const human=result.human_vote||{};
  const humanText=human.choice==="skip"?"跳过人工投票":human.choice==="tie"?"人工认为平局":human.choice?`人工选择答案 ${human.choice}${human.preferred_arm==="skills"?"（使用 Skills）":"（无 Skill）"}`:"";
  return `<section class="qa-judge"><div class="qa-judge-head"><div><span class="eyebrow">BLIND JUDGE</span><h3>自动裁判：${winner}${winnerRole}</h3></div><div><b>A ${Number(judge.means?.A||0).toFixed(2)}</b><b>B ${Number(judge.means?.B||0).toFixed(2)}</b></div></div><table><thead><tr><th>评分轴</th><td>答案 A</td><td>答案 B</td></tr></thead><tbody>${rows}</tbody></table><p>${esc(judge.rationale||"")}</p>${humanText?`<span class="human-vote-result">${esc(humanText)}</span>`:""}${(judge.cautions||[]).length?`<div class="qa-cautions"><strong>仍需人工检查</strong>${judge.cautions.map(item=>`<span>${esc(item)}</span>`).join("")}</div>`:""}</section>`;
}
function renderQAResult(result){
  state.qaResult=result||null;
  if(!result){
    $("#qaResult").innerHTML=`<div class="qa-welcome"><span class="qa-welcome-mark">✦</span><h2>把不会的交给我，<br>我来一步步教会你</h2><p>可以发概念、题目、实验或草图，我会讲解并根据你的回答继续追问。</p><div class="qa-starter-grid"><button data-qa-example="我分不清位移和路程，请用图一步步讲给我听，再出一道题检查我。"><span>↗</span><b>位移与路程</b><small>用图讲解，再做一道自检题</small></button><button data-qa-example="请像老师一样给我讲清时间和时刻的区别，先问问我现在怎么理解。"><span>◷</span><b>时间与时刻</b><small>先诊断理解，再逐步讲清概念</small></button><button data-qa-example="我不理解为什么研究运动时有时能把物体看成质点，请用生活例子教会我。"><span>◇</span><b>质点模型</b><small>从生活直觉过渡到物理模型</small></button></div></div>`;
    renderQAContext();
    return;
  }
  state.qaJobId=result.job_id||state.qaJobId;
  if(result.mode==="qa"){
    const body=`<div class="qa-result-head"><div><span class="eyebrow">SKILL-GROUNDED TUTOR</span><h2>Skill 老师回答</h2></div><span>${esc(result.model||"")}</span></div>${qaDeliveryNote(result.answer)}${answerCard("ANSWER",result.answer,"skills")}${qaExecutionAudit(result)}<section class="qa-selection"><span class="eyebrow">TEACHING SKILLS USED</span><h3>本轮内化了 ${result.selected_skills?.length||0} 个 Skill</h3>${qaSkillChips(result.selected_skills)}<p>${esc(result.selection?.reason||"")}</p>${result.selection?.coverage_gap&&result.selection.coverage_gap!=="无"?`<small>覆盖缺口：${esc(result.selection.coverage_gap)}</small>`:""}</section>`;
    $("#qaResult").innerHTML=result.conversation?.length?qaConversationThread(result,body):qaThread(result.question,body);
    const canContinue=(result.answer?.learning_check?.prompts||result.answer?.teacher_checks||[]).length>0||["remediate","clarify","advance"].includes(result.answer?.next_action?.type);
    $("#qaQuestion").placeholder=canContinue?"回答上面的检查题，老师会判断并继续…":"这一轮已完成；点击左侧新对话开始新问题…";
    renderQAContext(result);
    return;
  }
  const reveal=result.revealed?result.reveal||{}:{};
  const body=`<div class="qa-result-head"><div><span class="eyebrow">PAIRED BLIND TEST</span><h2>匿名答案对比</h2></div><span>同模型 · 同问题 · ${esc(result.skill_modality==="multimodal"?"多模态 Skill":"文本 Skill")}</span></div><div class="qa-ab-grid">${answerCard("ANSWER A",result.answers?.A,reveal.A||"")}${answerCard("ANSWER B",result.answers?.B,reveal.B||"")}</div>${result.revealed?`<section class="qa-selection revealed"><span class="eyebrow">REVEALED</span><h3>实验已经揭盲</h3>${qaSkillChips(result.selected_skills)}<p>${esc(result.selection?.reason||"")}</p></section>${qaExecutionAudit(result)}${judgePanel(result)}`:`<section class="qa-vote"><span class="eyebrow">HUMAN BLIND VOTE</span><h3>先选你认为更好的答案</h3><p>自动裁判结果和答案身份会在投票后显示，避免影响你的判断。</p><div><button class="primary" data-ab-vote="A">答案 A 更好</button><button class="primary" data-ab-vote="B">答案 B 更好</button><button class="ghost" data-ab-vote="tie">差不多</button><button class="text-button" data-ab-vote="skip">跳过并揭盲</button></div></section>`}`;
  $("#qaResult").innerHTML=qaThread(result.question,body);
  renderQAContext(result);
}
$("#qaResult").addEventListener("click",async event=>{
  const example=event.target.closest("[data-qa-example]");
  if(example){$("#qaQuestion").value=example.dataset.qaExample;$("#qaQuestion").focus();return;}
  const button=event.target.closest("[data-ab-vote]");if(!button||!state.qaJobId)return;
  $$("[data-ab-vote]").forEach(item=>item.disabled=true);
  try{const result=await api(`/api/jobs/${state.qaJobId}/qa/reveal`,{method:"POST",body:JSON.stringify({choice:button.dataset.abVote})});renderQAResult(result);await loadQAHistory();}catch(error){alert(`揭盲失败：${error.message}`);$$("[data-ab-vote]").forEach(item=>item.disabled=false);}
});
async function loadQAHistory(){
  if(!state.projectId){state.qaHistory=[];renderQAHistory();return;}
  state.qaHistory=await api(`/api/projects/${state.projectId}/qa`);
  renderQAHistory();
}
function renderQAHistory(){
  const query=state.qaSearch.trim().toLowerCase();
  const records=state.qaHistory.filter(item=>!query||String(item.question||"").toLowerCase().includes(query));
  $("#qaHistoryCount").textContent=`${state.qaHistory.length} 次`;
  $("#qaHistory").innerHTML=records.length?records.slice(0,20).map(item=>`<button data-qa-history="${item.id}" class="${item.id===state.qaJobId?"active":""}"><i>${item.mode==="ab"?"A/B":"QA"}</i><div><strong>${esc(item.question||"未命名问题")}</strong><span>${new Date(item.created_at).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false})}</span></div><b class="${esc(item.status)}"></b></button>`).join(""):`<div class="qa-rail-empty">${query?"没有匹配的对话。":"当前项目还没有 QA 记录。"}</div>`;
}
function renderQAFailure(error,question=""){
  state.qaResult=null;
  const content=`<div class="qa-failure"><span>!</span><h3>这轮讲解没有完成</h3><p>${esc(error||"任务已取消")}</p><small>可以直接再次发送；系统会尝试文本或本地 Skill 授课。</small></div>`;
  $("#qaResult").innerHTML=qaThread(question,content);
  renderQAContext();
}
$("#qaHistory").addEventListener("click",event=>{const button=event.target.closest("[data-qa-history]");if(!button)return;const item=state.qaHistory.find(record=>record.id===button.dataset.qaHistory);state.qaJobId=item?.id||"";$("#qaQuestion").value=item?.question||"";if(item?.result)renderQAResult(item.result);else if(item?.error)renderQAFailure(item.error,item.question);renderQAHistory();});
$("#qaHistorySearch").addEventListener("input",event=>{state.qaSearch=event.target.value;renderQAHistory();});
$("#qaNewChat").addEventListener("click",()=>{$("#qaQuestion").value="";resetQAView();renderQAHistory();$("#qaQuestion").focus();});

function renderQAContext(result=state.qaResult){
  let items=(result?.selected_skills||[]).map(skill=>({...skill,selected:true}));
  if(!items.length)items=state.skills.filter(skill=>skill.valid).map(skill=>({
    key:skill.name,
    name:skill.display_name||skill.name,
    summary:"",
    modalities:["text",...(skill.distill_modality==="multimodal"?["visual"]:[]),...(skill.has_executable_asset?["code"]:[])],
    visual_asset_count:skill.distill_modality==="multimodal"?1:0,
    has_code_asset:Boolean(skill.has_executable_asset),
  }));
  const tab=state.qaContextTab;
  const filtered=items.filter(skill=>tab==="skills"||(tab==="visual"&&(skill.modalities||[]).includes("visual"))||(tab==="code"&&(skill.has_code_asset||(skill.modalities||[]).includes("code"))));
  const titles={skills:result?.selected_skills?.length?"本轮授课使用的 Skills":"可用 Skills",visual:"讲解使用的视觉证据",code:"可执行学习图示"};
  $("#qaContextTitle").textContent=titles[tab];
  $$("[data-qa-context]").forEach(button=>button.classList.toggle("active",button.dataset.qaContext===tab));
  const delivery=result?.mode==="qa"?result.answer?.delivery:null;
  const notice=delivery?.engine==="pi-agent"
    ?`<div class="qa-context-notice"><b>Pi Agent 已启用</b><span>Skills 由 Agent 按需调用；当前会话为一次性评测，不读取长期记忆。</span></div>`
    :delivery?.agent_fallback_reason
      ?`<div class="qa-context-notice"><b>Agent 已回退</b><span>${esc(delivery.agent_fallback_reason)}</span></div>`
      :delivery?.fallback_reason?`<div class="qa-context-notice"><b>${delivery.actual==="local"?"本地 Skill 授课":"视觉已回退"}</b><span>${delivery.actual==="local"?"外部接口暂不可用，Agent 正在用右侧 Skills 的讲解步骤直接教你。":"中转 API 中断了图片请求，Agent 已使用同一批 Skill 的文本内容继续讲解。"}</span></div>`:"";
  const cards=filtered.length?filtered.map(skill=>{
    const modalities=(skill.modalities||["text"]).map(value=>`<span>${value==="visual"?"视觉":value==="code"?"代码":"文本"}</span>`).join("");
    const meta=tab==="visual"?`${skill.visual_asset_count||"有"} 个关键帧证据`:tab==="code"?"包含参数化渲染资产":skill.selected?"已用于当前回答":"可被自动检索";
    return `<article class="qa-context-card ${skill.selected?"selected":""}"><div><i>${tab==="code"?"&lt;/&gt;":tab==="visual"?"▧":"✦"}</i><small>${esc(meta)}</small></div><h4>${esc(skill.name||skill.key)}</h4>${skill.summary?`<p>${esc(skill.summary)}</p>`:""}<footer>${modalities}</footer></article>`;
  }).join(""):`<div class="qa-context-empty"><span>${tab==="visual"?"▧":tab==="code"?"&lt;/&gt;":"◇"}</span><p>${tab==="visual"?"当前范围没有视觉证据。":tab==="code"?"当前范围没有可执行图示。":"还没有可用 Skill。"}</p></div>`;
  $("#qaContextBody").innerHTML=notice+cards;
}
$$("[data-qa-context]").forEach(button=>button.addEventListener("click",()=>{state.qaContextTab=button.dataset.qaContext;renderQAContext();}));
$("#runQA").addEventListener("click",async()=>{
  const question=$("#qaQuestion").value.trim(),current=state.qaResult,canContinue=current?.mode==="qa"&&((current.answer?.learning_check?.prompts||current.answer?.teacher_checks||[]).length>0||["remediate","clarify","advance"].includes(current.answer?.next_action?.type));
  if(!question.length||(!canContinue&&question.length<4))return alert(canContinue?"请输入你的回答":"请至少输入 4 个字符的教学问题");
  const button=$("#runQA");button.disabled=true;
  const running='<div class="qa-running"><i></i><strong>Skill 老师正在准备讲解</strong><p>正在选择合适的讲解、图示与检查方法；A/B 模式会更久。</p></div>';
  $("#qaResult").innerHTML=canContinue?qaPendingFollowup(current,question,running):qaThread(question,running);
  try{
    const job=canContinue
      ?await api(`/api/jobs/${state.qaJobId}/qa/respond`,{method:"POST",body:JSON.stringify({student_response:question})})
      :await api(`/api/projects/${state.projectId}/qa`,{method:"POST",body:JSON.stringify({question,mode:state.qaMode,skill_modality:state.qaModality,max_skills:Number($("#qaMaxSkills").value)})});
    $("#qaQuestion").value="";
    state.qaJobId=job.id;watchJob(job,state.qaMode==="ab"?"Skill 老师 · 匿名 A/B":"Skill 老师 · 直接授课");
  }catch(error){renderQAFailure(error.message,question);}finally{button.disabled=!state.skills.some(skill=>skill.valid);}
});
$("#qaQuestion").addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){event.preventDefault();$("#runQA").click();}});

function watchJob(job,title){state.job=job;$("#taskDrawer").hidden=false;$("#taskTitle").textContent=title;renderJob(job);clearInterval(state.timer);state.timer=setInterval(refreshJob,1500);setTimeout(refreshJob,250);}
async function refreshJob(){if(!state.job)return;try{renderJob(await api(`/api/jobs/${state.job.id}`));}catch(error){console.warn(error);}}
function renderJob(job){state.job=job;const terminal=["completed","failed","cancelled"].includes(job.status),last=(job.events||[]).at(-1);$("#jobStatus").textContent=job.status.toUpperCase();$("#jobStatus").className=`job-status ${job.status}`;$("#jobProgress").style.width=`${Math.round((job.progress||0)*100)}%`;$("#taskMessage").textContent=last?.message||"任务已创建";$("#taskError").hidden=!job.error;$("#taskError").innerHTML=job.error?`<strong>未完成原因</strong><span>${esc(job.error)}</span>`:"";$("#taskLog").innerHTML=(job.events||[]).slice().reverse().map(item=>`<div><time>${new Date(item.time).toLocaleTimeString("zh-CN",{hour12:false})}</time><b>${esc(item.level)}</b><span>${esc(item.message)}</span></div>`).join("");$("#cancelJob").hidden=job.status!=="running";if(terminal){clearInterval(state.timer);state.timer=null;if(job.kind==="qa"){if(job.status==="completed")renderQAResult(job.artifacts?.qa);else renderQAFailure(job.error||"任务已取消",job.qa_question||$("#qaQuestion").value);loadQAHistory();openView("qa");}else if(job.status==="completed"){loadProjects(state.projectId);}}}
$("#toggleLog").addEventListener("click",()=>{$("#taskLog").hidden=!$("#taskLog").hidden;$("#toggleLog").textContent=$("#taskLog").hidden?"查看运行日志":"收起运行日志";});
$("#cancelJob").addEventListener("click",async()=>{if(state.job)renderJob(await api(`/api/jobs/${state.job.id}/cancel`,{method:"POST"}));});

const taskDrawer=$("#taskDrawer"),taskHandle=$("#taskDragHandle");
function setTaskMinimized(minimized){taskDrawer.classList.toggle("minimized",minimized);$("#minimizeTask").textContent=minimized?"□":"−";$("#minimizeTask").title=minimized?"展开日志":"收起日志";localStorage.setItem("taskDrawerMinimized",minimized?"1":"0");}
$("#minimizeTask").addEventListener("click",event=>{event.stopPropagation();setTaskMinimized(!taskDrawer.classList.contains("minimized"));});
$("#closeTask").addEventListener("click",event=>{event.stopPropagation();taskDrawer.hidden=true;});
let taskDrag=null;
taskHandle.addEventListener("pointerdown",event=>{if(event.target.closest("button"))return;const rect=taskDrawer.getBoundingClientRect();taskDrag={dx:event.clientX-rect.left,dy:event.clientY-rect.top};taskHandle.setPointerCapture(event.pointerId);});
taskHandle.addEventListener("pointermove",event=>{if(!taskDrag)return;const width=taskDrawer.offsetWidth,height=taskDrawer.offsetHeight;const left=Math.max(8,Math.min(window.innerWidth-width-8,event.clientX-taskDrag.dx));const top=Math.max(8,Math.min(window.innerHeight-height-8,event.clientY-taskDrag.dy));taskDrawer.style.left=`${left}px`;taskDrawer.style.top=`${top}px`;taskDrawer.style.right="auto";taskDrawer.style.bottom="auto";});
taskHandle.addEventListener("pointerup",event=>{if(!taskDrag)return;taskDrag=null;taskHandle.releasePointerCapture(event.pointerId);localStorage.setItem("taskDrawerPosition",JSON.stringify({left:taskDrawer.style.left,top:taskDrawer.style.top}));});
function restoreTaskDrawer(){setTaskMinimized(localStorage.getItem("taskDrawerMinimized")==="1");try{const position=JSON.parse(localStorage.getItem("taskDrawerPosition")||"null");if(position?.left&&position?.top){taskDrawer.style.left=position.left;taskDrawer.style.top=position.top;taskDrawer.style.right="auto";taskDrawer.style.bottom="auto";}}catch{}}

const settingsDialog=$("#settingsDialog");
$("#openSettings").addEventListener("click",async()=>{const settings=await api("/api/settings");$("#baseUrl").value=settings.llm_base_url||"";$("#modelName").value=settings.llm_model||"";$("#whisperModel").value=settings.whisper_model||"small";$("#cookieBrowser").value=settings.video_cookie_browser||"";$("#apiKey").placeholder=settings.llm_api_key_hint?`已保存 ${settings.llm_api_key_hint}，留空则保留`:"sk-…";$("#settingsMessage").textContent="";settingsDialog.showModal();});
function settingsPayload(){return {llm_base_url:$("#baseUrl").value.trim(),llm_api_key:$("#apiKey").value.trim(),llm_model:$("#modelName").value.trim(),whisper_model:$("#whisperModel").value,video_cookie_browser:$("#cookieBrowser").value};}
$("#saveSettings").addEventListener("click",async()=>{try{await api("/api/settings",{method:"PUT",body:JSON.stringify(settingsPayload())});$("#settingsMessage").textContent="设置已安全保存到本机。";$("#apiKey").value="";health();}catch(error){$("#settingsMessage").textContent=`保存失败：${error.message}`;}});
$("#testApi").addEventListener("click",async()=>{const button=$("#testApi");button.disabled=true;$("#settingsMessage").textContent="正在连接…";try{const data=await api("/api/settings/test",{method:"POST",body:JSON.stringify(settingsPayload())});$("#settingsMessage").textContent=data.message||"连接成功";}catch(error){$("#settingsMessage").textContent=`连接失败：${error.message}`;}finally{button.disabled=false;}});

async function boot(){restoreTaskDrawer();health();try{await loadProjects();}catch(error){console.error(error);$("#projectGrid").innerHTML=`<div class="empty-state">加载失败：${esc(error.message)}</div>`;}}
boot();
