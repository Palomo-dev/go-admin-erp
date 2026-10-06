/**
 * Invitaciones de Organización › Equipo: estado visible, cupo y filtros.
 *
 * `invitations.status` guarda `pending | used | revoked` (y, tras la migración
 * pendiente `organizacion_invitaciones_y_cargo`, también `expired`). El
 * vencimiento NO se guarda hoy: una fila `pending` con `expires_at` pasado es
 * una invitación vencida, que no se puede aceptar, no ocupa cupo y no bloquea
 * volver a invitar al mismo correo (auditoría 2026-10, P1-5). Cualquier otro
 * valor (había una fila con `half`) se trata como revocada: no es aceptable.
 */

export type EstadoInvitacion = 'pendiente' | 'aceptada' | 'revocada' | 'vencida';

export interface FilaInvitacion {
  status: string | null;
  expires_at: string | null;
}

export function estadoInvitacion(fila: FilaInvitacion, ahora: number = Date.now()): EstadoInvitacion {
  switch (fila.status) {
    case 'used':
      return 'aceptada';
    case 'expired':
      return 'vencida';
    case 'pending': {
      if (fila.expires_at) {
        const vence = new Date(fila.expires_at).getTime();
        if (Number.isFinite(vence) && vence < ahora) return 'vencida';
      }
      return 'pendiente';
    }
    default:
      return 'revocada';
  }
}

/** ¿Ocupa un puesto del cupo de usuarios? Solo las pendientes vigentes. */
export function ocupaCupo(fila: FilaInvitacion, ahora: number = Date.now()): boolean {
  return estadoInvitacion(fila, ahora) === 'pendiente';
}

export function contarVigentes(filas: readonly FilaInvitacion[], ahora: number = Date.now()): number {
  return filas.reduce((n, f) => n + (ocupaCupo(f, ahora) ? 1 : 0), 0);
}

/** Días que le quedan a una pendiente (0 = vence hoy). `null` si no vence o ya venció. */
export function diasParaVencer(fila: FilaInvitacion, ahora: number = Date.now()): number | null {
  if (estadoInvitacion(fila, ahora) !== 'pendiente' || !fila.expires_at) return null;
  const ms = new Date(fila.expires_at).getTime() - ahora;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Acciones que admite una invitación según su estado. */
export function accionesInvitacion(estado: EstadoInvitacion): { reenviar: boolean; revocar: boolean } {
  return {
    // Una vencida se reenvía: el servidor rota el código y renueva la vigencia.
    reenviar: estado === 'pendiente' || estado === 'vencida',
    revocar: estado === 'pendiente',
  };
}

export interface FiltrosInvitacion {
  texto: string;
  estado: EstadoInvitacion | 'todas';
  rolId: number | null;
}

export interface InvitacionListado extends FilaInvitacion {
  id: number;
  email: string;
  role_id: number | null;
}

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filtrarInvitaciones<T extends InvitacionListado>(
  filas: readonly T[],
  filtros: FiltrosInvitacion,
  ahora: number = Date.now(),
): T[] {
  const q = normalizar(filtros.texto);
  return filas.filter((f) => {
    if (q && !normalizar(f.email).includes(q)) return false;
    if (filtros.estado !== 'todas' && estadoInvitacion(f, ahora) !== filtros.estado) return false;
    if (filtros.rolId !== null && f.role_id !== filtros.rolId) return false;
    return true;
  });
}

/** Pendientes primero, luego vencidas, aceptadas y revocadas; dentro, la más reciente arriba. */
export function ordenarInvitaciones<T extends InvitacionListado & { created_at: string | null }>(
  filas: readonly T[],
  ahora: number = Date.now(),
): T[] {
  const peso: Record<EstadoInvitacion, number> = { pendiente: 0, vencida: 1, aceptada: 2, revocada: 3 };
  return [...filas].sort((a, b) => {
    const d = peso[estadoInvitacion(a, ahora)] - peso[estadoInvitacion(b, ahora)];
    if (d !== 0) return d;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });
}
