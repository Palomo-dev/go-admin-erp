/**
 * Lógica pura de traslados y distribución (inventario B3): estados, acciones
 * por estado, validación de la recepción y del nuevo traslado, reparto de la
 * distribución, rutas y CSV. Sin React ni Supabase: se prueba en jest (node).
 *
 * La validación de aquí solo ayuda a la interfaz; la RPC vuelve a validar todo.
 */
import type {
  DecisionDiferencia,
  EstadoTraslado,
  EstadoVisibleTraslado,
  OrdenDistribuible,
  PermisosTraslados,
  ProductoTrasladable,
  RenglonTraslado,
  TrasladoFila,
} from './contrato';

// ─── Estados ──────────────────────────────────────────────────────────────

/** El recibido con faltante se muestra como «Recibido con diferencia». */
export function estadoVisible(t: { estado: EstadoTraslado; con_diferencia?: boolean; faltantes?: number }): EstadoVisibleTraslado {
  const conDiferencia = t.con_diferencia ?? (t.faltantes ?? 0) > 0;
  if (t.estado === 'received' && conDiferencia) return 'con_diferencia';
  return t.estado;
}

export type TonoEstadoTraslado = 'advertencia' | 'informacion' | 'exito' | 'peligro';

/** Tono del badge (Figma: Pendiente ámbar, En tránsito azul, Recibido verde, con diferencia ámbar en contorno, Cancelado rojo). */
export function tonoEstado(estado: EstadoVisibleTraslado): { tono: TonoEstadoTraslado; contorno: boolean } {
  switch (estado) {
    case 'pending':
      return { tono: 'advertencia', contorno: false };
    case 'in_transit':
      return { tono: 'informacion', contorno: false };
    case 'received':
      return { tono: 'exito', contorno: false };
    case 'con_diferencia':
      return { tono: 'advertencia', contorno: true };
    default:
      return { tono: 'peligro', contorno: true };
  }
}

// ─── Acciones por estado ──────────────────────────────────────────────────

export interface AccionesTraslado {
  despachar: boolean;
  editar: boolean;
  cancelar: boolean;
  recibir: boolean;
  devolver: boolean;
  imprimir: boolean;
}

/** Qué se ofrece según el estado y los permisos resueltos en el servidor. */
export function accionesDe(estado: EstadoTraslado, permisos: Pick<PermisosTraslados, 'trasladar' | 'recibir'>): AccionesTraslado {
  const trasladar = permisos.trasladar === true;
  const recibir = trasladar || permisos.recibir === true;
  return {
    despachar: estado === 'pending' && trasladar,
    editar: estado === 'pending' && trasladar,
    cancelar: estado === 'pending' && trasladar,
    recibir: estado === 'in_transit' && recibir,
    devolver: estado === 'in_transit' && trasladar,
    imprimir: estado !== 'cancelled',
  };
}

/** Unidades que siguen en tránsito de un traslado (lista). */
export function unidadesEnTransito(f: Pick<TrasladoFila, 'enviadas' | 'recibidas' | 'faltantes' | 'devueltas'>): number {
  return redondear(f.enviadas - f.recibidas - f.faltantes - f.devueltas);
}

// ─── Números ──────────────────────────────────────────────────────────────

