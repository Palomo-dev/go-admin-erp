/**
 * Redacción de secretos antes de registrar o devolver cualquier cosa (integration_events, logs,
 * errores). Dos reglas:
 * - por clave: un campo cuyo nombre parece credencial (clave, pwd, token, apikey, secret…);
 * - por valor: cualquier texto que contenga uno de los secretos conocidos de la conexión.
 */

const CLAVE_SENSIBLE = /(pass|pwd|clave|secret|token|api[_-]?key|apikey|authorization|llave|firma|signature)/i;
const REDACTADO = '[redactado]';

/** Copia profunda con los secretos reemplazados. No modifica el original. */
export function redactar(valor: unknown, secretos: readonly string[] = []): unknown {
  const conocidos = secretos.filter((s) => typeof s === 'string' && s.length >= 4);
  const limpiarTexto = (t: string): string => conocidos.reduce((acc, s) => acc.split(s).join(REDACTADO), t);
  const visitar = (v: unknown, profundidad: number): unknown => {
    if (profundidad > 12) return '[profundidad]';
    if (typeof v === 'string') return limpiarTexto(v);
    if (Array.isArray(v)) return v.map((x) => visitar(x, profundidad + 1));
    if (v && typeof v === 'object') {
      const salida: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        salida[k] = CLAVE_SENSIBLE.test(k) && x !== null && x !== undefined && x !== '' ? REDACTADO : visitar(x, profundidad + 1);
      }
      return salida;
    }
    return v;
  };
  return visitar(valor, 0);
}

/** Texto (por ejemplo, un cuerpo SOAP) con los secretos conocidos reemplazados. */
export function redactarTexto(texto: string, secretos: readonly string[] = []): string {
  return redactar(texto, secretos) as string;
}
