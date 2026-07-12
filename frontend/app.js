const $ = (s) => document.querySelector(s);
const stageOrder = ["discover","download","transcribe","analyze","distill","package"];
let activeJob = null;
let pollTimer = null;
let sourceMode = "remote";

async function api(path, options={}) {
  const response = await fetch(path, {headers:{"Content-Type":"application/json"}, ...options});
  const data = await response.json().catch(()=>({detail:"服务返回了非 JSON 内容"}));
  if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
  return data;
}

function escapeHtml(value="") { const d=document.createElement("div"); d.textContent=String(value); return d.innerHTML; }
function timeLabel(iso) { try { return new Date(iso).toLocaleTimeString("zh-CN",{hour12:false}); } catch { return "--:--:--"; } }

async function checkHealth(){
  try{
    const health=await api("/api/health");
    const ok=health.runtime.ffmpeg && health.runtime.yt_dlp;
    $("#runtimeDot").classList.toggle("ok",ok);
    const bili=health.runtime.bilibili_api?" · B站增强":"";
    $("#runtimeText").textContent=ok ? (health.api_configured?`通用下载就绪${bili} · API 已接入`:`通用下载就绪${bili} · 待接 API`) : "依赖未就绪";
  }catch{$("#runtimeText").textContent="服务未连接";}
}

async function loadSupportedSources(){
  try{
    const data=await api("/api/sources");
    $("#sourceSites").innerHTML=`<b>公开页面适配：</b>${data.sites.map(site=>`<span>${escapeHtml(site.name)}</span>`).join("")}<small>${escapeHtml(data.notice)}</small>`;
  }catch{$("#sourceSites").textContent="通用下载器将自动识别视频来源。";}
}

function renderCourses(items=[], artifacts={}){
  $("#courseCount").textContent=items.length;
  $("#courseList").innerHTML=items.length?items.map((item,i)=>{
    const record=artifacts[item.id]||{};
    const state=record.transcript_txt?"已转写":record.video?"已下载":"待处理";
    const mins=item.duration?`${Math.round(item.duration/60)} 分钟`:"时长待解析";
    const teacher=item.metadata?.teacher||item.metadata?.uploader;
    const source=item.source==="local-upload"?"本地视频":item.source;
    return `<article class="course-item"><span class="index">${String(i+1).padStart(2,"0")}</span><div><strong title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong><small>${escapeHtml((teacher?`${teacher} · `:"")+source)} · ${mins}</small></div><span class="state">${state}</span></article>`;
  }).join(""):'<div class="empty">没有发现课程。</div>';
}

function renderSkills(skills=[]){
  $("#skillCount").textContent=skills.length;
  $("#skillList").innerHTML=skills.length?skills.map(skill=>`<article class="skill-item"><span class="glyph">✦</span><div><strong>${escapeHtml(skill.display_name)}</strong><small>${escapeHtml(skill.name)}</small></div><div class="skill-actions"><span class="valid">${skill.valid?"✓ 格式通过":"需检查"}</span><button type="button" class="skill-open" data-skill-name="${skill.name}">查看内容</button></div></article>`).join(""):'<div class="empty">任务完成后显示蒸馏出的共性能力。</div>';
}

function renderJob(job){
  activeJob=job;
  const statusMap={queued:"排队中",running:"运行中",completed:"已完成",failed:"失败",cancelled:"已取消"};
  $("#jobBadge").textContent=`${statusMap[job.status]||job.status} · ${job.id}`;
  $("#jobBadge").className=`job-badge ${job.status}`;
  const percent=Math.round((job.progress||0)*100);
  $("#progressBar").style.width=`${percent}%`; $("#progressLabel").textContent=`${percent}%`;
  const index=stageOrder.indexOf(job.stage);
  document.querySelectorAll("#stages [data-stage]").forEach(el=>{
    const i=stageOrder.indexOf(el.dataset.stage); el.classList.toggle("active",i===index && job.status==="running"); el.classList.toggle("done",job.status==="completed" || (index>=0&&i<index));
  });
  renderCourses(job.items||[],job.artifacts?.items||{}); renderSkills(job.artifacts?.skills||[]);
  const events=job.events||[];
  $("#eventLog").innerHTML=events.length?events.slice().reverse().map(e=>`<div class="log-row ${e.level}"><time>${timeLabel(e.time)}</time><b>${escapeHtml(e.level.toUpperCase())}</b><span>${escapeHtml(e.message)}</span></div>`).join(""):'<div class="empty">尚无运行记录。</div>';
  $("#cancelBtn").disabled=job.status!=="running";
  $("#retryBtn").disabled=!(["completed","failed","cancelled"].includes(job.status));
  if(["completed","failed","cancelled"].includes(job.status)&&pollTimer){clearInterval(pollTimer);pollTimer=null;}
}

