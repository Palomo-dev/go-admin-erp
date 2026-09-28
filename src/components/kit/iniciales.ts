/** Dos iniciales de un nombre («María Fernanda Ríos» → «MF»); «?» si no hay nombre. */
export function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primera = partes[0].charAt(0);
  const segunda = partes.length > 1 ? partes[1].charAt(0) : '';
  return (primera + segunda).toUpperCase();
}
