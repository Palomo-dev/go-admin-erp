/**
 * Contrato de `/api/hrm/configuracion/**` (Configuración › Recursos humanos,
 * diseños 10.RH.1–10.RH.5). Compartido por el servidor y el cliente; solo tipos.
 */

export type EstadoParametro = 'vigente' | 'transitorio' | 'litigio' | 'suspendido' | 'por_confirmar';

export interface FilaParametro {
  code: string;
  value: number | null;
  value_json: unknown;
  effective_from: string;
  effective_to: string | null;
  status: EstadoParametro;
  verificacion: 'V' | 'S' | 'NC';
  legal_source: string;
  source_url: string | null;
  notes: string | null;
}

export interface FilaParametroEmpresa {
  id: string;
  code: string;
  value: number | null;
  value_json: unknown;
  effective_from: string;
  effective_to: string | null;
  reason: string;
}

export interface ReglaArl {
  id: string;
  sedeId: number | null;
  cargoId: string | null;
  clase: number;
}

export interface OpcionConfig {
  id: string;
  nombre: string;
  detalle?: string | null;
}

export interface DatosParametros {
  /** Hoy en la zona de la organización. */
  hoy: string;
  /** Moneda del país de los valores de ley (ISO 4217), o null si no se reconoce. */
  moneda: string | null;
  /** Filas de plataforma (incluida la UVT, convertida a fila). */
  ley: FilaParametro[];
  empresa: FilaParametroEmpresa[];
  arl: ReglaArl[];
  sedes: OpcionConfig[];
  cargos: OpcionConfig[];
  puedeEditar: boolean;
}

/** Cambio de «Lo que define tu empresa» (→ fn_hr_parametros_empresa_guardar). */
export interface CambioEmpresa {
  code: string;
  valor?: number | null;
  valor_json?: unknown;
  desde?: string | null;
  activo: boolean;
}

export interface Festivo {
  id: string;
  fecha: string;
  nombre: string;
  origen: 'plataforma' | 'organizacion';
  fecha_original: string;
  medio_dia: boolean;
  medio_dia_desde: string | null;
  sedes: number[] | null;
  revision_contador: boolean;
}

export interface DatosFestivos {
  hoy: string;
  anio: number;
  festivos: Festivo[];
  sedes: OpcionConfig[];
  puedeEditar: boolean;
}

export interface NuevoDiaPropio {
  fecha: string;
  nombre: string;
  medioDia: boolean;
  desde: string | null;
  sedes: number[];
}

export type TipoAprobador = 'jefe_directo' | 'jefe_area' | 'rrhh' | 'cargo' | 'rol' | 'persona';

export interface PasoRegla {
  tipo: TipoAprobador;
  cargo?: string | null;
  persona?: string | null;
  rol?: number | null;
}

export interface Regla {
  id: string;
  tipo: string;
  nombre: string;
  prioridad: number;
  activa: boolean;
  condiciones: Record<string, unknown>;
  pasos: PasoRegla[];
  siEsQuienPide: 'siguiente_paso' | 'rrhh';
  siNoHay: 'rrhh' | 'siguiente_paso';
}

export interface Delegacion {
  id: string;
  deId: string;
  deNombre: string;
  aId: string;
  aNombre: string;
  desde: string;
  hasta: string;
  tipos: string[] | null;
  motivo: string;
  activa: boolean;
}

export interface Persona {
  id: string;
  nombre: string;
  cargo: string | null;
}

export interface EmpleadoOpcion {
  id: string;
  nombre: string;
  cargo: string | null;
  sede: string | null;
}

export interface DatosAprobaciones {
  hoy: string;
  reglas: Regla[];
  delegaciones: Delegacion[];
  personas: Persona[];
  empleados: EmpleadoOpcion[];
  cargos: OpcionConfig[];
  sedes: OpcionConfig[];
  areas: OpcionConfig[];
  /** Cuántas personas tienen «Aprobar solicitudes de RR. HH.». */
  rrhh: number;
  puedeEditar: boolean;
}

export interface PersonaPlan {
  id: string;
  nombre: string;
  reemplazo: { id: string; nombre: string; desde: string; hasta: string; motivo: string } | null;
}

export interface PasoPlan {
  orden: number;
  tipo: TipoAprobador;
  respaldo: boolean;
  personas: PersonaPlan[];
  cargo_nombre: string | null;
}

export interface ResultadoPrueba {
  regla: { id: string; nombre: string; orden: number } | null;
  otras: { id: string; nombre: string; orden: number }[];
  pasos: PasoPlan[];
  por_defecto?: boolean;
  sin_aprobador: number | null;
}

export type AccionRegistro = 'ver' | 'editar' | 'exportar' | 'sin_permiso';

export interface FilaRegistro {
  id: number;
  cuando: string;
  accion: AccionRegistro;
  grupo: string;
  ip: string | null;
  agente: string | null;
  ruta: string | null;
  campos: string[] | null;
  evento: string | null;
  documento: string | null;
  origen: string | null;
  actor: { id: string; nombre: string | null; cargo: string | null };
  empleado: { id: string; nombre: string | null; cargo: string | null; sede: string | null } | null;
}

export interface ListaRegistro {
  permitido: boolean;
  total?: number;
  conteos?: Record<AccionRegistro, number>;
  filas?: FilaRegistro[];
}

export interface DetalleRegistro extends FilaRegistro {
  evento_detalle: { id: string; campo: string; desde: string; motivo: string; estado: string; tiene_valores: boolean } | null;
  aprobacion: { estado: string; tipo: string | null; aprobadores: string[] } | null;
  otros: FilaRegistro[];
}

export interface ValoresRegistro {
  anterior: unknown;
  nuevo: unknown;
  campo: string;
}
