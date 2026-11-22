// ============================================================
// Armado puro de los reportes de ventas ampliados (Figma «14 Reportes»,
// sección 2733:51399): convierte el jsonb de las RPC en KPI, tabla principal
// y pestañas. Sin Supabase: los nombres llegan resueltos en `NombresVentas`,
// así las pruebas simulan la RPC y fijan la forma.
//
// RPC: `fn_reporte_ventas_personas`, `fn_reporte_mas_vendido`,
// `fn_reporte_items_vendidos`, `fn_reporte_ventas_resumen` y
// `fn_reporte_ventas_por_hora` (migración 20261122075104).
// ============================================================

import type { ContarPor } from '../filtrosVentas';
import { etiquetaFranja, fechaHoraLocal } from '../formatoVentas';
import type { LecturaReporte, ReporteColumna, ReporteKPI, VistaReporte } from '../types';

type Num = number | string | null | undefined;
type Fila = Record<string, unknown>;

/** Texto de la persona cuando la venta no tiene (p. ej. sin mesero). */
export const SIN_ASIGNAR = 'Sin asignar';

export interface NombresVentas {
  /** Nombre de la persona; `SIN_ASIGNAR` si el id es null. */
  persona: (id: string | null | undefined) => string;
  /** Rol de la persona en la organización, o «—». */
  rol: (id: string | null | undefined) => string;
  /** Nombre de la sede, o «Sin sede». */
  sede: (id: number | string | null | undefined) => string;
  /** Nombre legible del método de pago (`payment_methods.name`) o el código. */
  metodo: (codigo: string | null | undefined) => string;
}

const n = (v: Num): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r2 = (x: number) => Math.round(x * 100) / 100;
const r1 = (x: number) => Math.round(x * 10) / 10;
const pct = (parte: number, total: number) => (total > 0 ? r1((parte / total) * 100) : 0);
const ticket = (total: number, ventas: number) => (ventas > 0 ? r2(total / ventas) : 0);
const clavePersona = (id: string | null | undefined) => id ?? '';

/** Encabezado de la columna de persona según «Contar por». */
export function tituloPersona(contarPor: ContarPor): string {
  return contarPor === 'vendedor' ? 'Vendedor' : contarPor === 'mesero' ? 'Mesero' : 'Cajero';
}

// ── Respuestas de las RPC ────────────────────────────────────────────────

export interface RespuestaVentasPersonas {
  totales?: { total?: Num; num_ventas?: Num; descuentos?: Num; propinas?: Num } | null;
  por_persona?: Array<{ persona_id: string | null; sucursal_id: number | null; sedes: Num; num_ventas: Num; total: Num; descuentos: Num; propinas: Num }> | null;
  por_metodo?: Array<{ persona_id: string | null; metodo: string | null; monto: Num; pagos: Num }> | null;
  por_dia?: Array<{ persona_id: string | null; fecha: string; total: Num; num_ventas: Num }> | null;
  por_hora?: Array<{ persona_id: string | null; hora: Num; total: Num; num_ventas: Num }> | null;
  devoluciones?: Num;
}

export interface RespuestaMasVendido {
  totales?: { unidades?: Num; ingreso?: Num; productos?: Num } | null;
  por_producto?: Array<{ producto_id: number | null; producto: string | null; sku: string | null; categoria: string | null; unidades: Num; ingreso: Num }> | null;
  por_hora?: Array<{ hora: Num; puesto: Num; producto_id: number | null; producto: string | null; categoria: string | null; unidades: Num; ingreso: Num; total_franja: Num }> | null;
  por_sede?: Array<{ sucursal_id: number | null; puesto: Num; producto_id: number | null; producto: string | null; categoria: string | null; unidades: Num; ingreso: Num; total_sede: Num }> | null;
}

export interface LineaItemVendido {
  fecha: string | null;
  venta_id: string | null;
  factura: string | null;
  producto_id: number | null;
  producto: string | null;
  sku: string | null;
  cantidad: Num;
  precio: Num;
  descuento: Num;
  impuesto: Num;
  total: Num;
  persona_id: string | null;
  sucursal_id: number | null;
}

export interface RespuestaItemsVendidos {
  totales?: { lineas?: Num; cantidad?: Num; descuento?: Num; impuesto?: Num; total?: Num } | null;
  lineas?: LineaItemVendido[] | null;
  por_persona?: Array<{ persona_id: string | null; lineas: Num; descuento: Num; total: Num }> | null;
  limite?: Num;
}

export interface RespuestaVentasResumen {
  por_sucursal?: Array<{ sucursal_id: number | null; total: Num; num_ventas: Num }> | null;
  por_dia?: Array<{ fecha: string; total: Num; num_ventas: Num }> | null;
  total_ventas?: Num;
  num_ventas?: Num;
}

