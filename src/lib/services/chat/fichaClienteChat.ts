/**
 * Ficha resumida del cliente para la pestaña «Cliente» del Chat (Figma
 * 91-chat-01): contacto, conversaciones, compras y oportunidad abierta.
 * Lectura con el cliente de la sesión (RLS), siempre filtrada por organización.
 *
 * Recupera del Chat anterior (auditoría 2026-11-14): el correo real del
 * visitante web (`metadata.real_email`; el `@widget.local` no se muestra), el
 * cliente vinculado en CRM (`metadata.linked_customer_id`), el historial
 * (mensajes, primer y último contacto, 5 conversaciones recientes), las notas
 * del cliente, «en línea / visto hace» y la edición del contacto.
 *
 * Esquema verificado (2026-11-13/14): `customers.full_name`/`doc_type`/`doc_number`
 * son generadas (solo lectura); `notes`, `metadata`, `is_online`,
 * `last_seen_at` existen; `sales.status` ∈ draft|paid|partial|pending|void;
 * `opportunities.status` abierta = `open`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ConversacionReciente {
  id: string;
  estado: string | null;
  creadaEn: string | null;
  ultimoMensaje: string | null;
  mensajes: number;
}

export interface ClienteVinculado {
  id: string;
  nombre: string;
  email: string | null;
}

export interface FichaClienteChat {
  id: string;
  nombre: string;
  /** Para editar: lo que guarda la fila (el nombre completo es generado). */
  nombres: string | null;
  apellidos: string | null;
  /** Correo que se muestra: el real del visitante o el de la fila, nunca `@widget.local`. */
  email: string | null;
  /** La fila tiene el correo provisional del widget: el real va en `metadata.real_email`. */
  correoProvisional: boolean;
  metadata: Record<string, unknown>;
  telefono: string | null;
  documento: string | null;
  direccion: string | null;
  ciudad: string | null;
  avatarUrl: string | null;
  creadoEn: string | null;
  conversaciones: number;
  conversacionesMes: number;
  compras: number;
  totalCompras: number;
  ultimaCompra: string | null;
  oportunidad: string | null;
  notas: string | null;
  vistoEn: string | null;
  mensajes: number;
  primerContacto: string | null;
  ultimoContacto: string | null;
  recientes: ConversacionReciente[];
  vinculado: ClienteVinculado | null;
}

/** Estados de venta que cuentan como compra. */
export const ESTADOS_COMPRA = ['paid', 'partial', 'pending'] as const;

/** Dominio del correo provisional que crea el widget del sitio web. */
export const DOMINIO_CORREO_WIDGET = '@widget.local';

export function esCorreoProvisional(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase().endsWith(DOMINIO_CORREO_WIDGET);
}

/** Correo para mostrar: `metadata.real_email`, o el de la fila si no es el provisional del widget. */
export function correoVisible(email: string | null | undefined, metadata: Record<string, unknown> | null | undefined): string | null {
  const real = metadata?.real_email;
  if (typeof real === 'string' && real.trim()) return real.trim();
  return email && !esCorreoProvisional(email) ? email : null;
}

/** «CC 1.037.456.789»: tipo y número del documento, si hay. */
export function textoDocumento(tipo: string | null | undefined, numero: string | null | undefined): string | null {
  const n = (numero ?? '').trim();
  if (!n) return null;
  const tp = (tipo ?? '').trim().toUpperCase();
  return tp ? `${tp} ${n}` : n;
}

/** Inicio del mes calendario de `ahora` en ISO (para «este mes»), en UTC. */
export function inicioMesIso(ahora: Date): string {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString();
}

// ─── Edición del contacto desde el chat ─────────────────────────────────────

export interface EdicionContacto {
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string;
  direccion: string;
  ciudad: string;
}

