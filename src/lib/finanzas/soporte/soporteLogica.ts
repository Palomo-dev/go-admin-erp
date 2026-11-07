/**
 * Documento soporte — reglas de presentación y validación sin React ni
 * Supabase (las usan el listado, el formulario, el detalle y el servidor).
 *
 * Caracterización de la pantalla vieja (`SupportDocumentDetail.tsx`, reemplazada
 * el 2026-11-07), que se conserva tal cual:
 * - «Enviar a la DIAN» y «Eliminar»: solo en borrador, rechazado o con error.
 * - XML: solo aceptado y con número de la DIAN.
 * - Al eliminar un rechazado o con error, antes se borra en el proveedor
 *   (best effort: si falla, se sigue).
 * Lo nuevo: «Editar» con las mismas condiciones que enviar y sin envío vivo.
 */

/** Estados que guarda `support_documents.status` (la cola los escribe desde el envío). */
export const ESTADOS_SOPORTE = ['draft', 'pending', 'processing', 'sent', 'accepted', 'rejected', 'failed', 'cancelled'] as const;
export type EstadoSoporte = (typeof ESTADOS_SOPORTE)[number];

export function esEstadoSoporte(v: unknown): v is EstadoSoporte {
  return typeof v === 'string' && (ESTADOS_SOPORTE as readonly string[]).includes(v);
}

/** Estado del documento (columna «Estado» de Figma): borrador, emitido o anulado. */
export type EstadoDocumentoSoporte = 'borrador' | 'emitido' | 'anulado';

export function estadoDocumento(status: string | null | undefined): EstadoDocumentoSoporte {
  if (!status || status === 'draft') return 'borrador';
  if (status === 'cancelled') return 'anulado';
  return 'emitido';
}

/** Estado ante la DIAN (columna «DIAN»), en lenguaje del usuario. */
export type EstadoDianSoporte =
  | 'sin_enviar'
  | 'retenido'
  | 'en_cola'
  | 'enviando'
  | 'enviado'
  | 'aceptado'
  | 'rechazado'
  | 'error'
  | 'cancelado';

/**
 * `retenido`: el envío está en la cola con `hold_reason` (servicio aún no
 * activo o pendiente de confirmar la fecha), no «pendiente» a secas.
 */
export function estadoDian(status: string | null | undefined, retenido = false): EstadoDianSoporte {
  switch (status) {
    case 'pending':
      return retenido ? 'retenido' : 'en_cola';
    case 'processing':
      return 'enviando';
    case 'sent':
      return 'enviado';
    case 'accepted':
      return 'aceptado';
    case 'rejected':
      return 'rechazado';
    case 'failed':
      return 'error';
    case 'cancelled':
      return 'cancelado';
    default:
      return retenido ? 'retenido' : 'sin_enviar';
  }
}

/** Clave para `StatusBadge` (tono de la tabla única `estadoTono`). */
export const BADGE_DIAN: Record<EstadoDianSoporte, string> = {
  sin_enviar: 'sin fe',
  retenido: 'on hold',
  en_cola: 'pending',
  enviando: 'processing',
  enviado: 'sent',
  aceptado: 'accepted',
  rechazado: 'rejected',
  error: 'failed',
  cancelado: 'cancelled',
};

export const BADGE_DOCUMENTO: Record<EstadoDocumentoSoporte, string> = {
  borrador: 'draft',
  emitido: 'issued',
  anulado: 'void',
};

/** Envío a la DIAN que sigue vivo: no se edita ni se borra mientras tanto. */
export function envioVivo(estadoJob: string | null | undefined): boolean {
  return estadoJob === 'pending' || estadoJob === 'processing' || estadoJob === 'sent';
}

export type AccionSoporte = 'editar' | 'enviar' | 'eliminar' | 'xml';

export interface EntradaAcciones {
  status: string | null | undefined;
  numero?: string | null;
  /** Estado del último envío (job) del documento, si hay. */
  estadoJob?: string | null;
  /**
   * Nació de una factura de compra y comparte sus líneas (`fn_fc_crear_ds_int`):
   * editarlo o borrarlo tocaría las líneas de la compra (la FK
   * `invoice_items.support_document_id` es ON DELETE CASCADE). Se corrige la compra.
   */
  deCompra?: boolean;
}

const PREVIOS_A_LA_DIAN = new Set(['draft', 'failed', 'rejected']);

