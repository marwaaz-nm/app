'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowLeft, Download, FileText, GripVertical, Loader2, Map, Move, Save } from 'lucide-react';
import L from 'leaflet';
import { supabase } from '@/lib/supabase';
import { useSettings, type SurveyPdfDesignSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import type { Survey } from '@/types';

type Point = { x: number; y: number };
type BlockId = 'header'|'title'|'summary'|'boundaries'|'sketch'|'notes'|'signatures'|'mapTitle'|'map'|'mapDetails';
type Design = SurveyPdfDesignSettings & {
  fontSizes: { title:number; subtitle:number; body:number; section:number; footer:number };
  positions: Record<BlockId, Point>;
  sketchSize: { width:number; height:number };
  mapSize: { width:number; height:number };
};

const defaultPositions: Record<BlockId, Point> = {
  header:{x:7,y:4}, title:{x:8,y:15}, summary:{x:7,y:24}, boundaries:{x:7,y:43}, sketch:{x:7,y:60},
  notes:{x:7,y:84}, signatures:{x:7,y:91}, mapTitle:{x:7,y:5}, map:{x:7,y:14}, mapDetails:{x:7,y:80},
};
const defaultDesign: Design = {
  title:'LAND SURVEY REPORT', subtitle:'Warbixinta Sahanka Dhulka', accent:'#2563eb', font:'Arial', density:'comfortable',
  showLogo:true, showFooter:true, sections:{summary:true,boundaries:true,sketch:true,certification:true}, notes:'',
  fontSizes:{title:25,subtitle:12,body:12,section:11,footer:8}, positions:defaultPositions,
  sketchSize:{width:100,height:230}, mapSize:{width:100,height:650},
};
const sampleSurvey: Survey = {
  id:0, serial_no:1, survey_no:'SURV-0001', owner_name:'Magaca Milkiilaha', neighborhood:'Xaafadda', branch:'Laanta 1aad',
  vicinity:'Aagga dhulka', land_type:'Dhul Banaan', gps_location:'3.115662, 43.649544', sketch_area:'274.46 m²',
  boundary_w_val:'25 m', boundary_w_neighbor:'Deriska Waqooyi', boundary_b_val:'15 m', boundary_b_neighbor:'Deriska Bari',
  boundary_k_val:'25 m', boundary_k_neighbor:'Deriska Koonfur', boundary_g_val:'15 m', boundary_g_neighbor:'Deriska Galbeed',
  polygon_boundary:'3.1159,43.6492;3.1159,43.6498;3.1154,43.6498;3.1154,43.6492', created_at:new Date().toISOString(),
};

function mergeDesign(saved: SurveyPdfDesignSettings): Design {
  return {...defaultDesign,...saved,sections:{...defaultDesign.sections,...saved.sections},fontSizes:{...defaultDesign.fontSizes,...saved.fontSizes},
    positions:{...defaultPositions,...(saved.positions||{})} as Record<BlockId,Point>,sketchSize:{...defaultDesign.sketchSize,...saved.sketchSize},mapSize:{...defaultDesign.mapSize,...saved.mapSize}};
}
function coords(value?: string|null): [number,number][] {
  if(!value)return[]; return [...value.matchAll(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/g)].map(m=>[Number(m[1]),Number(m[2])]);
}
function Draggable({id,design,editable,onMove,children,className=''}:{id:BlockId;design:Design;editable:boolean;onMove:(id:BlockId,p:Point)=>void;children:ReactNode;className?:string}) {
  const point=design.positions[id];
  const start=(event:ReactPointerEvent<HTMLButtonElement>)=>{
    if(!editable)return; event.preventDefault(); const page=event.currentTarget.parentElement?.parentElement; if(!page)return;
    const rect=page.getBoundingClientRect(), sx=event.clientX, sy=event.clientY, original=point;
    const move=(e:PointerEvent)=>onMove(id,{x:Math.max(0,Math.min(94,original.x+(e.clientX-sx)/rect.width*100)),y:Math.max(0,Math.min(96,original.y+(e.clientY-sy)/rect.height*100))});
    const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop)};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop,{once:true});
  };
  return <div className={`absolute ${className}`} style={{left:`${point.x}%`,top:`${point.y}%`}}>{editable&&<button type="button" onPointerDown={start} className="pdf-drag-handle absolute -left-6 top-0 z-20 flex h-6 w-6 cursor-move items-center justify-center rounded-md bg-slate-900 text-white shadow"><GripVertical className="h-3.5 w-3.5"/></button>}{children}</div>;
}
function PlotSketch({survey,accent,height}:{survey:Survey;accent:string;height:number}) {
  const shape=coords(survey.polygon_boundary).length>=3?coords(survey.polygon_boundary):coords(sampleSurvey.polygon_boundary);
  const xs=shape.map(p=>p[1]),ys=shape.map(p=>p[0]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const mapped=shape.map(([lat,lng])=>`${35+(lng-minX)/(maxX-minX||1)*530},${245-(lat-minY)/(maxY-minY||1)*205}`).join(' ');
  return <svg viewBox="0 0 600 280" style={{height}} className="w-full rounded-lg border bg-slate-50"><defs><pattern id="pdf-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#cbd5e1" strokeWidth=".6"/></pattern></defs><rect width="600" height="280" fill="url(#pdf-grid)"/><polygon points={mapped} fill={`${accent}22`} stroke={accent} strokeWidth="4"/>{shape.map((_,i)=>{const [x,y]=mapped.split(' ')[i].split(',');return <g key={i}><circle cx={x} cy={y} r="5" fill="white" stroke={accent} strokeWidth="3"/><text x={Number(x)+8} y={Number(y)-7} fontSize="11" fontWeight="700">P{i+1}</text></g>})}</svg>;
}
function SurveyMap({survey,accent,height}:{survey:Survey;accent:string;height:number}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!ref.current)return;const gps=coords(survey.gps_location)[0]||[3.115662,43.649544];const map=L.map(ref.current,{center:gps,zoom:18,zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false});L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',{maxZoom:22,subdomains:['mt0','mt1','mt2','mt3'],crossOrigin:true}).addTo(map);const polygon=coords(survey.polygon_boundary);if(polygon.length>=3)L.polygon(polygon,{color:accent,weight:4,fillOpacity:.16}).addTo(map).bindTooltip(survey.owner_name,{permanent:true,direction:'center'});L.circleMarker(gps,{radius:7,color:'#fff',weight:3,fillColor:accent,fillOpacity:1}).addTo(map);setTimeout(()=>map.invalidateSize(),100);return()=>{map.remove()}},[survey,accent]);
  return <div ref={ref} style={{height}} className="w-full overflow-hidden rounded-lg border-2 border-slate-300 bg-slate-100"/>;
}

