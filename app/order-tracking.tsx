"use client";

import {useEffect,useRef,useState} from "react";
import {CalendarDays,Clock3,Package,RefreshCw} from "lucide-react";
import {code,dateBR} from "../lib/atacado";
import type {TrackingOrder} from "../lib/order-tracking";

const timestamp=new Intl.DateTimeFormat("pt-BR",{
  dateStyle:"short",timeStyle:"short",timeZone:"America/Sao_Paulo",
});

export default function OrderTracking({id,rev}:{id:number;rev:number}){
  const [order,setOrder]=useState<TrackingOrder|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [request,setRequest]=useState(0);
  const latest=useRef<AbortController|null>(null);

  useEffect(()=>{
    const controller=new AbortController();
    latest.current=controller;
    setLoading(true);setError("");
    async function load(){
      try{
        const response=await fetch("/api/record/"+id+"/tracking",{cache:"no-store",signal:controller.signal});
        if(!response.ok){
          if(response.status===401)throw new Error("Sua sessão terminou. Entre novamente para acompanhar o pedido.");
          if(response.status===403||response.status===404)throw new Error("Este pedido não está disponível para sua conta.");
          throw new Error("Não foi possível atualizar o acompanhamento. Tente novamente.");
        }
        const next=await response.json() as TrackingOrder;
        if(latest.current===controller)setOrder(next);
      }catch(error){
        if(!controller.signal.aborted){
          setOrder(null);setError(error instanceof Error?error.message:"Não foi possível consultar o pedido.");
        }
      }finally{
        if(!controller.signal.aborted)setLoading(false);
      }
    }
    void load();
    return()=>controller.abort();
  },[id,rev,request]);

  return <section className="tracking" aria-label="Acompanhamento do pedido">
    <div className="tracking-header">
      <div><span className="eyebrow">{code("order",id)}</span><h3>Acompanhar pedido</h3></div>
      <button type="button" className="btn secondary" disabled={loading} onClick={()=>setRequest(value=>value+1)}>
        <RefreshCw size={15}/> {loading?"Atualizando…":"Atualizar"}
      </button>
    </div>
    {error&&<p className="error-text" role="alert">{error}</p>}
    {loading&&!order&&<p role="status">Carregando as etapas do pedido…</p>}
    {order&&<>
      <div className="order-highlight" aria-live="polite">
        <div><span>Etapa atual</span><h3>{order.stage}</h3></div>
        <Clock3 size={21}/>
      </div>
      <dl className="tracking-facts">
        <div><dt><Package size={15}/> Produto</dt><dd>{order.product||"—"}</dd></div>
        <div><dt>Quantidade</dt><dd>{order.quantity} peças</dd></div>
        <div><dt><CalendarDays size={15}/> Previsão de entrega</dt><dd>{order.due?dateBR(order.due):"A definir"}</dd></div>
      </dl>
      <h4>Histórico do pedido</h4>
      <ol className="tracking-events">{order.events.map((event,index)=><li key={event.at+"-"+index}>
        <strong>{event.label}</strong>
        <time dateTime={event.at}>{Number.isNaN(Date.parse(event.at))?"Data indisponível":timestamp.format(new Date(event.at))}</time>
      </li>)}</ol>
    </>}
  </section>;
}
