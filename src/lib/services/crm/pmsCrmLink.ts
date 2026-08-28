import { supabase } from '@/lib/supabase/config';
import {
  getOrganizationId,
  getCurrentBranchIdWithFallback,
} from '@/lib/hooks/useOrganization';
import reservationsService, {
  type CreateReservationData,
  type Reservation,
} from '@/lib/services/reservationsService';

/**
 * FASE 3 Parte B - Vinculo CRM <-> PMS
 *
 * Permite:
 *  1. Vincular una reserva existente a una oportunidad (linkReservationToOpportunity)
 *  2. Crear una reserva desde una oportunidad (createReservationFromOpportunity)
 *     leyendo opportunity_spaces y usando reservationsService.createReservation
 *     + guardando reservations.opportunity_id.
 *
 * NO modifica reservationsService.ts. Usa el servicio existente y luego
 * actualiza opportunity_id con una query directa.
 */

// ============== Tipos ==============

export interface OpportunitySpaceRow {
  id: string;
  opportunity_id: string;
  space_id: string;
  nights: number;
  unit_price: number;
  total_price: number | null;
  checkin_date: string | null;
  checkout_date: string | null;
  notes: string | null;
}

export interface OpportunityRow {
  id: string;
  organization_id: number;
  customer_id: string | null;
  title: string;
  amount: number;
  assigned_to?: string | null;
}

export interface CreateReservationFromOpportunityResult {
  reservationId: string;
  opportunityId: string;
  spaceCount: number;
  totalEstimated: number;
}

// ============== Funciones ==============

/**
 * Vincula una reserva PMS existente a una oportunidad CRM.
 * Actualiza reservations.opportunity_id.
 */
async function linkReservationToOpportunity(
  reservationId: string,
  opportunityId: string
): Promise<void> {
  const { error } = await supabase
    .from('reservations')
    .update({ opportunity_id: opportunityId })
    .eq('id', reservationId);

  if (error) {
    console.error('[pmsCrmLink] Error vinculando reserva a oportunidad:', error);
    throw error;
  }
}

/**
 * Crea una reserva PMS desde una oportunidad CRM.
 *
 * Pasos:
 *  1. Lee la oportunidad + opportunity_spaces
 *  2. Construye CreateReservationData desde los espacios
 *  3. Llama a reservationsService.createReservation
 *  4. Actualiza reservations.opportunity_id
 *
 * @returns { reservationId, opportunityId, spaceCount, totalEstimated }
 */
async function createReservationFromOpportunity(
  opportunityId: string
): Promise<CreateReservationFromOpportunityResult> {
  const orgId = getOrganizationId();
  if (!orgId) throw new Error('No se pudo obtener el organization_id');

  const branchId = getCurrentBranchIdWithFallback();

  // 1. Leer la oportunidad
  const { data: opportunity, error: oppError } = await supabase
    .from('opportunities')
    .select('id, organization_id, customer_id, title, amount, assigned_to')
    .eq('id', opportunityId)
    .maybeSingle() as { data: OpportunityRow | null; error: any };

  if (oppError) throw oppError;
  if (!opportunity) throw new Error('Oportunidad no encontrada');
  if (!opportunity.customer_id) throw new Error('La oportunidad no tiene cliente asociado');

  // 2. Leer opportunity_spaces
  const { data: oppSpaces, error: spacesError } = await supabase
    .from('opportunity_spaces')
    .select(
      'id, opportunity_id, space_id, nights, unit_price, total_price, checkin_date, checkout_date, notes'
    )
    .eq('opportunity_id', opportunityId) as { data: OpportunitySpaceRow[] | null; error: any };

  if (spacesError) throw spacesError;
  if (!oppSpaces || oppSpaces.length === 0) {
    throw new Error('La oportunidad no tiene espacios asociados');
  }

  // 3. Determinar fechas (usar el primer espacio con checkin_date, o fallback a hoy/manana)
  const firstSpaceWithDates = oppSpaces.find((s) => s.checkin_date && s.checkout_date);
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const checkin = firstSpaceWithDates?.checkin_date || today;
  const checkout = firstSpaceWithDates?.checkout_date || tomorrow;

  // 4. Calcular total estimado
  const totalEstimated = oppSpaces.reduce(
    (sum, s) => sum + Number(s.total_price || s.nights * s.unit_price),
    0
  );

  // 5. Construir CreateReservationData
  const reservationData: CreateReservationData = {
    customer_id: opportunity.customer_id,
    organization_id: orgId,
    branch_id: branchId,
    checkin,
    checkout,
    occupant_count: 1,
    spaces: oppSpaces.map((s) => s.space_id),
    total_estimated: totalEstimated,
    channel: 'direct',
    notes: `Reserva generada desde oportunidad CRM: ${opportunity.title}`,
    metadata: {
      source: 'crm_opportunity',
      opportunity_id: opportunityId,
    },
  };

  // 6. Crear la reserva usando el servicio existente
  const reservation: Reservation = await reservationsService.createReservation(reservationData);

  // 7. Vincular la reserva a la oportunidad
  await linkReservationToOpportunity(reservation.id, opportunityId);

  return {
    reservationId: reservation.id,
    opportunityId,
    spaceCount: oppSpaces.length,
    totalEstimated,
  };
}

// ============== Export ==============

export const pmsCrmLink = {
  linkReservationToOpportunity,
  createReservationFromOpportunity,
};

export default pmsCrmLink;
