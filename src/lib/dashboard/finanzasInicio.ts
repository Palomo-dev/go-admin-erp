/**
 * Finanzas en el «Módulos» del inicio (Figma `03 Navegación y shell` ›
 * «Inicio — pendientes de Finanzas en el módulo», 2360:42276; aprobado por el
 * dueño el 2026-11-07). Sustituye a la «página de inicio de Finanzas»
 * descartada (FINANZAS-R2-PLAN, G1).
 *
 * Regla pura, sin dependencias de red. De las lecturas crudas del servidor
 * (`finanzasInicio.server.ts`) arma:
 *  - `pendientes`: las filas «qué · dónde · cantidad · acción». Solo filas con
 *    cantidad > 0 y que la persona puede atender (la página que lo resuelve
 *    está en SU menú). Orden fijo del diseño.
 *  - `fila`: badge, tono y línea plegada de la fila «Finanzas».
 *  - `resultado`: el resultado del mes anterior según el mayor.
 *
 * Fuentes (nota «Fuentes verificadas» del Figma, 2362:43410):
 *  - Pendientes contables → `fn_pendientes_contables`.
 *  - Conciliación sin cerrar → `bank_reconciliations` (draft, in_progress).
 *  - Mes sin cerrar → `fiscal_periods` mensuales sin cerrar con fin anterior a hoy.
 *  - DIAN → `electronic_invoicing_jobs` rechazados, o retenidos / fallidos sin enviar.
 *  - Resultado del mes → `fn_estado_resultado_integral`.
 * Fuera, por no tener fuente: «Alertas de bancos» (las anomalías se calculan
 * al vuelo y contarlas exige recorrer todos los movimientos en cada carga del
 * inicio) y «Dinero disponible» (migración propuesta sin aplicar:
 * `20261107235000_inicio_dinero_disponible`).
 *
 * Las claves de texto (`clave`) son del namespace `inicioFinanzas`.
 */
import type { CifraModulo, KpiModulo, TextoModulo, TonoModulo } from './resumenModulos';

// ─── Lecturas crudas ────────────────────────────────────────────────────────

/** Resultado de leer una fuente: dato, error, o sin acceso (permiso o página fuera del menú). */
export type Lectura<T> = { estado: 'ok'; datos: T } | { estado: 'error' } | { estado: 'sinAcceso' };

export interface MesPlano {
  anio: number;
  mes: number;
}

export interface CrudoFinanzasInicio {
  /** Día de hoy en la zona de la organización (`YYYY-MM-DD`). */
  dia: string;
  pendientesContables: Lectura<{ cantidad: number; bloqueanCierre: number }>;
  /** `unica`: la conciliación abierta cuando es una sola («Continuar» la abre). */
  conciliaciones: Lectura<{ cantidad: number; unica: { id: string; mes: MesPlano } | null }>;
  dian: Lectura<{ rechazados: number; sinEnviar: number }>;
  /** `ultimo`: el mes sin cerrar más reciente (para «Octubre sin cerrar»). */
  periodos: Lectura<{ cantidad: number; ultimo: MesPlano | null }>;
  resultado: Lectura<{ utilidad: number; mes: MesPlano; desde: string; hasta: string }>;
}

/** Páginas que resuelven cada pendiente (rutas del catálogo, `catalog.ts`). */
export const PAGINAS_FINANZAS = {
  pendientesContables: '/app/finanzas/contabilidad/pendientes',
  bancos: '/app/finanzas/bancos',
  facturacionElectronica: '/app/finanzas/facturacion-electronica',
  periodosFiscales: '/app/finanzas/contabilidad/periodos-fiscales',
  porCobrar: '/app/finanzas/cuentas-por-cobrar',
  porPagar: '/app/finanzas/cuentas-por-pagar',
  reportes: '/app/reportes',
} as const;

/** «Bancos › Conciliación» (pestaña en la URL) y el detalle de una conciliación. */
export const RUTA_CONCILIACIONES = `${PAGINAS_FINANZAS.bancos}?tab=conciliacion`;
export const rutaConciliacion = (id: string) => `/app/finanzas/conciliacion-bancaria/${encodeURIComponent(id)}`;

