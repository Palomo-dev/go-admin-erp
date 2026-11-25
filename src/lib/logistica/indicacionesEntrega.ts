/**
 * Indicaciones de entrega limpias (`shipments.delivery_instructions`). Puro.
 *
 * Hasta el 2026-11-25 el envío de un pedido web anexaba «País: COL (05)» a las indicaciones del
 * cliente (`deliveryIntegrationService.createWebOrderShipment`); el país ya vive en
 * `metadata.delivery_country`, así que desde esa fecha no se anexa. Los envíos viejos lo siguen
 * trayendo (casi todos: «País: COL (xx)» solo, o «Timbre 2 | País: COL (05)»), y algunas notas del
 * checkout traen además los datos de la factura electrónica («[Factura electrónica] Cédula … ·
 * correo»), que no deben viajar pegados en una caja. Aquí se quitan los dos ruidos para el rótulo
 * y para el envío nuevo; lo que escribió el cliente se conserva tal cual.
 */

/** «País: COL», «País: CO (ANT)», «Pais: COL (05)»: el segmento entero, nada más. */
const PAIS = /^pa[ií]s\s*:\s*[a-z]{2,3}(\s*\([^)]*\))?\.?$/i;
/** Datos de la factura electrónica que el checkout dejó en las notas: desde la marca hasta el fin del segmento. */
const FACTURA = /\[factura electr[oó]nica\]/i;

export function limpiarIndicaciones(texto: string | null | undefined): string | null {
  if (typeof texto !== 'string') return null;
  const partes = texto
    .split('|')
    .map((p) => {
      const i = p.search(FACTURA);
      return (i >= 0 ? p.slice(0, i) : p).replace(/\s+/g, ' ').trim();
    })
    .filter((p) => p !== '' && !PAIS.test(p));
  const limpio = partes.join(' · ').trim();
  return limpio === '' ? null : limpio;
}
