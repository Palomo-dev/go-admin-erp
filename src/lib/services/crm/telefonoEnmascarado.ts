/**
 * Teléfono enmascarado para mostrar en pantalla (`+57 300 *** 4567`). Módulo puro, sin dependencias:
 * lo usan componentes cliente, así que no puede vivir junto a servicios que importan `twilio`
 * (rompe el build de Next con «Can't resolve 'fs' / 'net' / 'tls'»).
 */
export function enmascararTelefono(e164: string | null): string | null {
  if (!e164) return null;
  const m = /^\+57(\d{3})\d+(\d{4})$/.exec(e164);
  if (m) return `+57 ${m[1]} *** ${m[2]}`;
  return `${e164.slice(0, 4)} *** ${e164.slice(-4)}`;
}
