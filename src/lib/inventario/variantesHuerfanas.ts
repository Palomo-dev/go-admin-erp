/**
 * Variantes de un producto padre eliminado («variantes huérfanas»).
 *
 * Un producto padre se elimina con baja lógica (`products.status = 'deleted'`).
 * Hasta el 2026-09-30 sus variantes (`products.parent_product_id` → padre) se
 * quedaban vivas: la lista de Productos no las mostraba (solo trae padres), pero
 * el stock, el inicio y los reportes las contaban una por una. En la org 137 el
 * inicio decía «226 agotados» y la lista con «Sin stock» daba 0.
 * Ver docs/inventario/VARIANTES-HUERFANAS.md.
 *
 * Desde las migraciones 20260930233000–20260930233200:
 *   - eliminar un padre da de baja sus variantes en la misma operación (disparador
 *     `trg_producto_baja_variantes`), y restaurarlo devuelve las que cayeron con él;
 *   - la base no deja crear ni revivir una variante bajo un padre eliminado;
 *   - las lecturas de inventario, POS y reportes excluyen las que queden.
 *
 * Este módulo es el espejo de esa regla para las lecturas que se hacen desde
 * el navegador con PostgREST, donde no se puede escribir el `not exists` del SQL.
 */

/**
 * Predicado canónico en SQL. Toda función de lectura que cuente o venda
 * productos lo lleva con el alias `pp_elim` (el guardarraíl 39 lo busca).
 * `p` es el alias del producto en la consulta que lo usa.
 */
export const PREDICADO_SQL_PADRE_VIGENTE =
  "not exists (select 1 from public.products pp_elim where pp_elim.id = p.parent_product_id and pp_elim.status = 'deleted')";

/**
 * Fragmento de `select` de PostgREST que trae el estado del padre de un
 * producto (relación `products.parent_product_id`). Se incrusta dentro del
 * `products(...)` de la consulta y se filtra con {@link padreEliminado}.
 */
export const EMBED_ESTADO_PADRE = 'padre:products!parent_product_id(status)';

interface ConPadre {
  padre?: { status?: string | null } | Array<{ status?: string | null }> | null;
}

/** `true` si el producto es una variante cuyo padre está eliminado. */
export function padreEliminado(producto: ConPadre | null | undefined): boolean {
  const crudo = producto?.padre;
  const padre = Array.isArray(crudo) ? crudo[0] : crudo;
  return padre?.status === 'deleted';
}