export function accionesSoporte({ status, numero, estadoJob, deCompra }: EntradaAcciones): Set<AccionSoporte> {
  const a = new Set<AccionSoporte>();
  const previo = PREVIOS_A_LA_DIAN.has(status ?? '');
  if (previo) {
    a.add('enviar');
    if (!deCompra) a.add('eliminar');
    if (!deCompra && !envioVivo(estadoJob)) a.add('editar');
  }
  if (status === 'accepted' && numero) a.add('xml');
  return a;
}

/** Rechazado o con error: el proveedor pudo registrar la referencia; se borra allí antes. */
export function eliminarEnProveedorPrimero(status: string | null | undefined): boolean {
  return status === 'failed' || status === 'rejected';
}

// ─── Proveedor (contraparte) ────────────────────────────────────────────────

/** Datos fiscales del vendedor tal como se guardan en `support_documents.provider`. */
export interface ProveedorSoporte {
  identification_document_code: string;
  identification: string;
  dv?: string;
  trade_name?: string;
  names: string;
  address: string;
  country_code: string;
  municipality_code?: string;
  email?: string;
  phone?: string;
  legal_organization_code?: string;
}

export interface FilaProveedorSoporte {
  id: number;
  name: string;
  nit?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  supplier_type?: string | null;
  doc_type?: string | null;
  dv?: string | null;
  municipality_code?: string | null;
  identification_document_code?: string | null;
  country_code?: string | null;
  legal_organization_code?: string | null;
  trade_name?: string | null;
}

export const COLUMNAS_PROVEEDOR_SOPORTE =
  'id, name, nit, phone, email, address, supplier_type, doc_type, dv, municipality_code, identification_document_code, country_code, legal_organization_code, trade_name';

/**
 * Fila de `suppliers` → datos del vendedor del documento. Misma regla que el
 * `mapSupplierToProvider` del formulario viejo; `tipoDocDian` es
 * `mapearTipoDocADian` (se inyecta para no cargar el módulo aquí).
 */
export function proveedorDesdeFila(s: FilaProveedorSoporte, tipoDocDian: (docType: string) => string): ProveedorSoporte {
  const limpio = (v: string | null | undefined) => (v && v.trim() ? v.trim() : undefined);
  const codigo = limpio(s.identification_document_code) ?? (s.doc_type ? tipoDocDian(s.doc_type) : '31');
  const p: ProveedorSoporte = {
    identification_document_code: codigo,
    identification: (s.nit ?? '').trim(),
    names: (s.name ?? '').trim(),
    address: (s.address ?? '').trim(),
    country_code: limpio(s.country_code) ?? 'CO',
    legal_organization_code: limpio(s.legal_organization_code) ?? (s.supplier_type === 'person' ? '2' : '1'),
  };
  const opcionales: Array<[keyof ProveedorSoporte, string | undefined]> = [
    ['dv', limpio(s.dv)],
    ['trade_name', limpio(s.trade_name)],
    ['municipality_code', limpio(s.municipality_code)],
    ['email', limpio(s.email)],
    ['phone', limpio(s.phone)],
  ];
  for (const [k, v] of opcionales) if (v) (p as unknown as Record<string, string>)[k] = v;
  return p;
}

export type FaltaProveedor = 'identificacion' | 'nombre' | 'direccion';

/** Lo que la DIAN exige del vendedor (la regla del formulario viejo). */
export function faltantesProveedor(p: Partial<ProveedorSoporte> | null | undefined): FaltaProveedor[] {
  const f: FaltaProveedor[] = [];
  if (!p?.identification?.trim()) f.push('identificacion');
  if (!p?.names?.trim()) f.push('nombre');
  if (!p?.address?.trim()) f.push('direccion');
  return f;
}

// ─── Formulario ─────────────────────────────────────────────────────────────

export interface LineaFormularioSoporte {
  key: string;
  description: string;
  qty: number;
  unit_price: number;
  discount_amount: number;
  tax_rate: number;
}

export interface DatosFormularioSoporte {
  sucursal: number | null;
  proveedorId: string | null;
  faltantesProveedor: readonly FaltaProveedor[];
  emision: string;
  formaPago: '1' | '2';
  medioPago: string;
  vence: string;
  lineas: readonly LineaFormularioSoporte[];
}

export type ErroresSoporte = Record<string, string>;

