'use client';

/**
 * GO Asistente — tarjeta de confirmación (Figma `AsistenteConfirmacion`
 * 663:16182, Estado = pendiente / ejecutando / completada / error; pantallas 06
 * `667:36553` y 07 `667:36967`).
 *
 * Solo lectura: se corrige hablando («Corregir» rechaza la propuesta en el
 * servidor y la siguiente frase produce otra). La tarjeta cambia de estado en
 * su sitio —pendiente → ejecutando → completada (con «Ver» y «Deshacer») o
 * error— en vez de dejar un mensaje suelto con ✅/❌.
 *
 * Mejoras sobre el Figma, todas por la política documentada o por honestidad:
 * - **Riesgo alto: el resumen se repite antes de ejecutar** (§6.2 del plan).
 *   El primer «Confirmar» enseña «Vas a: …» y pide un segundo «Sí, confirmar».
 * - **Créditos**: el Figma decía «≈1 crédito». Confirmar NO cobra (la
 *   ejecución no llama al modelo; el turno que preparó el resumen ya se cobró:
 *   `ai_agent_actions.credits` vale 0 en las 23 propuestas de la base). La
 *   tarjeta lo dice así.
 * - **Caducidad visible**: la propuesta caduca a los 30 min; a partir de los
 *   últimos 5 se avisa, y caducada se bloquea «Confirmar» en vez de dejar que
 *   el servidor responda 409.
 * - **Deshacer con los minutos que quedan** («Deshacer · 12 min»), con el
 *   plazo que devuelve el servidor, y estado «Deshecha» al terminar.
 * - Teclado con el foco en la tarjeta: Ctrl/⌘+Enter confirma (paso a paso en
 *   riesgo alto) y Esc rechaza o vuelve atrás.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, CircleAlert, CircleCheck, ExternalLink, Loader2, Pencil, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
import type { ActionOutcome, PendingAction } from '@/lib/ai/assistant/clientTypes';
import { minutosRestantes, requiereDobleConfirmacion, type ModoPanel } from '@/lib/ai/assistant/panelUi';
import { enlaceEntidad, tipoEnlazable } from '@/lib/ai/assistant/entityLinks';
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
  /** Ancho del panel: la carga masiva se pinta distinta en cada uno. */
  modo?: ModoPanel;
  /** Pasar el panel a ampliado para ver la tabla completa. */
  onVerEnGrande?: () => void;
  /** Tomar el foco al aparecer (escritorio), para que el teclado funcione ya. */
  enfocar?: boolean;
  /** Propuesta caducada: cerrarla y volver al composer para pedir otra. */
  onExpiredDismiss?: () => void;
}

/** Acciones que tienen un formulario de módulo que se puede abrir desde la tarjeta. */
const WITH_MODULE_FORM = new Set<string>(['create_customer']);

/** Avisar de la caducidad cuando queden estos minutos o menos. */
const AVISO_CADUCIDAD_MIN = 5;

type Estado = 'pendiente' | 'ejecutando' | 'completada' | 'deshecha' | 'error' | 'caducada';

function estadoDe(outcome: ActionOutcome | null, ejecutando: boolean, caducada: boolean): Estado {
  if (outcome) return outcome.undone ? 'deshecha' : outcome.ok ? 'completada' : 'error';
  if (ejecutando) return 'ejecutando';
  return caducada ? 'caducada' : 'pendiente';
}

