import { MARCA_COMER_AQUI } from '@/lib/pos/pedidosWeb/tipoEntrega';

/**
 * Notas internas que ve el equipo: sin la marca «[Comer aquí] Mesa: …» que el
 * sitio web deja en `internal_notes` (contrato `MARCA_COMER_AQUI`). La mesa ya
 * se muestra en el chip y en la tarjeta de entrega; repetida como nota solo
 * confunde. `mesaDelPedido` sigue leyendo la marca del valor original.
 */
export function notasInternasVisibles(notas: string | null | undefined): string {
  return (notas ?? '')
    .split('\n')
    .filter((linea) => !linea.trim().startsWith(MARCA_COMER_AQUI))
    .join('\n')
    .trim();
}

/**
 * Nuevo valor de `internal_notes` al editar la nota del equipo: conserva las
 * líneas de la marca del sitio (contrato con goadmin-websites) y reemplaza el
 * resto por el texto escrito.
 */
export function notasInternasConMarca(original: string | null | undefined, texto: string): string | null {
  const marcas = (original ?? '').split('\n').filter((linea) => linea.trim().startsWith(MARCA_COMER_AQUI));
  const limpio = texto.trim();
  const todo = [...marcas, ...(limpio ? [limpio] : [])].join('\n');
  return todo || null;
}
