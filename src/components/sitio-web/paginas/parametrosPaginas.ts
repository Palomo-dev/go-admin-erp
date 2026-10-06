/**
 * Lectura de los parámetros comunes de `/api/sitio-web/paginas/**`. Pura.
 *
 * `sitio`: `principal` (o ausente) = sitio principal; un entero positivo = id de la sucursal.
 * La organización nunca viaja aquí: sale de la sesión.
 */
export function sitioDeParametro(valor: string | null | undefined): number | null | 'invalido' {
  if (valor === null || valor === undefined || valor === '' || valor === 'principal') return null;
  return /^[1-9]\d{0,9}$/.test(valor) ? Number(valor) : 'invalido';
}

/** `sitio` desde el body: `null` = principal, entero positivo = sucursal. */
export function sitioDeCuerpo(valor: unknown): number | null | 'invalido' {
  if (valor === null || valor === undefined || valor === 'principal') return null;
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0 ? valor : 'invalido';
}

/** Versión del borrador desde el body: entero ≥ 1, `null` (aún no hay borrador) o inválida. */
export function versionDeCuerpo(valor: unknown): number | null | 'invalido' {
  if (valor === null || valor === undefined) return null;
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 ? valor : 'invalido';
}

/** id estable de página del contrato (uuid de legacy o id generado). */
export function esIdPagina(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(valor);
}
