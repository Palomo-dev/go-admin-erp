/**
 * Voice Agent Tools — Function calling tools para el agente de voz
 * GO Admin ERP
 *
 * Define las herramientas que el Voice Agent puede invocar
 * para ejecutar acciones en el ERP via Supabase.
 */

import { supabase } from '@/lib/supabase/config';

// ─── Definiciones de herramientas para OpenAI ───────────

export interface ToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const VOICE_AGENT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    name: 'check_availability',
    description: 'Verifica la disponibilidad de espacios/habitaciones para fechas específicas',
    parameters: {
      type: 'object',
      properties: {
        checkin: { type: 'string', description: 'Fecha de entrada (YYYY-MM-DD)' },
        checkout: { type: 'string', description: 'Fecha de salida (YYYY-MM-DD)' },
        guests: { type: 'number', description: 'Número de huéspedes' },
      },
      required: ['checkin', 'checkout'],
    },
  },
  {
    type: 'function',
    name: 'create_reservation',
    description: 'Crea una nueva reserva de alojamiento',
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Nombre completo del cliente' },
        customer_phone: { type: 'string', description: 'Teléfono del cliente' },
        customer_email: { type: 'string', description: 'Email del cliente (opcional)' },
        checkin: { type: 'string', description: 'Fecha de entrada (YYYY-MM-DD)' },
        checkout: { type: 'string', description: 'Fecha de salida (YYYY-MM-DD)' },
        guests: { type: 'number', description: 'Número de huéspedes' },
        notes: { type: 'string', description: 'Notas adicionales' },
      },
      required: ['customer_name', 'customer_phone', 'checkin', 'checkout'],
    },
  },
  {
    type: 'function',
    name: 'lookup_reservation',
    description: 'Busca una reserva por código o nombre del cliente',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Código de la reserva' },
        customer_name: { type: 'string', description: 'Nombre del cliente' },
        customer_phone: { type: 'string', description: 'Teléfono del cliente' },
      },
    },
  },
  {
    type: 'function',
    name: 'cancel_reservation',
    description: 'Cancela una reserva existente',
    parameters: {
      type: 'object',
      properties: {
        reservation_code: { type: 'string', description: 'Código de la reserva a cancelar' },
      },
      required: ['reservation_code'],
    },
  },
  {
    type: 'function',
    name: 'get_business_info',
    description: 'Obtiene información general del negocio (horarios, dirección, servicios)',
    parameters: {
      type: 'object',
      properties: {
        info_type: {
          type: 'string',
          enum: ['hours', 'address', 'services', 'prices', 'general'],
          description: 'Tipo de información solicitada',
        },
      },
      required: ['info_type'],
    },
  },
  {
    type: 'function',
    name: 'transfer_to_agent',
    description: 'Transfiere la llamada a un agente humano',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Razón de la transferencia' },
        department: {
          type: 'string',
          enum: ['reception', 'sales', 'support', 'billing'],
          description: 'Departamento destino',
        },
      },
      required: ['reason'],
    },
  },
  {
    type: 'function',
    name: 'take_message',
    description: 'Toma un mensaje para que el equipo lo atienda después',
    parameters: {
      type: 'object',
      properties: {
        caller_name: { type: 'string', description: 'Nombre de quien llama' },
        caller_phone: { type: 'string', description: 'Teléfono de contacto' },
        message: { type: 'string', description: 'Mensaje a dejar' },
        urgency: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Nivel de urgencia',
        },
      },
      required: ['caller_name', 'message'],
    },
  },
];

// ─── Ejecutores de herramientas ─────────────────────────

