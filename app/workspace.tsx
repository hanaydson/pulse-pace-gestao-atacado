"use client";

import Studio from "./studio";
import OrderTracking from "./order-tracking";
import {orderFromTrackingPath,trackingPath} from "../lib/order-tracking";
import {useEffect,useState,type FormEvent,type ReactNode} from "react";
import {ArrowDownToLine,ArrowRight,ArrowUpRight,Bell,CalendarDays,ChartNoAxesCombined,Check,ChevronDown,ChevronLeft,ChevronRight,CircleDollarSign,ClipboardList,Clock3,FileText,FolderOpen,ImageIcon,LayoutDashboard,Menu,MessageCircle,Package,Plus,Search,Settings2,Shirt,Users,Workflow,X,Zap} from "lucide-react";
import {brl,categories,clientTypes,code,dateBR,fileCategories,availableQuoteActions,quoteCommercialError,quoteEditable,productionWhatsapp,whatsappNumber,roles,round,sizes,stages,today} from "../lib/atacado";
import {download,pdf,saveFile,workbook} from "../lib/export";

type Body=Record<string,any>;
type Row={id:number;kind:string;client:number|null;source:number|null;body:Body;rev:number;created:string;updated:string};
type Tier={min:number;max:number;price:number;product:number;fabric:string;personalization:string};
type Attachment={id:string;name:string;type:string;category:string;note:string;size:number;actor:string;created:string};
type State={me:{displayName:string;email:string;role:string};rows:Row[];photos:{id:string;parent:number}[];defaultTiers:number[][];orderContacts?:Record<number,string>};
const menu=[
  ["dashboard","Visão geral",LayoutDashboard],["clients","Clientes",Users],["catalog","Catálogo",Shirt],
  ["studio","Estúdio de Personalização",ImageIcon],["tiers","Preços de atacado",ClipboardList],["quotes","Orçamentos",FileText],["orders","Pedidos",Package],
  ["production","Produção",Workflow],["finance","Financeiro",CircleDollarSign],["reports","Relatórios",ChartNoAxesCombined],
  ["settings","Configurações",Settings2]
] as const;
const descriptions:Record<string,string>={
  studio:"Crie e acompanhe artes de camisetas, do primeiro rascunho à produção.",
  clients:"Cadastre, organize e acompanhe o histórico de seus clientes.",catalog:"Gerencie modelos, tecidos e imagens dos produtos.",
  tiers:"Configure faixas de quantidade e condições por produto.",quotes:"Acompanhe propostas e transforme aprovações em pedidos.",
  orders:"Acompanhe entregas, pagamentos e arquivos de cada pedido.",production:"Organize as etapas de produção e aprovação das artes.",
  finance:"Acompanhe parcelas, despesas e valores a receber.",reports:"Analise as vendas, a produção e o resultado dos pedidos.",
  settings:"Personalize a empresa e gerencie permissões de acesso."
};
const clientFields=[["name","Nome completo ou razão social"],["trade","Nome fantasia"],["document","CPF ou CNPJ"],["stateReg","Inscrição estadual"],["phone","Telefone"],["whatsapp","WhatsApp"],["email","E-mail"],["zip","CEP"],["address","Endereço"],["number","Número"],["district","Bairro"],["city","Cidade"],["state","Estado"],["contact","Responsável pelas compras"]];
const productFields=[["name","Nome do produto"],["fabric","Tecido"],["weight","Gramatura"],["colors","Cores disponíveis"],["sizes","Tamanhos disponíveis"]];
const number=(v:unknown)=>Number(v)||0;
const matches=(v:unknown,q:string)=>String(v??"").normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().includes(q.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase());
const fileURL=(id:string,preview=false)=>"/api/file/"+id+(preview?"?preview=1":"");
const companyDefault={name:"Pulse & Pace",logo:"",whatsapp:""};
const sum=(rows:Row[],key:string)=>round(rows.reduce((a,r)=>a+number(r.body[key]),0));
const endStage=stages.length-1;
const final=(r:Row)=>r.body.stage===endStage;
const getSaleDate=(r:Row)=>r.body.saleDate||r.created.slice(0,10);
const dueSoon=(r:Row)=>!final(r)&&r.body.due&&r.body.due<=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
const inProduction=(r:Row)=>r.body.stage>=7 && r.body.stage<=11;
const clientNav=["dashboard","clients","catalog","studio","quotes","orders","finance"];
const productionNav=["dashboard","catalog","orders","production"];
const initialLetters=(s:string)=>s.split(/\s+/).slice(0,2).map(p=>p[0]).join("").toUpperCase();

