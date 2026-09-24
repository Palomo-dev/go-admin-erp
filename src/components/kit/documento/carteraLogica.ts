/**
 * Cartera (CxC y CxP) en pantalla, sin React: tramos de antigüedad, validación
 * del formulario del plan de cuotas y CSV del estado de cuenta. **No calcula**
 * saldos, tramos ni cuotas: llegan de la RPC o de la función del dominio que
 * pasa la pantalla (`planCuotas` de compras, `generarPlanCuotas` de cartera).
 */
import type { TipoDocumento } from './documentos';

export const TRAMOS_ANTIGUEDAD = ['al_dia', 'd1_30', 'd31_60', 'd61_90', 'd90_mas'] as const;
export type TramoAntiguedad = (typeof TRAMOS_ANTIGUEDAD)[number];

export interface DatoTramo {
  tramo: TramoAntiguedad;
  saldo: number;
  /** Número de cuentas del tramo (CxC lo trae; CxP no). */
  cuentas?: number | null;
}

/** Entrada de la banda: lista `{ tramo, saldo, cuentas? }` (CxC) o mapa tramo → saldo (CxP). */
export type TramosEntrada = readonly DatoTramo[] | Partial<Record<TramoAntiguedad, number>> | null | undefined;

export function esTramoAntiguedad(v: unknown): v is TramoAntiguedad {
  return typeof v === 'string' && (TRAMOS_ANTIGUEDAD as readonly string[]).includes(v);
}

/**
 * Los cinco tramos en orden, con saldo (negativos a 0 para la barra) y su
 * porcentaje del total. Un tramo que no llega vale 0.
 */
export function normalizarTramos(entrada: TramosEntrada): { tramo: TramoAntiguedad; saldo: number; cuentas: number | null; porcentaje: number }[] {
  const mapa = new Map<TramoAntiguedad, { saldo: number; cuentas: number | null }>();
  if (Array.isArray(entrada)) {
    for (const d of entrada as readonly DatoTramo[]) {
      if (esTramoAntiguedad(d.tramo)) mapa.set(d.tramo, { saldo: Number(d.saldo) || 0, cuentas: d.cuentas ?? null });
    }
  } else if (entrada) {
    for (const t of TRAMOS_ANTIGUEDAD) {
      const v = (entrada as Partial<Record<TramoAntiguedad, number>>)[t];
      if (v !== undefined) mapa.set(t, { saldo: Number(v) || 0, cuentas: null });
    }
  }
  const filas = TRAMOS_ANTIGUEDAD.map((tramo) => ({ tramo, saldo: mapa.get(tramo)?.saldo ?? 0, cuentas: mapa.get(tramo)?.cuentas ?? null }));
  const total = filas.reduce((s, f) => s + Math.max(f.saldo, 0), 0);
  return filas.map((f) => ({ ...f, porcentaje: total > 0 ? (Math.max(f.saldo, 0) / total) * 100 : 0 }));
}

// ── Plan de cuotas ────────────────────────────────────────────────────────

export interface CuotaVista {
  numero: number;
  /** Día `YYYY-MM-DD`. */
  vence: string;
  capital: number;
  interes?: number;
  valor: number;
}

export interface FormularioPlan {
  numero: number | null;
  /** Día `YYYY-MM-DD` de la primera cuota. */
  primera: string;
  /** Interés por cuota en porcentaje (si el plan lo admite). */
  interes: number | null;
}

export type ErrorPlan = 'cuotas' | 'fecha' | 'interes';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export function validarPlanCuotas(
  f: FormularioPlan,
  { hoy, maxCuotas = 60, conInteres = false }: { hoy: string; maxCuotas?: number; conInteres?: boolean },
): Partial<Record<ErrorPlan, true>> {
  const e: Partial<Record<ErrorPlan, true>> = {};
  if (f.numero === null || !Number.isInteger(f.numero) || f.numero < 1 || f.numero > maxCuotas) e.cuotas = true;
  if (!DIA.test(f.primera) || (DIA.test(hoy) && f.primera < hoy)) e.fecha = true;
  if (conInteres && (f.interes === null || f.interes < 0 || f.interes > 100)) e.interes = true;
  return e;
}

/** Suma de capital, interés y valor del plan (para el pie de la tabla). */
export function totalesPlan(plan: readonly CuotaVista[]): { capital: number; interes: number; valor: number } {
  return plan.reduce(
    (s, c) => ({ capital: s.capital + c.capital, interes: s.interes + (c.interes ?? 0), valor: s.valor + c.valor }),
    { capital: 0, interes: 0, valor: 0 },
  );
}

// ── Estado de cuenta ──────────────────────────────────────────────────────

export interface MovimientoCuenta {
  id: string;
  /** Día `YYYY-MM-DD` en la zona de la organización. */
  dia: string;
  tipo: TipoDocumento;
  documento?: string | null;
  vence?: string | null;
  cargo: number;
  abono: number;
  saldo: number;
}

export interface EstadoCuentaVista {
  saldoInicial: number;
  saldoFinal: number;
  vencido: number;
  porVencer: number;
  totalCargos: number;
  totalAbonos: number;
  movimientos: readonly MovimientoCuenta[];
}

export interface TextosCsvEstadoCuenta {
  columnas: { fecha: string; documento: string; vence: string; cargo: string; abono: string; saldo: string };
  saldoInicial: string;
  /** Nombre del tipo cuando el movimiento no trae número. */
  tipo: (tipo: TipoDocumento) => string;
}

/**
 * CSV del estado de cuenta (con BOM para Excel): fila de saldo inicial y un
 * movimiento por fila. Los importes van sin formato para que la hoja los sume.
 */
export function estadoCuentaCsv(datos: EstadoCuentaVista, textos: TextosCsvEstadoCuenta, formatearDia: (dia: string) => string): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const c = textos.columnas;
  const cabecera = [c.fecha, c.documento, c.vence, c.cargo, c.abono, c.saldo].map(esc).join(',');
  const inicial = [esc(textos.saldoInicial), '', '', '', '', esc(datos.saldoInicial)].join(',');
  const filas = datos.movimientos.map((m) =>
    [formatearDia(m.dia), m.documento ?? textos.tipo(m.tipo), m.vence ? formatearDia(m.vence) : '', m.cargo, m.abono, m.saldo].map(esc).join(','),
  );
  return ['﻿' + cabecera, inicial, ...filas].join('\n');
}
