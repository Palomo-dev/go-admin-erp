'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Filter, RotateCw } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesBoton } from '@/components/kit/botonClases';
import { estadoCaptureBanner } from './captureBannerLogica';

/**
 * Aviso de leads capturados sin colocar (Figma `CaptureBanner` 759:444768):
 * `web_capture_lead` guardó el cliente pero la organización no tiene embudo
 * de ventas. Primer paso: «Crear embudo de ventas» (abre «Nuevo pipeline» con
 * Ventas elegida); «Ver los N leads» filtra la tabla con el chip «Sin
 * colocar». Escritorio en fila; móvil apilado con los botones a todo el
 * ancho (por CSS, `lg:`).
 *
 * Sin leads sin colocar no se pinta nada. Sin permiso de gestionar pipelines,
 * el botón de crear no aparece y el texto dice a quién pedirlo.
 */
export interface CaptureBannerProps {
  cantidad: number | null | undefined;
  onVerLeads?: () => void;
  onCrearEmbudo?: () => void;
  /** `crm.pipelines.manage`, resuelto en el servidor. */
  puedeCrearEmbudo?: boolean;
  cargando?: boolean;
  error?: string | null;
  onReintentar?: () => void;
  className?: string;
}

export function CaptureBanner({ cantidad, onVerLeads, onCrearEmbudo, puedeCrearEmbudo = true, cargando, error, onReintentar, className }: CaptureBannerProps) {
  const t = useTranslations('crm.kit.captura');
  const estado = estadoCaptureBanner({ cantidad, cargando, error });
  if (estado === 'oculto') return null;
  const n = cantidad ?? 0;

  if (estado === 'cargando') {
    return <div aria-busy="true" aria-label={t('cargando')} className={cn('h-[94px] animate-pulse rounded-xl border border-line bg-subtle', className)} />;
  }
  if (estado === 'error') {
    return (
      <div role="alert" className={cn('flex flex-wrap items-center gap-3 rounded-xl border border-line-danger bg-danger-subtle px-4 py-3 text-sm text-danger-text', className)}>
        <span className="flex-1">{error}</span>
        {onReintentar && (
          <button type="button" onClick={onReintentar} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <RotateCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('reintentar')}
          </button>
        )}
      </div>
    );
  }

  return (
    <section
      role="status"
      aria-labelledby="crm-captura-titulo"
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4 lg:flex-row lg:items-center lg:gap-4',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-warning-text">
          <AlertTriangle className="size-4" strokeWidth={1.5} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="crm-captura-titulo" className="text-sm font-semibold text-fg">
            {t('titulo', { cantidad: n })}
          </h2>
          <p className="text-[13px] leading-[18px] text-fg-secondary">
            {t('descripcion')} {!puedeCrearEmbudo && t('sinPermiso')}
          </p>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 lg:flex-row lg:items-center">
        {onVerLeads && (
          <button type="button" onClick={onVerLeads} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'w-full lg:w-auto' })}>
            {t('verLeads', { cantidad: n })}
          </button>
        )}
        {puedeCrearEmbudo && onCrearEmbudo && (
          <button type="button" onClick={onCrearEmbudo} className={clasesBoton({ tamano: 'sm', className: 'w-full lg:w-auto' })}>
            <Filter aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('crearEmbudo')}
          </button>
        )}
      </div>
    </section>
  );
}
