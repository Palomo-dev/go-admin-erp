/**
 * Lógica pura de «Planes que se muestran» (sección «Planes de membresía», Figma «16 Sitio web» E2,
 * 3286-101346). Lee las filas de `membership_plans` con su producto y precios y las deja como la
 * tienda las ve: estado de venta (`estadoVentaPlan`) y precio vigente (`precioVigente` del POS, la
 * única regla de vigencia). Sin React ni Supabase.
 */
import { importePrecioVigente, type FilaPrecio } from '@/lib/pos/precioVigente';
import { estadoVentaPlan, ordenPorDefecto, ordenarPlanes, type AjustesPlanes, type EstadoVentaPlan } from '@/lib/website/contrato/paginaMembresias';

/** Columnas que lee el editor (verificadas por MCP el 2026-11-25). */
export const SELECT_PLANES_EDITOR = 'id, name, is_active, product_id, products:product_id ( status, product_prices ( price, effective_from, effective_to ) )';

export interface FilaPlanEditor {
  id: number;
  name: string | null;
  is_active: boolean | null;
  product_id: number | null;
  products?: { status?: string | null; product_prices?: FilaPrecio[] | null } | { status?: string | null; product_prices?: FilaPrecio[] | null }[] | null;
}

export interface PlanEditor {
  id: number;
  nombre: string;
  /** `membership_plans.is_active`: solo los activos llegan a la tienda. */
  activo: boolean;
  estado: EstadoVentaPlan;
  /** Precio vigente (en línea o pausado); null = a consultar. */
  price: number | null;
}

export function planesDesdeFilas(filas: readonly FilaPlanEditor[] | null | undefined, ahora: Date = new Date()): PlanEditor[] {
  const planes = (filas ?? []).map((f): PlanEditor => {
    const producto = Array.isArray(f.products) ? f.products[0] ?? null : f.products ?? null;
    const vigente = producto && producto.status !== 'deleted' ? importePrecioVigente(producto.product_prices ?? [], ahora) : null;
    const estado = estadoVentaPlan(producto?.status ?? null, vigente !== null);
    return {
      id: Number(f.id),
      nombre: (f.name ?? '').trim() || `#${f.id}`,
      activo: f.is_active === true,
      estado,
      price: estado === 'consulta' ? null : vigente,
    };
  });
  return ordenPorDefecto(planes);
}

/** Activos en el orden de la sección (los que ve la tienda, ocultos incluidos) e inactivos aparte. */
export function listaEditor(planes: readonly PlanEditor[], ajustes: Pick<AjustesPlanes, 'orden'>): { activos: PlanEditor[]; inactivos: PlanEditor[] } {
  return {
    activos: ordenarPlanes(planes.filter((p) => p.activo), ajustes),
    inactivos: planes.filter((p) => !p.activo),
  };
}

/** Ids tras mover el plan de la posición `i` un paso arriba (-1) o abajo (1). */
export function moverPlan(ids: readonly number[], i: number, paso: -1 | 1): number[] {
  const j = i + paso;
  if (i < 0 || i >= ids.length || j < 0 || j >= ids.length) return [...ids];
  const siguiente = [...ids];
  [siguiente[i], siguiente[j]] = [siguiente[j], siguiente[i]];
  return siguiente;
}
