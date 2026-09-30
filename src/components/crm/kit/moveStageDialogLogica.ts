/**
 * Lógica de `MoveStageDialog` (Figma 761:24498). Sin React.
 *
 * Resultado: `confirmar` (etapa y próximo contacto) · `gate` (faltan
 * requisitos de salida de la etapa, `stages.exit_criteria`) · `sinPermiso`.
 * El permiso lo resuelve el servidor (`crm.stages.override_gate`,
 * `crm.opportunities.close`): aquí llega como booleano, nunca por nombre de
 * rol. Una etapa ganada o perdida no se mueve aquí: abre `WinDialog` o
 * `LoseDialog`.
 */
export type ResultadoMover = 'confirmar' | 'gate' | 'sinPermiso';

export interface EtapaDestino {
  id: string;
  name: string;
  probability: number | null;
  position: number;
  is_won?: boolean | null;
  is_lost?: boolean | null;
}

export interface RequisitoPendiente {
  id: string;
  etiqueta: string;
}

export function resultadoMover(opciones: { puedeMover: boolean; pendientes: readonly RequisitoPendiente[] }): ResultadoMover {
  if (!opciones.puedeMover) return 'sinPermiso';
  return opciones.pendientes.length > 0 ? 'gate' : 'confirmar';
}

/** Adónde lleva soltar/elegir la etapa: el diálogo propio del desenlace o este. */
export function dialogoParaEtapa(etapa: Pick<EtapaDestino, 'is_won' | 'is_lost'> | null | undefined): 'ganar' | 'perder' | 'mover' {
  if (etapa?.is_won) return 'ganar';
  if (etapa?.is_lost) return 'perder';
  return 'mover';
}

/** Destinos del selector: las etapas del embudo menos la actual, por `position`. */
export function destinosPosibles(etapas: readonly EtapaDestino[], actualId: string): EtapaDestino[] {
  return etapas.filter((e) => e.id !== actualId).sort((a, b) => a.position - b.position);
}

/** «Pedir a Ana Gómez»: la primera persona que puede hacerlo (la pantalla ya filtró por permiso). */
export function aQuienPedir(quienesPueden: readonly string[]): string | null {
  return quienesPueden.find((n) => n.trim())?.trim() ?? null;
}
