/**
 * Lógica pura de Ajustes y ajuste por conteo (bloque B2). Sin React ni red:
 * la usan el listado, el detalle y el formulario, y la prueban los tests.
 *
 * La diferencia y el impacto que se ven en el formulario son una VISTA PREVIA:
 * al aplicar, `fn_ajuste_aplicar` vuelve a leer la existencia (bloqueando la
 * fila) y congela la real. Aquí nunca se decide cuánto se mueve.
 */
import { claveErrorInventario, detalleStockInsuficiente, type ErrorRpc } from '@/lib/inventario/nucleo/errores';
import type {
  AjusteFila,
  BorradorAjuste,
  DetalleAjuste,
  EstadoAjuste,
  ModoAjuste,
  ProductoParaAjuste,
} from '@/lib/services/adjustmentService';

// ─── Rutas ──────────────────────────────────────────────────────────────────

export const RUTA_AJUSTES = '/app/inventario/ajustes';

export function rutaAjuste(id: number): string {
  return `${RUTA_AJUSTES}/${id}`;
}

export function rutaEditarAjuste(id: number): string {
  return `${RUTA_AJUSTES}/${id}/editar`;
}

/** Nuevo ajuste con producto, modo y sucursal ya elegidos (Stock, detalle del producto). */
export function rutaNuevoAjuste(p: { producto?: number | null; modo?: ModoAjuste | null; sucursal?: number | null; desde?: number | null } = {}): string {
  const q = new URLSearchParams();
  if (p.producto) q.set('producto_id', String(p.producto));
  if (p.modo) q.set('modo', p.modo);
  if (p.sucursal) q.set('branchId', String(p.sucursal));
  if (p.desde) q.set('desde', String(p.desde));
  const s = q.toString();
  return s ? `${RUTA_AJUSTES}/nuevo?${s}` : `${RUTA_AJUSTES}/nuevo`;
}

export function rutaKardex(productoId: number, sucursalId?: number | null): string {
  return sucursalId ? `/app/inventario/kardex?producto=${productoId}&sucursal=${sucursalId}` : `/app/inventario/kardex?producto=${productoId}`;
}

export function rutaAsiento(id: number): string {
  return `/app/finanzas/contabilidad/asientos/${id}`;
}

/**
 * Modo inicial desde la URL. Acepta el `?type=entrada|salida` de los enlaces
 * que ya existen (Stock, detalle del producto) y el `?modo=` nuevo.
 */
export function modoDesdeUrl(modo: string | null | undefined, tipo: string | null | undefined): ModoAjuste {
  const v = (modo ?? tipo ?? '').toLowerCase();
  if (v === 'entrada' || v === 'gain' || v === 'in') return 'entrada';
  if (v === 'salida' || v === 'loss' || v === 'out') return 'salida';
  return 'conteo';
}

export function enteroPositivo(v: string | null | undefined): number | null {
  return v && /^\d{1,9}$/.test(v) && Number(v) > 0 ? Number(v) : null;
}

// ─── Renglones del formulario ───────────────────────────────────────────────

export interface LineaAjuste {
  /** Clave local estable (producto:lote). */
  clave: string;
  producto: ProductoParaAjuste;
  lot_id: number | null;
  /** Conteo: lo contado. Entrada/salida: lo que entra o sale. null = sin escribir. */
  cantidad: number | null;
  /** Costo escrito a mano (solo sobrantes sin costo promedio). */
  costo: number | null;
  seriales: string[];
  /** Solo en edición: el «sistema» que se guardó con el borrador. */
  sistemaGuardado?: number | null;
}

export function claveLinea(productoId: number, loteId: number | null): string {
  return `${productoId}:${loteId ?? '-'}`;
}

/** Existencia de la fila (producto, sucursal, lote) según la última lectura. */
export function sistemaDe(producto: Pick<ProductoParaAjuste, 'existencias'>, loteId: number | null): number {
  const fila = producto.existencias.find((e) => (e.lot_id ?? null) === (loteId ?? null));
  return fila ? fila.cantidad : 0;
}

