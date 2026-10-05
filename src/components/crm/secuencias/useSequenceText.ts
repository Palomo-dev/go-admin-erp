'use client';
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { automationTextKey, interpolateAutomationText, type AutomationText } from '@/lib/services/crm/automation/automationText';
/** Traduce la presentación del catálogo canónico sin cambiar sus valores técnicos. */
export function useSequenceText():AutomationText {
 const t=useTranslations('crm.secuencias');
 return useCallback((source,values)=>{if(!source)return '';const key=automationTextKey(source);if(!t.has(key))return interpolateAutomationText(source,values);return t(key,Object.fromEntries(Object.entries(values??{}).map(([k,v])=>[k,typeof v==='number'?v:String(v??'')])));},[t]);
}
