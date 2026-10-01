/**
 * Qué hace el tablero cuando llega `crm:entity-changed`.
 *
 * Mover, ganar o perder ya dejó la tarjeta en la columna (optimista o al
 * confirmar). Recargar el tablero entero enciende el loader y vacía las
 * columnas. Esas acciones solo refrescan los totales, en silencio.
 */
const ACCIONES_SILENCIOSAS = new Set(['mover', 'ganar', 'perder']);

export function recargaDeTablero(accion: string | undefined): 'silenciosa' | 'completa' {
  return accion && ACCIONES_SILENCIOSAS.has(accion) ? 'silenciosa' : 'completa';
}
