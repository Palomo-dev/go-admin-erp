'use client';
import { useSequenceText } from './useSequenceText';

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
  canManage?:boolean;
  sequence: SequenceView;
  onToggle: (sequence: SequenceView) => void;
  onEnroll: (sequence: SequenceView) => void;
  onEnrollments: (sequence: SequenceView) => void;
  onEdit: (sequence: SequenceView) => void;
  onDelete: (sequence: SequenceView) => void;
}

function IconAction({ label, onClick, children, disabled=false }: { label: string; onClick: () => void; children: React.ReactNode; disabled?:boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button disabled={disabled} size="icon" variant="ghost" aria-label={label} onClick={onClick} className="h-8 w-8">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function SequenceCard({ sequence, onToggle, onEnroll, onEnrollments, onEdit, onDelete,canManage=false }: Props) {
 const tr=useSequenceText();
  const steps = sequence.steps ?? [];
  const stats = sequence.enrollment_stats;
  const active = stats?.active ?? null;
  const headingId = `seq-${sequence.id}-name`;
  // Sin pasos activos o inactiva: el botón lo dice antes de que la RPC lo rechace (tester r3).
  const blockReason = enrollBlockReason(sequence, tr);
  const blockId = `seq-${sequence.id}-enroll-block`;

  return (
    <article
      aria-labelledby={headingId}
      className="flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500/40 dark:border-line-strong dark:bg-surface"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className="truncate text-base font-semibold text-fg dark:text-fg">
            {sequence.name}
          </h2>
          <p className="mt-0.5 text-xs text-fg-muted dark:text-fg-secondary">
            {tr(triggerLabel(sequence.trigger_type))} · {totalDurationLabel(steps, tr)}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            sequence.is_active
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
              : 'bg-gray-100 text-fg-secondary dark:bg-hover dark:text-fg-secondary'
          }`}
        >
          {sequence.is_active
            ? <CheckCircle2 strokeWidth={1.5} className="h-3.5 w-3.5" aria-hidden="true" />
            : <PauseCircle strokeWidth={1.5} className="h-3.5 w-3.5" aria-hidden="true" />}
          {sequence.is_active ? tr("Activa") : tr("Inactiva")}
        </span>
      </header>

      <div className="overflow-x-auto py-1">
        <StepMiniTimeline steps={steps} />
      </div>

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <div className="flex items-center gap-1.5 text-fg-secondary dark:text-fg-secondary">
          <Users strokeWidth={1.5} className="h-4 w-4 text-fg-secondary dark:text-fg-muted" aria-hidden="true" />
          <dt className="sr-only">{tr("Inscritos activos")}</dt>
          <dd><span className="font-semibold text-fg dark:text-fg">{active ?? '—'}</span> {active === 1 ? tr("inscrito activo") : tr("inscritos activos")}</dd>
        </div>
        <div className="flex items-center gap-1.5 text-fg-secondary dark:text-fg-secondary">
          <MessageSquareReply strokeWidth={1.5} className="h-4 w-4 text-fg-secondary dark:text-fg-muted" aria-hidden="true" />
          <dt className="sr-only">{tr("Respuestas")}</dt>
          {/* Etiqueta visible que dice QUÉ cuenta; con `pause_on_reply=false` no hay cero falso (r2 #3). */}
          <dd title={tr("Inscripciones pausadas porque el cliente respondió. Si se reanudan, dejan de contar.")}>
            {stats ? responseSummary(stats, sequence.pause_on_reply, tr) : '—'}
          </dd>
        </div>
      </dl>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 dark:border-line">
        {blockReason && (
          <p id={blockId} className="basis-full text-xs text-amber-800 dark:text-amber-200">
            {blockReason}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Switch
            id={`seq-${sequence.id}-active`}
            aria-label={tr("Activar la secuencia {p0}",{p0:sequence.name})}
            disabled={!canManage} checked={sequence.is_active}
            onCheckedChange={() => onToggle(sequence)}
          />
          <label htmlFor={`seq-${sequence.id}-active`} className="text-xs text-fg-secondary dark:text-fg-secondary">
            {sequence.is_active ? tr("Activa") : tr("Inactiva")}
          </label>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="sm"
            onClick={() => onEnroll(sequence)}
            disabled={blockReason !== null || !canManage}
            aria-describedby={blockReason ? blockId : undefined}
            aria-label={blockReason ? tr("Inscribir en {p0}: deshabilitado. {p1}",{p0:sequence.name,p1:blockReason}) : undefined}
            className="mr-1 bg-brand text-white hover:bg-brand-deep"
          >
            <UserPlus strokeWidth={1.5} className="mr-1.5 h-4 w-4" aria-hidden="true" /> {tr("Inscribir")}</Button>
          <IconAction label={tr("Inscripciones de {p0}",{p0:sequence.name})} onClick={() => onEnrollments(sequence)}>
            <Users strokeWidth={1.5} className="h-4 w-4" aria-hidden="true" />
          </IconAction>
          <IconAction disabled={!canManage} label={tr("Editar {p0}",{p0:sequence.name})} onClick={() => onEdit(sequence)}>
            <Pencil strokeWidth={1.5} className="h-4 w-4" aria-hidden="true" />
          </IconAction>
          <IconAction disabled={!canManage} label={tr("Eliminar {p0}",{p0:sequence.name})} onClick={() => onDelete(sequence)}>
            <Trash2 strokeWidth={1.5} className="h-4 w-4 text-danger-text dark:text-danger-text" aria-hidden="true" />
          </IconAction>
        </div>
      </footer>
    </article>
  );
}