async function api(path:string,method="GET",body?:unknown):Promise<any>{
  const form=body instanceof FormData;
  const res=await fetch("/api/"+path,{method,body:body===undefined?undefined:form?body:JSON.stringify(body),
    headers:body===undefined||form?{}:{"Content-Type":"application/json"},cache:"no-store"});
  const data:any=await res.json().catch(()=>({error:"Resposta indisponível."}));
  if(!res.ok) throw Object.assign(new Error(data.error||"Falha na operação."),{status:res.status});
  return data;
}
function Button({children,onClick,variant="secondary",type="button",disabled=false}:{children:ReactNode;onClick?:()=>void;variant?:string;type?:"button"|"submit";disabled?:boolean}){
  return <button type={type} onClick={onClick} className={"btn "+variant} disabled={disabled}>{children}</button>;
}
function Field({label,name,value,change,type="text",options,required=false,wide=false}:{label:string;name:string;value:any;change:(key:string,value:any)=>void;type?:string;options?:{value:any;label:string}[];required?:boolean;wide?:boolean}){
  return <label className={"field"+(wide?" wide":"")}><span>{label}</span>{options?
    <select name={name} value={value??""} required={required} onChange={e=>change(name,e.target.value)}>{options.map(o=><option key={String(o.value)} value={o.value}>{o.label}</option>)}</select>:
    type==="textarea"?<textarea name={name} value={value??""} onChange={e=>change(name,e.target.value)} required={required} rows={3}/>:
    <input name={name} type={type} value={value??""} onChange={e=>change(name,e.target.value)} required={required} min={type==="number"?0:undefined} step={type==="number"?"any":undefined}/>}</label>;
}
const opts=(values:string[])=>values.map(value=>({value,label:value}));
const rowOpts=(rows:Row[],placeholder:string)=>[{value:"",label:placeholder},...rows.map(r=>({value:r.id,label:r.body.name}))];
function Empty({title,sub,icon=<FolderOpen size={23}/>,children}:{title:string;sub:string;icon?:ReactNode;children?:ReactNode}){
  return <div className="empty"><span className="empty-icon">{icon}</span><strong>{title}</strong><p>{sub}</p>{children}</div>;
}
function Badge({children,mode=""}:{children:ReactNode;mode?:string}){return <span className={"badge "+mode}><i/>{children}</span>;}
function Table({heads,rows,empty="Nenhum registro encontrado."}:{heads:string[];rows:ReactNode[][];empty?:string}){
  if(!rows.length)return <Empty title={empty} sub="Os registros aparecem aqui assim que estiverem disponíveis."/>;
  return <div className="table-scroll"><table><thead><tr>{heads.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div>;
}
function Mark({logo}:{logo?:string}){return logo?<img className="mark company-logo" src={logo} alt="Logotipo"/>:<span className="mark"><Zap size={21} fill="currentColor"/></span>;}
function Jersey(){return <svg className="jersey" viewBox="0 0 385 240" aria-hidden="true"><defs><pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0v25" fill="none" stroke="#99b5d7" opacity=".15"/></pattern><linearGradient id="shirt" x2="0.9" y2="1"><stop stopColor="#263b5a"/><stop offset="1" stopColor="#16233b"/></linearGradient></defs><rect width="385" height="240" fill="url(#grid)" opacity=".8"/><circle cx="237" cy="126" r="110" fill="none" stroke="#a8e670" opacity=".19"/><circle cx="237" cy="126" r="88" fill="none" stroke="#a8e670" opacity=".12"/><g transform="translate(148 29) rotate(-8 85 85)"><path d="M57 15 74 4q24 22 48 0l17 11 45 34-27 41-26-14v99H60V76L34 90 7 49Z" fill="url(#shirt)" stroke="#567296" strokeWidth="1.6"/><path d="M74 4q24 42 48 0M11 49l27 34m142-34-27 34" fill="none" stroke="#b5f65c" strokeWidth="2.8"/><path d="M62 155 127 90v23l-63 62m14 0 49-49v13l-35 36" fill="#b5f65c" opacity=".78"/><path d="m112 44-8 12h6l-3 8 9-13h-6z" fill="#b5f65c"/></g><path d="M310 39h35m-17-17v35M89 190h20m-10-10v20" stroke="#b5f65c" opacity=".7"/><path d="M76 72h46M68 79h23M313 183h36m-18 7h25" stroke="#678ab6"/></svg>;}
function Chart({orders,period}:{orders:Row[];period:string}){
  const now=new Date();
  const count=period==="12"?12:period==="3"?3:6;
  const months=Array.from({length:count},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-count+1+i,1);const key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");return {key,label:d.toLocaleDateString("pt-BR",{month:"short"}).replace(".",""),total:sum(orders.filter(o=>getSaleDate(o).startsWith(key)),"total")};});
  const maximum=Math.max(...months.map(m=>m.total),0);
  const step=maximum?Math.ceil(maximum/4/50)*50:250;
  return <div className="chart-area"><div className="chart-labels">{[4,3,2,1,0].map(n=><span key={n}>{n===0?"R$ 0":brl(n*step).split(",")[0]}</span>)}</div><div className="plot"><div className="gridlines">{[0,1,2,3,4].map(i=><i key={i}/>)}</div><div className="bars">{months.map((m,i)=><div className="bar-slot" key={m.key}><div className={"bar "+(i===months.length-1?"current":"")} style={{height:m.total?Math.max(4,m.total/(step*4)*100)+"%":"3px"}} title={m.label+": "+brl(m.total)}/><span>{m.label}</span></div>)}</div>{!maximum&&<div className="chart-empty">As vendas aparecerão neste gráfico</div>}</div></div>;
}

function ProductionMessage({url}:{url:string}){
  return url
    ? <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer"><MessageCircle size={15}/> Avisar cliente no WhatsApp</a>
    : <span className="hint">Cadastre um WhatsApp ou telefone com DDD para avisar o cliente.</span>;
}

export default function Workspace(){
  const [data,setData]=useState<State|null>(null),[error,setError]=useState<any>(null),[view,setView]=useState("dashboard");
  const [mobile,setMobile]=useState(false),[search,setSearch]=useState(""),[period,setPeriod]=useState("6");
  const [panel,setPanel]=useState<{kind:string;id?:number;tab?:string}|null>(null);
  const [notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[showAlerts,setShowAlerts]=useState(false),[searchAll,setSearchAll]=useState(false);
  const [requestedOrder,setRequestedOrder]=useState<number|null>(null);
  const [accessClient,setAccessClient]=useState<number|null>(null);
  const [studioVersion,setStudioVersion]=useState<number|null>(null);
  const [studioOrigin,setStudioOrigin]=useState<{view:string;panel:NonNullable<typeof panel>}|null>(null);
  const [updatedOrderId,setUpdatedOrderId]=useState<number|null>(null);
  const [productionStage,setProductionStage]=useState(""),[filter,setFilter]=useState({from:"",to:"",client:"",product:"",seller:""});
  async function refresh(){const next=await api("state");setData(next);setError(null);return next as State;}
  useEffect(()=>{
    const search=new URLSearchParams(window.location.search);
    setRequestedOrder(orderFromTrackingPath(window.location.search));
    refresh().then(next=>{
      if(search.get("view")==="studio"&&next.me.role!=="Produção")setView("studio");
    }).catch(setError);
  },[]);
  useEffect(()=>{
    if(!data||requestedOrder===null)return;
    const order=data.rows.find(row=>row.kind==="order"&&row.id===requestedOrder);
    setView("orders");
    if(order)setPanel({kind:"order",id:order.id,tab:"tracking"});
    else setNotice("Pedido indisponível para sua conta.");
    setRequestedOrder(null);
  },[data,requestedOrder]);
  useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(""),4000);return()=>clearTimeout(id);},[notice]);
  function go(next:string){setAccessClient(null);setStudioVersion(null);setStudioOrigin(null);setView(next);setSearch("");setMobile(false);setShowAlerts(false);setSearchAll(false);}
  async function mutate(fn:()=>Promise<unknown>,message:string,afterRefresh?:()=>void){
    if(busy)return;
    setBusy(true);
    try{await fn();await refresh();afterRefresh?.();setNotice(message);}
    catch(e){setNotice((e as Error).message);}
    finally{setBusy(false);}
  }
  if(!data)return <div className="gate"><Mark/><h1>Pulse &amp; Pace</h1><p>{error?error.message:"Carregando seu espaço de trabalho…"}</p>{error?.status===401?<a className="btn primary" target="_top" href={"/signin-with-chatgpt?return_to="+encodeURIComponent(requestedOrder===null?window.location.pathname+window.location.search:trackingPath(requestedOrder))}>Entrar com ChatGPT <ArrowRight size={16}/></a>:error?<Button onClick={()=>refresh().catch(setError)}>Tentar novamente</Button>:null}</div>;
  const me=data.me,client=me.role==="Cliente",production=me.role==="Produção",admin=me.role==="Administrador",staff=admin||me.role==="Vendedor";
  const rows=(kind:string)=>data.rows.filter(r=>r.kind===kind);
  const clients=rows("client"),products=rows("product"),quotes=rows("quote"),orders=rows("order"),ledger=rows("ledger");
  const company=(rows("settings")[0]?.body||companyDefault) as typeof companyDefault;
  const messageUrl=(order:Row)=>{
    const contact=clients.find(c=>c.id===order.client)?.body;
    const phone=production?(data.orderContacts?.[order.client??0]??"")
      : whatsappNumber(contact?.whatsapp)||whatsappNumber(contact?.phone);
    return productionWhatsapp(order,company.name,phone,window.location.origin+trackingPath(order.id));
  };
  const updatedOrder=orders.find(order=>order.id===updatedOrderId);
  function moveProduction(order:Row,stage:number){
    return mutate(()=>api("record/"+order.id+"/stage","PUT",{rev:order.rev,stage}),
      "Etapa de produção atualizada.",()=>setUpdatedOrderId(order.id));
  }
  const tiers=(rows("tiers")[0]?.body || data.defaultTiers.map(([min,max,price])=>({min,max,price,product:0,fabric:"",personalization:""}))) as Tier[];
  const nav=menu.filter(([id])=>client?clientNav.includes(id):production?productionNav.includes(id):id!=="settings"||admin);
  const allowedSearchKinds=client?["product","quote","order"]:["client","product","quote","order"];
  const find=(list:Row[])=>list.filter(r=>[code(r.kind,r.id),r.body.name,r.body.trade,r.body.document,r.body.email,r.body.city,r.body.productName,r.body.clientName,r.body.category,r.body.status,r.body.seller,r.body.label].some(v=>matches(v,search)));
  const active=panel?.id?data.rows.find(r=>r.id===panel.id):undefined;
  const open=(kind:string,id?:number,tab?:string)=>{setPanel({kind,id,tab:tab??(client&&kind==="order"?"tracking":undefined)});setSearchAll(false);};
  function openLinkedArtwork(id:number){
    if(!panel)return;
    go("studio");
    setStudioOrigin({view,panel});
    setStudioVersion(id);
    setPanel(null);
  }
  function backFromArtwork(){
    if(studioOrigin){
      go(studioOrigin.view);
      setPanel(studioOrigin.panel);
    }else go(production?"orders":"studio");
  }
  const todayKey=today(), soon=orders.filter(dueSoon).sort((a,b)=>a.body.due.localeCompare(b.body.due));
  const paid=(order:Row)=>sum(ledger.filter(l=>l.body.order===order.id&&l.body.kind==="Parcela"&&l.body.paid),"amount");
  const expense=(order:Row)=>sum(ledger.filter(l=>l.body.order===order.id&&l.body.kind==="Despesa"),"amount");
  const balance=(order:Row)=>Math.max(0,round(number(order.body.total)-paid(order)));
  const top=Array.from(orders.reduce((map,r)=>map.set(r.body.productName,(map.get(r.body.productName)||0)+r.body.qty),new Map<string,number>())).sort((a,b)=>b[1]-a[1]);
  const primary=staff?{label:"Novo orçamento",go:()=>open("quote")}:client?{label:"Solicitar orçamento",go:()=>open("quote")}:null;
  const metrics=[
    ["Clientes cadastrados",clients.length,Users,"lavender","clients"],
    ["Orçamentos enviados",quotes.filter(q=>["Enviado","Aguardando aprovação","Aprovado","Recusado"].includes(q.body.status)).length,FileText,"blue","quotes"],
    ["Em produção",orders.filter(inProduction).length,Package,"amber","production"],
    ["Faturamento mensal",brl(sum(orders.filter(o=>getSaleDate(o).startsWith(todayKey.slice(0,7))),"total")),CircleDollarSign,"green","finance"],
  ] as const;
  const pickOrder=(r:Row)=><button className="text-btn" onClick={()=>open(r.kind,r.id)}>{code(r.kind,r.id)}</button>;
  const latest=<Table heads={["Pedido","Cliente","Entrega","Etapa","Valor"]} rows={orders.slice(0,6).map(o=>[pickOrder(o),o.body.clientName,dateBR(o.body.due),<Badge mode={final(o)?"green":"blue"}>{stages[o.body.stage]}</Badge>,production?"—":brl(o.body.total)])} empty="Ainda não há pedidos"/>;
  async function exportReport(report:(string|number)[][],kind:string){
    if(kind==="Excel"){saveFile(workbook(report,"relatorio-atacado.xlsx"));return;}
    saveFile(await pdf("relatorio-atacado.pdf","Relatório de vendas",company.name,report.map(r=>r.join("  |  ")),company.logo));
  }

  return <div className="shell">
    {mobile&&<button className="mobile-overlay" aria-label="Fechar menu" onClick={()=>setMobile(false)}/>}
    <aside className={"sidebar"+(mobile?" shown":"")}>
      <div className="brand"><Mark logo={company.logo}/><div><strong>{company.name}</strong><span>GESTÃO DE ATACADO</span></div></div>
      <div className="nav-caption">ESPAÇO DE TRABALHO</div>
      <nav>{nav.map(([id,label,Icon],i)=><div key={id}>{(id==="quotes"||id==="finance")&&i>0&&<div className="nav-caption section-caption">{id==="quotes"?"OPERAÇÃO":"GESTÃO"}</div>}
        <button className={view===id?"active":""} onClick={()=>go(id)}><Icon size={18}/><span>{client&&id==="clients"?"Meu cadastro":label}</span>{view===id&&<i/>}</button>
      </div>)}</nav>
      <div className="sidebar-footer"><div className="avatar">{initialLetters(me.displayName)}</div><div><strong>{me.displayName}</strong><span>{me.role}</span></div><a href="/signout-with-chatgpt?return_to=%2F" target="_top" title="Sair" aria-label="Sair"><ArrowUpRight size={16}/></a></div>
    </aside>
    <div className="main">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={()=>setMobile(true)} aria-label="Abrir menu"><Menu size={21}/></button><span>Espaço de trabalho</span><ChevronRight size={14}/><strong>{nav.find(n=>n[0]===view)?.[1]??"Visão geral"}</strong></div>
        <div className="header-actions"><button className="top-search" onClick={()=>{setSearch("");setSearchAll(!searchAll);setShowAlerts(false);}}><Search size={17}/><span>Buscar registros</span></button><button className="icon-button bell" aria-label="Notificações" title="Notificações" onClick={()=>{setShowAlerts(!showAlerts);setSearchAll(false);}}><Bell size={19}/>{soon.length>0&&<i/>}</button><span className="top-avatar" title={me.displayName}>{initialLetters(me.displayName)}</span></div>
        {showAlerts&&<section className="popover"><h3>Próximas entregas</h3>{soon.length?soon.map(r=><button key={r.id} onClick={()=>{open("order",r.id);setShowAlerts(false);}}>{code("order",r.id)} · {r.body.clientName}<span>{dateBR(r.body.due)}</span></button>):<p>Nenhuma entrega nos próximos 7 dias.</p>}</section>}
        {searchAll&&<section className="popover search-popover"><input className="input" autoFocus placeholder="Buscar cliente, produto ou pedido" value={search} onChange={e=>setSearch(e.target.value)}/>{search.trim()&&find(data.rows.filter(r=>allowedSearchKinds.includes(r.kind))).slice(0,12).map(r=><button key={r.id} onClick={()=>open(r.kind,r.id)}>{code(r.kind,r.id)} · {r.body.name||r.body.productName}</button>)}{search.trim()&&!find(data.rows.filter(r=>allowedSearchKinds.includes(r.kind))).length&&<p>Nenhum resultado.</p>}</section>}
      </header>
      <main className="content">
        {view==="dashboard"?<>
          <div className="page-heading"><div><div className="eyebrow"><i/> PAINEL DE CONTROLE</div><h1>{client?"Portal do cliente":"Visão geral"}</h1><p>{client?"Acompanhe seus orçamentos, artes e pedidos.":"Acompanhe suas vendas, orçamentos e pedidos em um só lugar."}</p></div><span className="date-pill"><CalendarDays size={17}/> {new Date().toLocaleDateString("pt-BR",{day:"numeric",month:"long",year:"numeric",timeZone:"America/Sao_Paulo"})}</span></div>
          <section className="hero"><div className="hero-copy"><span><i/> {client?"PORTAL DO CLIENTE":"CENTRAL DE OPERAÇÕES"}</span><h2>{client?"Seu pedido, do primeiro orçamento à entrega.":"Da primeira arte à entrega."}</h2><p>{client?"Escolha um modelo, envie suas artes e acompanhe a produção.":"Organize a rotina do atacado e acompanhe cada etapa dos pedidos de camisetas personalizadas."}</p>{primary&&<Button variant="primary" onClick={primary.go}><Plus size={17}/>{primary.label}<ArrowRight className="hero-arrow" size={17}/></Button>}</div><Jersey/></section>
          <div className="section-heading"><div><h2>{client?"Seus pedidos":"Indicadores do negócio"}</h2><p>{client?"Acompanhe o andamento e consulte as artes.":"Resumo da operação e das vendas"}</p></div></div>
          {client? <section className="card">{latest}</section>:<>
          <div className="metrics">{metrics.filter(m=>!production||m[4]==="production").map(([label,value,Icon,tone,next])=><button className="metric card" key={label} onClick={()=>go(next)}><div><span className={"metric-icon "+tone}><Icon size={20}/></span><ArrowUpRight className="metric-arrow" size={16}/></div><span>{label}</span><strong>{value}</strong></button>)}</div>
          <div className="dashboard-grid">
            {!production&&<section className="card chart-card"><div className="card-title"><div><h3>Vendas por mês</h3><p>Faturamento dos pedidos confirmados</p></div><select aria-label="Período do gráfico" value={period} onChange={e=>setPeriod(e.target.value)}><option value="3">Últimos 3 meses</option><option value="6">Últimos 6 meses</option><option value="12">Últimos 12 meses</option></select></div><Chart orders={orders} period={period}/></section>}
            <section className="card delivery-card"><div className="card-title"><div><h3>Próximas entregas</h3><p>Pedidos com prazo nos próximos 7 dias</p></div><span className="metric-icon blue"><Clock3 size={18}/></span></div>{soon.length?<div className="deliveries">{soon.slice(0,5).map(r=><button key={r.id} onClick={()=>open("order",r.id)}><div><strong>{r.body.clientName}</strong><span>{code("order",r.id)}</span></div><Badge mode={r.body.due<todayKey?"red":"amber"}>{dateBR(r.body.due)}</Badge></button>)}</div>:<Empty title="Nenhuma entrega próxima" sub="Os pedidos com prazo próximo aparecerão aqui." icon={<CalendarDays size={22}/>}/>}</section>
          </div>
          <div className="dashboard-grid lower-grid"><section className="card"><div className="card-title"><div><h3>Pedidos recentes</h3><p>Últimos pedidos registrados</p></div><Button onClick={()=>go("orders")}>Ver pedidos <ArrowRight size={15}/></Button></div>{latest}</section>
          {!production&&<section className="card"><div className="card-title"><div><h3>Resumo comercial</h3><p>Indicadores acumulados</p></div></div><dl className="summary-list"><div><dt>Orçamentos aprovados</dt><dd>{quotes.filter(r=>r.body.status==="Aprovado").length}</dd></div><div><dt>Aguardando pagamento</dt><dd>{orders.filter(o=>o.body.stage===6||(!final(o)&&balance(o)>0)).length}</dd></div><div><dt>Pedidos finalizados</dt><dd>{orders.filter(final).length}</dd></div><div><dt>Faturamento diário</dt><dd>{brl(sum(orders.filter(o=>getSaleDate(o)===todayKey),"total"))}</dd></div><div><dt>Faturamento anual</dt><dd>{brl(sum(orders.filter(o=>getSaleDate(o).startsWith(todayKey.slice(0,4))),"total"))}</dd></div></dl><div className="card-title"><div><h3>Produtos mais vendidos</h3></div></div>{top.length?<div className="ranking">{top.slice(0,5).map(([name,total])=><div key={name}><span>{name}</span><strong>{total} peças</strong><i style={{width:total/top[0][1]*100+"%"}}/></div>)}</div>:<Empty title="Sem vendas registradas" sub="O ranking aparece após o primeiro pedido." icon={<Shirt size={23}/>}/>}</section>}</div>
          </>}
        </>:<>
          <div className="page-heading"><div><div className="eyebrow"><i/> {client?"PORTAL DO CLIENTE":"GESTÃO DE ATACADO"}</div><h1>{client&&view==="clients"?"Meu cadastro":client&&view==="orders"?"Meus pedidos":nav.find(n=>n[0]===view)?.[1]}</h1><p>{descriptions[view]}</p></div>
          {((view==="clients"&&staff)||(view==="catalog"&&staff)||view==="quotes")&&<Button variant="primary" onClick={()=>open(view==="clients"?"client":view==="catalog"?"product":"quote")}><Plus size={17}/>{view==="clients"?"Novo cliente":view==="catalog"?"Novo produto":client?"Solicitar orçamento":"Novo orçamento"}</Button>}</div>
          {["clients","catalog","quotes","orders","finance"].includes(view)&&<div className="toolbar"><label className="search-field"><Search size={17}/><input placeholder="Pesquisar registros…" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>}
          {view==="clients"&&<section className="card"><Table heads={["Código","Nome","Tipo","Cidade","Contato",""]} rows={find(clients).map(r=>[pickOrder(r),<strong>{r.body.name}</strong>,r.body.type,[r.body.city,r.body.state].filter(Boolean).join(" / ")||"—",r.body.whatsapp||r.body.email||r.body.phone||"—",<Button onClick={()=>open("client",r.id)}>Abrir <ArrowRight size={14}/></Button>])}/></section>}
          {view==="catalog"&&(find(products).length?<div className="catalog-grid">{find(products).map(r=>{const photo=data.photos.find(p=>p.parent===r.id);return <button className="product-card card" key={r.id} onClick={()=>open("product",r.id)}><div className="product-photo">{photo?<img src={fileURL(photo.id,true)} alt={r.body.name}/>:<Shirt size={55} strokeWidth={1}/>}</div><div><small>{r.body.category}</small><h3>{r.body.name}</h3><p>{r.body.fabric||"Tecido a definir"} · Mín. {r.body.min} peças</p><strong>{r.body.price?brl(r.body.price):"Sob consulta"}</strong></div></button>;})}</div>:<section className="card"><Empty title="Nenhum produto no catálogo" sub="Os modelos cadastrados estarão disponíveis para montar orçamentos." icon={<Shirt size={24}/>}/></section>)}
          {view==="tiers"&&<Tiers tiers={tiers} products={products} admin={admin} busy={busy} save={body=>mutate(()=>api("record/new","POST",{kind:"tiers",body}),"Tabela de preços salva.")}/>}
          {view==="quotes"&&<section className="card"><Table heads={["Orçamento","Cliente","Produto","Peças","Status","Total",""]} rows={find(quotes).map(r=>[pickOrder(r),r.body.clientName,r.body.productName,r.body.qty,<Badge mode={r.body.status==="Aprovado"?"green":"blue"}>{r.body.status}</Badge>,r.body.price?brl(r.body.total):"Sob consulta",<Button onClick={()=>open("quote",r.id)}>{staff?"Continuar":availableQuoteActions(r.body.status,false,client).length?"Responder":"Abrir"}</Button>])}/></section>}
          {view==="orders"&&<section className="card"><Table heads={["Pedido","Cliente","Produto","Peças","Entrega","Etapa",""]} rows={find(orders).map(r=>[pickOrder(r),r.body.clientName,r.body.productName,r.body.qty,dateBR(r.body.due),<Badge mode={final(r)?"green":"blue"}>{stages[r.body.stage]}</Badge>,<Button onClick={()=>open("order",r.id)}>{client?"Acompanhar":"Abrir"}</Button>])}/></section>}
          {view==="production"&&<>{updatedOrder&&<div className="production-update" role="status">
            <div><strong>{code("order",updatedOrder.id)} · {stages[updatedOrder.body.stage]}</strong><p>Etapa atualizada</p></div>
            <ProductionMessage url={messageUrl(updatedOrder)}/>
            <button className="icon-button" onClick={()=>setUpdatedOrderId(null)} aria-label="Dispensar atualização"><X size={16}/></button>
          </div>}<div className="toolbar"><label className="field"><span>Filtrar etapa</span><select value={productionStage} onChange={e=>setProductionStage(e.target.value)}><option value="">Todas as etapas</option>{stages.map((s,i)=><option value={i} key={s}>{s}</option>)}</select></label><div className="kanban-controls"><Button onClick={()=>document.getElementById("kanban")?.scrollBy({left:-520,behavior:"smooth"})}><ChevronLeft size={17}/> Anterior</Button><Button onClick={()=>document.getElementById("kanban")?.scrollBy({left:520,behavior:"smooth"})}>Próxima <ChevronRight size={17}/></Button></div></div>
            <div className="kanban" id="kanban">{stages.map((stage,i)=>{if(productionStage!==""&&Number(productionStage)!==i)return null;const quoteColumn=(i<3&&staff?quotes.filter(q=>i===0?["Solicitado","Rascunho"].includes(q.body.status):i===1?q.body.status==="Enviado":q.body.status==="Aguardando aprovação"):[]);const stageRows=[...orders.filter(r=>r.body.stage===i),...quoteColumn];return <section className="lane" key={stage} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const r=orders.find(o=>o.id===Number(e.dataTransfer.getData("text/plain")));if(r&&r.body.stage!==i)void moveProduction(r,i);}}><h3>{stage}<span>{stageRows.length}</span></h3>{stageRows.map(r=><div className="production-card" key={r.id}><button className="lane-card" draggable={r.kind==="order"} onDragStart={e=>e.dataTransfer.setData("text/plain",String(r.id))} onClick={()=>open(r.kind,r.id)}><small>{code(r.kind,r.id)}</small><strong>{r.body.clientName}</strong><span>{r.body.productName} · {r.body.qty} peças</span><span><CalendarDays size={14}/> {dateBR(r.body.due)}</span></button>{r.kind==="order"&&<div className="production-contact"><ProductionMessage url={messageUrl(r)}/></div>}</div>)}{!stageRows.length&&<p>Nenhum registro</p>}</section>;})}</div></>}
          {view==="finance"&&<><div className="finance-summary">{[["Total em vendas",sum(orders,"total")],["Recebido",sum(ledger.filter(l=>l.body.kind==="Parcela"&&l.body.paid),"amount")],["A receber",orders.reduce((a,r)=>a+balance(r),0)],...(staff?[["Despesas registradas",sum(ledger.filter(l=>l.body.kind==="Despesa"),"amount")]]:[])].map(([label,value])=><div className="card" key={label}><span>{label}</span><strong>{brl(Number(value))}</strong></div>)}</div><section className="card"><Table heads={staff?["Pedido","Cliente","Total","Recebido","Saldo","Lucro estimado",""]:["Pedido","Cliente","Total","Recebido","Saldo",""]} rows={find(orders).map(r=>[pickOrder(r),r.body.clientName,brl(r.body.total),brl(paid(r)),brl(balance(r)),...(staff?[brl(r.body.total-r.body.cost-expense(r))]:[]),<Button onClick={()=>open("order",r.id,"finance")}>{client?"Consultar":"Lançamentos"}</Button>])}/></section><section className="card spaced"><div className="card-title"><div><h3>{client?"Minhas parcelas":"Contas a receber"}</h3><p>Parcelas registradas nos pedidos</p></div></div><Table heads={["Pedido","Parcela","Vencimento","Valor","Situação"]} rows={ledger.filter(l=>l.body.kind==="Parcela"&&(!search||find(orders).some(o=>o.id===l.body.order)||find([l]).length)).map(l=>[<button className="text-btn" onClick={()=>open("order",l.body.order,"finance")}>{code("order",l.body.order)}</button>,l.body.label,dateBR(l.body.due),brl(l.body.amount),<Badge mode={l.body.paid?"green":l.body.due&&l.body.due<todayKey?"red":"amber"}>{l.body.paid?"Pago":l.body.due&&l.body.due<todayKey?"Vencido":"Pendente"}</Badge>])}/></section></>}
          {view==="reports"&&<Reports orders={orders} quotes={quotes} clients={clients} products={products} filter={filter} setFilter={setFilter} paid={paid} expense={expense} balance={balance} exportReport={exportReport}/>}
          {view==="studio"&&(staff||client||production&&studioVersion!==null)&&<Studio
            key={studioVersion??"projects"} api={api} clients={clients} products={products} staff={staff} admin={admin} account={me.email}
            versionId={studioVersion} company={company.name} notify={setNotice}
            back={backFromArtwork}
            createClient={staff?()=>open("client"):undefined} createProduct={staff?()=>open("product"):undefined}
            openQuote={id=>{void refresh().then(()=>open("quote",id)).catch(error=>setNotice(error.message));}}/>}
          {view==="settings"&&admin&&<Settings currentEmail={me.email} key={accessClient??"settings"} accessClient={clients.find(c=>c.id===accessClient)} company={company} clients={clients} busy={busy} notify={setNotice} save={body=>mutate(()=>api("record/new","POST",{kind:"settings",body}),"Configurações salvas.")}/>}
        </>}
        <footer>© {new Date().getFullYear()} {company.name} <span>Gestão de atacado</span></footer>
      </main>
    </div>
    {panel&&<RecordPanel key={panel.kind+":"+panel.id+":"+panel.tab} panel={panel} row={active} close={()=>setPanel(null)} open={open} clients={clients} products={products} orders={orders} ledger={ledger} me={me} staff={staff} production={production} company={company} tiers={tiers} busy={busy} mutate={mutate} notify={setNotice} paid={paid} expense={expense} balance={balance} messageUrl={messageUrl} moveProduction={moveProduction} configureClient={admin?id=>{go("settings");setAccessClient(id);setPanel(null);}:undefined} openStudio={openLinkedArtwork}/>}
    {notice&&<div role="status" className="toast"><span>{notice}</span><button className="icon-button" onClick={()=>setNotice("")} aria-label="Dispensar mensagem"><X size={16}/></button></div>}
  </div>;
}

