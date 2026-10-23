/**
 * Árbol del balance y del estado de resultados.
 *
 * El padre es el prefijo PUC más largo que existe en el mismo conjunto
 * (clase 1, grupo 2, cuenta 4, subcuenta 6, auxiliar 8). `parent_code` no
 * decide el árbol: hay cuentas cuyo padre guardado no es su prefijo y, si
 * se respetara, el inventario no sumaría en el grupo 14.
 *
 * Un código con guion se normaliza antes (`1405-01` → `140501`). Si el
 * grupo intermedio no existe, la cuenta sube al prefijo que sí existe.
 */

import { codigoNormalizado, cortesAncestro, presentacionDeCodigo, type PresentacionNiif } from '@/lib/finanzas/pucPrefijo';

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
  const normal = codigoNormalizado(codigo);
  for (const corte of cortesAncestro(normal.length)) {
    const prefijo = normal.slice(0, corte);
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

/**
 * El resultado sin cerrar es hija de 36 y suma en el grupo y en la clase 3.
 * Si 36 o 3 no están en el plan, se crean solo para presentar el importe.
 */
export function anidarResultado(raices: NodoArbol[], importe: number): void {
  if (Math.abs(importe) < 0.005) return;
  const resultado: NodoArbol = {
    account_code: 'RESULTADO',
    name: 'Resultado del ejercicio (sin cerrar)',
    type: 'equity',
    parent_code: '36',
    amount: importe,
    children: [],
  };

  const buscar = (nodos: NodoArbol[], codigo: string): NodoArbol | null => {
    for (const nodo of nodos) {
      if (nodo.account_code === codigo) return nodo;
      const hijo = buscar(nodo.children, codigo);
      if (hijo) return hijo;
    }
    return null;
  };

  let clase = buscar(raices, '3');
  if (!clase) {
    clase = {
      account_code: '3',
      name: 'Patrimonio',
      type: 'equity',
      parent_code: null,
      amount: 0,
      children: [],
    };
    raices.push(clase);
  }
  let grupo = buscar([clase], '36');
  if (!grupo) {
    grupo = {
      account_code: '36',
      name: 'Resultados del ejercicio',
      type: 'equity',
      parent_code: '3',
      amount: 0,
      children: [],
    };
    clase.children.push(grupo);
    clase.children.sort((a, b) => a.account_code.localeCompare(b.account_code));
  }
  grupo.children.push(resultado);

  const contiene = (nodo: NodoArbol): boolean =>
    nodo.account_code === 'RESULTADO' || nodo.children.some(contiene);
  const subir = (nodo: NodoArbol): void => {
    nodo.children.forEach(subir);
    if (nodo.account_code !== 'RESULTADO' && nodo.children.some(contiene)) {
      nodo.amount += importe;
    }
  };
  raices.forEach(subir);
}

const NOMBRE_PRESENTACION: Record<PresentacionNiif, string> = {
  corriente: 'Corriente',
  no_corriente: 'No corriente',
  segun_plazo: 'Según plazo',
};

/**
 * Reagrupa los hijos de las clases 1 y 2 por `presentacion_niif`.
 * El nombre del grupo PUC no cambia: 11 sigue siendo Disponible.
 */
export function presentarNiif(
  raices: NodoArbol[],
  explicita: ReadonlyMap<string, string | null>,
): NodoArbol[] {
  return raices.map((raiz) => {
    if (raiz.account_code !== '1' && raiz.account_code !== '2') return raiz;
    const cubetas = new Map<PresentacionNiif, NodoArbol>();
    const asegurar = (presentacion: PresentacionNiif): NodoArbol => {
      let cubeta = cubetas.get(presentacion);
      if (!cubeta) {
        cubeta = {
          account_code: `NIIF-${presentacion}`,
          name: NOMBRE_PRESENTACION[presentacion],
          type: raiz.type,
          parent_code: raiz.account_code,
          amount: 0,
          children: [],
        };
        cubetas.set(presentacion, cubeta);
      }
      return cubeta;
    };
    const sueltos: NodoArbol[] = [];
    for (const hijo of raiz.children) {
      const presentacion = presentacionDeCodigo(hijo.account_code, explicita.get(hijo.account_code));
      if (!presentacion) {
        sueltos.push(hijo);
        continue;
      }
      const cubeta = asegurar(presentacion);
      cubeta.children.push(hijo);
      cubeta.amount += hijo.amount;
    }
    const orden: PresentacionNiif[] = ['corriente', 'no_corriente', 'segun_plazo'];
    raiz.children = [
      ...orden.flatMap((clave) => {
        const cubeta = cubetas.get(clave);
        return cubeta ? [cubeta] : [];
      }),
      ...sueltos,
    ];
    return raiz;
  });
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
