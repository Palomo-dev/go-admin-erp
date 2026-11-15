/**
 * Escala salarial de un cargo en una sede (decisión 2: solo la ve quien tiene
 * el permiso de salario; un salario fuera de rango no se bloquea: pide motivo
 * y avisa al aprobador).
 *
 * PENDIENTE (coordinación con el frente «Estructura» de la fase 1): las escalas
 * salariales, las competencias y las plazas de cargo las crea el otro agente.
 * Mientras su tabla no exista, esta función devuelve `null` y la ficha, el alta
 * y «Registrar un cambio» no muestran la posición en la escala ni el aviso de
 * fuera de rango. Cuando exista, se lee aquí (servidor, con el permiso
 * `hr.data.salario_pago.view`) y nada más cambia en las pantallas.
 */
import type { ContextoPersonas } from './personasService.server';

export interface EscalaSalarial {
  minimo: number;
  medio: number;
  maximo: number;
  cargo: string | null;
  sede: string | null;
}

export interface ConsultaEscala {
  ctx: ContextoPersonas;
  cargoId: string | null;
  sedeId: number | null;
}

export async function escalaVigente(consulta: ConsultaEscala): Promise<EscalaSalarial | null> {
  void consulta;
  return null;
}

/** Plaza libre del cargo en la sede (presupuesto de plazas). Mismo pendiente: `null`. */
export async function plazaDisponible(consulta: ConsultaEscala): Promise<{ ocupadas: number; aprobadas: number } | null> {
  void consulta;
  return null;
}
