/**
 * Invalidación de la caché del catálogo de la tienda web (goadmin-websites).
 *
 * La tienda cachea productos, precios, imágenes y stock 30 s por organización
 * (lib/supabase/cache.ts → `cacheCatalog`). Sin esa caché, el 2026-09-14 una
 * ráfaga de visitas a la portada de una tienda tumbó Postgres entero. Para que
 * el comerciante vea sus cambios de inmediato y no a los 30 s, el ERP avisa a
 * la tienda con `POST /api/revalidate` cada vez que edita el catálogo.
 *
 * Solo servidor: usa CRON_SECRET, el mismo secreto compartido que la tienda ya
 * usa para llamar al ERP (x-webhook-secret). Nunca importar desde el cliente.
 *
 * Fire-and-forget: si la tienda no responde, el TTL de 30 s hace el trabajo.
 * Nunca debe bloquear ni hacer fallar la operación del ERP.
 *
 * Env: `WEBSITES_BASE_URLS`, lista separada por comas de los orígenes del
 * proyecto (o proyectos) Vercel de la tienda, p. ej.
 * `https://goadmin-websites-8fs1.vercel.app`. Cada proyecto tiene su propia
 * caché de datos, por eso se avisa a todos.
 */

const TIMEOUT_MS = 5_000;

function baseUrls(): string[] {
  return (process.env.WEBSITES_BASE_URLS || '')
    .split(',')
    .map((u) => u.trim().replace(/\/+$/, ''))
    .filter((u) => /^https?:\/\//.test(u));
}

/**
 * Pide a la tienda que descarte el catálogo cacheado de `organizationId`.
 * Resuelve siempre; el resultado solo se registra en consola.
 */
export async function revalidarCatalogoWeb(organizationId: number): Promise<void> {
  const secret = process.env.CRON_SECRET;
  const urls = baseUrls();
  if (!secret || urls.length === 0 || !Number.isInteger(organizationId)) return;

  await Promise.all(
    urls.map(async (base) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${base}/api/revalidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
          body: JSON.stringify({ organization_id: organizationId }),
          signal: controller.signal,
        });
        if (!res.ok) {
          console.warn(`[revalidarCatalogoWeb] ${base} respondió ${res.status} para org ${organizationId}`);
        }
      } catch (err) {
        console.warn(`[revalidarCatalogoWeb] sin respuesta de ${base}:`, err instanceof Error ? err.message : err);
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}
