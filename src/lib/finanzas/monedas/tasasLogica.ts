/**
 * Monedas y tasas (Finanzas R2, piezas M1–M5): lógica de presentación sin React.
 *
 * Dos fuentes, verificadas por MCP el 2026-11-07:
 *   - `currency_rates`: catálogo GLOBAL de la plataforma, base USD
 *     (`base_currency_code = 'USD'`): 1 USD = `rate` unidades de `code`. Una
 *     fila por moneda y día (`rate_date`, columna `date`). Sin organización.
 *   - `exchange_rates`: tasas de la ORGANIZACIÓN. 1 `base_currency` = `rate`
 *     `target_currency` (mismo sentido que `src/lib/crm/monedaCrm.ts`). La
 *     tasa manual se guarda como moneda → moneda base de la organización.
 *
 * Regla del diseño (M1): la tasa manual manda ese día sobre la automática.
 * La tasa de una moneda frente a la base sale del catálogo como cruce:
 * 1 X = rate[base] / rate[X] base.
 */
import { addPlainDays } from '@/lib/utils/timezone';
import { validarMotivo, MOTIVO_MINIMO, MOTIVO_MAXIMO } from '@/components/kit/motivo';

export interface TasaCatalogo {
  code: string;
  rate: number | string;
  /** `date` (YYYY-MM-DD). */
  rate_date: string;
  /** Cuándo la escribió la plataforma (`timestamptz`). */
  created_at?: string | null;
}

export interface TasaManualFila {
  id: number;
  base_currency: string;
  target_currency: string;
  rate: number | string;
  /** `date` (YYYY-MM-DD). */
  effective_date: string;
  source?: string | null;
  /** Columna de la migración 20261107180000 (aplicada el 2026-11-07). */
  created_by?: string | null;
  /** Columna de la migración 20261107180000 (aplicada el 2026-11-07). */
  reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type FuenteTasa = 'manual' | 'automatica';

export interface PuntoTasa {
  dia: string;
  /** 1 moneda = `tasa` moneda base. */
  tasa: number;
  fuente: FuenteTasa;
  autorId: string | null;
  motivo: string | null;
  /** Instante en que se registró (manual) o en que la plataforma escribió el catálogo. */
  registradaEn: string | null;
  /** La del catálogo ese día, aunque mande la manual (aviso de M4). */
  automatica: number | null;
}

const codigo = (c: string | null | undefined) => (c ?? '').trim().toUpperCase();

function aNumero(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Catálogo por día: día → código → fila. */
export type CatalogoPorDia = Map<string, Map<string, { rate: number; created_at: string | null }>>;

export function indexarCatalogo(filas: readonly TasaCatalogo[]): CatalogoPorDia {
  const mapa: CatalogoPorDia = new Map();
  for (const f of filas) {
    const rate = aNumero(f.rate);
    if (rate === null || rate <= 0) continue;
    let dia = mapa.get(f.rate_date);
    if (!dia) {
      dia = new Map();
      mapa.set(f.rate_date, dia);
    }
    dia.set(codigo(f.code), { rate, created_at: f.created_at ?? null });
  }
  return mapa;
}

/** 1 `moneda` en `base` según el catálogo de un día (cruce por USD). */
export function tasaCatalogo(
  dia: Map<string, { rate: number }> | undefined,
  moneda: string,
  base: string,
): number | null {
  const m = codigo(moneda);
  const b = codigo(base);
  if (m === b) return 1;
  if (!dia) return null;
  // El catálogo es base USD: USD vale 1 aunque falte su fila.
  const rm = m === 'USD' ? dia.get('USD')?.rate ?? 1 : dia.get(m)?.rate;
  const rb = b === 'USD' ? dia.get('USD')?.rate ?? 1 : dia.get(b)?.rate;
  if (!rm || !rb) return null;
  return rb / rm;
}

/** 1 `moneda` en `base` según una fila de `exchange_rates`, en cualquiera de los dos sentidos. */
export function tasaManualEnBase(fila: TasaManualFila, moneda: string, base: string): number | null {
  const rate = aNumero(fila.rate);
  if (rate === null || rate <= 0) return null;
  const desde = codigo(fila.base_currency);
  const hacia = codigo(fila.target_currency);
  if (desde === codigo(moneda) && hacia === codigo(base)) return rate;
  if (desde === codigo(base) && hacia === codigo(moneda)) return 1 / rate;
  return null;
}

/**
 * Serie de una moneda frente a la base, del día más reciente al más antiguo.
 * Un día tiene punto si hay catálogo o tasa manual; la manual manda.
 */
export function serieTasas({
  moneda,
  base,
  catalogo,
  manuales,
}: {
  moneda: string;
  base: string;
  catalogo: CatalogoPorDia;
  manuales: readonly TasaManualFila[];
}): PuntoTasa[] {
  const manualPorDia = new Map<string, { fila: TasaManualFila; tasa: number }>();
  for (const fila of manuales) {
    if ((fila.source ?? 'manual') !== 'manual') continue;
    const tasa = tasaManualEnBase(fila, moneda, base);
    if (tasa === null) continue;
    const previa = manualPorDia.get(fila.effective_date);
    const marca = (f: TasaManualFila) => f.updated_at ?? f.created_at ?? '';
    if (!previa || marca(fila) > marca(previa.fila)) manualPorDia.set(fila.effective_date, { fila, tasa });
  }

  const dias = new Set<string>([...catalogo.keys(), ...manualPorDia.keys()]);
  const puntos: PuntoTasa[] = [];
  for (const dia of dias) {
    const delCatalogo = catalogo.get(dia);
    const automatica = tasaCatalogo(delCatalogo, moneda, base);
    const manual = manualPorDia.get(dia);
    if (manual) {
      puntos.push({
        dia,
        tasa: manual.tasa,
        fuente: 'manual',
        autorId: manual.fila.created_by ?? null,
        motivo: manual.fila.reason ?? null,
        registradaEn: manual.fila.updated_at ?? manual.fila.created_at ?? null,
        automatica,
      });
    } else if (automatica !== null) {
      puntos.push({
        dia,
        tasa: automatica,
        fuente: 'automatica',
        autorId: null,
        motivo: null,
        registradaEn: delCatalogo?.get(codigo(moneda))?.created_at ?? null,
        automatica,
      });
    }
  }
  return puntos.sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));
}

