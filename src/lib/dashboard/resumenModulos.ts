/**
 * Resumen por módulo del inicio — de las cifras crudas de
 * `fn_inicio_modulos_resumen` a lo que pinta cada fila (`FilaModulo` /
 * `ModuloResumenFila`, Figma 445:195568 y 638:388816) y su panel desplegado
 * («Inicio — Dashboard por módulo», 642:25956).
 *
 * Regla pura, sin dependencias. Cada módulo da:
 *  - `tono` y `badge` (el estado dominante de la fila: «7 vencidas», «2 por
 *    aprobar»…). En toda la lista hay UN solo badge sólido: el más grave
 *    (`badgeSolido`); el resto va suave (DASHBOARD-POR-MODULO §3).
 *  - `resumen`: la línea de la fila plegada, en segmentos «a · b · c».
 *  - `kpis`: las cifras del panel desplegado (mismo dato, sin otra consulta).
 *
 * Monedas: nunca se suman monedas distintas. Un importe con más de una moneda
 * se sustituye por el número de cuentas u operaciones.
 */

export type TonoModulo = 'peligro' | 'advertencia' | 'exito' | 'informacion' | 'neutro';

/** Texto a traducir bajo `home.modulos` con sus variables ICU. */
export interface TextoModulo {
  clave: string;
  params?: Record<string, string | number>;
}

export type CifraModulo =
  | { tipo: 'moneda'; valor: number; moneda: string }
  | { tipo: 'numero'; valor: number }
  | { tipo: 'texto'; texto: TextoModulo };

export interface KpiModulo {
  /** Clave de la etiqueta bajo `home.modulos.kpis`. */
  etiqueta: string;
  cifra: CifraModulo;
  detalle?: TextoModulo;
  /** Variación porcentual frente al periodo anterior (null = sin base). */
  delta?: number | null;
  tono?: TonoModulo;
}

export interface ResumenModulo {
  codigo: string;
  tono: TonoModulo;
  badge: TextoModulo | null;
  /** Segmentos de la línea plegada (se unen con « · »). */
  resumen: Array<TextoModulo | { cifra: CifraModulo; clave: string }>;
  kpis: KpiModulo[];
  /** La base no pudo calcular este módulo: la fila ofrece «Reintentar». */
  error: boolean;
  /** true si el dato es del periodo elegido (si no, es «hoy» o estado actual). */
  usaPeriodo: boolean;
}

// ─── Cifras crudas (lo que devuelve la base) ────────────────────────────────

type Num = number | string | null | undefined;

export interface CrudoModulo {
  codigo: string;
  error?: boolean;
  [clave: string]: unknown;
}

export interface CrudoResumen {
  zona: string;
  dia: string;
  moneda: string;
  calculado_en: string;
  modulos: CrudoModulo[];
}

/** Número finito a partir de lo que llegue (numeric como texto, null…). */
export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function monedas(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((m): m is string => typeof m === 'string' && m.trim() !== '').map((m) => m.toUpperCase()) : [];
}

/** Importe si hay a lo sumo una moneda; si no, null (no se suma). */
function importe(valor: Num, lista: string[], base: string): CifraModulo | null {
  if (lista.length > 1) return null;
  return { tipo: 'moneda', valor: num(valor), moneda: lista[0] ?? base };
}

/** Variación % frente al anterior; null sin base de comparación. */
export function variacion(actual: number, anterior: number): number | null {
  if (!Number.isFinite(anterior) || anterior <= 0) return null;
  return ((actual - anterior) / anterior) * 100;
}

/** Lista de KPI con tipo contextual por elemento. */
const kpis = (...lista: KpiModulo[]): KpiModulo[] => lista;
const numero = (valor: unknown): CifraModulo => ({ tipo: 'numero', valor: num(valor) });
const seg = (clave: string, params?: TextoModulo['params']): TextoModulo => ({ clave: `resumen.${clave}`, params });

// ─── Reglas por módulo ──────────────────────────────────────────────────────

type Regla = (m: CrudoModulo, base: string) => Omit<ResumenModulo, 'codigo' | 'error'>;

