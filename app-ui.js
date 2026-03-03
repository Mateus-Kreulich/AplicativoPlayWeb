window.addEventListener("load",()=>{
setTimeout(()=>{document.getElementById("loadingScreen").style.display="none"},2500);
});

/* PARTICLES */
const canvas=document.getElementById("particles");
const ctx=canvas.getContext("2d");
canvas.width=window.innerWidth;
canvas.height=window.innerHeight;
let particles=[];
let particlesAnimationId=null;
for(let i=0;i<70;i++){
particles.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*2+1,d:Math.random()*1});
}
function draw(){
ctx.clearRect(0,0,canvas.width,canvas.height);
ctx.fillStyle="#00ff9f";
particles.forEach(p=>{
ctx.beginPath();
ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
ctx.fill();
p.y+=p.d;
if(p.y>canvas.height){p.y=0;p.x=Math.random()*canvas.width;}
});
particlesAnimationId=requestAnimationFrame(draw);
}
draw();
document.addEventListener("visibilitychange",()=>{
  if(document.hidden && particlesAnimationId){
    cancelAnimationFrame(particlesAnimationId);
    particlesAnimationId=null;
    return;
  }
  if(!document.hidden && !particlesAnimationId){
    draw();
  }
});
window.addEventListener("resize",()=>{
  canvas.width=window.innerWidth;
  canvas.height=window.innerHeight;
});

const STORAGE_KEY="controleHorasFINALMASTER";
const STATE_VERSION=StateSchema.CURRENT_VERSION;
const diasSemana=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
let saveTimer=null;
let fileHandle=null;
const FILE_HANDLE_DB_NAME="dragonpoint-file-handle-db";
const FILE_HANDLE_STORE_NAME="handles";
const FILE_HANDLE_KEY="linked-json-handle";
const AUTO_HEARTBEAT_INTERVAL_MS=60*1000;
let audioCtx=null;
let soundEnabled=true;
let saveLock=Promise.resolve();
let lastSavedStateHash="";
let autosaveHeartbeatId=null;
let simulatedFileWriteFailures=0;
let fileWriteAttempts=0;
let forcedCheckpointSaves=0;
let linkedFileName="";

const elements={
  saveStatus:document.getElementById("saveStatus"),
  fileSyncStatus:document.getElementById("fileSyncStatus"),
  timeSheetBody:document.getElementById("timeSheetBody"),
  hourlyRate:document.getElementById("hourlyRate"),
  overtimeRate:document.getElementById("overtimeRate"),
  holidayRate:document.getElementById("holidayRate"),
  totalHours:document.getElementById("totalHours"),
  totalExtras:document.getElementById("totalExtras"),
  totalPay:document.getElementById("totalPay"),
  configPanel:document.getElementById("configPanel"),
  nextStatus:document.getElementById("nextStatus"),
  confirmacaoVisual:document.getElementById("confirmacaoVisual"),
  appFeedback:document.getElementById("appFeedback"),
  updateBanner:document.getElementById("updateBanner")
};



function showFeedback(message){
  elements.appFeedback.textContent=message;
  setTimeout(()=>{ if(elements.appFeedback.textContent===message) elements.appFeedback.textContent=""; },3000);
}

function formatTimeLabel(date){
  return date.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
}

function updateFileSyncStatus(status,date){
  if(!elements.fileSyncStatus)return;
  const fileLabel=linkedFileName?` (${linkedFileName})`:"";
  if(status==="ok" && date){
    elements.fileSyncStatus.textContent=`JSON sincronizado${fileLabel}: ${formatTimeLabel(date)}`;
    elements.fileSyncStatus.className="file-sync-status ok";
    return;
  }
  if(status==="linked"){
    elements.fileSyncStatus.textContent=`JSON vinculado${fileLabel}`;
    elements.fileSyncStatus.className="file-sync-status";
    return;
  }
  if(status==="waiting_permission"){
    elements.fileSyncStatus.textContent=`JSON vinculado${fileLabel}, aguardando permissão`;
    elements.fileSyncStatus.className="file-sync-status waiting";
    return;
  }
  if(status==="error"){
    elements.fileSyncStatus.textContent=`JSON não sincronizado${fileLabel}`;
    elements.fileSyncStatus.className="file-sync-status error";
    return;
  }
  elements.fileSyncStatus.textContent="JSON não vinculado";
  elements.fileSyncStatus.className="file-sync-status";
}



