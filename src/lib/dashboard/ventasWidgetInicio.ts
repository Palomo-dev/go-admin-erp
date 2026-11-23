/**
 * Widget «Ventas» del inicio (Figma `03` › Inicio, 2916:44653 desplegado,
 * 2922:48296 sin datos, 2922:48492 al día; aprobado el 2026-11-23).
 *
 * Todos los canales (POS, tienda web, menú QR y manual): ventas de hoy y del
 * periodo, ticket, pedidos por atender, por canal, por sede (solo con «Todas
 * las sucursales» y más de una sede), últimas ventas de hoy con su canal y los
 * accesos «Abrir POS» y «Nuevo pedido manual».
 *
 * Regla pura. Las cifras ya llegan calculadas: `fn_inicio_ventas_widget` (sobre
 * la regla única de «Todas las ventas», `pos_ventas_filtradas`) y el listado de
 * `pos_ventas_listado_v2`. Aquí solo se arma lo que pinta el panel.
 */
import type { CanalVenta } from '@/lib/pos/ventas/canalVenta';
import { esCanalVenta } from '@/lib/pos/ventas/canalVenta';
import type { EstadoVenta } from '@/lib/pos/ventas/estadoVenta';
import type { FilaVenta } from '@/lib/pos/ventas/listadoServidor';
import type { CifraModulo, TonoModulo } from './resumenModulos';
import {
  entero,
  numero,
  porcentajes,
  variacionPct,
  type AccionWidget,
  type DesgloseWidget,
  type EstadoWidget,
  type FilaWidget,
  type KpiWidget,
  type SegmentoFila,
} from './widgetsInicio';

/** Lo que devuelve `fn_inicio_ventas_widget`. */
export interface CrudoVentasWidget {
  moneda?: string;
  periodo?: { ventas?: unknown; efectivas?: unknown; ticket_promedio?: unknown };
  anterior?: { ventas?: unknown; efectivas?: unknown } | null;
  hoy?: { ventas?: unknown; efectivas?: unknown } | null;
  semana?: { ventas?: unknown; efectivas?: unknown } | null;
  por_canal?: Array<{ canal?: unknown; ventas?: unknown; efectivas?: unknown }>;
  por_sede?: Array<{ id?: unknown; nombre?: unknown; ventas?: unknown; efectivas?: unknown }>;
  sucursales?: unknown;
  pedidos?: { pendientes?: unknown; por_expirar?: unknown; expiran_hoy?: unknown; minutos?: unknown } | null;
  hay_ventas?: unknown;
}

/** Páginas del módulo Ventas que usa el widget (rutas del catálogo, `catalog.ts`). */
export const PAGINAS_VENTAS = {
  ventas: '/app/pos/ventas',
  pos: '/app/pos',
  pedidosOnline: '/app/pos/pedidos-online',
  cajas: '/app/pos/cajas',
} as const;

/** Detalle de una venta (ruta del módulo; se ofrece solo si la persona ve «Todas las ventas»). */
export const rutaVenta = (id: string) => `${PAGINAS_VENTAS.ventas}/${encodeURIComponent(id)}`;

export interface FilaVentaReciente {
  id: string;
  /** Instante de la venta (se pinta en la zona de la organización). */
  fecha: string;
  numero: string | null;
  canal: CanalVenta;
  cliente: string | null;
  sucursal: string | null;
  mesa: string | null;
  metodos: string[];
  estado: EstadoVenta;
  total: CifraModulo;
  href: string | null;
}

export interface VentasInicio {
  estado: EstadoWidget;
  fila: FilaWidget;
  kpis: KpiWidget[];
  /** Últimas ventas de hoy (máximo 5) y cuántas efectivas hubo hoy. */
  ultimas: FilaVentaReciente[];
  ventasHoy: number;
  porCanal: DesgloseWidget | null;
  porSede: DesgloseWidget | null;
  acciones: AccionWidget[];
  /** Cajas abiertas (lo que ya mostraba la fila de Ventas): no se pierde. */
  cajas: { abiertas: number; anteriores: number; href: string | null } | null;
  hrefVentas: string | null;
}

