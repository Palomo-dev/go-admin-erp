/**
 * Lógica de presentación de las piezas de EDICIÓN de un documento (factura de
 * venta, factura de compra, orden de compra): impuestos por línea, «Agregar
 * productos», formulario rápido de tercero e ítem manual. Sin React y sin
 * Supabase. **No calcula el negocio**: los totales, la resolución del
 * impuesto y los faltantes llegan del servicio de la pantalla.
 *
 * Figma: `02 Componentes` › «Finanzas — Formulario de documento: venta y
 * compra» (`1032:32705`): `ImpuestosLinea` (`1032:32779`),
 * `LineaDocumentoEdicion` (`1032:33591`), `Diálogo · Agregar productos`
 * (`1042:34652`), `Diálogo · Agregar ítem manual` (`1042:134761`).
 */

// ─── Impuestos por línea ─────────────────────────────────────────────────

/** Un impuesto de la organización (Tesorería › Impuestos), sin retenciones. */
export interface OpcionImpuesto {
  /** `organization_taxes.id`. */
  id: string;
  /** Código de la plantilla (`IVA_19`, `INC_8`); `null` en impuestos propios. */
  codigo: string | null;
  nombre: string;
  /** Porcentaje (19, 8). */
  tarifa: number;
  predeterminado?: boolean;
}

/** Lo elegido en una línea: impuestos (por id) y si están incluidos en el precio. */
export interface SeleccionImpuestos {
  ids: readonly string[];
  incluido: boolean;
}

/** Marca o desmarca un impuesto. Con `multiple = false` es una sola opción (radio). */
export function alternarImpuesto(ids: readonly string[], id: string, multiple: boolean): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  return multiple ? [...ids, id] : [id];
}

/** Opciones elegidas, en el orden de la lista de la organización (ids desconocidos se ignoran). */
export function impuestosElegidos(ids: readonly string[], opciones: readonly OpcionImpuesto[]): OpcionImpuesto[] {
  return opciones.filter((o) => ids.includes(o.id));
}

/** Suma de tarifas elegidas (lo que la línea cobra; 0 sin impuesto). */
export function tarifaSeleccion(ids: readonly string[], opciones: readonly OpcionImpuesto[]): number {
  return Math.round(impuestosElegidos(ids, opciones).reduce((s, o) => s + (Number(o.tarifa) || 0), 0) * 10000) / 10000;
}

/** «IVA 19 % + Ultraprocesados 20 %»; cadena vacía sin impuesto. */
export function textoSeleccionImpuestos(
  ids: readonly string[],
  opciones: readonly OpcionImpuesto[],
  formatearTarifa: (tarifa: number) => string | null,
): string {
  return impuestosElegidos(ids, opciones)
    .map((o) => {
      const nombre = o.nombre.trim();
      const tarifa = formatearTarifa(o.tarifa);
      // «IVA 19%» ya trae la tarifa en el nombre: no se repite.
      return tarifa && !/\d/.test(nombre) ? `${nombre} ${tarifa}` : nombre;
    })
    .join(' + ');
}

/** Selección inicial de una línea: la que trae, o el predeterminado de la organización. */
export function seleccionInicial(opciones: readonly OpcionImpuesto[], idsLinea?: readonly string[] | null): string[] {
  if (idsLinea && idsLinea.length > 0) return opciones.filter((o) => idsLinea.includes(o.id)).map((o) => o.id);
  const pred = opciones.find((o) => o.predeterminado);
  return pred ? [pred.id] : [];
}

/** Ids de las opciones cuyo código o tarifa coincide (líneas guardadas que solo traen `tax_code` / `tax_rate`). */
export function idsDesdeCodigo(opciones: readonly OpcionImpuesto[], codigo: string | null | undefined, tarifa: number | null | undefined): string[] {
  const c = (codigo ?? '').trim().toUpperCase();
  if (c) {
    const porCodigo = opciones.find((o) => (o.codigo ?? '').toUpperCase() === c);
    if (porCodigo) return [porCodigo.id];
  }
  const t = Number(tarifa);
  if (Number.isFinite(t) && t > 0) {
    const porTarifa = opciones.find((o) => Number(o.tarifa) === t);
    if (porTarifa) return [porTarifa.id];
  }
  return [];
}

// ─── Agregar productos ───────────────────────────────────────────────────

export type VarianteDocumento = 'venta' | 'compra';

