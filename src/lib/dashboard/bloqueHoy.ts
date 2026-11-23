/**
 * Bloque «Hoy» del inicio (Figma `03 Navegación y shell` › «Inicio — dashboard»,
 * frame `445:137185`, componente `TarjetaHoy` `445:195385`).
 *
 * Regla pura, sin red: de las cifras que devuelve el servidor
 * (`bloqueHoy.server.ts`) a las casillas que se pintan. Cada casilla lleva
 * etiqueta, estado, una cifra, un detalle y EXACTAMENTE una acción.
 *
 * Reglas del diseño (AUDITORIA-DASHBOARD-INICIO.md §P2 y PARIDAD §V.9b):
 * - Nunca un callejón sin salida: sin nada urgente la casilla va en tono
 *   neutro, dice «Al día» y la acción abre el listado.
 * - El bloque es estado actual (avisos), no depende del periodo: las ventas
 *   del periodo viven en su propia tarjeta. La casilla de caja se sustituyó
 *   por el aviso de cajas abiertas desde días anteriores, que solo aparece
 *   cuando las hay.
 * - Cinco casillas como máximo; el orden lo decide la urgencia (peligro →
 *   advertencia → neutro) y, a igual urgencia, el orden fijo de abajo.
 * - Nunca se suman monedas distintas: con más de una moneda la cifra de
 *   cartera pasa a ser el número de cuentas.
 *
 * Una casilla es `null` en los datos cuando su módulo no está activo o la
 * persona no tiene permiso para verla: entonces no se pinta.
 *
 * Logística y Transporte (Figma `03` › Inicio, pantalla C 2919:46236; aprobado
 * el 2026-11-23): «Documentos · 2 vencidos · Renovar», «Despachos · 2 viajes ·
 * Resolver» y «Envíos · 5 atrasados · Ver atrasados». Son avisos: sin nada
 * vencido, bloqueado o atrasado no se pintan. Cada acción abre la pantalla ya
 * filtrada (Flota › Documentos vencidos, Despachos de hoy bloqueados, Por
 * despachar atrasados).
 */
import { RUTAS_LOGISTICA } from '@/lib/logistica/rutas';

/** Páginas de Transporte de las casillas (rutas del catálogo, como `PAGINAS_TRANSPORTE`). */
const PAGINA_VIAJES = '/app/transporte/viajes';
const PAGINA_FLOTA = '/app/transporte/flota';

export type TonoHoy = 'exito' | 'peligro' | 'advertencia' | 'neutro';

export type IdCasillaHoy =
  | 'porCobrar'
  | 'stockCritico'
  | 'pedidosWeb'
  | 'documentosVencidos'
  | 'despachosBloqueados'
  | 'enviosAtrasados'
  | 'reservasStock'
  | 'cajasAnteriores'
  | 'misTareas';

export interface DatosHoy {
  porCobrar: { vencido: number; cuentas: number; diasMasVieja: number; monedas: string[] } | null;
  stock: { bajoMinimo: number; agotados: number } | null;
  /**
   * Pendientes ahora y, de ellos, los que expiran en los próximos
   * `minutos` (criterio de `expire_pending_web_orders`, vía
   * `fn_inicio_pedidos_web_pendientes`). Figma: «3 expiran en menos de 30 min».
   */
  pedidosWeb: { pendientes: number; porExpirar?: number; minutos?: number } | null;
  /**
   * Reservas de stock de la tienda web sin moverse hace más de 24 h
   * («huérfanas», regla de `lib/pos/reservasStock.ts`). Solo es un aviso: sin
   * ninguna no se pinta. Lo que antes mostraba el panel suelto de
   * observabilidad en el inicio.
   */
  reservasStock?: { huerfanas: number; unidades: number } | null;
  cajasAnteriores: { cantidad: number; diasMasVieja: number } | null;
  tareas: { abiertas: number; vencenHoy: number; vencidas: number } | null;
  /**
   * Logística (módulo activo, `logistica.view` y que la persona vea toda la
   * operación): envíos atrasados con la regla de Por despachar (`kpisDespacho`)
   * y el más atrasado.
   */
  logistica?: { atrasados: number; masAtrasado: { numero: string; minutos: number } | null } | null;
  /**
   * Transporte (módulo activo y `transporte.view`): despachos de hoy bloqueados
   * (`estadoDespacho` + `fn_transporte_cumplimiento`) con sus códigos, y
   * documentos vencidos de la flota (`documentosFlota`) con un ejemplo.
   */
  transporte?: {
    bloqueados: number;
    codigos: string[];
    documentosVencidos: number;
    /** `causa`: clave de `transporte.despachos.causas` (se traduce en el cliente). */
    ejemplo: { nombre: string; causa: string } | null;
  } | null;
  /** true si el alcance es una sola sucursal (cambia el texto del detalle de stock). */
  unaSucursal: boolean;
}

