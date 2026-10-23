/**
 * Ids marcados en un campo de entidad.
 * Un enlace de un solo destino (el banner a una categoría) guarda el id suelto, no un arreglo.
 */
export function idsDeValor(value: unknown, multiple: boolean): number[] {
  const lista = multiple
    ? (Array.isArray(value) ? value : [])
    : value === null || value === undefined || value === ''
      ? []
      : [value];
  const ids: number[] = [];
  for (const item of lista) {
    const n = typeof item === 'number' ? item : typeof item === 'string' && item.trim() ? Number(item) : NaN;
    if (Number.isInteger(n)) ids.push(n);
  }
  return ids;
}
