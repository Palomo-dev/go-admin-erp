/**
 * Antigüedad de cartera: cinco tramos por días vencidos. Compartido por cuentas
 * por cobrar y por pagar (Finanzas y POS). Módulo hoja, sin dependencias.
 *
 * Los días vencidos salen del servidor (`fn_cxc_estado_vivo`, en la zona de la
 * sucursal): aquí solo se clasifican. Una cuenta pagada o anulada no tiene tramo.
 */

export const TRAMOS_ANTIGUEDAD = ['al_dia', 'd1_30', 'd31_60', 'd61_90', 'd90_mas'] as const;
export type TramoAntiguedad = (typeof TRAMOS_ANTIGUEDAD)[number];

/** Tramo de una cuenta abierta según sus días vencidos (≤ 0 = al día). */
export function tramoAntiguedad(dias: number | null | undefined): TramoAntiguedad {
  const d = Number.isFinite(dias as number) ? Number(dias) : 0;
  if (d <= 0) return 'al_dia';
  if (d <= 30) return 'd1_30';
  if (d <= 60) return 'd31_60';
  if (d <= 90) return 'd61_90';
  return 'd90_mas';
}

export interface ResumenTramo {
  tramo: TramoAntiguedad;
  saldo: number;
  cuentas: number;
}

/** Suma saldo y cuenta filas por tramo, en el orden fijo de `TRAMOS_ANTIGUEDAD`. */
export function resumirAntiguedad(filas: readonly { saldo: number; dias: number | null | undefined }[]): ResumenTramo[] {
  const acc = new Map<TramoAntiguedad, { centavos: number; cuentas: number }>(
    TRAMOS_ANTIGUEDAD.map((t) => [t, { centavos: 0, cuentas: 0 }]),
  );
  for (const f of filas) {
    if (!Number.isFinite(f.saldo) || f.saldo <= 0) continue;
    const a = acc.get(tramoAntiguedad(f.dias))!;
    a.centavos += Math.round(f.saldo * 100);
    a.cuentas += 1;
  }
  return TRAMOS_ANTIGUEDAD.map((tramo) => {
    const a = acc.get(tramo)!;
    return { tramo, saldo: a.centavos / 100, cuentas: a.cuentas };
  });
}

/** Rango de días de un tramo, para filtrar en el servidor (`hasta` null = sin tope). */
export function rangoTramo(tramo: TramoAntiguedad): { desde: number; hasta: number | null } {
  switch (tramo) {
    case 'al_dia':
      return { desde: Number.NEGATIVE_INFINITY, hasta: 0 };
    case 'd1_30':
      return { desde: 1, hasta: 30 };
    case 'd31_60':
      return { desde: 31, hasta: 60 };
    case 'd61_90':
      return { desde: 61, hasta: 90 };
    default:
      return { desde: 91, hasta: null };
  }
}
