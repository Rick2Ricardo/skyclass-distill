const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = {projects:[], projectId:"", videos:[], skills:[], selected:new Set(), videoSelected:new Set(), mode:"single", sourceMode:"remote", job:null, timer:null, documents:{}, pendingProjectId:""};

async function api(path, options={}) {
  const response = await fetch(path, {headers:{"Content-Type":"application/json"}, ...options});
  const data = await response.json().catch(()=>({detail:"服务返回了非 JSON 内容"}));
  if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
  return data;
}
function esc(value="") { const node=document.createElement("div"); node.textContent=String(value); return node.innerHTML; }
function duration(seconds) { if(!seconds)return "时长未知"; const m=Math.floor(seconds/60),s=Math.round(seconds%60); return `${m}:${String(s).padStart(2,"0")}`; }
function currentProject(){ return state.projects.find(item=>item.id===state.projectId); }
function notify(message){ $("#importHint").textContent=message; }

const viewMeta={
  projects:["PROJECT WORKSPACE","教学项目池"], videos:["VIDEO ASSET MANAGEMENT","下载与转录"],
  distill:["EVIDENCE-BASED DISTILLATION","Skill 蒸馏"], skills:["GENERATED ARTIFACTS","Skills 成果库"],
};
function openView(name){
  $$(".view").forEach(el=>el.classList.toggle("active",el.id===`view-${name}`));
  $$(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.view===name));
  $("#viewEyebrow").textContent=viewMeta[name][0]; $("#viewTitle").textContent=viewMeta[name][1];
}
$$('[data-view]').forEach(button=>button.addEventListener("click",()=>openView(button.dataset.view)));

async function health(){
  try{const data=await api("/api/health"),ok=data.runtime.ffmpeg&&data.runtime.yt_dlp;$("#runtimeDot").classList.toggle("ok",ok);$("#runtimeText").textContent=ok?(data.api_configured?"转录与 API 均就绪":"转录就绪 · API 未配置"):"运行依赖未就绪";}catch{$("#runtimeText").textContent="本地服务未连接";}
}

