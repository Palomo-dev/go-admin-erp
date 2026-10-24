/** Avisa a los POS abiertos en este navegador que una promoción cambió. */
export const CANAL_PROMOCIONES = 'pos:promociones';

/**
 * Un canal por pestaña. Cerrarlo después de `postMessage` —aunque sea en el
 * turno siguiente— puede descartar el aviso antes de que la otra pestaña lo
 * lea, y el carrito se queda con el descuento viejo.
 */
let canal: BroadcastChannel | null = null;

export function avisarCambioPromociones(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    canal ??= new BroadcastChannel(CANAL_PROMOCIONES);
    canal.postMessage({ tipo: 'cambio', en: Date.now() });
  } catch {
    canal = null;
  }
}