/** Costo con que se valoraría la diferencia: el escrito, el promedio de la fila o el vigente del producto. */
export function costoDe(linea: Pick<LineaAjuste, 'producto' | 'lot_id' | 'costo'>): number | null {
  if (linea.costo !== null && linea.costo > 0) return linea.costo;
  const fila = linea.producto.existencias.find((e) => (e.lot_id ?? null) === (linea.lot_id ?? null));
  if (fila && fila.costo_promedio !== null && fila.costo_promedio > 0) return fila.costo_promedio;
  if (linea.producto.costo_vigente !== null && linea.producto.costo_vigente > 0) return linea.producto.costo_vigente;
  return null;
}

/** Redondeo a 3 decimales, la escala de stock_levels (evita 0,30000000000000004). */
export function redondear3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Diferencia que mueve el renglón (+ entra, − sale). null si falta la cantidad. */
export function diferenciaDe(modo: ModoAjuste, cantidad: number | null, sistema: number): number | null {
  if (cantidad === null || !Number.isFinite(cantidad)) return null;
  if (modo === 'entrada') return redondear3(cantidad);
  if (modo === 'salida') return redondear3(-cantidad);
  return redondear3(cantidad - sistema);
}

export interface CalculoLinea {
  sistema: number;
  diferencia: number | null;
  /** Lo que queda en la fila tras aplicar. */
  queda: number | null;
  costo: number | null;
  impacto: number | null;
}

export function calcularLinea(modo: ModoAjuste, linea: LineaAjuste): CalculoLinea {
  const sistema = sistemaDe(linea.producto, linea.lot_id);
  const diferencia = diferenciaDe(modo, linea.cantidad, sistema);
  const costo = costoDe(linea);
  return {
    sistema,
    diferencia,
    queda: diferencia === null ? null : redondear3(sistema + diferencia),
    costo,
    impacto: diferencia === null || costo === null ? null : Math.round(diferencia * costo * 100) / 100,
  };
}

export interface ResumenAjuste {
  productos: number;
  conDiferencia: number;
  sinDiferencia: number;
  /** Suma de las diferencias negativas (≤ 0). */
  faltantes: number;
  productosFaltantes: number;
  /** Suma de las diferencias positivas (≥ 0). */
  sobrantes: number;
  productosSobrantes: number;
  neto: number;
  /** Suma de impactos; null si algún renglón con diferencia no tiene costo. */
  impacto: number | null;
}

export function resumirDiferencias(filas: readonly { diferencia: number | null; impacto: number | null }[]): ResumenAjuste {
  const r: ResumenAjuste = {
    productos: filas.length,
    conDiferencia: 0,
    sinDiferencia: 0,
    faltantes: 0,
    productosFaltantes: 0,
    sobrantes: 0,
    productosSobrantes: 0,
    neto: 0,
    impacto: 0,
  };
  for (const f of filas) {
    const d = f.diferencia ?? 0;
    if (d === 0) {
      r.sinDiferencia += 1;
      continue;
    }
    r.conDiferencia += 1;
    if (d < 0) {
      r.faltantes = redondear3(r.faltantes + d);
      r.productosFaltantes += 1;
    } else {
      r.sobrantes = redondear3(r.sobrantes + d);
      r.productosSobrantes += 1;
    }
    r.neto = redondear3(r.neto + d);
    if (r.impacto !== null) r.impacto = f.impacto === null ? null : Math.round((r.impacto + f.impacto) * 100) / 100;
  }
  return r;
}

export function resumirLineas(modo: ModoAjuste, lineas: readonly LineaAjuste[]): ResumenAjuste {
  return resumirDiferencias(lineas.map((l) => calcularLinea(modo, l)));
}

// ─── Validación del formulario ──────────────────────────────────────────────

export type ErrorLinea = 'cantidad' | 'negativo' | 'costo' | 'seriales';
export type ErrorCabecera = 'sucursal' | 'razon' | 'fecha' | 'sinRenglones';

export interface ValidacionAjuste {
  cabecera: ErrorCabecera[];
  lineas: Record<string, ErrorLinea>;
  valido: boolean;
}

/**
 * - Cantidad obligatoria (≥ 0 en conteo, > 0 en entrada o salida).
 * - P5: una salida que deja la fila en negativo no se aplica.
 * - Un sobrante sin costo (sin promedio ni costo vigente) pide el costo.
 * - Un producto con seriales pide tantos seriales como unidades que mueve.
 *
 * `paraAplicar` = true exige todo; al guardar borrador solo cabecera y cantidades.
 */
