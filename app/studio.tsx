"use client";

import {useEffect,useRef,useState,type FormEvent,type PointerEvent} from "react";
import {ArrowLeft,ArrowRight,Download,ImagePlus,Layers,Plus,Redo2,Save,Undo2,Upload} from "lucide-react";
import {sizes,code,dateBR,whatsappNumber} from "../lib/atacado";
import {pdf,saveFile} from "../lib/export";
import {defaultPanel,hasArtwork,pixelSize,presets,rasterTypes,studioAreas,studioFileUrl,studioModes,studioStatuses,viewNames,views,type Area,type Design,type Layer,type Panel,type StudioFile} from "../lib/studio";
import {loadStudioImage,lowResolution,paintStudio,svgPreview} from "../lib/studio-render";

type Entry={id:number;client:number;rev:number;created:string;updated:string;body:Record<string,any>};
type CatalogEntry={id:number;body:Record<string,any>};
type Request=(path:string,method?:string,body?:unknown)=>Promise<any>;
type Props={api:Request;clients:CatalogEntry[];products:CatalogEntry[];staff:boolean;admin:boolean;account:string;back:()=>void;versionId:number|null;company:string;openQuote:(id:number)=>void;notify:(text:string)=>void;createClient?:()=>void;createProduct?:()=>void};
const modeLabel=(mode:Design["mode"])=>mode==="Logotipos"?"Aplicação de logos":mode;
const initialDesign=(product:CatalogEntry|undefined):Design=>({
  name:"Nova personalização",product:product?.id??0,color:"#ffffff",fabric:product?.body.fabric??"",mode:"Logotipos",
  sizes:sizes.map(size=>({size,qty:0})),
  panels:{front:defaultPanel("front"),back:defaultPanel("back"),right:defaultPanel("right"),left:defaultPanel("left")},
});
function Button({children,onClick,disabled=false,primary=false}:{children:React.ReactNode;onClick:()=>void;disabled?:boolean;primary?:boolean}){
  return <button type="button" className={primary?"btn primary":"btn secondary"} disabled={disabled} onClick={onClick}>{children}</button>;
}
function Numeric({label,value,min,max,step=1,change}:{label:string;value:number;min:number;max:number;step?:number;change:(value:number)=>void}){
  const [draft,setDraft]=useState<string|null>(null);
  return <label className="field"><span>{label}</span><input type="number" value={draft??value} min={min} max={max} step={step}
    onChange={event=>{
      const input=event.currentTarget;
      const next=input.valueAsNumber;
      setDraft(input.value);
      if(Number.isFinite(next)&&next>=min&&next<=max&&!input.validity.stepMismatch)change(next);
    }}
    onBlur={()=>setDraft(null)}/></label>;
}
function canvasBlob(canvas:HTMLCanvasElement):Promise<Blob>{
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Não foi possível gerar o PNG.")),"image/png"));
}
function crc32(bytes:Uint8Array) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
async function pngWithDpi(blob:Blob,dpi:number) {
  const source=new Uint8Array(await blob.arrayBuffer());
  const density=new Uint8Array(21),data=new DataView(density.buffer);
  data.setUint32(0,9);density.set([112,72,89,115],4);
  const pixelsPerMeter=Math.round(dpi/0.0254);
  data.setUint32(8,pixelsPerMeter);data.setUint32(12,pixelsPerMeter);density[16]=1;
  data.setUint32(17,crc32(density.subarray(4,17)));
  const chunks:BlobPart[]=[source.slice(0,33),density];
  const header=new DataView(source.buffer);
  for(let offset=33;offset+12<=source.length;){
    const end=offset+header.getUint32(offset)+12;
    if(header.getUint32(offset+4)!==0x70485973)chunks.push(source.slice(offset,end));
    offset=end;
  }
  return new Blob(chunks,{type:"image/png"});
}

