/**
 * Lógica pura de «Qué sabe el agente» (Figma CRM 1804:905093, vacío
 * 1804:905573, estados 1806:147282). Los datos llegan resueltos del servidor
 * (`GET /api/crm/voice-agents/conocimiento`, mismo criterio que el runtime de
 * la llamada); aquí solo se decide qué estado se pinta.
 */
import type { ConocimientoEditorVoz } from '@/lib/services/crm/voiceAgent/conocimientoEditor';

export interface ConocimientoVozApi extends ConocimientoEditorVoz {
  silencio: { aviso_s: number; cierre_s: number; frase: string };
}

export type EstadoQueSabe = 'cargando' | 'error' | 'vacio' | 'tope' | 'listo';

export function estadoQueSabe(datos: ConocimientoVozApi | null, error: boolean): EstadoQueSabe {
  if (error) return 'error';
  if (!datos) return 'cargando';
  if (datos.fragmentos.length === 0) return 'vacio';
  return datos.fuera_del_tope.length > 0 ? 'tope' : 'listo';
}

/** Porcentaje del tope usado (0–100), para la barra. */
export function porcentajeTope(datos: Pick<ConocimientoVozApi, 'caracteres' | 'tope'>): number {
  if (!(datos.tope > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((datos.caracteres / datos.tope) * 100)));
}

/** «Casos de éxito» (prioridad 2) y «Glosario» (prioridad 1) — los que no entran. */
export function listaExcluidos(
  fuera: ConocimientoVozApi['fuera_del_tope'],
  conPrioridad: (titulo: string, prioridad: number) => string,
  sinPrioridad: (titulo: string) => string,
  conjuncion: string,
): string {
  const partes = fuera.map((f) => (f.prioridad === null ? sinPrioridad(f.titulo) : conPrioridad(f.titulo, f.prioridad)));
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} ${conjuncion} ${partes[partes.length - 1]}`;
}
