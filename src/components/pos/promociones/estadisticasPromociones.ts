/**
 * Cifras de Promociones V2 (Figma «05 POS y ventas»: lista 2998:192942 «Ahorro del mes»; detalle
 * 3003:193974 «Ventas con la promoción», «Ahorro dado a clientes», «Unidades en escalón», columna
 * «Ventas» de los escalones y «Ventas recientes»).
 *
 * Salen de `sale_promotions` (migración 20261124235000), que llenan `pos_checkout_v1` (mostrador y
 * mesas) y los pedidos web confirmados, por las RPC `fn_promociones_resumen` y
 * `fn_promocion_estadisticas` (SECURITY INVOKER: la sesión solo ve su organización). El mes es el
 * calendario de la ZONA DE LA ORGANIZACIÓN, nunca el del navegador.
 */
import { supabase } from '@/lib/supabase/config';
import { plainDateToInstant, todayInTz } from '@/lib/utils/dateCore';

export interface ResumenPromociones {
  ahorro: number;
  ventas: number;
  porPromocion: Record<string, { ventas: number; ahorro: number; unidades: number }>;
}

export interface VentaRecientePromocion {
  saleId: string;
  fecha: string | null;
  canal: 'pos' | 'mesa' | 'web';
  descuento: number;
  resumen: string | null;
  sucursal: string | null;
  numero: string | null;
}

export interface EstadisticasPromocion {
  ventas: number;
  ahorro: number;
  unidades: number;
  /** Por `desde` del escalón (texto): unidades y ventas del mes. */
  porEscalon: Record<string, { unidades: number; ventas: number }>;
  recientes: VentaRecientePromocion[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** [desde, hasta) del mes en curso en la zona de la organización, y el mes «YYYY-MM». */
export function limitesMesActual(timezone: string): { desde: string; hasta: string; mes: string } {
  const mes = todayInTz(timezone).slice(0, 7);
  const anio = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));
  const siguiente = numero === 12 ? `${anio + 1}-01-01` : `${anio}-${String(numero + 1).padStart(2, '0')}-01`;
  return {
    desde: plainDateToInstant(`${mes}-01`, timezone, '00:00'),
    hasta: plainDateToInstant(siguiente, timezone, '00:00'),
    mes,
  };
}

export function parsearResumen(data: unknown): ResumenPromociones {
  const o = objeto(data);
  const porPromocion: ResumenPromociones['porPromocion'] = {};
  for (const f of Array.isArray(o.por_promocion) ? o.por_promocion : []) {
    const r = objeto(f);
    const id = typeof r.promotion_id === 'string' ? r.promotion_id : null;
    if (!id) continue;
    porPromocion[id] = { ventas: num(r.ventas), ahorro: num(r.ahorro), unidades: num(r.unidades) };
  }
  return { ahorro: num(o.ahorro), ventas: num(o.ventas), porPromocion };
}

export function parsearEstadisticas(data: unknown): EstadisticasPromocion {
  const o = objeto(data);
  const porEscalon: EstadisticasPromocion['porEscalon'] = {};
  for (const [k, v] of Object.entries(objeto(o.por_escalon))) {
    const r = objeto(v);
    porEscalon[k] = { unidades: num(r.unidades), ventas: num(r.ventas) };
  }
  const recientes: VentaRecientePromocion[] = (Array.isArray(o.recientes) ? o.recientes : [])
    .map((f) => objeto(f))
    .filter((r) => typeof r.sale_id === 'string')
    .map((r) => ({
      saleId: String(r.sale_id),
      fecha: typeof r.fecha === 'string' ? r.fecha : null,
      canal: r.canal === 'web' || r.canal === 'mesa' ? r.canal : 'pos',
      descuento: num(r.descuento),
      resumen: typeof r.resumen === 'string' && r.resumen.trim() ? r.resumen : null,
      sucursal: typeof r.sucursal === 'string' && r.sucursal.trim() ? r.sucursal : null,
      numero: typeof r.numero === 'string' && r.numero.trim() ? r.numero : null,
    }));
  return { ventas: num(o.ventas), ahorro: num(o.ahorro), unidades: num(o.unidades), porEscalon, recientes };
}

/** «Ahorro del mes» de la lista: toda la organización, o la sucursal elegida. */
export async function cargarResumenPromociones(
  organizationId: number,
  timezone: string,
  branchId?: number | null,
): Promise<ResumenPromociones> {
  const { desde, hasta } = limitesMesActual(timezone);
  const { data, error } = await supabase.rpc('fn_promociones_resumen', {
    p_organization_id: organizationId,
    p_desde: desde,
    p_hasta: hasta,
    p_branch_id: branchId ?? null,
  });
  if (error) throw error;
  return parsearResumen(data);
}

/** Cifras del detalle: el mes en curso y las últimas ventas (de cualquier fecha). */
export async function cargarEstadisticasPromocion(
  promotionId: string,
  timezone: string,
  limite = 5,
): Promise<EstadisticasPromocion> {
  const { desde, hasta } = limitesMesActual(timezone);
  const { data, error } = await supabase.rpc('fn_promocion_estadisticas', {
    p_promotion_id: promotionId,
    p_desde: desde,
    p_hasta: hasta,
    p_limite: limite,
  });
  if (error) throw error;
  return parsearEstadisticas(data);
}