export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  orgId: number
): Promise<string> {
  try {
    switch (toolName) {
      case 'check_availability':
        return await checkAvailability(orgId, args);
      case 'create_reservation':
        return await createReservation(orgId, args);
      case 'lookup_reservation':
        return await lookupReservation(orgId, args);
      case 'cancel_reservation':
        return await cancelReservation(orgId, args);
      case 'get_business_info':
        return await getBusinessInfo(orgId, args);
      case 'transfer_to_agent':
        return JSON.stringify({ action: 'transfer', reason: args.reason, department: args.department || 'reception' });
      case 'take_message':
        return await takeMessage(orgId, args);
      default:
        return JSON.stringify({ error: `Herramienta no reconocida: ${toolName}` });
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Error ejecutando acción';
    console.error(`[VoiceAgentTools] Error en ${toolName}:`, errMsg);
    return JSON.stringify({ error: errMsg });
  }
}

// ─── Implementaciones ───────────────────────────────────

async function checkAvailability(
  orgId: number,
  args: Record<string, unknown>
): Promise<string> {
  const { checkin, checkout, guests } = args as { checkin: string; checkout: string; guests?: number };

  const { data: spaces, error } = await supabase
    .from('spaces')
    .select('id, label, status, space_types(name, max_occupancy)')
    .eq('organization_id', orgId)
    .eq('status', 'available');

  if (error) throw error;

  const available = spaces?.filter((s) => {
    const maxOcc = (s.space_types as { max_occupancy?: number })?.max_occupancy || 2;
    return !guests || maxOcc >= guests;
  }) || [];

  if (available.length === 0) {
    return JSON.stringify({
      available: false,
      message: `No hay espacios disponibles para las fechas ${checkin} a ${checkout}.`,
    });
  }

  return JSON.stringify({
    available: true,
    count: available.length,
    spaces: available.slice(0, 5).map((s) => ({
      label: s.label,
      type: (s.space_types as { name?: string })?.name,
    })),
    message: `Hay ${available.length} espacios disponibles para las fechas solicitadas.`,
  });
}

async function createReservation(
  orgId: number,
  args: Record<string, unknown>
): Promise<string> {
  const { customer_name, customer_phone, customer_email, checkin, checkout, guests, notes } =
    args as {
      customer_name: string;
      customer_phone: string;
      customer_email?: string;
      checkin: string;
      checkout: string;
      guests?: number;
      notes?: string;
    };

  // Buscar o crear cliente
  const nameParts = customer_name.split(' ');
  const firstName = nameParts[0] || customer_name;
  const lastName = nameParts.slice(1).join(' ') || '';

  let { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('organization_id', orgId)
    .eq('phone', customer_phone)
    .single();

  if (!customer) {
    const { data: newCustomer, error: custError } = await supabase
      .from('customers')
      .insert({
        organization_id: orgId,
        first_name: firstName,
        last_name: lastName,
        phone: customer_phone,
        email: customer_email || null,
      })
      .select('id')
      .single();

    if (custError) throw custError;
    customer = newCustomer;
  }

  // Crear reserva
  const code = `VA-${Date.now().toString(36).toUpperCase()}`;
  const { error: resError } = await supabase.from('reservations').insert({
    organization_id: orgId,
    customer_id: customer!.id,
    code,
    checkin,
    checkout,
    occupant_count: guests || 1,
    status: 'confirmed',
    notes: notes ? `[Voice Agent] ${notes}` : '[Voice Agent] Reserva creada por agente de voz',
  });

  if (resError) throw resError;

  return JSON.stringify({
    success: true,
    code,
    message: `Reserva ${code} creada exitosamente para ${customer_name}, del ${checkin} al ${checkout}.`,
  });
}

async function lookupReservation(
  orgId: number,
  args: Record<string, unknown>
): Promise<string> {
  const { code, customer_name, customer_phone } = args as {
    code?: string;
    customer_name?: string;
    customer_phone?: string;
  };

  let query = supabase
    .from('reservations')
    .select('code, checkin, checkout, status, occupant_count, customer:customers(first_name, last_name, phone)')
    .eq('organization_id', orgId);

  if (code) {
    query = query.eq('code', code);
  } else if (customer_phone) {
    query = query.eq('customer:customers.phone', customer_phone);
  }

  const { data, error } = await query.limit(3);

  if (error) throw error;

  if (!data || data.length === 0) {
    return JSON.stringify({ found: false, message: 'No se encontró ninguna reserva con esos datos.' });
  }

  return JSON.stringify({
    found: true,
    reservations: data.map((r) => ({
      code: r.code,
      checkin: r.checkin,
      checkout: r.checkout,
      status: r.status,
      guests: r.occupant_count,
    })),
  });
}

async function cancelReservation(
  orgId: number,
  args: Record<string, unknown>
): Promise<string> {
  const { reservation_code } = args as { reservation_code: string };

  const { data, error } = await supabase
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('organization_id', orgId)
    .eq('code', reservation_code)
    .eq('status', 'confirmed')
    .select('code')
    .single();

  if (error || !data) {
    return JSON.stringify({
      success: false,
      message: `No se pudo cancelar la reserva ${reservation_code}. Verifique el código o el estado.`,
    });
  }

  return JSON.stringify({
    success: true,
    message: `La reserva ${reservation_code} ha sido cancelada exitosamente.`,
  });
}

async function getBusinessInfo(
  orgId: number,
  args: Record<string, unknown>
): Promise<string> {
  const { info_type } = args as { info_type: string };

  const { data: org } = await supabase
    .from('organizations')
    .select('name, business_type, address, phone, email, website')
    .eq('id', orgId)
    .single();

  if (!org) {
    return JSON.stringify({ error: 'No se encontró información del negocio.' });
  }

  switch (info_type) {
    case 'address':
      return JSON.stringify({ address: org.address || 'No disponible', message: `Nuestra dirección es: ${org.address || 'No disponible'}` });
    case 'general':
      return JSON.stringify({ name: org.name, type: org.business_type, phone: org.phone, email: org.email, website: org.website });
    default:
      return JSON.stringify({ name: org.name, message: `${org.name} está a su servicio. ¿En qué podemos ayudarle?` });
  }
}

async function takeMessage(
  orgId: number,
  args: Record<string, unknown>
): Promise<string> {
  const { caller_name, caller_phone, message, urgency } = args as {
    caller_name: string;
    caller_phone?: string;
    message: string;
    urgency?: string;
  };

  // Guardar como nota/log en comm_usage_logs con metadata
  const { error } = await supabase.from('comm_usage_logs').insert({
    organization_id: orgId,
    channel: 'voice',
    credits_used: 0,
    recipient: caller_phone || 'desconocido',
    status: 'received',
    direction: 'inbound',
    module: 'voice_agent',
    metadata: {
      type: 'voice_message',
      caller_name: caller_name,
      message,
      urgency: urgency || 'medium',
      timestamp: new Date().toISOString(),
    },
  });

  if (error) throw error;

  return JSON.stringify({
    success: true,
    message: `Mensaje registrado. Le informaremos a nuestro equipo y se comunicarán con usted pronto.`,
  });
}
