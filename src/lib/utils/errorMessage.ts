/**
 * Utilidades para convertir cualquier error en texto legible.
 *
 * Motivo: `console.error('algo:', err)` con un error de Supabase imprime `{}`
 * porque PostgrestError no es una instancia de Error y no tiene toJSON: sus
 * campos (`message`, `code`, `details`, `hint`) son propiedades enumerables
 * normales que la consola serializa como objeto vacío en algunos navegadores.
 * `describeError` los aplana a una sola línea legible.
 */

/** Forma de los errores que devuelve PostgREST/Supabase. */
interface SupabaseLikeError {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Devuelve una descripción de una sola línea de cualquier error.
 * Nunca lanza y nunca devuelve cadena vacía.
 */
export function describeError(error: unknown): string {
  if (error === null || error === undefined) return 'Error desconocido';

  if (typeof error === 'string') return error.trim() || 'Error desconocido';

  if (error instanceof Error) {
    // AbortError: la petición se cortó por timeout o por desmontaje.
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return 'La petición tardó demasiado y se canceló. Revisa la conexión e inténtalo de nuevo.';
    }
    // Un error de Supabase envuelto en Error puede traer campos extra.
    const extra = isRecord(error) ? describeSupabaseFields(error as SupabaseLikeError) : '';
    return extra ? `${error.message} ${extra}` : error.message || error.name;
  }

  if (isRecord(error)) {
    const fields = describeSupabaseFields(error as SupabaseLikeError);
    if (fields) {
      const message = typeof (error as SupabaseLikeError).message === 'string'
        ? String((error as SupabaseLikeError).message)
        : '';
      return message ? `${message} ${fields}`.trim() : fields;
    }
    if (typeof (error as SupabaseLikeError).message === 'string') {
      return String((error as SupabaseLikeError).message);
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}') return json;
    } catch {
      // Referencias circulares: caemos al valor por defecto.
    }
  }

  return String(error) || 'Error desconocido';
}

/** Serializa code/details/hint/status como `[code=… details=…]`. */
function describeSupabaseFields(error: SupabaseLikeError): string {
  const parts: string[] = [];
  if (error.code !== undefined && error.code !== null && error.code !== '') {
    parts.push(`code=${String(error.code)}`);
  }
  if (error.status !== undefined && error.status !== null && error.status !== '') {
    parts.push(`status=${String(error.status)}`);
  }
  if (typeof error.details === 'string' && error.details.trim()) {
    parts.push(`details=${error.details.trim()}`);
  }
  if (typeof error.hint === 'string' && error.hint.trim()) {
    parts.push(`hint=${error.hint.trim()}`);
  }
  return parts.length > 0 ? `[${parts.join(' ')}]` : '';
}

/**
 * Registra un error en consola de forma legible.
 * El objeto original se adjunta como segundo argumento para poder inspeccionarlo.
 */
export function logError(context: string, error: unknown): void {
  console.error(`${context}: ${describeError(error)}`, error);
}
