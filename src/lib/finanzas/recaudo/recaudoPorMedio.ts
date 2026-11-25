/**
 * Recaudo por medio de pago (Figma «05 POS y ventas» 3300-420477, aprobado por el dueño el
 * 2026-11-25). UNA sola regla para las cuatro pantallas: Pedidos online, Todas las ventas,
 * Finanzas › Movimientos/Ingresos/Egresos, Procesadores de pago › Cobros y el reporte «Recaudo
 * por medio de pago». Puro (sin React ni Supabase): lo prueba `__tests__/recaudoPorMedio.test.ts`.
 *
 * De dónde sale (lámina 07, «De dónde sale cada número»):
 * - Recaudado = `payments` aprobados y NO anulados (`fn_recaudo_pagos`), por `payment_date` en la
 *   zona de la organización. Es dinero que ENTRÓ (criterio de caja), no «Ventas netas».
 * - El medio: la pasarela (`pasarelaDelPago`, la misma regla de la tarjeta «Pagos» del pedido) o,
 *   sin pasarela, el tipo del método (`tipoMetodoPago`: efectivo, datáfono, transferencia…).
 * - El tipo del cobro, con las reglas que ya existen (`esPedidoContraentrega`, `tieneAnticipo`):
 *     · `anticipo`  → pago del pedido (`source = 'web_order'`) de un contraentrega con anticipo:
 *                     va a 2805 hasta facturar; en «Recaudado» se muestra en una línea aparte.
 *     · `puerta`    → pago de la factura de un pedido contraentrega: lo cobrado al entregar.
 *     · `completo`  → cualquier otro pago de un pedido web (pagado por pasarela por el total).
 *     · `tienda`    → pagos sin pedido web (POS, abonos de cartera…).
 * - Un pedido pagado por partes (anticipo por Bold y saldo en efectivo) aparece en los DOS
 *   medios y cada uno suma solo lo suyo: se suma por PAGO, nunca por pedido (decisión 4).
 * - Los abonos de la pasarela al banco NO son pagos: no están aquí y no suman (decisión 6).
 */
import { esPedidoContraentrega, tieneAnticipo, type PedidoContraentrega } from '@/lib/pos/pedidosWeb/contraentregaPedido';
import { pasarelaDelPago, pasarelaDeCodigo, submetodoDeCodigo, NOMBRE_PASARELA, type Pasarela, type Submetodo } from '@/lib/pos/pedidosWeb/pagosDelPedido';
import { tipoMetodoPago } from '@/lib/finanzas/metodosPagoLista';
import { addPlainDays, toPlainDate } from '@/lib/utils/dateCore';

/** Fila tal como la devuelve `fn_recaudo_pagos` (migración 20261126020000). */
export interface FilaRecaudoBD {
  pago_id: string;
  fecha: string;
  branch_id: number | null;
  origen: string | null;
  metodo: string | null;
  procesador: string | null;
  pasarela_manual: string | null;
  bold_metodo: string | null;
  wompi_tipo: string | null;
  mp_metodo: string | null;
  monto: number | string | null;
  referencia: string | null;
  cuenta_bancaria_id: number | null;
  venta_id: string | null;
  factura_numero: string | null;
  pedido_id: string | null;
  pedido_numero: string | null;
  pedido_estado: string | null;
  pedido_estado_pago: string | null;
  pedido_metodo: string | null;
  pedido_referencia: string | null;
  pedido_entrega: string | null;
  pedido_anticipo: number | string | null;
  pedido_anticipo_estado: string | null;
  pedido_total: number | string | null;
}

export type TipoRecaudo = 'completo' | 'anticipo' | 'puerta' | 'tienda';
export const TIPOS_RECAUDO: readonly TipoRecaudo[] = ['completo', 'anticipo', 'puerta', 'tienda'];

/** Medios sin pasarela, por el tipo del método. Los demás códigos se quedan con su código. */
export type MedioSinPasarela = 'efectivo' | 'datafono' | 'transferencia';

/** Clave del medio: una pasarela (`bold`, `wompi`…), un medio sin pasarela o el código crudo. */
export type ClaveMedio = Pasarela | MedioSinPasarela | string;

/** ¿El medio es una pasarela en línea? (grupo «Pasarelas (en línea)» del selector). */
export function esMedioPasarela(medio: ClaveMedio): medio is Pasarela {
  return medio in NOMBRE_PASARELA;
}

