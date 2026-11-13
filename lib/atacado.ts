export const stages = ["Orçamento solicitado","Orçamento enviado","Aguardando aprovação","Arte em desenvolvimento","Arte enviada para aprovação","Arte aprovada","Aguardando pagamento","Em impressão","Em corte","Em costura","Em acabamento","Em conferência","Pronto para entrega","Enviado ou entregue"];
export const categories = ["Camiseta tradicional","Camiseta manga longa","Camiseta regata","Camiseta baby look","Camiseta esportiva","Camiseta para corrida de rua","Camiseta agro","Uniforme empresarial","Camiseta promocional","Sacochilas personalizadas"];
export const fileCategories = ["Logotipo","Frente","Costas","Mangas","Mockup","Comprovante","Foto do produto","Outro"];
export const clientTypes = ["Pessoa física","Empresa","Revendedor","Equipe esportiva","Organizador de eventos"];
export const quoteStates = ["Solicitado","Rascunho","Enviado","Aguardando aprovação","Aprovado","Recusado"];
export const quoteActions: Record<string, {status:string; label:string}[]> = {
  "Solicitado": [{status:"Rascunho",label:"Preparar orçamento"}],
  "Rascunho": [{status:"Enviado",label:"Marcar como enviado"}],
  "Enviado": [{status:"Aguardando aprovação",label:"Aguardar aprovação"}, {status:"Aprovado",label:"Aprovar orçamento"}, {status:"Recusado",label:"Recusar orçamento"}, {status:"Rascunho",label:"Revisar orçamento"}],
  "Aguardando aprovação": [{status:"Aprovado",label:"Aprovar orçamento"}, {status:"Recusado",label:"Recusar orçamento"}, {status:"Rascunho",label:"Revisar orçamento"}],
  "Aprovado": [{status:"Rascunho",label:"Revisar orçamento"}],
  "Recusado": [{status:"Rascunho",label:"Reabrir orçamento"}],
};
export function availableQuoteActions(status:string, isStaff:boolean, isClient:boolean) {
  const actions=quoteActions[status] ?? [];
  if(isStaff) return actions;
  return isClient ? actions.filter(action=>["Aprovado","Recusado"].includes(action.status)) : [];
}
export const quoteEditable = (status:string) => status==="Solicitado" || status==="Rascunho";
export function quoteCommercialError(quote:{price:number;total:number;valid?:string}) {
  if(!(quote.price>0) || !(quote.total>0)) return "Informe e salve um preço unitário e um total maiores que zero.";
  if(quote.valid && quote.valid<today()) return "O orçamento venceu. A equipe comercial precisa atualizar a validade.";
  return "";
}
export const sizes = ["Infantil 2","Infantil 4","Infantil 6","Infantil 8","Infantil 10","Infantil 12","Infantil 14","PP","P","M","G","GG","XG","EXG","Especial"];
export const initialTiers = [[10,29,35],[30,49,32],[50,99,29],[100,199,26],[200,499,23],[500,0,0]];
export const roles = ["Administrador","Vendedor","Produção","Cliente"];
export const code = (kind:string,id:number) => ({client:"CLI",product:"PRD",quote:"ORÇ",order:"PED"}[kind] || "REG")+"-"+String(id).padStart(4,"0");
export const brl = (v:number) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v);
export const dateBR = (value:string) => value ? value.slice(0,10).split("-").reverse().join("/") : "—";
export const today = () => new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
export const round = (n:number) => Math.round((n + Number.EPSILON)*100)/100;

export function whatsappNumber(value:unknown) {
  if(typeof value!=="string") return "";
  const input=value.trim();
  if(!/^\+?[0-9().\s-]+$/.test(input)) return "";
  let digits=input.replace(/\D/g,"");
  if(input.startsWith("+")) return /^[1-9]\d{7,14}$/.test(digits)?digits:"";
  if(digits.startsWith("00")) {
    digits=digits.slice(2);
    return /^[1-9]\d{7,14}$/.test(digits)?digits:"";
  }
  if(/^[1-9]\d{9,10}$/.test(digits)) return "55"+digits;
  return /^55[1-9]\d{9,10}$/.test(digits)?digits:"";
}

export function productionWhatsapp(order:{id:number;body:{clientName?:string;productName?:string;stage?:number}}, company:string, phone:string, trackingUrl?:string) {
  const stage=stages[order.body.stage ?? -1];
  if(!phone||!stage) return "";
  const greeting=order.body.clientName?`Olá, ${order.body.clientName}!`:"Olá!";
  const product=order.body.productName?` • ${order.body.productName}`:"";
  const message=[
    greeting,
    `Aqui é da ${company}. Temos uma atualização sobre seu pedido ${code("order",order.id)}${product}.`,
    `Etapa atual: ${stage}.`,
    ...(trackingUrl?[`Acompanhe seu pedido: ${trackingUrl}`]:[])
  ].join("\n\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
