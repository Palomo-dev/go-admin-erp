/**
 * Radix Select usa el string vacío para «limpiar» y, si `value=""`,
 * `onValueChange("")` se dispara en cada render. Eso es el bucle de
 * `setState` que en producción aparece como Minified React error #185.
 * Sin valor elegido el select va uncontrolled (`undefined`), nunca `""`.
 */
export function valorSelect(valor: string | null | undefined): string | undefined {
  if (valor == null || valor === '') return undefined;
  return valor;
}
