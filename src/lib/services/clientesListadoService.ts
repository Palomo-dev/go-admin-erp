/**
 * Listado de clientes (/app/clientes y /app/crm/clientes).
 *
 * Todo lo que escala con el número de clientes va al servidor en RPC
 * transaccionales (migraciones 20260924001000 y 20260924001500):
 *
 * - `fn_clientes_listado`: búsqueda, filtros, orden y paginación, con saldo,
 *   cartera, compras (ventas + folios cerrados) y plazo agregados en la misma
 *   llamada. Nunca N consultas por fila.
 * - `fn_clientes_resumen`: KPIs y subtítulo («N clientes · N con saldo · N vencidos»).
 * - `fn_clientes_opciones_filtro`: roles, etiquetas y municipios de TODA la
 *   organización (antes salían de la página cargada).
 * - `fn_clientes_ids`: «Seleccionar los N».
 * - `fn_clientes_etiqueta_masiva`, `fn_clientes_rol_masivo`,
 *   `fn_clientes_cambiar_estado`: un UPDATE, permiso resuelto en el servidor.
 * - `fn_clientes_eliminar`: solo borra clientes sin NINGUNA relación; el
 *   resto se devuelve con sus relaciones para ofrecer «Marcar inactivo».
 *
 * La organización viaja como parámetro porque las RPC la validan contra la
 * sesión (`fn_assert_acceso_org`): un id ajeno responde 42501.
 */
import { supabase } from '@/lib/supabase/config';
import { toPlainDate } from '@/lib/utils/dateDisplay';

// ── Tipos ────────────────────────────────────────────────────────────────────

export type EstadoCartera = 'vencido' | 'parcial' | 'pendiente' | 'al_dia' | 'sin_compras' | 'lead';
export type EstadoCliente = 'active' | 'inactive' | 'merged';

export interface FilaCliente {
  id: string;
  customer_type: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  company_name: string | null;
  trade_name: string | null;
  email: string | null;
  phone: string | null;
  identification_type: string | null;
  identification_number: string | null;
  dv: number | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  tags: string[] | null;
  roles: string[] | null;
  preferences: unknown;
  avatar_url: string | null;
  fiscal_responsibilities: string[] | null;
  fiscal_municipality_id: string | null;
  municipio_nombre: string | null;
  parent_customer_id: string | null;
  lifecycle_stage: string | null;
  status: EstadoCliente;
  created_at: string | null;
  contacto_nombre: string | null;
  contacto_cargo: string | null;
  saldo: number;
  facturas_abiertas: number;
  facturas_vencidas: number;
  dias_vencido: number;
  estado_cartera: EstadoCartera;
  compras: number;
  total_compras: number;
  ultima_compra: string | null;
  dias_desde_ultima_compra: number | null;
  plazo_dias: number | null;
  total_filas: number;
}

export interface ResumenClientes {
  total: number;
  inactivos: number;
  nuevos_mes: number;
  con_saldo: number;
  vencidos: number;
  cartera_total: number;
  cartera_vencida: number;
}

export interface OpcionFiltro {
  valor: string;
  etiqueta?: string;
  cantidad?: number;
}

export interface OpcionesFiltroClientes {
  roles: OpcionFiltro[];
  etiquetas: OpcionFiltro[];
  municipios: OpcionFiltro[];
}

/** Criterios del listado tal como se leen de la URL (useListadoServidor). */
export interface CriteriosClientes {
  busqueda?: string;
  tipo?: string | null;
  rol?: string | null;
  etiqueta?: string | null;
  municipio?: string | null;
  saldo?: string | null;
  estado?: string | null;
}

export interface ClasificacionEliminar {
  eliminados: number;
  eliminables: string[];
  bloqueados: { id: string; nombre: string | null; relaciones: string[] }[];
}

// ── Claves de la URL → parámetros de la RPC ─────────────────────────────────

/** Filtros admitidos en la URL (lista blanca de useListadoServidor). */
export const FILTROS_CLIENTES = ['tipo', 'rol', 'etiqueta', 'municipio', 'saldo', 'estado'] as const;
export const CAMPOS_ORDEN_CLIENTES = ['nombre', 'saldo', 'ventas', 'ultima_compra', 'creado'] as const;

