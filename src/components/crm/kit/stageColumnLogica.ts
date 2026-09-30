/**
 * Lógica de `StageColumn` (Figma 759:22544). Sin React.
 *
 * Total de la columna en la moneda **base** de la organización. Si la columna
 * trae oportunidades en otra moneda que sí tienen tasa, se suman convertidas y
 * se avisa «incl. 1 en USD»; las que no tienen tasa quedan fuera y se avisa
 * aparte (nunca se inventa una tasa).
 */
import { sumarEnMonedaBase, type MontoEnMoneda, type ResumenMonedaBase, type TasaCambio } from './monedaCrm';

/** Columnas de `stages` que pinta la columna. */
export interface EtapaColumna {
  id: string;
  name: string;
  color: string | null;
  probability: number | null;
  is_won?: boolean | null;
  is_lost?: boolean | null;
}

export type EstadoColumna = 'normal' | 'destino' | 'vacia' | 'cargando';

export function estadoColumna(opciones: { cargando?: boolean; destino?: boolean; cantidad: number }): EstadoColumna {
  if (opciones.cargando) return 'cargando';
  if (opciones.destino) return 'destino';
  return opciones.cantidad === 0 ? 'vacia' : 'normal';
}

export interface TotalColumna {
  resumen: ResumenMonedaBase;
  /** Aviso «incl. N en USD» (la moneda con más oportunidades convertidas). */
  incluye: { cantidad: number; moneda: string; otras: number } | null;
  /** Oportunidades que no suman por falta de tasa. */
  sinTasa: number;
}

export function totalColumna(
  items: readonly MontoEnMoneda[],
  base: string,
  tasas: readonly TasaCambio[] = [],
  fecha?: string | null,
): TotalColumna {
  const resumen = sumarEnMonedaBase(items, base, tasas, fecha);
  const convertidas = [...resumen.convertidas].sort((a, b) => b.cantidad - a.cantidad);
  const primera = convertidas[0];
  return {
    resumen,
    incluye: primera
      ? { cantidad: convertidas.reduce((s, g) => s + g.cantidad, 0), moneda: primera.moneda, otras: convertidas.length - 1 }
      : null,
    sinTasa: resumen.sinTasa.reduce((s, g) => s + g.cantidad, 0),
  };
}

/** Color de la etapa: `stages.color` si es un hex válido; si no, el de marca. */
export function colorEtapa(color: string | null | undefined): string | null {
  return color && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color.trim()) ? color.trim() : null;
}

/** Probabilidad acotada a 0–100 (CHECK `stages_probability_range`). */
export function probabilidadEtapa(p: number | null | undefined): number | null {
  if (typeof p !== 'number' || !Number.isFinite(p)) return null;
  return Math.min(100, Math.max(0, Math.round(p)));
}
