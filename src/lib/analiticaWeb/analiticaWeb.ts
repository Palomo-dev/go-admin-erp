// ============================================================
// Analítica web (Figma 03 › 464:237482) — lógica pura.
//
// Periodos, validación de la petición, mapeo de la RPC `fn_analitica_web`,
// indicadores derivados (conversión, variaciones, embudo) y CSV. Sin React ni
// red: se prueba con TZ=UTC y TZ=America/Bogota.
//
// Definiciones (las del diseño y de la RPC):
//   - Visitantes únicos: personas distintas (hash de IP o, si falta, sesión).
//   - Sesiones: `session_id` distintos. NO son filas de website_visits.
//   - Conversión: pedidos / sesiones.
//   - Embudo: visitantes → pedidos (% de visitantes) → completados (% de pedidos).
//   - Abandono: cancelados / pedidos.
//   - Los días se cortan en la zona que resolvió la base (`fn_timezone_for`).
// ============================================================

export type PeriodoAnalitica = 'hoy' | 'ayer' | '7d' | '30d' | '90d' | 'año' | 'personalizado';

export const PERIODOS_ANALITICA: readonly Exclude<PeriodoAnalitica, 'personalizado'>[] = ['hoy', 'ayer', '7d', '30d', '90d', 'año'];

/** Máximo de días que acepta la RPC. */
export const MAX_DIAS_ANALITICA = 400;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Suma días a un YYYY-MM-DD sin pasar por la zona del proceso. */
export function sumarDias(plain: string, dias: number): string {
  const [y, m, d] = plain.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + dias * 86400000;
  const f = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${f.getUTCFullYear()}-${p(f.getUTCMonth() + 1)}-${p(f.getUTCDate())}`;
}

export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86400000) + 1;
}

/** ¿Es un día real con forma YYYY-MM-DD? (rechaza 2026-02-30). */
export function esFechaValida(v: unknown): v is string {
  if (typeof v !== 'string' || !FECHA.test(v)) return false;
  return sumarDias(v, 0) === v;
}

/**
 * Rango [desde, hasta] del periodo, a partir de «hoy» ya calculado en la zona
 * de la sucursal/organización (`useFormatDate().getToday()`).
 */
export function rangoDePeriodo(periodo: Exclude<PeriodoAnalitica, 'personalizado'>, hoy: string): { desde: string; hasta: string } {
  switch (periodo) {
    case 'hoy':
      return { desde: hoy, hasta: hoy };
    case 'ayer': {
      const ayer = sumarDias(hoy, -1);
      return { desde: ayer, hasta: ayer };
    }
    case '7d':
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case '30d':
      return { desde: sumarDias(hoy, -29), hasta: hoy };
    case '90d':
      return { desde: sumarDias(hoy, -89), hasta: hoy };
    case 'año':
      return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
  }
}

export interface PeticionAnalitica {
  desde: string;
  hasta: string;
  sucursal: number | null;
  pais: string | null;
}

/** Valida la query de `GET /api/analitica-web`. Nunca lee una organización. */
export function leerPeticion(params: URLSearchParams): { ok: true; valor: PeticionAnalitica } | { ok: false; codigo: string } {
  const desde = params.get('desde');
  const hasta = params.get('hasta');
  if (!esFechaValida(desde) || !esFechaValida(hasta)) return { ok: false, codigo: 'FECHAS_INVALIDAS' };
  if (hasta < desde) return { ok: false, codigo: 'FECHAS_INVALIDAS' };
  if (diasEntre(desde, hasta) > MAX_DIAS_ANALITICA) return { ok: false, codigo: 'RANGO_DEMASIADO_LARGO' };
  const s = params.get('sucursal');
  let sucursal: number | null = null;
  if (s !== null && s !== '' && s !== 'all') {
    if (!/^\d+$/.test(s) || Number(s) <= 0) return { ok: false, codigo: 'SUCURSAL_INVALIDA' };
    sucursal = Number(s);
  }
  const p = params.get('pais');
  let pais: string | null = null;
  if (p !== null && p !== '') {
    if (!/^[A-Za-z]{2}$/.test(p)) return { ok: false, codigo: 'PAIS_INVALIDO' };
    pais = p.toUpperCase();
  }
  return { ok: true, valor: { desde, hasta, sucursal, pais } };
}

// ─── Forma de la RPC (snake_case) y del cliente (camelCase) ──────────────────

export interface TotalesAnalitica {
  visitantes: number;
  visitantesNuevos: number;
  sesiones: number;
  pedidos: number;
  pendientes: number;
  completados: number;
  cancelados: number;
  ingresos: number;
  ventaMedia: number | null;
}

export interface PuntoSerie {
  fecha: string;
  visitantes: number;
  pedidos: number;
  visitantesAnterior: number;
  pedidosAnterior: number;
}

export interface FilaPais {
  pais: string;
  visitantes: number;
  sesiones: number;
}

export interface FilaCiudad {
  ciudad: string;
  region: string | null;
  visitantes: number;
  sesiones: number;
}

export interface DatosAnalitica {
  zona: string;
  desde: string;
  hasta: string;
  dias: number;
  actual: TotalesAnalitica;
  anterior: TotalesAnalitica;
  serie: PuntoSerie[];
  paises: FilaPais[];
  pais: string | null;
  ciudades: FilaCiudad[];
  ciudadesTotal: number;
  visitasConPais: number;
  /** Solo viene cuando el periodo no tiene ninguna visita ubicada. */
  visitasSinUbicacionTotal: number | null;
}

type Crudo = Record<string, unknown>;
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const obj = (v: unknown): Crudo => (v && typeof v === 'object' ? (v as Crudo) : {});
const lista = (v: unknown): Crudo[] => (Array.isArray(v) ? (v as Crudo[]) : []);

function totales(v: unknown): TotalesAnalitica {
  const o = obj(v);
  return {
    visitantes: num(o.visitantes),
    visitantesNuevos: num(o.visitantes_nuevos),
    sesiones: num(o.sesiones),
    pedidos: num(o.pedidos),
    pendientes: num(o.pendientes),
    completados: num(o.completados),
    cancelados: num(o.cancelados),
    ingresos: num(o.ingresos),
    ventaMedia: numONull(o.venta_media),
  };
}

/** Respuesta de la RPC → forma del cliente. Tolera campos ausentes. */
export function mapearRespuestaRpc(crudo: unknown): DatosAnalitica {
  const o = obj(crudo);
  return {
    zona: String(o.zona ?? ''),
    desde: String(o.desde ?? ''),
    hasta: String(o.hasta ?? ''),
    dias: num(o.dias),
    actual: totales(o.actual),
    anterior: totales(o.anterior),
    serie: lista(o.serie).map((p) => ({
      fecha: String(p.fecha ?? ''),
      visitantes: num(p.visitantes),
      pedidos: num(p.pedidos),
      visitantesAnterior: num(p.visitantes_anterior),
      pedidosAnterior: num(p.pedidos_anterior),
    })),
    paises: lista(o.paises).map((p) => ({ pais: String(p.pais ?? ''), visitantes: num(p.visitantes), sesiones: num(p.sesiones) })),
    pais: typeof o.pais === 'string' ? o.pais : null,
    ciudades: lista(o.ciudades).map((c) => ({
      ciudad: String(c.ciudad ?? ''),
      region: typeof c.region === 'string' ? c.region : null,
      visitantes: num(c.visitantes),
      sesiones: num(c.sesiones),
    })),
    ciudadesTotal: num(o.ciudades_total),
    visitasConPais: num(o.visitas_con_pais),
    visitasSinUbicacionTotal: numONull(o.visitas_sin_ubicacion_total),
  };
}

// ─── Indicadores derivados ───────────────────────────────────────────────────

/** Fracción segura (0 si el denominador es 0). */
export const fraccion = (a: number, b: number): number => (b > 0 ? a / b : 0);

/** Variación relativa en % (null si no hay base con qué comparar). */
export function variacionPct(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return ((actual - anterior) / anterior) * 100;
}

export interface Indicadores {
  visitantes: { valor: number; variacion: number | null };
  sesiones: { valor: number; variacion: number | null; pctNuevos: number };
  pedidos: { valor: number; variacion: number | null; pendientes: number };
  /** Conversión como fracción (0–1) y diferencia en puntos porcentuales. */
  conversion: { valor: number; diferenciaPp: number | null };
  ventaMedia: { valor: number | null; variacion: number | null };
}

export function indicadores(d: Pick<DatosAnalitica, 'actual' | 'anterior'>): Indicadores {
  const { actual: a, anterior: b } = d;
  const convA = fraccion(a.pedidos, a.sesiones);
  const convB = fraccion(b.pedidos, b.sesiones);
  return {
    visitantes: { valor: a.visitantes, variacion: variacionPct(a.visitantes, b.visitantes) },
    sesiones: { valor: a.sesiones, variacion: variacionPct(a.sesiones, b.sesiones), pctNuevos: fraccion(a.visitantesNuevos, a.visitantes) },
    pedidos: { valor: a.pedidos, variacion: variacionPct(a.pedidos, b.pedidos), pendientes: a.pendientes },
    conversion: { valor: convA, diferenciaPp: b.sesiones > 0 ? (convA - convB) * 100 : null },
    ventaMedia: {
      valor: a.ventaMedia,
      variacion: a.ventaMedia !== null && b.ventaMedia !== null ? variacionPct(a.ventaMedia, b.ventaMedia) : null,
    },
  };
}

export interface Embudo {
  visitantes: number;
  pedidos: number;
  pctPedidos: number;
  completados: number;
  pctCompletados: number;
  cancelados: number;
  pctAbandono: number;
}

export function embudo(a: TotalesAnalitica): Embudo {
  return {
    visitantes: a.visitantes,
    pedidos: a.pedidos,
    pctPedidos: fraccion(a.pedidos, a.visitantes),
    completados: a.completados,
    pctCompletados: fraccion(a.completados, a.pedidos),
    cancelados: a.cancelados,
    pctAbandono: fraccion(a.cancelados, a.pedidos),
  };
}

/** ¿Pantalla «sin ubicación»? Ninguna visita del periodo trae país. */
export function sinUbicacion(d: Pick<DatosAnalitica, 'visitasConPais'>): boolean {
  return d.visitasConPais === 0;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function celda(v: string | number | null): string {
  if (v === null) return '';
  const s = String(v);
  // Evita inyección de fórmulas al abrir en una hoja de cálculo.
  const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",;\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/** CSV de la serie diaria y los países (encabezados en el idioma de la UI). */
export function csvAnalitica(
  d: DatosAnalitica,
  enc: { fecha: string; visitantes: string; pedidos: string; visitantesAnterior: string; pedidosAnterior: string; pais: string; sesiones: string },
): string {
  const filas: Array<Array<string | number | null>> = [
    [enc.fecha, enc.visitantes, enc.pedidos, enc.visitantesAnterior, enc.pedidosAnterior],
    ...d.serie.map((p) => [p.fecha, p.visitantes, p.pedidos, p.visitantesAnterior, p.pedidosAnterior]),
  ];
  if (d.paises.length > 0) {
    filas.push([], [enc.pais, enc.visitantes, enc.sesiones], ...d.paises.map((p) => [p.pais, p.visitantes, p.sesiones]));
  }
  return filas.map((f) => f.map(celda).join(',')).join('\n') + '\n';
}
