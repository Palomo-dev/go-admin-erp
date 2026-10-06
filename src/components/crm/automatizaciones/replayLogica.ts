/** Lógica pura de la prueba en seco retroactiva (sin React). */

/** Motivos de omisión de mayor a menor (empate: alfabético, para que no salte). */
export function motivosOrdenados(motivos: Record<string, number>): [string, number][] {
  return Object.entries(motivos)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export type ModoPrueba = 'una' | 'historial';

export const rutaReplay = (ruleId: string): string => `/api/crm/automation-rules/${encodeURIComponent(ruleId)}/replay`;
