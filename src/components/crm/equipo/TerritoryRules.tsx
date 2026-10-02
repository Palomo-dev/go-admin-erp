'use client';
import {useLocale,useTranslations} from 'next-intl';
import type {TeamTerritory} from '@/lib/services/crm/teamManagementModel';
import {normalizarFiltroSegmento} from '@/lib/services/crm/segmentosLogica';
import {isGroup,type ConditionNode} from '@/lib/services/crm/automation/conditionsDsl';
import {fieldLabel,operatorLabel,CONDITION_FIELD_LABELS,type ConditionLocale} from '@/lib/services/crm/automation/conditionsI18n';

export function TerritoryRules({criteria}:{criteria:TeamTerritory['criteria']}){
 const locale=useLocale() as ConditionLocale,t=useTranslations('crm.equipoNuevo'),conditions=useTranslations('crm.condicionesNuevo');
 const value=(item:unknown):string=>Array.isArray(item)?new Intl.ListFormat(locale,{style:'long',type:'conjunction'}).format(item.map(value)):item===null||item===undefined?'':typeof item==='object'?JSON.stringify(item):String(item);
 const node=(rule:ConditionNode,depth=0):string=>depth>6?'—':isGroup(rule)?`${conditions(`${rule.op}_`)}: (${rule.rules.map(child=>node(child,depth+1)).join(' · ')})`:[fieldLabel(rule.field,locale),operatorLabel(rule.operator,locale),value(rule.value)].filter(Boolean).join(' ');
 const legacyField=(field:string)=>{
  const labels=CONDITION_FIELD_LABELS[locale]??CONDITION_FIELD_LABELS.es;
  return fieldLabel(labels[`customer.${field}`]?`customer.${field}`:labels[`opportunity.${field}`]?`opportunity.${field}`:field,locale);
 };
 let lines:string[]=[];
 try{
  if(criteria.filter){const filter=normalizarFiltroSegmento(criteria.filter);lines=filter.rules.length?[filter.rules.length===1?node(filter.rules[0]):node(filter)]:[];}
  else if(criteria.rules)lines=criteria.rules.flatMap(rule=>typeof rule.field_key==='string'&&typeof rule.operator==='string'?[[legacyField(rule.field_key),operatorLabel(rule.operator,locale),value(rule.value)].filter(Boolean).join(' ')]:[]);
 }catch{lines=[];}
 return <div className="space-y-2"><p className="text-xs font-medium text-fg-secondary">{t('visual.rules')}</p>
  <p className="break-words text-[13px] leading-[18px] text-fg">{lines.length?lines.join(' · '):'—'}</p>
  {criteria.rules&&!criteria.filter&&<p className="text-xs text-fg-secondary">{t('legacyCriteria')}</p>}
 </div>;
}
