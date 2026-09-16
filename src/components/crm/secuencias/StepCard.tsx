'use client';

/**
 * Tarjeta de un paso en la línea de tiempo vertical (brief UX 6.3): nodo con
 * el icono del canal, espera en lenguaje humano («2 días después»), contenido
 * y —en edición— canal, espera, asunto/plantilla y controles de orden.
 * Un paso `condition` muestra su bifurcación (`StepBranch`).
 */

import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EntitySelect } from '@/components/crm/shared/EntitySelect';
import { summarizeStep, type TimelineEntry } from '@/lib/services/crm/sequenceTimeline';
import { CHANNEL_OPTIONS, ChannelIcon, channelMeta } from './channelMeta';
import { StepBranch } from './StepBranch';
import { SELECT_CLASS, hoursError } from './sequenceOptions';
import type { SequenceStepView } from './useSequences';

const WITH_CONTENT: ReadonlySet<string> = new Set(['email', 'whatsapp', 'task', 'call']);

interface Props {
  step: SequenceStepView & { uid: string };
  entry: TimelineEntry;
  total: number;
  readOnly: boolean;
  templates: { id: string; name: string }[];
  lookupsLoading: boolean;
  onPatch: (patch: Partial<SequenceStepView>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onDragStart: (e: ReactPointerEvent) => void;
}

export function StepCard({ step, entry, total, readOnly, templates, lookupsLoading, onPatch, onRemove, onMove, onDragStart }: Props) {
  const n = entry.index + 1;
  const meta = channelMeta(step.channel);
  const templateName = templates.find((t) => t.id === step.template_id)?.name ?? null;
  const contentKey = step.channel === 'email' ? 'subject' : 'title';
  const hoursErr = hoursError(step.delay_hours ?? 0);
  const setConfig = (key: string, value: string) => onPatch({ action_config: { ...(step.action_config ?? {}), [key]: value } });

  return (
    <div className="relative flex gap-3 py-1">
      <div className="flex w-9 shrink-0 justify-center pt-2">
        <span className="rounded-full bg-white p-0.5 dark:bg-gray-900">
          <ChannelIcon channel={step.channel} />
        </span>
      </div>

      <div className={`min-w-0 flex-1 rounded-lg border bg-white p-3 shadow-sm dark:bg-gray-900 ${
        entry.isBranch ? 'border-amber-300 dark:border-amber-700' : 'border-gray-200 dark:border-gray-700'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="font-medium text-gray-900 dark:text-gray-100">Paso {n} · {meta.label}</span>
            <span className="text-gray-600 dark:text-gray-400">{entry.delayLabel}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">{entry.dayLabel}</span>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-0.5">
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" id={`step-${step.uid}-move-up`}
                aria-label={`Mover el paso ${n} arriba`} disabled={n === 1} onClick={() => onMove(-1)}>
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" id={`step-${step.uid}-move-down`}
                aria-label={`Mover el paso ${n} abajo`} disabled={n === total} onClick={() => onMove(1)}>
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </Button>
              <span
                role="presentation"
                onPointerDown={onDragStart}
                title="Arrastrar para reordenar"
                className="flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded text-gray-400 hover:bg-gray-100 active:cursor-grabbing dark:text-gray-500 dark:hover:bg-gray-800"
              >
                <GripVertical className="h-4 w-4" aria-hidden="true" />
              </span>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" id={`step-${step.uid}-remove`}
                aria-label={`Eliminar el paso ${n}`} onClick={onRemove}>
                <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>

        {readOnly ? (
          <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-300">{summarizeStep(step, templateName)}</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <Label htmlFor={`step-${step.uid}-channel`} className="text-xs">Canal</Label>
              <select
                id={`step-${step.uid}-channel`}
                className={SELECT_CLASS}
                value={step.channel}
                aria-describedby={`step-${step.uid}-channel-hint`}
                onChange={(e) => onPatch({
                  channel: e.target.value,
                  condition: e.target.value === 'condition' ? (step.condition ?? { op: 'and', rules: [] }) : undefined,
                })}
              >
                {CHANNEL_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <p id={`step-${step.uid}-channel-hint`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">{meta.description}</p>
            </div>
            <div>
              <Label htmlFor={`step-${step.uid}-days`} className="text-xs">Espera (días)</Label>
              <Input id={`step-${step.uid}-days`} type="number" inputMode="numeric" min={0} max={3650}
                value={step.delay_days} onChange={(e) => onPatch({ delay_days: Number(e.target.value) })} />
            </div>
            <div>
              <Label htmlFor={`step-${step.uid}-hours`} className="text-xs">y horas</Label>
              <Input id={`step-${step.uid}-hours`} type="number" inputMode="numeric" min={0} max={23}
                value={step.delay_hours ?? 0} onChange={(e) => onPatch({ delay_hours: Number(e.target.value) })}
                aria-invalid={!!hoursErr} aria-describedby={hoursErr ? `step-${step.uid}-hours-error` : undefined} />
              {hoursErr && <p id={`step-${step.uid}-hours-error`} className="mt-1 text-xs text-red-700 dark:text-red-300">{hoursErr}</p>}
            </div>
          </div>
        )}

        {!readOnly && WITH_CONTENT.has(step.channel) && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`step-${step.uid}-content`} className="text-xs">{step.channel === 'email' ? 'Asunto' : 'Título'}</Label>
              <Input
                id={`step-${step.uid}-content`}
                placeholder={step.channel === 'email' ? 'Asunto del correo' : 'Qué hay que hacer'}
                value={String((step.action_config ?? {})[contentKey] ?? '')}
                onChange={(e) => setConfig(contentKey, e.target.value)}
              />
            </div>
            <div>
              <span className="block text-xs font-medium leading-none text-gray-900 dark:text-gray-100">Plantilla</span>
              {lookupsLoading ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">Cargando plantillas…</p>
              ) : (
                <EntitySelect
                  value={step.template_id ?? null}
                  onChange={(id) => onPatch({ template_id: id })}
                  options={templates}
                  placeholder="Sin plantilla (contenido libre)"
                  emptyMessage="No hay plantillas creadas."
                  ariaLabel={`Plantilla del paso ${n}`}
                  renderSubtitle={(t) => (t as { channel?: string | null }).channel ?? null}
                />
              )}
            </div>
          </div>
        )}

        {step.channel === 'condition' && (
          <StepBranch
            value={step.condition}
            stepNumber={n}
            isLast={n === total}
            disabled={readOnly}
            onChange={(next) => onPatch({ condition: next })}
          />
        )}
      </div>
    </div>
  );
}
