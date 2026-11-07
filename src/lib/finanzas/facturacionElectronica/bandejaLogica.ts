/**
 * Bandeja de envíos a la DIAN (Figma `07 Finanzas` › Documentos v2: listo
 * `1018:91449`, servicio pendiente `1018:92498`, detalle retenido `1019:89805`
 * y rechazado `1019:89915`, lote `1023:97325`, móvil `1019:90042`).
 *
 * Lógica pura (sin red ni React) que comparten la ruta `GET /api/factus/jobs`
 * y la pantalla: de la fila cruda de `electronic_invoicing_jobs` a una fila de
 * la bandeja, el estado que ve la persona (con «Retenido», que la tabla guarda
 * como `pending` + `hold_reason`), el próximo paso, las acciones que admite el
 * servidor y los filtros de cada vista.
 *
 * Las acciones siguen EXACTAMENTE las guardas de las rutas que ya existían:
 * reintentar = `failed | cancelled | rejected` (POST /api/factus/jobs),
 * cancelar = `pending | failed` (DELETE), enviar con la fecha de hoy = retenido
 * (POST /api/factus/config `liberar`). Si la UI ofreciera otra cosa, el
 * servidor respondería 409.
 */

export type TipoDocumentoFe = 'invoice' | 'credit_note' | 'debit_note' | 'support_document';
export const TIPOS_DOCUMENTO_FE: readonly TipoDocumentoFe[] = ['invoice', 'credit_note', 'debit_note', 'support_document'];

/** Estado de la cola tal como lo guarda la tabla (CHECK de `electronic_invoicing_jobs.status`). */
export type EstadoCola = 'pending' | 'processing' | 'sent' | 'accepted' | 'rejected' | 'failed' | 'cancelled';

/** Estado que ve la persona. */
export type EstadoEnvio =
  | 'retenido'
  | 'en_cola'
  | 'reintento'
  | 'procesando'
  | 'enviado'
  | 'aceptado'
  | 'rechazado'
  | 'error'
  | 'cancelado';

export const ESTADOS_ENVIO: readonly EstadoEnvio[] = [
  'retenido',
  'en_cola',
  'reintento',
  'procesando',
  'enviado',
  'aceptado',
  'rechazado',
  'error',
  'cancelado',
];

export type Vista = 'todos' | 'atender' | 'aceptados';
export const VISTAS: readonly Vista[] = ['todos', 'atender', 'aceptados'];

export type TonoEnvio = 'exito' | 'advertencia' | 'peligro' | 'informacion' | 'neutro';

export const TONO_ESTADO: Readonly<Record<EstadoEnvio, TonoEnvio>> = {
  retenido: 'advertencia',
  en_cola: 'informacion',
  reintento: 'peligro',
  procesando: 'informacion',
  enviado: 'informacion',
  aceptado: 'exito',
  rechazado: 'peligro',
  error: 'peligro',
  cancelado: 'neutro',
};

/** Fila de la bandeja (lo que devuelve la ruta en `filas`). */
export interface FilaEnvio {
  id: string;
  tipo: TipoDocumentoFe;
  /** `invoice_id` (factura, nota crédito o débito) o `support_document_id`. */
  documentoId: string | null;
  numero: string | null;
  tercero: string | null;
  terceroDoc: string | null;
  terceroId: string | null;
  total: number | null;
  moneda: string | null;
  sucursalId: number | null;
  estadoCola: EstadoCola;
  retenido: boolean;
  motivoRetencion: string | null;
  intentos: number;
  maxIntentos: number;
  proximoIntento: string | null;
  errorCodigo: string | null;
  errorMensaje: string | null;
  /** Mensajes de la DIAN en la respuesta (sin el JSON). */
  mensajesDian: string[];
  codigoUnico: string | null;
  numeroDian: string | null;
  creado: string;
  actualizado: string;
  procesado: string | null;
  fechaDocumento: string | null;
}

export function estadoEnvio(f: Pick<FilaEnvio, 'estadoCola' | 'retenido' | 'intentos'>): EstadoEnvio {
  switch (f.estadoCola) {
    case 'pending':
      if (f.retenido) return 'retenido';
      return f.intentos > 0 ? 'reintento' : 'en_cola';
    case 'processing':
      return 'procesando';
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
      return 'en_cola';
  }
}

export type ProximoPaso = 'confirmar' | 'corregir' | 'reintento_programado' | 'envio_pronto' | 'esperando' | 'reintentar' | 'ninguno';