function setSimulatedFileWriteFailures(count){
  simulatedFileWriteFailures=Math.max(0,Number(count)||0);
}

function getWriteDiagnostics(){
  return { fileWriteAttempts, forcedCheckpointSaves, lastSavedStateHash };
}

function setLinkedFileHandleForTests(handle){
  fileHandle=handle;
  linkedFileName=handle?.name || "arquivo_teste.json";
  updateFileSyncStatus("linked");
}

function supportsPersistentFileHandle(){
  return !!(window.indexedDB && window.showSaveFilePicker);
}

function openFileHandleDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(FILE_HANDLE_DB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(FILE_HANDLE_STORE_NAME)){
        db.createObjectStore(FILE_HANDLE_STORE_NAME);
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function saveLinkedFileHandle(handle){
  if(!supportsPersistentFileHandle())return;
  try{
    const db=await openFileHandleDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_HANDLE_STORE_NAME,"readwrite");
      tx.objectStore(FILE_HANDLE_STORE_NAME).put(handle,FILE_HANDLE_KEY);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error);
    });
    db.close();
  }catch(err){
    UiUtils.logEvent("warn","Falha ao persistir vínculo de arquivo",err?.message);
  }
}

async function loadLinkedFileHandle(){
  if(!supportsPersistentFileHandle())return null;
  try{
    const db=await openFileHandleDb();
    const handle=await new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_HANDLE_STORE_NAME,"readonly");
      const req=tx.objectStore(FILE_HANDLE_STORE_NAME).get(FILE_HANDLE_KEY);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error);
    });
    db.close();
    return handle;
  }catch(err){
    UiUtils.logEvent("warn","Falha ao recuperar vínculo de arquivo",err?.message);
    return null;
  }
}

async function clearLinkedFileHandle(){
  if(!supportsPersistentFileHandle())return;
  try{
    const db=await openFileHandleDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_HANDLE_STORE_NAME,"readwrite");
      tx.objectStore(FILE_HANDLE_STORE_NAME).delete(FILE_HANDLE_KEY);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error);
    });
    db.close();
  }catch(err){
    UiUtils.logEvent("warn","Falha ao limpar vínculo de arquivo",err?.message);
  }
}



async function unlinkLinkedFile(){
  fileHandle=null;
  linkedFileName="";
  await clearLinkedFileHandle();
  updateFileSyncStatus("idle");
  showFeedback("Arquivo JSON desvinculado.");
}

async function reauthorizeLinkedFile(){
  if(!fileHandle){
    const restored=await loadLinkedFileHandle();
    if(restored)fileHandle=restored;
  }

  if(!fileHandle){
    linkedFileName="";
    updateFileSyncStatus("idle");
    showFeedback("Nenhum arquivo vinculado para reautorizar.");
    return;
  }

  const granted=await ensureFileHandlePermission(fileHandle,{interactive:true});
  if(!granted){
    updateFileSyncStatus("waiting_permission");
    showFeedback("Permissão de arquivo não concedida.");
    return;
  }

  await saveLinkedFileHandle(fileHandle);
  updateFileSyncStatus("ok",new Date());
  queueSave({force:true}).catch(()=>{});
  showFeedback("Permissão de arquivo atualizada.");
}

async function ensureFileHandlePermission(handle,{interactive=false}={}){
  if(!handle || typeof handle.queryPermission!=="function")return false;
  const options={mode:"readwrite"};
  try{
    let permission=await handle.queryPermission(options);
    if(permission==="granted")return true;
    if(permission==="prompt" && interactive && typeof handle.requestPermission==="function"){
      permission=await handle.requestPermission(options);
      return permission==="granted";
    }
    return false;
  }catch(err){
    UiUtils.logEvent("warn","Falha ao consultar permissão do arquivo",err?.message);
    return false;
  }
}

async function importStateFromLinkedFile(handle){
  if(!handle)return false;
  try{
    const file=await handle.getFile();
    const text=await file.text();
    if(!text.trim())return false;
    const result=UiUtils.parseImportJson(text,StateSchema.migrateState);
    if(!result.ok){
      showFeedback("Arquivo vinculado inválido. Usando dados locais.");
      return false;
    }
    applyStateToUi(result.state);
    return true;
  }catch(err){
    UiUtils.logEvent("warn","Falha ao ler arquivo vinculado",err?.message);
    return false;
  }
}

