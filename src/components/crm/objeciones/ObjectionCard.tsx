'use client';

/**
 * Tarjeta de una objeción del catálogo (brief §3, «tarjetas antes que
 * tablas»): título, categoría con icono, señales de detección como chips,
 * respuesta recomendada plegada y preguntas de discovery. Interruptor con
 * estado en texto e icono (no solo color); acciones de icono con `aria-label`.
 */

import { useId, useState } from 'react';
import { CheckCircle2, ChevronDown, HelpCircle, MessageSquareReply, PauseCircle, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AnimatePresence, FadeIn, StaggerItem } from '@/components/shared/motion';
import type { Objection } from '@/lib/services/crm/objectionService';
import { cn } from '@/utils/Utils';
import { CategoryBadge } from './categoryMeta';

interface Props {
  objection: Objection;
  toggling: boolean;
  onToggle: (objection: Objection) => void;
  onEdit: (objection: Objection) => void;
  onDelete: (objection: Objection) => void;
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon" variant="ghost" aria-label={label} onClick={onClick} className="h-8 w-8">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Chips de señales: lo que dice el cliente cuando aparece esta objeción. */
export function SignalChips({ signals, max = 6 }: { signals: string[]; max?: number }) {
  if (signals.length === 0) return null;
  const shown = signals.slice(0, max);
  const rest = signals.length - shown.length;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Señales de detección">
      {shown.map((s) => (
        <li key={s} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          «{s}»
        </li>
      ))}
      {rest > 0 && <li className="px-1 py-0.5 text-xs text-gray-600 dark:text-gray-400">+{rest} más</li>}
    </ul>
  );
}

/** Respuesta recomendada plegada + preguntas de discovery. Se reutiliza en el drawer. */
export function ObjectionGuidance({ objection, defaultOpen = false, compact = false }: { objection: Objection; defaultOpen?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const response = objection.recommended_response?.trim();
  const questions = objection.discovery_questions ?? [];
  if (!response && questions.length === 0) return null;

  return (
    <div className={cn('rounded-lg border border-blue-100 bg-blue-50/60 dark:border-blue-900/60 dark:bg-blue-950/30', compact ? 'p-2.5' : 'p-3')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded text-left text-xs font-semibold uppercase tracking-wide text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300"
      >
        <span className="inline-flex items-center gap-1.5">
          <MessageSquareReply className="h-3.5 w-3.5" aria-hidden="true" />
          Cómo responder
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <FadeIn id={panelId} transition={{ duration: 0.18 }} className="mt-2 space-y-2 text-sm">
            {response && <p className="text-gray-800 dark:text-gray-200">{response}</p>}
            {questions.length > 0 && (
              <div>
                <p className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" /> Preguntas de discovery
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-gray-800 dark:text-gray-200">
                  {questions.map((q) => <li key={q}>{q}</li>)}
                </ul>
              </div>
            )}
          </FadeIn>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ObjectionCard({ objection, toggling, onToggle, onEdit, onDelete }: Props) {
  const switchId = `objection-active-${objection.id}`;
  const signals = objection.detection_signals ?? [];

  return (
    <StaggerItem
      as="li"
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm dark:bg-gray-900',
        objection.is_active ? 'border-gray-200 dark:border-gray-800' : 'border-dashed border-gray-300 dark:border-gray-700',
      )}
      aria-labelledby={`objection-title-${objection.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h3 id={`objection-title-${objection.id}`} className="font-semibold leading-snug text-gray-900 dark:text-gray-100">
            {objection.title}
          </h3>
          <CategoryBadge value={objection.category} />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Switch
            id={switchId}
            checked={objection.is_active}
            disabled={toggling}
            aria-label={`${objection.is_active ? 'Desactivar' : 'Activar'} la objeción ${objection.title}`}
            onCheckedChange={() => onToggle(objection)}
          />
          <span className={cn('inline-flex items-center gap-1 text-xs font-medium', objection.is_active ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-600 dark:text-gray-400')}>
            {objection.is_active ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />}
            {objection.is_active ? 'Activa' : 'Inactiva'}
          </span>
        </div>
      </div>

      {signals.length > 0 ? (
        <SignalChips signals={signals} />
      ) : (
        <p className="text-xs italic text-gray-600 dark:text-gray-400">Sin señales de detección: añade frases que diga el cliente.</p>
      )}

      <ObjectionGuidance objection={objection} />

      <div className="mt-auto flex items-center justify-end gap-0.5 border-t border-gray-100 pt-2 dark:border-gray-800">
        <IconAction label={`Editar ${objection.title}`} onClick={() => onEdit(objection)}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </IconAction>
        <IconAction label={`Eliminar ${objection.title}`} onClick={() => onDelete(objection)}>
          <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
        </IconAction>
      </div>
    </StaggerItem>
  );
}