/** Variación porcentual; null si no hay con qué comparar. */
export function variacionPorcentual(actual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (actual === null || actual === undefined || !anterior) return null;
  return ((actual - anterior) / anterior) * 100;
}

export interface TasaVigente {
  /** El punto del día pedido, o el último anterior. */
  punto: PuntoTasa | null;
  /** El punto es del día pedido. */
  delDia: boolean;
  /** Variación frente al punto anterior (solo si `delDia`). */
  variacion: number | null;
}

/** La tasa de `dia` (serie descendente); si no hay, la última anterior. */
export function tasaVigente(serie: readonly PuntoTasa[], dia: string): TasaVigente {
  const i = serie.findIndex((p) => p.dia <= dia);
  if (i < 0) return { punto: null, delDia: false, variacion: null };
  const punto = serie[i];
  const delDia = punto.dia === dia;
  const anterior = serie[i + 1] ?? null;
  return { punto, delDia, variacion: delDia ? variacionPorcentual(punto.tasa, anterior?.tasa) : null };
}

export interface FilaHistorico extends PuntoTasa {
  variacion: number | null;
}

/** Filas del histórico entre `desde` y `hasta` (incluidos), descendentes, con variación frente al día anterior con tasa. */
export function historico(serie: readonly PuntoTasa[], desde: string, hasta: string): FilaHistorico[] {
  const filas: FilaHistorico[] = [];
  serie.forEach((p, i) => {
    if (p.dia < desde || p.dia > hasta) return;
    filas.push({ ...p, variacion: variacionPorcentual(p.tasa, serie[i + 1]?.tasa) });
  });
  return filas;
}

export interface PuntoGrafica {
  dia: string;
  tasa: number;
  fuente: FuenteTasa;
}

export const DIAS_GRAFICA = 30;

/** Los últimos `dias` días hasta `hasta`, ascendentes (para la gráfica de M2). */
export function puntosGrafica(serie: readonly PuntoTasa[], hasta: string, dias = DIAS_GRAFICA): PuntoGrafica[] {
  const desde = addPlainDays(hasta, -(dias - 1));
  return serie
    .filter((p) => p.dia >= desde && p.dia <= hasta)
    .map((p) => ({ dia: p.dia, tasa: p.tasa, fuente: p.fuente }))
    .reverse();
}

/** Días extra hacia atrás que se leen para tener «ayer» y la variación del primer día. */
export const HOLGURA_DIAS = 7;

/** Rango que hay que leer de la base para mostrar `desde`–`hasta` y la gráfica de 30 días. */
export function rangoLectura(desde: string, hasta: string, { conGrafica = false } = {}): { desde: string; hasta: string } {
  const inicioGrafica = addPlainDays(hasta, -(DIAS_GRAFICA - 1));
  const inicio = conGrafica && inicioGrafica < desde ? inicioGrafica : desde;
  return { desde: addPlainDays(inicio, -HOLGURA_DIAS), hasta };
}

/** Rango del histórico al abrir la pestaña: los últimos 30 días. */
export function rangoPorDefecto(hoy: string): { desde: string; hasta: string } {
  return { desde: addPlainDays(hoy, -DIAS_GRAFICA), hasta: hoy };
}

/** Moneda que el histórico muestra al abrir: USD si la organización la tiene, si no la primera que no es la base. */
export function monedaPorDefecto(codigos: readonly string[], base: string): string | null {
  const otras = codigos.map(codigo).filter((c) => c && c !== codigo(base));
  if (otras.includes('USD')) return 'USD';
  return otras[0] ?? null;
}