/** Texto a traducir: clave bajo `home.hoy` y sus variables ICU. */
export interface TextoHoy {
  clave: string;
  params?: Record<string, string | number>;
}

export type CifraHoy =
  | { tipo: 'moneda'; valor: number; moneda: string }
  | { tipo: 'texto'; texto: TextoHoy };

export interface CasillaHoy {
  id: IdCasillaHoy;
  tono: TonoHoy;
  /** Clave del badge de estado (`home.hoy.estados.*`). */
  estado: 'vencido' | 'critico' | 'urgente' | 'revisar' | 'paraHoy' | 'alDia';
  cifra: CifraHoy;
  detalle: TextoHoy;
  accion: { etiqueta: TextoHoy; href: string };
}

export const MAX_CASILLAS_HOY = 5;

/**
 * Estados de `tasks.status` que cuentan como tarea abierta (en la base:
 * open · in_progress · done · canceled; `todo` por los datos antiguos). Lo
 * comparten el bloque «Hoy» y el panel de empleado.
 */
export const ESTADOS_TAREA_ABIERTA: readonly string[] = ['open', 'in_progress', 'todo'];

/** Orden fijo a igual urgencia. */
const ORDEN: IdCasillaHoy[] = [
  'porCobrar',
  'stockCritico',
  'pedidosWeb',
  'documentosVencidos',
  'despachosBloqueados',
  'enviosAtrasados',
  'reservasStock',
  'cajasAnteriores',
  'misTareas',
];

/** Códigos que se nombran en el detalle de «Despachos» (el resto: «y N más»). */
const MAX_CODIGOS = 2;
const PESO_TONO: Record<TonoHoy, number> = { peligro: 0, advertencia: 1, exito: 2, neutro: 3 };

function casillaPorCobrar(d: NonNullable<DatosHoy['porCobrar']>): CasillaHoy {
  const href = '/app/finanzas/cuentas-por-cobrar';
  if (d.cuentas <= 0 || d.vencido <= 0) {
    return {
      id: 'porCobrar',
      tono: 'neutro',
      estado: 'alDia',
      cifra: { tipo: 'texto', texto: { clave: 'cifras.sinVencidos' } },
      detalle: { clave: 'detalles.carteraAlDia' },
      accion: { etiqueta: { clave: 'acciones.verCartera' }, href },
    };
  }
  const unaMoneda = d.monedas.length <= 1;
  return {
    id: 'porCobrar',
    tono: 'peligro',
    estado: 'vencido',
    cifra: unaMoneda
      ? { tipo: 'moneda', valor: d.vencido, moneda: d.monedas[0] ?? '' }
      : { tipo: 'texto', texto: { clave: 'cifras.cuentas', params: { n: d.cuentas } } },
    detalle: unaMoneda
      ? { clave: 'detalles.cuentasVencidas', params: { n: d.cuentas, dias: d.diasMasVieja } }
      : { clave: 'detalles.variasMonedas', params: { dias: d.diasMasVieja } },
    accion: { etiqueta: { clave: 'acciones.cobrar' }, href },
  };
}

function casillaStock(d: NonNullable<DatosHoy['stock']>, unaSucursal: boolean): CasillaHoy {
  const total = d.bajoMinimo + d.agotados;
  const ambito = unaSucursal ? 'estaSucursal' : 'tusSucursales';
  if (total <= 0) {
    return {
      id: 'stockCritico',
      tono: 'neutro',
      estado: 'alDia',
      cifra: { tipo: 'texto', texto: { clave: 'cifras.sinFaltantes' } },
      detalle: { clave: `detalles.stockAlDia.${ambito}` },
      accion: { etiqueta: { clave: 'acciones.verExistencias' }, href: '/app/inventario/stock' },
    };
  }
  return {
    id: 'stockCritico',
    tono: 'peligro',
    estado: 'critico',
    cifra: { tipo: 'texto', texto: { clave: 'cifras.productos', params: { n: total } } },
    detalle: { clave: `detalles.stockBajo.${ambito}`, params: { agotados: d.agotados } },
    accion: { etiqueta: { clave: 'acciones.reponer' }, href: '/app/inventario/stock?estado=bajo_minimo,agotado' },
  };
}