async function restoreLinkedFileOnStartup(){
  const restored=await loadLinkedFileHandle();
  if(!restored){
    updateFileSyncStatus("idle");
    return;
  }

  fileHandle=restored;
  linkedFileName=fileHandle?.name || "arquivo_vinculado.json";
  updateFileSyncStatus("linked");
  const hasPermission=await ensureFileHandlePermission(fileHandle,{interactive:false});
  if(!hasPermission){
    updateFileSyncStatus("waiting_permission");
    return;
  }

  const imported=await importStateFromLinkedFile(fileHandle);
  if(imported){
    updateFileSyncStatus("ok",new Date());
    scheduleSave();
    showFeedback("Arquivo JSON vinculado carregado automaticamente.");
  }else{
    updateFileSyncStatus("linked");
  }
}

function clearTable(){
  elements.timeSheetBody.innerHTML="";
}

function applyStateToUi(state){
  elements.hourlyRate.value=state.settings.hourlyRate ?? elements.hourlyRate.value;
  elements.overtimeRate.value=state.settings.overtimeRate ?? elements.overtimeRate.value;
  elements.holidayRate.value=state.settings.holidayRate ?? elements.holidayRate.value;
  clearTable();
  (state.rows||[]).forEach(r=>addRow(r));
  if(!elements.timeSheetBody.querySelector("tr"))addRow();
  calculateTotals();
}

/* NAVEGAÇÃO */
function showPage(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/* AUTOSAVE */
function showSaving(){elements.saveStatus.textContent="Salvando...";elements.saveStatus.className="autosave saving";}
function showSaved(){elements.saveStatus.textContent="Salvo ✓";elements.saveStatus.className="autosave saved";setTimeout(()=>{elements.saveStatus.textContent="Pronto";elements.saveStatus.className="autosave";},1500);}
function scheduleSave(){showSaving();if(saveTimer)clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveAll(),350);}

function stateHash(state){
  return JSON.stringify(state);
}

function queueSave(options={}){
  saveLock=saveLock
    .catch(()=>{})
    .then(()=>saveAllInternal(options));
  return saveLock;
}

function flushPendingSave(){
  if(saveTimer){
    clearTimeout(saveTimer);
    saveTimer=null;
  }
  queueSave({silent:true,force:true}).catch(()=>{});
}

function collectState(){
  return {
    version:STATE_VERSION,
    settings:{
      hourlyRate:elements.hourlyRate.value,
      overtimeRate:elements.overtimeRate.value,
      holidayRate:elements.holidayRate.value
    },
    rows:AppState.collectRowsFromTable(elements.timeSheetBody)
  };
}

async function writeStateToLinkedFile(state,{maxAttempts=3}={}){
  if(!fileHandle)return { ok:true, skipped:true };
  let attempt=0;
  while(attempt<maxAttempts){
    attempt+=1;
    try{
      fileWriteAttempts+=1;
      if(simulatedFileWriteFailures>0){
        simulatedFileWriteFailures-=1;
        throw new Error("Simulated file write failure");
      }
      const writable=await fileHandle.createWritable();
      await writable.write(JSON.stringify(state,null,2));
      await writable.close();
      updateFileSyncStatus("ok",new Date());
      return { ok:true };
    }catch(err){
      UiUtils.logEvent("warn","Falha ao salvar no arquivo vinculado.",{attempt,message:err?.message});
      if(attempt>=maxAttempts){
        fileHandle=null;
        linkedFileName="";
        clearLinkedFileHandle();
        updateFileSyncStatus("error");
        return { ok:false };
      }
      const backoff=250*attempt;
      await new Promise(resolve=>setTimeout(resolve,backoff));
    }
  }
  return { ok:false };
}

async function saveAllInternal(options={}){
  const {silent=false,force=false}=options;
  const state=collectState();
  const currentHash=stateHash(state);
  if(!force && currentHash===lastSavedStateHash){
    if(!silent)showSaved();
    return;
  }

  const persisted=AppState.saveToStorage(STORAGE_KEY,state);
  if(!persisted.ok){
    UiUtils.logEvent("error","Falha ao salvar no armazenamento local",persisted.error);
    showFeedback("Sem espaço para salvar localmente. Exporte/limpe dados e tente novamente.");
    return;
  }

  const fileWriteResult=await writeStateToLinkedFile(state);
  if(!fileWriteResult.ok){
    showFeedback("Falha ao salvar no arquivo vinculado. Vincule novamente.");
  }

  lastSavedStateHash=currentHash;
  if(!silent)showSaved();
}