/** Tres decimales como la base (numeric(12,3)): evita 0,1 + 0,2. */
export function redondear(n: number): number {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

// ─── Recepción ────────────────────────────────────────────────────────────

export interface LineaRecepcionUI {
  item_id: number;
  recibido: number | null;
  decision: DecisionDiferencia | null;
  motivo: string;
  /** Seriales marcados como llegados (renglones con seriales). */
  seriales: number[];
}

export type ErrorLineaRecepcion =
  | 'recibido_requerido'
  | 'recibido_de_mas'
  | 'decision_requerida'
  | 'motivo_requerido'
  | 'seriales_no_cuadran'
  | 'unidades_enteras';

export interface ResumenRecepcion {
  errores: Record<number, ErrorLineaRecepcion>;
  unidades: number;
  faltantes: number;
  enCamino: number;
  /** Valor de lo que se da de baja (null si no hay costo visible). */
  valorFaltante: number | null;
  /** Renglones con diferencia (para el aviso de Figma). */
  conDiferencia: { item_id: number; nombre: string; lote: string | null; diferencia: number; decision: DecisionDiferencia | null }[];
  valida: boolean;
}

/** Líneas iniciales del diálogo «Recibir»: todo lo pendiente llegó. */
export function lineasIniciales(items: readonly RenglonTraslado[]): LineaRecepcionUI[] {
  return items
    .filter((i) => i.pendiente > 0)
    .map((i) => ({
      item_id: i.id,
      recibido: i.pendiente,
      decision: null,
      motivo: '',
      seriales: i.seriales.filter((s) => s.estado === 'in_transit').map((s) => s.id),
    }));
}

export function resumirRecepcion(items: readonly RenglonTraslado[], lineas: readonly LineaRecepcionUI[]): ResumenRecepcion {
  const porId = new Map(items.map((i) => [i.id, i]));
  const errores: Record<number, ErrorLineaRecepcion> = {};
  let unidades = 0;
  let faltantes = 0;
  let enCamino = 0;
  let valorFaltante: number | null = 0;
  const conDiferencia: ResumenRecepcion['conDiferencia'] = [];

  for (const l of lineas) {
    const item = porId.get(l.item_id);
    if (!item) continue;
    if (l.recibido === null || !Number.isFinite(l.recibido) || l.recibido < 0) {
      errores[l.item_id] = 'recibido_requerido';
      continue;
    }
    const recibido = redondear(l.recibido);
    if (recibido > item.pendiente) {
      errores[l.item_id] = 'recibido_de_mas';
      continue;
    }
    const conSeriales = item.seriales.length > 0;
    if (conSeriales && !Number.isInteger(recibido)) {
      errores[l.item_id] = 'unidades_enteras';
      continue;
    }
    const diferencia = redondear(item.pendiente - recibido);
    if (diferencia > 0 && !l.decision) errores[l.item_id] = 'decision_requerida';
    else if (diferencia > 0 && l.decision === 'faltante' && !l.motivo.trim()) errores[l.item_id] = 'motivo_requerido';
    else if (conSeriales && recibido > 0 && recibido < item.pendiente && l.seriales.length !== recibido) errores[l.item_id] = 'seriales_no_cuadran';

    unidades += recibido;
    if (diferencia > 0) {
      conDiferencia.push({ item_id: item.id, nombre: item.nombre, lote: item.lote?.codigo ?? null, diferencia, decision: l.decision });
      if (l.decision === 'faltante') {
        faltantes += diferencia;
        if (item.costo === null || valorFaltante === null) valorFaltante = null;
        else valorFaltante += diferencia * item.costo;
      } else if (l.decision === 'en_camino') {
        enCamino += diferencia;
      }
    }
  }

  return {
    errores,
    unidades: redondear(unidades),
    faltantes: redondear(faltantes),
    enCamino: redondear(enCamino),
    valorFaltante: valorFaltante === null ? null : Math.round(valorFaltante * 100) / 100,
    conDiferencia,
    valida: Object.keys(errores).length === 0 && (unidades > 0 || faltantes > 0),
  };
}

/** Cuerpo de `POST …/recibir` (solo las líneas con algo que registrar). */
export function lineasParaEnviar(items: readonly RenglonTraslado[], lineas: readonly LineaRecepcionUI[]) {
  const porId = new Map(items.map((i) => [i.id, i]));
  return lineas
    .filter((l) => porId.has(l.item_id))
    .map((l) => {
      const item = porId.get(l.item_id)!;
      const recibido = redondear(l.recibido ?? 0);
      const diferencia = redondear(item.pendiente - recibido);
      const seriales =
        item.seriales.length > 0 && recibido > 0 && recibido < item.pendiente ? { seriales: l.seriales.slice(0, recibido) } : {};
      return {
        item_id: l.item_id,
        recibido,
        decision: diferencia > 0 ? l.decision : null,
        motivo: diferencia > 0 && l.decision === 'faltante' ? l.motivo.trim() : null,
        ...seriales,
      };
    })
    .filter((l) => l.recibido > 0 || l.decision === 'faltante');
}

// ─── Nuevo traslado ───────────────────────────────────────────────────────

export interface RenglonFormulario {
  /** Clave local estable (producto + lote). */
  clave: string;
  producto: ProductoTrasladable;
  lot_id: number | null;
  cantidad: number | null;
}

export type ErrorRenglonNuevo = 'cantidad_requerida' | 'supera_disponible' | 'lote_requerido' | 'unidades_enteras' | 'repetido';

export function claveRenglon(productId: number, lotId: number | null): string {
  return `${productId}:${lotId ?? 0}`;
}

/** Lo disponible en el origen para el renglón (el lote elegido o el total del producto). */
export function disponibleRenglon(r: Pick<RenglonFormulario, 'producto' | 'lot_id'>): number {
  if (r.lot_id === null) return r.producto.disponible;
  return r.producto.lotes.find((l) => l.lot_id === r.lot_id)?.disponible ?? 0;
}

export function validarRenglones(renglones: readonly RenglonFormulario[]): Record<string, ErrorRenglonNuevo> {
  const errores: Record<string, ErrorRenglonNuevo> = {};
  const vistas = new Set<string>();
  for (const r of renglones) {
    const clave = claveRenglon(r.producto.product_id, r.lot_id);
    if (vistas.has(clave)) {
      errores[r.clave] = 'repetido';
      continue;
    }
    vistas.add(clave);
    if (r.cantidad === null || !(r.cantidad > 0)) errores[r.clave] = 'cantidad_requerida';
    else if (r.producto.track_serial && !Number.isInteger(r.cantidad)) errores[r.clave] = 'unidades_enteras';
    else if (redondear(r.cantidad) > redondear(disponibleRenglon(r))) errores[r.clave] = 'supera_disponible';
  }
  return errores;
}

export function totalesRenglones(renglones: readonly RenglonFormulario[]): { productos: number; unidades: number } {
  return {
    productos: new Set(renglones.map((r) => r.producto.product_id)).size,
    unidades: redondear(renglones.reduce((s, r) => s + (r.cantidad ?? 0), 0)),
  };
}

// ─── Distribución ─────────────────────────────────────────────────────────

/** reparto[productId][destinoId] = cantidad. */
export type Reparto = Record<number, Record<number, number | null>>;

export interface ProductoReparto {
  product_id: number;
  nombre: string;
  /** Tope: por distribuir de la orden o lo disponible en el origen. */
  maximo: number;
}

export interface ResultadoReparto {
  /** Por producto: lo que queda en origen tras repartir (negativo = se pasa). */
  queda: Record<number, number>;
  excedidos: { product_id: number; nombre: string; repartido: number; maximo: number }[];
  envios: { destino: number; items: { product_id: number; quantity: number }[] }[];
  unidades: number;
  valido: boolean;
}

export function evaluarReparto(productos: readonly ProductoReparto[], destinos: readonly number[], reparto: Reparto): ResultadoReparto {
  const queda: Record<number, number> = {};
  const excedidos: ResultadoReparto['excedidos'] = [];
  let unidades = 0;
  for (const p of productos) {
    const repartido = redondear(destinos.reduce((s, d) => s + (reparto[p.product_id]?.[d] ?? 0), 0));
    queda[p.product_id] = redondear(p.maximo - repartido);
    unidades += repartido;
    if (repartido > p.maximo) excedidos.push({ product_id: p.product_id, nombre: p.nombre, repartido, maximo: p.maximo });
  }
  const envios = destinos
    .map((destino) => ({
      destino,
      items: productos
        .map((p) => ({ product_id: p.product_id, quantity: redondear(reparto[p.product_id]?.[destino] ?? 0) }))
        .filter((i) => i.quantity > 0),
    }))
    .filter((e) => e.items.length > 0);
  return { queda, excedidos, envios, unidades: redondear(unidades), valido: excedidos.length === 0 && envios.length > 0 };
}

/** Productos del reparto desde una orden de producción. */
export function productosDeOrden(orden: OrdenDistribuible): ProductoReparto[] {
  return [{ product_id: orden.producto.id, nombre: orden.producto.nombre, maximo: orden.por_distribuir }];
}

// ─── Rutas ────────────────────────────────────────────────────────────────

export const RUTA_TRASLADOS = '/app/inventario/transferencias';
export const RUTA_DISTRIBUCION = '/app/inventario/distribucion';

export const rutaTraslado = (id: number) => `${RUTA_TRASLADOS}/${id}`;
export const rutaEditarTraslado = (id: number) => `${RUTA_TRASLADOS}/${id}/editar`;

export function rutaNuevoTraslado(opciones: { productoId?: number | null; origen?: number | null } = {}): string {
  const p = new URLSearchParams();
  if (opciones.productoId) p.set('producto_id', String(opciones.productoId));
  if (opciones.origen) p.set('origen', String(opciones.origen));
  const qs = p.toString();
  return qs ? `${RUTA_TRASLADOS}/nuevo?${qs}` : `${RUTA_TRASLADOS}/nuevo`;
}

export function rutaKardex(productId: number, sucursalId?: number | null): string {
  const p = new URLSearchParams({ producto: String(productId) });
  if (sucursalId) p.set('sucursal', String(sucursalId));
  return `/app/inventario/kardex?${p.toString()}`;
}

export const rutaTrazabilidadLote = (codigo: string) => `/app/inventario/reportes/trazabilidad?codigo=${encodeURIComponent(codigo)}`;
export const rutaOrdenProduccion = (id: number) => `/app/inventario/produccion?orden=${id}`;

/** Lee `?producto_id&origen` (enlaces desde Stock, Seriales y el detalle del producto). */
export function leerPrefill(params: { get(k: string): string | null } | null | undefined): { productoId: number | null; origen: number | null } {
  const n = (v: string | null | undefined) => (v && /^\d{1,9}$/.test(v) ? Number(v) : null);
  return { productoId: n(params?.get('producto_id')), origen: n(params?.get('origen')) };
}

// ─── Clave de idempotencia ────────────────────────────────────────────────

export function nuevaClave(prefijo: string): string {
  const aleatorio =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefijo}-${aleatorio}`;
}

// ─── CSV ──────────────────────────────────────────────────────────────────

export function filasCsvTraslados(
  filas: readonly TrasladoFila[],
  fmt: { estado: (e: EstadoVisibleTraslado) => string; fecha: (v: string | null) => string },
): (string | number)[][] {
  return filas.map((f) => [
    f.code,
    fmt.estado(estadoVisible(f)),
    f.origen.nombre ?? '',
    f.destino.nombre ?? '',
    fmt.fecha(f.creado_en),
    f.autor ?? '',
    fmt.fecha(f.despachado_en),
    fmt.fecha(f.recibido_en),
    f.productos,
    f.enviadas,
    f.recibidas,
    f.faltantes,
    f.devueltas,
    f.valor ?? '',
    f.orden_produccion?.numero ?? '',
    f.notas ?? '',
  ]);
}