/** Decimales para mostrar una tasa: 2 si vale 1 o más; si no, los suficientes para que no salga 0,00. */
export function decimalesTasa(valor: number): number {
  const v = Math.abs(valor);
  if (v >= 1 || v === 0) return 2;
  if (v >= 0.01) return 4;
  return 6;
}

// ---------------------------------------------------------------------------
// Exportar (M2). Se conserva la descarga CSV del histórico.

export interface TextosCsv {
  encabezados: readonly [string, string, string, string, string, string, string];
  fuente: (f: FuenteTasa) => string;
  registro: (fila: FilaHistorico) => string;
}

/**
 * Filas del CSV del histórico de una moneda (las convierte `aCsv` de
 * `src/lib/finanzas/csv.ts`). Números con punto decimal y sin separador de
 * miles: los lee igual una hoja de cálculo en cualquier idioma.
 */
export function filasCsvHistorico(filas: readonly FilaHistorico[], moneda: string, base: string, textos: TextosCsv): string[][] {
  const par = `${codigo(moneda)}/${codigo(base)}`;
  return [
    [...textos.encabezados],
    ...filas.map((f) => [
      f.dia,
      par,
      String(Number(f.tasa.toFixed(8))),
      f.variacion === null ? '' : f.variacion.toFixed(2),
      textos.fuente(f.fuente),
      textos.registro(f),
      f.motivo ?? '',
    ]),
  ];
}

export function nombreArchivoCsv(moneda: string, base: string, desde: string, hasta: string): string {
  return `tasas_${codigo(moneda)}_${codigo(base)}_${desde}_${hasta}.csv`;
}

// ---------------------------------------------------------------------------
// Registrar tasa manual (M4).

export interface EntradaTasaManual {
  moneda: string | null;
  fecha: string | null;
  tasa: number | null;
  motivo: string;
}

export type ErrorCampoTasa = 'requerido' | 'futura' | 'positiva' | 'corto' | 'largo';

export interface ValidacionTasaManual {
  valido: boolean;
  errores: Partial<Record<'moneda' | 'fecha' | 'tasa' | 'motivo', ErrorCampoTasa>>;
  motivo: string;
}

export const MOTIVO_TASA_MINIMO = MOTIVO_MINIMO;
export const MOTIVO_TASA_MAXIMO = MOTIVO_MAXIMO;

export function validarTasaManual(e: EntradaTasaManual, hoy: string): ValidacionTasaManual {
  const errores: ValidacionTasaManual['errores'] = {};
  if (!e.moneda) errores.moneda = 'requerido';
  if (!e.fecha) errores.fecha = 'requerido';
  else if (e.fecha > hoy) errores.fecha = 'futura';
  if (e.tasa === null || e.tasa === undefined || Number.isNaN(e.tasa)) errores.tasa = 'requerido';
  else if (e.tasa <= 0) errores.tasa = 'positiva';
  const m = validarMotivo(e.motivo);
  if (m.error === 'vacio') errores.motivo = 'requerido';
  else if (m.error === 'corto') errores.motivo = 'corto';
  else if (m.error === 'largo') errores.motivo = 'largo';
  return { valido: Object.keys(errores).length === 0, errores, motivo: m.limpio };
}

export type ClaveErrorTasa =
  | 'sinPermiso'
  | 'noDisponible'
  | 'tasaInvalida'
  | 'fechaFutura'
  | 'motivoCorto'
  | 'monedaEsBase'
  | 'monedaNoAsignada';

/**
 * Errores de `fn_finanzas_registrar_tasa_manual`. `noDisponible`: la función
 * no existe en la base (antes de la migración 20261107180000): PostgREST
 * responde PGRST202 y Postgres 42883.
 */
export function claveErrorTasa(error: unknown): ClaveErrorTasa | null {
  const e = (error ?? {}) as { message?: unknown; code?: unknown };
  const mensaje = typeof e.message === 'string' ? e.message : '';
  const cod = typeof e.code === 'string' ? e.code : '';
  if (cod === 'PGRST202' || cod === '42883' || /could not find the function/i.test(mensaje)) return 'noDisponible';
  if (mensaje.includes('sin_permiso') || cod === '42501') return 'sinPermiso';
  if (mensaje.includes('tasa_invalida')) return 'tasaInvalida';
  if (mensaje.includes('fecha_futura')) return 'fechaFutura';
  if (mensaje.includes('motivo_corto')) return 'motivoCorto';
  if (mensaje.includes('moneda_es_base')) return 'monedaEsBase';
  if (mensaje.includes('moneda_no_asignada')) return 'monedaNoAsignada';
  return null;
}

/** Nombre para mostrar de un perfil. */
export function nombrePerfil(p: { first_name?: string | null; last_name?: string | null; email?: string | null } | null | undefined): string | null {
  if (!p) return null;
  const nombre = [p.first_name, p.last_name].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
  return nombre || (p.email ?? '').trim() || null;
}