const REGLAS: Record<string, Regla> = {
  finance: (m, base) => {
    const vencidas = num(m.cuentas_vencidas);
    const pp = (m.por_pagar_7d ?? {}) as { total?: Num; cuentas?: Num; monedas?: unknown };
    const ppCuentas = num(pp.cuentas);
    const cartera = importe(m.cartera_vencida as Num, monedas(m.monedas_cartera), base);
    const porCobrar = importe(m.por_cobrar as Num, monedas(m.monedas_cartera), base);
    const porPagar = importe(pp.total, monedas(pp.monedas), base);
    const tono: TonoModulo = vencidas > 0 ? 'peligro' : ppCuentas > 0 ? 'advertencia' : 'neutro';
    return {
      tono,
      badge: vencidas > 0 ? { clave: 'badges.vencidas', params: { n: vencidas } } : ppCuentas > 0 ? { clave: 'badges.porPagar', params: { n: ppCuentas } } : null,
      resumen: [
        cartera && vencidas > 0 ? { clave: 'resumen.carteraVencida', cifra: cartera } : seg(vencidas > 0 ? 'cuentasVencidas' : 'carteraAlDia', { n: vencidas }),
        porCobrar ? { clave: 'resumen.porCobrar', cifra: porCobrar } : seg('variasMonedas'),
        porPagar && ppCuentas > 0 ? { clave: 'resumen.porPagar7d', cifra: porPagar } : seg('porPagar7dCuentas', { n: ppCuentas }),
      ],
      kpis: kpis(
        { etiqueta: 'carteraVencida', cifra: cartera ?? numero(vencidas), detalle: { clave: 'detalles.cuentasDias', params: { n: vencidas, dias: num(m.dias_mas_vieja) } }, tono: vencidas > 0 ? 'peligro' : 'neutro' },
        { etiqueta: 'porCobrar', cifra: porCobrar ?? { tipo: 'texto', texto: { clave: 'detalles.variasMonedas' } } },
        { etiqueta: 'porPagar7d', cifra: porPagar ?? numero(ppCuentas), detalle: { clave: 'detalles.cuentas', params: { n: ppCuentas } }, tono: ppCuentas > 0 ? 'advertencia' : 'neutro' },
      ),
      usaPeriodo: false,
    };
  },

  pos: (m, base) => {
    const ventas = num(m.ventas_cobradas);
    const lista = monedas(m.monedas);
    const neto = importe(m.neto as Num, lista, base);
    const ticket = importe(m.ticket_promedio as Num, lista, base);
    const delta = lista.length > 1 ? null : variacion(num(m.neto), num(m.neto_anterior));
    const antiguas = num(m.cajas_de_dias_anteriores);
    const abiertas = num(m.cajas_abiertas);
    return {
      tono: antiguas > 0 ? 'advertencia' : 'neutro',
      badge: antiguas > 0
        ? { clave: 'badges.cajasAntiguas', params: { n: antiguas } }
        : abiertas > 0 ? { clave: 'badges.cajasAbiertas', params: { n: abiertas } } : null,
      resumen: [
        seg('ventas', { n: ventas }),
        neto ? { clave: 'resumen.cobrado', cifra: neto } : seg('variasMonedas'),
        ...(ticket && ventas > 0 ? [{ clave: 'resumen.ticketMedio', cifra: ticket }] : []),
      ],
      kpis: kpis(
        { etiqueta: 'ventasCobradas', cifra: neto ?? { tipo: 'texto', texto: { clave: 'detalles.variasMonedas' } }, delta },
        { etiqueta: 'numeroVentas', cifra: numero(ventas) },
        { etiqueta: 'ticketPromedio', cifra: ticket ?? { tipo: 'texto', texto: { clave: 'detalles.variasMonedas' } } },
        { etiqueta: 'cajasAbiertas', cifra: numero(abiertas), detalle: antiguas > 0 ? { clave: 'detalles.cajasAntiguas', params: { n: antiguas } } : undefined, tono: antiguas > 0 ? 'advertencia' : 'neutro' },
      ),
      usaPeriodo: true,
    };
  },

  inventory: (m, base) => {
    const agotados = num(m.agotados);
    const bajo = num(m.bajo_minimo);
    const valor = m.valor === null || m.valor === undefined ? null : { tipo: 'moneda' as const, valor: num(m.valor), moneda: typeof m.moneda === 'string' ? m.moneda : base };
    return {
      tono: agotados > 0 ? 'peligro' : bajo > 0 ? 'advertencia' : 'neutro',
      badge: agotados > 0 ? { clave: 'badges.sinStock', params: { n: agotados } } : bajo > 0 ? { clave: 'badges.bajoMinimo', params: { n: bajo } } : null,
      resumen: [
        seg('productos', { n: num(m.productos) }),
        ...(valor ? [{ clave: 'resumen.valorizado', cifra: valor }] : []),
        seg('bajoMinimo', { n: bajo }),
      ],
      kpis: kpis(
        { etiqueta: 'productos', cifra: numero(m.productos) },
        { etiqueta: 'sinStock', cifra: numero(agotados), tono: agotados > 0 ? 'peligro' : 'neutro' },
        { etiqueta: 'bajoMinimo', cifra: numero(bajo), tono: bajo > 0 ? 'advertencia' : 'neutro' },
        ...(valor ? [{ etiqueta: 'valorInventario', cifra: valor }] : []),
      ),
      usaPeriodo: false,
    };
  },

  crm: (m) => {
    const sinTocar = num(m.sin_tocar_7d);
    const pipeline = Object.entries((m.pipeline ?? {}) as Record<string, Num>)
      .map(([moneda, total]) => ({ moneda: moneda.toUpperCase(), total: num(total) }))
      .sort((a, b) => b.total - a.total);
    return {
      tono: sinTocar > 0 ? 'advertencia' : 'neutro',
      badge: sinTocar > 0 ? { clave: 'badges.sinTocar', params: { n: sinTocar } } : null,
      resumen: [
        seg('oportunidades', { n: num(m.abiertas) }),
        // Cada moneda por separado: nunca se suman.
        ...pipeline.slice(0, 2).map((p) => ({ clave: 'resumen.pipeline', cifra: { tipo: 'moneda' as const, valor: p.total, moneda: p.moneda } })),
        seg('clientesNuevos', { n: num(m.clientes_nuevos) }),
      ],
      kpis: kpis(
        { etiqueta: 'oportunidadesAbiertas', cifra: numero(m.abiertas), detalle: sinTocar > 0 ? { clave: 'detalles.sinTocar', params: { n: sinTocar } } : undefined, tono: sinTocar > 0 ? 'advertencia' : 'neutro' },
        ...pipeline.slice(0, 2).map((p) => ({ etiqueta: 'pipeline', cifra: { tipo: 'moneda' as const, valor: p.total, moneda: p.moneda } })),
        { etiqueta: 'ganadas', cifra: numero(m.ganadas_periodo) },
        { etiqueta: 'clientesNuevos', cifra: numero(m.clientes_nuevos) },
      ),
      usaPeriodo: true,
    };
  },

  hrm: (m) => {
    const porAprobar = num(m.ausencias_por_aprobar);
    return {
      tono: porAprobar > 0 ? 'advertencia' : 'neutro',
      badge: porAprobar > 0 ? { clave: 'badges.porAprobar', params: { n: porAprobar } } : null,
      resumen: [seg('personasActivas', { n: num(m.personas_activas) }), seg('ausentesHoy', { n: num(m.ausentes_hoy) }), seg('turnosHoy', { n: num(m.turnos_hoy) })],
      kpis: kpis(
        { etiqueta: 'personasActivas', cifra: numero(m.personas_activas) },
        { etiqueta: 'ausentesHoy', cifra: numero(m.ausentes_hoy) },
        { etiqueta: 'turnosHoy', cifra: numero(m.turnos_hoy) },
        { etiqueta: 'ausenciasPorAprobar', cifra: numero(porAprobar), tono: porAprobar > 0 ? 'advertencia' : 'neutro' },
      ),
      usaPeriodo: false,
    };
  },

  pms_hotel: (m) => {
    const pendientes = num(m.llegadas_pendientes);
    return {
      tono: pendientes > 0 ? 'informacion' : 'neutro',
      badge: pendientes > 0 ? { clave: 'badges.llegadasPendientes', params: { n: pendientes } } : null,
      resumen: [seg('llegadasSalidas', { llegadas: num(m.llegadas_hoy), salidas: num(m.salidas_hoy) }), seg('enCasa', { n: num(m.en_casa) })],
      kpis: kpis(
        { etiqueta: 'llegadasHoy', cifra: numero(m.llegadas_hoy), detalle: { clave: 'detalles.pendientes', params: { n: pendientes } } },
        { etiqueta: 'salidasHoy', cifra: numero(m.salidas_hoy) },
        { etiqueta: 'enCasa', cifra: numero(m.en_casa) },
      ),
      usaPeriodo: false,
    };
  },

  memberships: (m) => {
    const porVencer = num(m.por_vencer_7d);
    const mora = num(m.en_mora);
    return {
      tono: mora > 0 ? 'peligro' : porVencer > 0 ? 'advertencia' : 'neutro',
      badge: mora > 0 ? { clave: 'badges.enMora', params: { n: mora } } : porVencer > 0 ? { clave: 'badges.porVencer', params: { n: porVencer } } : null,
      resumen: [seg('membresiasActivas', { n: num(m.activas) }), seg('porVencer7d', { n: porVencer })],
      kpis: kpis(
        { etiqueta: 'membresiasActivas', cifra: numero(m.activas) },
        { etiqueta: 'porVencer7d', cifra: numero(porVencer), tono: porVencer > 0 ? 'advertencia' : 'neutro' },
        { etiqueta: 'enMora', cifra: numero(mora), tono: mora > 0 ? 'peligro' : 'neutro' },
      ),
      usaPeriodo: false,
    };
  },

  transport: (m) => {
    const retrasados = num(m.retrasados);
    return {
      tono: retrasados > 0 ? 'peligro' : 'neutro',
      badge: retrasados > 0 ? { clave: 'badges.retrasados', params: { n: retrasados } } : null,
      resumen: [seg('viajesHoy', { n: num(m.viajes_hoy) }), seg('enCurso', { n: num(m.en_curso) }), seg('completados', { n: num(m.completados) })],
      kpis: kpis(
        { etiqueta: 'viajesHoy', cifra: numero(m.viajes_hoy) },
        { etiqueta: 'enCurso', cifra: numero(m.en_curso) },
        { etiqueta: 'retrasados', cifra: numero(retrasados), tono: retrasados > 0 ? 'peligro' : 'neutro' },
        { etiqueta: 'completados', cifra: numero(m.completados) },
      ),
      usaPeriodo: false,
    };
  },
};

