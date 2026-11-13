import { type Design,type Panel,type View,studioFileUrl } from "./studio";

const images=new Map<string,Promise<HTMLImageElement>>();
export function loadStudioImage(id:string) {
  let pending=images.get(id);
  if(!pending){
    pending=new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>{images.delete(id);reject(new Error("Não foi possível abrir uma das imagens."));};
      image.src=studioFileUrl(id,true);
    });
    images.set(id,pending);
  }
  return pending;
}
function silhouette(ctx:CanvasRenderingContext2D,view:View,product:string) {
  const sleeve=view==="left"||view==="right";
  const sleeveless=/regata/i.test(product);
  const long=/manga longa/i.test(product);
  ctx.beginPath();
  if(sleeve){
    ctx.moveTo(.25,.07);ctx.lineTo(.75,.07);ctx.lineTo(.92,.91);ctx.lineTo(.08,.91);
  }else{
    const edge=long?.055:.035;
    ctx.moveTo(.36,.09);
    ctx.quadraticCurveTo(.5,view==="front"?.26:.15,.64,.09);
    ctx.lineTo(sleeveless?.74:.81,.13);
    if(!sleeveless){ctx.lineTo(1-edge,long?.91:.34);ctx.lineTo(.77,long?.94:.45);}
    ctx.lineTo(.74,.37);ctx.lineTo(.77,.94);ctx.lineTo(.23,.94);ctx.lineTo(.26,.37);
    if(!sleeveless){ctx.lineTo(.23,long?.94:.45);ctx.lineTo(edge,long?.91:.34);}
    ctx.lineTo(sleeveless?.26:.19,.13);
  }
  ctx.closePath();
}
export async function paintStudio(canvas:HTMLCanvasElement,design:Design,view:View,options:{mock?:boolean;guides?:boolean;bleed?:boolean;strict?:boolean;selected?:string;product?:string;shoulder?:boolean}={}) {
  const panel=design.panels[view];
  const loaded=await Promise.all(panel.layers.map(async layer=>layer.kind==="image"
    ? loadStudioImage(layer.file).catch(error=>{if(options.strict)throw error;return null;}) : null));
  const ctx=canvas.getContext("2d");
  if(!ctx) throw new Error("Seu navegador não conseguiu preparar a imagem.");
  const bleed=options.bleed?panel.bleed:0;
  const w=canvas.width*panel.width/(panel.width+2*bleed),h=canvas.height*panel.height/(panel.height+2*bleed);
  const offsetX=(canvas.width-w)/2,offsetY=(canvas.height-h)/2;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.translate(offsetX,offsetY);
  if(options.mock){
    ctx.save();ctx.scale(w,h);silhouette(ctx,view,options.product??"");ctx.restore();ctx.clip();
  }
  const background=design.mode==="Logotipos"?design.color:panel.color;
  if(panel.gradient&&design.mode==="Sublimação total"){
    const gradient=ctx.createLinearGradient(0,0,w,h);
    gradient.addColorStop(0,background);gradient.addColorStop(1,panel.gradient);ctx.fillStyle=gradient;
  }else ctx.fillStyle=background;
  ctx.fillRect(-offsetX,-offsetY,canvas.width,canvas.height);
  if(panel.pattern!=="none"&&design.mode==="Sublimação total"){
    ctx.save();ctx.fillStyle="rgba(0,0,0,.09)";
    const step=w/14;
    for(let x=-offsetX;x<w+offsetX;x+=step){
      if(panel.pattern==="stripes")ctx.fillRect(x,-offsetY,step/3,canvas.height);
      else for(let y=-offsetY;y<h+offsetY;y+=step){ctx.beginPath();ctx.arc(x,y,step/8,0,Math.PI*2);ctx.fill();}
    }
    ctx.restore();
  }
  panel.layers.forEach((layer,index)=>{
    const lw=layer.w*w,lh=layer.h*h;
    ctx.save();
    ctx.translate(layer.x*w,layer.y*h);
    ctx.rotate(layer.angle*Math.PI/180);
    ctx.globalAlpha=layer.opacity;
    const image=loaded[index];
    if(image){
      const ratio=layer.fit==="cover"?Math.max(lw/image.naturalWidth,lh/image.naturalHeight):Math.min(lw/image.naturalWidth,lh/image.naturalHeight);
      ctx.beginPath();ctx.rect(-lw/2,-lh/2,lw,lh);ctx.clip();
      const iw=image.naturalWidth*ratio,ih=image.naturalHeight*ratio;
      ctx.drawImage(image,-iw/2,-ih/2,iw,ih);
    }else if(layer.kind==="text"){
      ctx.fillStyle=layer.color;ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.font=`700 ${Math.max(1,lh*.73)}px Arial`;
      ctx.fillText(layer.text,0,0,lw);
    }
    ctx.globalAlpha=1;
    if(layer.id===options.selected){
      ctx.strokeStyle="#8ee450";ctx.lineWidth=Math.max(1,w/300);
      ctx.strokeRect(-lw/2,-lh/2,lw,lh);
    }
    ctx.restore();
  });
  ctx.restore();
  if(options.mock){
    ctx.save();
    ctx.translate(offsetX,offsetY);
    ctx.scale(w,h);
    silhouette(ctx,view,options.product??"");
    ctx.restore();
    ctx.save();
    ctx.strokeStyle="rgba(30,50,66,.35)";
    ctx.lineWidth=1.5;
    ctx.stroke();
    ctx.restore();
  }
  if(options.guides&&!options.mock){
    ctx.save();ctx.strokeStyle="#597e53";ctx.lineWidth=1;ctx.setLineDash([6,4]);
    ctx.strokeRect(offsetX,offsetY,w,h);
    const mx=w*panel.margin/panel.width,my=h*panel.margin/panel.height;
    ctx.strokeRect(offsetX+mx,offsetY+my,w-2*mx,h-2*my);
    ctx.restore();
  }
  if(options.guides&&options.shoulder){
    ctx.save();
    ctx.strokeStyle="#318348";
    ctx.lineWidth=2;
    ctx.setLineDash([6,4]);
    ctx.strokeRect(offsetX+w*.27,offsetY+h*.1,w*.46,h*.24);
    ctx.restore();
  }
}
export async function lowResolution(panel:Panel,dpi:number,files:Set<string>) {
  const results=await Promise.all(panel.layers.filter(layer=>layer.kind==="image"&&files.has(layer.file)).map(async layer=>{
    const image=await loadStudioImage(layer.file);
    const width=panel.width*layer.w/2.54,height=panel.height*layer.h/2.54;
    const effective=layer.fit==="cover"?Math.min(image.naturalWidth/width,image.naturalHeight/height):Math.max(image.naturalWidth/width,image.naturalHeight/height);
    return effective<dpi?{file:layer.file,dpi:Math.floor(effective)}:null;
  }));
  return results.filter(item=>item!==null);
}

