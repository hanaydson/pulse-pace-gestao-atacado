/// <reference types="vite/client" />
import {getDocument,GlobalWorkerOptions} from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {studioFileUrl} from "./studio";

GlobalWorkerOptions.workerSrc=worker;

export async function pdfPreview(id:string,name:string,pageNumber:number) {
  const response=await fetch(studioFileUrl(id));
  if(!response.ok) throw new Error("O PDF original não está disponível.");
  const task=getDocument({
    data:await response.arrayBuffer(),
    isEvalSupported:false,
    disableFontFace:true,
    useSystemFonts:true,
    useWasm:false,
    maxImageSize:32000000,
    canvasMaxAreaInBytes:128000000,
  });
  try{
    const document=await task.promise;
    if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>document.numPages)
      throw new Error(`O PDF tem ${document.numPages} páginas. Escolha uma página válida.`);
    const page=await document.getPage(pageNumber);
    const base=page.getViewport({scale:1});
    if(!Number.isFinite(base.width)||!Number.isFinite(base.height)||Math.min(base.width,base.height)<=0)
      throw new Error("A página do PDF não tem dimensões válidas.");
    const viewport=page.getViewport({scale:2800/Math.max(base.width,base.height)});
    const canvas=window.document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(viewport.width));
    canvas.height=Math.max(1,Math.round(viewport.height));
    await page.render({canvas,viewport}).promise;
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(data=>data?resolve(data):reject(new Error("Falha ao converter o PDF.")),"image/png"));
    return new File([blob],name.replace(/\.pdf$/i,"")+"-pagina-"+pageNumber+".png",{type:"image/png"});
  }finally{await task.destroy();}
}
