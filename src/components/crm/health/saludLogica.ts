/**
 * Lógica pura de «Salud de clientes» (Figma, sección «CRM · Red y gestión»:
 * 1415:19 lista priorizada, 1424:17 detalle, 1424:932 configuración,
 * 1424:841631 móvil). Sin React ni Supabase: se prueba con jest.
 *
 * Todo sale del MISMO cálculo que la lista, el cron y la ficha
 * (`composeHealthResult` → `scoreFromConfig` de `healthBands.ts`); aquí solo
 * se ordena, se explica y se resume. La UI nunca recalcula el puntaje por su
 * cuenta salvo la vista previa de la configuración, que usa `scoreFromConfig`.
 */
import type { HealthScoreResult, HealthSnapshot, ScoreHace, SenalesCliente, TendenciaSemanal } from '@/lib/services/crm/healthScoreService';
import { bandForScore, scoreFromConfig, type HealthBand, type HealthBandsJson, type HealthConfigJson, type HealthIndicatorJson } from '@/lib/services/crm/healthBands';

export type TonoBandaSalud = 'peligro' | 'advertencia' | 'exito';

export const TONO_BANDA: Record<HealthBand, TonoBandaSalud> = { red: 'peligro', yellow: 'advertencia', green: 'exito' };
export const ORDEN_BANDA: Record<HealthBand, number> = { red: 0, yellow: 1, green: 2 };

// ─── Factores ───────────────────────────────────────────────────────────────

/** Familia de un indicador: decide el texto de «Por qué» y la acción sugerida. */
export type FactorSalud = 'compras' | 'cartera' | 'actividad' | 'frecuencia' | 'ingresos';

const FACTOR_DE_CLAVE: Record<string, FactorSalud> = {
  recency: 'compras',
  days_since_last_invoice: 'compras',
  receivables: 'cartera',
  overdue: 'cartera',
  overdue_ratio: 'cartera',
  overdue_balance: 'cartera',
  activity: 'actividad',
  days_since_last_activity: 'actividad',
  frequency: 'frecuencia',
  invoices_12m: 'frecuencia',
  ltv: 'ingresos',
  revenue_12m: 'ingresos',
  avg_ticket: 'ingresos',
};

export function factorDeClave(key: string): FactorSalud | null {
  return FACTOR_DE_CLAVE[key] ?? null;
}

export interface MotivoSalud {
  factor: FactorSalud;
  /** Puntos que resta este factor sobre 100. */
  perdidos: number;
}

const tieneConfig = (r: Pick<HealthScoreResult, 'indicators'>) => r.indicators.some((i) => i.weight > 0);

/**
 * «Por qué» (anotación 1415:1161): los factores que más restan.
 * - Con config: peso × (100 − puntaje del indicador) / Σ pesos, por factor.
 * - Sin config: los mismos descuentos que aplica `fn_customer_health`
 *   (compra > 60 d, actividad > 30 d, cartera vencida, pocas facturas).
 */
export function motivosSalud(r: Pick<HealthScoreResult, 'indicators' | 'raw'>, max: number = 2): MotivoSalud[] {
  const porFactor = new Map<FactorSalud, number>();
  const sumar = (f: FactorSalud | null, n: number) => {
    if (!f || !(n > 0)) return;
    porFactor.set(f, Math.max(porFactor.get(f) ?? 0, n));
  };
  if (tieneConfig(r)) {
    const total = r.indicators.reduce((s, i) => s + i.weight, 0);
    for (const i of r.indicators) sumar(factorDeClave(i.key), total > 0 ? (i.weight * (100 - i.score)) / total : 0);
  } else if (r.raw) {
    const d = r.raw.days_since_last_invoice;
    const a = r.raw.days_since_last_activity;
    sumar('compras', d == null ? 25 : Math.min(25, Math.max(0, Math.floor((d - 60) / 6))));
    sumar('actividad', a == null ? 10 : Math.min(10, Math.max(0, Math.floor((a - 30) / 9))));
    sumar('cartera', Math.min(30, Math.round((Number(r.raw.overdue_ratio) || 0) * 30)));
    sumar('frecuencia', 25 - Math.min(25, (Number(r.raw.invoices_12m) || 0) * 5));
  }
  return [...porFactor.entries()]
    .map(([factor, perdidos]) => ({ factor, perdidos: Math.round(perdidos * 10) / 10 }))
    .sort((x, y) => y.perdidos - x.perdidos)
    .slice(0, max);
}

