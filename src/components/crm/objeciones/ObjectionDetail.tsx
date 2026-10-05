'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { CLASE_CAMPO } from '../kit/camposCrm';
import type { LibraryRow } from './objectionLibraryModel';
import type { Objection, ObjectionInput } from '@/lib/services/crm/objectionService';
import { splitList, joinList } from '@/lib/services/crm/objectionModel';
import { ObjectionEvidence } from './ObjectionEvidence';
import { useObjectionEditor } from './useObjectionEditor';
import { ObjectionDetailHeader } from './ObjectionDetailHeader';

export function ObjectionDetail({ objection, onClose, onEdit, onSave, onToggle, canManage, busy=false,metrics }: {
  canManage: boolean; objection: Objection; busy?: boolean;
  onClose: () => void; onEdit: (row: Objection) => void;
  onSave: (data: ObjectionInput, id?: string) => Promise<unknown>;
  onToggle: () => Promise<void>;
  metrics?:LibraryRow;
}) {
  const t = useTranslations('crm.objecionesNuevo');
  const [signal,setSignal] = useState(''), [imported,setImported] = useState(false);
  const [copyState,setCopyState] = useState<'idle'|'done'|'error'>('idle');
  const [addingSignal,setAddingSignal] = useState(false);
  const {form,setForm,saving,error,submit,appendResponse,dirty} = useObjectionEditor({
    open:true,row:objection,onSave,onSaved:()=>setImported(false),
  });
  const locked = !canManage || saving || busy;
  const signals = splitList(form.signalsText);
  const addSignal = () => {
    const next=joinList([...signals,signal.trim()]);
    if(!signal.trim()||next.length>20000)return;
    setForm({...form,signalsText:next});setSignal('');setAddingSignal(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(form.recommended_response); setCopyState('done'); }
    catch { setCopyState('error'); }
  };
  return <section aria-label={objection.title} className="p-4 lg:p-6">
    <ObjectionDetailHeader objection={objection} canManage={canManage} locked={locked} saving={saving} busy={busy} dirty={dirty}
      copyState={copyState} canCopy={!!form.recommended_response} onCopy={()=>void copy()} onClose={onClose} onEdit={()=>onEdit(objection)}
      onSave={()=>void submit()} onToggle={()=>void onToggle()} metrics={metrics}/>
    <div className="space-y-4 lg:mt-4">
    {error&&<p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">{error}</p>}
    {imported&&<p role="status" className="text-sm text-success-text">{t('visual.alternativeDraft')}</p>}
    <ObjectionEvidence key={objection.id} id={objection.id} busy={locked}
      onUseResponse={canManage?(text)=>{if(appendResponse(text))setImported(true);}:undefined}>
      {({responses,activity})=><div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.78fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <section className="space-y-2.5 rounded-xl border border-line bg-surface p-4">
            <h2 className="text-base font-semibold leading-[22px] text-fg">{t('signals')}</h2>
            <ul className="flex flex-wrap gap-2">{signals.map((value)=><li key={value}
              className="flex h-7 items-center gap-1.5 rounded-full bg-brand-tint px-2.5 py-1 text-xs font-medium text-brand-deep">
              {value}{canManage&&<button type="button" aria-label={t('visual.removeSignal',{signal:value})}
                disabled={locked} onClick={()=>setForm({...form,signalsText:joinList(signals.filter(item=>item!==value))})}>
                <X className="size-3"/></button>}
            </li>)}</ul>
            {canManage&&(addingSignal?<div className="flex gap-2"><input className={CLASE_CAMPO} aria-label={t('visual.addSignal')} value={signal} autoFocus
              disabled={locked} maxLength={20000} placeholder={t('visual.addSignal')}
              onChange={(event)=>setSignal(event.target.value)}
              onKeyDown={(event)=>{if(event.key==='Enter'){event.preventDefault();addSignal();}}}/>
              <button type="button" className={clasesBoton({variante:'fantasma',tamano:'sm',patron:'button'})} disabled={locked||!signal.trim()||joinList([...signals,signal.trim()]).length>20000}
                onClick={addSignal}>{t('visual.addSignal')}</button></div>:<button type="button" className={clasesBoton({variante:'fantasma',tamano:'sm',patron:'button'})} disabled={locked} onClick={()=>setAddingSignal(true)}>{t('visual.addSignal')}</button>)}
          </section>
          <section className="space-y-2.5 rounded-xl border border-line bg-surface p-4">
            <h2 className="text-base font-semibold leading-[22px] text-fg">{t('recommended')}</h2>
            <textarea className={`${CLASE_CAMPO.replace('h-10 ','')} min-h-16 resize-y p-3 leading-5`} aria-label={t('recommended')} rows={2} maxLength={5000} disabled={locked}
              value={form.recommended_response} onChange={(event)=>setForm({...form,recommended_response:event.target.value})}/>
            {copyState==='error'&&<p role="alert" className="text-sm text-danger">{t('copyError')}</p>}
            <p className="text-xs font-medium leading-4 text-fg-secondary">{t('questions')}</p>
            <ul className="space-y-2 text-[13px] leading-[18px] text-fg">{splitList(form.questionsText).map(question=><li key={question}>· {question}</li>)}</ul>
          </section>
          {responses}
        </div>
        <aside className="min-w-0 rounded-xl border border-line bg-surface p-4">{activity}</aside>
      </div>}
    </ObjectionEvidence>
    </div>
  </section>;
}
