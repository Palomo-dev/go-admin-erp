/**
 * Reglas de centro de costo que la base aplica al sembrar, repartir y heredar.
 * El SQL es la fuente de verdad; estas funciones dejan la misma decisión
 * comprobable sin abrir una conexión.
 */

export type ModoCentro = 'obligatorio' | 'opcional' | 'no_aplica';

const CLASES_RESULTADO = ['4', '5', '6', '7'];
const CLASES_BALANCE = ['1', '2', '3', '8', '9'];

export function modoDeCuenta(entrada: {
  clase: string;
  requiereCentro: boolean;
  plantillaExiste: boolean;
  plantillaRequiere: boolean | null;
}): ModoCentro {
  const clase = entrada.clase.slice(0, 1);
  const distinta = entrada.plantillaExiste
    && entrada.plantillaRequiere !== null
    && entrada.requiereCentro !== entrada.plantillaRequiere;
  if (distinta) return entrada.requiereCentro ? 'obligatorio' : 'opcional';
  if (!entrada.plantillaExiste && CLASES_BALANCE.includes(clase) && entrada.requiereCentro) {
    return 'obligatorio';
  }
  if (!entrada.plantillaExiste && CLASES_RESULTADO.includes(clase) && !entrada.requiereCentro) {
    return 'opcional';
  }
  if (CLASES_RESULTADO.includes(clase)) return 'obligatorio';
  return 'no_aplica';
}

/** Sin centros activos no se exige, aunque el modo de la cuenta sea obligatorio. */
export function exigeCentro(modo: ModoCentro, hayCentrosActivos: boolean): boolean {
  return modo === 'obligatorio' && hayCentrosActivos;
}

/**
 * Reparte un importe según porcentajes que suman 100.
 * Cada tramo se redondea a centavos y el último se lleva el residuo,
 * así la suma cuadra con el total.
 */
export function repartir(total: number, porcentajes: number[]): number[] {
  if (porcentajes.length === 0) return [];
  const centavos = Math.round(total * 100);
  const partes: number[] = [];
  let acumulado = 0;
  porcentajes.forEach((porcentaje, indice) => {
    if (indice === porcentajes.length - 1) {
      partes.push((centavos - acumulado) / 100);
      return;
    }
    const parte = Math.round((centavos * porcentaje) / 100);
    acumulado += parte;
    partes.push(parte / 100);
  });
  return partes;
}

export interface NodoCentro {
  id: string;
  parentId: string | null;
  propio: number;
}

/** El acumulado de un centro es su movimiento más el de todos sus descendientes. */
export function acumuladoPorCentro(nodos: NodoCentro[]): Map<string, number> {
  const memo = new Map<string, number>();

  function suma(id: string, vistos: Set<string>): number {
    const previo = memo.get(id);
    if (previo !== undefined) return previo;
    if (vistos.has(id)) throw new Error('CENTRO_CICLO');
    const nodo = nodos.find((fila) => fila.id === id);
    if (!nodo) return 0;
    vistos.add(id);
    let total = nodo.propio;
    for (const hijo of nodos) {
      if (hijo.parentId === id) total += suma(hijo.id, vistos);
    }
    vistos.delete(id);
    memo.set(id, Math.round(total * 100) / 100);
    return memo.get(id) ?? 0;
  }

  for (const nodo of nodos) suma(nodo.id, new Set());
  return memo;
}

/**
 * Centro que queda en la línea al insertarla.
 * Un modo `no_aplica` no recibe centro. Si nadie lo eligió, se hereda
 * del empleado, del documento, de la sucursal o del centro por defecto.
 */
export function centroHeredado(entrada: {
  modo: ModoCentro;
  explicito: string | null;
  delEmpleado?: string | null;
  delDocumento?: string | null;
  deSucursal?: string | null;
  porDefecto?: string | null;
}): string | null {
  if (entrada.modo === 'no_aplica') return null;
  return entrada.explicito
    ?? entrada.delEmpleado
    ?? entrada.delDocumento
    ?? entrada.deSucursal
    ?? entrada.porDefecto
    ?? null;
}