export function validarAjuste(
  e: { sucursal: number | null; razon: string; fechaLocal: string; modo: ModoAjuste; lineas: readonly LineaAjuste[] },
  paraAplicar: boolean,
): ValidacionAjuste {
  const cabecera: ErrorCabecera[] = [];
  const lineas: Record<string, ErrorLinea> = {};
  if (!e.sucursal) cabecera.push('sucursal');
  if (!e.razon.trim()) cabecera.push('razon');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(e.fechaLocal)) cabecera.push('fecha');
  if (e.lineas.length === 0) cabecera.push('sinRenglones');

  for (const l of e.lineas) {
    const c = calcularLinea(e.modo, l);
    if (l.cantidad === null || l.cantidad < 0 || (e.modo !== 'conteo' && l.cantidad === 0)) {
      lineas[l.clave] = 'cantidad';
      continue;
    }
    if (!paraAplicar) continue;
    if (c.queda !== null && c.queda < 0 && (c.diferencia ?? 0) < 0) {
      lineas[l.clave] = 'negativo';
    } else if ((c.diferencia ?? 0) > 0 && c.costo === null) {
      lineas[l.clave] = 'costo';
    } else if (l.producto.controla_serial && (c.diferencia ?? 0) !== 0 && l.seriales.length !== Math.abs(c.diferencia ?? 0)) {
      lineas[l.clave] = 'seriales';
    }
  }
  return { cabecera, lineas, valido: cabecera.length === 0 && Object.keys(lineas).length === 0 };
}

/** Borrador listo para `fn_ajuste_guardar`. `contadoEn` es el instante ISO (con la zona de la organización). */
export function aBorrador(e: {
  id?: number | null;
  sucursal: number;
  modo: ModoAjuste;
  razon: string;
  notas: string;
  contadoEn: string | null;
  lineas: readonly LineaAjuste[];
}): BorradorAjuste {
  return {
    id: e.id ?? null,
    branch_id: e.sucursal,
    mode: e.modo,
    reason: e.razon,
    notes: e.notas.trim() || null,
    counted_at: e.contadoEn,
    items: e.lineas.map((l) => ({
      product_id: l.producto.id,
      lot_id: l.lot_id,
      quantity: l.cantidad ?? 0,
      unit_cost: l.costo !== null && l.costo > 0 ? l.costo : null,
      serial_numbers: l.seriales.length ? [...l.seriales] : undefined,
    })),
  };
}

/** Renglones del formulario a partir de un ajuste guardado (editar o «Duplicar como nuevo conteo»). */
export function lineasDesdeDetalle(detalle: DetalleAjuste, productos: readonly ProductoParaAjuste[], duplicar: boolean): LineaAjuste[] {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const lineas: LineaAjuste[] = [];
  for (const r of detalle.renglones) {
    const p = porId.get(r.producto.id);
    if (!p) continue; // producto borrado o sin control de stock: no se puede contar
    const loteId = r.lote?.id ?? null;
    lineas.push({
      clave: claveLinea(p.id, loteId),
      producto: p,
      lot_id: loteId,
      cantidad: duplicar ? null : r.cantidad,
      costo: duplicar ? null : r.costo_ingresado,
      seriales: duplicar ? [] : r.seriales,
      sistemaGuardado: duplicar ? null : r.sistema,
    });
  }
  return lineas;
}

/** Agrega un producto (o su lote) al final; si ya estaba, no lo repite y devuelve su clave. */
export function agregarLinea(
  lineas: readonly LineaAjuste[],
  producto: ProductoParaAjuste,
  loteId: number | null = null,
): { lineas: LineaAjuste[]; clave: string; yaEstaba: boolean } {
  const lote = loteId ?? (producto.controla_lotes ? primerLoteConExistencia(producto) : null);
  const clave = claveLinea(producto.id, lote);
  if (lineas.some((l) => l.clave === clave)) return { lineas: [...lineas], clave, yaEstaba: true };
  return {
    lineas: [...lineas, { clave, producto, lot_id: lote, cantidad: null, costo: null, seriales: [] }],
    clave,
    yaEstaba: false,
  };
}

function primerLoteConExistencia(p: ProductoParaAjuste): number | null {
  const conStock = p.existencias.find((e) => e.lot_id !== null && e.cantidad > 0);
  if (conStock) return conStock.lot_id;
  return p.lotes[0]?.lot_id ?? null;
}

