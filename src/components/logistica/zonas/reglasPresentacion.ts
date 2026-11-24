/**
 * Reglas de despacho: qué condiciones tiene una regla y en qué orden las evalúa la base. Puro.
 *
 * La decisión NO se toma aquí: `logistica_cotizar_envio` elige la regla (las de la sede primero,
 * luego la prioridad y la fecha de creación) y devuelve `regla_id`. Esto solo ordena la lista
 * igual que la base y arma el recorrido que muestra «Probar con un pedido» (2795:2020).
 */
import type { ReglaDespacho } from '@/lib/logistica/zonas';

export const CAMPOS_CONDICION = ['zona', 'canal', 'metodo_pago', 'valor', 'peso', 'dias', 'horario'] as const;
export type CampoCondicion = (typeof CAMPOS_CONDICION)[number];

type ReglaParcial = Partial<Pick<ReglaDespacho,
  'zone_ids' | 'channels' | 'payment_methods' | 'min_order_value' | 'max_order_value' |
  'min_weight_kg' | 'max_weight_kg' | 'weekdays' | 'time_from' | 'time_to'>>;

const lleno = (a: readonly unknown[] | null | undefined) => Array.isArray(a) && a.length > 0;

/** Campos con condición en una regla, en el orden del editor. */
export function camposConCondicion(r: ReglaParcial): CampoCondicion[] {
  const c: CampoCondicion[] = [];
  if (lleno(r.zone_ids)) c.push('zona');
  if (lleno(r.channels)) c.push('canal');
  if (lleno(r.payment_methods)) c.push('metodo_pago');
  if (r.min_order_value != null || r.max_order_value != null) c.push('valor');
  if (r.min_weight_kg != null || r.max_weight_kg != null) c.push('peso');
  if (lleno(r.weekdays)) c.push('dias');
  if (r.time_from || r.time_to) c.push('horario');
  return c;
}

/** Los campos de la base que se vacían al quitar una condición. */
export function vaciarCondicion(campo: CampoCondicion): ReglaParcial {
  switch (campo) {
    case 'zona':
      return { zone_ids: null };
    case 'canal':
      return { channels: null };
    case 'metodo_pago':
      return { payment_methods: null };
    case 'valor':
      return { min_order_value: null, max_order_value: null };
    case 'peso':
      return { min_weight_kg: null, max_weight_kg: null };
    case 'dias':
      return { weekdays: null };
    case 'horario':
      return { time_from: null, time_to: null };
  }
}

/** Orden de evaluación de la base: primero las de la sede, luego prioridad y antigüedad. */
export function ordenEvaluacion<T extends Pick<ReglaDespacho, 'branch_id' | 'priority' | 'created_at'>>(reglas: readonly T[]): T[] {
  return [...reglas].sort((a, b) => {
    const sa = a.branch_id === null ? 1 : 0;
    const sb = b.branch_id === null ? 1 : 0;
    if (sa !== sb) return sa - sb;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.created_at.localeCompare(b.created_at);
  });
}

export type PasoRecorrido = 'no_aplica' | 'decide' | 'sin_evaluar' | 'en_pausa' | 'otra_sede';

/**
 * Recorrido de «Probar con un pedido»: con la regla que eligió la base, las anteriores no
 * aplicaron, la elegida decide y las siguientes no se evaluaron. Las pausadas y las de otra sede
 * no participan.
 */
export function recorridoReglas<T extends Pick<ReglaDespacho, 'id' | 'branch_id' | 'priority' | 'created_at' | 'is_active'>>(
  reglas: readonly T[],
  reglaElegida: string | null,
  sede: number | null,
): { regla: T; paso: PasoRecorrido }[] {
  let decidida = false;
  return ordenEvaluacion(reglas).map((regla) => {
    if (!regla.is_active) return { regla, paso: 'en_pausa' as const };
    if (regla.branch_id !== null && sede !== null && regla.branch_id !== sede) return { regla, paso: 'otra_sede' as const };
    if (decidida) return { regla, paso: 'sin_evaluar' as const };
    if (regla.id === reglaElegida) {
      decidida = true;
      return { regla, paso: 'decide' as const };
    }
    return { regla, paso: 'no_aplica' as const };
  });
}
