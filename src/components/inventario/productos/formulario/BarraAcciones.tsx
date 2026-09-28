'use client';

import { CircleAlert, Loader2, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import type { SeccionFormulario } from '../logica/formularioProducto';

/**
 * Botones del formulario de producto. `pie`: barra fija abajo en escritorio
 * con el resumen «N errores · secciones»; `cabecera`: los mismos botones en
 * el `PageHeader`.
 */
export const CLASE_PRIMARIO =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
export const CLASE_SECUNDARIO =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';
export const CLASE_FANTASMA =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

export interface BarraAccionesProps {
  variante: 'pie' | 'cabecera';
  /** Crear o duplicar: ofrece «Guardar y crear otro». */
  crearOtro: boolean;
  guardando: false | 'guardar' | 'otro';
  onDescartar: () => void;
  onGuardar: () => void;
  onGuardarYOtro?: () => void;
  /** Motivo por el que no se puede guardar (sin permiso); deshabilita. */
  motivoBloqueo?: string | null;
  /** Solo `pie`. */
  seccionesConError?: readonly SeccionFormulario[];
  totalErrores?: number;
  sucio?: boolean;
  textoGuardar: string;
  className?: string;
}

export function BarraAcciones({
  variante,
  crearOtro,
  guardando,
  onDescartar,
  onGuardar,
  onGuardarYOtro,
  motivoBloqueo,
  seccionesConError = [],
  totalErrores = 0,
  sucio,
  textoGuardar,
  className,
}: BarraAccionesProps) {
  const t = useTranslations('productoForm.barra');
  const ts = useTranslations('productoForm.secciones');
  const ocupado = guardando !== false;
  const bloqueado = ocupado || !!motivoBloqueo;

  const botones = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" onClick={onDescartar} disabled={ocupado} className={CLASE_FANTASMA}>
        {t('descartar')}
      </button>
      {crearOtro && onGuardarYOtro && (
        <button
          type="button"
          onClick={onGuardarYOtro}
          disabled={bloqueado}
          title={motivoBloqueo ?? undefined}
          className={CLASE_SECUNDARIO}
        >
          {guardando === 'otro' && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {t('guardarYOtro')}
        </button>
      )}
      <button
        type="button"
        onClick={onGuardar}
        disabled={bloqueado}
        title={motivoBloqueo ?? undefined}
        aria-describedby={motivoBloqueo ? 'producto-motivo-bloqueo' : undefined}
        className={CLASE_PRIMARIO}
      >
        {guardando === 'guardar' ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Save aria-hidden className="size-4" strokeWidth={1.5} />
        )}
        {guardando === 'guardar' ? t('guardando') : textoGuardar}
      </button>
    </div>
  );

  if (variante === 'cabecera') return <div className={className}>{botones}</div>;

  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 flex flex-col gap-2 border-t border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6',
        className,
      )}
    >
      <div className="min-w-0 text-sm" aria-live="polite">
        {motivoBloqueo ? (
          <span id="producto-motivo-bloqueo" className="text-warning-text">
            {motivoBloqueo}
          </span>
        ) : totalErrores > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-danger-text">
            <CircleAlert aria-hidden className="size-4 shrink-0" strokeWidth={1.5} />
            {t('resumenErrores', {
              count: totalErrores,
              secciones: seccionesConError.map((s) => ts(`${s}.titulo`)).join(', '),
            })}
          </span>
        ) : (
          <span className="text-fg-muted">{sucio ? t('cambiosSinGuardar') : t('sinCambios')}</span>
        )}
      </div>
      {botones}
    </div>
  );
}
