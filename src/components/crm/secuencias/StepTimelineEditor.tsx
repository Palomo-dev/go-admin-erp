'use client';

/**
 * Línea de tiempo vertical del editor (brief UX 6.3).
 *
 * Cada paso es una tarjeta (`StepCard`) colgada de una línea; entre dos pasos
 * hay un «+» para insertar ahí; se reordena arrastrando por el asa (motion
 * `Reorder`) o, con teclado, con «mover arriba / abajo» — ambas rutas pasan
 * por `moveStep` (probado) y anuncian el cambio en una región `aria-live`.
 * Las condiciones se ven como bifurcación dentro de la tarjeta (`StepBranch`).
 *
 * En modo `readOnly` (secuencia existente) no hay asa, «+» ni flechas.
 */

import { useEffect, useState } from 'react';
import { Reorder, useDragControls, useReducedMotion } from 'motion/react';
import { Flag, Plus, UserPlus } from 'lucide-react';
import { buildTimeline, insertStepAt, moveStep, removeStepAt, type TimelineEntry } from '@/lib/services/crm/sequenceTimeline';
import { useCrmLookups } from '@/components/crm/shared/useCrmLookups';
import { StepCard } from './StepCard';
import type { SequenceStepView } from './useSequences';

export interface EditorStep extends SequenceStepView {
  /** Identidad estable en el cliente (clave de React y de `Reorder`). */
  uid: string;
}

let uidCounter = 0;
export function newEditorStep(stepNumber: number, delayDays: number, channel = 'email'): EditorStep {
  uidCounter += 1;
  return { uid: `new-${Date.now()}-${uidCounter}`, step_number: stepNumber, delay_days: delayDays, delay_hours: 0, channel, action_config: {} };
}

interface Props {
  steps: EditorStep[];
  onChange: (steps: EditorStep[]) => void;
  readOnly: boolean;
}

/** `group` va en el contenedor: la pista «insertar aquí» es hermana del botón, no hija (R7). */
function InsertButton({ index, onInsert }: { index: number; onInsert: (index: number) => void }) {
  return (
    <div className="group relative flex h-8 items-center pl-[1.125rem]">
      <button
        type="button"
        id={`seq-insert-${index}`}
        onClick={() => onInsert(index)}
        aria-label={`Insertar un paso en la posición ${index + 1}`}
        className="relative -ml-3 flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-400 bg-white text-gray-500 transition-colors hover:border-blue-600 hover:text-blue-700 focus-visible:border-blue-600 focus-visible:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-500 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-blue-300"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span className="ml-2 text-xs text-gray-600 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 dark:text-gray-400" aria-hidden="true">
        insertar aquí
      </span>
    </div>
  );
}