function casillaPedidosWeb(d: NonNullable<DatosHoy['pedidosWeb']>): CasillaHoy {
  const href = '/app/pos/pedidos-online';
  if (d.pendientes <= 0) {
    return {
      id: 'pedidosWeb',
      tono: 'neutro',
      estado: 'alDia',
      cifra: { tipo: 'texto', texto: { clave: 'cifras.sinPendientes' } },
      detalle: { clave: 'detalles.pedidosAlDia' },
      accion: { etiqueta: { clave: 'acciones.verPedidos' }, href },
    };
  }
  return {
    id: 'pedidosWeb',
    tono: 'advertencia',
    estado: 'urgente',
    cifra: { tipo: 'texto', texto: { clave: 'cifras.pendientes', params: { n: d.pendientes } } },
    // Los que están por expirar son lo accionable (se pierden la venta y la
    // reserva de stock); sin ninguno, el detalle de siempre.
    detalle:
      (d.porExpirar ?? 0) > 0
        ? { clave: 'detalles.pedidosPorExpirar', params: { n: d.porExpirar ?? 0, minutos: d.minutos ?? 30 } }
        : { clave: 'detalles.pedidosSinConfirmar' },
    accion: { etiqueta: { clave: 'acciones.atender' }, href },
  };
}

function casillaReservas(d: NonNullable<DatosHoy['reservasStock']>): CasillaHoy | null {
  // Solo es un aviso: sin reservas huérfanas no se pinta. El detalle
  // (producto, sucursal, desde cuándo) está en el panel de observabilidad de
  // Pedidos online.
  if (d.huerfanas <= 0) return null;
  return {
    id: 'reservasStock',
    tono: 'advertencia',
    estado: 'revisar',
    cifra: { tipo: 'texto', texto: { clave: 'cifras.reservas', params: { n: d.huerfanas } } },
    detalle: { clave: 'detalles.reservasSinMover', params: { unidades: d.unidades } },
    accion: { etiqueta: { clave: 'acciones.revisar' }, href: '/app/pos/pedidos-online' },
  };
}

function casillaCajas(d: NonNullable<DatosHoy['cajasAnteriores']>): CasillaHoy | null {
  // Solo es un aviso: sin cajas abiertas de días anteriores no se pinta.
  if (d.cantidad <= 0) return null;
  return {
    id: 'cajasAnteriores',
    tono: 'advertencia',
    estado: 'revisar',
    cifra: { tipo: 'texto', texto: { clave: 'cifras.cajasAbiertas', params: { n: d.cantidad } } },
    detalle: { clave: 'detalles.cajasDesde', params: { dias: d.diasMasVieja } },
    accion: { etiqueta: { clave: 'acciones.verCajas' }, href: '/app/pos/cajas' },
  };
}

function casillaDocumentos(d: NonNullable<DatosHoy['transporte']>): CasillaHoy | null {
  // Solo es un aviso: sin documentos vencidos no se pinta.
  if (d.documentosVencidos <= 0) return null;
  return {
    id: 'documentosVencidos',
    tono: 'peligro',
    estado: 'vencido',
    cifra: { tipo: 'texto', texto: { clave: 'cifras.vencidos', params: { n: d.documentosVencidos } } },
    detalle: d.ejemplo
      ? { clave: 'detalles.documentoEjemplo', params: { causa: d.ejemplo.causa, nombre: d.ejemplo.nombre, mas: d.documentosVencidos - 1 } }
      : { clave: 'detalles.documentosVencidos' },
    accion: { etiqueta: { clave: 'acciones.renovar' }, href: `${PAGINA_FLOTA}?estado=vencido` },
  };
}

