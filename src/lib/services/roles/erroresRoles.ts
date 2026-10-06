/**
 * Errores de Roles y permisos: de la base (SQLSTATE de las RPC `fn_rol_*`,
 * `fn_cargo_guardar_permisos`, `fn_miembro_asignar_sucursales`) a un código
 * estable que la interfaz traduce en `roles.errores.<codigo>`. Módulo hoja.
 */
import type { CodigoErrorRoles } from '@/lib/roles/tipos';

export class ErrorRoles extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: CodigoErrorRoles,
    /** Datos extra para la respuesta (`actual` en un conflicto, `detalle` con el miembro que falló). */
    readonly extra: Record<string, unknown> = {},
  ) {
    super(codigo);
    this.name = 'ErrorRoles';
  }
}

export interface ErrorPostgrest {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

/** Función inexistente: la migración 20261006140000 aún no se aplicó. */
export function esFuncionAusente(e: ErrorPostgrest | null | undefined): boolean {
  return e?.code === 'PGRST202' || e?.code === '42883';
}

/** Columna inexistente (lectura con el modelo anterior a la migración). */
export function esColumnaAusente(e: ErrorPostgrest | null | undefined): boolean {
  return e?.code === '42703' || e?.code === 'PGRST204' || /column .* does not exist/i.test(e?.message ?? '');
}

/** Mensaje de la base sin el prefijo técnico («roles: …» / «miembros: …»). */
export function mensajeBase(e: ErrorPostgrest): string {
  return (e.message ?? '').replace(/^(roles|miembros):\s*/, '');
}

export function errorDeRpc(e: ErrorPostgrest): ErrorRoles {
  const mensaje = mensajeBase(e);
  const extra: Record<string, unknown> = { mensaje };
  if (e.details) extra.detalle = e.details;
  if (esFuncionAusente(e)) return new ErrorRoles(503, 'migracion_pendiente');
  switch (e.code) {
    case '40001':
      return new ErrorRoles(409, 'conflicto', extra);
    case '23505':
      return new ErrorRoles(409, 'nombre_duplicado', extra);
    case 'P0002':
      return new ErrorRoles(404, 'no_encontrado', extra);
    case '42501':
      if (/sistema/i.test(mensaje)) return new ErrorRoles(403, 'rol_sistema', extra);
      if (/otra organizaci|cambiarte a ti|dueño|super admin/i.test(mensaje)) return new ErrorRoles(403, 'miembro_no_valido', extra);
      return new ErrorRoles(403, 'sin_permiso', extra);
    case '22023':
      if (/plantilla/i.test(mensaje)) return new ErrorRoles(400, 'plantilla_no_valida', extra);
      if (/elige a qué rol/i.test(mensaje)) return new ErrorRoles(400, 'requiere_destino', extra);
      if (/destino/i.test(mensaje)) return new ErrorRoles(400, 'destino_no_valido', extra);
      return new ErrorRoles(400, 'datos_invalidos', extra);
    default:
      return new ErrorRoles(500, 'error_interno');
  }
}
