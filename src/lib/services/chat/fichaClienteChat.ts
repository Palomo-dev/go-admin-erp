/**
 * Ficha resumida del cliente para la pestaña «Cliente» del Chat (Figma
 * 91-chat-01): contacto, conversaciones, compras y oportunidad abierta.
 * Lectura con el cliente de la sesión (RLS), siempre filtrada por organización.
 *
 * Esquema verificado (2026-11-13): `customers.full_name`/`doc_type`/`doc_number`
 * son generadas (solo lectura); `sales.status` ∈ draft|paid|partial|pending|void;
 * `opportunities.status` abierta = `open`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface FichaClienteChat {
  id: string;
  nombre: string;
  email: string | null;
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
}

/** Estados de venta que cuentan como compra. */
export const ESTADOS_COMPRA = ['paid', 'partial', 'pending'] as const;

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

export async function leerFichaClienteChat(db: SupabaseClient, organizationId: number, customerId: string, ahora: Date = new Date()): Promise<FichaClienteChat | null> {
  const { data: c, error } = await db
    .from('customers')
    .select('id, full_name, first_name, last_name, email, phone, doc_type, doc_number, address, city, avatar_url, created_at')
    .eq('id', customerId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error || !c) return null;

  const [convs, convsMes, ventas, oportunidad] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('customer_id', customerId),
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
  ]);

  const filasVenta = (ventas.data ?? []) as { total: number | null; sale_date: string | null }[];
  const fila = c as Record<string, string | null>;
  const nombre = fila.full_name || [fila.first_name, fila.last_name].filter(Boolean).join(' ') || fila.email || fila.phone || '—';
  return {
    id: fila.id as string,
    nombre,
    email: fila.email,
    telefono: fila.phone,
    documento: textoDocumento(fila.doc_type, fila.doc_number),
    direccion: fila.address,
    ciudad: fila.city,
    avatarUrl: fila.avatar_url,
    creadoEn: fila.created_at,
    conversaciones: convs.count ?? 0,
    conversacionesMes: convsMes.count ?? 0,
    compras: filasVenta.length,
    totalCompras: filasVenta.reduce((s, v) => s + Number(v.total ?? 0), 0),
    ultimaCompra: filasVenta[0]?.sale_date ?? null,
    oportunidad: (oportunidad.data as { name?: string | null } | null)?.name ?? null,
  };
}
