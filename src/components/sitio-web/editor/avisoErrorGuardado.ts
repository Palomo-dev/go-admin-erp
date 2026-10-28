/**
 * Qué decir cuando el autoguardado del borrador falla, según el código HTTP (auditoría 27-oct, punto 3):
 * 401 sesión vencida (ya se renovó y reintentó una vez), 403 sin permiso, 409 editado en otra pestaña,
 * 422 datos inválidos (con el detalle), 0 sin conexión; el resto, error genérico.
 */
export type MotivoErrorGuardado = 'sesion' | 'permiso' | 'otraPestana' | 'invalido' | 'red' | 'generico';

export interface ErrorGuardadoLike {
  estado?: number;
  codigo?: string;
  message?: string;
  detalles?: unknown;
}

export function motivoErrorGuardado(error: ErrorGuardadoLike | null | undefined): MotivoErrorGuardado {
  if (!error) return 'generico';
  const { estado, codigo } = error;
  if (codigo === 'red' || estado === 0) return 'red';
  if (estado === 401 || codigo === 'sin_sesion') return 'sesion';
  if (estado === 403 || codigo === 'sin_permiso') return 'permiso';
  if (estado === 409 || codigo === 'conflicto_version') return 'otraPestana';
  if (estado === 422 || codigo === 'documento_invalido' || codigo === 'peticion_invalida') return 'invalido';
  return 'generico';
}

/** Detalle legible del 422: las rutas del contrato que fallaron (máx. 3) o el mensaje del servidor. */
export function detalleErrorGuardado(error: ErrorGuardadoLike | null | undefined): string {
  if (!error) return '';
  const lista = Array.isArray(error.detalles) ? (error.detalles as { ruta?: unknown; message?: unknown }[]) : [];
  const rutas = lista
    .map((e) => (e && typeof e.ruta === 'string' && e.ruta ? e.ruta : null))
    .filter((r): r is string => !!r)
    .slice(0, 3);
  if (rutas.length > 0) return rutas.join(', ');
  return typeof error.message === 'string' ? error.message : '';
}
