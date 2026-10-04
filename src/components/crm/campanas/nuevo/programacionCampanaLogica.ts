import { aFechaHoraLocal, deFechaHoraLocal } from '@/components/crm/kit/fechasCrm';

export type ModoProgramacion = 'now' | 'scheduled';
export type ErrorProgramacion = 'incompleta' | 'invalida' | 'pasada';

/** La fecha de pared pertenece a la organización, incluso si el navegador usa otra zona. */
export function evaluarProgramacion(modo: ModoProgramacion, local: string, zona: string, ahora: Date): {
  instante: string | null; error: ErrorProgramacion | null;
} {
  if (modo === 'now') return { instante: null, error: null };
  if (!local) return { instante: null, error: 'incompleta' };
  try {
    const instante = deFechaHoraLocal(local, zona);
    // Rechaza fechas inválidas y horas inexistentes durante el cambio de horario.
    if (!instante || aFechaHoraLocal(instante, zona) !== local) return { instante: null, error: 'invalida' };
    if (new Date(instante).getTime() <= ahora.getTime()) return { instante: null, error: 'pasada' };
    return { instante, error: null };
  } catch { return { instante: null, error: 'invalida' }; }
}

export function minutosMinimosCampana(contactos: number, mensajesSegundo: number): number {
  return mensajesSegundo > 0 ? Math.ceil(contactos / mensajesSegundo / 60) : 0;
}
