/**
 * Contrato de POST /api/pos/mesas/solicitudes: el equipo marca una solicitud de
 * la Carta QR («Llamar al mesero», «Pedir la cuenta») como vista («Voy») o
 * atendida. La organización y el actor salen de la sesión; el body solo trae
 * la solicitud y el estado.
 */
import { z } from 'zod';

export const atenderSolicitudSchema = z
  .object({
    request_id: z.string().uuid(),
    estado: z.enum(['ack', 'done']),
  })
  .strict();

export type AtenderSolicitud = z.infer<typeof atenderSolicitudSchema>;

/** RPC de staff (migración de la Carta QR, la escribe el agente de websites). */
export const RPC_ATENDER_SOLICITUD = 'pos_mesa_atender_solicitud';