interface ItemProps {
  step: EditorStep;
  entry: TimelineEntry;
  total: number;
  readOnly: boolean;
  templates: { id: string; name: string }[];
  lookupsLoading: boolean;
  onPatch: (patch: Partial<EditorStep>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onInsertAfter: () => void;
}

function TimelineItem({ step, entry, total, readOnly, templates, lookupsLoading, onPatch, onRemove, onMove, onInsertAfter }: ItemProps) {
  const controls = useDragControls();
  const reduced = useReducedMotion();
  return (
    <Reorder.Item
      as="li"
      value={step}
      dragListener={false}
      dragControls={controls}
      // `Reorder.Item` solo tipa `layout` como `true | 'position'` (ni `false`
      // ni `undefined` lo apagan: caen en el default `true`). Con movimiento
      // reducido se anula la animación de layout de forma explícita, sin
      // depender del `MotionConfig` global.
      layout="position"
      transition={reduced ? { layout: { duration: 0 } } : undefined}
      className="relative"
      id={`step-item-${step.uid}`}
    >
      <StepCard
        step={step}
        entry={entry}
        total={total}
        readOnly={readOnly}
        templates={templates}
        lookupsLoading={lookupsLoading}
        onPatch={onPatch}
        onRemove={onRemove}
        onMove={onMove}
        onDragStart={(e) => controls.start(e)}
      />
      {!readOnly && <InsertButton index={entry.index + 1} onInsert={onInsertAfter} />}
    </Reorder.Item>
  );
}

export function StepTimelineEditor({ steps, onChange, readOnly }: Props) {
  const { templates, loading: lookupsLoading } = useCrmLookups();
  const [announce, setAnnounce] = useState('');
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const timeline = buildTimeline(steps);

  // Tras mover con teclado, el botón pulsado cambia de sitio en el DOM y el
  // foco se perdería: se devuelve al mismo botón del mismo paso. Si al llegar
  // al extremo ese botón queda deshabilitado, pasa a la flecha contraria.
  useEffect(() => {
    if (!pendingFocus) return;
    const target = document.getElementById(pendingFocus);
    const fallbackId = pendingFocus.endsWith('-move-down')
      ? pendingFocus.replace(/-move-down$/, '-move-up')
      : pendingFocus.endsWith('-move-up') ? pendingFocus.replace(/-move-up$/, '-move-down') : null;
    const isDisabled = target instanceof HTMLButtonElement && target.disabled;
    const next = !target || isDisabled ? (fallbackId ? document.getElementById(fallbackId) : null) : target;
    next?.focus();
    setPendingFocus(null);
  }, [pendingFocus, steps]);

  const move = (index: number, dir: -1 | 1) => {
    const next = moveStep(steps, index, index + dir);
    if (next === steps) return;
    const uid = steps[index].uid;
    onChange(next);
    setAnnounce(`Paso ${index + 1} movido a la posición ${index + 1 + dir} de ${steps.length}.`);
    setPendingFocus(`step-${uid}-move-${dir === -1 ? 'up' : 'down'}`);
  };

  const insert = (index: number) => {
    const fresh = newEditorStep(index + 1, index === 0 ? 0 : 1);
    onChange(insertStepAt(steps, index, fresh));
    setAnnounce(`Paso nuevo insertado en la posición ${index + 1}.`);
    setPendingFocus(`step-${fresh.uid}-channel`);
  };

  // Tras eliminar, el botón pulsado ya no existe: el foco va a «Eliminar» del
  // paso que ocupa su sitio (o del anterior) y, sin pasos, al «+» inicial.
  const remove = (index: number) => {
    onChange(removeStepAt(steps, index));
    setAnnounce(`Paso ${index + 1} eliminado. Quedan ${steps.length - 1}.`);
    const neighbour = steps[index + 1] ?? steps[index - 1];
    setPendingFocus(neighbour ? `step-${neighbour.uid}-remove` : 'seq-insert-0');
  };

  const patch = (index: number, p: Partial<EditorStep>) => {
    onChange(steps.map((s, i) => (i === index ? { ...s, ...p } : s)));
  };

  return (
    <section aria-labelledby="seq-steps-title">
      <div className="mb-2 flex items-center justify-between">
        <h3 id="seq-steps-title" className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Pasos ({steps.length})
        </h3>
        {!readOnly && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Arrastra por el asa o usa las flechas para reordenar.</p>
        )}
      </div>
      <p className="sr-only" aria-live="polite" role="status">{announce}</p>

      <div className="relative pl-1">
        <span className="absolute bottom-3 left-[1.125rem] top-3 w-0.5 bg-gray-200 dark:bg-gray-700" aria-hidden="true" />

        <div className="relative flex items-center gap-3 py-1">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white ring-4 ring-white dark:ring-gray-900">
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="text-sm text-gray-700 dark:text-gray-300">Inscripción <span className="text-gray-500 dark:text-gray-400">· Día 0</span></span>
        </div>
        {!readOnly && <InsertButton index={0} onInsert={insert} />}

        <Reorder.Group as="ol" axis="y" values={steps} onReorder={(next) => onChange(next.map((s, i) => ({ ...s, step_number: i + 1 })))} className="space-y-0">
          {steps.map((step, index) => (
            <TimelineItem
              key={step.uid}
              step={step}
              entry={timeline[index]}
              total={steps.length}
              readOnly={readOnly}
              templates={templates}
              lookupsLoading={lookupsLoading}
              onPatch={(p) => patch(index, p)}
              onRemove={() => remove(index)}
              onMove={(dir) => move(index, dir)}
              onInsertAfter={() => insert(index + 1)}
            />
          ))}
        </Reorder.Group>

        <div className="relative flex items-center gap-3 py-1">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-gray-700 ring-4 ring-white dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-900">
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Fin{steps.length > 0 ? <span className="text-gray-500 dark:text-gray-400"> · {timeline[timeline.length - 1].dayLabel}</span> : null}
          </span>
        </div>
      </div>
    </section>
  );
}