/**
 * Acciones de Salud. En la lista, la sugerida por el factor dominante
 * (anotación 1415:1161: cartera → cobro, inactividad → llamada/secuencia,
 * caída de compras → visita comercial); `tarea` es la de «Qué hacer» del detalle.
 */
export type AccionSalud = 'cobro' | 'llamar' | 'secuencia' | 'visita' | 'tarea';

export function accionSugerida(motivos: readonly MotivoSalud[]): AccionSalud | null {
  switch (motivos[0]?.factor) {
    case 'cartera':
      return 'cobro';
    case 'compras':
      return 'llamar';
    case 'actividad':
      return 'secuencia';
    case 'frecuencia':
    case 'ingresos':
      return 'visita';
    default:
      return null;
  }
}

// ─── Lista priorizada ───────────────────────────────────────────────────────

export interface FilaSalud {
  id: string;
  nombre: string;
  /** Persona de contacto cuando el nombre visible es el de la empresa. */
  contacto: string | null;
  responsableId: string | null;
  score: number;
  band: HealthBand;
  /** Puntos frente al snapshot de hace 30 días; null sin snapshot tan antiguo. */
  cambio: number | null;
  motivos: MotivoSalud[];
  ingresos: number;
  accion: AccionSalud | null;
  resultado: HealthScoreResult;
}

export function nombreVisible(r: Pick<HealthScoreResult, 'customer_name' | 'cliente'>): { nombre: string; contacto: string | null } {
  const empresa = r.cliente?.trade_name?.trim() || r.cliente?.company_name?.trim() || '';
  const persona = r.cliente?.full_name?.trim() || r.customer_name?.trim() || '';
  const nombre = empresa || persona;
  return { nombre, contacto: empresa && persona && persona !== empresa ? persona : null };
}

export function aFilaSalud(r: HealthScoreResult, hace?: ScoreHace | null): FilaSalud {
  const { nombre, contacto } = nombreVisible(r);
  const motivos = r.band === 'green' ? [] : motivosSalud(r);
  return {
    id: r.customer_id,
    nombre,
    contacto,
    responsableId: r.cliente?.owner_id ?? null,
    score: r.score,
    band: r.band,
    cambio: hace ? r.score - hace.score : null,
    motivos,
    ingresos: Number(r.raw?.revenue_12m) || 0,
    accion: accionSugerida(motivos),
    resultado: r,
  };
}

/** Caída en puntos (0 si subió o no se sabe). */
export const caida = (f: Pick<FilaSalud, 'cambio'>) => (f.cambio !== null && f.cambio < 0 ? -f.cambio : 0);

/** Orden del selector «Orden: …» (Figma 1415:963). */
export type OrdenSalud = 'ingresos' | 'puntaje' | 'caida';

/**
 * Orden de la lista. `ingresos` (por defecto, anotación 1415:1161): banda roja
 * primero y, dentro de cada banda, ingresos 12 m × caída (lo que está en
 * juego); `puntaje`: el más bajo primero; `caida`: la mayor caída en 30 días.
 */
export function ordenarPanel<T extends Pick<FilaSalud, 'band' | 'ingresos' | 'cambio' | 'score'>>(filas: readonly T[], orden: OrdenSalud = 'ingresos'): T[] {
  return [...filas].sort((a, b) => {
    if (orden === 'puntaje') return a.score - b.score || b.ingresos - a.ingresos;
    if (orden === 'caida') return caida(b) - caida(a) || a.score - b.score;
    const banda = ORDEN_BANDA[a.band] - ORDEN_BANDA[b.band];
    if (banda !== 0) return banda;
    const prioridad = b.ingresos * (1 + caida(b)) - a.ingresos * (1 + caida(a));
    if (prioridad !== 0) return prioridad;
    return a.score - b.score;
  });
}

/** Chips de la lista (Figma 1415:925): bandas, «Bajaron este mes» y «Mis clientes». */
export type ChipSalud = 'red' | 'yellow' | 'bajaron' | 'mios';

export interface FiltrosSalud {
  chips: ChipSalud[];
  orden: OrdenSalud;
}

export const FILTROS_INICIALES: FiltrosSalud = { chips: ['red'], orden: 'ingresos' };

