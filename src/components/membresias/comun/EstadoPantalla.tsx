'use client';

import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import type { ErrorPeticionMembresias } from '@/lib/services/membresias/clienteMembresias';
import { esSinPermiso } from './useCargaMembresias';

export interface EstadoPantallaProps {
  error: ErrorPeticionMembresias;
  onReintentar: () => void;
  /** Qué no se pudo cargar («las membresías», «el resumen»). */
  tituloError?: string;
  compacto?: boolean;
}

/**
 * Estados F4 (error con «Reintentar» y código para soporte) y F5 (sin permiso) de todas las
 * pantallas de Membresías. El vacío (F2) y «sin resultados» (F3) los pinta cada tabla con el
 * `EmptyState` del kit porque llevan acciones propias.
 */
export function EstadoPantalla({ error, onReintentar, tituloError, compacto }: EstadoPantallaProps) {
  const t = useTranslations('membresias.pantalla');
  if (esSinPermiso(error)) {
    return (
      <EmptyState
        variante="forbidden"
        titulo={t('sinPermiso.titulo')}
        descripcion={t('sinPermiso.descripcion')}
        accion={{ etiqueta: t('sinPermiso.volver'), href: '/app/inicio' }}
        compacto={compacto}
      />
    );
  }
  if (error.estado === 404 || error.codigo === 'membresia_no_encontrada') {
    return (
      <EmptyState
        variante="empty"
        titulo={t('noEncontrada.titulo')}
        descripcion={t('noEncontrada.descripcion')}
        accion={{ etiqueta: t('noEncontrada.volver'), href: '/app/membresias/membresias' }}
        compacto={compacto}
      />
    );
  }
  return (
    <EmptyState
      variante="error"
      titulo={tituloError ?? t('error.titulo')}
      descripcion={t('error.descripcion', { codigo: `ERR-MEM-${error.estado || 0}` })}
      onReintentar={onReintentar}
      compacto={compacto}
    />
  );
}

/** Esqueleto de una pantalla de tarjetas (F1/F6): cifras arriba y bloques debajo. */
export function EsqueletoPantalla({ bloques = 2, cifras = 4 }: { bloques?: number; cifras?: number }) {
  const t = useTranslations('membresias.pantalla');
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">{t('cargando')}</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: cifras }, (_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: bloques }, (_, i) => (
          <Skeleton key={i} className={i === 0 ? 'h-64 rounded-xl lg:col-span-2' : 'h-64 rounded-xl'} />
        ))}
      </div>
    </div>
  );
}