async function refreshJob(){if(!activeJob)return;try{renderJob(await api(`/api/jobs/${activeJob.id}`));}catch(e){console.warn(e);}}

function formatSize(bytes){return bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;}

function localFiles(){return Array.from($("#localFiles").files||[]);}

function showLocalSelection(){
  const files=localFiles();
  $("#previewStatus").textContent=files.length?`已选择 ${files.length} 个视频 · ${files.map(file=>file.name).join("、")}`:"请选择一个或多个本地视频。";
}

function setSourceMode(mode){
  sourceMode=mode;
  const local=mode==="local";
  $("#remoteSourceField").hidden=local; $("#localSourceField").hidden=!local; $("#limitField").hidden=local;
  $("#sourceUrl").required=!local; $("#localFiles").required=local;
  $("#pipelineForm").classList.toggle("local-mode",local);
  $("#previewBtn").textContent=local?"预览已选视频":"先预览课程列表";
  document.querySelectorAll("[data-source-mode]").forEach(button=>{const active=button.dataset.sourceMode===mode;button.classList.toggle("active",active);button.setAttribute("aria-selected",String(active));});
  if(local)showLocalSelection();else $("#previewStatus").textContent="粘贴公开课程网址；不支持登录、付费或 DRM 内容。";
}

async function uploadLocalVideos(files){
  let uploadId="";
  for(let i=0;i<files.length;i++){
    const file=files[i];
    $("#previewStatus").textContent=`正在上传 ${i+1}/${files.length} · ${file.name} · ${formatSize(file.size)}`;
    const query=new URLSearchParams({filename:file.name}); if(uploadId)query.set("upload_id",uploadId);
    const response=await fetch(`/api/uploads?${query}`,{method:"POST",headers:{"Content-Type":file.type||"application/octet-stream"},body:file});
    const data=await response.json().catch(()=>({detail:"上传服务返回异常"}));
    if(!response.ok)throw new Error(data.detail||`上传失败 HTTP ${response.status}`);
    uploadId=data.upload_id;
  }
  return uploadId;
}

document.querySelectorAll("[data-source-mode]").forEach(button=>button.addEventListener("click",()=>setSourceMode(button.dataset.sourceMode)));
$("#localFiles").addEventListener("change",showLocalSelection);

let skillDocuments={};
function showSkillDocument(name){
  $("#skillDocument").textContent=skillDocuments[name]||"该文档为空。";
  document.querySelectorAll("[data-skill-document]").forEach(button=>button.classList.toggle("active",button.dataset.skillDocument===name));
}
$("#skillList").addEventListener("click",async(event)=>{
  const button=event.target.closest("[data-skill-name]"); if(!button||!activeJob)return;
  button.disabled=true;
  try{
    const data=await api(`/api/jobs/${activeJob.id}/skills/${button.dataset.skillName}`);
    skillDocuments=data.documents||{};
    $("#skillDialogTitle").textContent=data.display_name;
    $("#skillDialogMeta").textContent=data.valid?"格式校验通过。以下内容来自真实 API 蒸馏结果。":`格式校验存在问题：${(data.errors||[]).join("；")}`;
    showSkillDocument("skill"); $("#skillDialog").showModal();
  }catch(error){alert(`读取 Skill 失败：${error.message}`);}finally{button.disabled=false;}
});
document.querySelectorAll("[data-skill-document]").forEach(button=>button.addEventListener("click",()=>showSkillDocument(button.dataset.skillDocument)));

$("#previewBtn").addEventListener("click",async()=>{
  if(sourceMode==="local"){
    const files=localFiles();
    renderCourses(files.map((file,index)=>({id:`preview-${index}`,title:file.name.replace(/\.[^.]+$/, ""),duration:null,source:"local-upload",metadata:{}})));
    showLocalSelection(); return;
  }
  const button=$("#previewBtn"); button.disabled=true; $("#previewStatus").textContent="正在读取课程元数据…";
  try{const data=await api("/api/discover",{method:"POST",body:JSON.stringify({url:$("#sourceUrl").value,limit:Number($("#limit").value)})});renderCourses(data.items);$("#previewStatus").textContent=`已找到 ${data.items.length} 节课程，可开始蒸馏。`;}
  catch(e){$("#previewStatus").textContent=`解析失败：${e.message}`;}finally{button.disabled=false;}
});

