'use client';
import {useTranslations,useFormatter} from 'next-intl';
import {ArrowLeft,Copy,Save,TriangleAlert,X,Pencil} from 'lucide-react';
import {PageHeader,RowActionsMenu,clasesBoton} from '@/components/kit';
import type {AccionFila} from '@/components/kit/acciones';
import type {Objection} from '@/lib/services/crm/objectionService';
import type {LibraryRow} from './objectionLibraryModel';

export function ObjectionDetailHeader({objection,canManage,locked,saving,busy,dirty,copyState,canCopy,onCopy,onClose,onEdit,onSave,onToggle,metrics}:{
 objection:Objection;canManage:boolean;locked:boolean;saving:boolean;busy:boolean;dirty:boolean;
 copyState:'idle'|'done'|'error';canCopy:boolean;onCopy:()=>void;onClose:()=>void;onEdit:()=>void;
 onSave:()=>void;onToggle:()=>void;metrics?:LibraryRow;
}){
 const t=useTranslations('crm.objecionesNuevo'),format=useFormatter();
 const category=objection.category?(t.has(`categories.${objection.category}`)?t(`categories.${objection.category}`):objection.category):t('noCategory');
 const metadata=metrics?.calls===null||!metrics?category:t('visual.detailMetadata',{category,count:metrics.calls,rate:metrics.advancedRate===null?'—':format.number(metrics.advancedRate,{style:'percent',maximumFractionDigits:0})});
 const edit:AccionFila={id:'edit',etiqueta:t('edit'),icono:Pencil,onSelect:onEdit,deshabilitada:locked||dirty};
 const save:AccionFila={id:'save',etiqueta:t(saving?'saving':'save'),icono:Save,onSelect:onSave,deshabilitada:locked};
 const status:AccionFila={id:'status',etiqueta:t(objection.is_active?'deactivate':'activate',{title:''}).trim(),icono:X,onSelect:onToggle,deshabilitada:locked||dirty};
 const copy:AccionFila={id:'copy',etiqueta:t(copyState==='done'?'copied':'copy'),icono:Copy,onSelect:onCopy,deshabilitada:!canCopy};
 const close:AccionFila={id:'close',etiqueta:t('close'),icono:ArrowLeft,onSelect:onClose,deshabilitada:saving||busy};
 return <PageHeader titulo={objection.title} subtitulo={metadata} icono={TriangleAlert} variante="detail"
  migas={[{etiqueta:'CRM',href:'/app/crm'},{etiqueta:t('title')}]} movil={{ocultarBarra:true,accion:<RowActionsMenu titulo={objection.title} acciones={[...(canManage?[save,edit,status]:[]),copy,close]}/>}}
  acciones={<div className="flex gap-2">
   {canManage&&<><button type="button" className={clasesBoton({variante:'secundario',patron:'button'})} disabled={status.deshabilitada} title={dirty?t('visual.saveBeforeStatus'):undefined} onClick={onToggle}>
    <X className="size-4"/>{status.etiqueta}
   </button><button type="button" className={clasesBoton({variante:'primario',patron:'button'})} disabled={locked} onClick={onSave}><Save className="size-4"/>{save.etiqueta}</button></>}
   <RowActionsMenu titulo={objection.title} orientacion="horizontal" tamano="md" acciones={[...(canManage?[edit]:[]),copy,close]}/>
  </div>}/>;
}
