'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Factory } from 'lucide-react';
import { EmptyState, TabBar, idPanel, idPestana, type PestanaTab } from '@/components/kit';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { ErrorProduccion, resumenProduccionProducto, type ResumenProduccionProducto } from '@/lib/services/productionOrderService';
import { SubCostoProducto } from './SubCostoProducto';
import { SubDistribucionProducto } from './SubDistribucionProducto';
import { SubOrdenesProducto } from './SubOrdenesProducto';
import { SubRecetaProducto } from './SubRecetaProducto';
import { SubUnidadesProducto } from './SubUnidadesProducto';

export type SubProduccion = 'receta' | 'costo' | 'ordenes' | 'distribucion' | 'unidades';
const SUBS: readonly SubProduccion[] = ['receta', 'costo', 'ordenes', 'distribucion', 'unidades'];
/** Parámetro propio en la URL (`?tab=produccion&psub=costo`): no choca con `sub` del detalle. */
export const PARAM_SUB_PRODUCCION = 'psub';

/** Lo mínimo del producto que necesita la pestaña (la fila de `ProductoDetalle` sirve tal cual). */
export interface ProductoPestanaProduccion {
  id: number;
  name: string;
  sku?: string | null;
  unit_code?: string | null;
  track_stock?: boolean | null;
}

export interface PestanaProduccionProps {
  producto: ProductoPestanaProduccion;
  /**
   * Permisos que ya tiene el detalle (`fn_productos_permisos`). Solo ocultan
   * acciones: la pestaña lee además los de inventario y cada RPC vuelve a exigir
   * el suyo en el servidor.
   */
  permisos?: { editar?: boolean } | null;
}

/**
 * Detalle de producto › Producción (Figma D1–D6 968:175070…180119, diálogos G1–G6
 * 970:177054…177494, móvil M1–M3): Receta · Costo · Órdenes · Distribución ·
 * Unidades. Cada sub-pestaña es una `TablaSubseccion` y el detalle de una fila
 * se abre en una `HojaDetalle`. La monta B7 en `DetalleProducto.tsx` con el
 * contrato `<PestanaProduccion producto={…} permisos={…} />`.
 */
export function PestanaProduccion({ producto, permisos }: PestanaProduccionProps) {
  const t = useTranslations('subseccion');
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const params = useSearchParams();
  const [resumen, setResumen] = useState<ResumenProduccionProducto | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error' | 'sinPermiso'>('cargando');
  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  const valor = params?.get(PARAM_SUB_PRODUCCION) ?? '';
  const sub: SubProduccion = (SUBS as readonly string[]).includes(valor) ? (valor as SubProduccion) : 'receta';
  const irA = (s: SubProduccion) => {
    const q = new URLSearchParams(params?.toString() ?? '');
    if (s === 'receta') q.delete(PARAM_SUB_PRODUCCION);
    else q.set(PARAM_SUB_PRODUCCION, s);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const control = new AbortController();
    resumenProduccionProducto(getOrganizationId(), producto.id, control.signal)
      .then((r) => {
        setResumen(r);
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        setEstado(e instanceof ErrorProduccion && e.sinPermiso ? 'sinPermiso' : 'error');
      });
    return () => control.abort();
  }, [producto.id, recarga]);

  if (estado === 'error' || estado === 'sinPermiso') {
    return (
      <EmptyState
        variante={estado === 'sinPermiso' ? 'forbidden' : 'error'}
        icono={Factory}
        titulo={t(`estados.${estado}.titulo`)}
        descripcion={t(`estados.${estado}.descripcion`)}
        accion={estado === 'error' ? { etiqueta: t('reintentar'), onClick: recargar } : undefined}
      />
    );
  }

  const pestanas: PestanaTab<SubProduccion>[] = [
    { valor: 'receta', etiqueta: t('pestanas.receta') },
    { valor: 'costo', etiqueta: t('pestanas.costo') },
    { valor: 'ordenes', etiqueta: t('pestanas.ordenes'), contador: resumen?.ordenes },
    { valor: 'distribucion', etiqueta: t('pestanas.distribucion'), contador: resumen?.traslados },
    { valor: 'unidades', etiqueta: t('pestanas.unidades'), contador: resumen?.conversiones.length },
  ];
  const ID = 'producto-produccion';
  const editarReceta = (resumen?.editar_receta ?? false) && permisos?.editar !== false;

  return (
    <div className="flex flex-col gap-4">
      <TabBar id={ID} etiqueta={t('pestanas.etiqueta')} tamano="sm" pestanas={pestanas} valor={sub} onValorChange={irA} />
      <div role="tabpanel" id={idPanel(ID, sub)} aria-labelledby={idPestana(ID, sub)} className="min-w-0">
        {!resumen ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <div className="h-6 w-48 animate-pulse rounded bg-subtle" />
            <div className="h-40 animate-pulse rounded-xl bg-subtle" />
          </div>
        ) : (
          <>
            {sub === 'receta' && <SubRecetaProducto producto={producto} resumen={resumen} puedeEditar={editarReceta} onCambio={recargar} irA={irA} />}
            {sub === 'costo' && <SubCostoProducto producto={producto} resumen={resumen} />}
            {sub === 'ordenes' && <SubOrdenesProducto producto={producto} resumen={resumen} onCambio={recargar} />}
            {sub === 'distribucion' && <SubDistribucionProducto producto={producto} resumen={resumen} />}
            {sub === 'unidades' && <SubUnidadesProducto resumen={resumen} />}
          </>
        )}
      </div>
    </div>
  );
}
