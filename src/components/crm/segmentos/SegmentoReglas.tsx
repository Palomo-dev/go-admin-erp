'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { clasesBoton } from '@/components/kit/botonClases';
import { ConditionBuilder, toEditableGroup } from '@/components/crm/shared/ConditionBuilder';
import { ConditionValue } from '@/components/crm/shared/ConditionValue';
import { CAMPOS_SEGMENTO } from '@/lib/services/crm/segmentosLogica';
import { isGroup, OPERATORS, type ConditionGroup, type ConditionNode, type ConditionOperator } from '@/lib/services/crm/automation/conditionsDsl';
import { fieldLabel, operatorLabel, type ConditionLocale } from '@/lib/services/crm/automation/conditionsI18n';

/** Presentación de los grupos del constructor; el DSL y su evaluación siguen siendo canónicos. */
export function SegmentoReglas({ value, onChange, disabled }: { value: unknown; onChange: (value: unknown) => void; disabled?: boolean }) {
  const t = useTranslations('crm.segmentosNuevo');
  const c = useTranslations('crm.condicionesNuevo');
  const locale = useLocale() as ConditionLocale;
  const root = toEditableGroup(value);
  const groups: ConditionGroup[] = root.op === 'or' && root.rules.every(isGroup) ? root.rules : [root];
  // Los filtros heredados más profundos conservan el editor original, sin aplanar su lógica.
  if (groups.some(group => group.rules.some(isGroup))) return <ConditionBuilder value={value} onChange={onChange} disabled={disabled} allowedFields={CAMPOS_SEGMENTO} />;
  const update = (index: number, group: ConditionGroup) => onChange(groups.length === 1 && root.op !== 'or' ? group : { op: 'or', rules: groups.map((g, i) => i === index ? group : g) });
  const total = groups.reduce((n, group) => n + group.rules.length, 0);
  const emptyRule = () => ({ field: 'customer.city', operator: 'eq' as const, value: '' });
  return <section aria-label={t('rules')} className="space-y-4">
    {groups.map((group, index) => <div key={index} className="space-y-4">
      {index > 0 && <span className="inline-flex rounded-full border border-line bg-subtle px-2 text-xs text-fg-secondary">{t('or')}</span>}
      <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold leading-[22px] text-fg">{group.op === 'or' ? c('or_') : t(index ? 'orGroup' : 'allGroup')}</h2>
          <button type="button" aria-label={t('removeGroup')} disabled={disabled} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
            onClick={() => onChange({ op: 'or', rules: groups.filter((_, i) => i !== index) })}><Trash2 className="size-4" strokeWidth={1.5} /></button>
        </div>
        {group.rules.map((node, i) => {
          if (isGroup(node)) return null;
          const replace = (next: ConditionNode) => update(index, { ...group, rules: group.rules.map((r, n) => n === i ? next : r) });
          return <div key={i} className="grid items-center gap-2 sm:grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_28px]">
            <span className="hidden text-[13px] text-fg-secondary sm:block">{i ? t(group.op === 'or' ? 'or' : 'and') : ''}</span>
            <SelectCrm aria-label={c('field')} valor={node.field} disabled={disabled} opciones={CAMPOS_SEGMENTO.map(f => ({ valor: f, etiqueta: fieldLabel(f, locale) }))} onValorChange={field => replace({ ...node, field, value: '' })} />
            <SelectCrm aria-label={c('operator')} valor={node.operator} disabled={disabled} opciones={OPERATORS.map(op => ({ valor: op, etiqueta: operatorLabel(op, locale) }))} onValorChange={op => replace({ ...node, operator: op as ConditionOperator, value: undefined })} />
            {['is_null', 'is_not_null'].includes(node.operator) ? <span /> : <ConditionValue rule={node} disabled={disabled} onChange={value => replace({ ...node, value })} />}
            <button type="button" aria-label={c('remove')} disabled={disabled} className="flex size-7 items-center justify-center rounded-md text-fg-secondary hover:bg-danger-subtle hover:text-danger-text focus-visible:ring-2 focus-visible:ring-brand"
              onClick={() => update(index, { ...group, rules: group.rules.filter((_, n) => n !== i) })}><Trash2 className="size-3.5" strokeWidth={1.5} /></button>
          </div>;
        })}
        <button type="button" disabled={disabled || total >= 50} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
          onClick={() => update(index, { ...group, rules: [...group.rules, emptyRule()] })}><Plus className="size-4" strokeWidth={1.5} />{c('addRule')}</button>
      </div>
    </div>)}
    <button type="button" disabled={disabled || total >= 50} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
      onClick={() => onChange({ op: 'or', rules: [...groups, { op: 'and', rules: [emptyRule()] }] })}><Plus className="size-4" strokeWidth={1.5} />{c('addGroup')}</button>
  </section>;
}
