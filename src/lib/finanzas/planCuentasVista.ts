/**
 * Árbol del plan. Si la cuenta no tiene padre guardado, cuelga del prefijo
 * más largo que sí exista (un grupo 11 para la 1105). Un ciclo no se enlaza.
 */
export interface CuentaParaArbol {
  account_code: string;
  parent_code: string | null;
}

export interface NodoPlan<T> {
  cuenta: T;
  children: NodoPlan<T>[];
}

export function padreEnPlan(
  codigo: string,
  parentCode: string | null,
  codigos: readonly string[],
): string | null {
  const presentes = new Set(codigos);
  if (parentCode && parentCode !== codigo && presentes.has(parentCode)) return parentCode;
  let mejor: string | null = null;
  for (const otro of codigos) {
    if (otro === codigo || otro.length >= codigo.length) continue;
    if (!codigo.startsWith(otro)) continue;
    if (!mejor || otro.length > mejor.length) mejor = otro;
  }
  return mejor;
}

export function armarArbolPlan<T extends CuentaParaArbol>(
  cuentas: readonly T[],
  coincide: (cuenta: T) => boolean = () => true,
): NodoPlan<T>[] {
  const porCodigo = new Map(cuentas.map((c) => [c.account_code, c]));
  const todos = cuentas.map((c) => c.account_code);
  const incluidos = new Set<string>();
  for (const cuenta of cuentas) {
    if (!coincide(cuenta)) continue;
    incluidos.add(cuenta.account_code);
    const vistos = new Set<string>([cuenta.account_code]);
    let cursor = padreEnPlan(cuenta.account_code, cuenta.parent_code, todos);
    while (cursor && porCodigo.has(cursor) && !vistos.has(cursor)) {
      incluidos.add(cursor);
      vistos.add(cursor);
      const padre = porCodigo.get(cursor);
      cursor = padre ? padreEnPlan(padre.account_code, padre.parent_code, todos) : null;
    }
  }

  const codigos = [...incluidos];
  const padreDe = new Map<string, string | null>();
  for (const codigo of codigos) {
    const cuenta = porCodigo.get(codigo);
    if (!cuenta) continue;
    padreDe.set(codigo, padreEnPlan(codigo, cuenta.parent_code, codigos));
  }

  const padreSeguro = (codigo: string): string | null => {
    const vistos = new Set<string>([codigo]);
    let cursor = padreDe.get(codigo) ?? null;
    while (cursor) {
      if (vistos.has(cursor)) return null;
      vistos.add(cursor);
      cursor = padreDe.get(cursor) ?? null;
    }
    return padreDe.get(codigo) ?? null;
  };

  const nodos = new Map<string, NodoPlan<T>>();
  for (const codigo of codigos) {
    const cuenta = porCodigo.get(codigo);
    if (cuenta) nodos.set(codigo, { cuenta, children: [] });
  }
  const raices: NodoPlan<T>[] = [];
  for (const codigo of codigos) {
    const nodo = nodos.get(codigo);
    if (!nodo) continue;
    const padre = padreSeguro(codigo);
    const nodoPadre = padre ? nodos.get(padre) : undefined;
    if (nodoPadre) nodoPadre.children.push(nodo);
    else raices.push(nodo);
  }

  const ordenar = (lista: NodoPlan<T>[]) => {
    lista.sort((a, b) => a.cuenta.account_code.localeCompare(b.cuenta.account_code));
    lista.forEach((n) => ordenar(n.children));
  };
  ordenar(raices);
  return raices;
}

/** Null legado con hijos se muestra como título; sin hijos, como movimiento. */
export function esMovimientoVisible(
  esMovimiento: boolean | null | undefined,
  tieneHijos: boolean,
): boolean {
  if (esMovimiento === true) return true;
  if (esMovimiento === false) return false;
  return !tieneHijos;
}