function RecordPanel(props:{
  panel:{kind:string;id?:number;tab?:string};row?:Row;close:()=>void;open:(kind:string,id?:number,tab?:string)=>void;
  clients:Row[];products:Row[];orders:Row[];ledger:Row[];me:State["me"];staff:boolean;production:boolean;company:typeof companyDefault;tiers:Tier[];busy:boolean;
  openStudio:(versionId:number)=>void;configureClient?:(id:number)=>void;
  messageUrl:(order:Row)=>string;moveProduction:(order:Row,stage:number)=>Promise<void>;
  mutate:(fn:()=>Promise<unknown>,message:string)=>Promise<void>;notify:(s:string)=>void;paid:(r:Row)=>number;expense:(r:Row)=>number;balance:(r:Row)=>number
}){
  const {panel,row,close,open,clients,products,orders,ledger,me,staff,production,company,tiers,busy,messageUrl,moveProduction,openStudio,configureClient,mutate,notify,paid,expense,balance}=props;
  const client=me.role==="Cliente",kind=panel.kind;
  const initial=kind==="client"?{name:"",type:"Empresa"}:kind==="product"?{name:"",category:categories[0],min:10,price:35,cost:0}:
    {client:client?clients[0]?.id||"":"",product:"",seller:staff?me.displayName:"",fabric:"",personalization:"Sublimação total",
      sizes:sizes.map(size=>({size,qty:0})),price:0,discount:0,shipping:0,issued:today(),due:"",valid:"",productionDays:15,method:"Pix",status:client?"Solicitado":"Rascunho",notes:""};
  const [draft,setDraft]=useState<Body>(row?structuredClone(row.body):initial),[tab,setTab]=useState(panel.tab||"details"),[customSize,setCustomSize]=useState("");
  const [uploadFiles,setUploadFiles]=useState<Attachment[]>([]),[history,setHistory]=useState<Body[]>([]);
  const [payment,setPayment]=useState<Body>({kind:"Parcela",label:"",amount:"",due:"",paid:"",count:1});
  const [artNote,setArtNote]=useState(""),[uploadCategory,setUploadCategory]=useState(kind==="product"?"Foto do produto":"Frente"),[uploadNote,setUploadNote]=useState(""),[loadingFiles,setLoadingFiles]=useState(false);
  const [formError,setFormError]=useState(""),[suggestion,setSuggestion]=useState("");
  const [drop,setDrop]=useState(false),[queued,setQueued]=useState<File[]>([]);
  const [cancelDelete,setCancelDelete]=useState(false);
  useEffect(()=>{if(row){setDraft(structuredClone(row.body));}},[row?.rev]);
  useEffect(()=>{if(!row)return;setLoadingFiles(true);api("record/"+row.id+"/files").then(setUploadFiles).catch(e=>notify(e.message)).finally(()=>setLoadingFiles(false));api("record/"+row.id+"/history").then(setHistory).catch(e=>notify(e.message));},[row?.id,row?.rev]);
  useEffect(()=>{function key(e:KeyboardEvent){if(e.key==="Escape")close();}document.addEventListener("keydown",key);return()=>document.removeEventListener("keydown",key);},[]);
  const change=(key:string,value:any)=>setDraft(d=>({...d,[key]:value}));
  const qty=Array.isArray(draft.sizes)?draft.sizes.reduce((n:number,s:any)=>n+number(s.qty),0):0;
  const total=round(qty*number(draft.price)-number(draft.discount)+number(draft.shipping));
  const selectedProduct=products.find(r=>r.id===number(draft.product));
  const converted=kind==="quote"&&row&&orders.find(o=>o.source===row.id);
  const canEdit=kind==="client"?(staff||client):kind==="product"?staff:kind==="quote"?staff&&!converted&&(!row||quoteEditable(row.body.status))||client&&!row:false;
  const quote=row?.kind==="quote"?row:null;
  const quoteStatus=quote?.body.status ?? "";
  const nextActions=quote&&!converted?availableQuoteActions(quoteStatus,staff,client):[];
  const unsavedQuote=Boolean(quote&&canEdit&&JSON.stringify(draft)!==JSON.stringify(quote.body));
  const quoteIssue=quote?quoteCommercialError({price:quote.body.price,total:quote.body.total,valid:quote.body.valid}):"";
  const canConvert=Boolean(quote&&staff&&!converted&&quoteStatus==="Aprovado");
  const showQuoteIssue=canConvert||nextActions.some(action=>["Enviado","Aprovado"].includes(action.status));
  const proposalVisible=["Enviado","Aguardando aprovação","Aprovado","Recusado"].includes(quoteStatus);
  const title=kind==="client"?"Cliente":kind==="product"?"Produto":kind==="quote"?"Orçamento":"Pedido";
  const tabs=[...(kind==="order"&&row?[["tracking","Acompanhamento"]]:[]),["details","Informações"],...(row?[["files","Arquivos e artes"],...(kind==="order"&&!production?[["finance","Pagamentos"]]:[]),...(kind==="client"?[["history","Histórico de compras"]]:[]),...(!(client&&kind==="order")?[["timeline","Atividades"]]:[])]:[])];
  function payload(){
    if(kind==="client")return draft;
    if(kind==="product")return {...draft,min:number(draft.min),cost:number(draft.cost),price:number(draft.price)};
    return {...draft,client:number(draft.client),product:number(draft.product),price:number(draft.price),shipping:number(draft.shipping),
      discount:number(draft.discount),productionDays:number(draft.productionDays),sizes:draft.sizes.map((s:any)=>({...s,qty:number(s.qty)}))};
  }
  function suggestPrice(next:Body){
    const quantity=next.sizes.reduce((n:number,s:any)=>n+number(s.qty),0),prod=products.find(p=>p.id===number(next.product));
    const applicable=tiers.filter(t=>(!t.product||t.product===number(next.product))&&(!t.fabric||matches(next.fabric,t.fabric)&&String(next.fabric).toLowerCase()===t.fabric.toLowerCase())&&(!t.personalization||String(next.personalization).toLowerCase()===t.personalization.toLowerCase())&&quantity>=t.min&&(!t.max||quantity<=t.max));
    const tier=applicable.sort((a,b)=>(Number(!!b.product)+Number(!!b.fabric)+Number(!!b.personalization))-(Number(!!a.product)+Number(!!a.fabric)+Number(!!a.personalization)))[0];
    const price=tier?tier.price:prod?.body.price||0;
    setSuggestion(tier?price?`Preço aplicado para ${quantity} peças.`:"Quantidade sob consulta. Informe o preço negociado.":quantity?"Preço do catálogo. Nenhuma faixa específica aplicável.":"");
    return {...next,price:client?0:price};
  }
  function changeQuote(key:string,value:any){
    setDraft(d=>{
      let next={...d,[key]:value};
      if(key==="product"){const p=products.find(p=>p.id===number(value));next={...next,fabric:p?.body.fabric||"",sizes:d.sizes};}
      return ["product","sizes","fabric","personalization"].includes(key)?suggestPrice(next):next;
    });
  }
  async function submit(e:FormEvent){
    e.preventDefault();setFormError("");
    await mutate(async()=>{
      try{const saved=await api(row?"record/"+row.id:"record/new",row?"PUT":"POST",row?{body:payload(),rev:row.rev}:{kind,body:payload()});open(kind,saved.id);}
      catch(e){setFormError((e as Error).message);throw e;}
    },"Registro salvo.");
  }
  async function quoteFile(){
    if(!row)throw new Error("Salve o orçamento primeiro.");
    const q=row.body,c=clients.find(c=>c.id===q.client)?.body;
    return pdf(code(kind,row.id)+".pdf",code(kind,row.id),company.name,[
      "Emissão: "+dateBR(q.issued)+"     Validade: "+dateBR(q.valid),
      "Cliente: "+q.clientName,...(c?[["CPF/CNPJ",c.document],["Endereço",[c.address,c.number,c.district,c.city,c.state,c.zip].filter(Boolean).join(", ")],["Contato",c.whatsapp||c.phone||c.email]].filter(([,v])=>v).map(([k,v])=>k+": "+v):[]),
      "Vendedor: "+(q.seller||"—"),"","Produto: "+q.productName,
      "Tecido: "+q.fabric+"     Personalização: "+q.personalization,
      "","GRADE DE TAMANHOS",...q.sizes.filter((s:any)=>s.qty>0).map((s:any)=>s.size+"    "+s.qty+" peças"),
      "","Quantidade total: "+q.qty+" peças","Preço unitário: "+(q.price?brl(q.price):"Sob consulta"),
      "Desconto: "+brl(q.discount),"Frete: "+brl(q.shipping),"TOTAL: "+(q.price?brl(q.total):"Sob consulta"),
      "","Prazo de produção: "+q.productionDays+" dias","Previsão de entrega: "+dateBR(q.due),
      "Forma de pagamento: "+q.method,"","Observações: "+(q.notes||"—")
    ],company.logo);
  }
  async function getPDF(){try{saveFile(await quoteFile());}catch(e){notify((e as Error).message);}}
  async function shareQuote(){
    if(!row)return;
    try{
      const file=await quoteFile(),q=row.body;
      const text=`${company.name} • ${code(kind,row.id)}\nCliente: ${q.clientName}\n${q.productName} · ${q.qty} peças\nTotal: ${q.price?brl(q.total):"Sob consulta"}\nEntrega prevista: ${dateBR(q.due)}\nValidade: ${dateBR(q.valid)}`;
      if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:code(kind,row.id),text});return;}
      saveFile(file);
      const phone=String(clients.find(c=>c.id===q.client)?.body.whatsapp||"").replace(/\D/g,"");
      const national=phone.length===10||phone.length===11?"55"+phone:phone;
      window.open("https://wa.me/"+national+"?text="+encodeURIComponent(text),"_blank","noopener,noreferrer");
      notify("PDF baixado. Anexe o arquivo na conversa do WhatsApp.");
    }catch(e){if((e as Error).name!=="AbortError")notify((e as Error).message);}
  }
  async function importSizes(file?:File){
    if(!file)return;
    try{
      const text=(await file.text()).replace(/^\uFEFF/,"");
      const lines=text.trim().split(/\r?\n/).filter(Boolean),separator=lines[0].includes(";")?";":lines[0].includes("\t")?"\t":",";
      const result=lines.map(line=>line.split(separator).map(s=>s.trim().replace(/^"|"$/g,"")));
      const header=result[0].findIndex(s=>matches(s,"tamanho"));
      let imported:{size:string;qty:number}[];
      if(header>=0){
        const quantityCol=result[0].findIndex(s=>matches(s,"quantidade")||matches(s,"qtd"));
        const entries=result.slice(1);
        const map=new Map<string,{size:string;qty:number}>();
        for(const entry of entries){const size=entry[header];const q=quantityCol<0?1:Number(entry[quantityCol]);if(!size||!Number.isInteger(q)||q<0)throw new Error("Confira os tamanhos e quantidades do arquivo.");const key=size.toLowerCase();map.set(key,{size,qty:(map.get(key)?.qty||0)+q});}
        imported=Array.from(map.values());
      }else{
        imported=result.map(([size,count])=>{const q=Number(count);if(!size||!Number.isInteger(q)||q<0)throw new Error("Use duas colunas, Tamanho e Quantidade, ou uma lista com cabeçalho Tamanho.");return {size,qty:q};});
      }
      if(!imported.length||imported.length>100)throw new Error("Importe de 1 a 100 tamanhos.");
      changeQuote("sizes",imported);notify("Grade importada. Confira as quantidades.");
    }catch(e){notify((e as Error).message);}
  }
  async function sendFiles(e:FormEvent){
    e.preventDefault();if(!row)return;
    if(!queued.length){notify("Selecione os arquivos para enviar.");return;}
    const body=new FormData();body.set("category",uploadCategory);body.set("note",uploadNote);queued.forEach(f=>body.append("files",f));
    await mutate(async()=>{await api("record/"+row.id+"/files","POST",body);setQueued([]);setUploadNote("");setUploadFiles(await api("record/"+row.id+"/files"));},"Arquivos originais salvos.");
  }
  const orderLedger=row?ledger.filter(l=>l.body.order===row.id):[];
  const receivableTotal=sum(orderLedger.filter(l=>l.body.kind==="Parcela"),"amount");
  async function addPayment(e:FormEvent){
    e.preventDefault();if(!row)return;
    const count=number(payment.count)||1;
    if(payment.kind==="Parcela"&&round(receivableTotal+number(payment.amount))>number(row.body.total)){notify("O parcelamento excede o total do pedido.");return;}
    if(count>1&&(!payment.due||payment.kind!=="Parcela")){notify("Informe o primeiro vencimento para parcelar.");return;}
    await mutate(async()=>{
      const entries:Body[]=[];
      const cents=Math.round(number(payment.amount)*100),base=Math.floor(cents/count);
      for(let i=0;i<count;i++){
        let due=payment.due;
        if(count>1){const d=new Date(payment.due+"T12:00:00");const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+i);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));due=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
        entries.push({kind:payment.kind,label:payment.label+(count>1?` (${i+1}/${count})`:""),amount:(i===count-1?cents-base*(count-1):base)/100,due,paid:payment.paid});
      }
      await api("record/"+row.id+"/ledger","POST",{rev:row.rev,entries});
      setPayment({kind:"Parcela",label:"",amount:"",due:"",paid:"",count:1});
    },"Lançamentos salvos.");
  }
  const orderHistory=kind==="client"&&row?orders.filter(o=>o.client===row.id):[];

  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
    <section className="drawer" role="dialog" aria-modal="true" aria-label={title}>
      <header className="drawer-header"><div><span className="eyebrow">{row?code(kind,row.id):"NOVO REGISTRO"}</span><h2>{row?(row.body.name||row.body.clientName):client&&kind==="quote"?"Solicitar orçamento":"Novo "+title.toLowerCase()}</h2></div><button onClick={close} className="icon-button" aria-label="Fechar"><X size={23}/></button></header>
      <div className="tabs">{tabs.map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={tab===id?"selected":""}>{label}{id==="files"&&uploadFiles.length>0&&<span>{uploadFiles.length}</span>}</button>)}</div>
      <div className="drawer-content">
        {row?.body.studioVersionId&&<details className="studio-linked">
          <summary>Arte vinculada ao {row.kind==="order"?"pedido":"orçamento"}</summary>
          {row.body.studioPreviewId&&<img src={fileURL(row.body.studioPreviewId,true)} alt="Prévia da versão de personalização vinculada" loading="lazy"/>}
          <Button onClick={()=>openStudio(row.body.studioVersionId)}><ImageIcon size={16}/> Abrir arte vinculada no Estúdio</Button>
        </details>}
        {row?.kind==="order"&&(staff||production)&&<div className="order-message">
          <ProductionMessage url={messageUrl(row)}/>
        </div>}
        {row?.kind==="order"&&staff&&<details className="studio-linked tracking-share">
          <summary>Link de acompanhamento do cliente</summary>
          <p className="hint">O cliente entra com a conta do ChatGPT autorizada para o cadastro dele.</p>
          <input aria-label="Link de acompanhamento" readOnly value={window.location.origin+trackingPath(row.id)} onFocus={event=>event.target.select()}/>
          <div className="record-actions">
            <Button onClick={()=>{void navigator.clipboard.writeText(window.location.origin+trackingPath(row.id)).then(()=>notify("Link copiado."),()=>notify("Selecione e copie o endereço no campo acima."));}}>Copiar link</Button>
            {configureClient&&row.client&&<Button onClick={()=>configureClient(row.client!)}>Configurar acesso do cliente</Button>}
          </div>
        </details>}
        {row?.kind==="order"&&tab==="tracking"&&<OrderTracking key={row.id} id={row.id} rev={row.rev}/>}
        {tab==="details"&&<>
          {quote&&<section className="quote-progress" aria-label="Etapa do orçamento">
            <div className="order-highlight">
              <div><span>Etapa atual</span><h3>{converted?"Pedido criado":quoteStatus}</h3></div>
              {converted&&<Button variant="primary" onClick={()=>open("order",converted.id)}>Abrir pedido <ArrowRight size={15}/></Button>}
            </div>
            {client&&proposalVisible&&<dl className="record-details">
              <div><dt>Preço unitário</dt><dd>{quote.body.price?brl(quote.body.price):"Sob consulta"}</dd></div>
              <div><dt>Total do orçamento</dt><dd>{quote.body.price?brl(quote.body.total):"Sob consulta"}</dd></div>
              <div><dt>Desconto e frete</dt><dd>{brl(number(quote.body.discount))} de desconto · {brl(number(quote.body.shipping))} de frete</dd></div>
              <div><dt>Validade</dt><dd>{dateBR(quote.body.valid)}</dd></div>
            </dl>}
            {staff&&quoteStatus==="Rascunho"&&<p className="hint">Salve os valores e as condições, compartilhe a proposta com o cliente e marque como enviada.</p>}
            {unsavedQuote&&<p className="hint">Salve as alterações antes de avançar ou compartilhar.</p>}
            {showQuoteIssue&&quoteIssue&&<p className="hint error-text">{quoteIssue}</p>}
            {(nextActions.length>0||canConvert)&&<div className="record-actions">
              {nextActions.map((action,index)=><Button key={action.status}
                variant={action.status==="Recusado"?"danger":index===0&&!canConvert?"primary":"secondary"}
                disabled={busy||unsavedQuote||(Boolean(quoteIssue)&&["Enviado","Aprovado"].includes(action.status))}
                onClick={()=>mutate(()=>api("record/"+quote.id+"/quote-status","PUT",{rev:quote.rev,status:action.status}),"Etapa atualizada para "+action.status+".")}>
                {action.label}
              </Button>)}
              {canConvert&&<Button variant="primary" disabled={busy||Boolean(quoteIssue)} onClick={()=>mutate(async()=>{
                const order=await api("record/"+quote.id+"/convert","POST");
                open("order",order.id);
              },"Orçamento convertido em pedido.")}>Criar pedido <ArrowRight size={15}/></Button>}
            </div>}
          </section>}
          {row&&!production&&["quote","order"].includes(kind)&&(staff||kind==="order"||proposalVisible)&&<div className="record-actions">
            <Button onClick={getPDF} disabled={unsavedQuote}><ArrowDownToLine size={15}/> Baixar PDF</Button>
            <Button onClick={shareQuote} disabled={unsavedQuote}>Compartilhar WhatsApp <ArrowUpRight size={15}/></Button>
          </div>}
          {kind==="order"&&row?<><div className="order-highlight"><div><span>Etapa atual</span><h3>{stages[row.body.stage]}</h3></div><Badge mode={final(row)?"green":"blue"}>{row.body.qty} peças</Badge></div>{(staff||production)&&<label className="field spaced"><span>Mover para etapa</span><select disabled={busy} value={row.body.stage} onChange={e=>moveProduction(row,Number(e.target.value))}>{stages.map((s,i)=><option key={s} value={i}>{s}</option>)}</select></label>}
            <dl className="record-details">{[["Produto",row.body.productName],["Cliente",row.body.clientName],["Tecido",row.body.fabric],["Personalização",row.body.personalization],["Produção",row.body.productionDays+" dias"],["Previsão de entrega",dateBR(row.body.due)],...(!production?[["Total",brl(row.body.total)],["Saldo restante",brl(balance(row))],["Pagamento",row.body.method],["Vendedor",row.body.seller]]:[])].map(([a,b])=><div key={a}><dt>{a}</dt><dd>{b||"—"}</dd></div>)}</dl>
            <h3 className="subheading">Grade de tamanhos</h3><div className="size-summary">{row.body.sizes.filter((s:any)=>s.qty>0).map((s:any)=><span key={s.size}><small>{s.size}</small><strong>{s.qty}</strong></span>)}</div><h3 className="subheading">Observações</h3><p className="pre-wrap">{row.body.notes||"Nenhuma observação."}</p>{row.body.artNote&&<div className="info-box">{row.body.artNote}</div>}<Button onClick={()=>setTab("files")}><ImageIcon size={16}/> Abrir galeria de artes</Button>
          </>:<form onSubmit={submit} className="record-form">
            {kind==="client"&&<div className="form-grid">{clientFields.map(([name,label])=><Field key={name} name={name} label={label} value={draft[name]} change={change} required={name==="name"} type={name==="email"?"email":"text"}/>)}<Field name="type" label="Tipo de cliente" value={draft.type} change={change} options={opts(clientTypes)}/>{staff&&<Field name="notes" label="Observações internas" value={draft.notes} change={change} type="textarea" wide/>}</div>}
            {kind==="product"&&<div className="form-grid">{productFields.map(([name,label])=><Field key={name} name={name} label={label} value={draft[name]} change={change} required={name==="name"}/>)}<Field name="category" label="Categoria" value={draft.category} change={change} options={opts(categories)}/>{staff&&<Field name="cost" label="Preço de custo (R$)" value={draft.cost} change={change} type="number"/>}<Field name="price" label="Preço de venda (R$)" value={draft.price} change={change} type="number"/><Field name="min" label="Quantidade mínima" value={draft.min} change={change} type="number" required/><Field name="description" label="Descrição" value={draft.description} change={change} type="textarea" wide/></div>}
            {kind==="quote"&&<>
              {!clients.length&&<div className="info-box">Cadastre um cliente antes de criar o orçamento.{staff&&<Button onClick={()=>open("client")}>Cadastrar cliente</Button>}</div>}
              {!products.length&&<div className="info-box">Cadastre um produto para continuar.{staff&&<Button onClick={()=>open("product")}>Cadastrar produto</Button>}</div>}
              <fieldset disabled={!canEdit||busy}><div className="form-grid">
                <Field name="client" label="Cliente" value={draft.client} change={change} options={rowOpts(clients,"Selecione o cliente")} required/>
                <Field name="product" label="Modelo / produto" value={draft.product} change={changeQuote} options={rowOpts(products,"Selecione o produto")} required/>
                {staff&&<Field name="seller" label="Vendedor responsável" value={draft.seller} change={change}/>}
                <Field name="fabric" label="Tecido" value={draft.fabric} change={changeQuote}/>
                <Field name="personalization" label="Personalização" value={draft.personalization} change={changeQuote}/>
              </div>
              <div className="section-heading compact"><h3>Grade de tamanhos</h3><label className="btn secondary file-label"><ArrowDownToLine size={15}/> Importar CSV<input type="file" accept=".csv,.tsv,.txt" onChange={e=>importSizes(e.target.files?.[0])}/></label></div>
              <p className="hint">Importe Tamanho e Quantidade ou uma lista de nomes com a coluna Tamanho.</p>
              <div className="size-grid">{draft.sizes.map((s:any,i:number)=><label key={i}><span>{s.size}</span><input aria-label={"Quantidade "+s.size} type="number" step="1" min="0" max="100000" value={s.qty} onChange={e=>changeQuote("sizes",draft.sizes.map((v:any,j:number)=>i===j?{...v,qty:e.target.value}:v))}/></label>)}</div>
              <div className="inline-form"><input className="input" value={customSize} placeholder="Tamanho personalizado" maxLength={40} onChange={e=>setCustomSize(e.target.value)}/><Button onClick={()=>{const size=customSize.trim();if(!size||draft.sizes.some((s:any)=>s.size.toLowerCase()===size.toLowerCase())){notify("Informe um tamanho novo.");return;}change("sizes",[...draft.sizes,{size,qty:0}]);setCustomSize("");}}><Plus size={16}/> Adicionar</Button></div>
              <div className="grade-total"><span>Quantidade total</span><strong>{qty} peças</strong></div>{selectedProduct&&qty<selectedProduct.body.min&&<p className="hint error-text">Mínimo deste produto · {selectedProduct.body.min} peças</p>}
              {!client&&<><h3 className="subheading">Valores</h3><div className="form-grid"><Field name="price" label="Preço unitário (R$)" value={draft.price} change={change} type="number"/><Field name="discount" label="Desconto (R$)" value={draft.discount} change={change} type="number"/><Field name="shipping" label="Frete (R$)" value={draft.shipping} change={change} type="number"/><label className="field"><span>Total do orçamento</span><strong className="large-total">{brl(total)}</strong></label></div><p className="hint">{suggestion||"O preço pode ser ajustado conforme a negociação."}</p></>}
              <h3 className="subheading">Prazos e condições</h3><div className="form-grid">
                {staff&&<><Field name="issued" label="Data de emissão" type="date" value={draft.issued} change={change}/><Field name="valid" label="Validade" type="date" value={draft.valid} change={change}/></>}
                <Field name="due" label={client?"Data desejada":"Previsão de entrega"} type="date" value={draft.due} change={change}/>
                {staff&&<Field name="productionDays" label="Prazo de produção (dias)" type="number" value={draft.productionDays} change={change}/>}
                <Field name="method" label="Forma de pagamento" value={draft.method} change={change} options={opts(["Pix","Boleto","Cartão","Transferência","Dinheiro","A combinar"])}/>
                <Field name="notes" label="Observações" type="textarea" value={draft.notes} change={change} wide/>
              </div></fieldset>
            </>}
            {!canEdit&&kind!=="quote"&&<div className="info-box">Consulta do catálogo.</div>}
            {formError&&<p role="alert" className="error-text">{formError}</p>}
            <div className="form-footer"><span>{row?"Código automático · "+code(kind,row.id):"Código gerado automaticamente ao salvar"}</span>{canEdit&&<Button type="submit" variant="primary" disabled={busy}>{busy?"Salvando…":row?"Salvar alterações":client&&kind==="quote"?"Enviar solicitação":"Salvar e continuar"}<Check size={16}/></Button>}</div>
            {row&&staff&&["client","product","quote"].includes(kind)&&!converted&&<div className="danger-zone">{cancelDelete?<><p>Confirma a exclusão deste registro? Registros vinculados são protegidos.</p><Button onClick={()=>setCancelDelete(false)}>Cancelar</Button><Button variant="danger" disabled={busy} onClick={()=>mutate(async()=>{await api("record/"+row.id,"DELETE");close();},"Registro excluído.")}>Confirmar exclusão</Button></>:<button className="text-btn danger-text" type="button" onClick={()=>setCancelDelete(true)}>Excluir registro</button>}</div>}
          </form>}
        </>}
        {tab==="files"&&row&&<><div className="section-heading compact"><div><h3>Arquivos de {code(kind,row.id)}</h3><p>Originais preservados para download.</p></div></div>
          {(kind!=="product"||staff)&&<form onSubmit={sendFiles} className="upload-form">
            <label className={"dropzone"+(drop?" over":"")} onDragOver={e=>{e.preventDefault();setDrop(true);}} onDragLeave={()=>setDrop(false)} onDrop={e=>{e.preventDefault();setDrop(false);setQueued(Array.from(e.dataTransfer.files));}}><ArrowDownToLine size={25}/><strong>{queued.length?queued.length+" arquivo(s) selecionado(s)":"Arraste os arquivos ou clique para selecionar"}</strong><span>PNG, JPG, WEBP, PDF, SVG, AI, EPS e CDR · Até 25 MB por arquivo</span><input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.svg,.ai,.eps,.cdr" onChange={e=>setQueued(Array.from(e.target.files||[]))}/></label>
            {queued.length>0&&<p className="hint">{queued.map(f=>f.name).join(" · ")}</p>}
            <div className="form-grid"><Field name="category" label="Tipo de arquivo" value={uploadCategory} change={(_,v)=>setUploadCategory(v)} options={opts(fileCategories.filter(c=>!production||c!=="Comprovante"))}/><Field name="note" label="Observação dos arquivos" value={uploadNote} change={(_,v)=>setUploadNote(v)}/></div><Button type="submit" variant="primary" disabled={busy||!queued.length}>{busy?"Enviando…":"Enviar arquivos"}<ArrowRight size={16}/></Button>
          </form>}
          {loadingFiles?<p className="hint">Carregando arquivos…</p>:uploadFiles.length?<div className="gallery">{uploadFiles.map(f=>{const approved=row.body.approvedFiles?.includes(f.id)||row.body.approvedFile===f.id;return <article className={"file-card"+(approved?" approved":"")} key={f.id}><div className="file-preview">{["image/png","image/jpeg","image/webp"].includes(f.type)?<img src={fileURL(f.id,true)} alt={f.name}/>:<FileText size={40} strokeWidth={1.2}/>}</div><div className="file-info"><Badge mode={approved?"green":"blue"}>{approved?"Arte aprovada":f.category}</Badge><h4>{f.name}</h4><p>{f.note||"Sem observação"}</p><small>{(f.size/1024/1024).toFixed(2)} MB · {dateBR(f.created)}</small><small title={f.actor}>{f.actor}</small><a className="btn secondary" href={fileURL(f.id)} download><ArrowDownToLine size={14}/> Original</a>{kind==="order"&&["Frente","Costas","Mangas","Mockup"].includes(f.category)&&<Button variant={approved?"secondary":"primary"} disabled={busy||approved} onClick={()=>mutate(()=>api("record/"+row.id+"/art","PUT",{rev:row.rev,id:f.id,note:""}),"Arte aprovada e registrada.")}>{approved?<Check size={15}/>:null}{approved?"Aprovada":"Aprovar arte"}</Button>}</div></article>;})}</div>:<Empty title="Nenhum arquivo enviado" sub="Envie logotipos, mockups, artes ou comprovantes para este registro." icon={<ImageIcon size={24}/>}/>}
          {kind==="order"&&<form className="change-request" onSubmit={e=>{e.preventDefault();void mutate(async()=>{await api("record/"+row.id+"/art","PUT",{rev:row.rev,id:"",note:artNote});setArtNote("");},"Alteração registrada. Aprovações anteriores revogadas.");}}><Field label="Solicitar alteração na arte" name="artNote" type="textarea" value={artNote} change={(_,v)=>setArtNote(v)} required/><Button type="submit" disabled={busy}>Registrar alteração</Button></form>}
        </>}
        {tab==="finance"&&row&&<><div className="finance-summary drawer-finance">{[["Valor do pedido",row.body.total],["Recebido",paid(row)],["Saldo",balance(row)]].map(([label,value])=><div className="card" key={label}><span>{label}</span><strong>{brl(Number(value))}</strong></div>)}</div>
          {staff&&<form className="payment-form" onSubmit={addPayment}><h3>Novo lançamento</h3><div className="form-grid"><Field label="Tipo" name="kind" value={payment.kind} change={(k,v)=>setPayment(p=>({...p,[k]:v,count:1}))} options={opts(["Parcela","Despesa"])}/><Field label="Descrição" name="label" value={payment.label} change={(k,v)=>setPayment(p=>({...p,[k]:v}))} required/><Field label="Valor total (R$)" name="amount" type="number" value={payment.amount} change={(k,v)=>setPayment(p=>({...p,[k]:v}))} required/><Field label="Primeiro vencimento" name="due" type="date" value={payment.due} change={(k,v)=>setPayment(p=>({...p,[k]:v}))}/>{payment.kind==="Parcela"&&<Field label="Dividir em parcelas" name="count" value={payment.count} change={(k,v)=>setPayment(p=>({...p,[k]:v}))} options={Array.from({length:24},(_,i)=>({value:i+1,label:i+1+"x"}))}/>}<Field label="Data do pagamento (se recebido)" name="paid" type="date" value={payment.paid} change={(k,v)=>setPayment(p=>({...p,[k]:v}))}/></div><p className="hint">Parcelas registradas · {brl(receivableTotal)} / {brl(row.body.total)}. Para registrar um sinal, lance uma parcela recebida.</p><Button type="submit" variant="primary" disabled={busy}>Salvar lançamento</Button></form>}
          <Table heads={["Descrição","Tipo","Valor","Vencimento","Situação",""]} rows={orderLedger.map(l=>[l.body.label,l.body.kind,brl(l.body.amount),dateBR(l.body.due),l.body.paid?<Badge mode="green">Pago em {dateBR(l.body.paid)}</Badge>:<Badge mode="amber">Pendente</Badge>,staff?<Button disabled={busy} onClick={()=>mutate(()=>api("record/"+l.id+"/ledger","PUT",{rev:l.rev,body:{paid:l.body.paid?"":today()}}),l.body.paid?"Pagamento estornado.":"Pagamento recebido.")}>{l.body.paid?"Estornar":"Receber"}</Button>:l.body.paid?<Button onClick={async()=>saveFile(await pdf("comprovante-"+l.id+".pdf","Comprovante de recebimento",company.name,["Pedido: "+code("order",row.id),"Cliente: "+row.body.clientName,l.body.label,"Valor: "+brl(l.body.amount),"Recebimento: "+dateBR(l.body.paid),"Registro do recebimento informado pela empresa."],company.logo))}>Comprovante</Button>:"—"])}/>
          {staff&&<div className="info-box">Custo de produção estimado · {brl(row.body.cost)}<br/>Despesas adicionais · {brl(expense(row))}<br/>Lucro bruto estimado · {brl(row.body.total-number(row.body.cost)-expense(row))}</div>}
        </>}
        {tab==="history"&&<><div className="finance-summary drawer-finance"><div className="card"><span>Pedidos</span><strong>{orderHistory.length}</strong></div><div className="card"><span>Total em compras</span><strong>{brl(sum(orderHistory,"total"))}</strong></div></div><Table heads={["Pedido","Produto","Total","Entrega",""]} rows={orderHistory.map(o=>[code("order",o.id),o.body.productName,brl(o.body.total),dateBR(o.body.due),<Button onClick={()=>open("order",o.id)}>Abrir</Button>])}/></>}
        {tab==="timeline"&&<div className="timeline">{history.length?history.map((h,i)=><div key={i}><i/><strong>{h.action}</strong><span>{new Date(h.at).toLocaleString("pt-BR")}</span>{h.detail&&<p>{h.detail}</p>}</div>):<Empty title="Sem atividades" sub="As alterações serão registradas aqui."/>}</div>}
      </div>
    </section>
  </div>;
}

