/**
 * Alcance de los métodos de pago (20261028180000 / 20261028181000).
 *
 * - `organization_payment_methods.branch_ids`: sucursales donde se cobra con el
 *   método. `null`/ausente = todas (igual que `promotions.branches`).
 * - `promotions.payment_method_codes`: métodos con los que aplica la promoción.
 *   `null`/ausente/vacío = cualquiera.
 * - `payment_methods.organization_id`: dueña de un método personalizado.
 *   `null`/ausente = del sistema / catálogo común.
 *
 * Retrocompatible: mientras la migración no esté aplicada las columnas no
 * existen; `seleccionarConColumnaOpcional` reintenta sin ellas y todo se
 * comporta como antes (todas las sucursales, cualquier método).
 */

export type ListaSucursales = number[] | null | undefined;

/** Normaliza lo que llega de la BD (array, null, texto JSON). Vacío = todas. */
export function normalizarSucursales(valor: unknown): number[] | null {
  if (valor == null) return null;
  let lista: unknown = valor;
  if (typeof valor === 'string') {
    try { lista = JSON.parse(valor.replace(/^\{(.*)\}$/, '[$1]')); } catch { return null; }
  }
  if (!Array.isArray(lista)) return null;
  const ids = lista.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  return ids.length > 0 ? Array.from(new Set(ids)) : null;
}

/** `branch_ids IS NULL OR sucursal = ANY(branch_ids)`. Sin sucursal actual: no se filtra. */
export function metodoPermitidoEnSucursal(branchIds: unknown, sucursalId: number | null | undefined): boolean {
  const lista = normalizarSucursales(branchIds);
  if (!lista) return true;
  if (sucursalId == null || !Number.isFinite(Number(sucursalId))) return true;
  return lista.includes(Number(sucursalId));
}

export function filtrarMetodosPorSucursal<T extends { branch_ids?: unknown }>(
  filas: T[],
  sucursalId: number | null | undefined,
): T[] {
  return filas.filter((f) => metodoPermitidoEnSucursal(f.branch_ids, sucursalId));
}

/** Códigos de método normalizados; vacío = cualquiera (`null`). */
export function normalizarCodigosMetodo(valor: unknown): string[] | null {
  if (valor == null) return null;
  let lista: unknown = valor;
  if (typeof valor === 'string') {
    try { lista = JSON.parse(valor.replace(/^\{(.*)\}$/, '[$1]')); } catch { return null; }
  }
  if (!Array.isArray(lista)) return null;
  const codigos = lista.map((v) => String(v ?? '').trim()).filter(Boolean);
  return codigos.length > 0 ? Array.from(new Set(codigos)) : null;
}

/**
 * ¿Aplica la promoción con estos métodos de cobro? Basta con que uno de los
 * métodos (con monto) esté en la lista. Sin método elegido todavía, una promoción
 * restringida no aplica (se recalcula cuando el cajero elige el método).
 */
export function promocionAplicaConMetodos(
  paymentMethodCodes: unknown,
  metodos: ReadonlyArray<string | null | undefined> | string | null | undefined,
): boolean {
  const permitidos = normalizarCodigosMetodo(paymentMethodCodes);
  if (!permitidos) return true;
  const elegidos = (Array.isArray(metodos) ? metodos : [metodos]).filter((m): m is string => !!m);
  return elegidos.some((m) => permitidos.includes(m));
}

/** Códigos de los pagos con monto, sin repetir, en orden. */
export function metodosConMonto(pagos: ReadonlyArray<{ method?: string | null; amount?: number | string | null }> | null | undefined): string[] {
  const vistos: string[] = [];
  for (const p of pagos ?? []) {
    const m = (p?.method ?? '').trim();
    if (m && Number(p?.amount ?? 0) > 0 && !vistos.includes(m)) vistos.push(m);
  }
  return vistos;
}

/**
 * Catálogo global visible para la organización: los del sistema, los suyos
 * (`organization_id`), y los comunes sin dueña que ya tiene activados.
 * Un método personalizado de otra organización nunca se muestra.
 */
export function metodoCatalogoVisible(
  metodo: { code: string; is_system?: boolean | null; organization_id?: number | null },
  organizationId: number | null | undefined,
  codigosDeLaOrganizacion: ReadonlySet<string> | ReadonlyArray<string>,
): boolean {
  const codigos = codigosDeLaOrganizacion instanceof Set ? codigosDeLaOrganizacion : new Set(codigosDeLaOrganizacion as ReadonlyArray<string>);
  if (metodo.organization_id != null) return organizationId != null && Number(metodo.organization_id) === Number(organizationId);
  if (metodo.is_system) return true;
  return codigos.has(metodo.code);
}

/** ¿El error es «esa columna no existe» (migración sin aplicar)? */
export function esColumnaAusente(error: unknown, columna: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string; details?: string; hint?: string };
  const texto = `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}`;
  return (e.code === '42703' || e.code === 'PGRST204' || e.code === 'PGRST200' || /does not exist|could not find/i.test(texto))
    && texto.includes(columna);
}

const columnasAusentes = new Set<string>();

/** Solo pruebas. */
export function reiniciarColumnasAusentes(): void { columnasAusentes.clear(); }

/**
 * Ejecuta la consulta con la columna opcional y, si la BD responde que no
 * existe, la repite sin ella (y lo recuerda para no insistir en la sesión).
 */
export async function seleccionarConColumnaOpcional<R extends { data: unknown; error: unknown }>(
  clave: string,
  columna: string,
  ejecutar: (extra: string) => PromiseLike<R>,
): Promise<R> {
  const k = `${clave}.${columna}`;
  if (columnasAusentes.has(k)) return await ejecutar('');
  const r = await ejecutar(`, ${columna}`);
  if (r.error && esColumnaAusente(r.error, columna)) {
    columnasAusentes.add(k);
    return await ejecutar('');
  }
  return r;
}

/**
 * Métodos que se pueden elegir en una promoción: los activos de la organización
 * y, si la promoción tiene sucursales, los habilitados en al menos una de ellas.
 */
export function metodosPagoParaPromocion<M extends { code: string; branch_ids?: unknown }>(
  metodos: readonly M[],
  sucursalesPromocion: unknown,
): M[] {
  const suc = normalizarSucursales(sucursalesPromocion);
  if (!suc) return [...metodos];
  return metodos.filter((m) => {
    const permitidas = normalizarSucursales(m.branch_ids);
    return !permitidas || permitidas.some((id) => suc.includes(id));
  });
}