function saveAll(options={}){
  return queueSave(options);
}

/* FILE SYSTEM */
async function selecionarArquivo(){
  if(!window.showSaveFilePicker){
    showFeedback("Seu navegador não suporta vinculação automática de arquivo.");
    return;
  }

  try{
    fileHandle=await window.showSaveFilePicker({
      suggestedName:"registro_horas.json",
      types:[{description:"JSON",accept:{"application/json":[".json"]}}]
    });

    linkedFileName=fileHandle?.name || "registro_horas.json";
    updateFileSyncStatus("linked");

    const granted=await ensureFileHandlePermission(fileHandle,{interactive:true});
    if(!granted){
      showFeedback("Permissão negada para o arquivo vinculado.");
      updateFileSyncStatus("waiting_permission");
      return;
    }

    await saveLinkedFileHandle(fileHandle);
    const imported=await importStateFromLinkedFile(fileHandle);
    if(imported){
      lastSavedStateHash="";
    }
    updateFileSyncStatus("ok",new Date());
    scheduleSave();
    showFeedback("Arquivo vinculado com sucesso. Será reaberto automaticamente.");
  }catch(err){
    if(err && err.name!=="AbortError"){
      showFeedback("Não foi possível vincular o arquivo.");
    }
  }
}
function salvarArquivoManual(){
  if(!fileHandle){showFeedback("Vincule um arquivo primeiro.");return;}
  saveAll();
}

async function importarArquivoJSON(){
  const input=document.createElement("input");
  input.type="file";
  input.accept="application/json,.json";
  input.onchange=async()=>{
    const file=input.files && input.files[0];
    if(!file)return;
    const text=await file.text();
    const result=UiUtils.parseImportJson(text,StateSchema.migrateState);
    if(!result.ok){
      showFeedback(result.error);
      return;
    }
    applyStateToUi(result.state);
    scheduleSave();
    showFeedback("Dados importados com sucesso.");
  };
  input.click();
}

/* LOAD */
function loadState(){
  const result=AppState.loadFromStorage(STORAGE_KEY,StateSchema.migrateState);
  if(!result.ok){
    UiUtils.logEvent("warn","Falha ao carregar estado",result.error);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(AppState.getBackupKey(STORAGE_KEY));
    showFeedback(result.error+" Recriando estado local.");
    applyStateToUi(AppState.createDefaultState());
    return;
  }

  applyStateToUi(result.state);

  if(result.source==="backup"){
    showFeedback("Backup local restaurado após falha no estado principal.");
    scheduleSave();
  }

  if(result.warning){
    UiUtils.logEvent("warn","Restauração com aviso",result.warning);
  }
}


/* CONFIG */
function toggleConfig(){
  elements.configPanel.style.display=elements.configPanel.style.display==="none"?"block":"none";
}

/* AUTO DATE + ROW */
function buildInputCell(type,value=""){
  const td=document.createElement("td");
  const input=document.createElement("input");
  input.type=type;
  input.value=value;
  td.appendChild(input);
  return td;
}

function buildSelectCell(className,options,selected){
  const td=document.createElement("td");
  const select=document.createElement("select");
  select.className=className;
  options.forEach(opt=>{
    const option=document.createElement("option");
    option.value=opt.value;
    option.textContent=opt.label;
    select.appendChild(option);
  });
  if(selected)select.value=selected;
  td.appendChild(select);
  return td;
}

function refreshDeleteButtonLabel(row){
  const date=row.querySelector('input[type=date]')?.value || "sem data";
  const button=row.querySelector("button[data-action='delete-row']");
  if(button){
    button.setAttribute("aria-label",`Excluir linha de ${date}`);
  }
}

