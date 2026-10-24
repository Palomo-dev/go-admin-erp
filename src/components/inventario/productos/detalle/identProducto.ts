/**
 * El segmento de `/app/inventario/productos/[id]` es el id numérico o el uuid.
 * Cualquier otra cosa no se consulta: Postgres rechaza un número en la columna
 * uuid y la ficha lo mostraba como error genérico.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ClaveProducto = { campo: 'id'; valor: number } | { campo: 'uuid'; valor: string };

export function claveProducto(ident: string): ClaveProducto | null {
  if (/^\d+$/.test(ident)) {
    const valor = Number(ident);
    if (!Number.isSafeInteger(valor)) return null;
    return { campo: 'id', valor };
  }
  if (UUID.test(ident)) return { campo: 'uuid', valor: ident };
  return null;
}