function Tiers({tiers,products,admin,busy,save}:{tiers:Tier[];products:Row[];admin:boolean;busy:boolean;save:(tiers:Tier[])=>void}){
  const [draft,setDraft]=useState(tiers);
  useEffect(()=>setDraft(tiers),[JSON.stringify(tiers)]);
  const change=(i:number,k:string,v:any)=>setDraft(d=>d.map((t,j)=>j===i?{...t,[k]:v}:t));
  return <section className="card"><div className="card-title"><div><h3>Faixas de preço</h3><p>Faixas específicas têm prioridade. Preço zero representa sob consulta.</p></div>{admin&&<Button onClick={()=>setDraft(d=>[...d,{min:1,max:0,price:0,product:0,fabric:"",personalization:""}])}><Plus size={16}/> Nova faixa</Button>}</div>
    <div className="table-scroll"><table className="tiers-table"><thead><tr>{["De","Até (0 = sem limite)","Preço (R$)","Produto","Tecido","Personalização",...(admin?[""]:[])].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{draft.map((t,i)=><tr key={i}>{["min","max","price"].map(k=><td key={k}><input aria-label={k+" faixa "+(i+1)} className="input" type="number" step={k==="price"?".01":"1"} min={k==="min"?1:0} disabled={!admin} value={t[k as keyof Tier]} onChange={e=>change(i,k,e.target.value)}/></td>)}<td><select aria-label={"Produto faixa "+(i+1)} disabled={!admin} value={t.product} onChange={e=>change(i,"product",e.target.value)}><option value={0}>Todos os produtos</option>{products.map(p=><option key={p.id} value={p.id}>{p.body.name}</option>)}</select></td><td><input className="input" aria-label={"Tecido faixa "+(i+1)} value={t.fabric} disabled={!admin} onChange={e=>change(i,"fabric",e.target.value)} placeholder="Todos"/></td><td><input className="input" aria-label={"Personalização faixa "+(i+1)} value={t.personalization} disabled={!admin} onChange={e=>change(i,"personalization",e.target.value)} placeholder="Todas"/></td>{admin&&<td><button className="icon-button" aria-label={"Remover faixa "+(i+1)} onClick={()=>setDraft(d=>d.filter((_,j)=>i!==j))}><X size={17}/></button></td>}</tr>)}</tbody></table></div>
    {admin&&<div className="form-footer padded"><span>Aplicável aos novos orçamentos.</span><Button variant="primary" disabled={busy} onClick={()=>save(draft.map(t=>({...t,min:number(t.min),max:number(t.max),price:number(t.price),product:number(t.product)})))}>Salvar tabela <Check size={16}/></Button></div>}
  </section>;
}
function Reports({orders,quotes,clients,products,filter,setFilter,paid,expense,balance,exportReport}:{
  orders:Row[];quotes:Row[];clients:Row[];products:Row[];filter:Record<string,string>;setFilter:(f:any)=>void;paid:(r:Row)=>number;expense:(r:Row)=>number;balance:(r:Row)=>number;exportReport:(rows:(string|number)[][],kind:string)=>Promise<void>
}){
  const [mode,setMode]=useState("Pedidos"),[exporting,setExporting]=useState(false);
  const modes=["Pedidos","Vendas por mês","Vendas por cliente","Produtos mais vendidos","Pedidos atrasados","Conversão de orçamentos","Produção por tamanho"];
  const change=(k:string,v:string)=>setFilter((f:any)=>({...f,[k]:v}));
  const select=(r:Row)=>{const d=r.kind==="quote"?(r.body.issued||r.created.slice(0,10)):getSaleDate(r);return (!filter.from||d>=filter.from)&&(!filter.to||d<=filter.to)&&(!filter.client||r.client===number(filter.client))&&(!filter.product||r.body.product===number(filter.product))&&(!filter.seller||r.body.seller===filter.seller);};
  const filtered=orders.filter(select),converted=quotes.filter(select);
  const group=(key:(r:Row)=>string)=>{const g=new Map<string,{qty:number;total:number;count:number}>();for(const r of filtered){const k=key(r),n=g.get(k)||{qty:0,total:0,count:0};n.qty+=r.body.qty;n.total=round(n.total+r.body.total);n.count++;g.set(k,n);}return Array.from(g).sort((a,b)=>b[1].total-a[1].total).map(([k,v])=>[k,v.count,v.qty,v.total]);};
  let report:(string|number)[][]=[];
  if(mode==="Vendas por mês")report=[["Mês","Pedidos","Peças","Faturamento"],...group(r=>getSaleDate(r).slice(0,7)).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))];
  else if(mode==="Vendas por cliente")report=[["Cliente","Pedidos","Peças","Faturamento"],...group(r=>r.body.clientName)];
  else if(mode==="Produtos mais vendidos")report=[["Produto","Pedidos","Peças","Faturamento"],...group(r=>r.body.productName).sort((a,b)=>Number(b[2])-Number(a[2]))];
  else if(mode==="Produção por tamanho"){
    const grade=new Map<string,number>();for(const r of filtered.filter(r=>r.body.stage>=12)){for(const s of r.body.sizes)grade.set(s.size,(grade.get(s.size)||0)+s.qty);}
    report=[["Tamanho","Quantidade produzida"],...Array.from(grade).filter(([,n])=>n>0)];
  }else if(mode==="Conversão de orçamentos"){
    report=[["Orçamento","Cliente","Status","Total","Pedido"],...converted.map(q=>[code("quote",q.id),q.body.clientName,q.body.status,q.body.total,orders.find(o=>o.source===q.id)?code("order",orders.find(o=>o.source===q.id)!.id):"—"])];
  }else{
    const selected=mode==="Pedidos atrasados"?filtered.filter(o=>!final(o)&&o.body.due&&o.body.due<today()):filtered;
    report=[["Pedido","Cliente","Produto","Peças","Total","Recebido","Saldo","Custo","Despesas","Lucro estimado","Entrega"],...selected.map(o=>[code("order",o.id),o.body.clientName,o.body.productName,o.body.qty,o.body.total,paid(o),balance(o),o.body.cost,expense(o),round(o.body.total-o.body.cost-expense(o)),dateBR(o.body.due)])];
  }
  const exportRows=[[mode],["Período",filter.from||"Início",filter.to||"Hoje"],[],...report];
  return <><section className="card filters"><div className="form-grid"><Field label="Data inicial" name="from" type="date" value={filter.from} change={change}/><Field label="Data final" name="to" type="date" value={filter.to} change={change}/><Field label="Cliente" name="client" value={filter.client} change={change} options={rowOpts(clients,"Todos os clientes")}/><Field label="Produto" name="product" value={filter.product} change={change} options={rowOpts(products,"Todos os produtos")}/><Field label="Vendedor" name="seller" value={filter.seller} change={change} options={[{value:"",label:"Todos os vendedores"},...opts(Array.from(new Set([...orders,...quotes].map(r=>r.body.seller).filter(Boolean))))]}/><Field label="Relatório" name="mode" value={mode} change={(_,v)=>setMode(v)} options={opts(modes)}/></div></section>
    <div className="finance-summary spaced">{[["Peças vendidas",filtered.reduce((a,r)=>a+r.body.qty,0)],["Faturamento",brl(sum(filtered,"total"))],["A receber",brl(filtered.reduce((a,r)=>a+balance(r),0))],["Conversão de orçamentos",converted.length?Math.round(converted.filter(q=>orders.some(o=>o.source===q.id)).length/converted.length*100)+"%":"0%"]].map(([label,value])=><div className="card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <section className="card"><div className="card-title"><div><h3>{mode}</h3><p>{report.length-1} registros encontrados</p></div><div className="inline-form">{["PDF","Excel"].map(kind=><Button key={kind} disabled={exporting} onClick={async()=>{setExporting(true);try{await exportReport(exportRows,kind);}finally{setExporting(false);}}}><ArrowDownToLine size={15}/>{kind}</Button>)}</div></div><Table heads={report[0].map(String)} rows={report.slice(1)}/></section></>;
}
function Settings({company,clients,busy,notify,save,accessClient,currentEmail}:{currentEmail:string;accessClient?:Row;company:typeof companyDefault;clients:Row[];busy:boolean;notify:(s:string)=>void;save:(d:Body)=>void}){
  const [draft,setDraft]=useState<Body>(company),[members,setMembers]=useState<Body[]>([]),[audit,setAudit]=useState<Body[]>([]);
  const emptyUser={email:"",role:"Vendedor",client:""};
  const [invite,setInvite]=useState<Body>(accessClient?{email:accessClient.body.email||"",role:"Cliente",client:accessClient.id}:emptyUser);
  const [userForm,setUserForm]=useState<"add"|"edit"|null>(accessClient?"add":null);
  const [userError,setUserError]=useState("");
  const [working,setWorking]=useState(false),[tab,setTab]=useState(accessClient?"access":"company"),[revoke,setRevoke]=useState("");
  const reload=()=>api("access").then(setMembers).catch(e=>notify(e.message));
  useEffect(()=>{reload();},[]);
  function startUser(member?:Body){
    setInvite(member?{email:member.email,role:member.role,client:member.client??""}:emptyUser);
    setUserError("");setRevoke("");setUserForm(member?"edit":"add");
  }
  async function submit(e:FormEvent){
    e.preventDefault();if(!userForm||working)return;
    setWorking(true);setUserError("");
    try{
      await api("access",userForm==="add"?"POST":"PUT",{
        email:invite.email.trim(),role:invite.role,client:invite.role==="Cliente"?number(invite.client):null,
        createOnly:userForm==="add",
      });
      await reload();
      setUserForm(null);
      notify(userForm==="add"?"Usuário adicionado. Autorize o mesmo e-mail no compartilhamento do site.":"Perfil de acesso atualizado.");
    }catch(error){setUserError((error as Error).message);}
    finally{setWorking(false);}
  }
  async function logo(file?:File){
    if(!file)return;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>3*1024*1024){notify("Use PNG, JPG ou WEBP de até 3 MB.");return;}
    const source=URL.createObjectURL(file);
    try{const image=new Image();image.src=source;await image.decode();const ratio=Math.min(1,320/image.width,160/image.height);const c=document.createElement("canvas");c.width=Math.max(1,Math.round(image.width*ratio));c.height=Math.max(1,Math.round(image.height*ratio));c.getContext("2d")!.drawImage(image,0,0,c.width,c.height);setDraft(d=>({...d,logo:c.toDataURL("image/webp",.85)}));}catch{notify("Imagem inválida.");}finally{URL.revokeObjectURL(source);}
  }
  return <><div className="tabs settings-tabs">{[["company","Empresa"],["access","Usuários"],["audit","Histórico"],["backup","Backup e privacidade"]].map(([id,label])=><button key={id} className={tab===id?"selected":""} onClick={()=>{setTab(id);if(id==="audit")api("audit").then(setAudit).catch(e=>notify(e.message));}}>{label}</button>)}</div>
    {tab==="company"&&<form className="card settings-form" onSubmit={e=>{e.preventDefault();save(draft);}}><h3>Identidade da empresa</h3><div className="logo-editor"><Mark logo={draft.logo}/><label className="btn secondary file-label">Enviar logotipo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>logo(e.target.files?.[0])}/></label>{draft.logo&&<Button onClick={()=>setDraft(d=>({...d,logo:""}))}>Remover</Button>}</div><div className="form-grid"><Field name="name" label="Nome da empresa" value={draft.name} change={(k,v)=>setDraft(d=>({...d,[k]:v}))} required/><Field name="whatsapp" label="WhatsApp da empresa" value={draft.whatsapp} change={(k,v)=>setDraft(d=>({...d,[k]:v}))}/></div><Button variant="primary" type="submit" disabled={busy}>Salvar configurações</Button></form>}
    {tab==="access"&&<section className="card settings-form users-settings">
      <div className="users-heading">
        <div><h3>Usuários do sistema</h3><p className="hint">Gerencie quem pode entrar e qual perfil cada pessoa usa.</p></div>
        <Button variant="primary" disabled={working} onClick={()=>startUser()}><Plus size={16}/> Adicionar usuário</Button>
      </div>
      {userForm&&<form className="users-form" onSubmit={submit}>
        <h4>{userForm==="add"?"Novo usuário":"Editar usuário"}</h4>
        <div className="form-grid">
          {userForm==="add"?<Field name="email" label="E-mail da conta ChatGPT" type="email" value={invite.email} change={(k,v)=>setInvite(d=>({...d,[k]:v}))} required/>
            :<div className="field"><span>E-mail da conta ChatGPT</span><strong>{invite.email}</strong></div>}
          <Field name="role" label="Perfil de acesso" value={invite.role} change={(k,v)=>setInvite(d=>({...d,[k]:v}))} options={opts(roles)}/>
          {invite.role==="Cliente"&&<Field name="client" label="Cadastro do cliente" value={invite.client} change={(k,v)=>setInvite(d=>({...d,[k]:v}))} options={rowOpts(clients,"Selecione um cliente")} required/>}
        </div>
        {invite.role==="Cliente"&&<p className="hint">O perfil Cliente acompanha os pedidos do cadastro selecionado.</p>}
        {userError&&<p className="error-text" role="alert">{userError}</p>}
        <div className="inline-form">
          <Button variant="primary" type="submit" disabled={working}>{working?"Salvando…":userForm==="add"?"Salvar usuário":"Salvar alterações"}</Button>
          <Button disabled={working} onClick={()=>setUserForm(null)}>Cancelar</Button>
        </div>
      </form>}
      <Table heads={["E-mail","Perfil","Cliente vinculado","Primeiro acesso","Ações"]} rows={members.map(member=>[
        member.email,member.role,clients.find(c=>c.id===member.client)?.body.name||"—",
        member.connected?"Realizado":"Aguardando login",
        member.email===currentEmail?<span>Sua conta</span>:revoke===member.email?
          <div className="inline-form">
            <Button disabled={working} onClick={()=>setRevoke("")}>Cancelar</Button>
            <Button variant="danger" disabled={working} onClick={async()=>{
              setWorking(true);
              try{await api("access","DELETE",{email:member.email,role:member.role,client:member.client});await reload();setRevoke("");notify("Acesso revogado.");}
              catch(error){notify((error as Error).message);}
              finally{setWorking(false);}
            }}>Confirmar revogação</Button>
          </div>:
          <div className="inline-form">
            <Button disabled={working} onClick={()=>startUser(member)}>Editar</Button>
            <Button disabled={working} onClick={()=>{setUserForm(null);setRevoke(member.email);}}>Revogar</Button>
          </div>
      ])}/>
      <div className="info-box">Para concluir a liberação, autorize o mesmo e-mail no compartilhamento do site. A pessoa entra com a própria conta do ChatGPT.</div>
    </section>}
    {tab==="audit"&&<section className="card"><Table heads={["Data","Responsável","Ação","Registro","Detalhes"]} rows={audit.map(a=>[new Date(a.at).toLocaleString("pt-BR"),a.actor,a.action,a.entity,a.detail||"—"])}/></section>}
    {tab==="backup"&&<section className="card settings-form"><h3>Backup e privacidade</h3><p>Exporte os registros, permissões, histórico e o índice dos arquivos em JSON. Os originais são baixados nas galerias dos respectivos registros.</p><Button disabled={working} onClick={async()=>{setWorking(true);try{download(JSON.stringify(await api("backup"),null,2),"backup-atacado-"+today()+".json","application/json");notify("Backup de registros exportado.");}catch(e){notify((e as Error).message);}finally{setWorking(false);}}}><ArrowDownToLine size={16}/> Exportar backup de registros</Button><h3 className="subheading">Tratamento dos dados</h3><p>Os cadastros contêm dados pessoais usados para orçamentos, produção, entrega e cobrança. Restrinja as contas à equipe autorizada e defina os procedimentos da empresa para retenção, atendimento aos titulares e recuperação de backups.</p><p className="hint">O histórico registra alterações e aprovações. O arquivo de backup contém dados pessoais e deve ser guardado em um local de acesso restrito.</p></section>}
  </>;
}