function addRow(data={}){
  const tbody=elements.timeSheetBody;
  const tr=document.createElement("tr");

  let novaData=data.date;
  if(!novaData){
    const linhas=tbody.querySelectorAll("tr");
    if(linhas.length){
      const ultima=linhas[linhas.length-1].querySelector("input[type=date]").value;
      if(ultima){
        const d=new Date(ultima+"T00:00:00");
        d.setDate(d.getDate()+1);
        novaData=d.toISOString().split("T")[0];
      }
    }
    if(!novaData)novaData=new Date().toISOString().split("T")[0];
  }

  tr.appendChild(buildInputCell("date",novaData));

  const dayCell=document.createElement("td");
  dayCell.className="day";
  tr.appendChild(dayCell);

  tr.appendChild(buildInputCell("time",data.entry1||""));
  tr.appendChild(buildInputCell("time",data.exit1||""));
  tr.appendChild(buildInputCell("time",data.entry2||""));
  tr.appendChild(buildInputCell("time",data.exit2||""));

  tr.appendChild(buildSelectCell("tipo",[
    {value:"normal",label:"Útil"},
    {value:"holiday",label:"Feriado"}
  ],data.tipo));

  tr.appendChild(buildSelectCell("jornada",[
    {value:"8",label:"8h"},
    {value:"4",label:"4h"}
  ],data.jornada));

  const hCell=document.createElement("td");
  hCell.className="h";
  hCell.textContent="0h";
  tr.appendChild(hCell);

  const eCell=document.createElement("td");
  eCell.className="e";
  eCell.textContent="0h";
  tr.appendChild(eCell);

  const vCell=document.createElement("td");
  vCell.className="v";
  vCell.textContent="R$ 0,00";
  tr.appendChild(vCell);

  const actionCell=document.createElement("td");
  const deleteBtn=document.createElement("button");
  deleteBtn.type="button";
  deleteBtn.dataset.action="delete-row";
  deleteBtn.textContent="X";
  deleteBtn.addEventListener("click",()=>deleteRow(deleteBtn));
  actionCell.appendChild(deleteBtn);
  tr.appendChild(actionCell);

  tbody.appendChild(tr);

  tr.querySelectorAll("input,select").forEach(el=>{
    el.addEventListener("input",()=>{updateDay(tr);refreshDeleteButtonLabel(tr);calculateRow(tr);scheduleSave();});
    el.addEventListener("change",()=>{updateDay(tr);refreshDeleteButtonLabel(tr);calculateRow(tr);scheduleSave();});
  });

  refreshDeleteButtonLabel(tr);
  updateDay(tr);
  calculateRow(tr);
}

/* DIA */
function updateDay(row){
  const date=row.querySelector("input[type=date]").value;
  if(!date)return;
  const d=new Date(date+"T00:00:00");
  row.querySelector(".day").textContent=diasSemana[d.getDay()];
  row.classList.toggle("weekend",d.getDay()===0||d.getDay()===6);
}

/* REGISTRO SEQUENCIAL */
function registrarPonto(){
  const hoje=new Date().toISOString().split("T")[0];
  let row=[...elements.timeSheetBody.querySelectorAll("tr")]
    .find(r=>r.querySelector("input[type=date]").value===hoje);

  if(!row){addRow({date:hoje});row=elements.timeSheetBody.lastChild;}

  const inputs=row.querySelectorAll("input[type=time]");
  const hora=new Date().toTimeString().slice(0,5);

  let filledIndex=-1;
  for(let i=0;i<inputs.length;i++){
    if(!inputs[i].value){
      inputs[i].value=hora;
      atualizarStatus(i+1);
      filledIndex=i;
      break;
    }
  }

  calculateRow(row);
  scheduleSave();

  const jornada=row.querySelector(".jornada")?.value || "8";
  const completed8h=(jornada==="8" && filledIndex===3);
  const completed4h=(jornada==="4" && filledIndex===1);
  if(completed8h || completed4h){
    forcedCheckpointSaves+=1;
    queueSave({force:true}).catch(()=>{});
  }

  const botao=document.querySelector(".big-button");
  botao.classList.add("pulse","flash-success");
  setTimeout(()=>botao.classList.remove("pulse","flash-success"),400);

  if(navigator.vibrate){navigator.vibrate([100,50,100]);}
  tocarSom().catch(()=>{});

  elements.confirmacaoVisual.classList.add("show");
  setTimeout(()=>elements.confirmacaoVisual.classList.remove("show"),1500);
}

function atualizarStatus(pos){
  const labels=["Entrada","Saída","Retorno","Saída Final"];
  if(pos<4)elements.nextStatus.textContent="Próximo: "+labels[pos];
  else elements.nextStatus.textContent="Dia completo ✓";
}


