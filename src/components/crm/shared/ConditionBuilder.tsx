'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { clasesBoton } from '@/components/kit/botonClases';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { CONDITION_FIELDS, OPERATORS, isGroup, validateConditions, type ConditionGroup, type ConditionNode, type ConditionOperator } from '@/lib/services/crm/automation/conditionsDsl';
import { fieldLabel, operatorLabel, type ConditionLocale } from '@/lib/services/crm/automation/conditionsI18n';
import { ConditionValue } from './ConditionValue';
const NO_VALUE = new Set(['is_null', 'is_not_null']);
import { toEditableGroup } from './ConditionBuilderLogica';
export { textToValue, toEditableGroup } from './ConditionBuilderLogica';
interface Props { value: unknown; onChange: (next: unknown) => void; label?: string; disabled?: boolean; allowedFields?: readonly string[] }
export function ConditionBuilder({ value, onChange, label, disabled, allowedFields = CONDITION_FIELDS }: Props) {
  const t = useTranslations('crm.condicionesNuevo');
  const locale = useLocale() as ConditionLocale;
  const [mode, setMode] = useState('visual');
  const [jsonDraft, setJsonDraft] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState(false);
  const root = toEditableGroup(value);
  const count = (node: ConditionNode, depth = 0): number => depth > 6 ? 51 : isGroup(node) ? node.rules.reduce((n, r) => n + count(r, depth + 1), 0) : 1;
  const full = count(root) >= 50;
  const render = (group: ConditionGroup, emit: (next: ConditionGroup) => void, depth: number): React.ReactNode => {
    const replace = (i: number, next: ConditionNode) => emit({ ...group, rules: group.rules.map((r, n) => n === i ? next : r) });
    return <div className="space-y-3 rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SelectCrm aria-label={t('combination')} className="max-w-56" valor={group.op} disabled={disabled}
          opciones={[{ valor: 'and', etiqueta: t('and_') }, { valor: 'or', etiqueta: t('or_') }]}
          onValorChange={op => emit({ ...group, op: op === 'or' ? 'or' : 'and' })} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={disabled || full}
            onClick={() => emit({ ...group, rules: [...group.rules, { field: allowedFields[0] ?? 'customer.city', operator: 'eq', value: '' }] })}>
            <Plus className="size-4" aria-hidden="true" />{t('addRule')}</button>
          {depth < 5 && <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={disabled || full}
            onClick={() => emit({ ...group, rules: [...group.rules, { op: 'and', rules: [{ field: allowedFields[0] ?? 'customer.city', operator: 'eq', value: '' }] }] })}>{t('addGroup')}</button>}
        </div>
      </div>
      {!group.rules.length && <p className="text-sm text-fg-secondary">{t('empty')}</p>}
      {group.rules.map((node, i) => <div key={i} className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{isGroup(node) ? render(node, next => replace(i, next), depth + 1) :
          <div className="grid gap-2 md:grid-cols-3">
            <SelectCrm aria-label={t('field')} valor={node.field} disabled={disabled}
              opciones={allowedFields.map(f => ({ valor: f, etiqueta: fieldLabel(f, locale) }))}
              onValorChange={field => replace(i, { ...node, field, value: '' })} />
            <SelectCrm aria-label={t('operator')} valor={node.operator} disabled={disabled}
              opciones={OPERATORS.map(op => ({ valor: op, etiqueta: operatorLabel(op, locale) }))}
              onValorChange={operator => replace(i, { ...node, operator: operator as ConditionOperator, value: undefined })} />
            {!NO_VALUE.has(node.operator) && <ConditionValue rule={node} disabled={disabled} onChange={value => replace(i, { ...node, value })} />}
          </div>}
        </div>
        <button type="button" aria-label={t('remove')} disabled={disabled} className="mt-1 rounded-lg p-2 text-danger-text hover:bg-danger-subtle disabled:opacity-50"
          onClick={() => emit({ ...group, rules: group.rules.filter((_, n) => n !== i) })}><Trash2 className="size-4" aria-hidden="true" /></button>
      </div>)}
    </div>;
  };
  return <section aria-label={label ?? t('conditions')} className="space-y-3">
    <SegmentedControl valor={mode} onValorChange={setMode} etiqueta={label ?? t('conditions')}
      opciones={[{ valor: 'visual', etiqueta: t('visual') }, { valor: 'json', etiqueta: t('json') }]} />
    {mode === 'visual' ? (validateConditions(root).length ? <p role="alert" className="text-sm text-danger-text">{t('invalid')}</p> : render(root, onChange, 0)) : <div className="space-y-2">
      <textarea aria-label={t('json')} disabled={disabled} className={`${CLASE_CAMPO} min-h-48 font-mono`}
        value={jsonDraft ?? JSON.stringify(root, null, 2)} onChange={e => { setJsonDraft(e.target.value); setJsonError(false); }} />
      {jsonError && <p role="alert" className="text-sm text-danger-text">{t('invalid')}</p>}
      <button type="button" disabled={disabled} className={clasesBoton({ variante: 'secundario' })} onClick={() => {
        try { const next = JSON.parse(jsonDraft ?? JSON.stringify(root)); if (!next || typeof next !== 'object' || (!Array.isArray(next) && !('op' in next) && !('field' in next)) || validateConditions(next).length || count(toEditableGroup(next)) > 50) { setJsonError(true); return; } onChange(next); setJsonDraft(null); setJsonError(false); } catch { setJsonError(true); }
      }}>{t('apply')}</button>
    </div>}
  </section>;
}
