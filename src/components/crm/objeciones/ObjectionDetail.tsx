'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Copy, Save, TriangleAlert, X, Pencil } from 'lucide-react';
import { PageHeader, RowActionsMenu, clasesBoton } from '@/components/kit';
import type { AccionFila } from '@/components/kit/acciones';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Objection, ObjectionInput } from '@/lib/services/crm/objectionService';
import { splitList, joinList } from '@/lib/services/crm/objectionModel';
import { ObjectionEvidence } from './ObjectionEvidence';
import { useObjectionEditor } from './useObjectionEditor';

export function ObjectionDetail({ objection, onClose, onEdit, onSave, onToggle, canManage, busy=false }: {
  canManage: boolean; objection: Objection; busy?: boolean;
  onClose: () => void; onEdit: (row: Objection) => void;
  onSave: (data: ObjectionInput, id?: string) => Promise<unknown>;
  onToggle: () => Promise<void>;
}) {
  const t = useTranslations('crm.objecionesNuevo');
  const [signal,setSignal] = useState(''), [imported,setImported] = useState(false);
  const [copyState,setCopyState] = useState<'idle'|'done'|'error'>('idle');
  const {form,setForm,saving,error,submit,appendResponse,dirty} = useObjectionEditor({
    open:true,row:objection,onSave,onSaved:()=>setImported(false),
  });
  const locked = !canManage || saving || busy;
  const signals = splitList(form.signalsText);
  const addSignal = () => {
    const next=joinList([...signals,signal.trim()]);
    if(!signal.trim()||next.length>20000)return;
    setForm({...form,signalsText:next});setSignal('');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(form.recommended_response); setCopyState('done'); }
    catch { setCopyState('error'); }
  };
  const category = t.has(`categories.${objection.category}`) ? t(`categories.${objection.category}`) : objection.category;
  const mobileActions:AccionFila[]=[
    ...(canManage?[
      {id:'save',etiqueta:t(saving?'saving':'save'),icono:Save,onSelect:()=>void submit(),deshabilitada:locked},
      {id:'edit',etiqueta:t('edit'),icono:Pencil,onSelect:()=>onEdit(objection),deshabilitada:locked||dirty},
      {id:'status',etiqueta:t(objection.is_active?'deactivate':'activate',{title:''}).trim(),icono:X,onSelect:()=>void onToggle(),deshabilitada:locked||dirty},
    ]:[]),
    {id:'close',etiqueta:t('close'),icono:ArrowLeft,onSelect:onClose,deshabilitada:saving||busy},
  ];
  return <section aria-label={objection.title} className="space-y-4 p-4 lg:p-6">
    <PageHeader titulo={objection.title} subtitulo={category} icono={TriangleAlert}
      variante="detail" migas={[{etiqueta:'CRM',href:'/app/crm'},{etiqueta:t('title')}]}
      movil={{ocultarBarra:true,accion:<RowActionsMenu titulo={objection.title} acciones={mobileActions}/>}}
      acciones={<div className="flex gap-2">
        {canManage&&<><button type="button" className={clasesBoton({variante:'secundario'})}
          disabled={locked||dirty} title={dirty?t('visual.saveBeforeStatus'):undefined} onClick={()=>void onToggle()}>
          <X className="size-4"/>{t(objection.is_active?'deactivate':'activate',{title:''}).trim()}
        </button><button type="button" className={clasesBoton({variante:'primario'})} disabled={locked}
          onClick={()=>void submit()}><Save className="size-4"/>{t(saving?'saving':'save')}</button></>}
        <RowActionsMenu titulo={objection.title} acciones={[
          ...(canManage?[{id:'edit',etiqueta:t('edit'),icono:Pencil,onSelect:()=>onEdit(objection),deshabilitada:locked||dirty}]:[]),
          {id:'close',etiqueta:t('close'),icono:ArrowLeft,onSelect:onClose,deshabilitada:saving||busy},
        ]}/>
      </div>}/>
    {error&&<p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">{error}</p>}
    {imported&&<p role="status" className="text-sm text-success-text">{t('visual.alternativeDraft')}</p>}
    <ObjectionEvidence key={objection.id} id={objection.id} busy={locked}
      onUseResponse={canManage?(text)=>{if(appendResponse(text))setImported(true);}:undefined}>
      {({responses,activity})=><div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.78fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
            <h2 className="font-semibold text-fg">{t('signals')}</h2>
            <ul className="flex flex-wrap gap-2">{signals.map((value)=><li key={value}
              className="flex items-center gap-1 rounded-full bg-brand-tint px-3 py-1 text-xs text-brand-deep">
              {value}{canManage&&<button type="button" aria-label={t('visual.removeSignal',{signal:value})}
                disabled={locked} onClick={()=>setForm({...form,signalsText:joinList(signals.filter(item=>item!==value))})}>
                <X className="size-3"/></button>}
            </li>)}</ul>
            {canManage&&<div className="flex gap-2"><Input aria-label={t('visual.addSignal')} value={signal}
              disabled={locked} maxLength={20000} placeholder={t('visual.addSignal')}
              onChange={(event)=>setSignal(event.target.value)}
              onKeyDown={(event)=>{if(event.key==='Enter'){event.preventDefault();addSignal();}}}/>
              <button type="button" className={clasesBoton({variante:'fantasma'})} disabled={locked||!signal.trim()||joinList([...signals,signal.trim()]).length>20000}
                onClick={addSignal}>{t('visual.addSignal')}</button></div>}
          </section>
          <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
            <h2 className="font-semibold text-fg">{t('recommended')}</h2>
            <Textarea aria-label={t('recommended')} rows={3} maxLength={5000} disabled={locked}
              value={form.recommended_response} onChange={(event)=>setForm({...form,recommended_response:event.target.value})}/>
            {form.recommended_response&&<button type="button" className={clasesBoton({variante:'secundario'})}
              onClick={()=>void copy()}><Copy className="size-4"/>{t(copyState==='done'?'copied':'copy')}</button>}
            {copyState==='error'&&<p role="alert" className="text-sm text-danger">{t('copyError')}</p>}
            <label className="block text-xs font-medium text-fg-secondary" htmlFor="objection-detail-questions">{t('questions')}</label>
            <Textarea id="objection-detail-questions" rows={3} maxLength={20000} disabled={locked}
              value={form.questionsText} onChange={(event)=>setForm({...form,questionsText:event.target.value})}/>
          </section>
          {responses}
        </div>
        <aside className="min-w-0 rounded-xl border border-line bg-surface p-4">{activity}</aside>
      </div>}
    </ObjectionEvidence>
  </section>;
}
