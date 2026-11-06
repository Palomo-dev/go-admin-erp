'use client';

import { CircleAlert, Landmark, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import type { CuentaEfectiva, EstadoCuenta } from '@/lib/finanzas/contabilidad/cuentaEfectiva';
import { SelectorCuenta, type OpcionCuenta } from './SelectorCuenta';
import { StatusBadge } from './StatusBadge';

/**
 * Campo de cuenta (Figma `CampoCuentaAutomatica`, sección 2317:39697).
 * Siempre dice qué cuenta se va a usar y de dónde sale. Quien no sabe de
 * contabilidad no toca nada; quien sabe, pulsa «Cambiar». Reemplaza al select
 * que decía «Sin cuenta propia».
 *
 * La cuenta la decide la base (`fn_cuentas_efectivas`): este campo no resuelve
 * nada, solo la muestra.
 */
export interface CampoCuentaAutomaticaProps {
  etiqueta: string;
  efectiva: CuentaEfectiva | null;
  cargando?: boolean;
  /** Hay una cuenta elegida aquí: se ofrece volver a la automática. */
  propia?: boolean;
  onCambiar: (cuenta: string | null) => void;
  buscar: (texto: string, desde: number) => Promise<{ items: readonly OpcionCuenta[]; total: number }>;
  deshabilitado?: boolean;
  className?: string;
}

const TONO_ESTADO: Record<EstadoCuenta, 'exito' | 'informacion' | 'marca' | 'advertencia' | 'peligro'> = {
  automatica: 'exito',
  categoria: 'informacion',
  propia: 'marca',
  titulo: 'advertencia',
  sin_cuenta: 'peligro',
};

const CAJA: Record<EstadoCuenta, string> = {
  automatica: 'border-line bg-subtle',
  categoria: 'border-line bg-subtle',
  propia: 'border-line bg-subtle',
  titulo: 'border-line-warning bg-warning-subtle',
  sin_cuenta: 'border-line-danger bg-danger-subtle',
};

const ENLACE = 'shrink-0 text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-50';

/** «Viene de la categoría Calzado», «Viene de la regla contable». */
export function useOrigenCuenta() {
  const t = useTranslations('cuentasAutomaticas');
  return (c: CuentaEfectiva): string => {
    if (c.estado === 'titulo') {
      return c.asentable
        ? t('origen.tituloConAuxiliar', { cuenta: c.configurada ?? '', auxiliar: c.cuenta ?? '' })
        : t('origen.tituloSinAuxiliar', { cuenta: c.configurada ?? '' });
    }
    if (c.estado === 'sin_cuenta') return c.fallo ?? t('origen.sinCuenta');
    if (c.prevista) return t('origen.prevista');
    if (c.origen === 'categoria') return t('origen.categoria', { nombre: c.categoriaOrigen ?? c.categoriaNombre ?? '' });
    if (c.origen === 'sede' || c.origen === 'empresa' || c.origen === 'sector') {
      return c.claveContable ? t(`origen.${c.origen}Clave`, { clave: t(`claves.${c.claveContable}.nombre`) }) : t(`origen.${c.origen}`);
    }
    return t(`origen.${c.origen}`);
  };
}

export function CampoCuentaAutomatica({
  etiqueta,
  efectiva,
  cargando,
  propia,
  onCambiar,
  buscar,
  deshabilitado,
  className,
}: CampoCuentaAutomaticaProps) {
  const t = useTranslations('cuentasAutomaticas');
  const origenDe = useOrigenCuenta();
  const estado: EstadoCuenta = efectiva?.estado ?? 'sin_cuenta';
  const valor = efectiva?.cuenta ? { account_code: efectiva.cuenta, name: efectiva.nombre ?? '' } : null;
  const accion = estado === 'titulo' ? t('accion.elegirAuxiliar') : estado === 'sin_cuenta' ? t('accion.elegirCuenta') : t('accion.cambiar');
  const Icono = estado === 'titulo' ? TriangleAlert : estado === 'sin_cuenta' ? CircleAlert : Landmark;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-fg">{etiqueta}</span>
        {efectiva && !cargando && (
          <StatusBadge estado={estado} etiqueta={t(`estado.${estado}`)} tono={TONO_ESTADO[estado]} apariencia="suave" />
        )}
      </div>
      {cargando && !efectiva ? (
        <Skeleton className="h-[60px] w-full rounded-lg" />
      ) : (
        <div className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5', CAJA[estado])}>
          <Icono aria-hidden="true" className={cn('size-4 shrink-0', estado === 'titulo' ? 'text-warning-text' : estado === 'sin_cuenta' ? 'text-danger-text' : 'text-fg-secondary')} strokeWidth={1.5} />
          <div className="min-w-0 flex-1">
            {efectiva?.cuenta && (
              <p className="truncate text-sm text-fg">
                <span className="font-medium tabular-nums">{efectiva.cuenta}</span>
                {efectiva.nombre ? <span className="ml-2">{efectiva.nombre}</span> : null}
              </p>
            )}
            {efectiva && (
              <p className={cn('text-xs', estado === 'titulo' ? 'text-warning-text' : estado === 'sin_cuenta' ? 'text-danger-text' : 'text-fg-secondary')}>
                {origenDe(efectiva)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <SelectorCuenta
              valor={valor}
              onCambiar={(c) => onCambiar(c.account_code)}
              buscar={buscar}
              etiqueta={etiqueta}
              deshabilitado={deshabilitado}
              disparador={
                <button type="button" className={ENLACE} disabled={deshabilitado}>
                  {accion}
                </button>
              }
            />
            {propia && (
              <button type="button" className={ENLACE} disabled={deshabilitado} onClick={() => onCambiar(null)}>
                {t('accion.volverAutomatica')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
