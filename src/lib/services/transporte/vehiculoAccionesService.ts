/**
 * Catálogo común › acciones del vehículo que comparten la lista y la ficha (cambiar estado y
 * asignar conductor). Escriben SOLO con `transportService.updateVehicle` (cliente de la sesión,
 * RLS por pertenencia) y anotan el cambio en `vehicles.metadata.bitacora` (ver
 * `formulariosCatalogo.agregarBitacora`): no hay tabla de auditoría de vehículos.
 */
import { transportService, type Vehicle } from '@/lib/services/transportService';
import { agregarBitacora } from '@/lib/transporte/formulariosCatalogo';

export async function cambiarEstadoVehiculo(v: Vehicle, estado: string, motivo: string | null): Promise<Vehicle> {
  return transportService.updateVehicle(v.id, {
    status: estado as Vehicle['status'],
    metadata: agregarBitacora(v.metadata, { tipo: 'estado', de: v.status, a: estado, motivo: motivo?.trim() || null, at: new Date().toISOString() }),
  });
}

/**
 * `vehicles.current_driver_id` → auth.users: se guarda el USUARIO de la persona, o null para
 * quitarlo. `nombres` va a la bitácora («Conductor asignado: …, antes: …»).
 */
export async function asignarConductorVehiculo(v: Vehicle, usuarioId: string | null, nombres: { antes: string | null; ahora: string | null }): Promise<Vehicle> {
  return transportService.updateVehicle(v.id, {
    current_driver_id: usuarioId,
    metadata: agregarBitacora(v.metadata, { tipo: 'conductor', de: nombres.antes, a: usuarioId ? nombres.ahora : null, at: new Date().toISOString() }),
  } as unknown as Partial<Vehicle>);
}