/** Producto que muestra «Agregar productos» (lo arma el servicio de la pantalla). */
export interface ProductoDocumento {
  id: number;
  nombre: string;
  sku?: string | null;
  codigoBarras?: string | null;
  /** Texto plano (el servicio ya quitó el HTML del editor enriquecido). */
  descripcion?: string | null;
  /** Venta: precio vigente de la lista. Compra: costo del proveedor o último costo. */
  precio: number;
  /** Existencias en la sucursal del documento; `null` si no se conocen. */
  stock?: number | null;
  controlaStock?: boolean;
  serial?: boolean;
  /** Lotes con existencias (venta). */
  lotes?: number | null;
  /** Compra: días de entrega del proveedor. */
  tiempoEntregaDias?: number | null;
  /** Compra: el producto está en el catálogo del proveedor elegido. */
  delProveedor?: boolean;
  referenciaProveedor?: string | null;
  minimoPedido?: number | null;
  impuestos?: readonly OpcionImpuesto[];
  imagen?: string | null;
}

export type EstadoStock = 'disponible' | 'sinStock' | 'noControla' | 'desconocido';

export function estadoStock(p: Pick<ProductoDocumento, 'stock' | 'controlaStock'>): EstadoStock {
  if (p.controlaStock === false) return 'noControla';
  if (p.stock === null || p.stock === undefined || !Number.isFinite(Number(p.stock))) return 'desconocido';
  return Number(p.stock) > 0 ? 'disponible' : 'sinStock';
}

/**
 * Lo que leyó el escáner (o escribió el usuario) coincide exacto con el SKU o
 * el código de barras de un solo producto: se agrega directo.
 */
export function coincidenciaExacta<P extends Pick<ProductoDocumento, 'sku' | 'codigoBarras'>>(texto: string, productos: readonly P[]): P | null {
  const t = texto.trim().toLowerCase();
  if (!t) return null;
  const hallados = productos.filter((p) => (p.sku ?? '').trim().toLowerCase() === t || (p.codigoBarras ?? '').trim().toLowerCase() === t);
  return hallados.length === 1 ? hallados[0] : null;
}

/** Quita etiquetas y entidades de un texto que venga con HTML (defensa: el servicio ya lo hace). */
export { textoSinHtml } from '@/lib/utils/textoPlano';

