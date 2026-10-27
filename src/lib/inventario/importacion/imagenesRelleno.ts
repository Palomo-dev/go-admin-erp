/**
 * Imágenes de relleno ("sin imagen") que las tiendas sirven cuando el producto
 * no tiene foto. No deben importarse como foto del producto.
 *
 * Ejemplos: `/NoImage/…`, `no-image.png`, `sin_imagen.jpg`,
 * PrestaShop `/img/p/es-default-large_default.jpg` o `espanol_default`,
 * WooCommerce `woocommerce-placeholder.png`, Shopify `no-image-2048…`.
 *
 * El mismo patrón está copiado en supabase/functions/product-scraper/index.ts
 * (IMAGE_BLOCKLIST): si se cambia aquí, cambiarlo allá.
 */
export const PATRON_IMAGEN_RELLENO =
  /(\/noimage\/|no[-_]?image|noimage|sin[-_]?imagen|sin[-_]?foto|placeholder|espanol_default|\/img\/p\/[a-z]{2}-default-|\/[a-z]{2}-default-[a-z_]*default\.)/i;

export function esImagenRelleno(url: string | null | undefined): boolean {
  if (!url) return true;
  let ruta = url;
  try {
    ruta = decodeURIComponent(url);
  } catch {
    /* URL con % sueltos: se evalúa tal cual */
  }
  return PATRON_IMAGEN_RELLENO.test(ruta);
}

/** Quita las imágenes de relleno y las vacías, conservando el orden. */
export function sinImagenesRelleno(urls: (string | null | undefined)[] | null | undefined): string[] {
  return (urls ?? []).filter((u): u is string => !!u && !esImagenRelleno(u));
}
