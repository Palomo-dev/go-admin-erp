'use client';

/**
 * Editor en sitio de UNA acción: sus campos (máximo tres por tipo), el
 * cambio de tipo, reordenar y quitar. Los IDs se eligen por nombre.
 */

import { AlertTriangle, ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EntitySelect } from '@/components/crm/shared/EntitySelect';
import { cn } from '@/utils/Utils';
import {
  ACTION_CATALOG,
  ACTIVITY_TYPE_OPTIONS,
  UPDATE_FIELD_OPTIONS,
  actionEntry,
  type ActionFieldDef,
} from '@/lib/services/crm/automation/ruleCatalog';
import type { FormError, RuleAction } from '@/lib/services/crm/automation/ruleEditorModel';
import { SELECT_CLASS } from './TriggerBlock';
import type { RuleLookups } from './useRuleLookups';

interface Props {
  index: number;
  total: number;
  action: RuleAction;
  lookups: RuleLookups;
  errors: FormError[];
  onPatch: (patch: Record<string, unknown>) => void;
  onChangeType: (type: string) => void;
  onMove: (dir: 'up' | 'down') => void;
  onRemove: () => void;
}

const ENTITY_LABELS: Record<string, string> = { opportunities: 'Oportunidad', customers: 'Cliente', tasks: 'Tarea' };
const LABEL_CLASS = 'text-xs text-gray-700 dark:text-gray-300';

export function ActionChipEditor({ index, total, action, lookups, errors, onPatch, onChangeType, onMove, onRemove }: Props) {
  const entry = actionEntry(action.type);
  const errorFor = (key: string) => errors.find((e) => e.field === `actions.${index}.${key}`)?.message;
  const id = (key: string) => `action-${index}-${key}`;

  const renderField = (f: ActionFieldDef) => {
    const value = action[f.key];
    const err = errorFor(f.key);
    const describedBy = [err ? `${id(f.key)}-error` : null, f.hint ? `${id(f.key)}-hint` : null].filter(Boolean).join(' ') || undefined;
    const usesEntity = f.kind === 'template' || f.kind === 'sequence' || f.kind === 'stage';

    let control: React.ReactNode;
    switch (f.kind) {
      case 'template':
        control = <EntitySelect value={(value as string) || null} onChange={(v) => onPatch({ [f.key]: v })} options={lookups.templates} placeholder="Sin plantilla (contenido libre)" emptyMessage="No hay plantillas creadas." ariaLabel={f.label} />;
        break;
      case 'sequence':
        control = <EntitySelect value={(value as string) || null} onChange={(v) => onPatch({ [f.key]: v })} options={lookups.sequences} placeholder="Elige una secuencia" emptyMessage="No hay secuencias creadas." ariaLabel={f.label} renderSubtitle={(s) => ((s as { is_active?: boolean }).is_active ? 'activa' : 'inactiva')} />;
        break;
      case 'stage':
        control = <EntitySelect value={(value as string) || null} onChange={(v) => onPatch({ [f.key]: v })} options={lookups.stages} placeholder="Elige una etapa" emptyMessage="No hay etapas creadas." ariaLabel={f.label} />;
        break;
      case 'entity':
        control = (
          <select id={id(f.key)} className={SELECT_CLASS} value={String(value ?? 'opportunities')} aria-describedby={describedBy}
            onChange={(e) => onPatch({ entity: e.target.value, field_name: UPDATE_FIELD_OPTIONS[e.target.value]?.[0] ?? '' })}>
            {Object.keys(UPDATE_FIELD_OPTIONS).map((k) => <option key={k} value={k}>{ENTITY_LABELS[k] ?? k}</option>)}
          </select>
        );
        break;
      case 'field_name': {
        const options = UPDATE_FIELD_OPTIONS[String(action.entity ?? 'opportunities')] ?? [];
        control = (
          <select id={id(f.key)} className={SELECT_CLASS} value={String(value ?? '')} aria-invalid={!!err} aria-describedby={describedBy}
            onChange={(e) => onPatch({ field_name: e.target.value })}>
            <option value="">Elige un campo</option>
            {options.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        );
        break;
      }
      case 'activity_type':
        control = (
          <select id={id(f.key)} className={SELECT_CLASS} value={String(value ?? 'system')} onChange={(e) => onPatch({ activity_type: e.target.value })}>
            {ACTIVITY_TYPE_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        );
        break;
      case 'textarea':
        control = <Textarea id={id(f.key)} rows={3} value={String(value ?? '')} placeholder={f.placeholder} aria-describedby={describedBy} onChange={(e) => onPatch({ [f.key]: e.target.value })} />;
        break;
      case 'number':
        control = <Input id={id(f.key)} type="number" inputMode="numeric" value={value === undefined || value === null ? '' : String(value)} placeholder={f.placeholder} aria-describedby={describedBy}
          onChange={(e) => onPatch({ [f.key]: e.target.value === '' ? undefined : Number(e.target.value) })} />;
        break;
      default:
        control = <Input id={id(f.key)} value={String(value ?? '')} placeholder={f.placeholder} aria-invalid={!!err} aria-describedby={describedBy} onChange={(e) => onPatch({ [f.key]: e.target.value })} />;
    }

    return (
      <div key={f.key} className={cn('min-w-0', f.kind === 'textarea' && 'sm:col-span-2')}>
        {usesEntity
          ? <span className={`block font-medium ${LABEL_CLASS}`}>{f.label}</span>
          : <Label htmlFor={id(f.key)} className={LABEL_CLASS}>{f.label}</Label>}
        {lookups.loading && usesEntity ? <p className="text-xs text-gray-600 dark:text-gray-400">Cargando…</p> : control}
        {f.hint && <p id={`${id(f.key)}-hint`} className="mt-1 text-xs text-gray-600 dark:text-gray-400">{f.hint}</p>}
        {err && <p id={`${id(f.key)}-error`} role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{err}</p>}
      </div>
    );
  };

  return (
    <div className="min-w-0 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
      {/* UX móvil: el selector de tipo ocupa toda la fila y los botones van debajo; en línea desde `sm`. */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full min-w-0 sm:w-auto sm:min-w-[200px] sm:flex-1">
          <Label htmlFor={id('type')} className={LABEL_CLASS}>Acción {index + 1}</Label>
          <select id={id('type')} className={SELECT_CLASS} value={action.type} aria-describedby={`${id('type')}-hint`} onChange={(e) => onChangeType(e.target.value)}>
            {ACTION_CATALOG.map((c) => (
              <option key={c.type} value={c.type}>{c.implemented ? c.label : `${c.label} (no disponible)`}</option>
            ))}
          </select>
          <p id={`${id('type')}-hint`} className="mt-1 text-xs text-gray-600 dark:text-gray-400">{entry?.hint}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <Button id={id('move-up')} type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Subir la acción ${index + 1}`} disabled={index === 0} onClick={() => onMove('up')}>
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button id={id('move-down')} type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Bajar la acción ${index + 1}`} disabled={index >= total - 1} onClick={() => onMove('down')}>
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 text-red-700 hover:text-red-800 dark:text-red-300" onClick={onRemove}>
            <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Quitar
          </Button>
        </div>
      </div>

      {entry && !entry.implemented && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          Esta acción todavía no está disponible: si la dejas, la ejecución quedará marcada como fallida.
        </p>
      )}

      {entry && entry.fields.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{entry.fields.map(renderField)}</div>
      )}
    </div>
  );
}