const TONO_ESTADO = {
  pendiente: 'marca',
  ejecutando: 'informacion',
  completada: 'exito',
  deshecha: 'neutro',
  error: 'peligro',
  caducada: 'neutro',
} as const;

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
  modo = 'acoplado',
  onVerEnGrande,
  enfocar = false,
  onExpiredDismiss,
}: Props) {
  const t = useTranslations('asistente.tarjeta');
  const ref = useRef<HTMLElement>(null);
  const [repitiendo, setRepitiendo] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  const preview = action.preview;
  const lines = preview?.lines.length ? preview.lines : action.fields
    .filter((field) => field.value !== undefined && field.value !== null && field.value !== '')
    .map((field) => ({ label: field.label, value: field.options?.find((option) => option.value === String(field.value))?.label ?? String(field.value) }));
  const missing = action.fields.filter((field) => field.required && (field.value === undefined || field.value === null || field.value === ''));
  const summaryId = 'action-summary-' + action.id;

  const minutosCaduca = minutosRestantes(action.expiresAt, ahora);
  const caducada = !outcome && minutosCaduca === 0;
  const estado = estadoDe(outcome, isExecuting, caducada);
  const minutosDeshacer = outcome?.ok && outcome.undoAvailable ? minutosRestantes(outcome.undoUntil ?? null, ahora) : null;
  const puedeDeshacer = Boolean(outcome?.ok && outcome.undoAvailable && onUndo && minutosDeshacer !== 0);
  const dobleConfirmacion = requiereDobleConfirmacion(action.risk);
  const enlace = outcome?.ok && !outcome.undone ? enlaceEntidad(outcome.entity ?? null) : null;
  const tipoEntidad = tipoEnlazable(outcome?.entity?.type);

  // El reloj solo corre mientras algo depende de él (caducidad o deshacer).
  useEffect(() => {
    if (estado !== 'pendiente' && !(estado === 'completada' && outcome?.undoAvailable)) return;
    const id = window.setInterval(() => setAhora(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [estado, outcome?.undoAvailable]);

  useEffect(() => {
    if (enfocar) ref.current?.focus({ preventScroll: true });
  }, [enfocar]);

  // Otra propuesta en la misma tarjeta: el segundo paso no se hereda.
  useEffect(() => setRepitiendo(false), [action.id]);

  const confirmar = () => {
    if (isExecuting || missing.length > 0 || caducada) return;
    if (dobleConfirmacion && !repitiendo) {
      setRepitiendo(true);
      return;
    }
    onConfirm();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (estado !== 'pendiente') return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      confirmar();
    } else if (e.key === 'Escape') {
      // Se queda aquí: el Esc del panel (cerrar) no debe dispararse a la vez.
      e.preventDefault();
      e.stopPropagation();
      if (repitiendo) setRepitiendo(false);
      else onReject();
    }
  };

  const titulo = action.title;
  const descripcion = outcome ? outcome.message : preview?.summary || action.description;

  return (
    <section
      ref={ref}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      aria-label={t('etiqueta', { titulo })}
      aria-describedby={summaryId}
      aria-busy={isExecuting}
      className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {/* Encabezado */}
      <div className="space-y-1.5 px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          {estado === 'completada' && <CircleCheck className="h-5 w-5 shrink-0 text-success-text" strokeWidth={1.5} aria-hidden="true" />}
          {estado === 'error' && <CircleAlert className="h-5 w-5 shrink-0 text-danger-text" strokeWidth={1.5} aria-hidden="true" />}
          <h3 className="min-w-0 flex-1 text-base font-semibold leading-[22px] text-fg">{titulo}</h3>
          <Badge tono={TONO_ESTADO[estado]} tamano="sm" className="shrink-0">
            {t(`estado.${estado}`)}
          </Badge>
        </div>
        <p id={summaryId} className="break-words text-[13px] leading-[18px] text-fg-secondary" role={outcome ? 'status' : undefined}>
          {descripcion}
          {puedeDeshacer && minutosDeshacer ? ` ${t('puedesDeshacer', { n: minutosDeshacer })}` : ''}
        </p>
      </div>

      {/* Datos */}
      <div className="space-y-2 border-t border-line px-4 py-3">
        {lines.length > 0 && (
          <dl className="space-y-2">
            {lines.map((line, index) => (
              <div key={line.label + index} className="flex items-start gap-3">
                <dt className="w-24 shrink-0 break-words text-[13px] leading-[18px] text-fg-secondary">{line.label}</dt>
                <dd className="min-w-0 flex-1 break-words text-right text-sm font-medium text-fg">{line.value}</dd>
              </div>
            ))}
            {Object.entries(preview?.totals ?? {}).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 border-t border-line pt-2 text-sm font-semibold text-fg">
                <dt>{label}</dt>
                <dd className="tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {preview?.bulk && !outcome && <BulkPreviewTable bulk={preview.bulk} modo={modo} onVerEnGrande={onVerEnGrande} />}

        {!outcome && (preview?.warnings ?? []).map((warning, index) => (
          <p key={index} className="flex gap-2 text-[13px] leading-[18px] text-warning-text">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {warning}
          </p>
        ))}

        {!outcome && action.risk === 'high' && (
          <p className="flex items-center gap-2 rounded-lg bg-warning-subtle px-3 py-2 text-[13px] leading-[18px] text-warning-text">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {t('avisoContable')}
          </p>
        )}

        {!outcome && missing.length > 0 && (
          <p className="text-[13px] leading-[18px] text-warning-text">
            {t('falta', { campos: missing.map((field) => field.label).join(', ') })}
          </p>
        )}

        {!outcome && preview?.reversible === false && (
          <p className="text-[13px] font-medium leading-[18px] text-danger-text">{t('irreversible')}</p>
        )}

        {estado === 'pendiente' && minutosCaduca !== null && minutosCaduca <= AVISO_CADUCIDAD_MIN && (
          <p className="text-[13px] leading-[18px] text-warning-text" role="status">
            {t('caducaEn', { n: minutosCaduca })}
          </p>
        )}
        {estado === 'caducada' && (
          <p className="text-[13px] leading-[18px] text-fg-secondary" role="status">{t('caducada')}</p>
        )}

        {(estado === 'pendiente' || estado === 'ejecutando') && (
          <p className="flex flex-wrap gap-x-1 text-xs font-medium leading-4 text-fg-muted">
            <span>{t('nota')}</span>
            {onOpenForm && WITH_MODULE_FORM.has(action.type) && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onOpenForm}
                  disabled={isExecuting}
                  className="rounded text-link underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                  title={t('formularioAyuda')}
                >
                  {t('formulario')}
                </button>
              </>
            )}
          </p>
        )}
      </div>

      {/* Acciones */}
      {estado === 'pendiente' || estado === 'ejecutando' ? (
        <div className="border-t border-line">
          {repitiendo && (
            <p className="bg-brand-tint px-4 py-3 text-[13px] leading-[18px] text-fg" role="status">
              {t('repetir', { resumen: preview?.summary || action.description || titulo })}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 p-3">
            <button
              type="button"
              onClick={confirmar}
              disabled={isExecuting || missing.length > 0}
              aria-keyshortcuts="Control+Enter Meta+Enter"
              className={clasesBoton({ variante: 'primario', tamano: 'md', className: 'min-w-0 flex-1' })}
            >
              {isExecuting ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              )}
              {isExecuting ? t('guardando') : repitiendo ? t('siConfirmar') : t('confirmar')}
            </button>
            {repitiendo ? (
              <button type="button" onClick={() => setRepitiendo(false)} disabled={isExecuting} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
                {t('volver')}
              </button>
            ) : (
              <>
                <button type="button" onClick={onCorrect} disabled={isExecuting} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
                  {t('corregir')}
                </button>
                <button type="button" onClick={onReject} disabled={isExecuting} aria-keyshortcuts="Escape" className={clasesBoton({ variante: 'fantasma', tamano: 'md' })}>
                  {t('rechazar')}
                </button>
              </>
            )}
          </div>
          <p className="hidden px-4 pb-3 text-xs font-medium text-fg-muted lg:block">{repitiendo ? t('atajosRepetir') : t('atajos')}</p>
        </div>
      ) : estado === 'caducada' ? (
        <div className="flex flex-wrap gap-2 border-t border-line p-3">
          <button type="button" onClick={onExpiredDismiss ?? onReject} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <Pencil className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            {t('pedirOtro')}
          </button>
        </div>
      ) : (
        <div className={cn('flex flex-wrap gap-2 border-t border-line p-3', estado === 'deshecha' && 'hidden')}>
          {enlace && (
            <a href={enlace} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              <ExternalLink className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              {tipoEntidad ? t(`ver.${tipoEntidad}`) : t('ver.generico')}
            </a>
          )}
          {puedeDeshacer && (
            <button type="button" onClick={onUndo} disabled={isUndoing} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              {isUndoing ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Undo2 className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              )}
              {isUndoing ? t('deshaciendo') : minutosDeshacer ? t('deshacerMin', { n: minutosDeshacer }) : t('deshacer')}
            </button>
          )}
          {estado === 'error' && (
            <button type="button" onClick={onCorrect} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              <Pencil className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              {t('corregirReintentar')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
