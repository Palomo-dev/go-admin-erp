'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import { EmptyState } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';

/**
 * Pantalla de la mesa (Figma «POS — Mesas: flujo completo de atención»):
 * - Escritorio (≥ 1280): el MISMO POS — cabecera del POS, catálogo a la
 *   izquierda y la cuenta de la mesa como pestaña del carrito a la derecha
 *   (D2–D9, D12).
 * - Tableta (1024): cabecera de la mesa, catálogo en lista y la cuenta (T2–T7,
 *   S1–S8), con el aviso de la mesa arriba (sin caja, sin conexión, abandonada).
 * - Celular: catálogo y la cuenta en una hoja (la abre la barra fija).
 * Estados de toda la pantalla: cargando (S2), error (S3) y sin permiso (S6).
 * Solo compone: los datos y las acciones llegan del contenedor.
 */
export type ModoPantallaMesa = 'escritorio' | 'tableta' | 'movil';
export type EstadoPantallaMesa = 'cargando' | 'error' | 'sinPermiso' | 'lista';

export interface PantallaMesaProps {
  modo: ModoPantallaMesa;
  estado: EstadoPantallaMesa;
  mesaNombre: string;
  /** Escritorio: `CabeceraPos`. */
  cabeceraPos?: ReactNode;
  /** Escritorio: `CartTabs` con la pestaña de la mesa. */
  pestanas?: ReactNode;
  /** Tableta y celular: `CabeceraMesa`. */
  cabeceraMesa?: ReactNode;
  /** Aviso de la mesa bajo la cabecera (tableta) o sobre la cuenta (escritorio). */
  aviso?: ReactNode;
  catalogo: ReactNode;
  panel: ReactNode;
  /** Celular: barra fija con el total y «Ver cuenta». */
  barraMovil?: ReactNode;
  onReintentar: () => void;
  onVolver: () => void;
  className?: string;
}

export function PantallaMesa({
  modo,
  estado,
  mesaNombre,
  cabeceraPos,
  pestanas,
  cabeceraMesa,
  aviso,
  catalogo,
  panel,
  barraMovil,
  onReintentar,
  onVolver,
  className,
}: PantallaMesaProps) {
  const t = useTranslations('posMesasFlujo.pantalla');
  const escritorio = modo === 'escritorio';

  const cuerpo =
    estado === 'cargando' ? (
      <div className={cn('flex min-h-0 flex-1 gap-4', escritorio ? 'p-4' : 'p-4')} aria-busy="true" aria-label={t('cargando')}>
        <div className="flex w-[360px] shrink-0 flex-col gap-3">
          <Skeleton className="h-20 w-[100px] rounded-xl" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="size-10 rounded-lg" />
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-3 flex-1 rounded" />
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 self-start rounded-xl border border-line bg-surface p-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <Skeleton className="size-12 rounded-lg" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-1/2 rounded" />
                <Skeleton className="h-3 w-1/3 rounded" />
              </div>
              <Skeleton className="h-3 w-16 rounded" />
            </div>
          ))}
          <Skeleton className="h-3 w-1/3 rounded" />
          <Skeleton className="h-3 w-1/3 rounded" />
          <Skeleton className="h-3 w-1/3 rounded" />
        </div>
      </div>
    ) : estado === 'error' ? (
      <div className="flex flex-1 items-start justify-center px-4 pt-24">
        <EmptyState variante="error" titulo={t('errorTitulo', { mesa: mesaNombre })} descripcion={t('errorDescripcion')} onReintentar={onReintentar} />
      </div>
    ) : estado === 'sinPermiso' ? (
      <div className="flex flex-1 items-start justify-center px-4 pt-24">
        <EmptyState
          variante="forbidden"
          icono={Lock}
          titulo={t('sinPermisoTitulo')}
          descripcion={t('sinPermisoDescripcion')}
          accion={{ etiqueta: t('volverPlano'), onClick: onVolver }}
        />
      </div>
    ) : escritorio ? (
      <div className="flex min-h-0 flex-1 gap-4 px-4 pb-4 pt-4">
        <div className="min-w-0 flex-1">{catalogo}</div>
        <div className="flex w-[560px] shrink-0 flex-col gap-2">
          {pestanas}
          {aviso}
          <div className="min-h-0 flex-1">{panel}</div>
        </div>
      </div>
    ) : modo === 'tableta' ? (
      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <div className="flex w-[344px] shrink-0 flex-col">{catalogo}</div>
        <div className="min-h-0 min-w-0 flex-1">{panel}</div>
      </div>
    ) : (
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="min-h-0 flex-1">{catalogo}</div>
        {barraMovil}
      </div>
    );

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-canvas', className)}>
      {escritorio ? (
        <div className="shrink-0 px-4 pt-4">{cabeceraPos}</div>
      ) : (
        cabeceraMesa
      )}
      {!escritorio && aviso && estado === 'lista' && <div className="shrink-0 px-4 pt-3">{aviso}</div>}
      {cuerpo}
    </div>
  );
}
