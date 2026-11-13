export const views = ["front","back","right","left"] as const;
export type View = typeof views[number];
export const viewNames:Record<View,string> = {front:"Frente",back:"Costas",right:"Manga direita",left:"Manga esquerda"};
export const studioAreas = [
  {id:"front",view:"front",label:viewNames.front},
  {id:"back",view:"back",label:viewNames.back},
  {id:"right",view:"right",label:viewNames.right},
  {id:"left",view:"left",label:viewNames.left},
  {id:"shoulder-right",view:"right",label:"Ombro direito"},
  {id:"shoulder-left",view:"left",label:"Ombro esquerdo"},
] as const;
export type Area = typeof studioAreas[number]["id"];
export const studioModes = ["Logotipos","Sublimação total"] as const;
export type Layer = {
  id:string; kind:"image"|"text"; file:string; text:string; color:string;
  x:number; y:number; w:number; h:number; angle:number; opacity:number; locked:boolean; fit:"contain"|"cover";
};
export type Panel = {
  width:number; height:number; bleed:number; margin:number; color:string; gradient:string;
  pattern:"none"|"stripes"|"dots"; layers:Layer[];
};
export type Design = {
  name:string; product:number; color:string; fabric:string; mode:typeof studioModes[number];
  sizes:{size:string;qty:number}[]; panels:Record<View,Panel>;
};
export type StudioFile = {id:string;name:string;type:string;size:number;parent:number;category:string};
export const rasterTypes = ["image/png","image/jpeg","image/webp"];
export const studioStatuses = ["Personalização em andamento","Arte enviada para análise","Aguardando aprovação","Correção solicitada","Arte aprovada","Liberada para produção","Em produção","Finalizada"] as const;
export type StudioStatus = typeof studioStatuses[number];
export const presets:Record<View,{name:string;x:number;y:number;w:number}[]> = {
  front:[{name:"Peito esquerdo",x:.63,y:.31,w:.18},{name:"Peito direito",x:.37,y:.31,w:.18},{name:"Centro superior",x:.5,y:.32,w:.35},{name:"Centro inferior",x:.5,y:.68,w:.38},{name:"Frente central",x:.5,y:.52,w:.46}],
  back:[{name:"Nuca",x:.5,y:.22,w:.18},{name:"Costas superior",x:.5,y:.32,w:.36},{name:"Costas central",x:.5,y:.5,w:.47},{name:"Costas inferior",x:.5,y:.72,w:.38}],
  right:[{name:"Manga direita",x:.5,y:.55,w:.45},{name:"Ombro direito",x:.5,y:.22,w:.4},{name:"Manga completa",x:.5,y:.5,w:.95}],
  left:[{name:"Manga esquerda",x:.5,y:.55,w:.45},{name:"Ombro esquerdo",x:.5,y:.22,w:.4},{name:"Manga completa",x:.5,y:.5,w:.95}],
};
export function hasArtwork(design:Design) {
  return views.some(view=>{
    const panel=design.panels[view];
    return panel.layers.some(layer=>layer.opacity>0&&(layer.kind==="image"||layer.text.trim())) ||
      design.mode==="Sublimação total"&&(panel.color!=="#ffffff"||Boolean(panel.gradient)||panel.pattern!=="none");
  });
}
export function defaultPanel(view:View):Panel {
  return {width:view==="front"||view==="back"?85:45,height:65,bleed:0,margin:4,color:"#ffffff",gradient:"",pattern:"none",layers:[]};
}
export function pixelSize(panel:Panel,dpi:number,bleed=false) {
  const extra=bleed?panel.bleed*2:0;
  return {width:Math.round((panel.width+extra)*dpi/2.54),height:Math.round((panel.height+extra)*dpi/2.54)};
}
export const studioFileUrl=(id:string,preview=false)=>"/api/file/"+encodeURIComponent(id)+(preview?"?preview=1":"");
