/**
 * Equipo comercial (Figma CRM «Red y gestión» 1411:837770 … 1413:1051):
 * lógica PURA, sin I/O. El servicio (`equipoComercialService`) trae filas y
 * este módulo las convierte en lo que pintan Equipos, Desempeño y «Mi
 * desempeño»; la previsualización de «Así se habrían repartido los últimos 50
 * leads» vive en `assignmentPreview.ts`.
 *
 * Días calendario como `YYYY-MM-DD` en la zona de la organización (regla de
 * fechas de CLAUDE.md): el «hoy» y los límites del mes los aporta quien llama.
 */

import { addDaysPlain, daysBetweenPlain, periodBoundsFor } from './quotaProgress';

/** `YYYY-MM` válido (mes del selector de Desempeño). */
export const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Mes `YYYY-MM` de un día `YYYY-MM-DD`. */
export function mesDe(dia: string): string {
  return dia.slice(0, 7);
}

/** Primer y último día del mes `YYYY-MM`. */
export function limitesMes(mes: string): { desde: string; hasta: string } {
  const { period_start, period_end } = periodBoundsFor('monthly', `${mes}-01`);
  return { desde: period_start, hasta: period_end };
}

/** Mes anterior a `YYYY-MM` (para «+12 frente a agosto»). */
export function mesAnterior(mes: string): string {
  return mesDe(addDaysPlain(`${mes}-01`, -1));
}

/** Los últimos `n` meses hasta el de `hoy` (incluido), del más reciente al más viejo. */
export function ultimosMeses(hoy: string, n = 12): string[] {
  const out: string[] = [];
  let mes = mesDe(hoy);
  for (let i = 0; i < n; i++) {
    out.push(mes);
    mes = mesAnterior(mes);
  }
  return out;
}

/** Porcentaje entero de avance sobre la cuota; `null` sin cuota. */
export function porcentajeCuota(ganado: number, cuota: number | null | undefined): number | null {
  const c = Number(cuota) || 0;
  if (c <= 0) return null;
  return Math.round(((Number(ganado) || 0) / c) * 100);
}

/**
 * Tono del badge «vs cuota» (Figma 1412:838392): 105 % y 99 % en verde, 75 %
 * en ámbar, 45 % en rojo.
 */
export function tonoVsCuota(pct: number | null): 'exito' | 'advertencia' | 'peligro' | 'neutro' {
  if (pct === null) return 'neutro';
  if (pct >= 90) return 'exito';
  if (pct >= 70) return 'advertencia';
  return 'peligro';
}

/** Tono de la barra de cuota en Equipos (Figma 1411:837770): ámbar por debajo del 70 %. */
export function tonoBarraCuota(pct: number | null): 'marca' | 'advertencia' {
  return pct !== null && pct < 70 ? 'advertencia' : 'marca';
}

/** Días que quedan del mes después de `hoy` (0 el último día). */
export function diasRestantesMes(hoy: string, hastaMes: string): number {
  return Math.max(0, daysBetweenPlain(hoy, hastaMes));
}

// ─── Filas de desempeño ──────────────────────────────────────────────────────

export interface MiembroBase {
  user_id: string;
  nombre: string;
  cuota: number | null;
  moneda: string | null;
}

export interface GanadaFila {
  salesperson_id: string | null;
  amount: number | string | null;
  created_at: string | null;
  closed_at: string | null;
}

/** Conteos del periodo por vendedor (consultas `count` en el servidor). */
export interface ConteosVendedor {
  llamadas: number;
  /** Llamadas contestadas (o completadas): «contacto efectivo». */
  llamadasEfectivas: number;
  /** `calendar_events` confirmados asignados al vendedor. */
  reuniones: number;
  /** Leads (`customers` con `lead_source`) asignados al vendedor creados en el periodo. */
  leads: number;
}

