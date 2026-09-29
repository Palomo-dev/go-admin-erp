/**
 * Venta por peso en un paso (pedido del dueño 2026-09-29, §11 de
 * docs/design/PRODUCTOS-POR-PESO-BASCULA.md): «al marcar con código de
 * barras, que el producto aparezca de una en el carrito». Decisiones puras;
 * los hooks del POS solo las ejecutan.
 *
 * 1. `decidirPesada`: al escanear o tocar un producto por peso.
 *    - Sin báscula en el equipo (o producto por medida): el flujo de siempre
 *      («Pesar» con el peso a mano, Enter).
 *    - Con báscula y la regla `agregar_al_estabilizar` apagada: «Pesar» y Enter.
 *    - Con báscula y la regla encendida (por defecto): si la lectura YA es
 *      estable, válida (neto > 0, ≥ mínimo, ≤ capacidad, con tara si la exige)
 *      y NUEVA (ver 3), se agrega directo; si no, se abre «Pesar» esperando y
 *      se agrega solo en cuanto se estabilice (`debeAutoAgregar`).
 * 2. `decidirEscaneoConPesarAbierto`: otro escaneo con «Pesar» esperando.
 *    Nunca se confirma la pesada pendiente de forma implícita (el peso que hay
 *    en la báscula puede ser ya del producto nuevo): se cancela y se sigue con
 *    el nuevo. Repetir el MISMO producto (doble lectura del código) se ignora.
 * 3. Lectura nueva (`ArmadoBascula`): después de agregar una pesada, la
 *    siguiente automática exige que la báscula haya cambiado más de una
 *    división (se retiró el producto o se puso otro). Sin esto, escanear el
 *    jamón con el queso aún encima agregaba el jamón con el peso del queso.
 *    Enter a mano (confirmación explícita) no lo exige.
 */

import type { VistaLectura } from './pesada';

export type DecisionPesada =
  /** Se agrega ya con la lectura actual (origen «bascula»). */
  | { tipo: 'agregar_directo' }
  /** «Pesar» abierto: se agrega solo en cuanto la lectura sea estable y nueva. */
  | { tipo: 'abrir_esperando' }
  /** «Pesar» abierto: el cajero confirma con Enter (regla apagada). */
  | { tipo: 'abrir_confirmar' }
  /** «Pesar» como antes de la báscula: peso a mano o cantidad por medida. */
  | { tipo: 'abrir_manual' };

export function decidirPesada(p: {
  porPeso: boolean;
  hayBascula: boolean;
  agregarAlEstabilizar: boolean;
  vista: Pick<VistaLectura, 'puedeAgregar'> | null;
  armada: boolean;
}): DecisionPesada {
  if (!p.porPeso || !p.hayBascula) return { tipo: 'abrir_manual' };
  if (!p.agregarAlEstabilizar) return { tipo: 'abrir_confirmar' };
  if (p.vista?.puedeAgregar && p.armada) return { tipo: 'agregar_directo' };
  return { tipo: 'abrir_esperando' };
}

/** ¿El diálogo que espera debe agregar ya? (una sola vez por apertura). */
export function debeAutoAgregar(p: {
  esperando: boolean;
  vista: Pick<VistaLectura, 'puedeAgregar'>;
  armada: boolean;
  yaEnviado: boolean;
}): boolean {
  return p.esperando && !p.yaEnviado && p.armada && p.vista.puedeAgregar;
}

export type DecisionEscaneoAbierto = 'ignorar' | 'cancelar_y_seguir';

export function decidirEscaneoConPesarAbierto(p: {
  productoAbiertoId: number | string;
  productoNuevoId: number | string;
  modo: 'agregar' | 'cambiar';
}): DecisionEscaneoAbierto {
  if (p.modo === 'agregar' && String(p.productoAbiertoId) === String(p.productoNuevoId)) return 'ignorar';
  return 'cancelar_y_seguir';
}

// ── Lectura nueva ──────────────────────────────────────────────────────────

export interface ArmadoBascula {
  /** true: la próxima pesada automática puede salir. */
  armada: boolean;
  /** Peso de la trama (unidad de la báscula) de la última pesada agregada. */
  pesoAgregado: number | null;
}

export function armadoInicial(): ArmadoBascula {
  return { armada: true, pesoAgregado: null };
}

/** Tras agregar una pesada con `peso` en la báscula: desarmada hasta que cambie. */
export function armadoTrasAgregar(peso: number | null): ArmadoBascula {
  return peso === null ? armadoInicial() : { armada: false, pesoAgregado: peso };
}

/** Observa cada lectura; se rearma cuando el peso se aleja más de una división. Devuelve el mismo objeto si no cambia. */
export function observarLectura(a: ArmadoBascula, peso: number | null, division: number): ArmadoBascula {
  if (a.armada || peso === null || !Number.isFinite(peso)) return a;
  if (a.pesoAgregado === null || Math.abs(peso - a.pesoAgregado) > Math.max(0, division) + 1e-9) {
    return { armada: true, pesoAgregado: a.pesoAgregado };
  }
  return a;
}
