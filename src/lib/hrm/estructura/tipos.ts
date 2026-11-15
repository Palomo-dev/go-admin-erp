/**
 * Recursos humanos › Estructura (Figma 20.1): forma de lo que devuelven las RPC
 * `fn_hr_estructura_*` y `fn_hr_cargo_*` (migración `hrm_f1_02_estructura`).
 * Sin React ni Supabase: lo importan el servidor, las pantallas y las pruebas.
 */

export interface SedeOpcion {
  id: number;
  nombre: string;
}

export interface Opcion {
  id: string;
  nombre: string;
}

/** Plazas de un área (o de un cargo) en una sede. `aprobadas` null = sin presupuesto. */
export interface PlazaSede {
  sede_id: number;
  aprobadas: number | null;
  ocupadas: number;
}

export interface AreaApi {
  id: string;
  parent_id: string | null;
  nombre: string;
  codigo: string | null;
  descripcion: string | null;
  centro_costo: { id: string | null; codigo: string; nombre: string | null } | null;
  responsable: { id: string; nombre: string | null; cargo: string | null } | null;
  /** Personas activas del área misma (sin las áreas hijas). */
  personas: number;
  sedes: number[];
  plazas: PlazaSede[];
  cargos: { id: string; nombre: string; personas: number }[];
  actualizado: string | null;
}

export interface RespuestaAreas {
  hoy: string;
  permisos: { gestionar: boolean; solicitar: boolean };
  sedes: SedeOpcion[];
  centros: { id: string; codigo: string; nombre: string }[];
  responsables: { id: string; nombre: string | null; cargo: string | null }[];
  areas: AreaApi[];
}

export interface DatosArea {
  nombre: string;
  parent_id: string | null;
  responsable_id: string | null;
  centro_costo_id: string | null;
  descripcion: string | null;
  sedes: number[];
}

/** Escala salarial (grupo salario y pago). `sede_id` null = todas las sedes. */
export interface Escala {
  id: string;
  sede_id: number | null;
  minimo: number;
  medio: number;
  maximo: number;
  desde: string;
  hasta: string | null;
  motivo: string | null;
}

export interface EscalaVigente extends Escala {
  personas: number;
  debajo: number;
  encima: number;
}

export interface EscalaHistorial extends Escala {
  por: string | null;
  creado: string;
}

export interface CargoFila {
  id: string;
  nombre: string;
  codigo: string | null;
  area_id: string | null;
  area: string | null;
  nivel: number | null;
  reporta_a: Opcion | null;
  personas: number;
  /** Plazas aprobadas para el cargo; null si el presupuesto no lo detalla por cargo. */
  plazas: number | null;
  documentos: number;
  /** Solo con el permiso de salario. */
  escala?: Escala | null;
}

export interface RespuestaCargos {
  hoy: string;
  sede_id: number | null;
  permisos: { crear: boolean; editar: boolean; salario: boolean };
  areas: Opcion[];
  cargos: CargoFila[];
}

export type TipoCompetencia = 'tecnica' | 'comportamental';

export interface Competencia {
  id?: string;
  nombre: string;
  tipo: TipoCompetencia;
  nivel: number;
}

export interface CargoDetalle {
  id: string;
  nombre: string;
  codigo: string | null;
  activo: boolean;
  area_id: string | null;
  area: string | null;
  nivel: number | null;
  reporta_a: Opcion | null;
  proposito: string | null;
  funciones: string[];
  educacion: string | null;
  experiencia: string | null;
  clase_arl: number | null;
  personas: number;
  competencias: Competencia[];
  documentos: string[];
  documentos_propios: boolean;
  plazas: PlazaSede[];
  actualizado: string | null;
}

export interface RespuestaCargo {
  hoy: string;
  cargo: CargoDetalle | null;
  escalas: { vigentes: EscalaVigente[]; programadas: Escala[]; historial: EscalaHistorial[] } | null;
  permisos: { crear: boolean; editar: boolean; salario: boolean; salario_editar: boolean; arl: boolean };
  sedes: SedeOpcion[];
  areas: Opcion[];
  cargos: Opcion[];
}

export interface FilaEscalaForm {
  sede_id: number | null;
  minimo: number | null;
  medio: number | null;
  maximo: number | null;
}

export interface DatosCargo {
  nombre: string;
  area_id: string | null;
  nivel: number | null;
  reporta_a_id: string | null;
  proposito: string | null;
  funciones: string[];
  educacion: string | null;
  experiencia: string | null;
  competencias: Competencia[];
  documentos: string[];
  clase_arl?: number | null;
  escala?: { desde: string; motivo: string; filas: FilaEscalaForm[] };
}

export interface FilaPlaza {
  area_id: string;
  sede_id: number;
  aprobadas: number;
  ocupadas: number;
}

export type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada' | 'cancelada';
export type TipoPlaza = 'permanente' | 'temporal';

export interface SolicitudPlaza {
  id: string;
  area_id: string;
  sede_id: number;
  cargo_id: string | null;
  cargo: string | null;
  cantidad: number;
  tipo: TipoPlaza;
  desde: string;
  hasta: string | null;
  justificacion: string;
  estado: EstadoSolicitud;
  solicitado_por: string | null;
  creado: string;
  decidido: string | null;
  decidido_por: string | null;
  comentario: string | null;
  aprobadores: string[];
}

export interface RespuestaPlazas {
  hoy: string;
  permisos: { solicitar: boolean };
  sedes: SedeOpcion[];
  areas: (Opcion & { parent_id: string | null })[];
  cargos: (Opcion & { area_id: string | null })[];
  filas: FilaPlaza[];
  solicitudes: SolicitudPlaza[];
}

export interface DatosSolicitudPlaza {
  area_id: string;
  sede_id: number;
  cargo_id: string;
  cantidad: number;
  tipo: TipoPlaza;
  desde: string;
  hasta: string | null;
  justificacion: string;
}

export interface PlanPlaza {
  regla: { id: string; nombre: string } | null;
  sin_aprobador: boolean;
  aprobadores: { nombre: string | null; cargo: string | null }[];
  pasos: number;
  escala: Escala | null;
}
