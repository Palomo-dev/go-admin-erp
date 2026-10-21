/**
 * Árbol del balance (y del estado de resultados).
 *
 * El plan tiene cuentas de 4 dígitos sin `parent_code` (1.053 al revisar el
 * esquema). Si el grupo «2» solo suma las hijas que lo apuntan, su importe
 * queda por debajo del total de pasivos: esas cuentas sueltas son raíces y
 * entran en el total, pero no en el grupo.
 *
 * El padre efectivo es el `parent_code` si existe en el mismo conjunto; si
 * no, el prefijo más largo que sí exista (`2408` → `24` → `2`). Un ciclo
 * (`A` padre de `B` y `B` padre de `A`) no se enlaza: las dos quedan como
 * raíces y la suma no se llama a sí misma.
 */

export interface CuentaArbol {
  account_code: string;
  name: string;
  type: string;
  parent_code: string | null;
}

export interface NodoArbol extends CuentaArbol {
  amount: number;
  children: NodoArbol[];
}

function padreExplicito(codigo: string, porCodigo: ReadonlyMap<string, CuentaArbol>): string | null {
  const cuenta = porCodigo.get(codigo);
  const explicito = cuenta?.parent_code;
  if (explicito && explicito !== codigo && porCodigo.has(explicito)) return explicito;
  for (let largo = codigo.length - 1; largo >= 1; largo -= 1) {
    const prefijo = codigo.slice(0, largo);
    if (porCodigo.has(prefijo)) return prefijo;
  }
  return null;
}

function cierraCiclo(
  hijo: string,
  padre: string,
  porCodigo: ReadonlyMap<string, CuentaArbol>,
): boolean {
  const vistos = new Set<string>([hijo]);
  let actual: string | null = padre;
  while (actual) {
    if (vistos.has(actual)) return true;
    vistos.add(actual);
    actual = padreExplicito(actual, porCodigo);
  }
  return false;
}

/**
 * Arma el árbol y deja en cada nodo su saldo propio más el de sus hijas.
 * `saldoPropio` es el movimiento de ESA cuenta, sin descendientes.
 */
export function armarArbolContable(
  cuentas: readonly CuentaArbol[],
  saldoPropio: (codigo: string) => number,
): NodoArbol[] {
  const porCodigo = new Map(cuentas.map((cuenta) => [cuenta.account_code, cuenta]));
  const nodos = new Map<string, NodoArbol>();
  for (const cuenta of cuentas) {
    nodos.set(cuenta.account_code, {
      account_code: cuenta.account_code,
      name: cuenta.name,
      type: cuenta.type,
      parent_code: cuenta.parent_code,
      amount: 0,
      children: [],
    });
  }

  const raices: NodoArbol[] = [];
  for (const cuenta of cuentas) {
    const nodo = nodos.get(cuenta.account_code);
    if (!nodo) continue;
    const padre = padreExplicito(cuenta.account_code, porCodigo);
    const padreNodo = padre ? nodos.get(padre) : undefined;
    if (padre && padreNodo && !cierraCiclo(cuenta.account_code, padre, porCodigo)) {
      padreNodo.children.push(nodo);
    } else {
      raices.push(nodo);
    }
  }

  const ordenar = (lista: NodoArbol[]) => {
    lista.sort((a, b) => a.account_code.localeCompare(b.account_code));
    lista.forEach((nodo) => ordenar(nodo.children));
  };
  ordenar(raices);

  const sumar = (nodo: NodoArbol, vistos: Set<string>): number => {
    if (vistos.has(nodo.account_code)) return 0;
    vistos.add(nodo.account_code);
    const hijos = nodo.children.reduce((suma, hijo) => suma + sumar(hijo, vistos), 0);
    nodo.amount = (saldoPropio(nodo.account_code) || 0) + hijos;
    return nodo.amount;
  };
  const vistos = new Set<string>();
  raices.forEach((raiz) => sumar(raiz, vistos));
  return raices;
}

/** Importe que muestra un grupo (por ejemplo «2»), o null si no está en el árbol. */
export function importeDeGrupo(nodos: readonly NodoArbol[], codigo: string): number | null {
  for (const nodo of nodos) {
    if (nodo.account_code === codigo) return nodo.amount;
    const enHijo = importeDeGrupo(nodo.children, codigo);
    if (enHijo != null) return enHijo;
  }
  return null;
}
