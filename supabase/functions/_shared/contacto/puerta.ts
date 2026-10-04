/** Adaptador de la regla SQL: sin reconstruir consentimiento en cada consumidor. */
export interface ClienteRpcContacto {
  rpc(nombre: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown; error: { message: string } | null;
  }>;
}

export async function cargarSecretoInterno(cliente: ClienteRpcContacto, desdeEntorno?: string | null): Promise<string | null> {
  if (desdeEntorno) return desdeEntorno;
  try {
    const { data, error } = await cliente.rpc('get_ai_internal_secret');
    return !error && typeof data === 'string' && data.length > 0 ? data : null;
  } catch { return null; }
}

export interface PuertaContacto { allowed: boolean; reason?: string }
export async function evaluarContactoPersistido(cliente: ClienteRpcContacto, org: number, mensaje: string | null): Promise<PuertaContacto> {
  if (!mensaje) return { allowed: false, reason: 'message_not_found' };
  let data: unknown;
  try {
    const respuesta = await cliente.rpc('crm_message_contact_gate', { p_org: org, p_message: mensaje });
    if (respuesta.error) return { allowed: false, reason: 'contact_gate_unavailable' };
    data = respuesta.data;
  } catch { return { allowed: false, reason: 'contact_gate_unavailable' }; }
  if (!data || typeof data !== 'object') return { allowed: false, reason: 'contact_gate_unavailable' };
  const respuesta = data as Record<string, unknown>;
  if (respuesta.allowed === true) return { allowed: true };
  return { allowed: false, reason: typeof respuesta.reason === 'string' ? respuesta.reason : 'contact_blocked' };
}