export function edicionDesdeFicha(f: Pick<FichaClienteChat, 'nombres' | 'apellidos' | 'email' | 'telefono' | 'direccion' | 'ciudad'>): EdicionContacto {
  return {
    nombres: f.nombres ?? '',
    apellidos: f.apellidos ?? '',
    email: f.email ?? '',
    telefono: f.telefono ?? '',
    direccion: f.direccion ?? '',
    ciudad: f.ciudad ?? '',
  };
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Error de la edición, o `null`. El teléfono lo valida su campo (`telefonoOpcionalValido`). */
export function errorEdicion(e: EdicionContacto): 'nombre' | 'correo' | null {
  if (!e.nombres.trim()) return 'nombre';
  const correo = e.email.trim();
  if (correo && (!CORREO.test(correo) || esCorreoProvisional(correo))) return 'correo';
  return null;
}

/**
 * Fila para `customers.update`. `full_name` es generada: se escriben nombres y
 * apellidos. Si la fila tiene el correo provisional del widget, el correo real
 * va a `metadata.real_email` (el provisional identifica al visitante y no se
 * toca); si no, a `email`. Vacío = `null`.
 */
export function cambiosContacto(
  actual: { correoProvisional: boolean; metadata: Record<string, unknown> | null | undefined },
  e: EdicionContacto,
): Record<string, unknown> {
  const o = (v: string) => (v.trim() ? v.trim() : null);
  const fila: Record<string, unknown> = {
    first_name: e.nombres.trim(),
    last_name: o(e.apellidos),
    phone: o(e.telefono),
    address: o(e.direccion),
    city: o(e.ciudad),
  };
  const correo = o(e.email);
  if (actual.correoProvisional) {
    const metadata = { ...(actual.metadata ?? {}) };
    if (correo) metadata.real_email = correo;
    else delete metadata.real_email;
    fila.metadata = metadata;
  } else {
    fila.email = correo;
  }
  return fila;
}

/** Guarda la edición (RLS de `customers`), siempre filtrando por organización. */
export async function guardarContactoCliente(
  db: SupabaseClient,
  organizationId: number,
  ficha: Pick<FichaClienteChat, 'id' | 'correoProvisional' | 'metadata'>,
  e: EdicionContacto,
): Promise<void> {
  const { data, error } = await db
    .from('customers')
    .update(cambiosContacto(ficha, e))
    .eq('id', ficha.id)
    .eq('organization_id', organizationId)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('No se pudo guardar el cliente');
}

// ─── Historial ──────────────────────────────────────────────────────────────

export interface FilaConversacionCliente {
  id: string;
  status: string | null;
  created_at: string | null;
  last_message_at: string | null;
  message_count: number | null;
}

/** Totales e historial a partir de las conversaciones del cliente (la más reciente primero). */
export function historialConversaciones(filas: readonly FilaConversacionCliente[]): Pick<
  FichaClienteChat,
  'mensajes' | 'primerContacto' | 'ultimoContacto' | 'recientes'
> {
  let primer: string | null = null;
  let ultimo: string | null = null;
  let mensajes = 0;
  for (const f of filas) {
    mensajes += Number(f.message_count ?? 0);
    if (f.created_at && (!primer || Date.parse(f.created_at) < Date.parse(primer))) primer = f.created_at;
    const u = f.last_message_at ?? f.created_at;
    if (u && (!ultimo || Date.parse(u) > Date.parse(ultimo))) ultimo = u;
  }
  return {
    mensajes,
    primerContacto: primer,
    ultimoContacto: ultimo,
    recientes: filas.slice(0, 5).map((f) => ({
      id: f.id,
      estado: f.status,
      creadaEn: f.created_at,
      ultimoMensaje: f.last_message_at,
      mensajes: Number(f.message_count ?? 0),
    })),
  };
}

export async function leerFichaClienteChat(db: SupabaseClient, organizationId: number, customerId: string, ahora: Date = new Date()): Promise<FichaClienteChat | null> {
  const { data: c, error } = await db
    .from('customers')
    .select('id, full_name, first_name, last_name, email, phone, doc_type, doc_number, address, city, avatar_url, created_at, notes, metadata, last_seen_at')
    .eq('id', customerId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error || !c) return null;

  const metadata = (((c as { metadata?: unknown }).metadata ?? {}) || {}) as Record<string, unknown>;
  const vinculadoId = typeof metadata.linked_customer_id === 'string' && metadata.linked_customer_id !== customerId ? metadata.linked_customer_id : null;

  const [convs, convsMes, ventas, oportunidad, vinculado] = await Promise.all([
    db
      .from('conversations')
      .select('id, status, created_at, last_message_at, message_count', { count: 'exact' })
      .eq('organization_id', organizationId)
      .eq('customer_id', customerId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(500),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('customer_id', customerId)
      .gte('created_at', inicioMesIso(ahora)),
    db
      .from('sales')
      .select('total, sale_date')
      .eq('organization_id', organizationId)
      .eq('customer_id', customerId)
      .in('status', [...ESTADOS_COMPRA])
      .order('sale_date', { ascending: false })
      .limit(500),
    db
      .from('opportunities')
      .select('name')
      .eq('organization_id', organizationId)
      .eq('customer_id', customerId)
      .eq('status', 'open')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    vinculadoId
      ? db
          .from('customers')
          .select('id, full_name, first_name, last_name, email, metadata')
          .eq('id', vinculadoId)
          .eq('organization_id', organizationId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const filasVenta = (ventas.data ?? []) as { total: number | null; sale_date: string | null }[];
  const fila = c as Record<string, string | null>;
  const email = correoVisible(fila.email, metadata);
  const nombre = fila.full_name || [fila.first_name, fila.last_name].filter(Boolean).join(' ') || email || fila.phone || '—';
  const filasConv = (convs.data ?? []) as FilaConversacionCliente[];
  const v = vinculado.data as { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; metadata?: Record<string, unknown> | null } | null;
  return {
    id: fila.id as string,
    nombre,
    nombres: fila.first_name,
    apellidos: fila.last_name,
    email,
    correoProvisional: esCorreoProvisional(fila.email),
    metadata,
    telefono: fila.phone,
    documento: textoDocumento(fila.doc_type, fila.doc_number),
    direccion: fila.address,
    ciudad: fila.city,
    avatarUrl: fila.avatar_url,
    creadoEn: fila.created_at,
    conversaciones: convs.count ?? filasConv.length,
    conversacionesMes: convsMes.count ?? 0,
    compras: filasVenta.length,
    totalCompras: filasVenta.reduce((s, x) => s + Number(x.total ?? 0), 0),
    ultimaCompra: filasVenta[0]?.sale_date ?? null,
    oportunidad: (oportunidad.data as { name?: string | null } | null)?.name ?? null,
    notas: fila.notes,
    vistoEn: fila.last_seen_at,
    ...historialConversaciones(filasConv),
    vinculado: v ? { id: v.id, nombre: v.full_name || [v.first_name, v.last_name].filter(Boolean).join(' ') || '—', email: correoVisible(v.email, v.metadata) } : null,
  };
}