export default function SurveyDesignerPage(){
  const {settings,refetch}=useSettings();const {profile}=useAuth();const isAdmin=profile?.role==='Admin'||profile?.role==='SuperAdmin';
  const [design,setDesign]=useState<Design>(()=>mergeDesign(settings.survey_pdf_design));const [survey,setSurvey]=useState<Survey>(sampleSurvey);
  const [saving,setSaving]=useState(false),[exporting,setExporting]=useState(false),[message,setMessage]=useState('');
  const page1Ref=useRef<HTMLDivElement>(null),page2Ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    // Shared settings may finish loading after this editor mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesign(mergeDesign(settings.survey_pdf_design));
  },[settings.survey_pdf_design]);
  useEffect(()=>{const id=Number(new URLSearchParams(window.location.search).get('survey'));if(!id)return;void supabase.from('surveys').select('*').eq('id',id).single().then(({data})=>{if(data)setSurvey(data as Survey)})},[]);
  const update=<K extends keyof Design>(key:K,value:Design[K])=>setDesign(d=>({...d,[key]:value}));
  const move=(id:BlockId,p:Point)=>setDesign(d=>({...d,positions:{...d.positions,[id]:p}}));
  const fontSize=(key:keyof Design['fontSizes'],value:number)=>setDesign(d=>({...d,fontSizes:{...d.fontSizes,[key]:value}}));
  const save=async()=>{setSaving(true);setMessage('');try{const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Fadlan dib u gal.');const response=await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({survey_pdf_design:design})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Template-ka lama kaydin.');await refetch();setMessage('Template-ka guud waa la kaydiyey.')}catch(error){setMessage(error instanceof Error?error.message:'Template-ka lama kaydin.')}finally{setSaving(false)}};
  const download=async()=>{if(!page1Ref.current||!page2Ref.current)return;setExporting(true);try{const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')]);const pdf=new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});for(const [index,page] of [page1Ref.current,page2Ref.current].entries()){const canvas=await html2canvas(page,{scale:2,useCORS:true,backgroundColor:'#fff'});if(index)pdf.addPage('a4','portrait');pdf.addImage(canvas.toDataURL('image/jpeg',.98),'JPEG',0,0,210,297,undefined,'FAST')}pdf.save(`Survey_${survey.survey_no||survey.serial_no}_${survey.owner_name.replace(/\W+/g,'_')}.pdf`)}finally{setExporting(false)}};
  const sectionTitle=(text:string)=><h2 className="mb-2 rounded-md px-3 py-2 font-black uppercase tracking-wider text-white" style={{background:design.accent,fontSize:design.fontSizes.section}}>{text}</h2>;
  const field=(label:string,value?:string|null)=><div className="border-b border-slate-200 py-1.5"><p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="font-semibold" style={{fontSize:design.fontSizes.body}}>{value||'—'}</p></div>;
  return <div className="min-h-full bg-slate-100 p-3 text-slate-800 md:p-6"><div className="mx-auto max-w-[1700px] space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><Link href="/settings?tab=pdf" className="flex h-10 w-10 items-center justify-center rounded-xl border"><ArrowLeft className="h-4 w-4"/></Link><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white"><FileText className="h-5 w-5"/></span><div><h1 className="text-lg font-black">Survey PDF Template Editor</h1><p className="text-xs font-semibold text-slate-500">Hal design · Dhammaan survey PDF-yada · 2 bog A4</p></div></div><div className="flex gap-2"><button onClick={save} disabled={!isAdmin||saving} className="flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white disabled:opacity-40">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>} Kaydi Template-ka</button><button onClick={download} disabled={exporting} className="flex h-10 items-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-bold text-white">{exporting?<Loader2 className="h-4 w-4 animate-spin"/>:<Download className="h-4 w-4"/>} Test PDF</button></div></header>
    {message&&<div className={`rounded-xl border px-4 py-3 text-xs font-bold ${message.includes('waa la')?'border-emerald-200 bg-emerald-50 text-emerald-700':'border-rose-200 bg-rose-50 text-rose-700'}`}>{message}</div>}
    <main className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]"><aside className="h-fit space-y-5 rounded-2xl border bg-white p-4 shadow-sm xl:sticky xl:top-4"><div><p className="text-sm font-black">Design Settings</p><p className="mt-1 text-[10px] text-slate-500"><Move className="mr-1 inline h-3 w-3"/>Handle-ka madow ku dhaqaaji block kasta.</p></div>
      <label className="block text-[10px] font-bold text-slate-500">CINWAANKA<input value={design.title} onChange={e=>update('title',e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-xs"/></label><label className="block text-[10px] font-bold text-slate-500">CINWAAN-HOOSE<input value={design.subtitle} onChange={e=>update('subtitle',e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-xs"/></label>
      <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-bold">MIDAB<input type="color" value={design.accent} onChange={e=>update('accent',e.target.value)} className="mt-1 h-9 w-full rounded border p-1"/></label><label className="text-[10px] font-bold">FONT<select value={design.font} onChange={e=>update('font',e.target.value as Design['font'])} className="mt-1 h-9 w-full rounded border px-2 text-xs"><option>Arial</option><option>Georgia</option><option>Times New Roman</option></select></label></div>
      <div className="space-y-3 border-t pt-4"><p className="text-[10px] font-black">FONT SIZES</p>{([['title','Cinwaan',14,42],['subtitle','Cinwaan-hoose',8,24],['body','Qoraalka xogta',8,20],['section','Section title',8,20],['footer','Footer',6,14]] as const).map(([key,label,min,max])=><label key={key} className="block text-[10px] font-bold"><span className="flex justify-between"><span>{label}</span><b>{design.fontSizes[key]}px</b></span><input type="range" min={min} max={max} value={design.fontSizes[key]} onChange={e=>fontSize(key,Number(e.target.value))} className="w-full"/></label>)}</div>
      <div className="space-y-3 border-t pt-4"><p className="text-[10px] font-black">SKETCH RESIZE</p><Range label="Ballac" value={design.sketchSize.width} min={35} max={100} suffix="%" onChange={v=>update('sketchSize',{...design.sketchSize,width:v})}/><Range label="Dherer" value={design.sketchSize.height} min={120} max={360} suffix="px" onChange={v=>update('sketchSize',{...design.sketchSize,height:v})}/></div>
      <div className="space-y-3 border-t pt-4"><p className="text-[10px] font-black">PAGE 2 MAP RESIZE</p><Range label="Ballac" value={design.mapSize.width} min={40} max={100} suffix="%" onChange={v=>update('mapSize',{...design.mapSize,width:v})}/><Range label="Dherer" value={design.mapSize.height} min={300} max={780} suffix="px" onChange={v=>update('mapSize',{...design.mapSize,height:v})}/></div>
      <label className="block text-[10px] font-bold">QORAAL DHEERAAD AH<textarea value={design.notes} onChange={e=>update('notes',e.target.value)} rows={3} className="mt-1 w-full rounded-lg border p-2 text-xs"/></label><button onClick={()=>setDesign(defaultDesign)} className="w-full rounded-xl border py-2.5 text-xs font-bold">Soo celi Default</button></aside>
      <section className="min-w-0 space-y-5 overflow-auto rounded-2xl border bg-slate-200/70 p-3 md:p-6">{[1,2].map(n=><div key={n} className="mx-auto w-[794px]"><p className="mb-2 text-center text-[10px] font-black uppercase tracking-[.18em] text-slate-500">A4 · Bogga {n}</p><div ref={n===1?page1Ref:page2Ref} className="survey-pdf-page relative h-[1123px] w-[794px] overflow-hidden bg-white shadow-2xl" style={{fontFamily:design.font}}>{n===1?<PageOne design={design} survey={survey} settings={settings} editable={Boolean(isAdmin)} move={move} field={field} sectionTitle={sectionTitle}/>:<PageTwo design={design} survey={survey} editable={Boolean(isAdmin)} move={move} field={field}/>} {design.showFooter&&<footer className="absolute bottom-5 left-[7%] flex w-[86%] justify-between border-t pt-2 text-slate-400" style={{fontSize:design.fontSizes.footer}}><span>Generated by {settings.org_name_en}</span><span>Bogga {n} / 2</span></footer>}</div></div>)}</section>
    </main></div></div>;
}

function Range({label,value,min,max,suffix,onChange}:{label:string;value:number;min:number;max:number;suffix:string;onChange:(v:number)=>void}){return <label className="block text-[10px] font-bold"><span className="flex justify-between"><span>{label}</span><b>{value}{suffix}</b></span><input type="range" min={min} max={max} value={value} onChange={e=>onChange(Number(e.target.value))} className="w-full"/></label>}
type PageProps={design:Design;survey:Survey;editable:boolean;move:(id:BlockId,p:Point)=>void;field:(l:string,v?:string|null)=>ReactNode};
function PageOne({design,survey,settings,editable,move,field,sectionTitle}:PageProps&{settings:{logo_url:string|null;org_name_so:string;org_name_en:string};sectionTitle:(t:string)=>ReactNode}){return <><Draggable id="header" design={design} editable={editable} onMove={move} className="w-[86%]"><div className="flex justify-between border-b-4 pb-4" style={{borderColor:design.accent}}><div className="flex items-center gap-3">{design.showLogo&&settings.logo_url?<Image src={settings.logo_url} alt="Logo" width={58} height={58} unoptimized/>:<span className="flex h-14 w-14 items-center justify-center rounded-xl text-white" style={{background:design.accent}}><FileText/></span>}<div><b className="text-lg">{settings.org_name_so}</b><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{settings.org_name_en}</p></div></div><div className="text-right"><p className="text-[9px] font-bold text-slate-400">SURVEY NO.</p><b className="text-xl" style={{color:design.accent}}>#{survey.survey_no||survey.serial_no}</b></div></div></Draggable><Draggable id="title" design={design} editable={editable} onMove={move} className="w-[84%] text-center"><h1 className="font-black" style={{fontSize:design.fontSizes.title}}>{design.title}</h1><p style={{fontSize:design.fontSizes.subtitle,color:design.accent}}>{design.subtitle}</p></Draggable>{design.sections.summary&&<Draggable id="summary" design={design} editable={editable} onMove={move} className="w-[86%]">{sectionTitle('01 · Xogta Guud / General Information')}<div className="grid grid-cols-2 gap-x-8">{field('Magaca Milkiilaha',survey.owner_name)}{field('Nooca Dhulka',survey.land_type)}{field('Xaafadda',survey.neighborhood)}{field('Laanta',survey.branch)}{field('Aagga',survey.vicinity)}{field('GPS',survey.gps_location)}{field('Baaxadda',survey.sketch_area)}{field('Dhismaha',survey.built_details)}</div></Draggable>}{design.sections.boundaries&&<Draggable id="boundaries" design={design} editable={editable} onMove={move} className="w-[86%]">{sectionTitle('02 · Xuduudaha & Cabbirrada')}<table className="w-full border-collapse" style={{fontSize:design.fontSizes.body}}><thead><tr className="bg-slate-100"><th className="border p-2">Jiho</th><th className="border p-2">Cabbir</th><th className="border p-2">Deris / Xad</th></tr></thead><tbody>{[['Waqooyi',survey.boundary_w_val,survey.boundary_w_neighbor],['Bari',survey.boundary_b_val,survey.boundary_b_neighbor],['Koonfur',survey.boundary_k_val,survey.boundary_k_neighbor],['Galbeed',survey.boundary_g_val,survey.boundary_g_neighbor]].map(r=><tr key={r[0]}>{r.map((v,i)=><td key={i} className="border p-2">{v}</td>)}</tr>)}</tbody></table></Draggable>}{design.sections.sketch&&<Draggable id="sketch" design={design} editable={editable} onMove={move} className="w-[86%]">{sectionTitle('03 · Naqshadda Dhulka / Site Sketch')}<div style={{width:`${design.sketchSize.width}%`}}><PlotSketch survey={survey} accent={design.accent} height={design.sketchSize.height}/></div></Draggable>}{design.notes&&<Draggable id="notes" design={design} editable={editable} onMove={move} className="w-[86%]"><div className="rounded border bg-slate-50 p-3" style={{fontSize:design.fontSizes.body}}>{design.notes}</div></Draggable>}{design.sections.certification&&<Draggable id="signatures" design={design} editable={editable} onMove={move} className="grid w-[86%] grid-cols-2 gap-16 text-center text-[10px]"><div className="border-t pt-2">Saxiixa Surveyor-ka</div><div className="border-t pt-2">Shaabad & Ansixin</div></Draggable>}</>}
function PageTwo({design,survey,editable,move,field}:PageProps){return <><Draggable id="mapTitle" design={design} editable={editable} onMove={move} className="w-[86%]"><div className="flex justify-between border-b-4 pb-4" style={{borderColor:design.accent}}><div><h2 className="flex items-center gap-2 font-black" style={{fontSize:design.fontSizes.title}}><Map/> SATELLITE LOCATION MAP</h2><p style={{fontSize:design.fontSizes.subtitle,color:design.accent}}>Khariidadda iyo goobta dhulka</p></div><b style={{color:design.accent}}>#{survey.survey_no||survey.serial_no}</b></div></Draggable><Draggable id="map" design={design} editable={editable} onMove={move} className="w-[86%]"><div style={{width:`${design.mapSize.width}%`}}><SurveyMap survey={survey} accent={design.accent} height={design.mapSize.height}/></div></Draggable><Draggable id="mapDetails" design={design} editable={editable} onMove={move} className="w-[86%]"><div className="grid grid-cols-3 gap-3 rounded-xl border bg-slate-50 p-4">{field('Milkiilaha',survey.owner_name)}{field('GPS',survey.gps_location)}{field('Baaxadda',survey.sketch_area)}</div></Draggable></>}
