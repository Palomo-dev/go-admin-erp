/**
 * Lógica de presentación de los reclamos de garantía (inventario B4), sin
 * React: tono de cada estado, qué acciones admite, motivos rápidos y
 * validación de los diálogos (la RPC vuelve a validar todo).
 *
 * Ciclo (el de `fn_garantia_*`):
 *   pendiente → aprobado → en proceso (con el proveedor) → resuelto
 *   pendiente · aprobado · en proceso → rechazado
 */
import type { EstadoReclamo, TipoResolucion } from '@/lib/services/seriales/contrato';

export type TonoReclamo = 'advertencia' | 'informacion' | 'marca' | 'exito' | 'peligro' | 'neutro';

export const TONO_ESTADO_RECLAMO: Record<EstadoReclamo, TonoReclamo> = {
  pending: 'advertencia',
  approved: 'marca',
  in_process: 'informacion',
  resolved: 'exito',
  rejected: 'peligro',
  cancelled: 'neutro',
};

export interface AccionesReclamo {
  aprobar: boolean;
  rma: boolean;
  resolver: boolean;
  rechazar: boolean;
}

/** Qué se puede hacer con un reclamo en su estado (sin mirar permisos). */
export function accionesReclamo(estado: string): AccionesReclamo {
  return {
    aprobar: estado === 'pending',
    rma: estado === 'pending' || estado === 'approved',
    resolver: estado === 'pending' || estado === 'approved' || estado === 'in_process',
    rechazar: estado === 'pending' || estado === 'approved' || estado === 'in_process',
  };
}

export const ESTADOS_ABIERTOS: readonly EstadoReclamo[] = ['pending', 'approved', 'in_process'];

export function esReclamoAbierto(estado: string): boolean {
  return (ESTADOS_ABIERTOS as readonly string[]).includes(estado);
}

/** Motivos rápidos del reclamo (claves de `inventarioGarantias.motivos`). */
export const MOTIVOS_RECLAMO = ['noEnciende', 'noCarga', 'pantalla', 'sonido', 'golpe', 'otro'] as const;
export type MotivoReclamo = (typeof MOTIVOS_RECLAMO)[number];

export interface FormularioReclamo {
  serialId: number | null;
  puede: boolean;
  motivo: MotivoReclamo | '';
  descripcion: string;
}

export type ErrorFormularioReclamo = 'serial' | 'noReclamable' | 'motivo' | 'descripcionOtro';

/** Primer error del formulario «Nuevo reclamo», o null si se puede crear. */
export function validarReclamo(f: FormularioReclamo): ErrorFormularioReclamo | null {
  if (!f.serialId) return 'serial';
  if (!f.puede) return 'noReclamable';
  if (!f.motivo) return 'motivo';
  if (f.motivo === 'otro' && f.descripcion.trim().length < 3) return 'descripcionOtro';
  return null;
}

export interface FormularioRma {
  rma: string;
}

export function validarRma(f: FormularioRma): 'rma' | null {
  const rma = f.rma.trim();
  return rma.length === 0 || rma.length > 80 ? 'rma' : null;
}

export interface FormularioResolucion {
  tipo: TipoResolucion | '';
  serialReemplazo: number | null;
  monto: number | null;
}

export type ErrorResolucion = 'tipo' | 'reemplazo' | 'monto';

export function validarResolucion(f: FormularioResolucion): ErrorResolucion | null {
  if (!f.tipo) return 'tipo';
  if (f.tipo === 'replacement' && !f.serialReemplazo) return 'reemplazo';
  if (f.tipo === 'refund' && !(typeof f.monto === 'number' && Number.isFinite(f.monto) && f.monto > 0)) return 'monto';
  return null;
}

/** Estado en que queda la unidad reclamada al resolver (el mismo de `fn_garantia_resolver`). */
export function estadoUnidadAlResolver(tipo: TipoResolucion, estadoReclamo: string): 'sold' | 'rma' | 'damaged' {
  if (tipo === 'repair') return 'sold';
  return estadoReclamo === 'in_process' ? 'rma' : 'damaged';
}