export function proximoPaso(estado: EstadoEnvio): ProximoPaso {
  switch (estado) {
    case 'retenido':
      return 'confirmar';
    case 'rechazado':
      return 'corregir';
    case 'reintento':
      return 'reintento_programado';
    case 'en_cola':
      return 'envio_pronto';
    case 'procesando':
    case 'enviado':
      return 'esperando';
    case 'error':
      return 'reintentar';
    default:
      return 'ninguno';
  }
}

/** Estados de la cola desde los que las rutas aceptan cada acción (copiados de `/api/factus/jobs`). */
export const COLA_REINTENTABLE: readonly EstadoCola[] = ['failed', 'cancelled', 'rejected'];
export const COLA_CANCELABLE: readonly EstadoCola[] = ['pending', 'failed'];

export interface PermisosBandeja {
  /** finance.create: reintentar. */
  crear: boolean;
  /** finance.void: cancelar el envío. */
  anular: boolean;
  /** administrador o finance.approve: enviar un retenido con la fecha de hoy. */
  aprobar: boolean;
}

export interface AccionesEnvio {
  enviarHoy: boolean;
  /** Por qué no se puede enviar un retenido (servicio sin activar o sin permiso). */
  motivoEnviarHoy: 'servicio_inactivo' | 'sin_permiso' | null;
  reintentar: boolean;
  cancelar: boolean;
  descargar: boolean;
  verDocumento: boolean;
}

export function accionesEnvio(f: FilaEnvio, permisos: PermisosBandeja, servicioActivo: boolean): AccionesEnvio {
  const estado = estadoEnvio(f);
  const retenido = estado === 'retenido';
  const motivoEnviarHoy = !retenido ? null : !permisos.aprobar ? 'sin_permiso' : !servicioActivo ? 'servicio_inactivo' : null;
  return {
    enviarHoy: retenido && motivoEnviarHoy === null,
    motivoEnviarHoy,
    reintentar: permisos.crear && COLA_REINTENTABLE.includes(f.estadoCola),
    cancelar: permisos.anular && COLA_CANCELABLE.includes(f.estadoCola),
    descargar: estado === 'aceptado' && !!f.documentoId,
    verDocumento: !!f.documentoId,
  };
}

/** Reparto de una selección para las acciones en lote. */
export function repartoLote(
  filas: readonly FilaEnvio[],
  permisos: PermisosBandeja,
  servicioActivo: boolean,
): { retenidos: FilaEnvio[]; reintentables: FilaEnvio[]; cancelables: FilaEnvio[] } {
  const retenidos: FilaEnvio[] = [];
  const reintentables: FilaEnvio[] = [];
  const cancelables: FilaEnvio[] = [];
  for (const f of filas) {
    const a = accionesEnvio(f, permisos, servicioActivo);
    if (a.enviarHoy) retenidos.push(f);
    if (a.reintentar) reintentables.push(f);
    if (a.cancelar) cancelables.push(f);
  }
  return { retenidos, reintentables, cancelables };
}

/** Máximo de documentos que se liberan en una sola petición. */
export const MAX_LOTE = 50;

// ── Filtros de servidor ───────────────────────────────────────────────────────

/** Operación simple sobre la consulta de PostgREST. `or` es el texto de `.or()`. */
export type FiltroCola =
  | { op: 'eq'; col: string; val: string | number }
  | { op: 'in'; col: string; val: readonly string[] }
  | { op: 'is_null'; col: string }
  | { op: 'not_null'; col: string }
  | { op: 'gt'; col: string; val: number }
  | { op: 'or'; val: string };

const RETENIDO_OR = 'and(status.eq.pending,hold_reason.not.is.null)';

/** Filtros de una vista (pestaña). */
export function filtrosVista(vista: Vista): FiltroCola[] {
  if (vista === 'aceptados') return [{ op: 'eq', col: 'status', val: 'accepted' }];
  if (vista === 'atender') return [{ op: 'or', val: `${RETENIDO_OR},status.in.(rejected,failed)` }];
  return [];
}

