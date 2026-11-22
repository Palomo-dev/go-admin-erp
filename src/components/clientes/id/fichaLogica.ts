/**
 * Reglas puras de la ficha del cliente (Figma 06 Clientes, «Detalle de
 * cliente» 319:2837). Sin React ni Supabase: se prueban solas.
 */
import type { TonoBadge, AparienciaBadge } from '@/components/kit';
import { toPlainDate } from '@/lib/utils/dateDisplay';

/** Estado que se muestra junto al nombre y en la tarjeta de identidad. */
export type EstadoFicha = 'cliente' | 'lead' | 'prospecto' | 'inactivo';

/**
 * `status = inactive` manda; si no, la etapa del ciclo de vida
 * (`customers.lifecycle_stage`: hoy `lead` o `customer`). Una etapa
 * desconocida se muestra como «Cliente», que es lo que era antes del CRM.
 */
export function estadoFicha(c: { status?: string | null; lifecycle_stage?: string | null }): EstadoFicha {
  if (c.status === 'inactive') return 'inactivo';
  if (c.lifecycle_stage === 'lead') return 'lead';
  if (c.lifecycle_stage === 'prospect') return 'prospecto';
  return 'cliente';
}

export const TONO_ESTADO_FICHA: Record<EstadoFicha, { tono: TonoBadge; apariencia: AparienciaBadge }> = {
  cliente: { tono: 'exito', apariencia: 'suave' },
  lead: { tono: 'informacion', apariencia: 'suave' },
  prospecto: { tono: 'informacion', apariencia: 'suave' },
  inactivo: { tono: 'neutro', apariencia: 'suave' },
};

/** Nivel de fidelidad: sale de las etiquetas (`oro`, `plata`, `bronce`); sin ninguna, «Básico». */
export type NivelFidelidad = 'oro' | 'plata' | 'bronce' | 'basico';
const NIVELES: readonly NivelFidelidad[] = ['oro', 'plata', 'bronce'];

export function nivelFidelidad(tags: readonly string[] | null | undefined): NivelFidelidad {
  const normal = (tags ?? []).map((t) => t.trim().toLowerCase());
  return NIVELES.find((n) => normal.includes(n)) ?? 'basico';
}

export const TONO_NIVEL: Record<NivelFidelidad, { tono: TonoBadge; apariencia: AparienciaBadge }> = {
  oro: { tono: 'advertencia', apariencia: 'contorno' },
  plata: { tono: 'neutro', apariencia: 'contorno' },
  bronce: { tono: 'peligro', apariencia: 'contorno' },
  basico: { tono: 'neutro', apariencia: 'suave' },
};

/** Etiquetas visibles («corporativo», «crédito 30»): sin las de nivel, que ya tienen su badge. */
export function etiquetasVisibles(tags: readonly string[] | null | undefined): string[] {
  return (tags ?? []).map((t) => t.trim()).filter((t) => t && !NIVELES.includes(t.toLowerCase() as NivelFidelidad));
}

/** Tono del puntaje de salud (0–100): las mismas bandas verde/amarillo/rojo del CRM. */
export function tonoSalud(puntaje: number): TonoBadge {
  if (puntaje >= 70) return 'exito';
  if (puntaje >= 40) return 'advertencia';
  return 'peligro';
}

/**
 * Vencimiento de una tarea en días calendario respecto a hoy (zona de la
 * organización): negativo = vencida, 0 = hoy, 1 = mañana. `null` sin fecha.
 */
export function diasParaVencer(vence: string | null | undefined, zona: string, ahora: Date = new Date()): number | null {
  if (!vence) return null;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(vence) ? vence : toPlainDate(new Date(vence), zona);
  if (!dia) return null;
  const hoy = toPlainDate(ahora, zona);
  const a = Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1, Number(hoy.slice(8, 10)));
  const b = Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}
