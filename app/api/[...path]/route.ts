import { trackingEvents } from "../../../lib/order-tracking";
import { designSchema } from "../../../lib/studio-validation";
import { hasArtwork, rasterTypes, studioStatuses, views } from "../../../lib/studio";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "../../chatgpt-auth";
import { whatsappNumber, availableQuoteActions, quoteCommercialError, quoteEditable, categories, clientTypes, fileCategories, initialTiers, quoteStates, roles, round, stages, today } from "../../../lib/atacado";

type Role = {email:string;uid:string;role:string;client:number|null};
type Row = {id:number;kind:string;client:number|null;source:number|null;body:string;rev:number;created:string;updated:string};
type Attachment = {id:string;parent:number;name:string;category:string;note:string;type:string;size:number;actor:string;created:string};
class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
const fail = (status:number,msg:string):never => {throw new ApiError(status,msg);};
const iso = () => new Date().toISOString();
const db = () => env.DB ?? fail(503,"Banco de dados indisponível.");
const bucket = () => env.BUCKET ?? fail(503,"Armazenamento indisponível.");
const query = (sql:string,...args:(string|number|null)[]) => db().prepare(sql).bind(...args);
const json = (value:unknown,status=200) => Response.json(value,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
const parse = (row:Row) => ({...row,body:JSON.parse(row.body)});
const record = async (id:number) => {
  const row = await query("SELECT * FROM records WHERE id = ?",id).first<Row>();
  return row ? parse(row) : fail(404,"Registro não encontrado.");
};
const audit = (actor:Role, action:string, entity:string, detail="") => query(
  "INSERT INTO audit(actor,action,entity,at,detail) VALUES(?,?,?,?,?)",actor.email,action,entity,iso(),detail
);
const str = z.string().trim().max(300).default("");
const notes = z.string().trim().max(5000).default("");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default("");
const money = z.number().finite().min(0).max(100000000).default(0);
const identifier = z.number().int().positive();
const emailAddress = z.string().email().max(254).transform(x=>x.toLowerCase());
const clientSchema = z.object({
  name:z.string().trim().min(2).max(200),trade:str,document:str,stateReg:str,phone:str,whatsapp:str,
  email:emailAddress.or(z.literal("")).default(""),zip:str,address:str,number:str,district:str,
  city:str,state:str,contact:str,type:z.enum(clientTypes as [string, ...string[]]),notes
});
const productSchema = z.object({
  name:z.string().trim().min(2).max(200),category:z.enum(categories as [string, ...string[]]),fabric:str,weight:str,colors:str,sizes:str,
  cost:money,price:money,min:z.number().int().min(1).max(1000000),description:notes
});
const tierSchema = z.array(z.object({
  min:z.number().int().min(1).max(1000000),max:z.number().int().min(0).max(1000000),price:money,
  product:z.number().int().min(0).default(0),fabric:str,personalization:str
})).max(150);
const quoteSchema = z.object({
  client:identifier,product:identifier,seller:str,fabric:str,personalization:str,
  sizes:z.array(z.object({size:z.string().trim().min(1).max(40),qty:z.number().int().min(0).max(100000)})).min(1).max(100),
  price:money,discount:money,shipping:money,issued:date,due:date,valid:date,productionDays:z.number().int().min(0).max(3650).default(0),
  method:str,status:z.enum(quoteStates as [string, ...string[]]).default("Rascunho"),notes
});
const ledgerSchema = z.object({kind:z.enum(["Parcela","Despesa"]),label:z.string().trim().min(1).max(200),amount:money.refine(n=>n>0),due:date,paid:date});
const ledgerPayment = z.object({paid:date});
const belongs = (me:Role,row:ReturnType<typeof parse>) => me.client!==null && (row.kind==="client"?row.id===me.client:row.client===me.client);
const staff = (me:Role) => me.role==="Administrador" || me.role==="Vendedor";
function canRead(me:Role,row:ReturnType<typeof parse>){
  if(staff(me)) return true;
  if(me.role==="Produção") return ["order","product"].includes(row.kind);
  if(["studio","studio-version"].includes(row.kind)) return belongs(me,row);
  return row.kind==="product" || (["client","order","quote","ledger"].includes(row.kind) && belongs(me,row));
}
function sanitize(me:Role,row:ReturnType<typeof parse>){
  if(staff(me)) return row;
  const body = {...row.body};
  if(["product","order","quote"].includes(row.kind)) delete body.cost;
  if(row.kind==="client") delete body.notes;
  if(me.role==="Produção" && row.kind==="order"){
    for(const key of ["price","discount","shipping","total","method","seller"]) delete body[key];
  }
  return {...row,body};
}
async function identity() {
  const u=await getChatGPTUser();
  if(!u) return fail(401,"Entre com sua conta do ChatGPT.");
  const email=u.email.toLowerCase();
  await query("INSERT OR IGNORE INTO members(email,uid,role) SELECT ?,?,'Administrador' WHERE NOT EXISTS(SELECT 1 FROM members)",email,u.userId).run();
  await query("UPDATE members SET uid=? WHERE email=? AND uid IS NULL",u.userId,email).run();
  const me=await query("SELECT * FROM members WHERE uid=?",u.userId).first<Role>();
  if(!me) return fail(403,"Sua conta ainda não recebeu acesso ao sistema.");
  return {...me,displayName:u.displayName};
}
async function quoteBody(input:unknown,me:Role){
  const quote=quoteSchema.parse(input);
  const product=await record(quote.product);
  const client=await record(quote.client);
  if(product.kind!=="product" || client.kind!=="client") fail(400,"Selecione cliente e produto válidos.");
  const qty=quote.sizes.reduce((n,s)=>n+s.qty,0);
  if(qty<product.body.min) fail(400,`O mínimo para este produto é de ${product.body.min} peças.`);
  if(new Set(quote.sizes.map(s=>s.size.toLowerCase())).size!==quote.sizes.length) fail(400,"A grade contém tamanhos duplicados.");
  if(me.role==="Cliente"){
    if(!belongs(me,client)) fail(403,"Acesso restrito ao seu cadastro.");
    Object.assign(quote,{status:"Solicitado",issued:today(),seller:"",price:0,discount:0,shipping:0,valid:""});
  }
  const subtotal=round(quote.price*qty);
  if(quote.discount>subtotal) fail(400,"O desconto excede o subtotal.");
  return {...quote,qty,total:round(subtotal-quote.discount+quote.shipping),productName:product.body.name,clientName:client.body.name,cost:round(product.body.cost*qty)};
}
async function create(me:Role,kind:string,client:number|null,body:unknown,source:number|null=null){
  const now=iso();
  const [result]=await db().batch([
    query("INSERT INTO records(kind,client,source,body,created,updated) VALUES(?,?,?,?,?,?) RETURNING *",kind,client,source,JSON.stringify(body),now,now),
    query("INSERT INTO audit(actor,action,entity,at,detail) VALUES(?,? ,? || ':' || last_insert_rowid(),?,?)",me.email,"Criação",kind,now,"")
  ]);
  return sanitize(me,parse(result.results[0] as Row));
}
async function update(me:Role,row:ReturnType<typeof parse>,body:unknown,rev:number,action="Edição",client=row.client,detail="",after:ReturnType<typeof query>[]=[]){
  const now=iso();
  const [result]=await db().batch([
    query("UPDATE records SET body=?,client=?,rev=rev+1,updated=? WHERE id=? AND rev=? AND (kind<>'quote' OR NOT EXISTS(SELECT 1 FROM records AS orders WHERE orders.kind='order' AND orders.source=records.id)) RETURNING *",JSON.stringify(body),client,now,row.id,rev),
    query("INSERT INTO audit(actor,action,entity,at,detail) SELECT ?,?,?,?,? WHERE changes()=1",me.email,action,`${row.kind}:${row.id}`,now,detail),
    ...after
  ]);
  if(!result.results.length) return fail(409,"O registro foi alterado. Atualize a página e tente novamente.");
  return sanitize(me,parse(result.results[0] as Row));
}
async function listFiles(me:Role,row:ReturnType<typeof parse>){
  const ids=row.kind==="order" && row.source ? [row.id,row.source] : [row.id];
  const {results}=await query(`SELECT * FROM files WHERE parent IN (${ids.map(()=>"?").join(",")}) ORDER BY created DESC`,...ids).all<Attachment>();
  return results.filter(f=>me.role!=="Produção" || f.category!=="Comprovante");
}
const supported:Record<string,string> = {png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",pdf:"application/pdf",svg:"image/svg+xml",ai:"application/postscript",eps:"application/postscript",cdr:"application/octet-stream",webp:"image/webp"};
async function upload(me:Role,row:ReturnType<typeof parse>,request:Request){
  if(!["client","product","quote","order","studio"].includes(row.kind) || (row.kind==="product" && !staff(me))) fail(403,"Envio indisponível neste registro.");
  if(Number(request.headers.get("content-length"))>45*1024*1024) fail(413,"Envie até 40 MB por lote.");
  const data=await request.formData();
  const category=z.enum(fileCategories as [string, ...string[]]).parse(data.get("category"));
  if(me.role==="Produção" && category==="Comprovante") fail(403,"Apenas o comercial ou o cliente pode enviar comprovantes.");
  const note=notes.parse(data.get("note") ?? "");
  const entries=data.getAll("files");
  if(!entries.length || entries.length>15) fail(400,"Selecione de 1 a 15 arquivos.");
  let total=0;
  const pending: {file:File; meta:Attachment}[]=[];
  for(const entry of entries){
    if(typeof entry==="string") return fail(400,"Arquivo inválido.");
    const name=entry.name.replace(/[\r\n/\\]/g,"_").slice(0,200);
    const ext=name.split(".").pop()?.toLowerCase() ?? "";
    if((row.kind==="studio" && !["png","jpg","jpeg","webp","svg","pdf"].includes(ext)) || !Object.hasOwn(supported,ext) || !entry.size || entry.size>25*1024*1024) fail(400,"Formato inválido ou arquivo maior que 25 MB.");
    total+=entry.size;
    if(total>40*1024*1024) fail(413,"Envie até 40 MB por lote.");
    const bytes=new Uint8Array(await entry.slice(0,4096).arrayBuffer());
    const prefix=new TextDecoder().decode(bytes);
    const matches:Record<string,boolean>={
      png:bytes[0]===137 && prefix.slice(1,4)==="PNG",
      jpg:bytes[0]===255 && bytes[1]===216 && bytes[2]===255,
      jpeg:bytes[0]===255 && bytes[1]===216 && bytes[2]===255,
      pdf:prefix.startsWith("%PDF-"),svg:/<svg(?:\s|>)/i.test(prefix),
      ai:/^%(PDF-|!PS)/.test(prefix),eps:prefix.startsWith("%!PS") || bytes[0]===197 && bytes[1]===208,
      cdr:/^(RIFF|PK)/.test(prefix),webp:prefix.startsWith("RIFF") && prefix.slice(8,12)==="WEBP"
    };
    if(!matches[ext]) fail(400,`O conteúdo de ${name} não corresponde ao formato indicado.`);
    pending.push({file:entry,meta:{id:crypto.randomUUID(),parent:row.id,name,category,note,type:supported[ext],size:entry.size,actor:me.email,created:iso()}});
  }
  if(row.kind==="studio"){
    const usage=await query("SELECT COALESCE(SUM(size),0) bytes, COUNT(*) count FROM files WHERE parent=? AND category<>'Prévia do estúdio'",row.id).first<{bytes:number;count:number}>();
    if((usage?.bytes??0)+total>120*1024*1024 || (usage?.count??0)+pending.length>40) fail(413,"Este projeto aceita até 40 arquivos e 120 MB.");
  }
  const written:string[]=[];
  try{
    for(const {file,meta} of pending){
      await bucket().put(`${row.id}/${meta.id}`,file.stream(),{httpMetadata:{contentType:meta.type}});
      written.push(`${row.id}/${meta.id}`);
    }
    if(row.kind==="studio"){
      const [saved]=await db().batch([
        query(`INSERT INTO files(id,parent,name,category,note,type,size,actor,created)
          SELECT json_extract(value,'$.id'),?,json_extract(value,'$.name'),json_extract(value,'$.category'),
            json_extract(value,'$.note'),json_extract(value,'$.type'),json_extract(value,'$.size'),
            json_extract(value,'$.actor'),json_extract(value,'$.created')
          FROM json_each(?) WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND kind='studio' AND COALESCE(json_extract(body,'$.archived'),0)=0)
          AND (SELECT COALESCE(SUM(size),0) FROM files WHERE parent=? AND category<>'Prévia do estúdio')+?<=?
          AND (SELECT COUNT(*) FROM files WHERE parent=? AND category<>'Prévia do estúdio')+?<=40 RETURNING id`,
          row.id,JSON.stringify(pending.map(item=>item.meta)),row.id,row.id,total,120*1024*1024,row.id,pending.length),
        query("INSERT INTO audit(actor,action,entity,at,detail) SELECT ?,?,?,?,? WHERE changes()>0",me.email,"Envio de arquivo","studio:"+row.id,iso(),pending.map(item=>item.meta.name).join(", "))
      ]);
      if(saved.results.length!==pending.length) fail(409,"O projeto foi arquivado ou atingiu o limite de arquivos.");
    }else await db().batch([...pending.map(({meta:m})=>query(
      "INSERT INTO files(id,parent,name,category,note,type,size,actor,created) VALUES(?,?,?,?,?,?,?,?,?)",
      m.id,m.parent,m.name,m.category,m.note,m.type,m.size,m.actor,m.created
    )),audit(me,"Envio de arquivo",`${row.kind}:${row.id}`,pending.map(p=>p.meta.name).join(", "))]);
  }catch(error){
    if(written.length) await bucket().delete(written);
    throw error;
  }
  return json(pending.map(p=>p.meta),201);
}

async function studioFiles(client:number,includeArchived=false){
  const {results}=await query("SELECT f.* FROM files f JOIN records p ON p.id=f.parent AND p.kind='studio' WHERE p.client=? ORDER BY f.created DESC",client).all<Attachment>();
  return includeArchived?results:results.filter(file=>!["Arquivado","Prévia do estúdio"].includes(file.category));
}
async function checkDesignFiles(client:number,design:z.infer<typeof designSchema>){
  const files=await studioFiles(client,true);
  if(views.some(view=>design.panels[view].layers.some(layer=>layer.kind==="image"&&!files.some(file=>file.id===layer.file&&rasterTypes.includes(file.type)))))
    fail(400,"A camada usa um arquivo indisponível. Use uma imagem PNG, JPG ou WEBP.");
}
async function dispatch(request:Request){
  const url=new URL(request.url);
  if(request.method!=="GET" && request.headers.get("origin")!==url.origin) fail(403,"Origem inválida.");
  const [scope,part,action]=url.pathname.slice(5).split("/");
  const me=await identity();
  const method=request.method;
  if(scope==="state" && method==="GET"){
    const records=staff(me)
      ? await query("SELECT * FROM records WHERE kind IN ('client','product','quote','order','ledger','tiers','settings') ORDER BY id DESC").all<Row>()
      : me.role==="Produção"
      ? await query("SELECT * FROM records WHERE kind IN ('product','order','settings') ORDER BY id DESC").all<Row>()
      : await query("SELECT * FROM records WHERE kind IN ('product','tiers','settings') OR (id=? AND kind='client') OR (client=? AND (kind IN ('quote','order') OR (kind='ledger' AND json_extract(body,'$.kind')='Parcela'))) ORDER BY id DESC",me.client,me.client).all<Row>();
    const visible=records.results.map(parse);
    const photos=(await query("SELECT f.id,f.parent,f.type FROM files f JOIN records r ON r.id=f.parent WHERE r.kind='product' AND f.type IN ('image/png','image/jpeg','image/webp') ORDER BY f.created DESC").all()).results;
    const orderContacts:Record<number,string>={};
    if(me.role==="Produção"){
      const {results}=await query(`SELECT DISTINCT c.id, json_extract(c.body,'$.whatsapp') AS whatsapp,
        json_extract(c.body,'$.phone') AS phone
        FROM records o JOIN records c ON c.id=o.client AND c.kind='client'
        WHERE o.kind='order'`).all<{id:number;whatsapp:string|null;phone:string|null}>();
      for(const contact of results){
        const phone=whatsappNumber(contact.whatsapp)||whatsappNumber(contact.phone);
        if(phone) orderContacts[contact.id]=phone;
      }
    }
    return json({me,rows:visible.map(row=>sanitize(me,row)),photos,defaultTiers:initialTiers,orderContacts});
  }
  if(scope==="studio-model"){
    if(!staff(me)&&me.role!=="Cliente") fail(403,"Acesso restrito ao estúdio.");
    const product=await record(Number(part));
    if(product.kind!=="product") fail(404,"Produto indisponível.");
    const old=await query("SELECT * FROM records WHERE kind='studio-model' AND source=?",product.id).first<Row>();
    if(method==="GET") return json(old?parse(old).body.panels:null);
    if(method==="PUT"){
      if(me.role!=="Administrador") fail(403,"Apenas o administrador pode configurar o modelo.");
      const panels=designSchema.shape.panels.parse(await request.json());
      for(const view of views) panels[view].layers=[];
      return json(old?await update(me,parse(old),{panels},old.rev,"Medidas do modelo"):await create(me,"studio-model",null,{panels},product.id));
    }
  }
  if(scope==="studio"){
    if(!staff(me)&&me.role!=="Cliente") fail(403,"Acesso restrito ao estúdio.");
    if(method==="GET"&&!part){
      const rows=staff(me)
        ? await query("SELECT * FROM records WHERE kind='studio' ORDER BY updated DESC LIMIT 300").all<Row>()
        : await query("SELECT * FROM records WHERE kind='studio' AND client=? ORDER BY updated DESC LIMIT 300",me.client).all<Row>();
      return json(rows.results.map(parse).filter(row=>!row.body.archived));
    }
    if(method==="POST"&&!part){
      const data=z.object({client:identifier,design:designSchema}).parse(await request.json());
      if(!staff(me)&&me.client!==data.client) fail(403,"Cliente inválido.");
      if((await record(data.client)).kind!=="client" || (await record(data.design.product)).kind!=="product") fail(400,"Selecione cliente e produto válidos.");
      await checkDesignFiles(data.client,data.design);
      return json(await create(me,"studio",data.client,{design:data.design,version:0,current:null,status:studioStatuses[0]}),201);
    }
    const project=await record(Number(part));
    if(project.kind!=="studio"||!canRead(me,project)||project.body.archived) fail(404,"Projeto indisponível.");
    if(method==="GET"&&!action) return json(project);
    if(method==="GET"&&action==="library") return json(await studioFiles(project.client!));
    if(method==="PUT"&&action==="library"){
      const data=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(180).optional(),archive:z.boolean().optional()}).parse(await request.json());
      const file=(await studioFiles(project.client!)).find(f=>f.id===data.id);
      if(!file) return fail(404,"Arquivo indisponível.");
      const name=data.name?.replace(/[\r\n/\\]/g,"_")??file.name;
      await db().batch([
        query("UPDATE files SET name=?,category=? WHERE id=?",name,data.archive?"Arquivado":file.category,file.id),
        audit(me,data.archive?"Arquivo arquivado":"Arquivo renomeado","studio:"+project.id,name)
      ]);
      return json({ok:true});
    }
    if(method==="GET"&&action==="versions"){
      const {results}=await query("SELECT * FROM records WHERE kind='studio-version' AND client=? AND json_extract(body,'$.project')=? ORDER BY id DESC",project.client,project.id).all<Row>();
      return json(results.map(parse));
    }
    if(method==="PUT"&&!action){
      const {rev,design}=z.object({rev:identifier,design:designSchema}).parse(await request.json());
      if((await record(design.product)).kind!=="product") fail(400,"Selecione um produto.");
      await checkDesignFiles(project.client!,design);
      return json(await update(me,project,{...project.body,design},rev,"Personalização salva"));
    }
    if(method==="DELETE"&&!action){
      const {rev}=z.object({rev:identifier}).parse(await request.json());
      return json(await update(me,project,{...project.body,archived:true},rev,"Projeto arquivado"));
    }
    if(method==="POST"&&action==="version"){
      if(Number(request.headers.get("content-length"))>7*1024*1024) fail(413,"A prévia ultrapassa o limite.");
      const form=await request.formData();
      const rev=identifier.parse(Number(form.get("rev")));
      const preview=form.get("preview");
      if(!preview||typeof preview==="string"||preview.size<24||preview.size>6*1024*1024) return fail(400,"Gere uma prévia PNG válida antes de salvar a versão.");
      const signature=new Uint8Array(await preview.slice(0,8).arrayBuffer());
      if(signature.join(",")!=="137,80,78,71,13,10,26,10") fail(400,"A prévia precisa estar no formato PNG.");
      const design=designSchema.parse(project.body.design);
      if(!hasArtwork(design)) fail(400,"Adicione uma imagem, um texto ou um fundo de sublimação antes de salvar a versão.");
      const assets=await studioFiles(project.client!,true);
      const used=new Set(views.flatMap(view=>design.panels[view].layers.filter(layer=>layer.kind==="image").map(layer=>layer.file)));
      const derivedOriginals=new Set(assets.filter(file=>used.has(file.id)).flatMap(file=>{
        const match=file.note.match(/^Cópia PNG do (?:SVG|PDF) ([a-f0-9-]{36})$/);
        return match?[match[1]]:[];
      }));
      const originalIds=assets.filter(file=>used.has(file.id)||derivedOriginals.has(file.id)
        ||file.parent===project.id&&!["Arquivado","Prévia do estúdio"].includes(file.category)).map(file=>file.id);
      const version=(project.body.version??0)+1;
      if(version>60) fail(413,"Este projeto atingiu o limite de 60 versões. Duplique para continuar.");
      const now=iso();
      const previewId=crypto.randomUUID();
      const key=project.id+"/"+previewId;
      await bucket().put(key,preview.stream(),{httpMetadata:{contentType:"image/png"}});
      try{
        const [changed,snapshot]=await db().batch([
          query("UPDATE records SET body=?,rev=rev+1,updated=? WHERE id=? AND rev=? RETURNING *",JSON.stringify({...project.body,version,current:version,status:studioStatuses[0],note:""}),now,project.id,rev),
          query("INSERT INTO records(kind,client,body,created,updated) SELECT 'studio-version',?,?,?,? WHERE changes()=1 RETURNING *",project.client,JSON.stringify({project:project.id,design,version,originalIds,previewId,status:studioStatuses[0]}),now,now),
          query("INSERT INTO files(id,parent,name,category,note,type,size,actor,created) SELECT ?,?,?,'Prévia do estúdio','','image/png',?,?,? WHERE changes()=1",previewId,project.id,`previa-versao-${version}.png`,preview.size,me.email,now),
          query("INSERT INTO audit(actor,action,entity,at,detail) SELECT ?,?,?,?,? WHERE changes()=1",me.email,"Versão de arte salva","studio:"+project.id,now,String(version))
        ]);
        if(!changed.results.length) return fail(409,"O projeto foi alterado. Atualize antes de salvar.");
        return json({project:parse(changed.results[0] as Row),version:parse(snapshot.results[0] as Row)},201);
      }catch(error){
        await bucket().delete([key]).catch(()=>{});
        throw error;
      }
    }
    if(method==="PUT"&&action==="decision"){
      const {rev,versionId,status,note}=z.object({rev:identifier,versionId:identifier,status:z.enum(studioStatuses),note:notes}).parse(await request.json());
      const version=await record(versionId);
      if(version.kind!=="studio-version"||version.body.project!==project.id||version.body.version!==project.body.current) fail(409,"Selecione a versão atual do projeto.");
      const current=version.body.status;
      const allowed=staff(me)
        ? ({"Personalização em andamento":["Arte enviada para análise"],"Arte enviada para análise":["Aguardando aprovação","Correção solicitada"],"Aguardando aprovação":["Arte aprovada","Correção solicitada"],"Arte aprovada":["Liberada para produção"]} as Record<string,string[]>)[current]??[]
        : current==="Personalização em andamento"?["Arte enviada para análise"]:current==="Aguardando aprovação"?["Arte aprovada","Correção solicitada"]:[];
      if(!allowed.includes(status)) fail(409,"A ação não está disponível nesta etapa.");
      if(status==="Correção solicitada"&&!note) fail(400,"Descreva a alteração solicitada.");
      const now=iso();
      const approval=status==="Arte aprovada"?{at:now,actor:me.email,version:version.body.version}:version.body.approval;
      const [changed]=await db().batch([
        query("UPDATE records SET body=?,rev=rev+1,updated=? WHERE id=? AND rev=? RETURNING *",JSON.stringify({...project.body,status,note}),now,project.id,rev),
        query("UPDATE records SET body=?,rev=rev+1,updated=? WHERE id=? AND changes()=1",JSON.stringify({...version.body,status,note,approval}),now,version.id),
        query("INSERT INTO audit(actor,action,entity,at,detail) SELECT ?,?,?,?,? WHERE changes()=1",me.email,status,"studio:"+project.id,now,`Versão ${version.body.version}${note?" · "+note:""}`)
      ]);
      if(!changed.results.length) return fail(409,"O projeto foi alterado. Atualize antes de continuar.");
      return json(parse(changed.results[0] as Row));
    }
    if(method==="POST"&&action==="contact"){
      if(!staff(me)) fail(403,"Apenas o comercial pode registrar a comunicação.");
      await audit(me,"WhatsApp aberto","studio:"+project.id,project.body.status).run();
      return json({ok:true});
    }
    if(method==="POST"&&action==="link"){
      if(!staff(me)) fail(403,"Apenas o comercial pode trocar a versão vinculada.");
      const {versionId}=z.object({versionId:identifier}).parse(await request.json());
      const version=await record(versionId);
      if(version.kind!=="studio-version"||version.body.project!==project.id||version.body.version!==project.body.current||!version.body.approval)
        fail(400,"Aprove a versão atual antes de vinculá-la.");
      const raw=await query("SELECT * FROM records WHERE kind='quote' AND source=?",project.id).first<Row>();
      if(!raw) return fail(404,"Solicite um orçamento antes de vincular uma revisão.");
      const quote=parse(raw);
      const orderRaw=await query("SELECT * FROM records WHERE kind='order' AND source=?",quote.id).first<Row>();
      const order=orderRaw?parse(orderRaw):null;
      if(order&&order.body.stage>=7) fail(409,"O pedido já está em produção. A versão vinculada está protegida.");
      const design=designSchema.parse(version.body.design);
      if(design.product!==quote.body.product||design.fabric!==quote.body.fabric||design.mode!==quote.body.personalization||JSON.stringify(design.sizes)!==JSON.stringify(quote.body.sizes))
        fail(409,"A revisão mudou os itens comerciais. Solicite um orçamento em outro projeto.");
      const now=iso();
      const link={studioVersionId:version.id,studioProjectId:project.id,studioColor:design.color,studioPreviewId:version.body.previewId};
      const guard=order?"EXISTS(SELECT 1 FROM records WHERE id=? AND rev=?)":"NOT EXISTS(SELECT 1 FROM records WHERE kind='order' AND source=?)";
      const [changed]=await db().batch([
        query(`UPDATE records SET body=?,rev=rev+1,updated=? WHERE id=? AND rev=? AND ${guard}
          AND EXISTS(SELECT 1 FROM records WHERE id=? AND rev=?) RETURNING *`,
          JSON.stringify({...quote.body,...link}),now,quote.id,quote.rev,...(order?[order.id,order.rev]:[quote.id]),project.id,project.rev),
        ...(order?[query("UPDATE records SET body=?,rev=rev+1,updated=? WHERE id=? AND changes()=1",
          JSON.stringify({...order.body,...link,stage:3}),now,order.id)]:[]),
        query("INSERT INTO audit(actor,action,entity,at,detail) SELECT ?,?,?,?,? WHERE changes()=1",
          me.email,"Versão de arte vinculada","studio:"+project.id,now,`Versão ${version.body.version} · orçamento #${quote.id}`)
      ]);
      if(!changed.results.length) fail(409,"O pedido ou a arte mudou. Atualize antes de vincular.");
      return json({quote:quote.id,order:order?.id??null});
    }
    if(method==="POST"&&action==="quote"){
      const {versionId}=z.object({versionId:identifier}).parse(await request.json());
      const version=await record(versionId);
      if(version.kind!=="studio-version"||version.body.project!==project.id||version.body.version!==project.body.current) fail(409,"Salve a versão atual antes de solicitar orçamento.");
      const design=designSchema.parse(version.body.design);
      const quote=await quoteBody({client:project.client,product:design.product,sizes:design.sizes,fabric:design.fabric,personalization:design.mode,issued:today(),status:"Solicitado",notes:`Personalização: ${design.name} · versão ${version.body.version}`},me);
      const body={...quote,studioVersionId:version.id,studioProjectId:project.id,studioColor:design.color,studioPreviewId:version.body.previewId};
      const old=await query("SELECT * FROM records WHERE kind='quote' AND source=?",project.id).first<Row>();
      if(old){
        const row=parse(old);
        if(row.body.studioVersionId===version.id) return json(sanitize(me,row));
        if(row.body.status!=="Solicitado") fail(409,"A equipe já está preparando este orçamento. Combine a atualização da arte com o comercial.");
        return json(await update(me,row,body,row.rev,"Personalização vinculada",row.client,String(version.body.version)));
      }
      try {return json(await create(me,"quote",project.client,body,project.id),201);}
      catch(error){
        const existing=await query("SELECT * FROM records WHERE kind='quote' AND source=?",project.id).first<Row>();
        if(existing && parse(existing).body.studioVersionId===version.id) return json(sanitize(me,parse(existing)));
        throw error;
      }
    }
  }
  if(scope==="studio-version"&&method==="GET"){
    const version=await record(Number(part));
    if(version.kind!=="studio-version") fail(404,"Versão indisponível.");
    const order=await query("SELECT id FROM records WHERE kind='order' AND json_extract(body,'$.studioVersionId')=? LIMIT 1",version.id).first<{id:number}>();
    const productionAccess=me.role==="Produção"&&!!order;
    if(!canRead(me,version)&&!productionAccess) fail(403,"Versão protegida.");
    const project=await record(version.body.project);
    const originals=new Set<string>(version.body.originalIds??[]);
    const files=(await studioFiles(project.client!,true)).filter(file=>originals.has(file.id));
    const quote=await query("SELECT id FROM records WHERE kind='quote' AND json_extract(body,'$.studioVersionId')=? LIMIT 1",version.id).first<{id:number}>();
    return json({version,files,quoteId:quote?.id??null,orderId:order?.id??null,project:productionAccess||project.body.archived?null:project});
  }
  if(scope==="access"){
    if(me.role!=="Administrador") fail(403,"Acesso restrito.");
    if(method==="GET") return json((await query("SELECT email,role,client,uid IS NOT NULL AS connected FROM members ORDER BY email").all()).results);
    const data=z.object({email:emailAddress,role:z.enum(roles as [string, ...string[]]),client:identifier.nullable(),createOnly:z.boolean().optional()}).parse(await request.json());
    if(data.email===me.email) fail(400,"Seu próprio acesso administrativo é protegido.");
    if(method==="DELETE"){
      await db().batch([query("DELETE FROM members WHERE email=?",data.email),audit(me,"Revogação de acesso","access",data.email)]);
      return json({ok:true});
    }
    if(method==="POST"||method==="PUT"){
      if(data.role==="Cliente" && (!data.client || (await record(data.client)).kind!=="client")) fail(400,"Vincule um cadastro de cliente.");
      const client=data.role==="Cliente"?data.client:null;
      const now=iso();
      const statement=method==="PUT"
        ? query("UPDATE members SET role=?,client=? WHERE email=? RETURNING email",data.role,client,data.email)
        : data.createOnly
          ? query("INSERT INTO members(email,role,client) VALUES(?,?,?) ON CONFLICT(email) DO NOTHING RETURNING email",data.email,data.role,client)
          : query("INSERT INTO members(email,role,client) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,client=excluded.client RETURNING email",data.email,data.role,client);
      const [changed]=await db().batch([
        statement,
        query("INSERT INTO audit(actor,action,entity,at,detail) SELECT ?,?,?,?,? WHERE changes()=1",me.email,
          method==="POST"&&data.createOnly?"Usuário adicionado":"Atualização de acesso","access",now,data.email)
      ]);
      if(!changed.results.length){
        if(method==="PUT")fail(404,"Usuário não encontrado. Atualize a lista.");
        fail(409,"Este e-mail já está cadastrado. Use Editar para alterar o perfil.");
      }
      return json({ok:true});
    }
  }
  if(scope==="audit" && method==="GET"){
    if(me.role!=="Administrador") fail(403,"Acesso restrito.");
    return json((await query("SELECT * FROM audit ORDER BY id DESC LIMIT 200").all()).results);
  }
  if(scope==="backup" && method==="GET"){
    if(me.role!=="Administrador") fail(403,"Acesso restrito.");
    const tables=await db().batch(["records","members","files","audit"].map(t=>query(`SELECT * FROM ${t}`)));
    return json({exported:iso(),records:tables[0].results,members:tables[1].results,files:tables[2].results,audit:tables[3].results});
  }
  if(scope==="file" && method==="GET"){
    const meta=await query("SELECT * FROM files WHERE id=?",part).first<Attachment>();
    if(!meta) return fail(404,"Arquivo não encontrado.");
    const row=await record(meta.parent);
    const productionFile=me.role==="Produção"&&row.kind==="studio"&&await query(`SELECT v.id
      FROM records o JOIN records v ON v.id=json_extract(o.body,'$.studioVersionId') AND v.kind='studio-version'
      WHERE o.kind='order' AND o.client=? AND (json_extract(v.body,'$.previewId')=?
        OR EXISTS(SELECT 1 FROM json_each(v.body,'$.originalIds') f WHERE f.value=?)) LIMIT 1`,row.client,meta.id,meta.id).first();
    if((!canRead(me,row)&&!productionFile) || (me.role==="Produção" && meta.category==="Comprovante")) fail(403,"Arquivo protegido.");
    const file=await bucket().get(`${meta.parent}/${meta.id}`);
    if(!file) return fail(404,"Original indisponível.");
    const inline=url.searchParams.has("preview") && ["image/png","image/jpeg","image/webp"].includes(meta.type);
    return new Response(file.body,{headers:{"Content-Type":inline?meta.type:"application/octet-stream","Content-Length":String(file.size),
      "Content-Disposition":`${inline?"inline":"attachment"}; filename*=UTF-8''${encodeURIComponent(meta.name).replace(/'/g,"%27")}`,
      "X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox","Cache-Control":"private, no-store"}});
  }
  if(scope==="record" && part==="new" && method==="POST"){
    const {kind,body}=z.object({kind:z.enum(["client","product","quote","tiers","settings"]),body:z.unknown()}).parse(await request.json());
    if(!staff(me) && !(kind==="quote" && me.role==="Cliente")) fail(403,"Operação restrita.");
    if(kind==="client") return json(await create(me,kind,null,clientSchema.parse(body)),201);
    if(kind==="product") return json(await create(me,kind,null,productSchema.parse(body)),201);
    if(kind==="tiers" || kind==="settings"){
      if(me.role!=="Administrador") fail(403,"Acesso restrito.");
      const value=kind==="tiers"?validateTiers(body):settingsSchema.parse(body);
      const old=await query("SELECT * FROM records WHERE kind=? AND source=0",kind).first<Row>();
      return json(old?await update(me,parse(old),value,old.rev):await create(me,kind,null,value,0));
    }
    const quote=await quoteBody(body,me);
    return json(await create(me,"quote",quote.client,quote),201);
  }
  if(scope==="record" && /^\d+$/.test(part ?? "")){
    const row=await record(Number(part));
    if(!canRead(me,row)) fail(403,"Registro protegido.");
    if(action==="files") return method==="GET"?json(await listFiles(me,row)):method==="POST"?upload(me,row,request):fail(405,"Método indisponível.");
    if(method==="GET"&&row.kind==="order"&&(action==="tracking"||action==="history"&&me.role==="Cliente")){
      const {results}=await query(`SELECT action,at,detail FROM audit WHERE entity=?
        AND action IN ('Etapa de produção','Arte aprovada','Alteração solicitada')
        ORDER BY id DESC LIMIT 100`,"order:"+row.id).all<{action:string;at:string;detail:string}>();
      const events=trackingEvents(row.created,results);
      if(action==="history") return json(events.map(event=>({action:event.label,at:event.at,detail:""})));
      return json({
        id:row.id,product:row.body.productName??"",quantity:row.body.qty??0,
        stage:stages[row.body.stage]??"Em acompanhamento",due:row.body.due??"",events,
      });
    }
    if(action==="history" && method==="GET"){
      const {results}=await query("SELECT action,at,detail FROM audit WHERE entity=? ORDER BY id DESC LIMIT 50",`${row.kind}:${row.id}`).all();
      return json(results);
    }
    if(action==="quote-status" && method==="PUT"){
      if(row.kind!=="quote") fail(400,"Selecione um orçamento.");
      const {rev,status}=z.object({rev:identifier,status:z.string()}).parse(await request.json());
      const allowed=availableQuoteActions(row.body.status,staff(me),me.role==="Cliente" && belongs(me,row));
      if(!allowed.some(next=>next.status===status)) fail(409,"Este avanço não está disponível na etapa atual.");
      if(["Enviado","Aprovado"].includes(status)){
        const error=quoteCommercialError(row.body);
        if(error) fail(400,error);
      }
      return json(await update(me,row,{...row.body,status},rev,"Etapa do orçamento",row.client,`${row.body.status} → ${status}`));
    }
    if(action==="convert" && method==="POST"){
      if(!staff(me) || row.kind!=="quote") fail(403,"Operação restrita.");
      const existing=()=>query("SELECT * FROM records WHERE kind='order' AND source=?",row.id).first<Row>();
      const order=await existing();
      if(order) return json(parse(order));
      if(row.body.status!=="Aprovado") fail(400,"Aprove o orçamento antes de criar o pedido.");
      const error=quoteCommercialError(row.body);
      if(error) fail(400,error);
      const now=iso();
      const body={...row.body,stage:3,approvedFile:"",artNote:"",saleDate:today()};
      const [result]=await db().batch([
        query("INSERT INTO records(kind,client,source,body,created,updated) SELECT 'order',client,id,?,?,? FROM records WHERE id=? AND rev=? AND NOT EXISTS(SELECT 1 FROM records WHERE kind='order' AND source=?) RETURNING *",JSON.stringify(body),now,now,row.id,row.rev,row.id),
        query("INSERT INTO audit(actor,action,entity,at,detail) SELECT ?,?,'order:' || last_insert_rowid(),?,? WHERE changes()=1",me.email,"Criação",now,`Orçamento #${row.id}`)
      ]);
      if(result.results.length) return json(parse(result.results[0] as Row),201);
      const concurrent=await existing();
      if(concurrent) return json(parse(concurrent));
      fail(409,"O orçamento foi alterado. Atualize a página e tente novamente.");
    }
    if(action==="ledger" && method==="POST"){
      if(!staff(me) || row.kind!=="order") fail(403,"Operação restrita.");
      const data=z.object({rev:identifier,entries:z.array(ledgerSchema).min(1).max(24)}).parse(await request.json());
      const receivables=round(data.entries.filter(e=>e.kind==="Parcela").reduce((sum,e)=>sum+e.amount,0));
      const now=iso();
      const result=await db().batch([
        query("UPDATE records SET rev=rev+1,updated=? WHERE id=? AND rev=? AND (SELECT COALESCE(SUM(json_extract(body,'$.amount')),0) FROM records WHERE kind='ledger' AND json_extract(body,'$.order')=? AND json_extract(body,'$.kind')='Parcela')+? <= json_extract(body,'$.total')+0.001 RETURNING id",now,row.id,data.rev,row.id,receivables),
        ...data.entries.map(e=>query("INSERT INTO records(kind,client,body,created,updated) SELECT 'ledger',?,?,?,? WHERE changes()=1",row.client,JSON.stringify({...e,amount:round(e.amount),order:row.id}),now,now)),
        query("INSERT INTO audit(actor,action,entity,at,detail) SELECT ?,?,?,?,? WHERE changes()=1",me.email,"Lançamentos financeiros","order:"+row.id,now,data.entries.map(e=>e.label).join(", "))
      ]);
      if(!result[0].results.length) fail(409,"O pedido foi alterado ou as parcelas excedem seu total. Atualize a página.");
      return json({ok:true},201);
    }
    if(action==="ledger" && method==="PUT"){
      if(!staff(me) || row.kind!=="ledger") fail(403,"Operação restrita.");
      const data=z.object({rev:identifier,body:ledgerPayment}).parse(await request.json());
      return json(await update(me,row,{...row.body,paid:data.body.paid},data.rev,"Pagamento atualizado",row.client,data.body.paid));
    }
    if(action==="stage" && method==="PUT"){
      if((!staff(me) && me.role!=="Produção") || row.kind!=="order") fail(403,"Operação restrita.");
      const data=z.object({rev:identifier,stage:z.number().int().min(0).max(stages.length-1)}).parse(await request.json());
      const after:ReturnType<typeof query>[]=[];
      if(row.body.studioVersionId){
        const version=await record(row.body.studioVersionId);
        if(data.stage>=5&&!version.body.approval) fail(400,"Aprove a versão vinculada no Estúdio de Personalização.");
        if(data.stage>=7&&!studioStatuses.slice(5).includes(version.body.status))
          fail(400,"Libere a versão vinculada para produção no Estúdio de Personalização.");
        const status=data.stage===stages.length-1?"Finalizada":data.stage>=7?"Em produção":
          ["Em produção","Finalizada"].includes(version.body.status)?"Liberada para produção":version.body.status;
        if(status!==version.body.status){
          const now=iso();
          after.push(
            query("UPDATE records SET body=json_set(body,'$.status',?),rev=rev+1,updated=? WHERE id=? AND changes()=1",status,now,version.id),
            query("UPDATE records SET body=json_set(body,'$.status',?),rev=rev+1,updated=? WHERE id=? AND json_extract(body,'$.current')=? AND changes()=1",status,now,version.body.project,version.body.version)
          );
        }
      }else if(data.stage===5 && !row.body.approvedFile) fail(400,"Identifique a arte aprovada na galeria.");
      return json(await update(me,row,{...row.body,stage:data.stage},data.rev,"Etapa de produção",row.client,stages[data.stage],after));
    }
    if(action==="art" && method==="PUT"){
      if(row.kind!=="order") fail(400,"Selecione um pedido.");
      const data=z.object({rev:identifier,id:z.string().uuid().or(z.literal("")),note:notes}).parse(await request.json());
      if(!data.id && !data.note) fail(400,"Descreva as alterações solicitadas.");
      const gallery=await listFiles(me,row);
      if(data.id && !gallery.some(f=>f.id===data.id && ["Frente","Costas","Mangas","Mockup"].includes(f.category))) fail(400,"Selecione uma arte deste pedido.");
      const approvedFiles=Array.isArray(row.body.approvedFiles)?row.body.approvedFiles:[row.body.approvedFile].filter(Boolean);
      if(data.id && !approvedFiles.includes(data.id)) approvedFiles.push(data.id);
      return json(await update(me,row,{...row.body,approvedFile:data.id,approvedFiles:data.id?approvedFiles:[],artNote:data.note,stage:row.body.studioVersionId?row.body.stage:data.id?Math.max(5,row.body.stage):3},data.rev,data.id?"Arte aprovada":"Alteração solicitada",row.client,data.note || data.id));
    }
    if(!action && method==="PUT"){
      const {body,rev}=z.object({body:z.unknown(),rev:identifier}).parse(await request.json());
      if(row.kind==="client" && (staff(me) || me.role==="Cliente")){
        const value=clientSchema.parse(body);
        if(!staff(me)){value.notes=row.body.notes;value.type=row.body.type;}
        return json(await update(me,row,value,rev));
      }
      if(!staff(me)) fail(403,"Operação restrita.");
      if(row.kind==="product") return json(await update(me,row,productSchema.parse(body),rev));
      if(row.kind==="quote"){
        if(await query("SELECT id FROM records WHERE kind='order' AND source=?",row.id).first()) fail(409,"Este orçamento já foi convertido em pedido.");
        const quote=await quoteBody(body,me);
        if(!quoteEditable(row.body.status)) fail(409,"Reabra o orçamento para revisar os dados.");
        if(quote.status!==row.body.status) fail(400,"Use as ações da etapa para avançar o orçamento.");
        if(row.body.studioVersionId && (quote.client!==row.client||quote.product!==row.body.product||quote.personalization!==row.body.personalization||quote.fabric!==row.body.fabric||JSON.stringify(quote.sizes)!==JSON.stringify(row.body.sizes)))
          fail(400,"Cliente, produto, modalidade, tecido e grade fazem parte da personalização vinculada.");
        const nextBody=row.body.studioVersionId?{...quote,studioVersionId:row.body.studioVersionId,studioProjectId:row.body.studioProjectId,studioColor:row.body.studioColor,studioPreviewId:row.body.studioPreviewId}:quote;
        return json(await update(me,row,nextBody,rev,"Orçamento atualizado",quote.client,quote.status));
      }
    }
    if(!action && method==="DELETE" && staff(me) && ["client","product","quote","ledger"].includes(row.kind)){
      const used=await query("SELECT id FROM records WHERE client=? OR source=? OR (kind IN ('quote','order') AND json_extract(body,'$.product')=?) LIMIT 1",row.id,row.id,row.id).first();
      if(used || (await listFiles(me,row)).length) fail(409,"Registro vinculado a outros dados ou arquivos.");
      if(row.kind==="client" && await query("SELECT email FROM members WHERE client=? LIMIT 1",row.id).first()) fail(409,"Revogue o acesso vinculado a este cadastro antes de excluir.");
      const [deleted]=await db().batch([
        query("DELETE FROM records WHERE id=? AND rev=? AND (kind<>'quote' OR NOT EXISTS(SELECT 1 FROM records AS orders WHERE orders.kind='order' AND orders.source=records.id)) RETURNING id",row.id,row.rev),
        query("INSERT INTO audit(actor,action,entity,at,detail) SELECT ?,?,?,?,? WHERE changes()=1",me.email,"Exclusão",`${row.kind}:${row.id}`,iso(),"")
      ]);
      if(!deleted.results.length) fail(409,"O registro foi alterado. Atualize a página e tente novamente.");
      return json({ok:true});
    }
  }
  return fail(404,"Operação indisponível.");
}
const settingsSchema=z.object({name:z.string().trim().min(2).max(100),whatsapp:str,logo:z.string().max(80000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).or(z.literal("")).default("")});
function validateTiers(body:unknown){
  const tiers=tierSchema.parse(body);
  for(const [i,t] of tiers.entries()){
    if(t.max && t.max<t.min) fail(400,"Faixa de quantidade inválida.");
    if(tiers.slice(i+1).some(o=>o.product===t.product && o.fabric.toLowerCase()===t.fabric.toLowerCase() && o.personalization.toLowerCase()===t.personalization.toLowerCase() && t.min<=(o.max||Infinity) && o.min<=(t.max||Infinity))) fail(400,"Há faixas sobrepostas para a mesma combinação.");
  }
  return tiers;
}
async function handle(request:Request){
  try{return await dispatch(request);}
  catch(error){
    if(error instanceof ApiError) return json({error:error.message},error.status);
    if(error instanceof z.ZodError) return json({error:"Confira os campos e os formatos informados.",fields:error.issues.map(i=>i.path.join("."))},400);
    console.error("Falha na API",error instanceof Error?error.message:"desconhecida");
    return json({error:"Não foi possível concluir a operação. Tente novamente."},500);
  }
}
export const GET=handle;
export const POST=handle;
export const PUT=handle;
export const DELETE=handle;
