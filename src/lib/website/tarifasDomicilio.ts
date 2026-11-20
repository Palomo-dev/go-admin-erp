/**
 * Resumen de las tarifas web por tipo de domicilio para «Opciones del checkout» (Figma
 * «16 Sitio web» 2686:57152, aprobado el 2026-11-19). Misma regla que el checkout de la tienda
 * (goadmin-websites lib/shipping/opcionesDomicilio.ts):
 *
 * - Tarifas de Transporte › Tarifas de envío activas y con «Web».
 * - La transportadora dice el grupo: `third_party` → «Transportadora» (Domicilio de tercero);
 *   flota propia o sin transportadora → «Domicilio» (Domicilio propio).
 * - Con un solo tipo de domicilio activo, ese tipo usa todas las tarifas.
 * - Precio de referencia: la base o el cargo mínimo, el mayor (sin peso ni ciudad: el checkout
 *   calcula el exacto con la dirección).
 *
 * Puro: servidor (ventasSitio.server.ts), diálogo y pruebas.
 */

export type GrupoEnvio = 'own' | 'third_party';

export interface ResumenTarifasGrupo {
  cantidad: number;
  /** Precio más bajo de referencia; `null` sin tarifas. */
  desde: number | null;
  diasMin: number | null;
  diasMax: number | null;
}

export type TarifasDomicilio = Record<GrupoEnvio, ResumenTarifasGrupo>;

export interface FilaTarifaDomicilio {
  base_rate: number | string | null;
  min_charge: number | string | null;
  estimated_transit_days: number | null;
  transport_carriers?: { carrier_type?: string | null } | { carrier_type?: string | null }[] | null;
}

const VACIO: ResumenTarifasGrupo = { cantidad: 0, desde: null, diasMin: null, diasMax: null };

export function grupoDeTransportadora(carrierType: unknown): GrupoEnvio {
  return carrierType === 'third_party' ? 'third_party' : 'own';
}

function sumar(a: ResumenTarifasGrupo, b: ResumenTarifasGrupo): ResumenTarifasGrupo {
  const menor = (x: number | null, y: number | null) => (x === null ? y : y === null ? x : Math.min(x, y));
  const mayor = (x: number | null, y: number | null) => (x === null ? y : y === null ? x : Math.max(x, y));
  return { cantidad: a.cantidad + b.cantidad, desde: menor(a.desde, b.desde), diasMin: menor(a.diasMin, b.diasMin), diasMax: mayor(a.diasMax, b.diasMax) };
}

export function resumirTarifasDomicilio(filas: readonly FilaTarifaDomicilio[]): TarifasDomicilio {
  const r: TarifasDomicilio = { own: { ...VACIO }, third_party: { ...VACIO } };
  for (const f of filas) {
    const transportadora = Array.isArray(f.transport_carriers) ? f.transport_carriers[0] : f.transport_carriers;
    const grupo = grupoDeTransportadora(transportadora?.carrier_type);
    const precio = Math.max(Number(f.base_rate) || 0, Number(f.min_charge) || 0);
    const dias = typeof f.estimated_transit_days === 'number' && f.estimated_transit_days >= 0 ? Math.round(f.estimated_transit_days) : null;
    r[grupo] = sumar(r[grupo], { cantidad: 1, desde: precio, diasMin: dias, diasMax: dias });
  }
  return r;
}

/** Tipos de domicilio marcados en «Cómo reciben el pedido», en el orden del checkout. */
export function gruposMarcados(tipos: readonly string[]): GrupoEnvio[] {
  const g: GrupoEnvio[] = [];
  if (tipos.includes('delivery_own')) g.push('own');
  if (tipos.includes('delivery_third_party')) g.push('third_party');
  return g;
}

/** Lo que verá ese tipo en el checkout: sus tarifas, o todas si es el único domicilio marcado. */
export function resumenDelTipo(t: TarifasDomicilio, grupo: GrupoEnvio, marcados: readonly GrupoEnvio[]): ResumenTarifasGrupo {
  return marcados.length < 2 ? sumar(t.own, t.third_party) : t[grupo];
}
