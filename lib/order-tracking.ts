import {code,stages} from "./atacado";

export type TrackingEvent={label:string;at:string};
export type TrackingOrder={
  id:number;product:string;quantity:number;stage:string;due:string;events:TrackingEvent[];
};

export function orderFromTrackingPath(search:string){
  const value=new URLSearchParams(search).get("pedido");
  const match=value?.match(/^PED-(\d{1,16})$/i);
  const id=Number(match?.[1]);
  return Number.isSafeInteger(id)&&id>0?id:null;
}

export function trackingPath(id:number){
  return "/?pedido="+code("order",id);
}

export function trackingEvents(created:string, entries:{action:string;at:string;detail:string}[]):TrackingEvent[]{
  const events=entries.flatMap(entry=>{
    if(entry.action==="Etapa de produção"&&stages.includes(entry.detail))
      return [{label:entry.detail,at:entry.at}];
    if(entry.action==="Arte aprovada"||entry.action==="Alteração solicitada")
      return [{label:entry.action==="Arte aprovada"?"Arte aprovada":"Alteração de arte solicitada",at:entry.at}];
    return [];
  });
  return [...events,{label:"Pedido registrado",at:created}];
}