export default function Studio({api,clients,products,staff,admin,account,back,versionId,company,openQuote,notify,createClient,createProduct}:Props){
  const [projects,setProjects]=useState<Entry[]>([]);
  const [projectFilter,setProjectFilter]=useState("");
  const [project,setProject]=useState<Entry|null>(null);
  const [versions,setVersions]=useState<Entry[]>([]);
  const [activity,setActivity]=useState<{action:string;at:string;detail:string}[]>([]);
  const [snapshot,setSnapshot]=useState<Entry|null>(null);
  const [linkedRefs,setLinkedRefs]=useState<{quoteId?:number;orderId?:number}>({});
  const [files,setFiles]=useState<StudioFile[]>([]);
  const [design,setDesign]=useState<Design>(()=>initialDesign(products[0]));
  const [client,setClient]=useState(clients[0]?.id??0);
  const [areaId,setArea]=useState<Area>("front");
  const [selected,setSelected]=useState("");
  const [mock,setMock]=useState(false);
  const [guides,setGuides]=useState(true);
  const [zoom,setZoom]=useState(100);
  const [dpi,setDpi]=useState(150);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState("");
  const [note,setNote]=useState("");
  const [message,setMessage]=useState<string|null>(null);
  const [creating,setCreating]=useState(false);
  const [confirmArchive,setConfirmArchive]=useState(false);
  const [pdfPages,setPdfPages]=useState<Record<string,number>>({});
  const [rename,setRename]=useState<{id:string;name:string}|null>(null);
  const [warnings,setWarnings]=useState<{file:string;dpi:number}[]>([]);
  const [renderError,setRenderError]=useState("");
  const [revision,setRevision]=useState(0);
  const history=useRef<{past:Design[];future:Design[]}>({past:[],future:[]});
  const canvas=useRef<HTMLCanvasElement>(null);
  const drag=useRef<{pointer:number;initial:Design;id:string;dx:number;dy:number}|null>(null);
  const saving=useRef(false);
  const quickFile=useRef<HTMLInputElement>(null);
  const area=studioAreas.find(item=>item.id===areaId)??studioAreas[0];
  const view=area.view;
  const shoulder=areaId.startsWith("shoulder-");
  const placements=presets[view];
  const panel=design.panels[view];
  const layer=panel.layers.find(item=>item.id===selected);
  const product=products.find(item=>item.id===design.product);
  const dirty=!!project&&!snapshot&&JSON.stringify(design)!==saved;
  const current=versions.find(item=>item.body.version===project?.body.current);
  const linkedVersion=snapshot??current;
  const draftKey=(id:number)=>`pulse-studio:${account}:${id}`;
  const cleanProject=(row:Entry)=>{setProject(row);setSaved(JSON.stringify(row.body.design));};
  const refreshProjects=()=>api("studio").then(setProjects);
  function report(error:unknown){setError(error instanceof Error?error.message:"Operação indisponível.");}
  async function run(task:()=>Promise<void>){
    if(saving.current)return;
    saving.current=true;setBusy(true);setError("");
    try{await task();}catch(error){report(error);}
    finally{saving.current=false;setBusy(false);}
  }
  function loadDesign(next:Design){
    history.current={past:[],future:[]};setRevision(value=>value+1);
    setDesign(next);setSelected("");setArea("front");setNote("");setMessage(null);setConfirmArchive(false);
  }
  async function openProject(row:Entry){
    const [assets,records,events]=await Promise.all([api("studio/"+row.id+"/library"),api("studio/"+row.id+"/versions"),api("record/"+row.id+"/history")]);
    setActivity(events);
    cleanProject(row);setSnapshot(null);setFiles(assets);setVersions(records);
    setClient(row.client);loadDesign(row.body.design);setCreating(false);
    try {
      const pending=JSON.parse(sessionStorage.getItem(draftKey(row.id))??"null");
      if(pending?.rev===row.rev && pending.design){
        setDesign(pending.design);notify("Rascunho recuperado. As alterações serão salvas no servidor.");
      }else if(pending)sessionStorage.removeItem(draftKey(row.id));
    }catch{}
  }
  function selectProject(row:Entry){
    void run(async()=>{if(dirty)await persist();await openProject(row);});
  }
  useEffect(()=>{
    let active=true;
    setBusy(true);
    const request=versionId?api("studio-version/"+versionId):api("studio");
    request.then(result=>{
      if(!active)return;
      if(versionId){setSnapshot(result.version);setLinkedRefs({quoteId:result.quoteId,orderId:result.orderId});setFiles(result.files);setVersions([result.version]);if(result.project)cleanProject(result.project);loadDesign(result.version.body.design);}
      else setProjects(result);
    }).catch(error=>{if(active)report(error);}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[versionId]);
  useEffect(()=>{
    let active=true;
    const display=canvas.current;
    if(!display)return;
    const buffer=document.createElement("canvas");
    buffer.width=display.width;buffer.height=display.height;
    paintStudio(buffer,design,view,{mock:mock||design.mode==="Logotipos",guides,bleed:design.mode==="Sublimação total"&&!mock&&guides,shoulder,selected:layer?.id,product:product?.body.category??product?.body.name,strict:true})
      .then(()=>{if(active){const ctx=display.getContext("2d");ctx?.clearRect(0,0,display.width,display.height);ctx?.drawImage(buffer,0,0);setRenderError("");}})
      .catch(error=>{if(active)setRenderError(error.message);});
    return()=>{active=false;};
  },[design,view,mock,guides,shoulder,selected,product,project?.id,snapshot?.id]);
  useEffect(()=>{
    let active=true;
    lowResolution(panel,dpi,new Set(panel.layers.map(item=>item.file))).then(items=>{if(active)setWarnings(items);}).catch(()=>{if(active)setWarnings([]);});
    return()=>{active=false;};
  },[panel,dpi]);
  useEffect(()=>{
    if(!dirty||busy||error||!design.name.trim()||drag.current)return;
    const timer=setTimeout(()=>{void run(async()=>{await persist();});},1600);
    return()=>clearTimeout(timer);
  },[dirty,design,busy,error,project?.rev,revision]);
  useEffect(()=>{
    if(!project||snapshot)return;
    try{
      if(dirty)sessionStorage.setItem(draftKey(project.id),JSON.stringify({rev:project.rev,design}));
      else sessionStorage.removeItem(draftKey(project.id));
    }catch{}
  },[project?.id,project?.rev,design,dirty,snapshot]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();};
    window.addEventListener("beforeunload",warn);
    return()=>window.removeEventListener("beforeunload",warn);
  },[dirty]);
  function commit(next:Design){
    history.current.past=[...history.current.past.slice(-39),design];history.current.future=[];
    setRevision(value=>value+1);setDesign(next);setError("");
  }
  function undo(redo=false){
    const from=redo?history.current.future:history.current.past;
    const to=redo?history.current.past:history.current.future;
    const next=from.pop();if(!next)return;to.push(design);setDesign(next);setRevision(value=>value+1);
  }
  function editPanel(change:Partial<Panel>){
    const next={...panel,...change};
    next.margin=Math.min(next.margin,Math.floor((Math.min(next.width,next.height)-.1)*5)/10);
    commit({...design,panels:{...design.panels,[view]:next}});
  }
  function editLayer(change:Partial<Layer>){
    if(!layer)return;
    editPanel({layers:panel.layers.map(item=>item.id===selected?{...item,...change}:item)});
  }
  function reorder(direction:number){
    const items=[...panel.layers],index=items.findIndex(item=>item.id===selected),next=index+direction;
    if(index<0||next<0||next>=items.length)return;
    [items[index],items[next]]=[items[next],items[index]];
    editPanel({layers:items});
  }
  function fitPlacement(choice:typeof placements[number],aspect:number,maxHeight=1):Partial<Layer>{
    const h=Math.min(maxHeight,choice.w*panel.width/(aspect*panel.height));
    return {x:choice.x,y:choice.y,w:Math.max(.01,Math.min(choice.w,h*aspect*panel.height/panel.width)),h:Math.max(.01,h)};
  }
  async function addLayer(file?:StudioFile){
    if(panel.layers.length>=30)throw new Error("Este painel aceita até 30 camadas.");
    const image=file?await loadStudioImage(file.id):null;
    const aspect=image?image.naturalWidth/image.naturalHeight:3;
    const preferred=placements[shoulder?1:view==="front"?4:view==="back"?2:0];
    const next:Layer={id:crypto.randomUUID(),kind:file?"image":"text",file:file?.id??"",text:file?"":"Seu texto",color:"#13233b",
      x:.5,y:.5,w:.38,h:.13,angle:0,opacity:1,locked:false,fit:"contain",
      ...fitPlacement(preferred,aspect,shoulder?.21:.58)};
    editPanel({layers:[...panel.layers,next]});setSelected(next.id);
  }
  async function persist(){
    if(!project||snapshot||!dirty)return project;
    const next=await api("studio/"+project.id,"PUT",{rev:project.rev,design});
    cleanProject(next);setProjects(items=>items.map(item=>item.id===next.id?next:item));return next as Entry;
  }
  async function createProject(event:FormEvent){
    event.preventDefault();
    await run(async()=>{
      const panels=await api("studio-model/"+design.product);
      const row=await api("studio","POST",{client,design:panels?{...design,panels}:design});
      await openProject(row);await refreshProjects();
    });
  }
  function newProject(){
    void run(async()=>{if(dirty)await persist();setProject(null);setSnapshot(null);setFiles([]);setVersions([]);setClient(clients[0]?.id??0);loadDesign(initialDesign(products[0]));setCreating(true);});
  }
  async function upload(items:FileList|File[],apply=false){
    if(!project||!items.length)return;
    await run(async()=>{
      if(apply&&panel.layers.length>=30)throw new Error("Este painel aceita até 30 camadas.");
      const form=new FormData();form.set("category","Outro");form.set("note","Original do Estúdio de Personalização");
      for(const file of Array.from(items))form.append("files",file);
      const uploaded=await api("record/"+project.id+"/files","POST",form) as StudioFile[];
      setFiles(previous=>[...uploaded,...previous]);
      if(apply&&uploaded[0]&&rasterTypes.includes(uploaded[0].type)){
        await addLayer(uploaded[0]);
        notify("Imagem aplicada em "+area.label.toLocaleLowerCase("pt-BR")+".");
      }else notify("Arquivos originais guardados na biblioteca.");
    });
  }
  async function saveVersion(){
    const row=await persist();
    if(!row)throw new Error("Selecione um projeto.");
    const savedDesign=row.body.design as Design;
    const preview=document.createElement("canvas");
    preview.width=1200;preview.height=1040;
    const ctx=preview.getContext("2d");
    if(!ctx)throw new Error("Não foi possível gerar a prévia da versão.");
    ctx.fillStyle="#f3f6fa";ctx.fillRect(0,0,1200,1040);
    ctx.fillStyle="#14233a";ctx.font="bold 27px Arial";ctx.fillText(savedDesign.name,30,42,1130);
    ctx.font="16px Arial";ctx.fillText("Prévia visual · "+company,30,66);
    for(const [index,key] of views.entries()){
      const p=savedDesign.panels[key];
      const box=document.createElement("canvas");
      const scale=Math.min(530/p.width,420/p.height);
      box.width=Math.round(p.width*scale);box.height=Math.round(p.height*scale);
      await paintStudio(box,savedDesign,key,{mock:true,strict:true,product:product?.body.category??product?.body.name});
      const x=20+index%2*600,y=92+Math.floor(index/2)*472;
      ctx.fillStyle="#fff";ctx.fillRect(x,y,560,452);
      ctx.fillStyle="#14233a";ctx.font="16px Arial";ctx.fillText(viewNames[key],x+12,y+22);
      ctx.drawImage(box,x+(560-box.width)/2,y+26+(420-box.height)/2);
    }
    const form=new FormData();form.set("rev",String(row.rev));form.set("preview",await canvasBlob(preview),"previa.png");
    const result=await api("studio/"+row.id+"/version","POST",form);
    cleanProject(result.project);setVersions(items=>[result.version,...items]);
    setProjects(items=>items.map(item=>item.id===row.id?result.project:item));
    return {row:result.project as Entry,version:result.version as Entry};
  }
  async function useVersion(){
    if(project&&current&&!dirty&&JSON.stringify(current.body.design)===JSON.stringify(design))return {row:project,version:current};
    return saveVersion();
  }
  async function requestQuote(){
    await run(async()=>{
      if(quantity<minimum)throw new Error("Informe ao menos "+minimum+" peças na grade para solicitar o orçamento.");
      const {row,version}=await useVersion();
      const quote=await api("studio/"+row.id+"/quote","POST",{versionId:version.id});
      notify("Orçamento vinculado à versão "+version.body.version+".");
      openQuote(quote.id);
    });
  }
  async function decision(status:string){
    await run(async()=>{
      const selection=status===studioStatuses[1]?await useVersion():project&&snapshot&&snapshot.body.version===project.body.current?{row:project,version:snapshot}:null;
      if(!selection)throw new Error("Salve uma versão para continuar.");
      const {row,version}=selection;
      const next=await api("studio/"+row.id+"/decision","PUT",{rev:row.rev,versionId:version.id,status,note});
      cleanProject(next);
      const updated=await api("studio/"+row.id+"/versions") as Entry[];
      setVersions(updated);if(snapshot)setSnapshot(updated.find(item=>item.id===snapshot.id)??snapshot);
      setProjects(items=>items.map(item=>item.id===row.id?next:item));setNote("");
      setActivity(await api("record/"+row.id+"/history"));
    });
  }
  function startDrag(event:PointerEvent<HTMLCanvasElement>){
    if(snapshot||busy)return;
    const box=event.currentTarget.getBoundingClientRect();
    const offset=bleedPreview?panel.bleed:0;
    const x=((event.clientX-box.left)/box.width*screenWidth-offset)/panel.width;
    const y=((event.clientY-box.top)/box.height*screenHeight-offset)/panel.height;
    const hit=[...panel.layers].reverse().find(item=>{
      const width=box.width*panel.width/screenWidth,height=box.height*panel.height/screenHeight;
      const a=-item.angle*Math.PI/180,dx=(x-item.x)*width,dy=(y-item.y)*height;
      return Math.abs(dx*Math.cos(a)-dy*Math.sin(a))<=item.w*width/2&&Math.abs(dx*Math.sin(a)+dy*Math.cos(a))<=item.h*height/2;
    });
    if(!hit){setSelected("");return;}
    setSelected(hit.id);
    if(hit.locked)return;
    drag.current={pointer:event.pointerId,initial:design,id:hit.id,dx:x-hit.x,dy:y-hit.y};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event:PointerEvent<HTMLCanvasElement>){
    const active=drag.current;if(!active||event.pointerId!==active.pointer)return;
    const box=event.currentTarget.getBoundingClientRect();
    const offset=bleedPreview?panel.bleed:0;
    const x=Math.min(1,Math.max(0,((event.clientX-box.left)/box.width*screenWidth-offset)/panel.width-active.dx));
    const y=Math.min(1,Math.max(0,((event.clientY-box.top)/box.height*screenHeight-offset)/panel.height-active.dy));
    setDesign(previous=>({...previous,panels:{...previous.panels,[view]:{...previous.panels[view],layers:previous.panels[view].layers.map(item=>item.id===active.id?{...item,x,y}:item)}}}));
  }
  function endDrag(){
    const active=drag.current;
    if(active&&active.initial!==design){history.current.past=[...history.current.past.slice(-39),active.initial];history.current.future=[];setRevision(value=>value+1);}
    drag.current=null;
  }
  async function exportPanel(production:boolean){
    await run(async()=>{
      const chosen=production?linkedVersion?.body.design as Design|undefined:design;
      if(!chosen)throw new Error("Salve uma versão antes de exportar para produção.");
      const dimensions=production?pixelSize(chosen.panels[view],dpi,true):{width:1000,height:Math.round(1000*panel.height/panel.width)};
      if(dimensions.width*dimensions.height>32000000||Math.max(dimensions.width,dimensions.height)>8192)throw new Error("Reduza o DPI para exportar este painel. Limite de 32 megapixels e 8192 px por lado.");
      const output=document.createElement("canvas");output.width=dimensions.width;output.height=dimensions.height;
      await paintStudio(output,chosen,view,{mock:!production,bleed:production,strict:true,product:product?.body.category??product?.body.name});
      const blob=await canvasBlob(output);
      const file=production?await pngWithDpi(blob,dpi):blob;
      saveFile(new File([file],`${production?"painel":"previa"}-${view}-${production?dpi+"dpi":"visual"}.png`,{type:"image/png"}));
    });
  }
  async function technicalSheet(){
    await run(async()=>{
      if(!linkedVersion)throw new Error("Salve uma versão antes de gerar a ficha.");
      const draft=linkedVersion.body.design as Design;
      const lines=[`Projeto #${linkedVersion.body.project} · versão ${linkedVersion.body.version}`,
        ...(snapshot&&linkedRefs.quoteId?["Orçamento "+code("quote",linkedRefs.quoteId)]:[]),
        ...(snapshot&&linkedRefs.orderId?["Pedido "+code("order",linkedRefs.orderId)]:[]),
        `Situação: ${linkedVersion.body.status}`,`Produto: ${products.find(p=>p.id===draft.product)?.body.name??draft.product}`,
        `Cor: ${draft.color} · tecido: ${draft.fabric||"a definir"} · ${draft.mode}`,
        "Grade: "+draft.sizes.filter(s=>s.qty).map(s=>s.size+" × "+s.qty).join(", "),
        ...views.flatMap(key=>{
          const p=draft.panels[key];
          const px=pixelSize(p,dpi,true);
          return [`${viewNames[key]}: ${p.width} × ${p.height} cm · margem ${p.margin} cm · sangria ${p.bleed} cm`,
            `${px.width} × ${px.height} px a ${dpi} DPI (com sangria)`,
            ...p.layers.map(item=>`${item.kind==="text"?item.text:files.find(f=>f.id===item.file)?.name??item.file} · posição ${Math.round(item.x*100)}%, ${Math.round(item.y*100)}% · ${(item.w*p.width).toFixed(1)} × ${(item.h*p.height).toFixed(1)} cm · ${item.angle}°`)];
        })];
      if(linkedVersion.body.approval)lines.push("Aprovação: "+linkedVersion.body.approval.actor+" · "+linkedVersion.body.approval.at);
      saveFile(await pdf("ficha-personalizacao.pdf",draft.name,company,lines));
    });
  }
  const editing=!!project&&!snapshot;
  const artwork=hasArtwork(design);
  const quantity=design.sizes.reduce((count,size)=>count+size.qty,0);
  const minimum=Number(product?.body.min??1);
  const state=snapshot?.body.status??project?.body.status??studioStatuses[0];
  const statusOptions=staff
    ? ({"Arte enviada para análise":["Aguardando aprovação","Correção solicitada"],"Aguardando aprovação":["Arte aprovada","Correção solicitada"],"Arte aprovada":["Liberada para produção"]} as Record<string,string[]>)[state]??[]
    : state==="Aguardando aprovação"?["Arte aprovada","Correção solicitada"]:[];
  const statusLabel=(status:string)=>status==="Arte aprovada"?"Aprovar arte":status==="Correção solicitada"?"Solicitar alteração":status==="Aguardando aprovação"?"Enviar para aprovação":status;
  const contact=clients.find(item=>item.id===project?.client)?.body;
  const phone=whatsappNumber(contact?.whatsapp)||whatsappNumber(contact?.phone);
  const defaultMessage=`Olá, ${contact?.name??"tudo bem"}! Aqui é da ${company}. A personalização “${design.name}” está na etapa: ${state}.`;
  const pixel=pixelSize(panel,dpi,true);
  const bleedPreview=design.mode==="Sublimação total"&&!mock&&guides;
  const screenWidth=panel.width+(bleedPreview?panel.bleed*2:0);
  const screenHeight=panel.height+(bleedPreview?panel.bleed*2:0);
  const canvasWidth=Math.round(680*Math.min(1,screenWidth/screenHeight));
  const canvasHeight=Math.round(680*Math.min(1,screenHeight/screenWidth));
  return <div className="studio" data-history={revision}>
    {error&&<div className="studio-error" role="alert">{error}</div>}
    {!project&&!snapshot&&<section className="card studio-card">
      <div className="studio-toolbar"><h2>Projetos de personalização</h2><Button primary disabled={busy||!clients.length||!products.length} onClick={newProject}><Plus size={16}/> Novo projeto</Button></div>
      {busy&&<p role="status">Carregando…</p>}
      {(!clients.length||!products.length)&&<div className="studio-setup">
        <p>Para criar um projeto, é necessário ter um cliente e um produto cadastrados.</p>
        <div className="studio-actions">
          {!clients.length&&createClient&&<Button onClick={createClient}>Cadastrar cliente</Button>}
          {!products.length&&createProduct&&<Button onClick={createProduct}>Cadastrar produto</Button>}
        </div>
      </div>}
      {creating&&<form className="studio-form" onSubmit={createProject}>
        <label className="field"><span>Nome do projeto</span><input required maxLength={100} value={design.name} onChange={e=>setDesign({...design,name:e.target.value})}/></label>
        <label className="field"><span>Cliente</span><select required value={client||""} onChange={e=>setClient(Number(e.target.value))}><option value="">Selecione</option>{clients.map(row=><option key={row.id} value={row.id}>{row.body.name}</option>)}</select></label>
        <label className="field"><span>Produto</span><select required value={design.product||""} onChange={e=>setDesign({...design,product:Number(e.target.value),fabric:products.find(row=>row.id===Number(e.target.value))?.body.fabric??""})}><option value="">Selecione</option>{products.map(row=><option key={row.id} value={row.id}>{row.body.name}</option>)}</select></label>
        <label className="field"><span>Modalidade</span><select value={design.mode} onChange={e=>setDesign({...design,mode:e.target.value as Design["mode"]})}>{studioModes.map(mode=><option key={mode} value={mode}>{modeLabel(mode)}</option>)}</select></label>
        <button type="submit" className="btn primary" disabled={busy||!client||!design.product}>Criar projeto</button>
      </form>}
      {!projects.length&&!creating&&!busy&&<p>Nenhum projeto salvo. Crie um para começar.</p>}
      {!!projects.length&&<label className="field studio-filter"><span>Filtrar projetos por etapa</span><select value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}><option value="">Todas as etapas</option>{studioStatuses.map(status=><option key={status}>{status}</option>)}</select></label>}
      <div className="studio-projects">{projects.filter(row=>!projectFilter||row.body.status===projectFilter).map(row=><button type="button" key={row.id} className="studio-project" disabled={busy} onClick={()=>selectProject(row)}>
        <strong>{row.body.design.name}</strong><span>{modeLabel(row.body.design.mode)} · {row.body.status}</span><small>Atualizado em {dateBR(row.updated)}</small><ArrowRight size={16}/>
      </button>)}</div>
    </section>}
    {(project||snapshot)&&<>
      <section className="card studio-card">
        <div className="studio-toolbar">
          <div><h2>{design.name}</h2><p>{snapshot?`Versão ${snapshot.body.version} · ${state}`:state}</p></div>
          <div className="studio-actions">
            {versionId?<Button disabled={busy} onClick={()=>run(async()=>{if(dirty)await persist();back();})}><ArrowLeft size={16}/> Voltar ao registro</Button>:project&&<Button disabled={busy} onClick={()=>run(async()=>{if(dirty)await persist();setProject(null);setSnapshot(null);setCreating(false);await refreshProjects();})}><ArrowLeft size={16}/> Projetos</Button>}
            {project&&snapshot&&<Button disabled={busy} onClick={()=>selectProject(project)}>Continuar editando</Button>}
            {editing&&<>
              <Button disabled={busy||!dirty} onClick={()=>run(async()=>{await persist();notify("Projeto salvo.");})}><Save size={16}/> Salvar projeto</Button>
              <Button primary disabled={busy||!artwork||Boolean(renderError)} onClick={()=>run(async()=>{const result=await saveVersion();notify("Versão "+result.version.body.version+" salva.");})}>Salvar versão da arte</Button>
            </>}
          </div>
        </div>
        {editing&&<p className="studio-save" role="status">{busy?"Processando…":dirty?"Alterações pendentes":"Projeto salvo no servidor"}{current?` · Versão salva ${current.body.version}`:""}{current&&JSON.stringify(current.body.design)!==JSON.stringify(design)?" · O rascunho difere da versão salva":""}</p>}
        {snapshot?.body.previewId&&<a className="btn secondary" href={studioFileUrl(snapshot.body.previewId)} download><Download size={15}/> Baixar prévia salva</a>}
        {snapshot?.body.approval&&<p>Versão aprovada em {new Date(snapshot.body.approval.at).toLocaleString("pt-BR")} por {snapshot.body.approval.actor}.</p>}
        {editing&&<fieldset className="studio-form" disabled={busy}>
          <label className="field"><span>Nome</span><input maxLength={100} value={design.name} onChange={e=>commit({...design,name:e.target.value})}/></label>
          <label className="field"><span>Produto</span><select value={design.product} onChange={e=>commit({...design,product:Number(e.target.value),fabric:products.find(row=>row.id===Number(e.target.value))?.body.fabric??""})}>{products.map(row=><option value={row.id} key={row.id}>{row.body.name}</option>)}</select></label>
          <label className="field"><span>Modalidade</span><select value={design.mode} onChange={e=>{commit({...design,mode:e.target.value as Design["mode"]});setMock(false);}}>{studioModes.map(mode=><option key={mode} value={mode}>{modeLabel(mode)}</option>)}</select></label>
          {design.mode==="Logotipos"&&<label className="field"><span>Cor da camiseta</span><input type="color" value={design.color} onChange={e=>commit({...design,color:e.target.value})}/></label>}
          <label className="field"><span>Tecido</span><input maxLength={300} value={design.fabric} onChange={e=>commit({...design,fabric:e.target.value})}/></label>
        </fieldset>}
      </section>
      <div className="studio-grid">
        <section className="card studio-card studio-stage">
          <h3>Área da camiseta</h3>
          <div className="studio-toolbar">
            <div className="studio-tabs" role="group" aria-label="Áreas da camiseta">
              {studioAreas.map(item=><button key={item.id} type="button" className={item.id===areaId?"btn primary":"btn secondary"} aria-pressed={item.id===areaId} disabled={busy} onClick={()=>{setArea(item.id);setSelected("");}}>{item.label}</button>)}
            </div>
            {editing&&<div className="studio-actions"><Button disabled={!history.current.past.length||busy} onClick={()=>undo()}><Undo2 size={15}/> Desfazer</Button><Button disabled={!history.current.future.length||busy} onClick={()=>undo(true)}><Redo2 size={15}/> Refazer</Button></div>}
          </div>
          <div className="studio-canvas-controls">
            {design.mode==="Sublimação total"&&<Button onClick={()=>setMock(value=>!value)}>{mock?"Editar painel plano":"Ver prévia na camiseta"}</Button>}
            <label><input type="checkbox" checked={guides} onChange={e=>setGuides(e.target.checked)}/> Guias</label>
            <Numeric label="Zoom (%)" min={50} max={200} step={10} value={zoom} change={setZoom}/>
          </div>
          <p className="hint">{area.label} · {mock||design.mode==="Logotipos"?"Prévia 2D":`Painel plano ${panel.width} × ${panel.height} cm · sangria ${panel.bleed} cm`}</p>
          {bleedPreview&&<div className="studio-ruler" aria-label="Régua horizontal em centímetros">{[0,.25,.5,.75,1].map(tick=><span key={tick}>{Number((screenWidth*tick).toFixed(1))} cm</span>)}</div>}
          <div className="studio-canvas-frame"><canvas ref={canvas} width={canvasWidth} height={canvasHeight} style={{width:`${zoom}%`,maxWidth:Math.round(canvasWidth*zoom/100)}} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} aria-label={area.label+" da camiseta"}/></div>
          {renderError&&<p className="error-text">{renderError}</p>}
          <div className="studio-actions">
            <Button disabled={busy} onClick={()=>exportPanel(false)}><Download size={15}/> Baixar prévia PNG</Button>
            {admin&&linkedVersion&&<><Button disabled={busy} onClick={()=>exportPanel(true)}><Download size={15}/> Exportar painel da versão {linkedVersion.body.version}</Button><Button disabled={busy} onClick={technicalSheet}>Ficha técnica PDF</Button></>}
          </div>
          {admin&&<div className="studio-export"><Numeric label="DPI de exportação" min={72} max={600} value={dpi} change={value=>setDpi(Math.round(value))}/><p>{pixel.width} × {pixel.height} px com sangria</p></div>}
          {!!warnings.length&&<div className="studio-error">{warnings.map((warning,index)=><p key={index}>{files.find(f=>f.id===warning.file)?.name??"Imagem"} · {warning.dpi} DPI efetivos nesta aplicação. Abaixo dos {dpi} DPI selecionados.</p>)}</div>}
        </section>
        <section className="card studio-card">
          <h3><Layers size={16}/> Arte de {area.label.toLocaleLowerCase("pt-BR")}</h3>
          {shoulder&&<p className="hint">O ombro ocupa a parte superior do painel da {viewNames[view].toLowerCase()}.</p>}
          {editing&&<div className="studio-apply">
            <Button primary disabled={busy||panel.layers.length>=30} onClick={()=>quickFile.current?.click()}><ImagePlus size={16}/> Enviar e aplicar imagem</Button>
            <input ref={quickFile} type="file" accept=".png,.jpg,.jpeg,.webp" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file)void upload([file],true);}}/>
            <p className="hint">PNG, JPG ou WEBP até 25 MB. Para PDF ou SVG, use a biblioteca abaixo.</p>
          </div>}
          {editing&&design.mode==="Sublimação total"&&<details key={view} className="studio-panel-settings">
            <summary>Medidas e fundo do painel</summary>
            <fieldset className="studio-form" disabled={busy}>
            <Numeric label="Largura (cm)" value={panel.width} min={5} max={300} step={.1} change={width=>editPanel({width})}/>
            <Numeric label="Altura (cm)" value={panel.height} min={5} max={300} step={.1} change={height=>editPanel({height})}/>
            <Numeric label="Margem (cm)" value={panel.margin} min={0} max={20} step={.1} change={margin=>editPanel({margin})}/>
            <Numeric label="Sangria (cm)" value={panel.bleed} min={0} max={10} step={.1} change={bleed=>editPanel({bleed})}/>
            <label className="field"><span>Fundo</span><input type="color" value={panel.color} onChange={e=>editPanel({color:e.target.value})}/></label>
            <label className="field"><span>Degradê</span><input type="color" value={panel.gradient||panel.color} onChange={e=>editPanel({gradient:e.target.value})}/></label>
            {panel.gradient&&<Button onClick={()=>editPanel({gradient:""})}>Remover degradê</Button>}
            <label className="field"><span>Padrão</span><select value={panel.pattern} onChange={e=>editPanel({pattern:e.target.value as Panel["pattern"]})}><option value="none">Sem padrão</option><option value="stripes">Listras</option><option value="dots">Pontos</option></select></label>
            </fieldset>
          </details>}
          {editing&&admin&&design.mode==="Sublimação total"&&<div className="studio-actions">
            <Button disabled={busy} onClick={()=>run(async()=>{await api("studio-model/"+design.product,"PUT",design.panels);notify("Medidas salvas para novos projetos deste produto.");})}>Salvar medidas do modelo</Button>
            <Button disabled={busy} onClick={()=>run(async()=>{const model=await api("studio-model/"+design.product);if(!model)throw new Error("Este produto ainda não tem medidas cadastradas.");commit({...design,panels:Object.fromEntries(views.map(key=>[key,{...model[key],layers:design.panels[key].layers}])) as Design["panels"]});})}>Usar medidas cadastradas</Button>
          </div>}
          {editing&&<Button disabled={busy} onClick={()=>run(async()=>{await addLayer();})}><Plus size={15}/> Adicionar texto</Button>}
          <div className="studio-layers">{[...panel.layers].reverse().map(item=><Button key={item.id} primary={item.id===selected} onClick={()=>setSelected(item.id)}>{item.locked?"Bloqueada · ":""}{item.kind==="text"?item.text:files.find(file=>file.id===item.file)?.name??"Imagem"}</Button>)}</div>
          {!panel.layers.length&&<p className="hint">Envie uma imagem ou adicione texto para começar.</p>}
          {editing&&layer&&<>
            <div className="studio-actions"><Button disabled={busy} onClick={()=>editLayer({locked:!layer.locked})}>{layer.locked?"Desbloquear":"Bloquear"}</Button><Button disabled={busy||layer.locked||panel.layers.length>=30} onClick={()=>{const copy={...layer,id:crypto.randomUUID(),x:Math.min(1,layer.x+.03)};editPanel({layers:[...panel.layers,copy]});setSelected(copy.id);}}>Duplicar</Button><Button disabled={busy||layer.locked} onClick={()=>{editPanel({layers:panel.layers.filter(item=>item.id!==layer.id)});setSelected("");}}>Excluir camada</Button></div>
            <fieldset key={layer.id} disabled={layer.locked||busy} className="studio-form">
              {layer.kind==="text"&&<><label className="field"><span>Texto</span><input maxLength={140} value={layer.text} onChange={e=>editLayer({text:e.target.value})}/></label><label className="field"><span>Cor do texto</span><input type="color" value={layer.color} onChange={e=>editLayer({color:e.target.value})}/></label></>}
              <label className="field"><span>Posição predefinida</span><select value="" onChange={event=>{
                if(!event.target.value)return;
                const choice=placements[Number(event.target.value)];
                const aspect=layer.w*panel.width/(layer.h*panel.height);
                editLayer(fitPlacement(choice,aspect,choice.name.startsWith("Ombro")?.21:.66));
              }}><option value="">Escolher posição</option>{placements.map((choice,index)=><option key={choice.name} value={index}>{choice.name}</option>)}</select></label>
              <Numeric label="Horizontal (%)" min={0} max={100} value={Math.round(layer.x*100)} change={x=>editLayer({x:x/100})}/>
              <Numeric label="Vertical (%)" min={0} max={100} value={Math.round(layer.y*100)} change={y=>editLayer({y:y/100})}/>
              <Numeric label="Largura (%)" min={1} max={500} value={Math.round(layer.w*100)} change={w=>editLayer({w:w/100})}/>
              <Numeric label="Altura (%)" min={1} max={500} value={Math.round(layer.h*100)} change={h=>editLayer({h:h/100})}/>
              <Numeric label="Rotação (°)" min={-360} max={360} value={layer.angle} change={angle=>editLayer({angle})}/>
              <Numeric label="Opacidade (%)" min={0} max={100} value={Math.round(layer.opacity*100)} change={opacity=>editLayer({opacity:opacity/100})}/>
              {layer.kind==="image"&&<label className="field"><span>Ajuste da imagem</span><select value={layer.fit} onChange={e=>editLayer({fit:e.target.value as Layer["fit"]})}><option value="contain">Manter imagem inteira</option><option value="cover">Recortar para preencher</option></select></label>}
              {layer.kind==="image"&&design.mode==="Sublimação total"&&<Button onClick={()=>editLayer({x:.5,y:.5,w:1+2*panel.bleed/panel.width,h:1+2*panel.bleed/panel.height,angle:0,fit:"cover"})}>Cobrir painel</Button>}
              <Button onClick={()=>editLayer({x:.5,y:.5})}>Centralizar</Button><Button onClick={()=>reorder(1)}>Trazer à frente</Button><Button onClick={()=>reorder(-1)}>Enviar para trás</Button>
            </fieldset>
          </>}
        </section>
      </div>
      <section className="card studio-card">
        <h3><ImagePlus size={16}/> Biblioteca de imagens</h3>
        {editing&&<label className="studio-upload" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void upload(e.dataTransfer.files);}}>
          <Upload size={20}/><strong>Arraste os arquivos ou clique para escolher</strong><span>PNG, JPG, WEBP, SVG e PDF · até 25 MB por arquivo</span>
          <input type="file" accept=".png,.jpg,.jpeg,.webp,.svg,.pdf" multiple disabled={busy} onChange={e=>{if(e.target.files)void upload(Array.from(e.target.files));e.target.value="";}}/>
        </label>}
        <div className="studio-assets">{files.map(file=><article key={file.id}>
          {rasterTypes.includes(file.type)?<img src={studioFileUrl(file.id,true)} alt="" loading="lazy"/>:<span className="studio-file-format">{file.name.split(".").pop()?.toUpperCase()} original</span>}
          <strong title={file.name}>{file.name}</strong>
          {rename?.id===file.id&&<input aria-label="Novo nome do arquivo" maxLength={180} value={rename.name} onChange={e=>setRename({id:file.id,name:e.target.value})}/>}
          <div className="studio-actions">
            <a className="btn secondary" href={studioFileUrl(file.id)} download>Baixar original</a>
            {editing&&rasterTypes.includes(file.type)&&<Button disabled={busy} onClick={()=>run(async()=>{await addLayer(file);})}>Aplicar em {area.label.toLowerCase()}</Button>}
            {editing&&project&&["image/svg+xml","application/pdf"].includes(file.type)&&<>
              {file.type==="application/pdf"&&<Numeric label="Página do PDF" min={1} max={9999} value={pdfPages[file.id]??1} change={page=>setPdfPages(previous=>({...previous,[file.id]:page}))}/>}
              <Button disabled={busy} onClick={()=>run(async()=>{
                const isPdf=file.type==="application/pdf";
                const image=isPdf
                  ? await (await import("../lib/studio-pdf")).pdfPreview(file.id,file.name,pdfPages[file.id]??1)
                  : await svgPreview(file.id,file.name);
                const form=new FormData();form.set("category","Outro");form.set("note","Cópia PNG do "+(isPdf?"PDF ":"SVG ")+file.id);form.append("files",image);
                const [created]=await api("record/"+project.id+"/files","POST",form);
                setFiles(await api("studio/"+project.id+"/library"));await addLayer(created);
              })}>Converter e aplicar {file.type==="application/pdf"?"PDF":"SVG"}</Button>
            </>}
            {editing&&project&&<><Button disabled={busy} onClick={()=>rename?.id===file.id?run(async()=>{await api("studio/"+project.id+"/library","PUT",rename);setFiles(await api("studio/"+project.id+"/library"));setRename(null);}):setRename({id:file.id,name:file.name})}>{rename?.id===file.id?"Salvar nome":"Renomear"}</Button>
              <Button disabled={busy} onClick={()=>run(async()=>{await api("studio/"+project.id+"/library","PUT",{id:file.id,archive:true});setFiles(await api("studio/"+project.id+"/library"));})}>Retirar da biblioteca</Button></>}
          </div>
        </article>)}</div>
        {editing&&files.some(file=>file.type==="application/pdf"||file.type==="image/svg+xml")&&<p className="hint">O editor converte a página escolhida do PDF ou o SVG compatível em uma camada PNG. Os originais permanecem disponíveis.</p>}
      </section>
      {snapshot&&project&&snapshot.body.version===project.body.current&&!!statusOptions.length&&<section className="card studio-card">
        <h3>Decisão sobre a versão {snapshot.body.version}</h3>
        <label className="field"><span>Observação da aprovação ou correção</span><textarea maxLength={5000} value={note} onChange={e=>setNote(e.target.value)}/></label>
        <div className="studio-actions">{statusOptions.map(status=><Button key={status} primary={status==="Arte aprovada"} disabled={busy||Boolean(renderError)||status==="Correção solicitada"&&!note.trim()} onClick={()=>decision(status)}>{statusLabel(status)}</Button>)}</div>
      </section>}
      {staff&&snapshot?.body.approval&&project&&snapshot.body.version===project.body.current&&<section className="card studio-card">
        <Button disabled={busy} onClick={()=>run(async()=>{
          const linked=await api("studio/"+project.id+"/link","POST",{versionId:snapshot.id});
          notify("Versão aprovada vinculada.");openQuote(linked.quote);
        })}>Vincular versão aprovada ao orçamento ou pedido</Button>
      </section>}
      {editing&&project&&<section className="card studio-card">
        <h3>Grade e orçamento</h3>
        <p className="hint">Informe as quantidades. Ao gerar o pedido pelo orçamento aprovado, a versão da arte segue vinculada.</p>
        <p>{quantity} peças · mínimo do produto {minimum}</p>
        <fieldset disabled={busy} className="studio-sizes">{design.sizes.map((size,index)=><Numeric key={size.size} label={size.size} min={0} max={100000} value={size.qty} change={qty=>commit({...design,sizes:design.sizes.map((entry,i)=>i===index?{...entry,qty}:entry)})}/>)}</fieldset>
        <div className="studio-actions">
          <Button primary disabled={busy||!artwork||quantity<minimum||Boolean(renderError)} onClick={requestQuote}>Solicitar orçamento com a arte</Button>
          <Button disabled={busy||!artwork||Boolean(renderError)||state===studioStatuses[1]&&!dirty} onClick={()=>decision(studioStatuses[1])}>Enviar para análise</Button>
          <Button disabled={busy} onClick={()=>run(async()=>{
            const copy=await api("studio","POST",{client:project.client,design:{...design,name:(design.name+" · cópia").slice(0,100)}});
            await openProject(copy);await refreshProjects();
          })}>Duplicar projeto</Button>
          <Button disabled={busy} onClick={()=>setConfirmArchive(value=>!value)}>Excluir projeto da lista</Button>
        </div>
        {confirmArchive&&<div className="studio-actions"><p>Arquivar o projeto e preservar as versões vinculadas a pedidos?</p><Button disabled={busy} onClick={()=>run(async()=>{await api("studio/"+project.id,"DELETE",{rev:project.rev});setProject(null);await refreshProjects();})}>Confirmar arquivamento</Button></div>}
        {project.body.note&&<p className="studio-error">{project.body.note}</p>}
        {staff&&<div className="studio-communication"><label className="field"><span>Mensagem para o cliente</span><textarea value={message??defaultMessage} onChange={e=>setMessage(e.target.value)}/></label>
          {phone?<a className="btn secondary" href={`https://wa.me/${phone}?text=${encodeURIComponent(message??defaultMessage)}`} target="_blank" rel="noopener noreferrer" onClick={()=>{void api("studio/"+project.id+"/contact","POST").then(()=>api("record/"+project.id+"/history")).then(setActivity).catch(report);}}>Abrir mensagem no WhatsApp</a>:<p>Cadastre o telefone com DDD para compartilhar.</p>}
        </div>}
        <h3>Versões salvas</h3>
        <div className="studio-actions">{versions.map(version=><Button key={version.id} disabled={busy} onClick={()=>run(async()=>{if(dirty)await persist();const result=await api("studio-version/"+version.id);setSnapshot(result.version);setLinkedRefs({quoteId:result.quoteId,orderId:result.orderId});setFiles(result.files);loadDesign(result.version.body.design);})}>Versão {version.body.version} · {version.body.status}</Button>)}</div>
        {!!activity.length&&<details className="studio-history"><summary>Histórico de alterações</summary><ul>{activity.map((event,index)=><li key={index}>{dateBR(event.at)} · {event.action}{event.detail?" · "+event.detail:""}</li>)}</ul></details>}
      </section>}
    </>}
  </div>;
}