async function loadProjects(preferred=""){
  state.projects=await api("/api/projects");
  $("#projectTotal").textContent=state.projects.length;
  $("#projectSelect").innerHTML='<option value="">请选择项目</option>'+state.projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
  if(preferred || (state.projectId && state.projects.some(p=>p.id===state.projectId))) state.projectId=preferred||state.projectId;
  else if(state.projects.length===1) state.projectId=state.projects[0].id;
  else state.projectId="";
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
$("#projectGrid").addEventListener("click",async event=>{const remove=event.target.closest("[data-delete-project]");if(remove){const project=state.projects.find(item=>item.id===remove.dataset.deleteProject);state.pendingProjectId=remove.dataset.deleteProject;$("#deleteProjectName").textContent=project?.name||"未命名项目";$("#deleteProjectMessage").textContent="";$("#deleteProjectDialog").showModal();return;}const card=event.target.closest("[data-project-id]");if(!card)return;state.projectId=card.dataset.projectId;$("#projectSelect").value=state.projectId;renderProjects();updateProjectLabels();await loadWorkspace();openView("videos");});
async function removePendingProject(permanent){if(!state.pendingProjectId)return;if(permanent&&!confirm("永久删除会清理该项目的全部视频、转录、Skills 和任务记录，且不可恢复。\n\n确定继续吗？"))return;const button=permanent?$("#removeProjectPermanent"):$("#removeProjectSoft");button.disabled=true;$("#deleteProjectMessage").textContent=permanent?"正在统计并删除磁盘文件…":"正在移出项目池…";try{const query=permanent?"?permanent=true":"";const result=await api(`/api/projects/${state.pendingProjectId}${query}`,{method:"DELETE"});if(state.projectId===state.pendingProjectId)state.projectId="";state.pendingProjectId="";$("#deleteProjectDialog").close();await loadProjects();if(permanent){const mb=((result.released_bytes||0)/1024/1024).toFixed(1);alert(`永久删除完成：已清理 ${result.video_count||0} 个视频、${result.job_count||0} 个任务，释放约 ${mb} MB。`);}}catch(error){$("#deleteProjectMessage").textContent=`删除失败：${error.message}`;}finally{button.disabled=false;}}
$("#removeProjectSoft").addEventListener("click",()=>removePendingProject(false));
$("#removeProjectPermanent").addEventListener("click",()=>removePendingProject(true));
$("#projectSelect").addEventListener("change",async event=>{state.projectId=event.target.value;state.selected.clear();state.videoSelected.clear();renderProjects();updateProjectLabels();if(state.projectId)await loadWorkspace();else clearWorkspace();});
function updateProjectLabels(){const project=currentProject();$$('[data-project-name]').forEach(node=>node.textContent=project?.name||"未选择项目");$$('.requires-project input,.requires-project button').forEach(node=>{if(!node.matches('[data-source-mode]'))node.disabled=!project;});}
function clearWorkspace(){state.videos=[];state.skills=[];state.selected.clear();state.videoSelected.clear();renderVideos();renderDistillVideos();renderSkills();updateProjectLabels();}
async function loadWorkspace(){await Promise.all([loadVideos(),loadSkills()]);}

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
  $("#distillVideoList").innerHTML=state.videos.length?state.videos.map(video=>`<label class="select-video ${state.selected.has(video.id)?"selected":""}"><input type="checkbox" value="${video.id}" ${state.selected.has(video.id)?"checked":""}><span class="check">✓</span><div><strong>${esc(video.title)}</strong><small>${esc(video.source)} · ${duration(video.duration)}</small></div><b>转写就绪</b></label>`).join(""):'<div class="empty-state">项目中还没有已转录视频，请先去视频库导入。</div>';
  updateDistillAction();
}
$("#distillVideoList").addEventListener("change",event=>{if(!event.target.matches('input[type="checkbox"]'))return;const id=event.target.value;if(state.mode==="single"){state.selected.clear();if(event.target.checked)state.selected.add(id);}else{event.target.checked?state.selected.add(id):state.selected.delete(id);}renderDistillVideos();});
$$('input[name="distillMode"]').forEach(input=>input.addEventListener("change",()=>{state.mode=input.value;state.selected.clear();$$('.mode-card').forEach(card=>card.classList.toggle("active",card.contains(input)));renderDistillVideos();}));
function updateDistillAction(){const count=state.selected.size,valid=state.mode==="single"?count===1:count>=4;$("#selectionRule").textContent=state.mode==="single"?`${count}/1 已选择`:`${count}/4 最少选择`;$("#distillHelp").textContent=state.mode==="single"?(valid?"已满足条件，可以提炼单课教学 Skill。":"单视频模式必须选择且只能选择 1 个视频。"):(valid?`已选择 ${count} 个视频，可以开始寻找共性能力。`:`还需选择 ${Math.max(0,4-count)} 个视频才能蒸馏共性 Skills。`);$("#startDistill").disabled=!state.projectId||!valid;}
$("#startDistill").addEventListener("click",async()=>{const button=$("#startDistill");button.disabled=true;try{const job=await api(`/api/projects/${state.projectId}/distill`,{method:"POST",body:JSON.stringify({video_ids:[...state.selected],mode:state.mode})});watchJob(job,state.mode==="single"?"单视频 Skill 蒸馏":"共性 Skills 蒸馏");}catch(error){alert(`无法开始蒸馏：${error.message}`);}finally{updateDistillAction();}});

