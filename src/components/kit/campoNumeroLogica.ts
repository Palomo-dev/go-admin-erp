/**
 * Convierte lo escrito en un `CampoNumero` en número: coma o punto decimal,
 * vacío → `null`, recorta a los decimales y al rango.
 */
export function textoANumero(
  texto: string,
  opciones: { decimales?: number; minimo?: number; maximo?: number } = {},
): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '' || limpio === '-' || limpio === '.') return null;
  const n = Number(limpio);
  if (!Number.isFinite(n)) return null;
  const decimales = opciones.decimales ?? 2;
  const factor = 10 ** decimales;
  let r = Math.round(n * factor) / factor;
  if (opciones.minimo !== undefined && r < opciones.minimo) r = opciones.minimo;
  if (opciones.maximo !== undefined && r > opciones.maximo) r = opciones.maximo;
  return r;
}
