/**
 * Normaliza un teléfono al formato internacional E.164 requerido por Vercel.
 * El componente de teléfono puede entregar espacios y guiones; la API no.
 */
export function normalizePhoneToE164(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('+')) return null;

  const normalized = `+${trimmed.slice(1).replace(/\D/g, '')}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

