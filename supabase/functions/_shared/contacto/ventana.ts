/** Ventana de Meta: lógica pura común al servidor y al consumidor Edge. */
export interface VentanaContacto { is_open: boolean; last_inbound_at: string | null; expires_at: string | null }
export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Cálculo puro (testeable). */
export function computeWindow(lastInboundAt: string | Date | null | undefined, now: Date = new Date()): VentanaContacto {
  if (!lastInboundAt) return { is_open: false, last_inbound_at: null, expires_at: null };
  const d = lastInboundAt instanceof Date ? lastInboundAt : new Date(lastInboundAt);
  if (Number.isNaN(d.getTime())) return { is_open: false, last_inbound_at: null, expires_at: null };
  const expires = new Date(d.getTime() + WINDOW_MS);
  return {
    is_open: expires.getTime() > now.getTime(),
    last_inbound_at: d.toISOString(),
    expires_at: expires.toISOString(),
  };
}

