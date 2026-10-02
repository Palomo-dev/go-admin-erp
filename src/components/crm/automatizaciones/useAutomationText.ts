'use client';
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { automationTextKey, interpolateAutomationText, type AutomationText } from '@/lib/services/crm/automation/automationText';
/** El catálogo permanece declarativo; la traducción ocurre al presentar su texto. */
export function useAutomationText(): AutomationText {
  const t = useTranslations('crm.automatizaciones');
  return useCallback((source, values) => {
    if (!source) return '';
    const key=automationTextKey(source);
    if (!t.has(key)) return interpolateAutomationText(source, values);
    const args=Object.fromEntries(Object.entries(values ?? {}).map(([name,value]) => [name, typeof value === 'number' ? value : String(value ?? '')]));
    return t(key,args);
  },[t]);
}