/** Filtros de un estado de la persona. */
export function filtrosEstado(estado: EstadoEnvio): FiltroCola[] {
  switch (estado) {
    case 'retenido':
      return [{ op: 'eq', col: 'status', val: 'pending' }, { op: 'not_null', col: 'hold_reason' }];
    case 'en_cola':
      return [{ op: 'eq', col: 'status', val: 'pending' }, { op: 'is_null', col: 'hold_reason' }, { op: 'eq', col: 'attempt_count', val: 0 }];
    case 'reintento':
      return [{ op: 'eq', col: 'status', val: 'pending' }, { op: 'is_null', col: 'hold_reason' }, { op: 'gt', col: 'attempt_count', val: 0 }];
    case 'procesando':
      return [{ op: 'eq', col: 'status', val: 'processing' }];
    case 'enviado':
      return [{ op: 'eq', col: 'status', val: 'sent' }];
    case 'aceptado':
      return [{ op: 'eq', col: 'status', val: 'accepted' }];
    case 'rechazado':
      return [{ op: 'eq', col: 'status', val: 'rejected' }];
    case 'error':
      return [{ op: 'eq', col: 'status', val: 'failed' }];
    case 'cancelado':
      return [{ op: 'eq', col: 'status', val: 'cancelled' }];
  }
}

export function esVista(v: unknown): v is Vista {
  return typeof v === 'string' && (VISTAS as readonly string[]).includes(v);
}
export function esEstadoEnvio(v: unknown): v is EstadoEnvio {
  return typeof v === 'string' && (ESTADOS_ENVIO as readonly string[]).includes(v);
}
export function esTipoDocumento(v: unknown): v is TipoDocumentoFe {
  return typeof v === 'string' && (TIPOS_DOCUMENTO_FE as readonly string[]).includes(v);
}

/**
 * Búsqueda segura para `ilike` y `.or()` de PostgREST: sin comas, paréntesis,
 * comodines ni comillas (romperían la sintaxis o ampliarían el patrón), máximo
 * 60 caracteres. Vacía → null.
 */
