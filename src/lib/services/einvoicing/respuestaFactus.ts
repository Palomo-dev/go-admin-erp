/**
 * Lectura de la respuesta de validación de Factus v2 (factura, nota crédito o
 * débito, documento soporte). Forma verificada en sandbox el 2026-09-23:
 * `data.number`, `data.cufe` (factura) o `data.cude` (notas) o `data.cuds`
 * (documento soporte), `data.is_validated`, `data.links.qr`,
 * `data.links.public_url` y `data.errors` con las notificaciones de la DIAN.
 * Se toleran variantes (`data.bill.*`) por si la API cambia de envoltorio.
 */

export interface ResultadoFactus {
  numero: string | null;
  /** CUFE / CUDE / CUDS según el documento. */
  codigoUnico: string | null;
  qr: string | null;
  urlPublica: string | null;
  validado: boolean;
  /** Notificaciones de la DIAN que no impiden la validación (reglas FAJ…, RUT01…). */
  notificaciones: string[];
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function comoLista(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === 'object') {
    return Object.values(v as Record<string, unknown>).flatMap((x) => (Array.isArray(x) ? x.map(String) : [String(x)]));
  }
  return [String(v)];
}

export function leerResultadoFactus(respuesta: unknown): ResultadoFactus {
  const raiz = (respuesta ?? {}) as { data?: Record<string, unknown> };
  const data = (raiz.data ?? {}) as Record<string, unknown>;
  const anidado = (data.bill ?? data.credit_note ?? data.support_document ?? {}) as Record<string, unknown>;
  // En una nota crédito, `data.bill` es la FACTURA referenciada: su CUFE no es el de la nota.
  const esNota = texto(data.cude) !== null || data.correction_concept !== undefined;
  const links = (data.links ?? (esNota ? {} : anidado.links) ?? {}) as Record<string, unknown>;

  const numero = texto(data.number) ?? (esNota ? null : texto(anidado.number));
  const codigoUnico =
    texto(data.cude) ??
    texto(data.cuds) ??
    texto(data.cufe) ??
    (esNota ? null : texto(anidado.cufe) ?? texto(anidado.cude) ?? texto(anidado.cuds));

  const validadoCrudo = data.is_validated ?? data.validated ?? (esNota ? undefined : anidado.is_validated ?? anidado.validated);
  const validado = validadoCrudo === true || validadoCrudo === 1 || validadoCrudo === '1';

  return {
    numero,
    codigoUnico,
    qr: texto(links.qr) ?? texto(data.qr) ?? null,
    urlPublica: texto(links.public_url) ?? null,
    validado,
    notificaciones: comoLista(data.errors).slice(0, 20),
  };
}