/**
 * Bandas elegidas = unión (ninguna = todas); «Bajaron este mes» = cambio
 * 30 d negativo; «Mis clientes» = responsable = la persona de la sesión.
 */
export function filtrarPanel<T extends Pick<FilaSalud, 'band' | 'responsableId' | 'cambio'>>(filas: readonly T[], f: Pick<FiltrosSalud, 'chips'>, usuarioId: string | null): T[] {
  const bandas = f.chips.filter((c): c is 'red' | 'yellow' => c === 'red' || c === 'yellow');
  return filas.filter(
    (x) =>
      (bandas.length === 0 || (bandas as string[]).includes(x.band)) &&
      (!f.chips.includes('bajaron') || (x.cambio !== null && x.cambio < 0)) &&
      (!f.chips.includes('mios') || (!!usuarioId && x.responsableId === usuarioId)),
  );
}

/** CSV de «Exportar» (las filas visibles, en el orden de la lista). */
export function csvSalud(filas: readonly { celdas: readonly (string | number)[] }[], encabezados: readonly string[]): string {
  const celda = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [encabezados, ...filas.map((f) => f.celdas)].map((r) => r.map(celda).join(',')).join('\n');
}

export interface ResumenBandas {
  total: number;
  conteo: Record<HealthBand, number>;
  ingresos: Record<HealthBand, number>;
}

export function resumenBandas(filas: readonly Pick<FilaSalud, 'band' | 'ingresos'>[]): ResumenBandas {
  const conteo: Record<HealthBand, number> = { red: 0, yellow: 0, green: 0 };
  const ingresos: Record<HealthBand, number> = { red: 0, yellow: 0, green: 0 };
  for (const f of filas) {
    conteo[f.band] += 1;
    ingresos[f.band] += f.ingresos;
  }
  return { total: filas.length, conteo, ingresos };
}

// ─── Tendencia ──────────────────────────────────────────────────────────────

export interface ResumenTendencia {
  actual: number;
  /** Puntos frente a la primera semana de la serie; null con una sola semana. */
  delta: number | null;
  /** Lunes de la primera semana (`date`). */
  desde: string | null;
  barras: { semana: string; valor: number }[];
}

export function resumenTendencia(semanas: readonly TendenciaSemanal[], max: number = 12): ResumenTendencia | null {
  const serie = [...semanas].sort((a, b) => a.semana.localeCompare(b.semana)).slice(-max);
  if (serie.length === 0) return null;
  const primera = serie[0];
  const ultima = serie[serie.length - 1];
  return {
    actual: Math.round(ultima.promedio),
    delta: serie.length > 1 ? Math.round(ultima.promedio - primera.promedio) : null,
    desde: serie.length > 1 ? primera.semana : null,
    barras: serie.map((s) => ({ semana: s.semana, valor: Math.max(0, Math.min(100, s.promedio)) })),
  };
}

/** Serie semanal de UN cliente a partir de sus snapshots (último de cada semana). */
export function semanasDeSnapshots(snaps: readonly Pick<HealthSnapshot, 'score' | 'created_at'>[], claveSemana: (iso: string) => string, max: number = 12): TendenciaSemanal[] {
  const porSemana = new Map<string, { score: number; at: number }>();
  for (const s of snaps) {
    const at = new Date(s.created_at).getTime();
    if (Number.isNaN(at)) continue;
    const k = claveSemana(s.created_at);
    const cur = porSemana.get(k);
    if (!cur || at > cur.at) porSemana.set(k, { score: s.score, at });
  }
  return [...porSemana.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-max)
    .map(([semana, v]) => ({ semana, promedio: v.score, clientes: 1 }));
}