/** Cambia el lote de un renglón; si ese (producto, lote) ya está en otro renglón, no cambia. */
export function cambiarLote(lineas: readonly LineaAjuste[], clave: string, loteId: number | null): LineaAjuste[] {
  const actual = lineas.find((l) => l.clave === clave);
  if (!actual) return [...lineas];
  const nueva = claveLinea(actual.producto.id, loteId);
  if (nueva !== clave && lineas.some((l) => l.clave === nueva)) return [...lineas];
  return lineas.map((l) => (l.clave === clave ? { ...l, clave: nueva, lot_id: loteId, seriales: [], sistemaGuardado: null } : l));
}

// ─── Estados y tonos ────────────────────────────────────────────────────────

/** Badge de estado: el valor que entiende `StatusBadge` y la clave de texto. */
export const BADGE_ESTADO: Record<EstadoAjuste, { estado: string; clave: EstadoAjuste }> = {
  draft: { estado: 'draft', clave: 'draft' },
  posted: { estado: 'aplicado', clave: 'posted' },
  cancelled: { estado: 'cancelled', clave: 'cancelled' },
};

export function tonoDiferencia(n: number | null | undefined): 'exito' | 'peligro' | 'neutro' {
  if (!n) return 'neutro';
  return n > 0 ? 'exito' : 'peligro';
}

// ─── Errores ────────────────────────────────────────────────────────────────

/** Códigos de negocio propios de las RPC de ajustes (`inventarioAjustes.errores.<clave>`). */
export const ERRORES_AJUSTE = [
  'ajuste_no_encontrado',
  'ajuste_cerrado',
  'ajuste_descartado',
  'ajuste_aplicado',
  'modo_invalido',
  'razon_requerida',
  'nota_muy_larga',
  'sin_renglones',
  'demasiados_renglones',
  'renglon_repetido',
  'fecha_invalida',
  'fecha_futura',
  'costo_requerido',
  'producto_sin_control_stock',
  'motivo_requerido',
  'motivo_muy_largo',
] as const;
export type ErrorAjusteClave = (typeof ERRORES_AJUSTE)[number];

export type MensajeError =
  | { ns: 'ajuste'; clave: ErrorAjusteClave; productos?: string[] }
  | { ns: 'nucleo'; clave: string; disponible?: number; solicitado?: number };

/** Traduce el error de una RPC a la clave de i18n (propia de ajustes o del núcleo). */
export function mensajeErrorAjuste(error: ErrorRpc | null | undefined): MensajeError {
  const msg = (error?.message ?? '').trim();
  const propio = (ERRORES_AJUSTE as readonly string[]).find((c) => msg === c);
  if (propio) {
    if (propio === 'costo_requerido') {
      try {
        const lista = JSON.parse(error?.details ?? '[]') as { nombre?: string }[];
        return { ns: 'ajuste', clave: 'costo_requerido', productos: lista.map((x) => String(x.nombre ?? '')).filter(Boolean) };
      } catch {
        return { ns: 'ajuste', clave: 'costo_requerido' };
      }
    }
    return { ns: 'ajuste', clave: propio as ErrorAjusteClave };
  }
  const clave = claveErrorInventario(error);
  if (clave === 'stock_insuficiente') {
    const d = detalleStockInsuficiente(error);
    return { ns: 'nucleo', clave, disponible: d?.disponible ?? 0, solicitado: d?.solicitado ?? 0 };
  }
  return { ns: 'nucleo', clave };
}

// ─── Exportar ───────────────────────────────────────────────────────────────

export function filasCsvAjustes(
  filas: readonly AjusteFila[],
  f: { fecha: (v: string) => string; estado: (e: EstadoAjuste) => string; tipo: (t: AjusteFila['tipo']) => string; razon: (r: string) => string },
): (string | number | null)[][] {
  return filas.map((a) => [
    a.codigo,
    f.fecha(a.fecha),
    a.sucursal.nombre,
    f.tipo(a.tipo),
    f.razon(a.razon),
    a.productos,
    a.diferencia,
    a.unidad,
    a.impacto,
    f.estado(a.estado),
    a.autor,
    a.notas,
  ]);
}

/** Clave de idempotencia de un intento de aplicar (una por apertura del diálogo). */
export function nuevaClaveAplicar(id: number): string {
  const aleatorio =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `ajuste-${id}-${aleatorio}`;
}
