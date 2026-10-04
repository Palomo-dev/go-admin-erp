const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** El push es una pista sin permisos: URL, nombre, roles y números se ignoran. */
export function incomingCallPushId(raw: unknown, organizationId: number): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as { data?: unknown; notification?: { data?: unknown } };
  const data = value.notification?.data ?? value.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const fields = data as Record<string, unknown>;
  if (fields.type !== 'crm_inbound_call' || fields.organization_id !== String(organizationId)
    || typeof fields.call_id !== 'string' || !uuid.test(fields.call_id)) return null;
  return fields.call_id.toLowerCase();
}
export interface MobileIncomingContext {
  id: string; status: string; from_number: string; to_number: string;
  customer_id: string | null; customer_name: string | null; since: string | null;
  mobile_invite_state: string | null; invitation_mode: 'mobile' | 'browser';
}
export function incomingContext(raw: unknown, callId: string): MobileIncomingContext {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('contexto_invalido');
  const value = raw as Record<string, unknown>;
  if (value.id !== callId || !['from_number', 'to_number', 'status'].every(key => typeof value[key] === 'string')
    || !['mobile', 'browser'].includes(String(value.invitation_mode))
    || (value.mobile_invite_state !== null && typeof value.mobile_invite_state !== 'string')
    || (value.customer_name !== null && typeof value.customer_name !== 'string')
    || (value.customer_id !== null && (typeof value.customer_id !== 'string' || !uuid.test(value.customer_id)))
    || (value.since !== null && (typeof value.since !== 'string' || !Number.isFinite(Date.parse(value.since))))) throw new Error('contexto_invalido');
  return { id: callId, status: value.status as string, from_number: String(value.from_number), to_number: String(value.to_number),
    customer_id: value.customer_id as string | null, customer_name: value.customer_name as string | null,
    since: value.since as string | null, mobile_invite_state: value.mobile_invite_state as string | null,
    invitation_mode: value.invitation_mode as 'mobile' | 'browser' };
}