export interface RespuestaVentasPorHora {
  por_hora?: Array<{ hora: Num; total: Num; num_ventas: Num }> | null;
  por_hora_sede?: Array<{ hora: Num; sucursal_id: number | null; total: Num; num_ventas: Num }> | null;
  zona?: string | null;
}

/** Lo que arma cada reporte; el módulo le pone id, título, periodo y fecha. */
export interface ArmadoReporte {
  kpis: ReporteKPI[];
  columnas: ReporteColumna[];
  filas: Fila[];
  totales?: Fila;
  vistaPrincipal?: string;
  vistas?: VistaReporte[];
  lectura?: LecturaReporte[];
}

/** Ids de persona, sede y método que aparecen en las respuestas (para resolver los nombres). */
export function idsDeVentas(...respuestas: Array<RespuestaVentasPersonas | RespuestaItemsVendidos | RespuestaMasVendido | RespuestaVentasResumen | RespuestaVentasPorHora | null | undefined>): {
  personas: string[];
  sedes: number[];
  metodos: boolean;
} {
  const personas = new Set<string>();
  const sedes = new Set<number>();
  let metodos = false;
  const persona = (id: unknown) => {
    if (typeof id === 'string' && id) personas.add(id);
  };
  const sede = (id: unknown) => {
    const x = Number(id);
    if (id !== null && id !== undefined && Number.isFinite(x) && x > 0) sedes.add(x);
  };
  for (const r of respuestas) {
    if (!r) continue;
    const o = r as Record<string, unknown>;
    for (const clave of ['por_persona', 'por_metodo', 'por_dia', 'por_hora', 'lineas', 'por_sede', 'por_sucursal', 'por_hora_sede']) {
      const lista = o[clave];
      if (!Array.isArray(lista)) continue;
      for (const f of lista as Fila[]) {
        persona(f.persona_id);
        sede(f.sucursal_id);
      }
      if (clave === 'por_metodo' && lista.length > 0) metodos = true;
    }
  }
  return { personas: Array.from(personas), sedes: Array.from(sedes), metodos };
}

// ── Ventas por persona ───────────────────────────────────────────────────

interface PersonaResumen {
  id: string | null;
  persona: string;
  rol: string;
  sede: string;
  num_ventas: number;
  total: number;
  descuentos: number;
  propinas: number;
}

function personasDe(d: RespuestaVentasPersonas, nombres: NombresVentas): PersonaResumen[] {
  return (d.por_persona ?? [])
    .map((p) => ({
      id: p.persona_id,
      persona: nombres.persona(p.persona_id),
      rol: p.persona_id ? nombres.rol(p.persona_id) : '—',
      sede: n(p.sedes) > 1 ? 'Varias' : nombres.sede(p.sucursal_id),
      num_ventas: n(p.num_ventas),
      total: n(p.total),
      descuentos: n(p.descuentos),
      propinas: n(p.propinas),
    }))
    .sort((a, b) => b.total - a.total);
}

const COLS_FRANJA: ReporteColumna = { key: 'franja', titulo: 'Franja', tipo: 'texto' };

