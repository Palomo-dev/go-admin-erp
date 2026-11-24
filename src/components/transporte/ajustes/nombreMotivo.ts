/**
 * Nombre visible de un motivo de novedad: el que escribió la organización o, si lo dejó vacío,
 * el traducido del motivo del diseño (`transporte.motivos.<id>`). Un motivo propio sin nombre
 * (no debería pasar: la ruta lo rechaza) muestra su id.
 */
import type { MotivoNovedad } from '@/lib/transporte/ajustesTransporte';

interface Traductor {
  (clave: string): string;
  has(clave: string): boolean;
}

export function nombreMotivo(t: Traductor, m: Pick<MotivoNovedad, 'id' | 'nombre'>): string {
  if (m.nombre.trim()) return m.nombre;
  return t.has(`motivos.${m.id}`) ? t(`motivos.${m.id}`) : m.id;
}
