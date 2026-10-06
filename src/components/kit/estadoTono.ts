/**
 * Tabla única estado → tono (docs/design/SISTEMA-BADGES.md §4).
 *
 * Regla dura: un estado = un tono en toda la app. Si dos pantallas muestran el
 * mismo estado, muestran el mismo tono. Cualquier excepción se documenta en
 * SISTEMA-BADGES.md antes de tocar este archivo.
 *
 * Las claves están normalizadas (minúsculas, sin tildes, `_`/`-` como espacio):
 * así «Pagada», «pagada» y `paid` caen en la misma fila.
 */

export type TonoBadge = 'marca' | 'exito' | 'advertencia' | 'peligro' | 'informacion' | 'neutro';
export type AparienciaBadge = 'suave' | 'solido' | 'contorno';

export interface ResolucionEstado {
  tono: TonoBadge;
  apariencia: AparienciaBadge;
  /** Punto de color de 6 px (temperatura del CRM, sincronización). */
  punto: boolean;
  /** false si el estado no está en la tabla: se pinta neutro y conviene añadirlo. */
  conocido: boolean;
}

type Fila = readonly [TonoBadge, AparienciaBadge, boolean?];

const S = (tono: TonoBadge, punto = false): Fila => [tono, 'suave', punto];
const C = (tono: TonoBadge, punto = false): Fila => [tono, 'contorno', punto];
const SO = (tono: TonoBadge): Fila => [tono, 'solido'];

