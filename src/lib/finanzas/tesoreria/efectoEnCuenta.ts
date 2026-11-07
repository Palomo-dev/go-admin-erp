/**
 * «Efecto en la cuenta» (Tesorería v2, `EfectoEnCuenta` `997:32857`): saldo
 * ahora → este movimiento → saldo después.
 *
 * Decisión del dueño (2026-09-28, pregunta 3): si el egreso supera el
 * disponible, **se bloquea en bancos y se avisa en caja** (el esperado de la
 * caja puede ir atrasado por ventas sin sincronizar). La base sigue siendo la
 * autoridad: `fn_transferencia_registrar` rechaza `saldo_insuficiente`.
 */

export type SentidoEfecto = 'entrada' | 'salida';
export type CuentaEfecto = 'caja' | 'banco';

export interface EfectoEnCuenta {
  /** `null`: saldo desconocido u oculto por cierre ciego. */
  antes: number | null;
  movimiento: number;
  despues: number | null;
  supera: boolean;
  /** Supera en un banco: no se deja guardar. */
  bloquea: boolean;
  /** Supera en una caja: se avisa y se deja guardar. */
  avisa: boolean;
}

export function efectoEnCuenta(params: {
  saldo: number | null;
  importe: number | null;
  sentido: SentidoEfecto;
  cuenta: CuentaEfecto;
}): EfectoEnCuenta {
  const importe = params.importe && Number.isFinite(params.importe) && params.importe > 0 ? params.importe : 0;
  const firmado = params.sentido === 'entrada' ? importe : -importe;
  if (params.saldo === null || !Number.isFinite(params.saldo)) {
    return { antes: null, movimiento: firmado, despues: null, supera: false, bloquea: false, avisa: false };
  }
  const despues = Math.round((params.saldo + firmado) * 100) / 100;
  const supera = params.sentido === 'salida' && importe > 0 && despues < 0;
  return {
    antes: params.saldo,
    movimiento: firmado,
    despues,
    supera,
    bloquea: supera && params.cuenta === 'banco',
    avisa: supera && params.cuenta === 'caja',
  };
}
