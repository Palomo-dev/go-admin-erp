/**
 * Pasos de «Ganar» que salen de lo que trae la oportunidad (Figma
 * 1787:900392): reservas del hospedaje, emitir la factura, cupo de clase y
 * cita. Separados de `wonCloseSteps.ts` para que ese archivo no pase de 300
 * líneas (`f10Guardrails`); `WON_STEP_EXECUTORS` sigue siendo el único
 * registro y `wonCloseSteps` los reexporta.
 */

import type { OpportunityData, WonCloseDeps } from '@/lib/services/crm/wonCloseSteps';

/** La organización sale de las dependencias (sesión), nunca de la oportunidad. */
export function requireOrg(deps: WonCloseDeps): number {
  if (!deps.orgId || deps.orgId <= 0) throw new Error('Organización no válida');
  return deps.orgId;
}

/**
 * Reservas del hospedaje de la oportunidad. Cada línea trae tipo de habitación,
 * sucursal, fechas y huéspedes; si no se eligió habitación, se asigna la
 * primera libre con `fn_availability` (la misma que usa el PMS) y la reserva
 * lleva su `reservation_spaces`, así bloquea la disponibilidad. Idempotente:
 * si la oportunidad ya tiene reservas, no se duplican.
 * Deuda (Figma 1791:903416): moverlo a `fn_pms_crear_reserva` (RPC compartida con el PMS).
 */
export async function executeReservations(opp: OpportunityData, deps: WonCloseDeps): Promise<string> {
  const orgId = requireOrg(deps);
  const { data: spaces, error: errLeer } = await deps.supabase
    .from('opportunity_spaces')
    .select('space_id, space_type_id, branch_id, nights, unit_price, checkin_date, checkout_date, adults, children')
    .eq('opportunity_id', opp.id);
  if (errLeer) throw errLeer;
  if (!spaces || spaces.length === 0) return 'Sin espacios reservables — se omitieron reservas';
  const { data: previas, error: errPrevias } = await deps.supabase.from('reservations').select('id').eq('organization_id', orgId).eq('opportunity_id', opp.id).neq('status', 'cancelled').limit(1);
  if (errPrevias) throw errPrevias;
  if (previas && previas.length > 0) return 'La oportunidad ya tiene reservas — no se duplicó';
  const latestProposal = await deps.getLatestProposal(opp.id);
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  const usadas = new Set<string>();
  let created = 0;
  for (const s of spaces as Array<Record<string, unknown>>) {
    const branchId = (s.branch_id as number | null) ?? deps.contextBranchId ?? latestProposal?.branch_id ?? null;
    if (!branchId) throw new Error('No se puede crear la reserva: el hospedaje no tiene sucursal; selecciona una sucursal concreta.');
    const checkinDate = s.checkin_date as string | null;
    const checkoutDate = s.checkout_date as string | null;
    const nights = Number(s.nights) || 1;
    let spaceId = (s.space_id as string | null) ?? null;
    if (!spaceId && s.space_type_id && checkinDate && checkoutDate) {
      const { data: libres, error: errDisp } = await deps.supabase.rpc('fn_availability', { p_start_date: checkinDate, p_end_date: checkoutDate, p_space_type_id: s.space_type_id, p_branch_id: branchId });
      if (errDisp) throw errDisp;
      const libre = ((libres ?? []) as { space_id: string; is_available: boolean }[]).find((h) => h.is_available && !usadas.has(h.space_id));
      if (!libre) throw new Error(`Sin habitaciones disponibles del ${checkinDate} al ${checkoutDate}: la oportunidad quedó ganada; reintenta la reserva con otras fechas.`);
      spaceId = libre.space_id;
    }
    if (!spaceId) throw new Error('No se puede crear la reserva: falta la habitación o las fechas del hospedaje.');
    usadas.add(spaceId);
    const startDate = checkinDate ? new Date(checkinDate).toISOString() : new Date(nowMs).toISOString();
    const endDate = checkoutDate ? new Date(checkoutDate).toISOString() : new Date(nowMs + nights * 24 * 60 * 60 * 1000).toISOString();
    const { data: reserva, error } = await deps.supabase
      .from('reservations')
      .insert({
        organization_id: orgId, branch_id: branchId, customer_id: opp.customer_id, space_id: spaceId, space_type_id: (s.space_type_id as string | null) ?? null,
        start_date: startDate, end_date: endDate, checkin: checkinDate || null, checkout: checkoutDate || null, opportunity_id: opp.id, status: 'confirmed',
        total_estimated: Number(s.unit_price) * nights, occupant_count: (Number(s.adults) || 0) + (Number(s.children) || 0) || null, channel: 'crm',
      })
      .select('id')
      .single();
    if (error) throw error;
    const { error: errEspacio } = await deps.supabase.from('reservation_spaces').insert({ reservation_id: (reserva as { id: string }).id, space_id: spaceId, checkin: checkinDate || null, checkout: checkoutDate || null });
    if (errEspacio) throw errEspacio;
    created++;
  }
  return `Reservas creadas: ${created}`;
}

/** La factura en borrador más reciente de la oportunidad (la que dejó «factura»). */
async function facturaBorrador(opp: OpportunityData, deps: WonCloseDeps): Promise<{ id: string; number: string | null } | null> {
  const { data, error } = await deps.supabase
    .from('invoice_sales')
    .select('id, number, status')
    .eq('organization_id', requireOrg(deps))
    .eq('opportunity_id', opp.id)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string; number: string | null } | null) ?? null;
}