/** Estado normalizado → tono y apariencia. Ordenado como la tabla del manual. */
const TABLA: Record<string, Fila> = {
  // Borrador
  borrador: S('neutro'),
  draft: S('neutro'),
  // Emitida · Enviada · Recibida · Procesando
  emitida: S('informacion'),
  emitido: S('informacion'),
  issued: S('informacion'),
  enviada: S('informacion'),
  enviado: S('informacion'),
  sent: S('informacion'),
  recibida: S('informacion'),
  recibido: S('informacion'),
  received: S('informacion'),
  procesando: S('informacion'),
  processing: S('informacion'),
  'en proceso': S('informacion'),
  'in progress': S('informacion'),
  'en transito': S('informacion'),
  // En cola (envío a la DIAN)
  'en cola': S('informacion'),
  queued: S('informacion'),
  // Pendiente · Por cobrar
  pendiente: S('advertencia'),
  pending: S('advertencia'),
  'por cobrar': S('advertencia'),
  'por pagar': S('advertencia'),
  'por revisar': S('advertencia'),
  // Por recibir (factura de compra sin entrada a inventario) · Pendiente de pago (venta)
  'por recibir': S('advertencia'),
  'pendiente de pago': S('advertencia'),
  // Pago parcial
  'pago parcial': C('advertencia'),
  parcial: C('advertencia'),
  partial: C('advertencia'),
  'partially paid': C('advertencia'),
  // Pagada · Completado · Cobrada
  pagada: S('exito'),
  pagado: S('exito'),
  paid: S('exito'),
  completado: S('exito'),
  completada: S('exito'),
  completed: S('exito'),
  cobrada: S('exito'),
  cobrado: S('exito'),
  // Al día · Activo · Aceptada · Ganada · Conectado · Confirmado · Abierta (caja)
  'al dia': S('exito'),
  current: S('exito'),
  activo: S('exito'),
  activa: S('exito'),
  active: S('exito'),
  aceptada: S('exito'),
  aceptado: S('exito'),
  accepted: S('exito'),
  ganada: S('exito'),
  won: S('exito'),
  conectado: S('exito'),
  conectada: S('exito'),
  connected: S('exito'),
  confirmado: S('exito'),
  confirmada: S('exito'),
  confirmed: S('exito'),
  abierta: S('exito'),
  abierto: S('exito'),
  open: S('exito'),
  aplicado: S('exito'),
  aplicada: S('exito'),
  // Vencida · Rechazada · Fallido · Perdida · Error
  vencida: S('peligro'),
  vencido: S('peligro'),
  overdue: S('peligro'),
  rechazada: S('peligro'),
  rechazado: S('peligro'),
  rejected: S('peligro'),
  fallido: S('peligro'),
  fallida: S('peligro'),
  failed: S('peligro'),
  perdida: S('peligro'),
  perdido: S('peligro'),
  lost: S('peligro'),
  error: S('peligro'),
  // Anulada: mismo matiz que Vencida, el contorno la separa
  anulada: C('peligro'),
  anulado: C('peligro'),
  void: C('peligro'),
  voided: C('peligro'),
  // Eliminado (baja lógica de un registro, p. ej. products.status = 'deleted'): como Anulada
  eliminado: C('peligro'),
  eliminada: C('peligro'),
  deleted: C('peligro'),
  // Inactivo · Cerrado · Usado · Cancelado · Procesado · Desconocido
  inactivo: S('neutro'),
  inactiva: S('neutro'),
  inactive: S('neutro'),
  cerrado: S('neutro'),
  cerrada: S('neutro'),
  closed: S('neutro'),
  usado: S('neutro'),
  usada: S('neutro'),
  used: S('neutro'),
  cancelado: S('neutro'),
  cancelada: S('neutro'),
  cancelled: S('neutro'),
  canceled: S('neutro'),
  procesado: S('neutro'),
  procesada: S('neutro'),
  processed: S('neutro'),
  desconocido: S('neutro'),
  unknown: S('neutro'),
  descontinuado: S('neutro'),
  discontinued: S('neutro'),
  archivado: S('neutro'),
  archived: S('neutro'),
  'sin seguimiento': S('neutro'),
  // No aplica (recepción de una factura sin productos) · Castigada (cartera dada de baja)
  'no aplica': S('neutro'),
  castigada: S('neutro'),
  castigado: S('neutro'),
  'written off': S('neutro'),
  // Reembolsado · Convertida · Clawback · Devuelta (venta con devolución)
  reembolsado: C('informacion'),
  reembolsada: C('informacion'),
  refunded: C('informacion'),
  convertida: C('informacion'),
  convertido: C('informacion'),
  converted: C('informacion'),
  clawback: C('informacion'),
  devuelta: C('informacion'),
  devuelto: C('informacion'),
  returned: C('informacion'),
  'devuelta parcial': C('informacion'),
  'devuelto parcial': C('informacion'),
  'partially returned': C('informacion'),
  // Crítico · Alta prioridad · Alto riesgo · Agotado (estado dominante)
  critico: SO('peligro'),
  critica: SO('peligro'),
  'alta prioridad': SO('peligro'),
  'alto riesgo': SO('peligro'),
  agotado: SO('peligro'),
  'out of stock': SO('peligro'),
  // Urgente · Media prioridad · Riesgo medio · En espera
  urgente: S('advertencia'),
  'media prioridad': S('advertencia'),
  'riesgo medio': S('advertencia'),
  'en espera': S('advertencia'),
  'on hold': S('advertencia'),
  // Baja prioridad · Riesgo bajo · Normal
  'baja prioridad': S('informacion'),
  'riesgo bajo': S('informacion'),
  normal: S('informacion'),
  // Sucursal y plan
  'todas las sucursales': S('marca'),
  nuevo: C('marca'),
  nueva: C('marca'),
  // Offline
  'pendiente de sincronizar': C('advertencia', true),
  'sin conexion': C('neutro', true),
  // Tipo de cliente
  empresa: S('informacion'),
  persona: S('neutro'),
  // Producto en el POS
  personalizable: S('informacion'),
  // Informativos de seriales (no son estados)
  'trazabilidad activa': C('informacion'),
  'auto generacion': C('informacion'),
  'garantia vigente': C('informacion'),
  // Temperatura del CRM
  frio: S('informacion', true),
  tibio: S('advertencia', true),
  caliente: S('peligro', true),
  // Métodos de pago: categorías, nunca sólido
  efectivo: C('neutro'),
  transferencia: C('neutro'),
  tarjeta: C('neutro'),
  cheque: C('neutro'),
  // ── Sitio web (Figma A/07a, B/02 y áreas del módulo, 2026-10-06; SISTEMA-BADGES.md §4)
  // Publicación del sitio: siempre con punto (PublishStatusBadge).
  publicado: S('exito', true),
  publicada: S('exito', true),
  published: S('exito', true),
  'cambios sin publicar': S('advertencia', true),
  'guardado en borrador': S('neutro', true),
  guardando: S('informacion', true),
  programado: S('informacion', true),
  programada: S('informacion', true),
  scheduled: S('informacion', true),
  'sin publicar': S('neutro', true),
  'no se pudo publicar': S('peligro', true),
  // Dominios (DomainStatusBadge): «Pendiente» de un dominio es neutro (aún no hay nada que hacer),
  // por eso su clave es `dns pendiente` y no choca con el «Pendiente» ámbar de cartera.
  'verificando dns': S('informacion'),
  'activo ssl': S('exito'),
  'mal configurado': S('peligro'),
  'vence pronto': S('advertencia'),
  'dns pendiente': S('neutro'),
  // Registros DNS (DnsRecordRow)
  correcto: S('exito'),
  'otro valor': S('peligro'),
  'aun no aparece': S('advertencia'),
  'solo si lo pide': C('neutro'),
  // Tableros del módulo (Ventas en línea, Legales, SEO, Carta, Sedes)
  configurado: S('exito'),
  configurada: S('exito'),
  falta: S('peligro'),
  opcional: C('neutro'),
  verificado: S('exito'),
  verificada: S('exito'),
  bien: S('exito'),
  mejorable: S('advertencia'),
  'no conectado': S('neutro'),
  heredado: C('neutro'),
  personalizado: S('marca'),
  visible: S('exito'),
  oculto: S('neutro'),
  oculta: S('neutro'),
  'visible ahora': S('exito', true),
  'fuera de horario': S('neutro', true),
  disponible: S('exito'),
  'agotado hoy': S('advertencia'),
  'en uso': S('marca'),
  // Documento sin factura electrónica: atributo, no estado (Figma 421:167503, «Sin FE»)
  'sin fe': C('neutro'),
};

