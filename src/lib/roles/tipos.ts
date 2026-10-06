// ============================================================
// Contrato de `/api/organizacion/roles/**` (Organización › Equipo › Roles y
// permisos). Compartido por el servidor y el cliente; solo tipos.
// ============================================================

import type { PermisoCatalogo } from './matrizPermisos';
import type { OrigenPermiso } from './permisosEfectivos';

/** Lo que la persona de la SESIÓN puede hacer aquí, resuelto en el servidor. */
export interface CapacidadesRoles {
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  asignar: boolean;
  /** Ver lo que puede hacer otra persona (`users.view` o admin, como exige la base). */
  verPersonas: boolean;
  editarCargos: boolean;
  /** Cambiar el alcance por sucursal de otra persona (`users.edit`). */
  editarAlcance: boolean;
}

export interface PersonaResumen {
  id: number;
  nombre: string;
}

export interface RolResumen {
  id: number;
  nombre: string;
  descripcion: string | null;
  /** Rol del sistema (sin organización): solo ver y duplicar. */
  sistema: boolean;
  /** Plantilla de la que salió (informativo). */
  basadoEn: number | null;
  basadoEnNombre: string | null;
  /** Control de concurrencia; null hasta aplicar la migración. */
  version: number | null;
  actualizado: string | null;
  permisoIds: number[];
  personas: number;
  /** Hasta tres personas para el grupo de avatares. */
  muestraPersonas: PersonaResumen[];
  /** Super Admin / Admin de organización: su poder sale del id, no de sus permisos. */
  esAdmin: boolean;
  /** Se puede usar como plantilla o duplicar. */
  duplicable: boolean;
}

export interface RespuestaRoles {
  roles: RolResumen[];
  catalogo: PermisoCatalogo[];
  capacidades: CapacidadesRoles;
  /** false = falta aplicar la migración de roles por organización: todo es de solo lectura. */
  modeloListo: boolean;
  totalPersonas: number;
}

export interface MiembroRoles {
  id: number;
  nombre: string;
  email: string | null;
  roleId: number;
  rolNombre: string | null;
  cargoId: string | null;
  cargoNombre: string | null;
  superAdmin: boolean;
  /** Dueño de la organización: su rol no se cambia desde aquí. */
  dueno: boolean;
  esSesion: boolean;
}

export interface DetalleRol {
  rol: RolResumen;
  miembros: MiembroRoles[];
  catalogo: PermisoCatalogo[];
  capacidades: CapacidadesRoles;
  modeloListo: boolean;
}

export interface CargoResumen {
  id: string;
  nombre: string;
  codigo: string | null;
  descripcion: string | null;
  departamento: string | null;
  activo: boolean;
  actualizado: string | null;
  /** Lo que el cargo SUMA (`allowed = true`). */
  permisoIds: number[];
  /** Lo que el cargo QUITA (`allowed = false`; la pantalla no lo escribe). */
  quitaIds: number[];
  personas: number;
  /**
   * Contratos activos de RR. HH. con este cargo cuyo miembro NO lo tiene en
   * `organization_members.job_position_id`: el cargo no les da permisos
   * (análisis §3.2, problema 11).
   */
  contratosSinVinculo: number;
}

export interface RespuestaCargos {
  cargos: CargoResumen[];
  catalogo: PermisoCatalogo[];
  capacidades: CapacidadesRoles;
  modeloListo: boolean;
}

export interface DetalleCargo {
  cargo: CargoResumen;
  miembros: MiembroRoles[];
  /** Rol más frecuente entre quienes tienen el cargo: referencia para «Ya lo da el rol». */
  rolReferencia: { id: number; nombre: string; permisoIds: number[] } | null;
  roles: Pick<RolResumen, 'id' | 'nombre' | 'permisoIds' | 'sistema'>[];
  catalogo: PermisoCatalogo[];
  capacidades: CapacidadesRoles;
  modeloListo: boolean;
}

export interface SucursalAlcance {
  id: number;
  nombre: string;
  detalle: string | null;
}

export interface AlcanceMiembro {
  modo: 'todas' | 'algunas';
  /** Admin: todas siempre, no se limita. */
  esAdmin: boolean;
  sucursales: SucursalAlcance[];
  asignadas: number[];
}

export interface PermisoEfectivoApi {
  id: number;
  concedido: boolean;
  origenes: OrigenPermiso[];
  quitadoPorCargo: boolean;
}

export interface QuePuedeHacer {
  miembro: MiembroRoles;
  accesoTotal: boolean;
  motivoAccesoTotal: 'superAdmin' | 'rolAdmin' | null;
  rol: { id: number; nombre: string; total: number };
  cargo: { id: string; nombre: string; suma: number; quita: number } | null;
  total: number;
  permisos: PermisoEfectivoApi[];
  catalogo: PermisoCatalogo[];
  alcance: AlcanceMiembro;
  puedeEditarAlcance: boolean;
  modeloListo: boolean;
}

/** Cuerpo de 409 al guardar: lo que hay guardado ahora. */
export interface ConflictoRol {
  codigo: 'conflicto';
  actual: { version: number | null; nombre: string; descripcion: string | null; permisoIds: number[] };
}

export interface ConflictoCargo {
  codigo: 'conflicto';
  actual: { actualizado: string | null; permisoIds: number[] };
}

/** Códigos de error de la API (`roles.errores.<codigo>` en messages). */
export type CodigoErrorRoles =
  | 'sin_permiso'
  | 'no_encontrado'
  | 'datos_invalidos'
  | 'conflicto'
  | 'nombre_duplicado'
  | 'rol_sistema'
  | 'plantilla_no_valida'
  | 'requiere_destino'
  | 'destino_no_valido'
  | 'miembro_no_valido'
  | 'migracion_pendiente'
  | 'error_interno';