/**
 * «Emitir la factura ahora» (opcional): emitir descuenta el stock de lo que
 * lo controla (`fn_invoice_stock_shortages` bloquea si falta) y activa las
 * membresías (`fn_membresias_activar_venta`). Sin permiso Facturar el servidor
 * responde 403 y la factura queda en borrador para Finanzas.
 */
export async function executeEmit(opp: OpportunityData, deps: WonCloseDeps): Promise<string> {
  if (!deps.emitInvoice) return 'Emisión no disponible aquí — la factura quedó en borrador para Finanzas';
  const factura = await facturaBorrador(opp, deps);
  if (!factura) return 'Sin factura en borrador — se omitió la emisión';
  await deps.emitInvoice(factura.id);
  return `Factura emitida: ${factura.number ?? `${factura.id.substring(0, 8)}…`}`;
}

/**
 * Cupos de clase de las líneas (`service_config.gym_class_id`): una reserva
 * `booked` por clase, si queda cupo. Idempotente por cliente y clase.
 * Deuda (Figma 1791:903416): la validación de capacidad debe ir en una RPC.
 */
export async function executeClassSlot(opp: OpportunityData, deps: WonCloseDeps): Promise<string> {
  const orgId = requireOrg(deps);
  if (!opp.customer_id) return 'Sin cliente — se omitió el cupo de clase';
  const { data, error } = await deps.supabase.from('opportunity_products').select('service_config').eq('opportunity_id', opp.id);
  if (error) throw error;
  const clases = [...new Set(((data ?? []) as { service_config: Record<string, unknown> | null }[]).map((r) => Number(r.service_config?.gym_class_id)).filter((x) => Number.isInteger(x) && x > 0))];
  if (clases.length === 0) return 'Sin clases en las líneas — se omitió el cupo';
  let creados = 0;
  for (const claseId of clases) {
    const { data: clase, error: e1 } = await deps.supabase.from('gym_classes').select('id, capacity, branch_id').eq('id', claseId).eq('organization_id', orgId).maybeSingle();
    if (e1) throw e1;
    if (!clase) throw new Error(`La clase ${claseId} ya no existe`);
    const { data: activas, error: e2 } = await deps.supabase.from('class_reservations').select('id, customer_id').eq('gym_class_id', claseId).in('status', ['booked', 'checked_in']);
    if (e2) throw e2;
    const filas = (activas ?? []) as { id: number; customer_id: string | null }[];
    if (filas.some((r) => r.customer_id === opp.customer_id)) continue;
    const capacidad = Number((clase as { capacity: number | null }).capacity) || 0;
    if (capacidad > 0 && filas.length >= capacidad) throw new Error('La clase está llena: elige otro horario y reintenta el cupo');
    const { error: e3 } = await deps.supabase.from('class_reservations').insert({
      organization_id: orgId, gym_class_id: claseId, customer_id: opp.customer_id, status: 'booked', reservation_source: 'staff',
      branch_id: (clase as { branch_id: number | null }).branch_id, booked_at: (deps.now?.() ?? new Date()).toISOString(), notes: `Oportunidad ${opp.name}`,
    });
    if (e3) throw e3;
    creados++;
  }
  return creados ? `Cupos reservados: ${creados}` : 'El cliente ya tenía el cupo — no se duplicó';
}

/**
 * Citas de las líneas (`service_config.start_at` + profesional): un evento del
 * calendario con `opportunity_id` por la RPC única de reuniones
 * (`fn_crm_guardar_reunion`). Idempotente por oportunidad y hora.
 */
export async function executeAppointment(opp: OpportunityData, deps: WonCloseDeps): Promise<string> {
  const orgId = requireOrg(deps);
  const { data, error } = await deps.supabase.from('opportunity_products').select('service_config, producto:products(name)').eq('opportunity_id', opp.id);
  if (error) throw error;
  const citas = ((data ?? []) as { service_config: Record<string, unknown> | null; producto: { name?: string } | { name?: string }[] | null }[])
    .filter((r) => typeof r.service_config?.start_at === 'string')
    .map((r) => ({ cfg: r.service_config as Record<string, unknown>, nombre: (Array.isArray(r.producto) ? r.producto[0] : r.producto)?.name ?? 'Cita' }));
  if (citas.length === 0) return 'Sin citas en las líneas — se omitió';
  let creadas = 0;
  for (const c of citas) {
    const inicio = String(c.cfg.start_at);
    const profesional = typeof c.cfg.professional_id === 'string' ? c.cfg.professional_id : null;
    const { data: previa, error: e1 } = await deps.supabase.from('calendar_events').select('id').eq('organization_id', orgId).eq('opportunity_id', opp.id).eq('start_at', inicio).limit(1);
    if (e1) throw e1;
    if (previa && previa.length > 0) continue;
    const fin = new Date(Date.parse(inicio) + (Number(c.cfg.duration_minutes) || 60) * 60_000).toISOString();
    const { error: e2 } = await deps.supabase.rpc('fn_crm_guardar_reunion', {
      p_org: orgId,
      p_event_id: null,
      p_payload: { title: `${c.nombre} — ${opp.name}`, start_at: inicio, end_at: fin, assigned_to: profesional, customer_id: opp.customer_id, opportunity_id: opp.id, timezone: deps.timezone, status: 'confirmed', send_invite: false },
    });
    if (e2) throw e2;
    creadas++;
  }
  return creadas ? `Citas agendadas: ${creadas}` : 'Las citas ya estaban agendadas — no se duplicó';
}