const TIPO_URL: Record<string, string> = { persona: 'person', empresa: 'company' };
const SALDO_URL = new Set(['con_saldo', 'sin_saldo', 'vencido']);
const ESTADO_URL: Record<string, string> = { inactivos: 'inactive', todos: 'todos' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Traduce los valores de la URL a los de la RPC; lo desconocido se descarta. */
export function parametrosFiltro(c: CriteriosClientes): Record<string, string | null> {
  return {
    p_busqueda: c.busqueda?.trim() ? c.busqueda.trim() : null,
    p_tipo: (c.tipo && TIPO_URL[c.tipo]) || null,
    p_rol: c.rol?.trim() || null,
    p_etiqueta: c.etiqueta?.trim() || null,
    p_municipio: c.municipio && UUID.test(c.municipio) ? c.municipio : null,
    p_saldo: c.saldo && SALDO_URL.has(c.saldo) ? c.saldo : null,
    p_estado: (c.estado && ESTADO_URL[c.estado]) || 'active',
  };
}

function aNumero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizarFila(r: Record<string, unknown>): FilaCliente {
  return {
    ...(r as unknown as FilaCliente),
    saldo: aNumero(r.saldo),
    facturas_abiertas: aNumero(r.facturas_abiertas),
    facturas_vencidas: aNumero(r.facturas_vencidas),
    dias_vencido: aNumero(r.dias_vencido),
    compras: aNumero(r.compras),
    total_compras: aNumero(r.total_compras),
    total_filas: aNumero(r.total_filas),
    dias_desde_ultima_compra: r.dias_desde_ultima_compra == null ? null : aNumero(r.dias_desde_ultima_compra),
    plazo_dias: r.plazo_dias == null ? null : aNumero(r.plazo_dias),
  };
}

// ── Lecturas ────────────────────────────────────────────────────────────────

export async function listarClientes(args: {
  organizationId: number;
  branchId: number | null;
  criterios: CriteriosClientes;
  orden: { campo: string; direccion: 'asc' | 'desc' } | null;
  desde: number;
  tamano: number;
  ids?: string[];
}): Promise<{ filas: FilaCliente[]; total: number }> {
  const { data, error } = await supabase.rpc('fn_clientes_listado', {
    p_org: args.organizationId,
    p_branch: args.branchId,
    ...parametrosFiltro(args.criterios),
    // Con texto y sin orden elegido: relevancia de la búsqueda única de clientes.
    p_orden: args.orden?.campo ?? (args.criterios.busqueda?.trim() ? 'relevancia' : 'nombre'),
    p_direccion: args.orden?.direccion ?? 'asc',
    p_limite: args.tamano,
    p_desplazamiento: args.desde,
    p_ids: args.ids ?? null,
  });
  if (error) throw error;
  const filas = ((data as Record<string, unknown>[] | null) ?? []).map(normalizarFila);
  return { filas, total: filas[0]?.total_filas ?? 0 };
}

export async function obtenerResumenClientes(organizationId: number, branchId: number | null): Promise<ResumenClientes> {
  const { data, error } = await supabase.rpc('fn_clientes_resumen', { p_org: organizationId, p_branch: branchId });
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    total: aNumero(r.total),
    inactivos: aNumero(r.inactivos),
    nuevos_mes: aNumero(r.nuevos_mes),
    con_saldo: aNumero(r.con_saldo),
    vencidos: aNumero(r.vencidos),
    cartera_total: aNumero(r.cartera_total),
    cartera_vencida: aNumero(r.cartera_vencida),
  };
}

export async function obtenerOpcionesFiltroClientes(organizationId: number): Promise<OpcionesFiltroClientes> {
  const { data, error } = await supabase.rpc('fn_clientes_opciones_filtro', { p_org: organizationId });
  if (error) throw error;
  const r = (data ?? {}) as Partial<OpcionesFiltroClientes>;
  return { roles: r.roles ?? [], etiquetas: r.etiquetas ?? [], municipios: r.municipios ?? [] };
}

/** Ids de todo el filtro («Seleccionar los N»), tope 20.000. */
export async function obtenerIdsClientes(organizationId: number, branchId: number | null, criterios: CriteriosClientes): Promise<string[]> {
  const { data, error } = await supabase.rpc('fn_clientes_ids', {
    p_org: organizationId,
    p_branch: branchId,
    ...parametrosFiltro(criterios),
  });
  if (error) throw error;
  return (data as string[] | null) ?? [];
}

/**
 * Todas las filas de un criterio (exportar «todo») o de unos ids (exportar la
 * selección), en lotes de 1.000 contra la misma RPC del listado.
 */
