'use client';

import { Check, X, AlertTriangle, Loader2, Pencil, ClipboardList, CircleCheck, CircleAlert, ExternalLink, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import type { ActionOutcome, PendingAction } from '@/lib/ai/assistant/clientTypes';
import BulkPreviewTable from './assistant/BulkPreviewTable';

interface Props {
  action: PendingAction;
  onConfirm: () => void;
  onCorrect: () => void;
  onReject: () => void;
  /** Abrir el formulario REAL del módulo (hoy: clientes) prellenado. */
  onOpenForm?: () => void;
  isExecuting?: boolean;
  /** Desenlace: la tarjeta pasa a "completada" o "error" en su sitio. */
  outcome?: ActionOutcome | null;
  /** Deshacer desde la propia tarjeta, mientras la ventana siga abierta. */
  onUndo?: () => void;
  isUndoing?: boolean;
}

/** Acciones que tienen un formulario de módulo que se puede abrir desde la tarjeta. */
const WITH_MODULE_FORM = new Set<string>(['create_customer']);

/** Conserva el nombre por compatibilidad de imports; ya no es un formulario. */
export default function ActionConfirmationForm({
  action,
  onConfirm,
  onCorrect,
  onReject,
  onOpenForm,
  isExecuting = false,
  outcome = null,
  onUndo,
  isUndoing = false,
}: Props) {
  const preview = action.preview;
  const lines = preview?.lines.length ? preview.lines : action.fields
    .filter((field) => field.value !== undefined && field.value !== null && field.value !== '')
    .map((field) => ({ label: field.label, value: field.options?.find((option) => option.value === String(field.value))?.label ?? String(field.value) }));
  const missing = action.fields.filter((field) => field.required && (field.value === undefined || field.value === null || field.value === ''));
  const summaryId = 'action-summary-' + action.id;

  return (
    <section aria-label={'Confirmar acción: ' + action.title} aria-describedby={summaryId} aria-busy={isExecuting}
      className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="space-y-2 border-b p-4 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{action.title}</h3>
        <p id={summaryId} className="text-sm text-gray-700 dark:text-gray-300">{preview?.summary || action.description}</p>
        {action.risk === 'high' && <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Revisa el resumen: esta acción tiene impacto contable.</p>}
      </div>
      <div className="space-y-3 p-4">
        <dl className="space-y-2 text-sm">
          {lines.map((line, index) => (
            <div key={line.label + index} className="grid grid-cols-2 gap-3">
              <dt className="break-words text-gray-600 dark:text-gray-400">{line.label}</dt>
              <dd className="break-words text-right text-gray-900 dark:text-gray-100">{line.value}</dd>
            </div>
          ))}
          {Object.entries(preview?.totals ?? {}).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-t pt-2 font-semibold"><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
        {preview?.bulk && <BulkPreviewTable bulk={preview.bulk} />}
        {(preview?.warnings ?? []).map((warning, index) => <p key={index} className="flex gap-2 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{warning}</p>)}
        {missing.length > 0 && <p className="text-sm text-amber-800 dark:text-amber-300">Falta: {missing.map((field) => field.label).join(', ')}. Dímelo en el chat antes de confirmar.</p>}
        {preview?.reversible === false && <p className="text-sm text-red-700 dark:text-red-300">Esta acción no se puede deshacer desde el chat.</p>}
        <p className="text-xs text-gray-600 dark:text-gray-400">¿Algo está mal? Pulsa Corregir y dime qué cambiar. No se guardará nada hasta que confirmes.</p>
      </div>
      {outcome ? (
        <div
          className={cn(
            'flex flex-wrap items-start gap-2 border-t p-3 text-sm dark:border-gray-700',
            outcome.ok ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
          )}
          role="status"
        >
          {outcome.ok ? (
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <p className="min-w-0 flex-1 break-words">{outcome.message}</p>
          <div className="flex w-full flex-wrap gap-2 pt-1">
            {outcome.ok && outcome.entity?.url && (
              <Button variant="outline" asChild className="min-h-9">
                <a href={outcome.entity.url}>
                  <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                  Ver
                </a>
              </Button>
            )}
            {outcome.ok && outcome.undoAvailable && onUndo && (
              <Button variant="ghost" onClick={onUndo} disabled={isUndoing} className="min-h-9">
                <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />
                {isUndoing ? 'Deshaciendo…' : 'Deshacer'}
              </Button>
            )}
            {!outcome.ok && (
              <Button variant="outline" onClick={onCorrect} className="min-h-9">
                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                Corregir y reintentar
              </Button>
            )}
          </div>
        </div>
      ) : (
      <div className="flex flex-wrap gap-2 border-t p-3 dark:border-gray-700">
        <Button onClick={onConfirm} disabled={isExecuting || missing.length > 0} className="min-h-11 flex-1">
          {isExecuting ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
          {isExecuting ? 'Procesando…' : 'Confirmar'}
        </Button>
        <Button variant="outline" onClick={onCorrect} disabled={isExecuting} className="min-h-11"><Pencil className="mr-2 h-4 w-4" aria-hidden="true" />Corregir</Button>
        {onOpenForm && WITH_MODULE_FORM.has(action.type) && (
          <Button variant="outline" onClick={onOpenForm} disabled={isExecuting} className="min-h-11" title="Abre el mismo formulario del módulo de Clientes, con estos datos ya puestos">
            <ClipboardList className="mr-2 h-4 w-4" aria-hidden="true" />Formulario completo
          </Button>
        )}
        <Button variant="ghost" onClick={onReject} disabled={isExecuting} className="min-h-11"><X className="mr-2 h-4 w-4" aria-hidden="true" />Rechazar</Button>
      </div>
      )}
    </section>
  );
}