export interface FilaDesempeno {
  user_id: string;
  nombre: string;
  ganado: number;
  cuota: number | null;
  moneda: string | null;
  pct: number | null;
  llamadas: number;
  llamadasEfectivas: number;
  reuniones: number;
  leads: number;
  ganadas: number;
  /** Ganadas / leads asignados en el periodo, en %, con un decimal; `null` sin leads. */
  conversion: number | null;
  /** Días medios de `created_at` a `closed_at` de las ganadas; `null` sin ganadas. */
  cicloMedio: number | null;
  rank: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Filas de la tabla de Desempeño, ordenadas por importe ganado (rank 1 = 🏆).
 * Las métricas salen de filas ya filtradas por periodo y organización.
 */
export function construirFilasDesempeno(input: {
  miembros: readonly MiembroBase[];
  ganadas: readonly GanadaFila[];
  conteos: ReadonlyMap<string, ConteosVendedor>;
}): FilaDesempeno[] {
  const ids = new Set(input.miembros.map((m) => m.user_id));
  const ganado = new Map<string, { monto: number; n: number; dias: number; conDias: number }>();
  for (const g of input.ganadas) {
    if (!g.salesperson_id || !ids.has(g.salesperson_id)) continue;
    const a = ganado.get(g.salesperson_id) ?? { monto: 0, n: 0, dias: 0, conDias: 0 };
    a.monto += Number(g.amount) || 0;
    a.n += 1;
    if (g.created_at && g.closed_at) {
      const dias = (Date.parse(g.closed_at) - Date.parse(g.created_at)) / 86_400_000;
      if (Number.isFinite(dias) && dias >= 0) {
        a.dias += dias;
        a.conDias += 1;
      }
    }
    ganado.set(g.salesperson_id, a);
  }
  const vacio: ConteosVendedor = { llamadas: 0, llamadasEfectivas: 0, reuniones: 0, leads: 0 };

  return input.miembros
    .map((m) => {
      const g = ganado.get(m.user_id) ?? { monto: 0, n: 0, dias: 0, conDias: 0 };
      const c = input.conteos.get(m.user_id) ?? vacio;
      const nLeads = c.leads;
      return {
        user_id: m.user_id,
        nombre: m.nombre,
        ganado: g.monto,
        cuota: m.cuota,
        moneda: m.moneda,
        pct: porcentajeCuota(g.monto, m.cuota),
        llamadas: c.llamadas,
        llamadasEfectivas: c.llamadasEfectivas,
        reuniones: c.reuniones,
        leads: nLeads,
        ganadas: g.n,
        conversion: nLeads > 0 ? r1((g.n / nLeads) * 100) : null,
        cicloMedio: g.conDias > 0 ? Math.round(g.dias / g.conDias) : null,
        rank: 0,
      };
    })
    .sort((a, b) => b.ganado - a.ganado || a.nombre.localeCompare(b.nombre, 'es'))
    .map((f, i) => ({ ...f, rank: i + 1 }));
}

export interface ResumenDesempeno {
  ganado: number;
  cuota: number;
  pct: number | null;
  llamadas: number;
  /** % de llamadas con contacto efectivo; `null` sin llamadas. */
  contactoEfectivo: number | null;
  reuniones: number;
  /** Promedio de la conversión de los vendedores con leads; `null` si ninguno tiene. */
  conversion: number | null;
}

/** Totales de las tarjetas KPI (Ganado vs cuota, Llamadas, Reuniones, Conversión). */
export function resumirDesempeno(filas: readonly FilaDesempeno[]): ResumenDesempeno {
  const ganado = filas.reduce((s, f) => s + f.ganado, 0);
  const cuota = filas.reduce((s, f) => s + (Number(f.cuota) || 0), 0);
  const llamadas = filas.reduce((s, f) => s + f.llamadas, 0);
  const efectivas = filas.reduce((s, f) => s + f.llamadasEfectivas, 0);
  const conConv = filas.filter((f) => f.conversion !== null);
  return {
    ganado,
    cuota,
    pct: porcentajeCuota(ganado, cuota),
    llamadas,
    contactoEfectivo: llamadas > 0 ? Math.round((efectivas / llamadas) * 100) : null,
    reuniones: filas.reduce((s, f) => s + f.reuniones, 0),
    conversion: conConv.length > 0 ? r1(conConv.reduce((s, f) => s + (f.conversion ?? 0), 0) / conConv.length) : null,
  };
}

/** Fila «Promedio del equipo» que ve un vendedor en lugar de las filas de los demás. */
export function filaPromedio(filas: readonly FilaDesempeno[]): Omit<FilaDesempeno, 'user_id' | 'nombre' | 'rank' | 'moneda'> | null {
  if (filas.length === 0) return null;
  const n = filas.length;
  const prom = (sel: (f: FilaDesempeno) => number) => filas.reduce((s, f) => s + sel(f), 0) / n;
  const conPct = filas.filter((f) => f.pct !== null);
  const conConv = filas.filter((f) => f.conversion !== null);
  const conCiclo = filas.filter((f) => f.cicloMedio !== null);
  return {
    ganado: Math.round(prom((f) => f.ganado)),
    cuota: null,
    pct: conPct.length ? Math.round(conPct.reduce((s, f) => s + (f.pct ?? 0), 0) / conPct.length) : null,
    llamadas: Math.round(prom((f) => f.llamadas)),
    llamadasEfectivas: Math.round(prom((f) => f.llamadasEfectivas)),
    reuniones: Math.round(prom((f) => f.reuniones)),
    leads: Math.round(prom((f) => f.leads)),
    ganadas: Math.round(prom((f) => f.ganadas)),
    conversion: conConv.length ? r1(conConv.reduce((s, f) => s + (f.conversion ?? 0), 0) / conConv.length) : null,
    cicloMedio: conCiclo.length ? Math.round(conCiclo.reduce((s, f) => s + (f.cicloMedio ?? 0), 0) / conCiclo.length) : null,
  };
}

export interface PuestoRanking {
  rank: number;
  nombre: string;
  pct: number | null;
  es_yo: boolean;
}

/**
 * Ranking de «Mi desempeño» (Figma 1413:1051): por PORCENTAJE de cuota, sin
 * montos de otros vendedores. Sin cuota va al final.
 */
export function rankingPorPorcentaje(filas: readonly FilaDesempeno[], yo: string): PuestoRanking[] {
  return [...filas]
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.nombre.localeCompare(b.nombre, 'es'))
    .map((f, i) => ({ rank: i + 1, nombre: f.nombre, pct: f.pct, es_yo: f.user_id === yo }));
}

/** Avance del mes de cada miembro: suma de las ganadas con `closed_at` en el mes. */
export function ganadoPorVendedor(ganadas: readonly GanadaFila[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of ganadas) {
    if (!g.salesperson_id) continue;
    m.set(g.salesperson_id, (m.get(g.salesperson_id) ?? 0) + (Number(g.amount) || 0));
  }
  return m;
}