/** ¿Sabe la regla pura resumir este módulo? (la base decide si lo devuelve). */
export function tieneResumen(codigo: string): boolean {
  return codigo in REGLAS;
}

export function resumirModulo(m: CrudoModulo, monedaBase: string): ResumenModulo | null {
  const regla = REGLAS[m.codigo];
  if (!regla) return null;
  if (m.error) {
    return { codigo: m.codigo, tono: 'neutro', badge: null, resumen: [], kpis: [], error: true, usaPeriodo: false };
  }
  return { codigo: m.codigo, error: false, ...regla(m, monedaBase) };
}

const PESO: Record<TonoModulo, number> = { peligro: 0, advertencia: 1, informacion: 2, exito: 3, neutro: 4 };

/**
 * El único badge sólido de la lista: el del módulo con el estado más grave
 * (peligro > advertencia). Empate: el primero en el orden de la lista. Sin
 * ningún peligro ni advertencia, ninguno.
 */
export function badgeSolido(resumenes: ReadonlyArray<Pick<ResumenModulo, 'codigo' | 'tono' | 'badge'>>): string | null {
  let mejor: { codigo: string; peso: number } | null = null;
  for (const r of resumenes) {
    if (!r.badge) continue;
    const peso = PESO[r.tono];
    if (peso > PESO.advertencia) continue;
    if (!mejor || peso < mejor.peso) mejor = { codigo: r.codigo, peso };
  }
  return mejor?.codigo ?? null;
}