export interface PagoRecaudo {
  id: string;
  /** Instante del pago (timestamptz): se muestra en la zona de la organización. */
  fecha: string;
  sedeId: number | null;
  medio: ClaveMedio;
  /** Código guardado en `payments.method`. */
  metodo: string;
  submetodo: Submetodo | null;
  tipo: TipoRecaudo;
  monto: number;
  referencia: string | null;
  ventaId: string | null;
  factura: string | null;
  pedidoId: string | null;
  pedidoNumero: string | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Medio de un código de `payments.method` o de `payment_methods.code` (filtro de Ventas):
 * la pasarela si es una; si no, el tipo (efectivo · datáfono · transferencia) o el código.
 */
export function medioDeCodigo(codigo: string | null | undefined): ClaveMedio {
  const c = (codigo ?? '').trim().toLowerCase();
  const pasarela = pasarelaDeCodigo(c);
  if (pasarela) return pasarela;
  const tipo = tipoMetodoPago(c);
  if (tipo === 'efectivo') return 'efectivo';
  if (tipo === 'tarjeta') return 'datafono';
  if (tipo === 'transferencia') return 'transferencia';
  return c || 'otro';
}

/** Medio de un pago: la pasarela que lo cobró (aunque el método sea Nequi o PSE) o el del código. */
export function medioDelPago(f: Pick<FilaRecaudoBD, 'metodo' | 'procesador' | 'pasarela_manual' | 'bold_metodo' | 'wompi_tipo' | 'mp_metodo'>): ClaveMedio {
  const pasarela = pasarelaDelPago({
    id: '',
    method: f.metodo,
    amount: 0,
    status: null,
    payment_date: null,
    created_at: null,
    processor: f.procesador,
    manual_pasarela: f.pasarela_manual,
    bold_metodo: f.bold_metodo,
    wompi_tipo: f.wompi_tipo,
    mp_metodo: f.mp_metodo,
  });
  return pasarela ?? medioDeCodigo(f.metodo);
}

/** El pedido web de la fila, con las columnas que leen las reglas de contraentrega. */
function pedidoDeFila(f: FilaRecaudoBD): PedidoContraentrega {
  return {
    status: f.pedido_estado,
    total: f.pedido_total,
    delivery_type: f.pedido_entrega,
    payment_status: f.pedido_estado_pago,
    payment_method: f.pedido_metodo,
    payment_reference: f.pedido_referencia,
    advance_amount: f.pedido_anticipo,
    advance_status: f.pedido_anticipo_estado,
  };
}

/** Tipo del cobro (ver la cabecera del módulo). */
export function tipoDelPago(f: FilaRecaudoBD): TipoRecaudo {
  if (!f.pedido_id) return 'tienda';
  const pedido = pedidoDeFila(f);
  const contraentrega = esPedidoContraentrega(pedido);
  if (f.origen === 'web_order') return contraentrega && tieneAnticipo(pedido) ? 'anticipo' : 'completo';
  return contraentrega ? 'puerta' : 'completo';
}

export function pagoDeFila(f: FilaRecaudoBD): PagoRecaudo {
  const metodo = (f.metodo ?? '').trim() || 'other';
  const medio = medioDelPago(f);
  return {
    id: f.pago_id,
    fecha: f.fecha,
    sedeId: f.branch_id ?? null,
    medio,
    metodo,
    // Sin pasarela no hay submétodo; con pasarela, el medio dentro de ella (Nequi, PSE…).
    submetodo: esMedioPasarela(medio) ? submetodoDeCodigo(f.bold_metodo ?? f.wompi_tipo ?? f.mp_metodo ?? metodo) : null,
    tipo: tipoDelPago(f),
    monto: redondear(num(f.monto)),
    referencia: f.referencia ?? null,
    ventaId: f.venta_id ?? null,
    factura: f.factura_numero ?? null,
    pedidoId: f.pedido_id ?? null,
    pedidoNumero: f.pedido_numero ?? null,
  };
}

export interface Suma {
  pagos: number;
  monto: number;
}

const cero = (): Suma => ({ pagos: 0, monto: 0 });

function sumar(s: Suma, monto: number) {
  s.pagos += 1;
  s.monto = redondear(s.monto + monto);
}

export interface ResumenRecaudo {
  /** Todo lo que entró (pagos completos + anticipos + puerta + tienda). */
  total: Suma;
  porTipo: Record<TipoRecaudo, Suma>;
}

/** Totales de una lista de pagos: cada pago cuenta una vez, con su propio monto. */
export function resumenRecaudo(pagos: readonly PagoRecaudo[]): ResumenRecaudo {
  const r: ResumenRecaudo = { total: cero(), porTipo: { completo: cero(), anticipo: cero(), puerta: cero(), tienda: cero() } };
  for (const p of pagos) {
    sumar(r.total, p.monto);
    sumar(r.porTipo[p.tipo], p.monto);
  }
  return r;
}

export interface TotalMedio extends Suma {
  medio: ClaveMedio;
  porTipo: Record<TipoRecaudo, Suma>;
  /** Pedidos distintos con algún pago por este medio. */
  pedidos: number;
}

/** Por medio, de mayor a menor monto. Un pedido pagado por partes aparece en cada medio. */
export function totalesPorMedio(pagos: readonly PagoRecaudo[]): TotalMedio[] {
  const mapa = new Map<ClaveMedio, TotalMedio & { idsPedido: Set<string> }>();
  for (const p of pagos) {
    let t = mapa.get(p.medio);
    if (!t) {
      t = { medio: p.medio, pagos: 0, monto: 0, pedidos: 0, porTipo: { completo: cero(), anticipo: cero(), puerta: cero(), tienda: cero() }, idsPedido: new Set() };
      mapa.set(p.medio, t);
    }
    t.pagos += 1;
    t.monto = redondear(t.monto + p.monto);
    sumar(t.porTipo[p.tipo], p.monto);
    if (p.pedidoId) t.idsPedido.add(p.pedidoId);
  }
  return [...mapa.values()]
    .map(({ idsPedido, ...t }) => ({ ...t, pedidos: idsPedido.size }))
    .sort((a, b) => b.monto - a.monto || String(a.medio).localeCompare(String(b.medio)));
}

/** Filtra por medios elegidos; sin elegidos, todos. */
export function filtrarPorMedio<T extends { medio: ClaveMedio }>(pagos: readonly T[], medios: readonly ClaveMedio[]): T[] {
  if (medios.length === 0) return [...pagos];
  const set = new Set(medios);
  return pagos.filter((p) => set.has(p.medio));
}

/** Medios (sin repetir) de los códigos de método elegidos en Ventas (`metodo=bold_link,cash`). */
export function mediosDeCodigos(codigos: readonly string[]): ClaveMedio[] {
  return [...new Set(codigos.map(medioDeCodigo))];
}

/** Medios por pedido: para filtrar la lista de pedidos por «Medio de pago». */
export function mediosPorPedido(pagos: readonly PagoRecaudo[]): Map<string, Set<ClaveMedio>> {
  const m = new Map<string, Set<ClaveMedio>>();
  for (const p of pagos) {
    if (!p.pedidoId) continue;
    const s = m.get(p.pedidoId) ?? new Set<ClaveMedio>();
    s.add(p.medio);
    m.set(p.pedidoId, s);
  }
  return m;
}

// ── Agrupar por día, semana o mes (reporte) ──────────────────────────────────

export type Agrupacion = 'dia' | 'semana' | 'mes';

/** Lunes de la semana de un día calendario (semana de lunes a domingo). */
export function lunesDe(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number);
  const semana = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
  return addPlainDays(dia, -((semana + 6) % 7));
}