/** Cuántas veces se agregó cada producto en esta apertura del diálogo. */
export function contarAgregados(ids: readonly number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

// ─── Formulario rápido de tercero ────────────────────────────────────────

export type VarianteTercero = 'cliente' | 'proveedor';
export type TipoPersona = 'persona' | 'empresa';

export interface DatosTerceroRapido {
  tipo: TipoPersona;
  /** `cc` · `nit` · `ce` · `passport`. */
  tipoDocumento: string;
  numeroDocumento: string;
  dv: string;
  nombres: string;
  apellidos: string;
  razonSocial: string;
  /** Proveedor: persona de contacto (`suppliers.contact`). */
  contacto: string;
  correo: string;
  telefono: string;
  /** Proveedor: días de crédito. */
  diasCredito: number | null;
}

export type CampoTercero = keyof DatosTerceroRapido;
export type ErrorTercero = 'obligatorio' | 'correo' | 'documento' | 'dv' | 'dias';

export const TIPOS_DOCUMENTO_TERCERO = ['cc', 'nit', 'ce', 'passport'] as const;

/** Lo escrito en el buscador llega al formulario: un número es el documento; un texto, el nombre. */
export function terceroRapidoInicial(variante: VarianteTercero, texto: string): DatosTerceroRapido {
  const limpio = texto.trim();
  const esNumero = /^[\d.\s-]{5,}$/.test(limpio);
  const tipo: TipoPersona = variante === 'proveedor' ? 'empresa' : 'persona';
  const palabras = esNumero ? [] : limpio.split(/\s+/).filter(Boolean);
  return {
    tipo,
    tipoDocumento: tipo === 'empresa' ? 'nit' : 'cc',
    numeroDocumento: esNumero ? limpio.replace(/[.\s]/g, '') : '',
    dv: '',
    nombres: tipo === 'persona' ? palabras.slice(0, Math.max(1, Math.ceil(palabras.length / 2))).join(' ') : '',
    apellidos: tipo === 'persona' ? palabras.slice(Math.max(1, Math.ceil(palabras.length / 2))).join(' ') : '',
    razonSocial: tipo === 'empresa' && !esNumero ? limpio : '',
    contacto: '',
    correo: '',
    telefono: '',
    diasCredito: variante === 'proveedor' ? 30 : null,
  };
}

/** Cambia persona ↔ empresa conservando lo escrito (el nombre pasa a razón social y al revés). */
export function cambiarTipoPersona(d: DatosTerceroRapido, tipo: TipoPersona): DatosTerceroRapido {
  if (d.tipo === tipo) return d;
  if (tipo === 'empresa') {
    return { ...d, tipo, tipoDocumento: 'nit', razonSocial: d.razonSocial || [d.nombres, d.apellidos].filter(Boolean).join(' ') };
  }
  const partes = d.razonSocial.trim().split(/\s+/).filter(Boolean);
  return {
    ...d,
    tipo,
    tipoDocumento: d.tipoDocumento === 'nit' ? 'cc' : d.tipoDocumento,
    dv: '',
    nombres: d.nombres || partes.slice(0, 1).join(' '),
    apellidos: d.apellidos || partes.slice(1).join(' '),
  };
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarTerceroRapido(d: DatosTerceroRapido, variante: VarianteTercero): Partial<Record<CampoTercero, ErrorTercero>> {
  const e: Partial<Record<CampoTercero, ErrorTercero>> = {};
  if (d.tipo === 'empresa') {
    if (!d.razonSocial.trim()) e.razonSocial = 'obligatorio';
  } else if (!d.nombres.trim()) {
    e.nombres = 'obligatorio';
  }
  const numero = d.numeroDocumento.replace(/[.\s-]/g, '');
  // El documento es obligatorio para facturar a un cliente; al proveedor se le admite sin NIT (documento soporte).
  if (variante === 'cliente' && !numero) e.numeroDocumento = 'obligatorio';
  if (numero && (d.tipoDocumento === 'cc' || d.tipoDocumento === 'nit') && !/^\d{3,15}$/.test(numero)) e.numeroDocumento = 'documento';
  if (d.dv.trim() && !/^\d$/.test(d.dv.trim())) e.dv = 'dv';
  if (d.correo.trim() && !CORREO.test(d.correo.trim())) e.correo = 'correo';
  if (d.diasCredito !== null && (d.diasCredito < 0 || d.diasCredito > 365 || !Number.isInteger(d.diasCredito))) e.diasCredito = 'dias';
  return e;
}

/** Nombre para mostrar del tercero que se va a crear. */
export function nombreTerceroRapido(d: DatosTerceroRapido): string {
  return d.tipo === 'empresa' ? d.razonSocial.trim() : [d.nombres.trim(), d.apellidos.trim()].filter(Boolean).join(' ');
}

// ─── Ítem manual ─────────────────────────────────────────────────────────

export interface ItemManual {
  descripcion: string;
  cantidad: number;
  precio: number;
  impuestos: string[];
  incluido: boolean;
  nota: string | null;
}

export type CampoItemManual = 'descripcion' | 'cantidad' | 'precio';

export function validarItemManual(i: Pick<ItemManual, 'descripcion' | 'cantidad' | 'precio'>): Partial<Record<CampoItemManual, 'obligatorio' | 'mayorQueCero' | 'noNegativo'>> {
  const e: Partial<Record<CampoItemManual, 'obligatorio' | 'mayorQueCero' | 'noNegativo'>> = {};
  if (!i.descripcion.trim()) e.descripcion = 'obligatorio';
  if (!(Number(i.cantidad) > 0)) e.cantidad = 'mayorQueCero';
  if (!(Number(i.precio) >= 0) || !Number.isFinite(Number(i.precio))) e.precio = 'noNegativo';
  return e;
}

// ─── Formulario rápido de producto ───────────────────────────────────────

export interface DatosProductoRapido {
  nombre: string;
  sku: string;
  /** Venta: precio de venta. Compra: costo del proveedor. */
  precio: number | null;
  impuestos: string[];
  controlaStock: boolean;
}

export function productoRapidoInicial(texto: string, impuestoPredeterminado: string | null): DatosProductoRapido {
  const t = texto.trim();
  const pareceCodigo = /^[A-Za-z0-9-_.]{3,}$/.test(t) && /\d/.test(t) && !/\s/.test(t);
  return {
    nombre: pareceCodigo ? '' : t,
    sku: pareceCodigo ? t.toUpperCase() : '',
    precio: null,
    impuestos: impuestoPredeterminado ? [impuestoPredeterminado] : [],
    controlaStock: true,
  };
}

export function validarProductoRapido(d: DatosProductoRapido): Partial<Record<'nombre' | 'sku' | 'precio', 'obligatorio' | 'noNegativo' | 'sku'>> {
  const e: Partial<Record<'nombre' | 'sku' | 'precio', 'obligatorio' | 'noNegativo' | 'sku'>> = {};
  if (!d.nombre.trim()) e.nombre = 'obligatorio';
  if (!d.sku.trim()) e.sku = 'obligatorio';
  else if (!/^[A-Za-z0-9._\-/]{1,60}$/.test(d.sku.trim())) e.sku = 'sku';
  if (d.precio === null || !Number.isFinite(d.precio)) e.precio = 'obligatorio';
  else if (d.precio < 0) e.precio = 'noNegativo';
  return e;
}
