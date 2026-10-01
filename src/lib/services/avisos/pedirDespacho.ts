/**
 * Pide el envio de los avisos que el trigger acaba de dejar pendientes.
 * La organizacion sale de la sesion. No manda destinatarios.
 */
export function pedirDespachoAvisos(): void {
  if (typeof window === 'undefined') return;
  void fetch('/api/avisos-miembro/despachar', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => undefined);
}
