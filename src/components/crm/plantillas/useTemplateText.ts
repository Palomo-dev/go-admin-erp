'use client';
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { automationTextKey, interpolateAutomationText, type AutomationText } from '@/lib/services/crm/automation/automationText';
/** Sólo presentación: comparte claves estables con los catálogos CRM existentes. */
export function useTemplateText(): AutomationText {
  const t = useTranslations('crm.plantillas');
  return useCallback((source, values) => {
    if (!source) return '';
    const key = automationTextKey(source);
    if (!t.has(key)) return interpolateAutomationText(source, values);
    const args = Object.fromEntries(Object.entries(values ?? {}).map(([name, value]) => [name, typeof value === 'number' ? value : String(value ?? '')]));
    return t(key, args);
  }, [t]);
}
