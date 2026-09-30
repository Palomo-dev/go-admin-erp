/**
 * Lógica del menú «⋯» de oportunidad (Figma `OpportunityRowMenu` 759:21624).
 * Sin React.
 *
 * - Abierta: Ver detalle, Editar, Mover de etapa, Marcar ganada, Marcar
 *   perdida, Duplicar, Nueva tarea · divisor · Eliminar (rojo).
 * - Cerrada (ganada o perdida): «Reabrir» reemplaza a ganar y perder.
 *
 * Los permisos llegan resueltos por el servidor (`crm.opportunities.*`, ola 1
 * M7). Sin permiso, la acción **no se pinta** (el diseño de «sin permiso»
 * quita los botones de escritura; nunca un deshabilitado sin explicación).
 */

export type AccionMenuOportunidad =
  | 'ver'
  | 'editar'
  | 'mover'
  | 'ganar'
  | 'perder'
  | 'reabrir'
  | 'duplicar'
  | 'nuevaTarea'
  | 'eliminar';

export type EstadoMenuOportunidad = 'abierta' | 'cerrada';

export interface PermisosOportunidad {
  editar?: boolean;
  cerrar?: boolean;
  crear?: boolean;
  eliminar?: boolean;
}

/** `opportunities.status` (`open` | `won` | `lost`) → estado del menú. */
export function estadoMenuDe(status: string | null | undefined): EstadoMenuOportunidad {
  return status === 'won' || status === 'lost' ? 'cerrada' : 'abierta';
}

const PERMISO: Record<AccionMenuOportunidad, keyof PermisosOportunidad | null> = {
  ver: null,
  editar: 'editar',
  mover: 'editar',
  ganar: 'cerrar',
  perder: 'cerrar',
  reabrir: 'cerrar',
  duplicar: 'crear',
  nuevaTarea: 'editar',
  eliminar: 'eliminar',
};

/** Acciones visibles, en el orden del Figma. Sin `permisos`, se asume todo permitido. */
export function accionesMenuOportunidad(
  estado: EstadoMenuOportunidad,
  permisos: PermisosOportunidad = { editar: true, cerrar: true, crear: true, eliminar: true },
): AccionMenuOportunidad[] {
  const orden: AccionMenuOportunidad[] =
    estado === 'abierta'
      ? ['ver', 'editar', 'mover', 'ganar', 'perder', 'duplicar', 'nuevaTarea', 'eliminar']
      : ['ver', 'editar', 'mover', 'reabrir', 'duplicar', 'nuevaTarea', 'eliminar'];
  return orden.filter((a) => {
    const p = PERMISO[a];
    return p === null || permisos[p] !== false;
  });
}

export function esDestructiva(accion: AccionMenuOportunidad): boolean {
  return accion === 'eliminar';
}
