const encoder=new TextEncoder();
const bytes=(s:string)=>encoder.encode(s);
const xml=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));
export function download(content:BlobPart,name:string,type:string){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement("a"); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function crc32(data:Uint8Array){
  let n=-1;
  for(const b of data){n^=b;for(let j=0;j<8;j++) n=(n>>>1)^(n&1?0xedb88320:0);}
  return (n^-1)>>>0;
}
export function workbook(rows:(string|number)[][],name:string){
  const cell=(v:string|number)=>typeof v==="number"?`<c><v>${v}</v></c>`:`<c t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  const ns="http://schemas.openxmlformats.org";
  const rel=ns+"/package/2006/relationships";
  const docs=ns+"/officeDocument/2006/relationships";
  const sheet=ns+"/spreadsheetml/2006/main";
  const files={
    "[Content_Types].xml":`<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels":`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${docs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml":`<workbook xmlns="${sheet}" xmlns:r="${docs}"><sheets><sheet name="Relatório" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${docs}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml":`<worksheet xmlns="${sheet}"><sheetData>${rows.map(row=>`<row>${row.map(cell).join("")}</row>`).join("")}</sheetData></worksheet>`,
  };
  const blocks:Uint8Array<ArrayBuffer>[]=[], directory:Uint8Array<ArrayBuffer>[]=[];
  let offset=0,centralSize=0;
  for(const [name,raw] of Object.entries(files)){
    const data=bytes(raw), filename=bytes(name), crc=crc32(data);
    const h=new Uint8Array(30), v=new DataView(h.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,crc,true);
    v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);
    const c=new Uint8Array(46), d=new DataView(c.buffer);
    d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint32(16,crc,true);
    d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,filename.length,true);d.setUint32(42,offset,true);
    blocks.push(h,filename,data);directory.push(c,filename);offset+=h.length+filename.length+data.length;centralSize+=c.length+filename.length;
  }
  const end=new Uint8Array(22),ev=new DataView(end.buffer), count=Object.keys(files).length;
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,count,true);ev.setUint16(10,count,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
  return new File([...blocks,...directory,end],name,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
const pdfText=(s:string)=>"("+Array.from(s.replaceAll("—","-")).map(c=>{
  const n=c.charCodeAt(0);
  return n>255?"?":n>126||n<32||"()\\".includes(c)?"\\"+n.toString(8).padStart(3,"0"):c;
}).join("")+")";
function wrap(line:string){
  const words=line.split(/\s+/), chunks:string[]=[];
  let current="";
  for(const word of words){if(current && current.length+word.length>95){chunks.push(current);current="";}current+=(current?" ":"")+word;}
  chunks.push(current);
  return chunks;
}
async function jpegLogo(source:string){
  if(!source) return null;
  const image=new Image(); image.src=source;
  try{await image.decode();}catch{return null;}
  const scale=Math.min(1,220/image.width,100/image.height);
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const ctx=canvas.getContext("2d")!;
  ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const base=canvas.toDataURL("image/jpeg",.9).split(",")[1];
  return {w:canvas.width,h:canvas.height,data:Array.from(atob(base),c=>c.charCodeAt(0).toString(16).padStart(2,"0")).join("")+">"};
}
export async function pdf(name:string,title:string,company:string,lines:string[],logo=""){
  const mark=await jpegLogo(logo);
  const body=lines.flatMap(wrap), count=Math.max(1,Math.ceil(body.length/39));
  const objs=["", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"];
  let markId=0;
  if(mark){markId=objs.length+1;objs.push(`<< /Type /XObject /Subtype /Image /Width ${mark.w} /Height ${mark.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${mark.data.length} >>\nstream\n${mark.data}\nendstream`);}
  const pages:number[]=[];
  for(let i=0;i<count;i++){
    const stream=[
      "0.05 0.1 0.2 rg 0 810 595 32 re f", "0.63 0.91 0.31 rg 42 786 55 4 re f",
      ...(mark?[`q ${mark.w*.48} 0 0 ${mark.h*.48} ${553-mark.w*.48} 750 cm /Logo Do Q`]:[]),
      "0.08 0.13 0.23 rg",`BT /F 12 Tf 42 758 Td ${pdfText(company)} Tj ET`,`BT /F 22 Tf 42 725 Td ${pdfText(title)} Tj ET`,
      ...body.slice(i*39,i*39+39).map((line,j)=>`BT /F 10 Tf 42 ${689-j*15} Td ${pdfText(line)} Tj ET`),
      `BT /F 9 Tf 42 42 Td ${pdfText(`Página ${i+1} de ${count}`)} Tj ET`
    ].join("\n");
    const page=objs.length+1;pages.push(page);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F 3 0 R >> ${mark?"/XObject << /Logo "+markId+" 0 R >>":""} >> /Contents ${page+1} 0 R >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objs[0]="<< /Type /Catalog /Pages 2 0 R >>";
  objs[1]=`<< /Type /Pages /Kids [${pages.map(p=>p+" 0 R").join(" ")}] /Count ${count} >>`;
  let out="%PDF-1.4\n", offsets="0000000000 65535 f \n";
  objs.forEach((object,i)=>{offsets+=String(out.length).padStart(10,"0")+" 00000 n \n";out+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=out.length;
  out+=`xref\n0 ${objs.length+1}\n${offsets}trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new File([out],name,{type:"application/pdf"});
}
export function saveFile(file:File){download(file,file.name,file.type);}