export async function obtenerTodasLasFilas(args: {
  organizationId: number;
  branchId: number | null;
  criterios: CriteriosClientes;
  orden: { campo: string; direccion: 'asc' | 'desc' } | null;
  ids?: string[];
}): Promise<FilaCliente[]> {
  const LOTE = 1000;
  const salida: FilaCliente[] = [];
  if (args.ids) {
    // La selección puede incluir inactivos: se exporta lo seleccionado, sin filtros.
    for (let i = 0; i < args.ids.length; i += LOTE) {
      const { filas } = await listarClientes({
        ...args,
        criterios: { estado: 'todos' },
        ids: args.ids.slice(i, i + LOTE),
        desde: 0,
        tamano: LOTE,
      });
      salida.push(...filas);
    }
    return salida;
  }
  for (let desde = 0; ; desde += LOTE) {
    const { filas, total } = await listarClientes({ ...args, desde, tamano: LOTE });
    salida.push(...filas);
    if (filas.length < LOTE || salida.length >= total) break;
  }
  return salida;
}

// ── Escrituras ──────────────────────────────────────────────────────────────

export async function aplicarEtiquetaMasiva(organizationId: number, ids: string[], etiqueta: string, quitar: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('fn_clientes_etiqueta_masiva', {
    p_org: organizationId,
    p_ids: ids,
    p_etiqueta: etiqueta,
    p_quitar: quitar,
  });
  if (error) throw error;
  return aNumero(data);
}

export async function cambiarRolMasivo(organizationId: number, ids: string[], rol: string, quitar: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('fn_clientes_rol_masivo', {
    p_org: organizationId,
    p_ids: ids,
    p_rol: rol,
    p_quitar: quitar,
  });
  if (error) throw error;
  return aNumero(data);
}

export async function cambiarEstadoClientes(organizationId: number, ids: string[], estado: 'active' | 'inactive'): Promise<number> {
  const { data, error } = await supabase.rpc('fn_clientes_cambiar_estado', {
    p_org: organizationId,
    p_ids: ids,
    p_estado: estado,
  });
  if (error) throw error;
  return aNumero(data);
}

/** `confirmar = false` solo clasifica; `true` borra los que no tienen relaciones. */
export async function eliminarClientes(organizationId: number, ids: string[], confirmar: boolean): Promise<ClasificacionEliminar> {
  const { data, error } = await supabase.rpc('fn_clientes_eliminar', {
    p_org: organizationId,
    p_ids: ids,
    p_confirmar: confirmar,
  });
  if (error) throw error;
  const r = (data ?? {}) as Partial<ClasificacionEliminar>;
  return {
    eliminados: aNumero(r.eliminados),
    eliminables: r.eliminables ?? [],
    bloqueados: (r.bloqueados ?? []).map((b) => ({ ...b, relaciones: b.relaciones ?? [] })),
  };
}

/** Mensaje legible de un error de las RPC (permiso, validación). */
export function mensajeErrorClientes(err: unknown, porDefecto: string): string {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === '42501') return 'No tienes permiso para hacer esto con clientes.';
  if (e?.code === '22023' && e.message) return e.message;
  return porDefecto;
}

// ── Presentación (puro, con tests) ──────────────────────────────────────────

/** Nombre de cada tabla que impide eliminar, en palabras del usuario. */
export const ETIQUETA_RELACION: Record<string, string> = {
  invoice_sales: 'facturas',
  sales: 'ventas',
  accounts_receivable: 'cartera',
  credit_notes: 'saldos a favor',
  quotations: 'cotizaciones',
  opportunities: 'oportunidades',
  calls: 'llamadas',
  tasks: 'tareas',
  calendar_events: 'eventos de calendario',
  conversations: 'conversaciones',
  messages: 'mensajes',
  customer_channel_identities: 'canales de contacto',
  customer_addresses: 'direcciones',
  customer_company_links: 'contactos de empresa',
  customers: 'personas vinculadas',
  contact_consents: 'consentimientos',
  campaign_contacts: 'campañas',
  sequence_enrollments: 'secuencias',
  reservations: 'reservas',
  reservation_customers: 'reservas',
  memberships: 'membresías',
  class_reservations: 'reservas de clases',
  member_checkins: 'ingresos al gimnasio',
  customer_biometrics: 'huellas',
  parking_passes: 'pases de parqueadero',
  parking_vehicles: 'vehículos',
  web_orders: 'pedidos web',
  shipments: 'envíos',
  trip_tickets: 'tiquetes',
  coupons: 'cupones',
  coupon_redemptions: 'cupones redimidos',
  referrals: 'referidos',
  product_reviews: 'reseñas',
  testimonials: 'testimonios',
  warranty_claims: 'garantías',
  serial_numbers: 'seriales',
  serial_tracking_events: 'seriales',
  onboarding_instances: 'onboarding',
  voice_agent_calls: 'llamadas del agente de voz',
  voice_agent_call_attempts: 'llamadas del agente de voz',
  widget_sessions: 'chat web',
  health_score_snapshots: 'historial de salud',
  email_messages: 'correos',
  mobile_call_bridges: 'llamadas',
  restaurant_reservations: 'reservas de mesa',
  activities: 'actividades',
  notes: 'notas',
  documents: 'documentos',
};

