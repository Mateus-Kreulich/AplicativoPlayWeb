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
let audioCtx=null;
let soundEnabled=true;

const elements={
  saveStatus:document.getElementById("saveStatus"),
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

function clearTable(){
  elements.timeSheetBody.innerHTML="";
}

function applyStateToUi(state){
  elements.hourlyRate.value=state.settings.hourlyRate ?? elements.hourlyRate.value;
  elements.overtimeRate.value=state.settings.overtimeRate ?? elements.overtimeRate.value;
  elements.holidayRate.value=state.settings.holidayRate ?? elements.holidayRate.value;
  clearTable();
  state.rows.forEach(r=>addRow(r));
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
function scheduleSave(){showSaving();if(saveTimer)clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveAll(),600);}

function collectState(){
  const rows=[];
  document.querySelectorAll("#timeSheetBody tr").forEach(r=>{
    const i=r.querySelectorAll("input");
    rows.push({
      date:i[0].value,
      entry1:i[1].value,
      exit1:i[2].value,
      entry2:i[3].value,
      exit2:i[4].value,
      tipo:r.querySelector(".tipo").value,
      jornada:r.querySelector(".jornada").value
    });
  });
  return{
    version:STATE_VERSION,
    settings:{
      hourlyRate:elements.hourlyRate.value,
      overtimeRate:elements.overtimeRate.value,
      holidayRate:elements.holidayRate.value
    },
    rows
  };
}

async function saveAll(){
  const state=collectState();
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));

  if(fileHandle){
    try{
      const writable=await fileHandle.createWritable();
      await writable.write(JSON.stringify(state,null,2));
      await writable.close();
    }catch(err){
      UiUtils.logEvent("warn","Falha ao salvar no arquivo vinculado.",err?.message);
      fileHandle=null;
      alert("Não foi possível salvar no arquivo vinculado. Vincule novamente para continuar.");
    }
  }

  showSaved();
}

/* FILE SYSTEM */
async function selecionarArquivo(){
  if(!window.showSaveFilePicker){
    alert("Seu navegador não suporta vincular arquivo automaticamente. Use apenas o autosave local.");
    return;
  }

  try{
    fileHandle=await window.showSaveFilePicker({
      suggestedName:"registro_horas.json",
      types:[{description:"JSON",accept:{"application/json":[".json"]}}]
    });
    alert("Arquivo vinculado com sucesso.");
  }catch(err){
    if(err && err.name!=="AbortError"){
      alert("Não foi possível vincular o arquivo.");
    }
  }
}
function salvarArquivoManual(){
  if(!fileHandle){alert("Vincule um arquivo primeiro.");return;}
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
  const raw=localStorage.getItem(STORAGE_KEY);
  if(!raw)return;

  let parsedState=null;
  try{
    parsedState=JSON.parse(raw);
  }catch(err){
    UiUtils.logEvent("warn","Estado salvo inválido. Limpando cache local.",err?.message);
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  const state=StateSchema.migrateState(parsedState);
  if(!state){
    UiUtils.logEvent("warn","Versão de estado não suportada. Limpando cache local.");
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  applyStateToUi(state);
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

  for(let i=0;i<inputs.length;i++){
    if(!inputs[i].value){
      inputs[i].value=hora;
      atualizarStatus(i+1);
      break;
    }
  }

  calculateRow(row);
  scheduleSave();

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
    soundEnabled=false;
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
    }catch{
      // continua para tentar reproduzir
    }
  }

  try{
    const oscillator=audioCtx.createOscillator();
    const gain=audioCtx.createGain();

    oscillator.type="sine";
    oscillator.frequency.setValueAtTime(1046,audioCtx.currentTime);
    gain.gain.setValueAtTime(0.0001,audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18,audioCtx.currentTime+0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+0.22);

    oscillator.connect(gain);
    gain.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime+0.24);
  }catch(err){
    soundEnabled=false;
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

  const popup=window.open("","_blank","width=900,height=700");
  if(!popup){
    downloadCsvFallback();
    showFeedback("Popup bloqueado: CSV exportado como alternativa.");
    return;
  }

  popup.document.write(reportHtml);
  popup.document.close();
  popup.focus();
  setTimeout(()=>popup.print(),300);
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
  }
  window.location.reload();
}

document.addEventListener("DOMContentLoaded",()=>{
  window.addEventListener("pointerdown",initAudioContext,{once:true});
  window.addEventListener("touchstart",initAudioContext,{once:true});
  window.addEventListener("click",initAudioContext,{once:true});
  window.addEventListener("keydown",initAudioContext,{once:true});
  loadState();
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
  }
});