export async function svgPreview(id:string,name:string) {
  const response=await fetch(studioFileUrl(id));
  if(!response.ok) throw new Error("O SVG original não está disponível.");
  const original=await response.blob();
  if(original.size>5*1024*1024) throw new Error("Para aplicar SVGs acima de 5 MB, envie uma cópia em PNG.");
  const text=await original.text();
  if(/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(text)) throw new Error("Este SVG usa recursos externos. Envie uma cópia em PNG.");
  const document=new DOMParser().parseFromString(text,"image/svg+xml");
  const root=document.documentElement;
  if(root.localName!=="svg"||root.namespaceURI!=="http://www.w3.org/2000/svg"||document.querySelector("parsererror"))
    throw new Error("O SVG não pôde ser lido.");
  for(const element of [root,...root.querySelectorAll("*")]){
    if(["script","foreignobject","iframe","object","embed","a","style","animate","set","animatetransform","animatemotion"].includes(element.localName.toLowerCase()))
      throw new Error("Este SVG contém recursos interativos. Envie uma cópia em PNG.");
    for(const attribute of Array.from(element.attributes)){
      const value=attribute.value.trim();
      if(/^on/i.test(attribute.localName)||attribute.localName==="href"&&!value.startsWith("#")
        ||attribute.localName==="style"&&/@import/i.test(value)||/url\s*\(\s*["']?[^#"'\s]/i.test(value))
        throw new Error("Este SVG contém uma referência externa. Envie uma cópia em PNG.");
    }
  }
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)],{type:"image/svg+xml"}));
  try{
    const image=new Image();
    image.src=url;
    await image.decode();
    const ratio=image.naturalWidth/image.naturalHeight;
    if(!Number.isFinite(ratio)||ratio<=0) throw new Error("O SVG não tem dimensões válidas.");
    const canvas=window.document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(2800*Math.min(1,ratio)));
    canvas.height=Math.max(1,Math.round(2800*Math.min(1,1/ratio)));
    const ctx=canvas.getContext("2d");
    if(!ctx) throw new Error("Seu navegador não conseguiu preparar a imagem.");
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(data=>data?resolve(data):reject(new Error("Falha ao converter o SVG.")),"image/png"));
    return new File([blob],name.replace(/\.svg$/i,"")+"-aplicacao.png",{type:"image/png"});
  }finally{URL.revokeObjectURL(url);}
}
