import {z} from "zod";
import {studioModes} from "./studio";

const color=z.string().regex(/^#[a-f\d]{6}$/i);
const decimal=(min:number,max:number)=>z.number().finite().min(min).max(max);
const layer=z.object({
  id:z.string().uuid(),kind:z.enum(["image","text"]),file:z.string().uuid().or(z.literal("")),
  text:z.string().max(140),color,x:decimal(0,1),y:decimal(0,1),w:decimal(.01,5),h:decimal(.01,5),
  angle:decimal(-360,360),opacity:decimal(0,1),locked:z.boolean(),fit:z.enum(["contain","cover"]),
});
const panel=z.object({
  width:decimal(5,300),height:decimal(5,300),bleed:decimal(0,10),margin:decimal(0,20),
  color,gradient:color.or(z.literal("")),pattern:z.enum(["none","stripes","dots"]),layers:z.array(layer).max(30),
}).refine(p=>p.margin*2<Math.min(p.width,p.height),"Margem maior que o painel");
export const designSchema=z.object({
  name:z.string().trim().min(2).max(100),product:z.number().int().positive(),color,fabric:z.string().trim().max(300),
  mode:z.enum(studioModes),sizes:z.array(z.object({size:z.string().trim().min(1).max(40),qty:z.number().int().min(0).max(100000)})).min(1).max(100),
  panels:z.object({front:panel,back:panel,right:panel,left:panel}),
});