/** Lunes (YYYY-MM-DD) de la semana de un día calendario YYYY-MM-DD. */
export function lunesDe(diaPlano: string): string {
  const [y, m, d] = diaPlano.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = (fecha.getUTCDay() + 6) % 7; // 0 = lunes
  fecha.setUTCDate(fecha.getUTCDate() - dow);
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(fecha.getUTCDate()).padStart(2, '0')}`;
}

// ─── Detalle ────────────────────────────────────────────────────────────────

export interface FactorDetalle {
  key: string;
  factor: FactorSalud | null;
  etiqueta: string;
  /** Valor real de la RPC (−1 = sin datos). */
  valor: number;
  puntos: number;
  maximo: number;
  /** Peso en % del total de pesos. */
  peso: number;
}

/**
 * «Qué explica el puntaje»: cada indicador con los puntos que aporta y los
 * que podría aportar («0 de 30 · peso 30 %»). Null sin config con pesos: el
 * reparto de puntos solo existe en `scoreFromConfig`.
 */
export function factoresDetalle(r: Pick<HealthScoreResult, 'indicators'>): FactorDetalle[] | null {
  if (!tieneConfig(r)) return null;
  const total = r.indicators.reduce((s, i) => s + i.weight, 0);
  return r.indicators.map((i) => {
    const maximo = Math.round((i.weight * 100) / total);
    return {
      key: i.key,
      factor: factorDeClave(i.key),
      etiqueta: i.label,
      valor: i.value,
      puntos: Math.min(maximo, Math.round(i.weightedScore)),
      maximo,
      peso: maximo,
    };
  });
}

export type SenalSalud =
  | { tipo: 'banda'; fecha: string; banda: HealthBand }
  | { tipo: 'vencida'; fecha: string; dias: number | null; saldo: number }
  | { tipo: 'compra'; fecha: string; total: number };

/** Cambios de banda en la bitácora (del más reciente al más antiguo). */
export function cambiosDeBanda(historial: readonly Pick<HealthSnapshot, 'band' | 'created_at'>[]): { fecha: string; banda: HealthBand }[] {
  const orden = [...historial].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const out: { fecha: string; banda: HealthBand }[] = [];
  for (let i = 1; i < orden.length; i++) {
    if (orden[i].band !== orden[i - 1].band) out.push({ fecha: orden[i].created_at, banda: orden[i].band });
  }
  return out.reverse();
}

/** «Señales recientes» (Figma 1424:926): cambios de banda, cartera vencida y última compra. */
export function senalesRecientes(historial: readonly Pick<HealthSnapshot, 'band' | 'created_at'>[], senales: SenalesCliente | null, max: number = 4): SenalSalud[] {
  const lista: SenalSalud[] = cambiosDeBanda(historial).map((c) => ({ tipo: 'banda' as const, ...c }));
  if (senales?.vencida) lista.push({ tipo: 'vencida', fecha: senales.vencida.fecha, dias: senales.vencida.dias, saldo: senales.vencida.saldo });
  if (senales?.ultimaFactura) lista.push({ tipo: 'compra', fecha: senales.ultimaFactura.fecha, total: senales.ultimaFactura.total });
  return lista.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, max);
}

// ─── Configuración de factores ──────────────────────────────────────────────

export function sumaPesos(config: HealthConfigJson): number {
  return Math.round(config.indicators.filter((i) => i.enabled !== false).reduce((s, i) => s + i.weight, 0) * 100) / 100;
}

export function conPeso(config: HealthConfigJson, key: string, peso: number): HealthConfigJson {
  return { ...config, indicators: config.indicators.map((i) => (i.key === key ? { ...i, weight: Math.max(0, peso) } : i)) };
}

export function conEncendido(config: HealthConfigJson, key: string, encendido: boolean): HealthConfigJson {
  return {
    ...config,
    indicators: config.indicators.map((i) => {
      if (i.key !== key) return i;
      const { enabled: _e, ...resto } = i;
      void _e;
      return encendido ? resto : { ...resto, enabled: false };
    }),
  };
}

export function conBanda(config: HealthConfigJson, banda: keyof Pick<HealthBandsJson, 'green' | 'yellow'>, valor: number): HealthConfigJson {
  return { ...config, bands: { ...config.bands, [banda]: Math.max(0, Math.min(100, valor)) } };
}

/** Config para puntuar a partir del borrador (solo encendidos y con peso). */
export function configParaPuntuar(config: HealthConfigJson): HealthConfigJson {
  return { bands: config.bands, indicators: config.indicators.filter((i) => i.enabled !== false && i.weight > 0) };
}

/**
 * «Vista previa con tus datos» (anotación 1424:1606): recalcula en memoria
 * sobre los datos actuales; `antes` = la banda que ya tiene cada cliente.
 */
export function vistaPrevia(resultados: readonly HealthScoreResult[], borrador: HealthConfigJson): { antes: Record<HealthBand, number>; despues: Record<HealthBand, number> } {
  const antes: Record<HealthBand, number> = { red: 0, yellow: 0, green: 0 };
  const despues: Record<HealthBand, number> = { red: 0, yellow: 0, green: 0 };
  const cfg = configParaPuntuar(borrador);
  for (const r of resultados) {
    antes[r.band] += 1;
    const nuevo = r.raw ? scoreFromConfig(cfg, r.raw) : null;
    despues[nuevo ? nuevo.band : bandForScore(r.score, cfg.bands)] += 1;
  }
  return { antes, despues };
}

/**
 * La config con los indicadores por clave: así «N cambios sin guardar» de
 * Configuración (`contarCambios`) cuenta cada peso, interruptor y corte por
 * separado y no el arreglo entero como un solo cambio.
 */
export function configComparable(config: HealthConfigJson): { bands: HealthBandsJson; indicators: Record<string, HealthIndicatorJson> } {
  return { bands: config.bands, indicators: Object.fromEntries(config.indicators.map((i) => [i.key, i])) };
}

export type UnidadUmbral = 'dias' | 'porcentaje' | 'dinero' | 'cantidad';

export function unidadDeClave(key: string): UnidadUmbral {
  const f = factorDeClave(key);
  if (key === 'overdue_balance' || f === 'ingresos') return 'dinero';
  if (f === 'cartera') return 'porcentaje';
  if (f === 'compras' || f === 'actividad') return 'dias';
  return 'cantidad';
}

export interface ParteUmbral {
  /** igual «0 % = 100» · menosDe «menos de 30 d» · rango «30–90 d» · masDe «más de 90 d» · desde «12 o más». */
  tipo: 'igual' | 'menosDe' | 'rango' | 'masDe' | 'desde';
  valor: number;
  /** Fin del rango (solo `rango`). */
  hasta?: number;
  puntos: number;
}

/**
 * Texto de los umbrales de un indicador por tramos (Figma 1424:1393: «Menos
 * de 30 d = 100 · 30–90 d = 50 · más de 90 d = 0»; «12 o más = 100 · 6–11 =
 * 60 · menos de 6 = 20»), en partes para traducir. Refleja `scoreIndicator`.
 */
export function partesUmbral(ind: Pick<HealthIndicatorJson, 'direction' | 'thresholds'>): ParteUmbral[] {
  const peor = Math.min(...ind.thresholds.map((t) => t.score));
  if (ind.direction === 'lower_better') {
    const conMax = ind.thresholds.filter((t) => t.max !== undefined).sort((a, b) => a.max! - b.max!);
    const partes: ParteUmbral[] = conMax.map((t, i) =>
      i === 0
        ? t.max! <= 0
          ? { tipo: 'igual', valor: t.max!, puntos: t.score }
          : { tipo: 'menosDe', valor: t.max!, puntos: t.score }
        : conMax[i - 1].max! <= 0
          ? { tipo: 'menosDe', valor: t.max!, puntos: t.score }
          : { tipo: 'rango', valor: conMax[i - 1].max!, hasta: t.max!, puntos: t.score },
    );
    const ultimo = conMax[conMax.length - 1];
    if (ultimo && ultimo.score !== peor) partes.push({ tipo: 'masDe', valor: ultimo.max!, puntos: peor });
    return partes;
  }
  const conMin = ind.thresholds.filter((t) => t.min !== undefined).sort((a, b) => b.min! - a.min!);
  return conMin.map((t, i) => {
    if (i === 0) return { tipo: 'desde', valor: t.min!, puntos: t.score };
    const techo = conMin[i - 1].min!;
    if (t.min! <= 0) return { tipo: 'menosDe', valor: techo, puntos: t.score };
    return { tipo: 'rango', valor: t.min!, hasta: Number.isInteger(techo) && Number.isInteger(t.min!) && techo - t.min! < 1000 ? techo - 1 : techo, puntos: t.score };
  });
}

/** Color de una barra de puntaje: la banda del valor (0–100). */
export function bandaDeValor(valor: number, bandas: HealthBandsJson): HealthBand {
  return bandForScore(valor, bandas);
}

/** Color de la barra de un factor según la proporción lograda (Figma 1424:839). */
export function tonoFactor(puntos: number, maximo: number): HealthBand {
  const pct = maximo > 0 ? puntos / maximo : 0;
  return pct >= 0.8 ? 'green' : pct >= 0.3 ? 'yellow' : 'red';
}
