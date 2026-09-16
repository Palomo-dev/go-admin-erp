'use client';

/**
 * Tarjeta de una secuencia en la lista (brief UX 6.3): nombre, mini-línea de
 * tiempo, inscritos activos, tasa de respuesta y acciones. Una acción
 * principal evidente: «Inscribir». Lo demás son iconos con `aria-label`.
 */

import { CheckCircle2, MessageSquareReply, PauseCircle, Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { totalDurationLabel } from '@/lib/services/crm/sequenceTimeline';
import { StepMiniTimeline } from './StepMiniTimeline';
import { enrollBlockReason, responseSummary, triggerLabel } from './sequenceOptions';
import type { SequenceView } from './useSequences';

interface Props {
  sequence: SequenceView;
  onToggle: (sequence: SequenceView) => void;
  onEnroll: (sequence: SequenceView) => void;
  onEnrollments: (sequence: SequenceView) => void;
  onEdit: (sequence: SequenceView) => void;
  onDelete: (sequence: SequenceView) => void;
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={label} onClick={onClick} className="h-8 w-8">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function SequenceCard({ sequence, onToggle, onEnroll, onEnrollments, onEdit, onDelete }: Props) {
  const steps = sequence.steps ?? [];
  const stats = sequence.enrollment_stats;
  const active = stats?.active ?? 0;
  const headingId = `seq-${sequence.id}-name`;
  // Sin pasos activos o inactiva: el botón lo dice antes de que la RPC lo rechace (tester r3).
  const blockReason = enrollBlockReason(sequence);
  const blockId = `seq-${sequence.id}-enroll-block`;

  return (
    <article
      aria-labelledby={headingId}
      className="flex h-full flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500/40 dark:border-gray-700 dark:bg-gray-900"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
            {sequence.name}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {triggerLabel(sequence.trigger_type)} · {totalDurationLabel(steps)}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            sequence.is_active
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
          }`}
        >
          {sequence.is_active
            ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            : <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />}
          {sequence.is_active ? 'Activa' : 'Inactiva'}
        </span>
      </header>

      <div className="overflow-x-auto py-1">
        <StepMiniTimeline steps={steps} />
      </div>

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
          <Users className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          <dt className="sr-only">Inscritos activos</dt>
          <dd><span className="font-semibold text-gray-900 dark:text-gray-100">{active}</span> {active === 1 ? 'inscrito activo' : 'inscritos activos'}</dd>
        </div>
        <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
          <MessageSquareReply className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          <dt className="sr-only">Respuestas</dt>
          {/* Etiqueta visible que dice QUÉ cuenta; con `pause_on_reply=false` no hay cero falso (r2 #3). */}
          <dd title="Inscripciones pausadas porque el cliente respondió. Si se reanudan, dejan de contar.">
            {responseSummary(stats, sequence.pause_on_reply)}
          </dd>
        </div>
      </dl>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        {blockReason && (
          <p id={blockId} className="basis-full text-xs text-amber-800 dark:text-amber-200">
            {blockReason}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Switch
            id={`seq-${sequence.id}-active`}
            aria-label={`Activar la secuencia ${sequence.name}`}
            checked={sequence.is_active}
            onCheckedChange={() => onToggle(sequence)}
          />
          <label htmlFor={`seq-${sequence.id}-active`} className="text-xs text-gray-600 dark:text-gray-400">
            {sequence.is_active ? 'Activa' : 'Inactiva'}
          </label>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="sm"
            onClick={() => onEnroll(sequence)}
            disabled={blockReason !== null}
            aria-describedby={blockReason ? blockId : undefined}
            aria-label={blockReason ? `Inscribir en ${sequence.name}: deshabilitado. ${blockReason}` : undefined}
            className="mr-1 bg-blue-600 text-white hover:bg-blue-700"
          >
            <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Inscribir
          </Button>
          <IconAction label={`Inscripciones de ${sequence.name}`} onClick={() => onEnrollments(sequence)}>
            <Users className="h-4 w-4" aria-hidden="true" />
          </IconAction>
          <IconAction label={`Editar ${sequence.name}`} onClick={() => onEdit(sequence)}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </IconAction>
          <IconAction label={`Eliminar ${sequence.name}`} onClick={() => onDelete(sequence)}>
            <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
          </IconAction>
        </div>
      </footer>
    </article>
  );
}
