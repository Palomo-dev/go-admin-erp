/**
 * Cliente (navegador) de la invalidación del catálogo web.
 *
 * Tras guardar productos, precios o stock, la UI llama a esto para que la
 * tienda web descarte su caché de 30 s y muestre el cambio ya. Es
 * fire-and-forget y nunca lanza: si falla, la tienda se refresca sola al
 * vencer el TTL. La organización la resuelve el servidor desde la sesión.
 *
 * Varias llamadas seguidas (p. ej. una acción masiva sobre 200 productos)
 * se agrupan en una sola petición.
 */

let pendiente: ReturnType<typeof setTimeout> | null = null;

export function avisarCambioCatalogo(): void {
  if (typeof window === 'undefined') return;
  if (pendiente) clearTimeout(pendiente);
  pendiente = setTimeout(() => {
    pendiente = null;
    fetch('/api/website/revalidate', { method: 'POST', keepalive: true }).catch(() => {
      // Silencioso a propósito: el TTL de la tienda cubre este caso.
    });
  }, 500);
}