/**
 * Errores por campo (código, la pantalla lo traduce). Claves: `sucursal`,
 * `proveedor`, `emision`, `medioPago`, `vence`, `lineas`, `linea.<key>`.
 */
export function validarFormularioSoporte(d: DatosFormularioSoporte): ErroresSoporte {
  const e: ErroresSoporte = {};
  if (!d.sucursal) e.sucursal = 'sucursal';
  if (!d.proveedorId) e.proveedor = 'proveedor';
  else if (d.faltantesProveedor.length > 0) e.proveedor = d.faltantesProveedor.includes('direccion') && d.faltantesProveedor.length === 1 ? 'direccion' : 'proveedorIncompleto';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.emision)) e.emision = 'emision';
  if (!d.medioPago) e.medioPago = 'medioPago';
  if (d.formaPago === '2') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.vence)) e.vence = 'vence';
    else if (d.emision && d.vence < d.emision) e.vence = 'venceAntes';
  }
  if (d.lineas.length === 0) e.lineas = 'sinLineas';
  for (const l of d.lineas) {
    if (!l.description.trim()) e[`linea.${l.key}`] = 'descripcion';
    else if (!(l.qty > 0)) e[`linea.${l.key}`] = 'cantidad';
    else if (l.unit_price < 0 || l.discount_amount < 0 || l.discount_amount > l.qty * l.unit_price) e[`linea.${l.key}`] = 'precio';
    else if (l.tax_rate < 0 || l.tax_rate > 100) e[`linea.${l.key}`] = 'impuesto';
  }
  return e;
}

// ─── Listado ────────────────────────────────────────────────────────────────

/** Filtro «Estado» del listado → estados guardados. */
export const FILTROS_ESTADO = {
  borrador: ['draft'],
  en_proceso: ['pending', 'processing', 'sent'],
  aceptado: ['accepted'],
  rechazado: ['rejected', 'failed'],
  anulado: ['cancelled'],
} as const satisfies Record<string, readonly EstadoSoporte[]>;
export type FiltroEstadoSoporte = keyof typeof FILTROS_ESTADO;

export function esFiltroEstado(v: unknown): v is FiltroEstadoSoporte {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(FILTROS_ESTADO, v);
}

/**
 * Texto de búsqueda seguro para un `or=(…ilike…)` de PostgREST: sin los
 * caracteres que rompen la expresión (coma, paréntesis, comillas, comodines
 * propios) y con un tope de largo.
 */
export function textoBusquedaSeguro(q: string | null | undefined): string {
  return (q ?? '')
    .replace(/[,()"'\\%*:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

// ─── Resolución que se usará ────────────────────────────────────────────────

export interface RangoSoporte {
  prefix: string | null;
  range_start: number | null;
  range_end: number | null;
  current_number: number | null;
  valid_until: string | null;
  alert_threshold: number | null;
}

export interface EstadoRango {
  usados: number;
  total: number;
  quedan: number;
  /** 0–100. */
  porcentaje: number;
  diasParaVencer: number | null;
  tono: 'ok' | 'por_agotar' | 'agotado' | 'por_vencer' | 'vencido';
}

const MS_DIA = 86_400_000;

/** Consumo y vigencia del rango (días entre fechas planas, sin zona). */
export function estadoRango(r: RangoSoporte, hoy: string): EstadoRango {
  const inicio = Number(r.range_start ?? 0);
  const fin = Number(r.range_end ?? 0);
  const actual = Number(r.current_number ?? inicio - 1);
  const total = Math.max(0, fin - inicio + 1);
  const usados = Math.min(total, Math.max(0, actual - inicio + 1));
  const quedan = Math.max(0, total - usados);
  const porcentaje = total > 0 ? Math.round((usados / total) * 100) : 0;
  const diasParaVencer = r.valid_until ? Math.round((Date.parse(`${r.valid_until}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / MS_DIA) : null;
  const umbral = Number(r.alert_threshold ?? 0) > 0 ? Number(r.alert_threshold) : Math.ceil(total * 0.1);
  let tono: EstadoRango['tono'] = 'ok';
  if (diasParaVencer !== null && diasParaVencer < 0) tono = 'vencido';
  else if (total > 0 && quedan === 0) tono = 'agotado';
  else if (total > 0 && quedan <= umbral) tono = 'por_agotar';
  else if (diasParaVencer !== null && diasParaVencer <= 30) tono = 'por_vencer';
  return { usados, total, quedan, porcentaje, diasParaVencer, tono };
}
