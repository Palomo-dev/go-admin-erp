/**
 * Reportes por nivel del PUC colombiano.
 *
 * Clase (1), grupo (2), cuenta (4), subcuenta (6) y auxiliar (el código
 * completo). Agrupar suma las hojas: el total de un nivel es el mismo que
 * el de las cuentas de movimiento, así el balance y el estado de resultados
 * cuadran en cualquier corte.
 */

export const NIVELES_PUC = ['clase', 'grupo', 'cuenta', 'subcuenta', 'auxiliar'] as const;
export type NivelPuc = (typeof NIVELES_PUC)[number];

export const ETIQUETA_NIVEL: Record<NivelPuc, string> = {
  clase: 'Clase',
  grupo: 'Grupo',
  cuenta: 'Cuenta',
  subcuenta: 'Subcuenta',
  auxiliar: 'Auxiliar',
};

const LONGITUD: Record<Exclude<NivelPuc, 'auxiliar'>, number> = {
  clase: 1,
  grupo: 2,
  cuenta: 4,
  subcuenta: 6,
};

export function codigoEnNivel(codigo: string, nivel: NivelPuc): string {
  const original = codigo.trim();
  if (original === 'RESULTADO') {
    if (nivel === 'clase') return '3';
    if (nivel === 'grupo') return '36';
    return original;
  }
  const limpio = original.replace(/-/g, '');
  if (nivel === 'auxiliar' || !/^\d+$/.test(limpio)) return original;
  const n = LONGITUD[nivel];
  return limpio.length <= n ? limpio : limpio.slice(0, n);
}

export interface HojaSaldo {
  codigo: string;
  nombre: string;
  debitoInicial: number;
  creditoInicial: number;
  debitoPeriodo: number;
  creditoPeriodo: number;
  debitoFinal: number;
  creditoFinal: number;
}

export interface FilaNivel extends HojaSaldo {
  nivel: NivelPuc;
}

function sumar(a: HojaSaldo, b: HojaSaldo): HojaSaldo {
  return {
    codigo: a.codigo,
    nombre: a.nombre,
    debitoInicial: a.debitoInicial + b.debitoInicial,
    creditoInicial: a.creditoInicial + b.creditoInicial,
    debitoPeriodo: a.debitoPeriodo + b.debitoPeriodo,
    creditoPeriodo: a.creditoPeriodo + b.creditoPeriodo,
    debitoFinal: a.debitoFinal + b.debitoFinal,
    creditoFinal: a.creditoFinal + b.creditoFinal,
  };
}

/** Agrupa hojas ya neteadas. La suma de cada columna se conserva. */
export function agruparPorNivel(
  hojas: HojaSaldo[],
  nivel: NivelPuc,
  nombres: ReadonlyMap<string, string> = new Map(),
): FilaNivel[] {
  const grupos = new Map<string, HojaSaldo>();
  for (const hoja of hojas) {
    const codigo = codigoEnNivel(hoja.codigo, nivel);
    const previo = grupos.get(codigo);
    const pieza: HojaSaldo = { ...hoja, codigo, nombre: nombres.get(codigo) || (codigo === hoja.codigo ? hoja.nombre : codigo) };
    grupos.set(codigo, previo ? sumar(previo, { ...pieza, nombre: previo.nombre }) : pieza);
  }
  return [...grupos.values()]
    .map((fila) => ({ ...fila, nombre: nombres.get(fila.codigo) || fila.nombre, nivel }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export interface NodoImporte {
  account_code: string;
  name: string;
  amount: number;
  children: NodoImporte[];
}

/** Importe propio de un nodo: el total menos el de sus hijas. */
export function importesPropios(nodos: NodoImporte[]): { codigo: string; nombre: string; importe: number }[] {
  const salida: { codigo: string; nombre: string; importe: number }[] = [];
  const visitar = (nodo: NodoImporte) => {
    const hijos = nodo.children.reduce((s, h) => s + h.amount, 0);
    const propio = nodo.amount - hijos;
    if (Math.abs(propio) >= 0.005) salida.push({ codigo: nodo.account_code, nombre: nodo.name, importe: propio });
    nodo.children.forEach(visitar);
  };
  nodos.forEach(visitar);
  return salida;
}

export interface FilaImporte {
  codigo: string;
  nombre: string;
  importe: number;
}

/** Colapsa un árbol (situación financiera o resultados) al nivel pedido. */
export function colapsarImportes(nodos: NodoImporte[], nivel: NivelPuc): FilaImporte[] {
  const nombres = new Map<string, string>();
  const indexar = (nodo: NodoImporte) => {
    nombres.set(nodo.account_code, nodo.name);
    nodo.children.forEach(indexar);
  };
  nodos.forEach(indexar);

  const propios = importesPropios(nodos);
  const grupos = new Map<string, FilaImporte>();
  for (const fila of propios) {
    const codigo = codigoEnNivel(fila.codigo, nivel);
    const previo = grupos.get(codigo);
    const nombre = nombres.get(codigo) || (codigo === fila.codigo ? fila.nombre : codigo);
    if (previo) previo.importe += fila.importe;
    else grupos.set(codigo, { codigo, nombre, importe: fila.importe });
  }
  return [...grupos.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export function sumaImportes(filas: { importe: number }[]): number {
  return filas.reduce((s, f) => s + f.importe, 0);
}

/**
 * Activo = pasivo + patrimonio + resultado del ejercicio (clases 4 a 7
 * todavía no cerradas). `resultado` entra con signo de patrimonio
 * (ingreso menos gasto).
 */
export function cuadreSituacion(
  activo: number,
  pasivo: number,
  patrimonio: number,
  resultado: number,
): { cuadra: boolean; diferencia: number } {
  const diferencia = activo - (pasivo + patrimonio + resultado);
  return { cuadra: Math.abs(diferencia) < 0.01, diferencia };
}

export interface LineaTercero {
  terceroNit: string;
  terceroNombre: string;
  cuenta: string;
  debito: number;
  credito: number;
}

export interface FilaAuxiliar {
  terceroNit: string;
  terceroNombre: string;
  cuenta: string;
  debito: number;
  credito: number;
  saldo: number;
}

/** Auxiliar por tercero: suma débito y crédito de cada NIT en cada cuenta. */
export function auxiliarPorTercero(lineas: LineaTercero[]): FilaAuxiliar[] {
  const grupos = new Map<string, FilaAuxiliar>();
  for (const linea of lineas) {
    const nit = linea.terceroNit.trim();
    const clave = `${nit}|${linea.cuenta}`;
    const previo = grupos.get(clave);
    if (previo) {
      previo.debito += linea.debito;
      previo.credito += linea.credito;
      if (!previo.terceroNombre && linea.terceroNombre) previo.terceroNombre = linea.terceroNombre;
    } else {
      grupos.set(clave, {
        terceroNit: nit || '—',
        terceroNombre: linea.terceroNombre.trim(),
        cuenta: linea.cuenta,
        debito: linea.debito,
        credito: linea.credito,
        saldo: 0,
      });
    }
  }
  return [...grupos.values()]
    .map((fila) => ({ ...fila, saldo: fila.debito - fila.credito }))
    .sort((a, b) => a.terceroNit.localeCompare(b.terceroNit) || a.cuenta.localeCompare(b.cuenta));
}