async function loadSkills(){state.skills=await api(`/api/projects/${state.projectId}/skills`);renderSkills();}
function renderSkills(){
  $("#skillTotal").textContent=state.skills.filter(s=>s.valid).length;
  $("#skillLibrary").innerHTML=state.skills.length?state.skills.map((skill,index)=>`<article class="skill-card"><div class="skill-glyph">✦</div><span class="skill-mode">${skill.distill_mode==="common"?"共性能力":"单课能力"}</span><h3>${esc(skill.display_name)}</h3><p>${esc(skill.name)}</p><div><span>${skill.video_ids.length} 个来源视频</span><span class="valid">${skill.valid?"✓ 格式通过":"需检查"}</span></div><div class="skill-actions"><button data-open-skill data-job-id="${skill.job_id}" data-skill-name="${skill.name}">查看</button><a href="/api/jobs/${skill.job_id}/skills/${skill.name}/download" download>下载 ZIP</a><button class="danger" data-delete-skill data-job-id="${skill.job_id}" data-skill-name="${skill.name}">删除</button></div></article>`).join(""):'<div class="empty-state">当前项目还没有 Skills。完成一次蒸馏后会显示在这里。</div>';
}
$("#skillLibrary").addEventListener("click",async event=>{const remove=event.target.closest("[data-delete-skill]");if(remove){if(!confirm("确认从成果库删除这个 Skill？\n\n历史任务和磁盘产物会保留。"))return;remove.disabled=true;try{await api(`/api/projects/${state.projectId}/skills/${remove.dataset.jobId}/${remove.dataset.skillName}`,{method:"DELETE"});await loadProjects(state.projectId);}catch(error){alert(`删除失败：${error.message}`);}finally{remove.disabled=false;}return;}const button=event.target.closest("[data-open-skill]");if(!button)return;button.disabled=true;try{const data=await api(`/api/jobs/${button.dataset.jobId}/skills/${button.dataset.skillName}`);state.documents=data.documents||{};$("#skillDialogTitle").textContent=data.display_name;$("#skillDialogMeta").textContent=data.valid?"格式校验通过 · 可直接作为 Codex Skill 使用":`格式问题：${(data.errors||[]).join("；")}`;showDocument("skill");$("#skillDialog").showModal();}catch(error){alert(`读取失败：${error.message}`);}finally{button.disabled=false;}});
function showDocument(name){$("#skillDocument").textContent=state.documents[name]||"该文档为空。";$$('[data-doc]').forEach(button=>button.classList.toggle("active",button.dataset.doc===name));}
$$('[data-doc]').forEach(button=>button.addEventListener("click",()=>showDocument(button.dataset.doc)));

function watchJob(job,title){state.job=job;$("#taskDrawer").hidden=false;$("#taskTitle").textContent=title;renderJob(job);clearInterval(state.timer);state.timer=setInterval(refreshJob,1500);setTimeout(refreshJob,250);}
async function refreshJob(){if(!state.job)return;try{renderJob(await api(`/api/jobs/${state.job.id}`));}catch(error){console.warn(error);}}
function renderJob(job){state.job=job;const terminal=["completed","failed","cancelled"].includes(job.status),last=(job.events||[]).at(-1);$("#jobStatus").textContent=job.status.toUpperCase();$("#jobStatus").className=`job-status ${job.status}`;$("#jobProgress").style.width=`${Math.round((job.progress||0)*100)}%`;$("#taskMessage").textContent=last?.message||"任务已创建";$("#taskError").hidden=!job.error;$("#taskError").innerHTML=job.error?`<strong>未完成原因</strong><span>${esc(job.error)}</span>`:"";$("#taskLog").innerHTML=(job.events||[]).slice().reverse().map(item=>`<div><time>${new Date(item.time).toLocaleTimeString("zh-CN",{hour12:false})}</time><b>${esc(item.level)}</b><span>${esc(item.message)}</span></div>`).join("");$("#cancelJob").hidden=job.status!=="running";if(terminal){clearInterval(state.timer);state.timer=null;if(job.status==="completed"){loadProjects(state.projectId);}}}
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
