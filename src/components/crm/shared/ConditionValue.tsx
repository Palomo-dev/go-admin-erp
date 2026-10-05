'use client';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/kit/FormField';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { CampoFechaHora } from '@/components/crm/kit/CampoFechaHora';
import { aFechaHoraLocal, deFechaHoraLocal } from '@/components/crm/kit/fechasCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { ConditionRule } from '@/lib/services/crm/automation/conditionsDsl';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { textToValue } from './ConditionBuilderLogica';

const TIMESTAMPS = new Set(['customer.created_at', 'customer.updated_at', 'customer.last_contact_at', 'customer.last_seen_at', 'customer.last_purchase_at', 'opportunity.last_contact_at']);
const COMPARISONS = new Set(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'before', 'after']);

export function ConditionValue({ rule, disabled, onChange }: { rule: ConditionRule; disabled?: boolean; onChange: (value: unknown) => void }) {
  const t = useTranslations('crm.condicionesNuevo');
  const { timezone } = useFormatDate(null);
  const value = Array.isArray(rule.value) ? rule.value.join(', ') : rule.value == null ? '' : String(rule.value);
  if (COMPARISONS.has(rule.operator) && rule.field === 'opportunity.expected_close_date') {
    return <FormField etiqueta={t('value')} etiquetaOculta><CampoFecha valor={value} disabled={disabled} onValorChange={onChange} /></FormField>;
  }
  if (COMPARISONS.has(rule.operator) && TIMESTAMPS.has(rule.field)) {
    // Un filtro heredado con día puro representa medianoche en la zona de la organización.
    const instant = /^\d{4}-\d{2}-\d{2}$/.test(value) ? deFechaHoraLocal(`${value}T00:00`, timezone) : value;
    return <FormField etiqueta={t('value')} etiquetaOculta>
      <CampoFechaHora valor={aFechaHoraLocal(instant, timezone)} disabled={disabled} onValorChange={local => onChange(deFechaHoraLocal(local, timezone) ?? '')} />
    </FormField>;
  }
  return <input aria-label={t('value')} className={CLASE_CAMPO} disabled={disabled} value={value}
    onChange={event => onChange(textToValue(event.target.value, rule.operator, rule.field))} />;
}