function initAudioContext(){
  if(audioCtx || !soundEnabled)return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if(!Ctx){
    soundEnabled=false;
    return;
  }
  try{
    audioCtx=new Ctx();
  }catch(err){
    UiUtils.logEvent("warn","Não foi possível iniciar contexto de áudio",err?.message);
  }
}

async function tocarSom(){
  if(!soundEnabled)return;
  initAudioContext();
  if(!audioCtx)return;

  if(audioCtx.state==="suspended"){
    try{
      await audioCtx.resume();
    }catch(err){
      UiUtils.logEvent("warn","AudioContext bloqueado para reprodução",err?.message);
      return;
    }
  }

  if(audioCtx.state!=="running"){
    UiUtils.logEvent("warn","AudioContext não está em estado running",audioCtx.state);
    return;
  }

  try{
    const oscillator=audioCtx.createOscillator();
    const gain=audioCtx.createGain();

    oscillator.type="sine";
    oscillator.frequency.setValueAtTime(1200,audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(900,audioCtx.currentTime+0.25);

    gain.gain.setValueAtTime(0.0001,audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35,audioCtx.currentTime+0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+0.3);

    oscillator.connect(gain);
    gain.connect(audioCtx.destination);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime+0.32);
  }catch(err){
    UiUtils.logEvent("warn","Falha ao reproduzir notificação sonora",err?.message);
  }
}

/* CÁLCULO */
function calculateRow(row){
  const i=row.querySelectorAll("input");
  const jornada=parseFloat(row.querySelector(".jornada").value)||8;
  const tipo=row.querySelector(".tipo").value;

  const hourly=parseFloat(elements.hourlyRate.value)||0;
  const overtime=parseFloat(elements.overtimeRate.value)||0;
  const holiday=parseFloat(elements.holidayRate.value)||0;

  const worked=AppLogic.calculateWorkedHours({
    entry1:i[1].value,
    exit1:i[2].value,
    entry2:i[3].value,
    exit2:i[4].value,
    jornada
  });

  let normal=worked.normal;
  let extra=worked.extra;
  let pay=AppLogic.calculatePay({
    tipo,
    hours:worked.hours,
    normal,
    extra,
    hourlyRate:hourly,
    overtimeRate:overtime,
    holidayRate:holiday
  });

  row.querySelector(".h").textContent=normal.toFixed(2)+"h";
  row.querySelector(".e").textContent=extra.toFixed(2)+"h";
  row.querySelector(".v").textContent=pay.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

  calculateTotals();
}
function calculateTotals(){
  let th=0,te=0,tp=0;
  document.querySelectorAll("#timeSheetBody tr").forEach(r=>{
    th+=parseFloat(r.querySelector(".h").textContent)||0;
    te+=parseFloat(r.querySelector(".e").textContent)||0;
    const v=r.querySelector(".v").textContent;
    tp+=AppLogic.parseCurrencyBRL(v);
  });
  elements.totalHours.textContent=th.toFixed(2)+"h";
  elements.totalExtras.textContent=te.toFixed(2)+"h";
  elements.totalPay.textContent=tp.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}

