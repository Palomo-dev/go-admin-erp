/**
 * Vía ANTERIOR de reservas de mesa, solo mientras las migraciones del paquete D
 * (D1 `create_restaurant_reservation` de 16 argumentos y
 * `cancel_restaurant_reservation(…, p_forzar, …)`, D4 `pos_reserva_sentar`,
 * D5 `no_show_at`) no estén aplicadas en la base.
 *
 * El servicio (`reservasMesasService`) llama siempre a la RPC nueva y SOLO
 * entra aquí cuando PostgREST responde que la función o la columna no existe
 * (`esFuncionInexistente` / `esColumnaInexistente`). Así el ERP se puede
 * desplegar antes o después de aplicar D1–D5 sin dejar de crear, cancelar,
 * sentar ni marcar «No se presentó».
 *
 * Es el comportamiento que había en producción antes del paquete D, copiado
 * tal cual (INSERT directo con la mesa marcada `reserved`, cancelar con
 * UPDATE, sentar = abrir sesión + estado `seated`, inasistencia en
 * `cancelled_at`). Cuando D1–D5 estén aplicadas en producción, este archivo y
 * sus tres llamadas se borran (lo vigila `reservasMesas.guardrail.test.ts`).
 */
import { supabase } from '@/lib/supabase/config';
import { MesasService } from '@/components/pos/mesas/mesasService';
import type { CreateReservationInput } from './reservasMesasService';

export async function crearReservaSinMigracion(
  organizationId: number,
  input: CreateReservationInput,
  branchId: number,
  origen: string,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('restaurant_reservations')
    .insert({
      organization_id: organizationId,
      branch_id: branchId,
      restaurant_table_id: input.restaurant_table_id || null,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone || null,
      customer_email: input.customer_email || null,
      customer_id: input.customer_id || null,
      party_size: input.party_size,
      reservation_date: input.reservation_date,
      reservation_time: input.reservation_time,
      duration_minutes: input.duration_minutes || 90,
      status: 'confirmed',
      notes: input.notes || null,
      special_requests: input.special_requests || null,
      source: origen,
      created_by: user?.id || null,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('No se pudo crear la reserva');

  if (input.restaurant_table_id) {
    await supabase
      .from('restaurant_tables')
      .update({ state: 'reserved', updated_at: new Date().toISOString() })
      .eq('id', input.restaurant_table_id)
      .eq('organization_id', organizationId);
  }
  return String(data.id);
}

export async function cancelarReservaSinMigracion(organizationId: number, id: string, motivo?: string): Promise<void> {
  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from('restaurant_reservations')
    .update({ status: 'cancelled', cancelled_at: ahora, cancellation_reason: motivo || null, updated_at: ahora })
    .eq('id', id)
    .eq('organization_id', organizationId);
  if (error) throw error;
}

/** Sentar sin `pos_reserva_sentar`: abrir la cuenta y después marcar `seated` (dos pasos, como antes). */
export async function sentarReservaSinMigracion(
  organizationId: number,
  reservationId: string,
  tableId: string,
  comensales?: number,
): Promise<{ tableSessionId: string }> {
  const sesion = await MesasService.abrirSesion(tableId, { customers: comensales });
  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from('restaurant_reservations')
    .update({ status: 'seated', seated_at: ahora, restaurant_table_id: tableId, updated_at: ahora })
    .eq('id', reservationId)
    .eq('organization_id', organizationId);
  if (error) throw error;
  return { tableSessionId: String(sesion.id) };
}

/** «No se presentó» sin la columna `no_show_at` (D5): como antes, en `cancelled_at`. */
export async function noShowSinMigracion(organizationId: number, id: string): Promise<void> {
  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from('restaurant_reservations')
    .update({ status: 'no_show', cancelled_at: ahora, updated_at: ahora })
    .eq('id', id)
    .eq('organization_id', organizationId);
  if (error) throw error;
}
