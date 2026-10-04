import type Twilio from 'twilio';
import type { ParticipantInstance } from 'twilio/lib/rest/api/v2010/account/conference/participant';
import { CrmHttpError } from './crmErrors';
import { phoneConferenceName } from './phoneConferenceTwiml';
import { getTwilioClientForOrg } from './voiceContextService';

/** Este mapa se obtiene de la sesión privada persistida, nunca del body ni de calls.metadata. */
export interface BoundPhoneConference {
  organizationId: number;
  callId: string;
  conferenceSid: string;
  customerSid: string;
  agentSid: string;
}

export interface ObservedPhoneHold {
  held: boolean;
  agentMuted: boolean;
  previousAgentMuted: boolean;
}

export interface NativePhoneConference {
  client: Twilio.Twilio;
  binding: BoundPhoneConference;
  accountSid: string;
}

export async function nativePhoneConference(binding: BoundPhoneConference): Promise<NativePhoneConference> {
  if (!/^CF[0-9a-f]{32}$/i.test(binding.conferenceSid)
    || !/^CA[0-9a-f]{32}$/i.test(binding.customerSid) || !/^CA[0-9a-f]{32}$/i.test(binding.agentSid)
    || binding.customerSid === binding.agentSid) {
    throw new CrmHttpError(409, 'conferencia_no_disponible', 'La conferencia todavía no está lista');
  }
  const { client, creds } = await getTwilioClientForOrg(binding.organizationId);
  const conference = await client.conferences(binding.conferenceSid).fetch();
  if (conference.accountSid !== creds.accountSid
    || conference.friendlyName !== phoneConferenceName(binding.organizationId, binding.callId)
    || conference.status !== 'in-progress') {
    throw new CrmHttpError(409, 'conferencia_no_disponible', 'La conferencia ya no está disponible');
  }
  return { client, binding, accountSid: creds.accountSid };
}

function requireParticipant(value: ParticipantInstance, sid: string, conferenceSid: string): void {
  if (value.callSid !== sid || value.conferenceSid !== conferenceSid || value.status !== 'connected') {
    throw new CrmHttpError(409, 'participante_no_disponible', 'Un participante ya no está conectado');
  }
}

/** La respuesta del proveedor y una lectura posterior deben acreditar ambos cambios. */
export async function setNativePhoneHold(
  native: NativePhoneConference,
  held: boolean,
  holdUrl: string,
  restoreAgentMuted = false,
): Promise<ObservedPhoneHold> {
  const { client, binding } = native;
  const conference = client.conferences(binding.conferenceSid);
  const customer = conference.participants(binding.customerSid);
  const agent = conference.participants(binding.agentSid);
  const [beforeCustomer, beforeAgent] = await Promise.all([customer.fetch(), agent.fetch()]);
  requireParticipant(beforeCustomer, binding.customerSid, binding.conferenceSid);
  requireParticipant(beforeAgent, binding.agentSid, binding.conferenceSid);
  const desiredAgentMuted = held || restoreAgentMuted;
  try {
    await customer.update({ hold: held, ...(held ? { holdUrl, holdMethod: 'POST' } : {}) });
    await agent.update({ muted: desiredAgentMuted });
    const [afterCustomer, afterAgent] = await Promise.all([customer.fetch(), agent.fetch()]);
    requireParticipant(afterCustomer, binding.customerSid, binding.conferenceSid);
    requireParticipant(afterAgent, binding.agentSid, binding.conferenceSid);
    if (afterCustomer.hold !== held || afterAgent.muted !== desiredAgentMuted) {
      throw new Error('El proveedor no confirmó la espera y el micrófono');
    }
    return { held, agentMuted: afterAgent.muted, previousAgentMuted: beforeAgent.muted };
  } catch (error) {
    // Las operaciones HTTP no son una transacción. Restituir el audio previo;
    // si la compensación falla, el repositorio debe conservar el estado error.
    const restored = await Promise.allSettled([
      customer.update({ hold: beforeCustomer.hold, ...(beforeCustomer.hold ? { holdUrl, holdMethod: 'POST' } : {}) }),
      agent.update({ muted: beforeAgent.muted }),
    ]);
    const verified = await Promise.allSettled([customer.fetch(), agent.fetch()]);
    if (restored.some((result) => result.status === 'rejected') || verified.some((result) => result.status === 'rejected')
      || (verified[0].status === 'fulfilled' && verified[0].value.hold !== beforeCustomer.hold)
      || (verified[1].status === 'fulfilled' && verified[1].value.muted !== beforeAgent.muted)) {
      throw new CrmHttpError(503, 'control_audio_incierto', 'No pudimos confirmar el estado del audio. Reintenta la conexión');
    }
    throw new CrmHttpError(502, 'control_audio_revertido', error instanceof Error ? error.message : 'La espera no pudo completarse');
  }
}

/** Alta nativa con etiqueta estable: el repositorio conserva el intento antes de llamar. */
export async function dialNativePhoneTransfer(native: NativePhoneConference, input: {
  destination: string;
  callerId: string;
  joinUrl: string;
  callbackUrl: string;
  timeout: number;
}): Promise<{ sid: string; status: string }> {
  if (!/^client:u_[0-9a-f]{32}_o_\d{1,9}$/i.test(input.destination)
    && !/^\+[1-9]\d{6,14}$/.test(input.destination)) {
    throw new CrmHttpError(400, 'destino_invalido', 'El destino de la transferencia no es válido');
  }
  if (input.destination.startsWith('client:') && !input.destination.endsWith(`_o_${native.binding.organizationId}`)) {
    throw new CrmHttpError(403, 'destino_otro_ambito', 'El destinatario no pertenece a esta organización');
  }
  // La invitación y dispatched ya son durables. Nunca repetir este POST tras un timeout:
  // sólo el callback firmado puede enlazar el SID desconocido del primer intento.
  const result = await native.client.calls.create({
    from: input.callerId, to: input.destination, url: input.joinUrl, method: 'POST',
    timeout: Math.max(5, Math.min(600, input.timeout)),
    record: false,
    statusCallback: input.callbackUrl, statusCallbackMethod: 'POST',
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  });
  if (!/^CA[0-9a-f]{32}$/i.test(result.sid) || result.accountSid !== native.accountSid) {
    throw new CrmHttpError(503, 'transferencia_incierta', 'No pudimos confirmar el intento de transferencia');
  }
  return { sid: result.sid, status: result.status };
}