function casillaDespachos(d: NonNullable<DatosHoy['transporte']>): CasillaHoy | null {
  // Solo es un aviso: sin despachos bloqueados no se pinta.
  if (d.bloqueados <= 0) return null;
  const nombrados = d.codigos.slice(0, MAX_CODIGOS);
  return {
    id: 'despachosBloqueados',
    tono: 'peligro',
    estado: 'critico',
    cifra: { tipo: 'texto', texto: { clave: 'cifras.viajes', params: { n: d.bloqueados } } },
    detalle:
      nombrados.length > 0
        ? { clave: 'detalles.noPuedenSalir', params: { codigos: nombrados.join(' · '), n: d.bloqueados, mas: Math.max(0, d.bloqueados - nombrados.length) } }
        : { clave: 'detalles.despachosBloqueados' },
    accion: { etiqueta: { clave: 'acciones.resolver' }, href: `${PAGINA_VIAJES}?pestana=despachos&estado=bloqueado` },
  };
}

function casillaAtrasados(d: NonNullable<DatosHoy['logistica']>): CasillaHoy | null {
  // Solo es un aviso: sin envíos atrasados no se pinta.
  if (d.atrasados <= 0) return null;
  return {
    id: 'enviosAtrasados',
    tono: 'peligro',
    estado: 'urgente',
    cifra: { tipo: 'texto', texto: { clave: 'cifras.atrasados', params: { n: d.atrasados } } },
    detalle: d.masAtrasado
      ? { clave: 'detalles.masAtrasado', params: { numero: d.masAtrasado.numero, minutos: d.masAtrasado.minutos } }
      : { clave: 'detalles.enviosAtrasados' },
    accion: { etiqueta: { clave: 'acciones.verAtrasados' }, href: `${RUTAS_LOGISTICA.porDespachar}?atrasados=1` },
  };
}

function casillaTareas(d: NonNullable<DatosHoy['tareas']>): CasillaHoy {
  const href = '/app/pm/tareas';
  const pendientesHoy = d.vencenHoy + d.vencidas;
  const detalle: TextoHoy =
    d.vencidas > 0
      ? { clave: 'detalles.tareasVencidas', params: { n: d.vencidas, hoy: d.vencenHoy } }
      : d.vencenHoy > 0
        ? { clave: 'detalles.tareasHoy', params: { n: d.vencenHoy } }
        : { clave: 'detalles.tareasSinVencer' };
  return {
    id: 'misTareas',
    tono: pendientesHoy > 0 ? 'advertencia' : 'neutro',
    estado: pendientesHoy > 0 ? 'paraHoy' : 'alDia',
    cifra: { tipo: 'texto', texto: { clave: 'cifras.abiertas', params: { n: d.abiertas } } },
    detalle,
    accion: { etiqueta: { clave: 'acciones.abrir' }, href },
  };
}

/** Casillas a pintar, ya ordenadas por urgencia y con el tope de cinco. */
export function casillasHoy(datos: DatosHoy): CasillaHoy[] {
  const candidatas: (CasillaHoy | null)[] = [
    datos.porCobrar ? casillaPorCobrar(datos.porCobrar) : null,
    datos.stock ? casillaStock(datos.stock, datos.unaSucursal) : null,
    datos.pedidosWeb ? casillaPedidosWeb(datos.pedidosWeb) : null,
    datos.transporte ? casillaDocumentos(datos.transporte) : null,
    datos.transporte ? casillaDespachos(datos.transporte) : null,
    datos.logistica ? casillaAtrasados(datos.logistica) : null,
    datos.reservasStock ? casillaReservas(datos.reservasStock) : null,
    datos.cajasAnteriores ? casillaCajas(datos.cajasAnteriores) : null,
    datos.tareas ? casillaTareas(datos.tareas) : null,
  ];
  return candidatas
    .filter((c): c is CasillaHoy => c !== null)
    .sort((a, b) => PESO_TONO[a.tono] - PESO_TONO[b.tono] || ORDEN.indexOf(a.id) - ORDEN.indexOf(b.id))
    .slice(0, MAX_CASILLAS_HOY);
}

/** «N cosas por atender»: las casillas que no están al día. */
export function cosasPorAtender(casillas: readonly CasillaHoy[]): number {
  return casillas.filter((c) => c.tono !== 'neutro' && c.tono !== 'exito').length;
}

/** Entero ≥ 0 a partir de lo que llegue de la base (numeric como texto, null…). */
export function enteroNoNegativo(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Días completos entre un instante y `ahora` (0 si es futuro o inválido).
 * Para «abierta desde hace N días»: no depende del día calendario.
 */
export function diasDesde(instante: string | null | undefined, ahora: Date): number {
  if (!instante) return 0;
  const t = new Date(instante).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((ahora.getTime() - t) / 86_400_000));
}