$("#pipelineForm").addEventListener("submit",async(e)=>{
  e.preventDefault(); const button=e.submitter; button.disabled=true;
  try{
    let job;
    if(sourceMode==="local"){
      const files=localFiles(); if(!files.length)throw new Error("请先选择本地视频");
      const uploadId=await uploadLocalVideos(files);
      $("#previewStatus").textContent="上传完成，正在创建本地视频蒸馏任务…";
      job=await api("/api/jobs/local",{method:"POST",body:JSON.stringify({upload_id:uploadId,subject:$("#subject").value,grade:"高中"})});
    }else{
      job=await api("/api/jobs",{method:"POST",body:JSON.stringify({source_url:$("#sourceUrl").value,limit:Number($("#limit").value),subject:$("#subject").value,grade:"高中"})});
    }
    renderJob(job); if(pollTimer)clearInterval(pollTimer); pollTimer=setInterval(refreshJob,1500); setTimeout(refreshJob,300);
    $("#currentJob").scrollIntoView({behavior:"smooth",block:"start"});
  }catch(err){alert(`任务创建失败：${err.message}`);}finally{button.disabled=false;}
});

$("#cancelBtn").addEventListener("click",async()=>{if(activeJob)renderJob(await api(`/api/jobs/${activeJob.id}/cancel`,{method:"POST"}));});
$("#retryBtn").addEventListener("click",async()=>{if(!activeJob)return;renderJob(await api(`/api/jobs/${activeJob.id}/start`,{method:"POST"}));if(pollTimer)clearInterval(pollTimer);pollTimer=setInterval(refreshJob,1500);});

const dialog=$("#settingsDialog");
$("#openSettings").addEventListener("click",async()=>{
  const settings=await api("/api/settings"); $("#baseUrl").value=settings.llm_base_url||""; $("#modelName").value=settings.llm_model||""; $("#whisperModel").value=settings.whisper_model||"small"; $("#cookieBrowser").value=settings.video_cookie_browser||""; $("#apiKey").placeholder=settings.llm_api_key_hint?`已保存 ${settings.llm_api_key_hint}，留空则保留`:"sk-…"; $("#settingsMessage").textContent=""; dialog.showModal();
});
function settingsPayload(){return {llm_base_url:$("#baseUrl").value.trim(),llm_api_key:$("#apiKey").value.trim(),llm_model:$("#modelName").value.trim(),whisper_model:$("#whisperModel").value,video_cookie_browser:$("#cookieBrowser").value};}
$("#saveSettings").addEventListener("click",async()=>{try{await api("/api/settings",{method:"PUT",body:JSON.stringify(settingsPayload())});$("#settingsMessage").textContent="设置已安全保存到本机。";$("#apiKey").value="";checkHealth();}catch(e){$("#settingsMessage").textContent=`保存失败：${e.message}`;}});
$("#testApi").addEventListener("click",async()=>{const b=$("#testApi");b.disabled=true;$("#settingsMessage").textContent="正在测试…";try{const r=await api("/api/settings/test",{method:"POST",body:JSON.stringify(settingsPayload())});$("#settingsMessage").textContent=r.message||"连接成功。";}catch(e){$("#settingsMessage").textContent=`连接失败：${e.message}`;}finally{b.disabled=false;}});
$("#testCookies").addEventListener("click",async()=>{const b=$("#testCookies"),browser=$("#cookieBrowser").value,url=$("#sourceUrl").value.trim();if(!browser){$("#settingsMessage").textContent="请先选择一个浏览器。";return;}if(!url){$("#settingsMessage").textContent="请先在工作台粘贴要测试的视频网址。";return;}b.disabled=true;$("#settingsMessage").textContent="正在临时读取目标域名 Cookie；若系统询问钥匙串权限，请允许…";try{const r=await api("/api/video-cookies/test",{method:"POST",body:JSON.stringify({url,browser})});await api("/api/settings",{method:"PUT",body:JSON.stringify({video_cookie_browser:browser})});$("#settingsMessage").textContent=`${r.message} 已自动启用。`;}catch(e){$("#settingsMessage").textContent=`Cookie 检测失败：${e.message}`;}finally{b.disabled=false;}});

async function boot(){checkHealth();loadSupportedSources();try{const jobs=await api("/api/jobs");if(jobs.length){renderJob(jobs[0]);if(["queued","running"].includes(jobs[0].status))pollTimer=setInterval(refreshJob,1500);}}catch(e){console.warn(e);}}
boot();