// ─── Fechas planas ──────────────────────────────────────────────────────────

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Mes anterior al de `dia` (`YYYY-MM-DD`), con su primer y último día. */
export function mesAnterior(dia: string): { mes: MesPlano; desde: string; hasta: string } {
  const m = FECHA.exec(dia);
  if (!m) throw new Error(`Fecha no válida: ${dia}`);
  let anio = Number(m[1]);
  let mes = Number(m[2]) - 1;
  if (mes === 0) {
    mes = 12;
    anio -= 1;
  }
  // Último día del mes: el día 0 del mes siguiente (aritmética de calendario, sin zona).
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, '0');
  return { mes: { anio, mes }, desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

/** Mes de una fecha plana (`YYYY-MM-DD`); null si no es válida. */
export function mesDeFecha(fecha: string | null | undefined): MesPlano | null {
  const m = fecha ? FECHA.exec(fecha.slice(0, 10)) : null;
  return m ? { anio: Number(m[1]), mes: Number(m[2]) } : null;
}

// ─── Pendientes ─────────────────────────────────────────────────────────────

export type IdPendienteFinanzas =
  | 'pendientesContables'
  | 'conciliacion'
  | 'dianRechazados'
  | 'dianSinEnviar'
  | 'periodosSinCerrar';

/** Orden del diseño: contabilidad, bancos, facturación electrónica, periodos. */
export const ORDEN_PENDIENTES: readonly IdPendienteFinanzas[] = [
  'pendientesContables',
  'conciliacion',
  'dianRechazados',
  'dianSinEnviar',
  'periodosSinCerrar',
];

export interface PendienteFinanzas {
  id: IdPendienteFinanzas;
  /** «Qué»: texto de la fila. */
  que: TextoModulo;
  /** «Dónde»: módulo › pantalla. */
  donde: TextoModulo;
  cantidad: number;
  tono: TonoModulo;
  /** Etiqueta del enlace («Resolver», «Continuar»…). */
  accion: TextoModulo;
  href: string;
  /** Mes al que se refiere el texto, si aplica (se nombra en el cliente, en su idioma). */
  mes?: MesPlano;
}

export type EstadoPendientes = 'pendientes' | 'alDia' | 'error';

export interface PendientesFinanzas {
  estado: EstadoPendientes;
  filas: PendienteFinanzas[];
  /** Suma de las cantidades de las filas visibles. */
  total: number;
  /** Alguna fuente falló: lo que se ve puede estar incompleto. */
  parcial: boolean;
}

const cantidad = (n: unknown): number => {
  const v = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
  return Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0;
};

/**
 * Filas de «Pendientes». `href(pagina)` devuelve la ruta si la persona ve esa
 * página en su menú, o null: sin página no hay forma de resolverlo y la fila
 * no aparece.
 */
export function armarPendientes(c: CrudoFinanzasInicio, href: (pagina: string) => string | null): PendientesFinanzas {
  const candidatas: Array<PendienteFinanzas | null> = [];
  const lecturas = [c.pendientesContables, c.conciliaciones, c.dian, c.periodos];
  const parcial = lecturas.some((l) => l.estado === 'error');

  if (c.pendientesContables.estado === 'ok') {
    const destino = href(PAGINAS_FINANZAS.pendientesContables);
    const n = cantidad(c.pendientesContables.datos.cantidad);
    candidatas.push(
      destino && n > 0
        ? {
            id: 'pendientesContables',
            que: { clave: 'pendientes.que.pendientesContables' },
            donde: { clave: 'pendientes.donde.contabilidadPendientes' },
            cantidad: n,
            tono: 'peligro',
            accion: { clave: 'pendientes.accion.resolver' },
            href: destino,
          }
        : null,
    );
  }

  if (c.conciliaciones.estado === 'ok') {
    const bancos = href(PAGINAS_FINANZAS.bancos);
    const { unica } = c.conciliaciones.datos;
    const n = cantidad(c.conciliaciones.datos.cantidad);
    candidatas.push(
      bancos && n > 0
        ? {
            id: 'conciliacion',
            que: n === 1 && unica ? { clave: 'pendientes.que.conciliacionMes' } : { clave: 'pendientes.que.conciliaciones', params: { n } },
            donde: { clave: 'pendientes.donde.bancosConciliacion' },
            cantidad: n,
            tono: 'advertencia',
            accion: { clave: 'pendientes.accion.continuar' },
            href: n === 1 && unica ? rutaConciliacion(unica.id) : RUTA_CONCILIACIONES,
            ...(n === 1 && unica ? { mes: unica.mes } : {}),
          }
        : null,
    );
  }

  if (c.dian.estado === 'ok') {
    const destino = href(PAGINAS_FINANZAS.facturacionElectronica);
    const rechazados = cantidad(c.dian.datos.rechazados);
    const sinEnviar = cantidad(c.dian.datos.sinEnviar);
    if (destino) {
      candidatas.push(
        rechazados > 0
          ? {
              id: 'dianRechazados',
              que: { clave: 'pendientes.que.dianRechazados' },
              donde: { clave: 'pendientes.donde.facturacionElectronica' },
              cantidad: rechazados,
              tono: 'peligro',
              accion: { clave: 'pendientes.accion.ver' },
              href: destino,
            }
          : null,
        sinEnviar > 0
          ? {
              id: 'dianSinEnviar',
              que: { clave: 'pendientes.que.dianSinEnviar' },
              donde: { clave: 'pendientes.donde.facturacionElectronica' },
              cantidad: sinEnviar,
              tono: 'advertencia',
              accion: { clave: 'pendientes.accion.revisar' },
              href: destino,
            }
          : null,
      );
    }
  }

  if (c.periodos.estado === 'ok') {
    const destino = href(PAGINAS_FINANZAS.periodosFiscales);
    const n = cantidad(c.periodos.datos.cantidad);
    const ultimo = c.periodos.datos.ultimo;
    candidatas.push(
      destino && n > 0
        ? {
            id: 'periodosSinCerrar',
            que: n === 1 && ultimo ? { clave: 'pendientes.que.mesSinCerrar' } : { clave: 'pendientes.que.mesesSinCerrar', params: { n } },
            donde: { clave: 'pendientes.donde.contabilidadPeriodos' },
            cantidad: n,
            tono: 'informacion',
            accion: { clave: 'pendientes.accion.cerrarPeriodo' },
            href: destino,
            ...(n === 1 && ultimo ? { mes: ultimo } : {}),
          }
        : null,
    );
  }

  const filas = ordenarPendientes(candidatas.filter((f): f is PendienteFinanzas => f !== null));
  const total = filas.reduce((s, f) => s + f.cantidad, 0);
  const todasFallaron = lecturas.every((l) => l.estado === 'error');
  return {
    estado: filas.length > 0 ? 'pendientes' : todasFallaron || parcial ? 'error' : 'alDia',
    filas,
    total,
    parcial,
  };
}

/** Orden fijo del diseño (estable ante cualquier orden de entrada). */
export function ordenarPendientes(filas: readonly PendienteFinanzas[]): PendienteFinanzas[] {
  const pos = (id: IdPendienteFinanzas) => ORDEN_PENDIENTES.indexOf(id);
  return [...filas].sort((a, b) => pos(a.id) - pos(b.id));
}

// ─── Fila plegada «Finanzas» ────────────────────────────────────────────────

export type SegmentoFila = TextoModulo | { cifra: CifraModulo; clave: string };

export interface FilaFinanzas {
  tono: TonoModulo;
  badge: TextoModulo | null;
  resumen: SegmentoFila[];
}

/**
 * Badge, tono y línea plegada. Con pendientes: «N pendientes» (rojo si alguno
 * es urgente o hay cartera vencida). Sin pendientes ni cartera vencida: «Al
 * día». Si una fuente falló, nunca se dice «Al día».
 */
export function filaFinanzas(
  p: PendientesFinanzas,
  base: { vencidas: number; carteraVencida: KpiModulo | null; porPagar: KpiModulo | null },
): FilaFinanzas {
  const vencidas = cantidad(base.vencidas);
  const urgente = p.filas.some((f) => f.tono === 'peligro') || vencidas > 0;
  let tono: TonoModulo;
  let badge: TextoModulo | null;
  if (p.total > 0) {
    tono = urgente ? 'peligro' : 'advertencia';
    badge = { clave: 'fila.badgePendientes', params: { n: p.total } };
  } else if (vencidas > 0) {
    tono = 'peligro';
    badge = { clave: 'fila.badgeVencidas', params: { n: vencidas } };
  } else if (p.estado === 'alDia') {
    tono = 'exito';
    badge = { clave: 'fila.alDia' };
  } else {
    tono = 'neutro';
    badge = null;
  }

  const resumen: SegmentoFila[] = [];
  const cv = base.carteraVencida?.cifra;
  if (vencidas === 0) resumen.push({ clave: 'fila.carteraAlDia' });
  else if (cv?.tipo === 'moneda') resumen.push({ clave: 'fila.carteraVencida', cifra: cv });
  else resumen.push({ clave: 'fila.carteraVencidaCuentas', params: { n: vencidas } });
  const pp = base.porPagar?.cifra;
  if (pp?.tipo === 'moneda') resumen.push({ clave: 'fila.porPagar', cifra: pp });
  else if (pp?.tipo === 'numero') resumen.push({ clave: 'fila.porPagarCuentas', params: { n: pp.valor } });
  return { tono, badge, resumen };
}

// ─── Todo el bloque ─────────────────────────────────────────────────────────

export type ResultadoMes =
  | { estado: 'ok'; cifra: CifraModulo; mes: MesPlano; href: string | null }
  | { estado: 'error'; mes: MesPlano };

export interface FinanzasInicio {
  /**
   * «Dinero disponible» no tiene fuente en el servidor: hoy se suma en el
   * navegador mezclando monedas. Se muestra como no disponible hasta aplicar
   * `20261107235000_inicio_dinero_disponible`.
   */
  disponible: { estado: 'noDisponible'; motivo: 'faltaFuente' };
  porCobrarVencido: { kpi: KpiModulo; href: string | null } | null;
  porPagar: { kpi: KpiModulo; href: string | null } | null;
  /** null: sin permiso para leer el mayor (la tarjeta no aparece). */
  resultado: ResultadoMes | null;
  pendientes: PendientesFinanzas;
  fila: FilaFinanzas;
  /** «Reportes de Finanzas → módulo Reportes», si la persona ve Reportes. */
  hrefReportes: string | null;
}

export interface EntradaFinanzas {
  crudo: CrudoFinanzasInicio;
  moneda: string;
  vencidas: number;
  /** KPIs ya calculados por `resumirModulo` (regla `finance`): no se recalculan. */
  kpis: readonly KpiModulo[];
  href: (pagina: string) => string | null;
  /** Enlace al estado de resultados del mes en Reportes (null si no lo ve). */
  hrefResultado: (desde: string, hasta: string) => string | null;
  hrefReportes: string | null;
}

export function armarFinanzas(e: EntradaFinanzas): FinanzasInicio {
  const pendientes = armarPendientes(e.crudo, e.href);
  const carteraVencida = e.kpis.find((k) => k.etiqueta === 'carteraVencida') ?? null;
  const porPagar = e.kpis.find((k) => k.etiqueta === 'porPagar7d') ?? null;
  const r = e.crudo.resultado;
  const mesResultado = mesAnterior(e.crudo.dia);
  const resultado: ResultadoMes | null =
    r.estado === 'ok'
      ? {
          estado: 'ok',
          cifra: { tipo: 'moneda', valor: Number.isFinite(r.datos.utilidad) ? r.datos.utilidad : 0, moneda: e.moneda },
          mes: r.datos.mes,
          href: e.hrefResultado(r.datos.desde, r.datos.hasta),
        }
      : r.estado === 'error'
        ? { estado: 'error', mes: mesResultado.mes }
        : null;
  return {
    disponible: { estado: 'noDisponible', motivo: 'faltaFuente' },
    porCobrarVencido: carteraVencida ? { kpi: carteraVencida, href: e.href(PAGINAS_FINANZAS.porCobrar) } : null,
    porPagar: porPagar ? { kpi: porPagar, href: e.href(PAGINAS_FINANZAS.porPagar) } : null,
    resultado,
    pendientes,
    fila: filaFinanzas(pendientes, { vencidas: e.vencidas, carteraVencida, porPagar }),
    hrefReportes: e.hrefReportes,
  };
}
