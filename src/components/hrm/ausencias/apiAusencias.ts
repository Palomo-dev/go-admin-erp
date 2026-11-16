'use client';

/**
 * Ausencias desde el navegador, siempre por `/api/hrm/ausencias/**`: la organización
 * y el actor salen de la sesión; lo que cada quien ve lo decide la base (decisión 2).
 */
import { pedir, subirDocumento } from '../personas/apiPersonas';
import type { DetalleAusencia, ListaAusencias, Seccion, Simulacion } from './ausenciasLogica';

export interface DatosAusencia {
  tipo?: string;
  tipo_id?: string;
  desde: string;
  hasta: string;
  vinculo_id?: string;
  medio_dia_inicio?: boolean;
  medio_dia_fin?: boolean;
  medio_dia_jornada?: 'morning' | 'afternoon';
  motivo?: string;
  horas?: { inicio: string; fin: string } | null;
  se_repone?: boolean;
  fecha_parto?: string | null;
  documento_id?: string | null;
  prorroga_de?: string | null;
  salud?: { diagnostico_codigo?: string; diagnostico?: string; entidad?: string } | null;
}

export function urlLista(seccion: Seccion | 'todas', desde: string, hasta: string, propias = false): string {
  const q = new URLSearchParams({ seccion, desde, hasta });
  if (propias) q.set('propias', '1');
  return `/api/hrm/ausencias?${q.toString()}`;
}

export function listarAusencias(seccion: Seccion | 'todas', desde: string, hasta: string, propias = false) {
  return pedir<ListaAusencias>(urlLista(seccion, desde, hasta, propias));
}

export function simularAusencia(datos: DatosAusencia) {
  return pedir<Simulacion>('/api/hrm/ausencias/simular', { metodo: 'POST', cuerpo: datos });
}

export function registrarAusencia(datos: DatosAusencia) {
  return pedir<{ id: string; estado: string; dias_habiles: number; aprobacion_id: string | null }>('/api/hrm/ausencias', {
    metodo: 'POST',
    cuerpo: datos,
  });
}

export function verAusencia(id: string) {
  return pedir<DetalleAusencia>(`/api/hrm/ausencias/${encodeURIComponent(id)}`);
}

export interface DetalleSalud {
  diagnostico_codigo: string | null;
  diagnostico: string | null;
  entidad: string | null;
  origen: string | null;
  notas: string | null;
}

/** Diagnóstico: cada lectura queda en el registro de accesos (también el intento sin permiso). */
export function leerSalud(id: string) {
  return pedir<DetalleSalud>(`/api/hrm/ausencias/${encodeURIComponent(id)}/salud`);
}

export function cancelarAusencia(id: string, motivo: string | null) {
  return pedir<{ id: string; estado: string }>(`/api/hrm/ausencias/${encodeURIComponent(id)}/cancelar`, { metodo: 'POST', cuerpo: { motivo } });
}

export function interrumpirVacaciones(id: string, ultimoDia: string, motivo: string) {
  return pedir<{ dias_devueltos: number }>(`/api/hrm/ausencias/${encodeURIComponent(id)}/interrumpir`, {
    metodo: 'POST',
    cuerpo: { ultimo_dia: ultimoDia, motivo },
  });
}

/** Sube el soporte al expediente (grupo salud) y lo enlaza a la ausencia. */
export async function subirSoporte(ausenciaId: string, personaId: string, vinculoId: string, archivo: File): Promise<string> {
  const { id } = await subirDocumento(personaId, archivo, 'soporte_ausencia', { vinculoId });
  await pedir(`/api/hrm/ausencias/${encodeURIComponent(ausenciaId)}/soporte`, { metodo: 'POST', cuerpo: { documento_id: id } });
  return id;
}

/** Sube el soporte antes de registrar (el registro lo enlaza con `documento_id`). */
export async function subirSoporteSuelto(personaId: string, vinculoId: string, archivo: File): Promise<string> {
  const { id } = await subirDocumento(personaId, archivo, 'soporte_ausencia', { vinculoId });
  return id;
}