/** Clave del grupo de un instante en la zona de la organización: el día, el lunes o el día 1. */
export function claveGrupo(fechaIso: string, agrupar: Agrupacion, zona: string): string {
  const dia = toPlainDate(new Date(fechaIso), zona);
  if (agrupar === 'dia') return dia;
  if (agrupar === 'semana') return lunesDe(dia);
  return `${dia.slice(0, 7)}-01`;
}

export interface GrupoRecaudo {
  clave: string;
  total: Suma;
  porTipo: Record<TipoRecaudo, Suma>;
}

/** Grupos por periodo, del más antiguo al más reciente. */
export function agruparPorPeriodo(pagos: readonly PagoRecaudo[], agrupar: Agrupacion, zona: string): GrupoRecaudo[] {
  const mapa = new Map<string, PagoRecaudo[]>();
  for (const p of pagos) {
    const k = claveGrupo(p.fecha, agrupar, zona);
    const lista = mapa.get(k) ?? [];
    lista.push(p);
    mapa.set(k, lista);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, lista]) => ({ clave, ...resumenRecaudo(lista) }));
}

/** Por sede, de mayor a menor (vista «Por sede» del reporte). */
export function totalesPorSede(pagos: readonly PagoRecaudo[]): { sedeId: number | null; total: Suma; porTipo: Record<TipoRecaudo, Suma> }[] {
  const mapa = new Map<number | null, PagoRecaudo[]>();
  for (const p of pagos) {
    const lista = mapa.get(p.sedeId) ?? [];
    lista.push(p);
    mapa.set(p.sedeId, lista);
  }
  return [...mapa.entries()]
    .map(([sedeId, lista]) => ({ sedeId, ...resumenRecaudo(lista) }))
    .sort((a, b) => b.total.monto - a.total.monto);
}