/* PDF */
function downloadCsvFallback(){
  const headers=["Data","Dia","Entrada","Saída Int.","Retorno","Saída Final","Tipo","Jornada","Horas","Extras","Valor"];
  const rows=[...document.querySelectorAll("#timeSheetBody tr")].map(r=>{
    const c=r.querySelectorAll("td");
    return [
      c[0].querySelector("input")?.value||"",
      c[1].textContent.trim(),
      c[2].querySelector("input")?.value||"",
      c[3].querySelector("input")?.value||"",
      c[4].querySelector("input")?.value||"",
      c[5].querySelector("input")?.value||"",
      c[6].querySelector("select")?.value||"",
      c[7].querySelector("select")?.value||"",
      c[8].textContent.trim(),
      c[9].textContent.trim(),
      c[10].textContent.trim()
    ];
  });

  const content=UiUtils.rowsToCsv(headers,rows);
  const blob=new Blob([content],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="registro_horas.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function gerarPDF(){
  const tableHtml=document.querySelector("#registro table").outerHTML;
  const totalsHtml=`<p><strong>Total Horas:</strong> ${elements.totalHours.textContent} | <strong>Total Extras:</strong> ${elements.totalExtras.textContent} | <strong>Total a Receber:</strong> ${elements.totalPay.textContent}</p>`;
  const reportHtml=UiUtils.buildReportHtml({
    title:"Relatório de Registro de Horas",
    generatedAt:new Date().toLocaleString("pt-BR"),
    tableHtml,
    totalsHtml
  });

  try{
    const blob=new Blob([reportHtml],{type:"text/html;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download="relatorio_registro_horas.html";
    link.click();
    URL.revokeObjectURL(url);
    showFeedback("Relatório HTML exportado. Abra o arquivo e use imprimir para gerar PDF.");
  }catch(err){
    UiUtils.logEvent("warn","Falha ao exportar relatório HTML",err?.message);
    downloadCsvFallback();
    showFeedback("Falha ao exportar relatório HTML. CSV exportado como alternativa.");
  }
}

function deleteRow(btn){
  btn.closest("tr").remove();
  calculateTotals();
  scheduleSave();
  showFeedback("Linha removida.");
}

function applyAppUpdate(){
  if(navigator.serviceWorker && navigator.serviceWorker.controller){
    navigator.serviceWorker.controller.postMessage({type:"SKIP_WAITING"});
    showFeedback("Atualizando aplicação...");
    return;
  }
  window.location.reload();
}

document.addEventListener("DOMContentLoaded",()=>{
  window.addEventListener("pointerdown",initAudioContext,{once:true});
  window.addEventListener("touchstart",initAudioContext,{once:true});
  window.addEventListener("click",initAudioContext,{once:true});
  window.addEventListener("mousedown",initAudioContext,{once:true});
  window.addEventListener("keydown",initAudioContext,{once:true});

  const bindClick=(id,handler)=>{
    const el=document.getElementById(id);
    if(el)el.addEventListener("click",handler);
  };

  bindClick("navHome",()=>showPage("home"));
  bindClick("navRegistro",()=>showPage("registro"));
  bindClick("btnRegistrarPonto",registrarPonto);
  bindClick("btnToggleConfig",toggleConfig);
  bindClick("btnImportJson",importarArquivoJSON);
  bindClick("btnLinkJson",selecionarArquivo);
  bindClick("btnUnlinkJson",()=>unlinkLinkedFile());
  bindClick("btnReauthorizeJson",()=>reauthorizeLinkedFile());
  bindClick("btnSaveJson",salvarArquivoManual);
  bindClick("btnReport",gerarPDF);
  bindClick("btnAddRow",()=>addRow());
  bindClick("btnUpdateApp",applyAppUpdate);
  updateFileSyncStatus("idle");
  if(typeof window!=="undefined"){
    window.__DP_TEST__={
      setSimulatedFileWriteFailures,
      getWriteDiagnostics,
      setLinkedFileHandleForTests,
      queueSave,
      restoreLinkedFileOnStartup
    };
  }
  window.addEventListener("beforeunload",flushPendingSave);
  document.addEventListener("visibilitychange",()=>{ if(document.hidden)flushPendingSave(); });
  autosaveHeartbeatId=setInterval(()=>{
    queueSave({silent:true}).catch(()=>{});
  },AUTO_HEARTBEAT_INTERVAL_MS);
  loadState();
  restoreLinkedFileOnStartup().catch(()=>{});
  if(!elements.timeSheetBody.querySelector("tr"))addRow();

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./service-worker.js").then(reg=>{
      if(reg.waiting){
        elements.updateBanner.style.display="block";
      }
      reg.addEventListener("updatefound",()=>{
        const worker=reg.installing;
        if(!worker)return;
        worker.addEventListener("statechange",()=>{
          if(worker.state==="installed" && navigator.serviceWorker.controller){
            elements.updateBanner.style.display="block";
            showFeedback("Nova versão pronta para atualizar.");
          }
        });
      });
    }).catch(err=>UiUtils.logEvent("warn","Falha ao registrar service worker",err?.message));

    navigator.serviceWorker.addEventListener("controllerchange",()=>window.location.reload());

    navigator.serviceWorker.addEventListener("message",(event)=>{
      if(event.data && event.data.type==="SW_ACTIVATED"){
        UiUtils.logEvent("info","Service worker ativado",event.data.version);
      }
    });

    setInterval(()=>{
      navigator.serviceWorker.getRegistration().then(reg=>reg && reg.update()).catch(()=>{});
    }, 5*60*1000);
  }
});
