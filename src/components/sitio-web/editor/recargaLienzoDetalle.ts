/**
 * ¿Hay que recargar el lienzo de una plantilla de detalle tras guardar el borrador?
 *
 * La ficha de producto y la página de categoría se pintan en el lienzo con el borrador
 * (`/vista-previa/<token>/productos/<id>`, `/categorias/<slug>`). La tienda las sirve con el
 * puente en vivo (`FichaEnVivo`, `CategoriaEnVivo` en goadmin-websites): los cambios de sus
 * secciones llegan por `goadmin:preview`, igual que en las demás páginas, sin recargar.
 *
 * Solo recarga lo que el servidor de la tienda calcula a partir de una sección y no puede
 * pintarse en vivo:
 * - Ficha: «Completa el look» (`complete_the_look`): sus productos salen de la fuente, los
 *   productos elegidos y el límite de su contenido. Añadirla, quitarla o cambiarla recarga.
 * - Categoría: nada (el árbol de categorías de la columna lateral ya llega siempre al lienzo).
 *
 * Otra plantilla de detalle (sin esta tabla): recarga, como antes.
 *
 * Si la tienda aún no trae el puente en esa página (despliegue viejo), el lienzo lo nota (no
 * llega `goadmin:ready`) y recarga tras cada guardado como antes: ver `LienzoEditor`
 * (`recargaSinPuente`).
 */
import type { PaginaSitio } from '@/lib/website/contrato/documentoSitio';

/** Tipos de sección cuyos datos calcula el servidor de la tienda, por plantilla de detalle. */
export const SECCIONES_CON_DATOS_DEL_SERVIDOR: Readonly<Record<string, readonly string[]>> = {
  product_detail: ['complete_the_look'],
  category_detail: [],
};

type SeccionLigera = Pick<PaginaSitio['secciones'][number], 'id' | 'tipo' | 'variante' | 'contenido' | 'visibilidad'>;

function firma(secciones: readonly SeccionLigera[] | undefined, tipos: readonly string[]): string {
  if (tipos.length === 0) return '';
  return JSON.stringify(
    (secciones ?? [])
      .filter((s) => tipos.includes(s.tipo))
      .map((s) => [s.id, s.tipo, s.variante ?? null, s.contenido ?? null, s.visibilidad ?? null]),
  );
}

/**
 * `true` si entre lo guardado antes (`antes`) y lo que se acaba de guardar (`despues`) cambió una
 * sección que la tienda no puede pintar en vivo en esa plantilla (ver la tabla).
 */
export function cambioPideRecargaLienzo(
  tipoPagina: string,
  antes: { secciones: readonly SeccionLigera[] } | null | undefined,
  despues: { secciones: readonly SeccionLigera[] } | null | undefined,
): boolean {
  const tipos = SECCIONES_CON_DATOS_DEL_SERVIDOR[tipoPagina];
  if (!tipos) return true;
  return firma(antes?.secciones, tipos) !== firma(despues?.secciones, tipos);
}
