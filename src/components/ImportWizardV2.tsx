'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { processImportRowsAction } from '@/app/actions/importActions'
import { importFieldsForMode, inferImportMapping, type ImportMode } from '@/lib/import-mapping'

type Row = Record<string,string>
type Result = { message:string; warnings:string[]; errors:string[]; summary:{products:number;markets:number;competitorUrls:number;readyForMonitoring:number} }
type PreviewResponse = { headers:string[]; preview:Row[]; rows?:Row[]; format:'CSV'|'XLSX'; error?:string }

const steps = [
  ['Bron', 'Bestand kiezen'],
  ['Kolommen', 'Automatisch koppelen'],
  ['Controle', 'Preview bekijken'],
  ['Resultaat', 'Import afronden'],
] as const

function templateHeaders(mode:ImportMode){ return importFieldsForMode(mode).map((field)=>field.label) }
function filenameFor(mode:ImportMode){ return mode==='products'?'prysight-producten-template.csv':mode==='competitors'?'prysight-concurrenten-template.csv':'prysight-volledige-import-template.csv' }

export function ImportWizard(){
  const [step,setStep]=useState(1),[mode,setMode]=useState<ImportMode>('products'),[filename,setFilename]=useState(''),[format,setFormat]=useState<'CSV'|'XLSX'>('CSV')
  const [headers,setHeaders]=useState<string[]>([]),[rows,setRows]=useState<Row[]>([]),[mapping,setMapping]=useState<Record<string,string>>({}),[result,setResult]=useState<Result|null>(null),[uploadError,setUploadError]=useState<string|null>(null)
  const [isPending,startTransition]=useTransition()
  const fields=useMemo(()=>importFieldsForMode(mode),[mode])
  const mappedRows=useMemo(()=>rows.map((row)=>Object.fromEntries(Object.entries(mapping).filter(([,column])=>Boolean(column)).map(([target,column])=>[target,row[column]??'']))),[rows,mapping])
  const preview=mappedRows.slice(0,5), autoMapped=fields.filter((field)=>Boolean(mapping[field.key])).length
  const mappingPct=fields.length?Math.round((autoMapped/fields.length)*100):0
  const warnings=useMemo(()=>{const list:string[]=[];if(!mapping.articleNumber)list.push('Artikelnummer of SKU ontbreekt.');if(mode!=='competitors'&&!mapping.productName)list.push('Productnaam ontbreekt.');if(!mapping.country)list.push('Land ontbreekt, NL wordt als standaard gebruikt.');if(mode!=='products'&&!mapping.competitorUrl)list.push('Concurrent URL ontbreekt.');if(mode!=='products'&&!mapping.competitorName)list.push('Concurrentnaam ontbreekt.');return list},[mapping,mode])

  async function upload(file:File){
    setUploadError(null)
    const body=new FormData();body.append('file',file)
    const response=await fetch('/api/import',{method:'POST',body})
    const payload=await response.json() as PreviewResponse
    if(!response.ok||payload.error){setUploadError(payload.error??'Bestand kon niet worden gelezen.');return}
    setFilename(file.name);setFormat(payload.format);setHeaders(payload.headers);setRows(payload.rows??payload.preview);setMapping(inferImportMapping(payload.headers));setResult(null);setStep(2)
  }

  function downloadTemplate(){const csv=`${templateHeaders(mode).join(';')}\n`;const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filenameFor(mode);a.click();URL.revokeObjectURL(url)}
  function run(){setStep(4);setResult(null);startTransition(async()=>setResult(await processImportRowsAction({filename,format,mode,mapping,rows:mappedRows})))}
  function resetAutoMapping(){setMapping(inferImportMapping(headers))}

  return <div className="strong-panel overflow-hidden">
    <div className="ps-stepper">
      {steps.map(([label,description],index)=>{
        const number=index+1,active=step>=number
        return <div key={label} className={`ps-step ${active?'ps-step-active':''}`}>
          <span className="ps-step-number">{number}</span>
          <span className="min-w-0"><span className="block text-[10px] font-black">{label}</span><span className="mt-0.5 hidden truncate text-[9px] font-semibold opacity-70 sm:block">{description}</span></span>
        </div>
      })}
    </div>

    <div className="p-5 sm:p-6">
      {step===1?<div className="space-y-6">
        <div><p className="eyebrow">Stap 1</p><h2 className="mt-2 text-[20px] font-black">Wat wil je toevoegen?</h2><p className="mt-1.5 max-w-3xl text-[11px] font-medium leading-5 text-[#748296]">Kies je bron. Prysight herkent daarna zoveel mogelijk kolommen zelf, zodat je alleen uitzonderingen hoeft te controleren.</p></div>

        <div className="grid gap-3 md:grid-cols-3">
          {([['products','Producten','Productdata, EAN, GTIN, eigen prijzen, kostprijs en marges.','P'],['competitors','Concurrenten','Concurrenten, product URLs, voorraad en gemeten prijzen.','C'],['combined','Alles in één','Product en concurrentiedata in dezelfde import verwerken.','A']] as const).map(([value,title,description,icon])=><button type="button" key={value} onClick={()=>setMode(value)} className={`ps-choice-card ${mode===value?'ps-choice-card-active':''}`}>
            <div className="flex items-start justify-between gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-[11px] text-[13px] font-black ${mode===value?'bg-[#2f7edb] text-white':'bg-white text-[#63758b] shadow-[0_5px_12px_rgba(31,48,70,.07)]'}`}>{icon}</span>{mode===value?<span className="ps-chip ps-chip-blue">Gekozen</span>:null}</div>
            <p className="mt-4 text-[13px] font-black text-[#2c4058]">{title}</p><p className="mt-1.5 text-[10px] font-semibold leading-5 text-[#748296]">{description}</p>
          </button>)}
        </div>

        <div className="ps-upload-zone" onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{event.preventDefault();const file=event.dataTransfer.files?.[0];if(file)void upload(file)}}>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#e8f2ff] text-[#2f7edb]">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>
          </div>
          <p className="mt-3 text-[13px] font-black text-[#2c4058]">Sleep je CSV of Excel bestand hierheen</p>
          <p className="mt-1 text-[10px] font-semibold text-[#7b8999]">of kies een bestand vanaf je computer</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <label htmlFor="prysight-import-file" className="primary-action cursor-pointer">Bestand kiezen</label>
            <button type="button" onClick={downloadTemplate} className="secondary-action">Template downloaden</button>
          </div>
          <input id="prysight-import-file" type="file" accept=".csv,.xlsx" className="sr-only" onChange={(event)=>{const file=event.target.files?.[0];if(file)void upload(file)}}/>
          <p className="mt-4 text-[9px] font-semibold text-[#8a98a9]">Automatische herkenning voor SKU, EAN, GTIN, MPN, merk, model, verpakking, prijs, kostprijs, marge, voorraad en pricingmodus.</p>
          {uploadError?<div className="mx-auto mt-4 max-w-2xl rounded-[11px] bg-[#fff0f2] px-4 py-3 text-left text-[10px] font-bold text-[#b6414d]">{uploadError}</div>:null}
        </div>
      </div>:null}

      {step===2?<div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="eyebrow">Stap 2</p><h2 className="mt-2 text-[20px] font-black">Controleer de kolommen</h2><p className="mt-1.5 text-[11px] font-medium text-[#748296]">{filename}, {rows.length} regels, {format}. Prysight heeft {autoMapped} van {fields.length} relevante velden gekoppeld.</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" className="secondary-action" onClick={()=>setStep(1)}>Ander bestand</button><button type="button" className="primary-action" onClick={()=>setStep(3)}>Preview bekijken</button></div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center rounded-[14px] bg-[#f4f7fa] p-4">
          <div><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black text-[#445970]">Automatische koppeling</span><span className="text-[11px] font-black text-[#2f7edb]">{mappingPct}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#dce5ee]"><div className="h-full rounded-full bg-[#2f7edb]" style={{width:`${mappingPct}%`}} /></div></div>
          <button type="button" onClick={resetAutoMapping} className="secondary-action min-h-[37px] px-3 py-2 text-[9px]">Opnieuw herkennen</button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {fields.map((field)=>{
            const linked=Boolean(mapping[field.key])
            return <label key={field.key} className="rounded-[13px] bg-[#f7f9fb] p-3.5 shadow-[inset_0_0_0_1px_#e5ebf1]">
              <span className="flex items-center justify-between gap-2"><span className="text-[10px] font-black text-[#53677e]">{field.label}</span><span className={`ps-chip ${linked?'ps-chip-green':'ps-chip-amber'}`}>{linked?'Gekoppeld':'Controleren'}</span></span>
              <select className="toolbar-control mt-2 w-full" value={mapping[field.key]??''} onChange={(event)=>setMapping((current)=>({...current,[field.key]:event.target.value}))}><option value="">Niet gekoppeld</option>{headers.map((header)=><option key={header} value={header}>{header}</option>)}</select>
            </label>
          })}
        </div>
      </div>:null}

      {step===3?<div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Stap 3</p><h2 className="mt-2 text-[20px] font-black">Preview en validatie</h2><p className="mt-1.5 text-[11px] font-medium text-[#748296]">Controleer een paar regels. Na bevestigen wordt de import opgeslagen en start discovery server side in batches.</p></div><div className="flex gap-2"><button type="button" className="secondary-action" onClick={()=>setStep(2)}>Terug</button><button type="button" className="ps-button-green" onClick={run}>Import starten</button></div></div>

        <div className={`rounded-[14px] p-4 ${warnings.length?'bg-[#fff4df]':'bg-[#eaf8f0]'}`}>
          <div className="flex items-center justify-between gap-3"><div><p className={`text-[11px] font-black ${warnings.length?'text-[#a36816]':'text-[#20814d]'}`}>{warnings.length?`${warnings.length} aandachtspunten`:'Mapping ziet er goed uit'}</p><p className="mt-1 text-[9px] font-semibold text-[#718196]">{warnings.length?'Je kunt doorgaan, maar controleer deze velden eerst.':'Alle belangrijke basisvelden zijn herkenbaar gekoppeld.'}</p></div><span className={`ps-chip ${warnings.length?'ps-chip-amber':'ps-chip-green'}`}>{warnings.length?'Controleren':'Klaar'}</span></div>
          {warnings.length?<ul className="mt-3 grid gap-1.5 text-[10px] font-semibold text-[#8a611f] sm:grid-cols-2">{warnings.map((warning)=><li key={warning}>• {warning}</li>)}</ul>:null}
        </div>

        <div className="overflow-x-auto rounded-[15px] bg-white shadow-[0_9px_24px_rgba(31,48,70,.07)]"><table className="min-w-full text-[10px] shadow-none"><thead><tr>{Object.keys(preview[0]??{}).map((key)=><th className="px-3 py-2.5 text-left" key={key}>{key}</th>)}</tr></thead><tbody>{preview.map((row,index)=><tr key={index}>{Object.entries(row).map(([key,value])=><td key={key} className="whitespace-nowrap px-3 py-2.5">{value||'—'}</td>)}</tr>)}</tbody></table></div>
      </div>:null}

      {step===4?<div className="space-y-5">
        <div><p className="eyebrow">Stap 4</p><h2 className="mt-2 text-[20px] font-black">{isPending?'Import wordt verwerkt…':result?.errors.length?'Import afgerond met aandachtspunten':'Import succesvol afgerond'}</h2>{isPending?<p className="mt-1.5 text-[11px] font-medium text-[#748296]">Producten, markten en pricingvelden worden nu verwerkt.</p>:result?<p className="mt-1.5 text-[11px] font-medium text-[#748296]">{result.message}</p>:null}</div>

        {isPending?<div className="rounded-[15px] bg-[#f4f7fa] p-5"><div className="h-2 overflow-hidden rounded-full bg-[#dce5ee]"><div className="prysight-loading-bar h-full w-1/3 rounded-full bg-[#2f7edb]" /></div><p className="mt-3 text-[10px] font-bold text-[#65788e]">Even geduld, grote bestanden worden veilig in batches verwerkt.</p></div>:null}

        {!isPending&&result?<>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Producten',result.summary.products,'P'],['Markten',result.summary.markets,'M'],['Concurrent URLs',result.summary.competitorUrls,'U'],['Monitoring klaar',result.summary.readyForMonitoring,'✓']].map(([label,value,icon])=><div key={String(label)} className="rounded-[14px] bg-[#f5f8fb] p-4 shadow-[inset_0_0_0_1px_#e2e9f0]"><div className="flex items-center justify-between"><p className="text-[10px] font-bold text-[#748296]">{label}</p><span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-white text-[10px] font-black text-[#2f7edb] shadow-[0_4px_10px_rgba(31,48,70,.06)]">{icon}</span></div><p className="mt-2 text-[24px] font-black text-[#26394f]">{value}</p></div>)}</div>
          {result.errors.length?<div className="rounded-[14px] bg-[#fff0f2] p-4"><p className="text-[10px] font-black text-[#b6414d]">Deze regels vragen aandacht</p><ul className="mt-2 space-y-1 text-[10px] font-semibold text-[#9d4952]">{result.errors.slice(0,20).map((error)=><li key={error}>• {error}</li>)}</ul></div>:null}
          {result.warnings.length?<div className="rounded-[14px] bg-[#fff4df] p-4"><p className="text-[10px] font-black text-[#a36816]">Waarschuwingen</p><ul className="mt-2 space-y-1 text-[10px] font-semibold text-[#8a611f]">{result.warnings.slice(0,20).map((warning)=><li key={warning}>• {warning}</li>)}</ul></div>:null}
          <div className="flex flex-wrap gap-2"><button type="button" className="secondary-action" onClick={()=>{setStep(1);setResult(null);setRows([]);setHeaders([]);setFilename('')}}>Nieuwe import</button><Link href="/producten" className="primary-action">Producten bekijken</Link></div>
        </>:null}
      </div>:null}
    </div>
  </div>
}
