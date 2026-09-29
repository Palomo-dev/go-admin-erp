'use client';

/**
 * Lectura de las entradas (member_checkins) para la pantalla Check-in y el
 * kiosco. El REGISTRO no vive aquí: lo hace fn_membresia_registrar_checkin
 * por `apiMembresias.registrarEntrada`, que valida vigencia, gracia, sede,
 * horario y tope diario con la copia de reglas del plan.
 *
 * La búsqueda anterior pedía `customers.document_number`, que no existe (la
 * columna es `identification_number`): ahora la hace el servidor
 * (`apiMembresias.buscarEntrada`).
 */
import { supabase } from '@/lib/supabase/config';
import { rangoDias } from '@/lib/services/membresias/operacion';

export interface EntradaDelDia {
  id: number;
  fecha: string;
  metodo: string | null;
  /** Código de fn_membresia_registrar_checkin o texto libre de registros viejos. */
  motivoRechazo: string | null;
  sucursalId: number;
  sucursal: string | null;
  clienteId: string;
  cliente: string;
  plan: string | null;
}

export interface ResumenEntradas {
  permitidas: number;
  rechazadas: number;
  miembros: number;
}

interface FilaEntrada {
  id: number;
  checkin_at: string;
  method: string | null;
  denied_reason: string | null;
  branch_id: number;
  customer_id: string;
  branches: { name: string | null } | null;
  customers: { full_name: string | null; first_name: string | null; last_name: string | null } | null;
  memberships: { plan_snapshot: { nombre?: string } | null; membership_plans: { name: string | null } | null } | null;
}

/**
 * Entradas de un día calendario en la zona de la organización. `sucursalId`
 * null = todas las sedes a las que el usuario tiene acceso (RLS).
 */
export async function listarEntradasDelDia(opciones: {
  organizationId: number;
  dia: string;
  zona: string;
  sucursalId?: number | null;
  limite?: number;
}): Promise<EntradaDelDia[]> {
  const { desde, hasta } = rangoDias(opciones.dia, 1, opciones.zona);
  let consulta = supabase
    .from('member_checkins')
    .select(
      'id, checkin_at, method, denied_reason, branch_id, customer_id, branches (name), customers (full_name, first_name, last_name), memberships (plan_snapshot, membership_plans (name))'
    )
    .eq('organization_id', opciones.organizationId)
    .gte('checkin_at', desde)
    .lt('checkin_at', hasta)
    .order('checkin_at', { ascending: false })
    .limit(opciones.limite ?? 300);
  if (opciones.sucursalId) consulta = consulta.eq('branch_id', opciones.sucursalId);

  const { data, error } = await consulta;
  if (error) throw error;
  return ((data ?? []) as unknown as FilaEntrada[]).map((r) => ({
    id: r.id,
    fecha: r.checkin_at,
    metodo: r.method,
    motivoRechazo: r.denied_reason,
    sucursalId: r.branch_id,
    sucursal: r.branches?.name ?? null,
    clienteId: r.customer_id,
    cliente:
      r.customers?.full_name || [r.customers?.first_name, r.customers?.last_name].filter(Boolean).join(' ') || '—',
    plan: r.memberships?.plan_snapshot?.nombre ?? r.memberships?.membership_plans?.name ?? null,
  }));
}

export function resumirEntradas(entradas: readonly EntradaDelDia[]): ResumenEntradas {
  const permitidas = entradas.filter((e) => !e.motivoRechazo);
  return {
    permitidas: permitidas.length,
    rechazadas: entradas.length - permitidas.length,
    miembros: new Set(permitidas.map((e) => e.clienteId)).size,
  };
}
