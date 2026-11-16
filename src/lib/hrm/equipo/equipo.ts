/**
 * Reglas puras de la vista del jefe («Mi equipo», Figma 20.15). Sin React:
 * las prueban `__tests__/equipo.test.ts`.
 *
 * Nunca hay salario, banco ni salud en estos datos: una incapacidad llega con
 * `clase = 'incapacidad'` y sin etiqueta, y se lee «Ausencia justificada».
 */
import type { AusenciaSemana } from '@/lib/hrm/turnos/programacion';

export interface PersonaEquipo {
  id: string;
  nombre: string;
  cargo: string | null;
  area: string | null;
  area_id: string | null;
  directo: boolean | null;
}

export interface PendienteEquipo {
  id: string;
  /** `ausencia`, `horas_extra`, `novedad_asistencia`, `cambio_turno`, `falta` o `marca_por_revisar`. */
  tipo: string;
  employment_id: string;
  desde: string;
  estado: 'por_aprobar' | 'falta' | 'por_revisar';
  novedad?: string | null;
  fecha?: string | null;
  hasta?: string | null;
  minutos?: number | null;
  dias_habiles?: number | null;
  clase?: string | null;
  etiqueta?: string | null;
  motivo?: string | null;
  marca?: string | null;
}

export interface RespuestaEquipo {
  zona?: string;
  hoy?: string;
  jefe: { nombre: string; area: string | null; sede: string | null } | null;
  personas: PersonaEquipo[];
  pendientes: PendienteEquipo[];
  kpis: {
    por_aprobar: number;
    por_aprobar_ausencias: number;
    por_aprobar_novedades: number;
    faltan_hoy: number;
    tarde_hoy: number;
    ausentes_semana: number;
  } | null;
}

export interface PersonaDetalle {
  id: string;
  nombre: string;
  cargo: string | null;
  area: string | null;
  directo: boolean | null;
  reporta_a: string | null;
  hoy: string;
  estado_hoy:
    | { tipo: 'ausente'; clase: string | null; etiqueta: string | null; regresa: string }
    | { tipo: 'sin_turno' | 'descanso' | 'en_turno' | 'programado'; inicio: string | null; fin: string | null };
  turnos_semana: Array<{ fecha: string; plantilla: string | null; inicio: string | null; fin: string | null; dia_descanso: boolean }>;
  vacaciones_disponibles: number | null;
  minutos_periodo: number;
  minutos_planeados_periodo: number;
  novedades_por_aprobar: number;
}

/** Directas e indirectas, para el subtítulo («9 personas (6 directas y 3 indirectas)»). */
export function conteoEquipo(personas: PersonaEquipo[]): { total: number; directas: number; indirectas: number } {
  const directas = personas.filter((p) => p.directo === true).length;
  return { total: personas.length, directas, indirectas: personas.length - directas };
}

/** Una ausencia de salud nunca dice qué es: el jefe ve «ausencia justificada». */
export function esAusenciaDeSalud(a: Pick<AusenciaSemana, 'clase' | 'etiqueta'> | Pick<PendienteEquipo, 'clase' | 'etiqueta'>): boolean {
  return a.clase === 'incapacidad' && !a.etiqueta;
}

export interface CruceArea {
  area: string;
  ausentes: number;
  total: number;
}

/**
 * Días en que dos o más personas de una misma área están ausentes a la vez
 * (Figma 20.15.2: «Cruce · 2 de Cocina»). Cuenta ausencias aprobadas y
 * solicitadas: el jefe quiere ver el cruce antes de aprobar.
 */
export function crucesPorDia(dias: string[], ausencias: AusenciaSemana[], personas: PersonaEquipo[]): Map<string, CruceArea[]> {
  const total = new Map<string, number>();
  const area = new Map<string, string>();
  for (const p of personas) {
    if (!p.area_id || !p.area) continue;
    total.set(p.area_id, (total.get(p.area_id) ?? 0) + 1);
    area.set(p.id, p.area_id);
  }
  const nombre = new Map(personas.filter((p) => p.area_id).map((p) => [p.area_id as string, p.area as string]));
  const out = new Map<string, CruceArea[]>();
  for (const d of dias) {
    const porArea = new Map<string, Set<string>>();
    for (const a of ausencias) {
      if (a.desde > d || a.hasta < d) continue;
      const ar = area.get(a.employment_id);
      if (!ar) continue;
      porArea.set(ar, (porArea.get(ar) ?? new Set()).add(a.employment_id));
    }
    const cruces = Array.from(porArea)
      .filter(([, s]) => s.size >= 2)
      .map(([ar, s]) => ({ area: nombre.get(ar) ?? '', ausentes: s.size, total: total.get(ar) ?? s.size }));
    if (cruces.length) out.set(d, cruces);
  }
  return out;
}

/** Tramos seguidos de días con cruce en la misma área (para el aviso «del 21 al 24 de dic.»). */
export function tramosDeCruce(cruces: Map<string, CruceArea[]>, dias: string[]): Array<{ area: string; desde: string; hasta: string; quedan: number; total: number }> {
  const tramos: Array<{ area: string; desde: string; hasta: string; quedan: number; total: number }> = [];
  for (const d of dias) {
    for (const c of cruces.get(d) ?? []) {
      const ultimo = [...tramos].reverse().find((t) => t.area === c.area);
      const anterior = dias[dias.indexOf(d) - 1];
      if (ultimo && ultimo.hasta === anterior) {
        ultimo.hasta = d;
        ultimo.quedan = Math.min(ultimo.quedan, c.total - c.ausentes);
      } else {
        tramos.push({ area: c.area, desde: d, hasta: d, quedan: c.total - c.ausentes, total: c.total });
      }
    }
  }
  return tramos;
}

/** Días calendario entre dos `date` (b − a). */
export function diasEntre(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** «A. Morales» para las píldoras del calendario. */
export function nombreCorto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  if (partes.length < 2) return nombre;
  const apellido = partes.length >= 4 ? partes[2] : partes[partes.length - 1];
  return `${partes[0].charAt(0)}. ${apellido}`;
}