export function limpiarBusqueda(q: string | null | undefined): string | null {
  if (!q) return null;
  const limpio = q.replace(/[,()%*_\\"'`:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return limpio.length >= 2 ? limpio : null;
}

/** Día `YYYY-MM-DD` válido o null. */
export function diaValido(v: string | null | undefined): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

// ── De la fila cruda a la fila de la bandeja ──────────────────────────────────

type Uno<T> = T | T[] | null | undefined;
function uno<T>(v: Uno<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface JobCrudo {
  id: string;
  document_type: string;
  invoice_id?: string | null;
  support_document_id?: string | null;
  status: string;
  hold_reason?: string | null;
  attempt_count?: number | null;
  max_attempts?: number | null;
  next_retry_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  response_payload?: unknown;
  cufe?: string | null;
  created_at: string;
  updated_at?: string | null;
  processed_at?: string | null;
  invoice?: Uno<{
    id?: string;
    number?: string | null;
    total?: number | string | null;
    currency?: string | null;
    branch_id?: number | null;
    issue_date?: string | null;
    customer_id?: string | null;
    customer?: Uno<{ full_name?: string | null; first_name?: string | null; last_name?: string | null; company_name?: string | null; doc_number?: string | null }>;
  }>;
  support_document?: Uno<{
    id?: string;
    number?: string | null;
    reference_code?: string | null;
    total?: number | string | null;
    currency?: string | null;
    branch_id?: number | null;
    issue_date?: string | null;
    supplier_id?: number | null;
  }>;
}

export interface ProveedorBandeja {
  nombre: string | null;
  nit: string | null;
}

/** Mensajes de la DIAN que trae la respuesta (`data.errors`, `errors`, `message`), sin el JSON. */
export function mensajesDeRespuesta(respuesta: unknown): string[] {
  if (!respuesta || typeof respuesta !== 'object') return [];
  const r = respuesta as Record<string, unknown>;
  const data = (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>;
  const fuentes = [data.errors, r.errors, r.message];
  const salida: string[] = [];
  for (const f of fuentes) {
    if (!f) continue;
    if (typeof f === 'string') salida.push(f);
    else if (Array.isArray(f)) salida.push(...f.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));
    else if (typeof f === 'object') {
      for (const v of Object.values(f as Record<string, unknown>)) {
        if (Array.isArray(v)) salida.push(...v.map(String));
        else if (v !== null && v !== undefined) salida.push(String(v));
      }
    }
  }
  return salida.map(sinProveedor).filter((m) => m.length > 0).slice(0, 5);
}

/** La persona nunca ve el nombre del proveedor tecnológico ni la palabra «job». */
export function sinProveedor(mensaje: string): string {
  return mensaje
    .replace(/factus/gi, 'proveedor')
    .replace(/\bjobs?\b/gi, 'envío')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export function normalizarJob(j: JobCrudo, proveedores: ReadonlyMap<number, ProveedorBandeja> = new Map()): FilaEnvio {
  const factura = uno(j.invoice);
  const soporte = uno(j.support_document);
  const cliente = uno(factura?.customer);
  const proveedor = soporte?.supplier_id != null ? proveedores.get(Number(soporte.supplier_id)) ?? null : null;
  const nombreCliente =
    texto(cliente?.company_name) ?? texto(cliente?.full_name) ?? texto([cliente?.first_name, cliente?.last_name].filter(Boolean).join(' '));
  const data = ((j.response_payload as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
  const tipo = (TIPOS_DOCUMENTO_FE as readonly string[]).includes(j.document_type) ? (j.document_type as TipoDocumentoFe) : 'invoice';
  return {
    id: j.id,
    tipo,
    documentoId: j.invoice_id ?? j.support_document_id ?? null,
    numero: texto(factura?.number) ?? texto(soporte?.number) ?? texto(soporte?.reference_code),
    tercero: factura ? nombreCliente : proveedor?.nombre ?? null,
    terceroDoc: factura ? texto(cliente?.doc_number) : proveedor?.nit ?? null,
    terceroId: factura ? texto(factura.customer_id) : soporte?.supplier_id != null ? String(soporte.supplier_id) : null,
    total: numero(factura?.total ?? soporte?.total),
    moneda: texto(factura?.currency ?? soporte?.currency),
    sucursalId: numero(factura?.branch_id ?? soporte?.branch_id),
    estadoCola: j.status as EstadoCola,
    retenido: !!texto(j.hold_reason),
    motivoRetencion: texto(j.hold_reason),
    intentos: Number(j.attempt_count ?? 0),
    maxIntentos: Number(j.max_attempts ?? 5),
    proximoIntento: j.next_retry_at ?? null,
    errorCodigo: texto(j.error_code),
    errorMensaje: j.error_message ? sinProveedor(j.error_message) : null,
    mensajesDian: j.status === 'accepted' || j.status === 'rejected' || j.status === 'failed' ? mensajesDeRespuesta(j.response_payload) : [],
    codigoUnico: texto(j.cufe),
    numeroDian: texto(data.number),
    creado: j.created_at,
    actualizado: j.updated_at ?? j.created_at,
    procesado: j.processed_at ?? null,
    fechaDocumento: factura?.issue_date ?? soporte?.issue_date ?? null,
  };
}

// ── Respuesta en lenguaje humano ──────────────────────────────────────────────

/**
 * Clave i18n de la última respuesta (`bandeja.respuesta.<clave>`) y, si la DIAN
 * dijo algo concreto, ese texto (ya sin el nombre del proveedor).
 */
export function respuestaVisible(f: FilaEnvio): { clave: string; texto: string | null } {
  const estado = estadoEnvio(f);
  if (estado === 'retenido') return { clave: 'retenido', texto: null };
  if (estado === 'aceptado') return { clave: 'aceptado', texto: null };
  if (estado === 'cancelado') return { clave: 'cancelado', texto: null };
  if (estado === 'en_cola') return { clave: 'enCola', texto: null };
  if (estado === 'procesando' || estado === 'enviado') return { clave: 'esperando', texto: null };
  const codigo = f.errorCodigo ?? '';
  const dian = f.mensajesDian[0] ?? null;
  if (codigo === 'servicio_no_activo') return { clave: 'servicioNoActivo', texto: null };
  if (codigo === 'datos_incompletos') return { clave: 'datosIncompletos', texto: f.errorMensaje };
  if (codigo === 'esperando_factura') return { clave: 'esperandoFactura', texto: null };
  if (codigo === 'factus_sin_respuesta' || /^factus_http_5\d\d$/.test(codigo)) return { clave: 'sinRespuesta', texto: null };
  if (/^factus_http_4\d\d$/.test(codigo)) return { clave: 'rechazo', texto: dian ?? f.errorMensaje };
  return { clave: 'error', texto: dian ?? f.errorMensaje };
}

// ── Línea de tiempo del detalle ───────────────────────────────────────────────

export interface EventoCrudo {
  id: string;
  event_type: string;
  event_code?: string | null;
  event_message?: string | null;
  created_at: string;
}

export type TipoPaso = 'creado' | 'retenido' | 'enviado' | 'aceptado' | 'rechazado' | 'error' | 'reintento' | 'liberado' | 'cancelado' | 'pendiente';

export interface PasoLinea {
  tipo: TipoPaso;
  fecha: string | null;
  /** Texto de la DIAN o del sistema (sin proveedor), si aplica. */
  detalle: string | null;
  /** El paso aún no ocurrió (último de la línea: «espera tu confirmación», «se envía en menos de 2 minutos»). */
  pendiente: boolean;
}

const EVENTO_A_PASO: Readonly<Record<string, TipoPaso>> = {
  sent: 'enviado',
  accepted: 'aceptado',
  rejected: 'rechazado',
  error: 'error',
  retry: 'reintento',
  cancelled: 'cancelado',
};

/**
 * Pasos del envío: creado → retenido (si aplica) → lo que registraron los
 * eventos (enviado, aceptado, rechazado, reintento manual, liberado,
 * cancelado) → lo que falta. Si no hay eventos, se infiere del estado.
 */
export function lineaDeTiempo(f: FilaEnvio, eventos: readonly EventoCrudo[]): PasoLinea[] {
  const pasos: PasoLinea[] = [{ tipo: 'creado', fecha: f.creado, detalle: null, pendiente: false }];
  const estado = estadoEnvio(f);
  const ordenados = [...eventos].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const huboRetencion = f.retenido || ordenados.some((e) => /autorizado|retenid/i.test(e.event_message ?? ''));
  if (huboRetencion) pasos.push({ tipo: 'retenido', fecha: f.creado, detalle: null, pendiente: false });

  for (const e of ordenados) {
    let tipo: TipoPaso | undefined = EVENTO_A_PASO[e.event_type];
    if (e.event_type === 'notification') tipo = /autorizado/i.test(e.event_message ?? '') ? 'liberado' : undefined;
    if (!tipo) continue;
    const detalle = tipo === 'rechazado' || tipo === 'error' ? (e.event_message ? sinProveedor(e.event_message) : null) : null;
    pasos.push({ tipo, fecha: e.created_at, detalle, pendiente: false });
  }

  const tiene = (t: TipoPaso) => pasos.some((p) => p.tipo === t);
  // Sin eventos (o eventos incompletos): el resultado sale del estado del envío.
  if (estado === 'aceptado' && !tiene('aceptado')) pasos.push({ tipo: 'aceptado', fecha: f.procesado ?? f.actualizado, detalle: null, pendiente: false });
  if (estado === 'rechazado' && !tiene('rechazado'))
    pasos.push({ tipo: 'rechazado', fecha: f.procesado ?? f.actualizado, detalle: f.mensajesDian[0] ?? f.errorMensaje, pendiente: false });
  if ((estado === 'error' || estado === 'reintento') && !tiene('error'))
    pasos.push({ tipo: 'error', fecha: f.actualizado, detalle: f.mensajesDian[0] ?? f.errorMensaje, pendiente: false });
  if (estado === 'cancelado' && !tiene('cancelado')) pasos.push({ tipo: 'cancelado', fecha: f.actualizado, detalle: null, pendiente: false });

  if (estado === 'retenido' || estado === 'en_cola' || estado === 'reintento' || estado === 'procesando' || estado === 'enviado') {
    pasos.push({ tipo: 'pendiente', fecha: estado === 'reintento' ? f.proximoIntento : null, detalle: null, pendiente: true });
  }
  return pasos;
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

export interface ConteosBandeja {
  enCola: number;
  retenidos: number;
  aceptadosMes: number;
  rechazadosMes: number;
  erroresMes: number;
  rechazados: number;
  conError: number;
  todos: number;
  atender: number;
  aceptados: number;
}

/** Porcentaje de éxito del mes (aceptados sobre lo que obtuvo respuesta); null sin datos. */
export function tasaExito(c: Pick<ConteosBandeja, 'aceptadosMes' | 'rechazadosMes' | 'erroresMes'>): number | null {
  const base = c.aceptadosMes + c.rechazadosMes + c.erroresMes;
  if (base === 0) return null;
  return Math.round((c.aceptadosMes / base) * 1000) / 10;
}

/** Primer día del mes de un día `YYYY-MM-DD`. */
export function inicioMes(dia: string): string {
  return `${dia.slice(0, 7)}-01`;
}
