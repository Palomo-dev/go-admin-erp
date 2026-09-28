/**
 * Cierre ciego de caja: qué importes ve cada persona. Módulo hoja, sin
 * dependencias, compartido por el servidor (`GET /api/pos/cajas/[id]/resumen`,
 * reporte) y la pantalla.
 *
 * Regla (K2 de docs/implementacion/CAJAS-VENTAS-PLAN.md): con cierre ciego
 * activo, quien no tiene `pos.cajas.ver_esperado` no ve el esperado, el
 * desglose que permite reconstruirlo, el final contado ni la diferencia. La
 * máscara la aplica el SERVIDOR (D8): la pantalla nunca recibe la cifra que
 * tiene que ocultar. La base aplica la misma regla en `pos_caja_esperado`,
 * `pos_caja_registrar_arqueo` y `pos_caja_cerrar`.
 */

/** ¿Se ven los importes? Sin cierre ciego, sí; con cierre ciego, solo con el permiso. */
export function visibilidadImportes(cierreCiego: boolean, puedeVerEsperado: boolean): boolean {
  return !cierreCiego || puedeVerEsperado;
}

/** Desglose del esperado de efectivo (`pos_caja_esperado.detalle`). */
export interface DetalleEsperado {
  inicial: number;
  ventas_efectivo: number;
  vuelto: number;
  abonos_efectivo: number;
  entradas: number;
  salidas: number;
  compras_efectivo: number;
  devoluciones: number;
}

/** Respuesta de `pos_caja_esperado`, ya con números. `null` = oculto por cierre ciego. */
export interface EsperadoCaja {
  session_id: number;
  status: 'open' | 'closed' | string;
  efectivo_esperado: number | null;
  por_metodo: Record<string, number> | null;
  detalle: DetalleEsperado | null;
  por_cajero: boolean;
  hasta: string | null;
  /** true cuando el servidor ocultó las cifras por cierre ciego. */
  oculto: boolean;
}

const CAMPOS_DETALLE: (keyof DetalleEsperado)[] = [
  'inicial',
  'ventas_efectivo',
  'vuelto',
  'abonos_efectivo',
  'entradas',
  'salidas',
  'compras_efectivo',
  'devoluciones',
];

function numero(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** Convierte el jsonb de `pos_caja_esperado` en `EsperadoCaja` (números, no strings). */
export function leerEsperado(raw: unknown): EsperadoCaja {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const oculto = r.oculto === true;
  const porMetodoRaw = r.por_metodo && typeof r.por_metodo === 'object' ? (r.por_metodo as Record<string, unknown>) : null;
  const detalleRaw = r.detalle && typeof r.detalle === 'object' ? (r.detalle as Record<string, unknown>) : null;
  const porMetodo: Record<string, number> | null = porMetodoRaw
    ? Object.fromEntries(Object.entries(porMetodoRaw).map(([k, v]) => [k, numero(v)]))
    : null;
  const detalle: DetalleEsperado | null = detalleRaw
    ? (Object.fromEntries(CAMPOS_DETALLE.map((c) => [c, numero(detalleRaw[c])])) as unknown as DetalleEsperado)
    : null;
  return {
    session_id: numero(r.session_id),
    status: typeof r.status === 'string' ? r.status : 'open',
    efectivo_esperado: oculto || r.efectivo_esperado == null ? null : numero(r.efectivo_esperado),
    por_metodo: oculto ? null : porMetodo,
    detalle: oculto ? null : detalle,
    por_cajero: r.por_cajero === true,
    hasta: typeof r.hasta === 'string' ? r.hasta : null,
    oculto,
  };
}

/** Quita las cifras que permiten conocer el esperado. Idempotente. */
export function enmascararEsperado(esperado: EsperadoCaja, visible: boolean): EsperadoCaja {
  if (visible) return esperado;
  return { ...esperado, efectivo_esperado: null, por_metodo: null, detalle: null, oculto: true };
}

/** Sesión con los importes del cierre ocultos: final contado y diferencia. */
export function enmascararSesion<T extends { final_amount?: number | null; difference?: number | null }>(
  sesion: T,
  visible: boolean,
): T {
  if (visible) return sesion;
  return { ...sesion, final_amount: null, difference: null };
}

/** Línea de `cash_counts.method_breakdown`. */
export interface LineaArqueo {
  esperado: number | null;
  contado: number | null;
  diferencia: number | null;
}

/** Arqueo con esperado y diferencias ocultos; lo contado se conserva (lo contó quien lo ve). */
export function enmascararArqueo<
  T extends {
    expected_amount?: number | null;
    difference?: number | null;
    method_breakdown?: Record<string, LineaArqueo> | null;
  },
>(arqueo: T, visible: boolean): T {
  if (visible) return arqueo;
  const desglose = arqueo.method_breakdown
    ? Object.fromEntries(
        Object.entries(arqueo.method_breakdown).map(([metodo, linea]) => [
          metodo,
          { esperado: null, contado: linea?.contado ?? null, diferencia: null },
        ]),
      )
    : arqueo.method_breakdown;
  return { ...arqueo, expected_amount: null, difference: null, method_breakdown: desglose };
}