/** Franja × persona: las 10 personas que más vendieron en columnas y el resto en «Otras personas». */
function vistaPorHoraPersona(d: RespuestaVentasPersonas, personas: PersonaResumen[]): VistaReporte {
  const MAX = 10;
  const columnaDe = new Map<string, string>();
  personas.slice(0, MAX).forEach((p, i) => columnaDe.set(clavePersona(p.id), `p${i}`));
  const hayOtras = personas.length > MAX;
  const columnas: ReporteColumna[] = [
    COLS_FRANJA,
    ...personas.slice(0, MAX).map((p, i): ReporteColumna => ({ key: `p${i}`, titulo: p.persona, tipo: 'moneda', alinear: 'right' })),
    ...(hayOtras ? [{ key: 'otras', titulo: 'Otras personas', tipo: 'moneda', alinear: 'right' } as ReporteColumna] : []),
    { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
  ];
  const porHora = new Map<number, Fila>();
  const totales: Fila = { total: 0 };
  for (const h of d.por_hora ?? []) {
    const hora = n(h.hora);
    const fila = porHora.get(hora) ?? { hora, franja: etiquetaFranja(hora), total: 0 };
    const col = columnaDe.get(clavePersona(h.persona_id)) ?? 'otras';
    fila[col] = r2(n(fila[col] as Num) + n(h.total));
    fila.total = r2(n(fila.total as Num) + n(h.total));
    totales[col] = r2(n(totales[col] as Num) + n(h.total));
    totales.total = r2(n(totales.total as Num) + n(h.total));
    porHora.set(hora, fila);
  }
  const filas = Array.from(porHora.values()).sort((a, b) => n(a.hora as Num) - n(b.hora as Num));
  return { id: 'por-hora', titulo: 'Por hora', columnas, filas, totales };
}

/** Persona × método de pago (lo cobrado), una columna por método presente. */
function vistaMetodosPersona(d: RespuestaVentasPersonas, nombres: NombresVentas, personas: PersonaResumen[]): VistaReporte {
  const porMetodo = new Map<string, number>();
  for (const m of d.por_metodo ?? []) porMetodo.set(m.metodo ?? 'otro', (porMetodo.get(m.metodo ?? 'otro') ?? 0) + n(m.monto));
  const metodos = Array.from(porMetodo.entries()).sort((a, b) => b[1] - a[1]).map(([codigo]) => codigo);
  const sedeDe = new Map(personas.map((p) => [clavePersona(p.id), p.sede]));
  const filasPorPersona = new Map<string, Fila>();
  const totales: Fila = { total: 0 };
  for (const m of d.por_metodo ?? []) {
    const clave = clavePersona(m.persona_id);
    const col = `m_${m.metodo ?? 'otro'}`;
    const fila = filasPorPersona.get(clave) ?? { persona: nombres.persona(m.persona_id), sede: sedeDe.get(clave) ?? '—', total: 0 };
    fila[col] = r2(n(fila[col] as Num) + n(m.monto));
    fila.total = r2(n(fila.total as Num) + n(m.monto));
    totales[col] = r2(n(totales[col] as Num) + n(m.monto));
    totales.total = r2(n(totales.total as Num) + n(m.monto));
    filasPorPersona.set(clave, fila);
  }
  return {
    id: 'metodos',
    titulo: 'Métodos de pago',
    columnas: [
      { key: 'persona', titulo: 'Persona', tipo: 'texto' },
      { key: 'sede', titulo: 'Sede', tipo: 'texto' },
      ...metodos.map((codigo): ReporteColumna => ({ key: `m_${codigo}`, titulo: nombres.metodo(codigo === 'otro' ? null : codigo), tipo: 'moneda', alinear: 'right' })),
      { key: 'total', titulo: 'Total recibido', tipo: 'moneda', alinear: 'right' },
    ],
    filas: Array.from(filasPorPersona.values()).sort((a, b) => n(b.total as Num) - n(a.total as Num)),
    totales,
  };
}

/** «Ventas por persona» (`ventas-vendedor`). */
export function armarVentasPorPersona(d: RespuestaVentasPersonas, nombres: NombresVentas, contarPor: ContarPor): ArmadoReporte {
  const personas = personasDe(d, nombres);
  const total = n(d.totales?.total);
  const numVentas = n(d.totales?.num_ventas);
  const descuentos = n(d.totales?.descuentos);

  const filas = personas.map((p) => ({
    persona: p.persona,
    rol: p.rol,
    sede: p.sede,
    num_ventas: p.num_ventas,
    total: p.total,
    descuentos: p.descuentos,
    ticket_promedio: ticket(p.total, p.num_ventas),
    participacion: pct(p.total, total),
  }));

  const porDia = (d.por_dia ?? [])
    .map((x) => ({ fecha: x.fecha, persona: nombres.persona(x.persona_id), num_ventas: n(x.num_ventas), total: n(x.total) }))
    .sort((a, b) => (a.fecha === b.fecha ? b.total - a.total : a.fecha < b.fecha ? -1 : 1));

  const lectura: LecturaReporte[] = [];
  const sinPersona = personas.find((p) => p.id === null);
  if (sinPersona && contarPor === 'mesero') {
    lectura.push({ tono: 'info', texto: `${sinPersona.num_ventas} ${sinPersona.num_ventas === 1 ? 'venta no tiene' : 'ventas no tienen'} mesero asignado; ${sinPersona.num_ventas === 1 ? 'sale' : 'salen'} como «${SIN_ASIGNAR}».` });
  }

  return {
    kpis: [
      { titulo: 'Total vendido', valor: total, formato: 'moneda' },
      { titulo: 'N.º de ventas', valor: numVentas, formato: 'numero' },
      { titulo: 'Ticket promedio', valor: ticket(total, numVentas), formato: 'moneda' },
      { titulo: 'Descuentos dados', valor: descuentos, formato: 'moneda' },
      { titulo: 'Persona con más ventas', valor: personas[0]?.persona ?? '—' },
    ],
    columnas: [
      { key: 'persona', titulo: tituloPersona(contarPor), tipo: 'texto' },
      { key: 'rol', titulo: 'Rol', tipo: 'texto' },
      { key: 'sede', titulo: 'Sede', tipo: 'texto' },
      { key: 'num_ventas', titulo: 'N.º ventas', tipo: 'numero', alinear: 'right' },
      { key: 'total', titulo: 'Vendido', tipo: 'moneda', alinear: 'right' },
      { key: 'descuentos', titulo: 'Descuentos', tipo: 'moneda', alinear: 'right' },
      { key: 'ticket_promedio', titulo: 'Ticket promedio', tipo: 'moneda', alinear: 'right' },
      { key: 'participacion', titulo: '% participación', tipo: 'porcentaje', alinear: 'right' },
    ],
    filas,
    totales: { num_ventas: numVentas, total, descuentos, ticket_promedio: ticket(total, numVentas), participacion: total > 0 ? 100 : 0 },
    vistaPrincipal: 'Resumen',
    vistas: [
      vistaMetodosPersona(d, nombres, personas),
      {
        id: 'por-dia',
        titulo: 'Por día',
        columnas: [
          { key: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
          { key: 'persona', titulo: tituloPersona(contarPor), tipo: 'texto' },
          { key: 'num_ventas', titulo: 'N.º ventas', tipo: 'numero', alinear: 'right' },
          { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
        ],
        filas: porDia,
        totales: { num_ventas: numVentas, total },
      },
      vistaPorHoraPersona(d, personas),
    ],
    lectura,
  };
}

// ── Resumen general del punto de venta ───────────────────────────────────

/**
 * «Resumen general del punto de venta» (`ventas-periodo`). La sede sale del
 * resumen (`fn_reporte_ventas_resumen`, que no filtra por persona ni método);
 * lo demás de `fn_reporte_ventas_personas`, que sí. `filtrado` = hay persona o
 * métodos elegidos: la lectura lo avisa para que la pestaña por sede no engañe.
 */
export function armarResumenPuntoVenta(
  resumen: RespuestaVentasResumen,
  d: RespuestaVentasPersonas,
  nombres: NombresVentas,
  contarPor: ContarPor,
  filtrado: boolean,
): ArmadoReporte {
  const total = n(d.totales?.total);
  const numVentas = n(d.totales?.num_ventas);
  const descuentos = n(d.totales?.descuentos);
  const propinas = n(d.totales?.propinas);
  const personas = personasDe(d, nombres);

  const porSede = (resumen.por_sucursal ?? [])
    .map((s) => ({
      sucursal: s.sucursal_id ? nombres.sede(s.sucursal_id) : 'Sin sede',
      num_ventas: n(s.num_ventas),
      total: n(s.total),
      ticket_promedio: ticket(n(s.total), n(s.num_ventas)),
    }))
    .sort((a, b) => b.total - a.total);

  const metodos = new Map<string, { pagos: number; monto: number }>();
  for (const m of d.por_metodo ?? []) {
    const clave = m.metodo ?? 'otro';
    const acc = metodos.get(clave) ?? { pagos: 0, monto: 0 };
    acc.pagos += n(m.pagos);
    acc.monto = r2(acc.monto + n(m.monto));
    metodos.set(clave, acc);
  }
  const totalCobrado = Array.from(metodos.values()).reduce((s, m) => s + m.monto, 0);

  const dias = new Map<string, { num_ventas: number; total: number }>();
  for (const x of d.por_dia ?? []) {
    const acc = dias.get(x.fecha) ?? { num_ventas: 0, total: 0 };
    acc.num_ventas += n(x.num_ventas);
    acc.total = r2(acc.total + n(x.total));
    dias.set(x.fecha, acc);
  }

  const lectura: LecturaReporte[] = [];
  if (filtrado) {
    lectura.push({ tono: 'info', texto: 'La pestaña «Por sede» muestra todas las ventas de cada sede: no aplica los filtros de persona ni de método de pago. Los indicadores y las demás pestañas sí.' });
  }
  if (propinas > 0) lectura.push({ tono: 'info', texto: 'Las propinas se muestran aparte: no suman al total vendido.' });

  return {
    kpis: [
      { titulo: 'Total vendido', valor: total, formato: 'moneda' },
      { titulo: 'N.º ventas', valor: numVentas, formato: 'numero' },
      { titulo: 'Ticket promedio', valor: ticket(total, numVentas), formato: 'moneda' },
      { titulo: 'Descuentos', valor: descuentos, formato: 'moneda' },
      { titulo: 'Devoluciones', valor: n(d.devoluciones), formato: 'moneda' },
      { titulo: 'Propinas', valor: propinas, formato: 'moneda' },
    ],
    columnas: [
      { key: 'sucursal', titulo: 'Sede', tipo: 'texto' },
      { key: 'num_ventas', titulo: 'N.º ventas', tipo: 'numero', alinear: 'right' },
      { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
      { key: 'ticket_promedio', titulo: 'Ticket promedio', tipo: 'moneda', alinear: 'right' },
    ],
    filas: porSede,
    totales: {
      num_ventas: porSede.reduce((s, f) => s + f.num_ventas, 0),
      total: r2(porSede.reduce((s, f) => s + f.total, 0)),
    },
    vistaPrincipal: 'Por sede',
    vistas: [
      {
        id: 'por-persona',
        titulo: 'Por persona',
        columnas: [
          { key: 'persona', titulo: tituloPersona(contarPor), tipo: 'texto' },
          { key: 'rol', titulo: 'Rol', tipo: 'texto' },
          { key: 'sede', titulo: 'Sede', tipo: 'texto' },
          { key: 'num_ventas', titulo: 'N.º ventas', tipo: 'numero', alinear: 'right' },
          { key: 'total', titulo: 'Vendido', tipo: 'moneda', alinear: 'right' },
          { key: 'descuentos', titulo: 'Descuentos', tipo: 'moneda', alinear: 'right' },
          { key: 'neto', titulo: 'Neto', tipo: 'moneda', alinear: 'right' },
        ],
        filas: personas.map((p) => ({ persona: p.persona, rol: p.rol, sede: p.sede, num_ventas: p.num_ventas, total: p.total, descuentos: p.descuentos, neto: r2(p.total - p.descuentos) })),
        totales: { num_ventas: numVentas, total, descuentos, neto: r2(total - descuentos) },
      },
      {
        id: 'metodos',
        titulo: 'Métodos de pago',
        columnas: [
          { key: 'metodo', titulo: 'Método', tipo: 'texto' },
          { key: 'pagos', titulo: 'N.º pagos', tipo: 'numero', alinear: 'right' },
          { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
          { key: 'participacion', titulo: '%', tipo: 'porcentaje', alinear: 'right' },
        ],
        filas: Array.from(metodos.entries())
          .sort((a, b) => b[1].monto - a[1].monto)
          .map(([codigo, m]) => ({ metodo: nombres.metodo(codigo === 'otro' ? null : codigo), pagos: m.pagos, monto: m.monto, participacion: pct(m.monto, totalCobrado) })),
        totales: { pagos: Array.from(metodos.values()).reduce((s, m) => s + m.pagos, 0), monto: r2(totalCobrado), participacion: totalCobrado > 0 ? 100 : 0 },
      },
      {
        id: 'descuentos',
        titulo: 'Descuentos',
        columnas: [
          { key: 'persona', titulo: tituloPersona(contarPor), tipo: 'texto' },
          { key: 'descuentos', titulo: 'Descuentos', tipo: 'moneda', alinear: 'right' },
          { key: 'participacion', titulo: '% de lo vendido', tipo: 'porcentaje', alinear: 'right' },
        ],
        filas: personas
          .filter((p) => p.descuentos > 0)
          .sort((a, b) => b.descuentos - a.descuentos)
          .map((p) => ({ persona: p.persona, descuentos: p.descuentos, participacion: pct(p.descuentos, p.total) })),
        totales: { descuentos, participacion: pct(descuentos, total) },
      },
      {
        id: 'por-dia',
        titulo: 'Por día',
        columnas: [
          { key: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
          { key: 'num_ventas', titulo: 'N.º ventas', tipo: 'numero', alinear: 'right' },
          { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
        ],
        filas: Array.from(dias.entries())
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([fecha, x]) => ({ fecha, num_ventas: x.num_ventas, total: x.total })),
        totales: { num_ventas: numVentas, total },
      },
    ],
    lectura,
  };
}

// ── Lo más vendido ───────────────────────────────────────────────────────

const nombreProducto = (p: { producto: string | null; producto_id: number | null }) => p.producto || (p.producto_id ? `Producto #${p.producto_id}` : '—');
const nombreCategoria = (c: string | null | undefined) => c || 'Sin categoría';

export function vistaMasVendidoPorProducto(d: RespuestaMasVendido): Pick<VistaReporte, 'columnas' | 'filas' | 'totales'> {
  const ingreso = n(d.totales?.ingreso);
  return {
    columnas: [
      { key: 'producto', titulo: 'Producto', tipo: 'texto' },
      { key: 'sku', titulo: 'SKU', tipo: 'texto' },
      { key: 'categoria', titulo: 'Categoría', tipo: 'texto' },
      { key: 'unidades', titulo: 'Unidades', tipo: 'numero', alinear: 'right' },
      { key: 'ingreso', titulo: 'Ingreso', tipo: 'moneda', alinear: 'right' },
      { key: 'participacion', titulo: '% del ingreso', tipo: 'porcentaje', alinear: 'right' },
    ],
    filas: (d.por_producto ?? []).map((p) => ({
      producto: nombreProducto(p),
      sku: p.sku ?? '—',
      categoria: nombreCategoria(p.categoria),
      unidades: n(p.unidades),
      ingreso: n(p.ingreso),
      participacion: pct(n(p.ingreso), ingreso),
    })),
    totales: { unidades: n(d.totales?.unidades), ingreso, participacion: ingreso > 0 ? 100 : 0 },
  };
}

/** Los tres productos que más ingreso dejaron en cada franja (pestaña de «Ventas por hora» y de «Lo más vendido»). */
export function vistaMasVendidoPorHora(d: RespuestaMasVendido, id: string): VistaReporte {
  return {
    id,
    titulo: id === 'mas-vendido-hora' ? 'Lo más vendido por hora' : 'Por hora',
    columnas: [
      COLS_FRANJA,
      { key: 'puesto', titulo: 'Puesto', tipo: 'numero', alinear: 'right' },
      { key: 'producto', titulo: 'Producto', tipo: 'texto' },
      { key: 'categoria', titulo: 'Categoría', tipo: 'texto' },
      { key: 'unidades', titulo: 'Unidades', tipo: 'numero', alinear: 'right' },
      { key: 'ingreso', titulo: 'Ingreso', tipo: 'moneda', alinear: 'right' },
      { key: 'participacion', titulo: '% de la franja', tipo: 'porcentaje', alinear: 'right' },
    ],
    filas: [...(d.por_hora ?? [])]
      .sort((a, b) => n(a.hora) - n(b.hora) || n(a.puesto) - n(b.puesto))
      .map((x) => ({
        franja: etiquetaFranja(n(x.hora)),
        puesto: n(x.puesto),
        producto: nombreProducto(x),
        categoria: nombreCategoria(x.categoria),
        unidades: n(x.unidades),
        ingreso: n(x.ingreso),
        participacion: pct(n(x.ingreso), n(x.total_franja)),
      })),
  };
}

/** Los diez productos que más ingreso dejaron en cada sede. */
export function vistaMasVendidoPorSede(d: RespuestaMasVendido, nombres: NombresVentas): VistaReporte {
  return {
    id: 'por-sede',
    titulo: 'Por sede',
    columnas: [
      { key: 'sede', titulo: 'Sede', tipo: 'texto' },
      { key: 'puesto', titulo: 'Puesto', tipo: 'numero', alinear: 'right' },
      { key: 'producto', titulo: 'Producto', tipo: 'texto' },
      { key: 'categoria', titulo: 'Categoría', tipo: 'texto' },
      { key: 'unidades', titulo: 'Unidades', tipo: 'numero', alinear: 'right' },
      { key: 'ingreso', titulo: 'Ingreso', tipo: 'moneda', alinear: 'right' },
      { key: 'participacion', titulo: '% de la sede', tipo: 'porcentaje', alinear: 'right' },
    ],
    filas: (d.por_sede ?? []).map((x) => ({
      sede: nombres.sede(x.sucursal_id),
      puesto: n(x.puesto),
      producto: nombreProducto(x),
      categoria: nombreCategoria(x.categoria),
      unidades: n(x.unidades),
      ingreso: n(x.ingreso),
      participacion: pct(n(x.ingreso), n(x.total_sede)),
    })),
  };
}

/** «Lo más vendido» (`mas-vendido`). */
export function armarMasVendido(d: RespuestaMasVendido, nombres: NombresVentas): ArmadoReporte {
  const principal = vistaMasVendidoPorProducto(d);
  const estrella = d.por_producto?.[0];
  return {
    kpis: [
      { titulo: 'Producto estrella', valor: estrella ? nombreProducto(estrella) : '—' },
      { titulo: 'Unidades vendidas', valor: n(d.totales?.unidades), formato: 'numero' },
      { titulo: 'Ingreso', valor: n(d.totales?.ingreso), formato: 'moneda' },
    ],
    ...principal,
    vistaPrincipal: 'Por producto',
    vistas: [vistaMasVendidoPorHora(d, 'por-hora'), vistaMasVendidoPorSede(d, nombres)],
    lectura: n(d.totales?.productos) > (d.por_producto?.length ?? 0)
      ? [{ tono: 'info', texto: `Se muestran los ${d.por_producto?.length ?? 0} productos que más ingreso dejaron de ${n(d.totales?.productos)} vendidos.` }]
      : [],
  };
}

// ── Ventas por hora ──────────────────────────────────────────────────────

/** «Ventas por hora» (`ventas-hora`): total por franja, por sede y lo más vendido de cada franja. */
export function armarVentasPorHora(d: RespuestaVentasPorHora, masVendido: RespuestaMasVendido, nombres: NombresVentas): ArmadoReporte {
  const filas = (d.por_hora ?? [])
    .map((h) => {
      const hora = n(h.hora);
      const total = n(h.total);
      const numVentas = n(h.num_ventas);
      return { hora, rango: etiquetaFranja(hora), total, num_ventas: numVentas, ticket_promedio: ticket(total, numVentas) };
    })
    .sort((a, b) => a.hora - b.hora);
  const totalVentas = r2(filas.reduce((s, f) => s + f.total, 0));
  const transacciones = filas.reduce((s, f) => s + f.num_ventas, 0);
  const pico = filas.reduce<(typeof filas)[number] | null>((m, f) => (!m || f.total > m.total ? f : m), null);

  // Franja × sede.
  const totalSede = new Map<number, number>();
  for (const x of d.por_hora_sede ?? []) totalSede.set(n(x.sucursal_id), (totalSede.get(n(x.sucursal_id)) ?? 0) + n(x.total));
  const sedes = Array.from(totalSede.entries()).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const porSede = new Map<number, Fila>();
  const totalesSede: Fila = { total: 0 };
  for (const x of d.por_hora_sede ?? []) {
    const hora = n(x.hora);
    const col = `s_${n(x.sucursal_id)}`;
    const fila = porSede.get(hora) ?? { hora, franja: etiquetaFranja(hora), total: 0 };
    fila[col] = r2(n(fila[col] as Num) + n(x.total));
    fila.total = r2(n(fila.total as Num) + n(x.total));
    totalesSede[col] = r2(n(totalesSede[col] as Num) + n(x.total));
    totalesSede.total = r2(n(totalesSede.total as Num) + n(x.total));
    porSede.set(hora, fila);
  }

  return {
    kpis: [
      { titulo: 'Hora pico', valor: pico?.rango ?? '—' },
      { titulo: 'Total vendido', valor: totalVentas, formato: 'moneda' },
      { titulo: 'Transacciones', valor: transacciones, formato: 'numero' },
      { titulo: 'Ticket promedio', valor: ticket(totalVentas, transacciones), formato: 'moneda' },
      { titulo: 'Horas activas', valor: filas.length, formato: 'numero' },
    ],
    columnas: [
      { key: 'rango', titulo: 'Franja', tipo: 'texto' },
      { key: 'num_ventas', titulo: 'N.º ventas', tipo: 'numero', alinear: 'right' },
      { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
      { key: 'ticket_promedio', titulo: 'Ticket promedio', tipo: 'moneda', alinear: 'right' },
    ],
    filas,
    totales: { total: totalVentas, num_ventas: transacciones },
    vistaPrincipal: 'Total',
    vistas: [
      {
        id: 'por-sede',
        titulo: 'Por sede',
        columnas: [
          COLS_FRANJA,
          ...sedes.map((id): ReporteColumna => ({ key: `s_${id}`, titulo: nombres.sede(id || null), tipo: 'moneda', alinear: 'right' })),
          { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
        ],
        filas: Array.from(porSede.values()).sort((a, b) => n(a.hora as Num) - n(b.hora as Num)),
        totales: totalesSede,
      },
      vistaMasVendidoPorHora(masVendido, 'mas-vendido-hora'),
    ],
  };
}

// ── Ítems vendidos y descuentos por línea ────────────────────────────────

/** «Ítems vendidos» (`items-vendidos`): línea por línea, con los totales de TODAS las líneas. */
export function armarItemsVendidos(d: RespuestaItemsVendidos, nombres: NombresVentas, contarPor: ContarPor): ArmadoReporte {
  const lineas = d.lineas ?? [];
  const totalLineas = n(d.totales?.lineas);
  const limite = n(d.limite) || lineas.length;
  const lectura: LecturaReporte[] = [];
  if (totalLineas > limite) {
    lectura.push({
      tono: 'aviso',
      texto: `Hay ${totalLineas} líneas en el periodo; se muestran las últimas ${lineas.length}. El Excel y el CSV traen las mismas ${lineas.length}: acorta el periodo o filtra por sede o persona para ver el resto. Los totales sí son de todas.`,
    });
  }
  return {
    kpis: [
      { titulo: 'Líneas', valor: totalLineas, formato: 'numero' },
      { titulo: 'Unidades', valor: n(d.totales?.cantidad), formato: 'numero' },
      { titulo: 'Descuentos', valor: n(d.totales?.descuento), formato: 'moneda' },
      { titulo: 'Total', valor: n(d.totales?.total), formato: 'moneda' },
    ],
    columnas: [
      { key: 'fecha', titulo: 'Fecha y hora', tipo: 'texto' },
      { key: 'factura', titulo: 'Factura', tipo: 'texto' },
      { key: 'producto', titulo: 'Producto', tipo: 'texto' },
      { key: 'sku', titulo: 'SKU', tipo: 'texto' },
      { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
      { key: 'precio', titulo: 'Precio unitario', tipo: 'moneda', alinear: 'right' },
      { key: 'descuento', titulo: 'Descuento', tipo: 'moneda', alinear: 'right' },
      { key: 'impuesto', titulo: 'Impuesto', tipo: 'moneda', alinear: 'right' },
      { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
      { key: 'persona', titulo: tituloPersona(contarPor), tipo: 'texto' },
      { key: 'sede', titulo: 'Sede', tipo: 'texto' },
    ],
    filas: lineas.map((l) => ({
      fecha: fechaHoraLocal(l.fecha),
      factura: l.factura || '—',
      producto: nombreProducto(l),
      sku: l.sku || '—',
      cantidad: n(l.cantidad),
      precio: n(l.precio),
      descuento: n(l.descuento),
      impuesto: n(l.impuesto),
      total: n(l.total),
      persona: nombres.persona(l.persona_id),
      sede: nombres.sede(l.sucursal_id),
    })),
    totales: { cantidad: n(d.totales?.cantidad), descuento: n(d.totales?.descuento), impuesto: n(d.totales?.impuesto), total: n(d.totales?.total) },
    lectura,
  };
}

/** Pestaña «Productos con descuento» de «Devoluciones y descuentos» (`p_solo_descuento`). */
export function vistaProductosDescuento(d: RespuestaItemsVendidos, nombres: NombresVentas): VistaReporte {
  return {
    id: 'productos-descuento',
    titulo: 'Productos con descuento',
    columnas: [
      { key: 'fecha', titulo: 'Fecha y hora', tipo: 'texto' },
      { key: 'factura', titulo: 'Factura', tipo: 'texto' },
      { key: 'producto', titulo: 'Producto', tipo: 'texto' },
      { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
      { key: 'precio', titulo: 'Precio', tipo: 'moneda', alinear: 'right' },
      { key: 'descuento', titulo: 'Descuento', tipo: 'moneda', alinear: 'right' },
      { key: 'pct_descuento', titulo: '% desc.', tipo: 'porcentaje', alinear: 'right' },
      { key: 'persona', titulo: 'Quién lo dio', tipo: 'texto' },
      { key: 'sede', titulo: 'Sede', tipo: 'texto' },
    ],
    filas: (d.lineas ?? []).map((l) => ({
      fecha: fechaHoraLocal(l.fecha),
      factura: l.factura || '—',
      producto: nombreProducto(l),
      cantidad: n(l.cantidad),
      precio: n(l.precio),
      descuento: n(l.descuento),
      pct_descuento: pct(n(l.descuento), n(l.precio) * n(l.cantidad)),
      persona: nombres.persona(l.persona_id),
      sede: nombres.sede(l.sucursal_id),
    })),
    totales: { cantidad: n(d.totales?.cantidad), descuento: n(d.totales?.descuento) },
  };
}

/** Pestaña «Por persona» de los descuentos por línea. */
export function vistaDescuentosPersona(d: RespuestaItemsVendidos, nombres: NombresVentas, contarPor: ContarPor): VistaReporte {
  return {
    id: 'descuentos-persona',
    titulo: 'Por persona',
    columnas: [
      { key: 'persona', titulo: tituloPersona(contarPor), tipo: 'texto' },
      { key: 'rol', titulo: 'Rol', tipo: 'texto' },
      { key: 'lineas', titulo: 'Líneas con descuento', tipo: 'numero', alinear: 'right' },
      { key: 'descuento', titulo: 'Descuentos', tipo: 'moneda', alinear: 'right' },
      { key: 'total', titulo: 'Vendido en esas líneas', tipo: 'moneda', alinear: 'right' },
      { key: 'pct_descuento', titulo: '% desc.', tipo: 'porcentaje', alinear: 'right' },
    ],
    filas: (d.por_persona ?? []).map((p) => ({
      persona: nombres.persona(p.persona_id),
      rol: p.persona_id ? nombres.rol(p.persona_id) : '—',
      lineas: n(p.lineas),
      descuento: n(p.descuento),
      total: n(p.total),
      pct_descuento: pct(n(p.descuento), n(p.total) + n(p.descuento)),
    })),
    totales: {
      lineas: n(d.totales?.lineas),
      descuento: n(d.totales?.descuento),
      total: n(d.totales?.total),
      pct_descuento: pct(n(d.totales?.descuento), n(d.totales?.total) + n(d.totales?.descuento)),
    },
  };
}