export interface EntradaVentas {
  crudo: CrudoVentasWidget;
  ultimas: readonly FilaVenta[];
  monedaBase: string;
  /** ¿El periodo elegido es «hoy»? Entonces no se repite la cifra en la fila. */
  periodoEsHoy: boolean;
  /** Sede elegida en la cabecera (null = todas). */
  sucursal: number | null;
  /** Cajas de la regla `pos` de `fn_inicio_modulos_resumen` (no se recalculan). */
  cajas: { abiertas: number; anteriores: number };
  href: (pagina: string) => string | null;
}

const ORDEN_CANAL: readonly CanalVenta[] = ['pos', 'tienda_web', 'menu_qr', 'marketplace', 'manual'];

function moneda(valor: unknown, m: string): CifraModulo {
  return { tipo: 'moneda', valor: numero(valor), moneda: m };
}

export function armarVentas(e: EntradaVentas): VentasInicio {
  const c = e.crudo ?? {};
  const m = (typeof c.moneda === 'string' && c.moneda.trim() ? c.moneda : e.monedaBase).toUpperCase();
  const hayVentas = c.hay_ventas === true;
  const hoyVentas = numero(c.hoy?.ventas);
  const hoyN = entero(c.hoy?.efectivas);
  const semana = c.semana ? numero(c.semana.ventas) : null;
  const periodo = numero(c.periodo?.ventas);
  const periodoN = entero(c.periodo?.efectivas);
  const ticket = numero(c.periodo?.ticket_promedio);
  const anterior = c.anterior ? numero(c.anterior.ventas) : null;
  const pendientes = entero(c.pedidos?.pendientes);
  const porExpirar = entero(c.pedidos?.por_expirar);
  const hrefPedidos = e.href(PAGINAS_VENTAS.pedidosOnline);
  const hrefVentas = e.href(PAGINAS_VENTAS.ventas);

  const canales = (c.por_canal ?? [])
    .filter((x) => esCanalVenta(x.canal) && numero(x.ventas) > 0)
    .map((x) => ({ canal: x.canal as CanalVenta, ventas: numero(x.ventas) }))
    .sort((a, b) => b.ventas - a.ventas || ORDEN_CANAL.indexOf(a.canal) - ORDEN_CANAL.indexOf(b.canal));
  const pctCanal = porcentajes(canales.map((x) => x.ventas));
  const porCanal: DesgloseWidget | null =
    canales.length > 0
      ? {
          id: 'porCanal',
          titulo: { clave: 'ventas.porCanal' },
          total: moneda(periodo, m),
          tramos: canales.map((x, i) => ({ id: x.canal, etiqueta: { clave: `canales.${x.canal}` }, cifra: moneda(x.ventas, m), porcentaje: pctCanal[i] })),
        }
      : null;

  // «Ventas por sede» solo con «Todas las sucursales» y más de una sede (Regla 3 del Figma).
  const sedes = (c.por_sede ?? [])
    .filter((x) => numero(x.ventas) > 0)
    .map((x) => ({ id: String(x.id ?? ''), nombre: typeof x.nombre === 'string' ? x.nombre : '', ventas: numero(x.ventas) }));
  const pctSede = porcentajes(sedes.map((x) => x.ventas));
  const porSede: DesgloseWidget | null =
    e.sucursal === null && entero(c.sucursales) > 1 && sedes.length > 1
      ? {
          id: 'porSede',
          titulo: { clave: 'ventas.porSede' },
          total: moneda(periodo, m),
          tramos: sedes.map((x, i) => ({ id: `sede-${x.id}`, etiqueta: { nombre: x.nombre }, cifra: moneda(x.ventas, m), porcentaje: pctSede[i] })),
        }
      : null;

  const kpis: KpiWidget[] = [
    {
      id: 'hoy',
      etiqueta: { clave: 'ventas.kpis.hoy' },
      cifra: moneda(hoyVentas, m),
      detalle:
        hoyN === 0
          ? { clave: 'ventas.detalles.hoySinVentas' }
          : semana !== null && semana > 0
            ? { clave: 'ventas.detalles.hoyVsSemana', params: { n: hoyN } }
            : { clave: 'ventas.detalles.ventas', params: { n: hoyN } },
      delta: semana !== null ? variacionPct(hoyVentas, semana) : null,
      href: hrefVentas,
    },
    {
      id: 'periodo',
      etiqueta: { clave: 'ventas.kpis.periodo' },
      cifra: moneda(periodo, m),
      detalle: { clave: 'ventas.detalles.periodo', params: { n: periodoN } },
      delta: anterior !== null ? variacionPct(periodo, anterior) : null,
      href: hrefVentas,
    },
    {
      id: 'ticket',
      etiqueta: { clave: 'ventas.kpis.ticket' },
      cifra: moneda(ticket, m),
      detalle: { clave: 'ventas.detalles.ticket', params: { n: periodoN } },
    },
    {
      id: 'porAtender',
      etiqueta: { clave: 'ventas.kpis.porAtender' },
      cifra: { tipo: 'texto', texto: { clave: 'ventas.detalles.pedidos', params: { n: pendientes } } },
      detalle:
        pendientes === 0
          ? { clave: 'ventas.detalles.ningunPedido' }
          : porExpirar > 0
            ? { clave: 'ventas.detalles.porExpirar', params: { n: porExpirar, minutos: entero(c.pedidos?.minutos) || 30 } }
            : { clave: 'ventas.detalles.pedidosEsperando' },
      tono: pendientes > 0 ? 'advertencia' : 'neutro',
      href: pendientes > 0 ? hrefPedidos : null,
    },
  ];

  const ultimas: FilaVentaReciente[] = e.ultimas.slice(0, 5).map((f) => ({
    id: f.id,
    fecha: f.fecha,
    numero: f.numero,
    canal: esCanalVenta(f.canal) ? f.canal : 'pos',
    cliente: f.cliente?.nombre ?? null,
    sucursal: f.sucursal?.nombre ?? null,
    mesa: f.mesa ?? null,
    metodos: Array.isArray(f.metodos) ? f.metodos : [],
    estado: f.estado,
    total: moneda(f.total, m),
    href: hrefVentas ? rutaVenta(f.id) : null,
  }));

  const acciones: AccionWidget[] = [];
  const hrefPos = e.href(PAGINAS_VENTAS.pos);
  if (hrefPos) acciones.push({ id: 'abrirPos', etiqueta: { clave: 'ventas.acciones.abrirPos' }, href: hrefPos, principal: true });
  // «Nuevo pedido manual» se ofrece a quien ve Pedidos online (el servidor vuelve a validar el permiso).
  if (hrefPedidos) acciones.push({ id: 'pedidoManual', etiqueta: { clave: 'ventas.acciones.pedidoManual' }, href: null, dialogo: 'pedidoManual' });

  const abiertas = entero(e.cajas.abiertas);
  const anteriores = entero(e.cajas.anteriores);
  const cajas = abiertas > 0 ? { abiertas, anteriores, href: e.href(PAGINAS_VENTAS.cajas) } : null;

  const estado: EstadoWidget = !hayVentas ? 'sinDatos' : pendientes > 0 || anteriores > 0 ? 'atencion' : 'alDia';

  let tono: TonoModulo;
  let badge: FilaWidget['badge'];
  if (!hayVentas) {
    tono = 'neutro';
    badge = { clave: 'comun.sinDatos' };
  } else if (pendientes > 0) {
    tono = 'advertencia';
    badge = { clave: 'ventas.fila.porAtender', params: { n: pendientes } };
  } else if (anteriores > 0) {
    tono = 'advertencia';
    badge = { clave: 'ventas.fila.cajasAntiguas', params: { n: anteriores } };
  } else {
    tono = 'exito';
    badge = { clave: 'comun.alDia' };
  }

  const resumen: SegmentoFila[] = !hayVentas
    ? [{ clave: 'ventas.fila.sinVentas' }]
    : [
        { clave: 'ventas.fila.ventasHoy', params: { n: hoyN } },
        { clave: 'ventas.fila.monto', cifra: moneda(hoyVentas, m) },
        ...(e.periodoEsHoy ? [] : [{ clave: 'ventas.fila.periodo', cifra: moneda(periodo, m) }]),
        ...(canales.length > 1 ? [{ clave: 'ventas.fila.canales', params: { n: canales.length } }] : []),
      ];

  return {
    estado,
    fila: { tono, badge, resumen },
    kpis,
    ultimas,
    ventasHoy: hoyN,
    porCanal,
    porSede,
    acciones,
    cajas,
    hrefVentas,
  };
}