export function relacionesLegibles(tablas: readonly string[]): string {
  const unicas = Array.from(new Set(tablas.map((t) => ETIQUETA_RELACION[t] ?? t)));
  return unicas.join(', ');
}

export function nombreCliente(f: Pick<FilaCliente, 'full_name' | 'company_name' | 'first_name' | 'last_name' | 'email'>): string {
  return (
    f.full_name?.trim() ||
    f.company_name?.trim() ||
    `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim() ||
    f.email?.trim() ||
    'Sin nombre'
  );
}

/** «NIT 901.334.221-7» / «CC 1.020.334.887»; null si no hay documento. */
export function documentoCliente(f: Pick<FilaCliente, 'identification_type' | 'identification_number' | 'dv'>): string | null {
  const numero = f.identification_number?.trim();
  if (!numero) return null;
  const tipo = (f.identification_type ?? '').trim();
  const dv = f.dv !== null && f.dv !== undefined && tipo.toUpperCase() === 'NIT' ? `-${f.dv}` : '';
  return `${tipo ? `${tipo} ` : ''}${numero}${dv}`;
}

/** Detalle de cartera bajo el saldo en el listado de escritorio: «Vencida 12 d», «Pago parcial», «Pendiente». */
export function estadoCarteraDetalle(f: Pick<FilaCliente, 'estado_cartera' | 'dias_vencido' | 'saldo'>): string | null {
  switch (f.estado_cartera) {
    case 'vencido':
      return f.dias_vencido > 0 ? `Vencida ${f.dias_vencido} d` : 'Vencida';
    case 'parcial':
      return 'Pago parcial';
    case 'pendiente':
      return 'Pendiente';
    default:
      return f.saldo > 0 ? null : 'Al día';
  }
}

/**
 * Número para wa.me: solo dígitos, con indicativo. Un número de 10 dígitos
 * sin «+» se asume nacional y recibe el indicativo del país de la
 * organización (por defecto 57).
 */
export function telefonoWhatsApp(telefono: string | null | undefined, indicativo = '57'): string | null {
  const bruto = (telefono ?? '').trim();
  if (!bruto) return null;
  const digitos = bruto.replace(/\D/g, '');
  if (digitos.length < 7) return null;
  if (bruto.startsWith('+') || digitos.length > 10) return digitos;
  return digitos.length === 10 ? `${indicativo}${digitos}` : digitos;
}

// ── Exportación CSV (mismas columnas que antes del rediseño) ────────────────

export const COLUMNAS_CSV = [
  'Tipo de Cliente', 'Nombre', 'Apellido', 'Razón Social', 'Nombre Comercial',
  'Nombre Completo', 'Email', 'Teléfono', 'Tipo Documento', 'Número Documento',
  'DV', 'Dirección', 'Ciudad', 'Notas', 'Etiquetas', 'Roles',
  'Preferencias', 'URL Avatar', 'Responsabilidades Fiscales',
  'Saldo CxC', 'Última Compra', 'Total Ventas', 'N° Ventas',
] as const;

export function escaparCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function preferenciasCsv(p: unknown): string {
  if (!p || (typeof p === 'object' && Object.keys(p as object).length === 0)) return '';
  return JSON.stringify(p);
}

/** CSV con BOM (Excel abre bien las tildes). La última compra es el día en la zona de la organización. */
export function construirCsvClientes(filas: readonly FilaCliente[], timezone: string): string {
  const lineas = filas.map((c) =>
    [
      c.customer_type || 'person',
      c.first_name,
      c.last_name,
      c.company_name,
      c.trade_name,
      c.full_name,
      c.email,
      c.phone,
      c.identification_type,
      c.identification_number,
      c.dv,
      c.address,
      c.city,
      c.notes,
      (c.tags ?? []).join(';'),
      (c.roles ?? []).join(';'),
      preferenciasCsv(c.preferences),
      c.avatar_url,
      (c.fiscal_responsibilities ?? []).join(';'),
      c.saldo || 0,
      c.ultima_compra ? toPlainDate(new Date(c.ultima_compra), timezone) : '',
      c.total_compras || 0,
      c.compras || 0,
    ]
      .map(escaparCsv)
      .join(','),
  );
  return `﻿${[COLUMNAS_CSV.join(','), ...lineas].join('\n')}`;
}

export function descargarCsv(contenido: string, nombreArchivo: string): void {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.style.visibility = 'hidden';
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
