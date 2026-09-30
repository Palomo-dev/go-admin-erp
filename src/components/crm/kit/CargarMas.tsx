'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Loader2, RotateCw } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesBoton } from '@/components/kit/botonClases';
import { estadoCargarMas, siguienteLote, type EntidadCargarMas } from './cargarMasLogica';

/**
 * «Cargar más» por cursor (Figma `CargarMas` 759:444795): «Mostrando 40 de
 * 1.284 actividades» + «Cargar 20 más». Mientras carga, el botón se
 * deshabilita con spinner (la lista no se esqueletiza entera). Al final:
 * «No hay más actividades · 1.284 en total». Si la página falla, reintentar
 * sin perder lo ya cargado.
 */
export interface CargarMasProps {
  mostrados: number;
  total: number | null | undefined;
  tamanoPagina?: number;
  hayMas?: boolean;
  cargando?: boolean;
  error?: string | null;
  onCargar: () => void;
  entidad?: EntidadCargarMas;
  className?: string;
}

export function CargarMas({ mostrados, total, tamanoPagina = 20, hayMas, cargando, error, onCargar, entidad = 'actividades', className }: CargarMasProps) {
  const t = useTranslations('crm.kit.cargarMas');
  const idioma = useLocale();
  const estado = estadoCargarMas({ mostrados, total, hayMas, cargando, error });
  const n = (x: number) => new Intl.NumberFormat(idioma).format(x);
  const conTotal = typeof total === 'number';

  if (estado === 'fin') {
    return (
      <p role="status" className={cn('py-4 text-center text-[13px] text-fg-muted', className)}>
        {conTotal ? t(`fin.${entidad}`, { total: n(total) }) : t(`finSinTotal.${entidad}`)}
      </p>
    );
  }
  const lote = siguienteLote(mostrados, total, tamanoPagina);
  return (
    <div className={cn('flex flex-col items-center gap-2 py-4', className)}>
      <p aria-live="polite" className="text-[13px] text-fg-secondary">
        {conTotal ? t(`mostrando.${entidad}`, { mostrados: n(mostrados), total: n(total) }) : t(`mostrandoSinTotal.${entidad}`, { mostrados: n(mostrados) })}
      </p>
      {estado === 'error' && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onCargar}
        disabled={estado === 'cargando'}
        aria-busy={estado === 'cargando' || undefined}
        className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
      >
        {estado === 'cargando' ? (
          <>
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {t('cargando')}
          </>
        ) : estado === 'error' ? (
          <>
            <RotateCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('reintentar')}
          </>
        ) : (
          t('cargar', { cantidad: lote })
        )}
      </button>
    </div>
  );
}
