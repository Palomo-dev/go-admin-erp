/** Avisa a los POS abiertos en este navegador que una promoción cambió. */
export const CANAL_PROMOCIONES = 'pos:promociones';

export function avisarCambioPromociones(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const canal = new BroadcastChannel(CANAL_PROMOCIONES);
    canal.postMessage({ tipo: 'cambio', en: Date.now() });
    canal.close();
  } catch {
    /* sin canal: el POS igual recalcula al volver a enfocarse */
  }
}