/**
 * Etiqueta en español para los valores que la base de datos guarda en inglés.
 * Si el valor ya viene en español, se muestra tal cual (con mayúscula inicial).
 */
const ETIQUETA_DB: Record<string, string> = {
  draft: 'Borrador',
  issued: 'Emitida',
  sent: 'Enviada',
  received: 'Recibida',
  processing: 'Procesando',
  'in progress': 'En proceso',
  pending: 'Pendiente',
  partial: 'Pago parcial',
  'partially paid': 'Pago parcial',
  paid: 'Pagada',
  completed: 'Completado',
  active: 'Activo',
  accepted: 'Aceptada',
  won: 'Ganada',
  connected: 'Conectado',
  confirmed: 'Confirmado',
  open: 'Abierta',
  overdue: 'Vencida',
  rejected: 'Rechazada',
  failed: 'Fallido',
  lost: 'Perdida',
  error: 'Error',
  void: 'Anulada',
  voided: 'Anulada',
  inactive: 'Inactivo',
  closed: 'Cerrada',
  used: 'Usado',
  cancelled: 'Cancelado',
  canceled: 'Cancelado',
  processed: 'Procesado',
  unknown: 'Desconocido',
  discontinued: 'Descontinuado',
  archived: 'Archivado',
  deleted: 'Eliminado',
  refunded: 'Reembolsado',
  converted: 'Convertida',
  'out of stock': 'Agotado',
  'on hold': 'En espera',
  current: 'Al día',
  queued: 'En cola',
  returned: 'Devuelta',
  'partially returned': 'Devuelta parcial',
  'written off': 'Castigada',
  published: 'Publicado',
  scheduled: 'Programado',
};

/**
 * Normaliza un estado para buscarlo en la tabla: minúsculas, sin tildes,
 * `_`/`-` como espacio y sin el contador de días del final
 * («Vencida 12 d», «Vencida (12 d)» → «vencida»).
 */
export function normalizarEstado(estado: string): string {
  return estado
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s*[(·]?\s*\d+\s*(d|dias?)?\s*\)?\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resuelve el tono de un estado. Un estado desconocido es neutro·suave. */
export function resolverEstado(estado: string | null | undefined): ResolucionEstado {
  const clave = normalizarEstado(estado ?? '');
  const fila = TABLA[clave];
  if (!fila) return { tono: 'neutro', apariencia: 'suave', punto: false, conocido: false };
  return { tono: fila[0], apariencia: fila[1], punto: fila[2] ?? false, conocido: true };
}

/** Texto que se muestra: el valor en español, o su traducción si viene de la BD en inglés. */
export function etiquetaEstado(estado: string | null | undefined): string {
  const original = (estado ?? '').trim();
  if (!original) return '—';
  const traducida = ETIQUETA_DB[normalizarEstado(original)];
  if (traducida) {
    // Conserva el contador de días del original («overdue 12 d» → «Vencida 12 d»).
    const sufijo = original.match(/\s*\(?\d+\s*(d|días?|dias?)?\)?\s*$/iu)?.[0] ?? '';
    return `${traducida}${sufijo}`;
  }
  return original.charAt(0).toUpperCase() + original.slice(1);
}

/** Para auditorías y tests: los estados que la tabla conoce. */
export const ESTADOS_CONOCIDOS: readonly string[] = Object.keys(TABLA);

// ── Traducción ────────────────────────────────────────────────────────────
// La etiqueta de un estado conocido sale de `kit.estados.<clave>` (messages/*.json).
// La clave es la forma en español normalizada, con `_` por espacio: `pagada`,
// `pago_parcial`, `al_dia`. Un valor de la BD en inglés (`paid`) usa la clave
// de su traducción al español (`pagada`).

const SUFIJO_DIAS = /\s*[(·]?\s*\d+\s*(d|días?|dias?)?\s*\)?\s*$/iu;

function aClave(normalizado: string): string {
  return normalizado.replace(/ /g, '_');
}

/** Forma en español (normalizada) de un estado: el propio valor o su traducción de la BD. */
function espanolDe(normalizado: string): string {
  const traducida = ETIQUETA_DB[normalizado];
  return traducida ? normalizarEstado(traducida) : normalizado;
}

/**
 * Clave de traducción de un estado conocido (`kit.estados.<clave>`) y el
 * contador de días que traía («Vencida 12 d» → `vencida` + « 12 d»).
 * `null` si el estado no está en la tabla: se muestra tal cual.
 */
export function claveEtiquetaEstado(estado: string | null | undefined): { clave: string; sufijo: string } | null {
  const original = (estado ?? '').trim();
  if (!original) return null;
  const espanol = espanolDe(normalizarEstado(original));
  if (!(espanol in TABLA)) return null;
  const sufijo = original.match(SUFIJO_DIAS)?.[0] ?? '';
  return { clave: aClave(espanol), sufijo: sufijo.trimEnd() };
}

/** Todas las claves de `kit.estados`: el test de traducciones exige las 4 lenguas. */
export const CLAVES_ETIQUETA_ESTADO: readonly string[] = Array.from(
  new Set(Object.keys(TABLA).map((k) => aClave(espanolDe(k)))),
).sort();
