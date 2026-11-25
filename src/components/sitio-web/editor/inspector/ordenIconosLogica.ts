/**
 * «Orden en la cabecera» (Figma «16 Sitio web» 3261:99475, aprobado 2026-11-25): lógica pura del
 * bloque de Encabezado › Íconos.
 *
 * - Computador: reutiliza `actions_order` (la columna de siempre, que la tienda ya respeta).
 * - Celular: `header_iconos.ordenCelular` en el documento V2 (sin columna nueva, ADR-002). Sin la
 *   clave = «Igual que en el computador».
 * - Lo que se ve lo siguen decidiendo los interruptores de siempre (`show_header_cart`,
 *   `show_header_auth`, `header_show_currency`, `header_iconos.favoritos`): un ícono apagado
 *   conserva su puesto en el orden y, al prenderlo, vuelve ahí.
 * - La barra del buscador no se ordena (su lugar lo pone la composición), y los botones del
 *   encabezado y el selector de sede van siempre después de los íconos.
 * - Si el sitio arma el encabezado con zonas del Constructor (`header_builder.zones`), el orden lo
 *   da el Constructor: el bloque avisa y no escribe nada.
 *
 * Lectura del orden: `@/lib/website/v2/cabeceraTienda` (el mismo archivo que lee la tienda).
 */
import {
  ORDEN_ACCIONES_HOY,
  opcionesIconos,
  opcionesMoneda,
  ordenAcciones,
  ordenCelularPropio,
  type AccionOrden,
} from '@/lib/website/v2/cabeceraTienda';
import { leerMenuInferior, repetidosArriba } from '@/lib/website/menuInferior';
import { buscadorCelular, buscadorComputador, formaBuscadorCelular } from './buscadorCelularLogica';
import { cambioIconos } from './cabeceraTiendaLogica';
import { iconoVisible } from './celularLogica';

type Ajustes = Record<string, unknown>;

export type DispositivoOrden = 'computador' | 'celular';

/**
 * Estado de cada ícono en la lista del bloque:
 * - `orden`: se ve y se ordena (asa y flechas).
 * - `barra`: el buscador es una barra; no se ordena.
 * - `fuera`: prendido, pero no sale en la barra del celular (`motivo` dice por qué).
 * - `oculto`: apagado con su interruptor (o el buscador apagado en Diseño › Buscador).
 */
export type EstadoIcono = 'orden' | 'barra' | 'fuera' | 'oculto';

export type MotivoFuera = 'menuInferior' | 'monedaMenu' | 'favoritosCelular' | 'apagadoCelular';

export interface FilaOrden {
  accion: AccionOrden;
  estado: EstadoIcono;
  motivo?: MotivoFuera;
}

const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** El encabezado se arma con zonas del Constructor: el orden lo da el Constructor. */
export function ordenDelConstructor(a: Ajustes): boolean {
  const zonas = objeto(objeto(a.header_builder)?.zones);
  if (!zonas) return false;
  return Object.values(zonas).some((v) => Array.isArray(v) && v.length > 0);
}

/** «Igual que en el computador» (por defecto): el celular no tiene orden propio. */
export function celularIgualQueComputador(a: Ajustes): boolean {
  return ordenCelularPropio(a) === null;
}

/** Orden que se edita en cada pestaña. */
export function ordenDe(a: Ajustes, dispositivo: DispositivoOrden): AccionOrden[] {
  const computador = ordenAcciones(a.actions_order);
  return dispositivo === 'celular' ? ordenCelularPropio(a) ?? computador : computador;
}

/** El de siempre: Buscar · Moneda · (Favoritos) · Carrito · Cuenta. */
export const ORDEN_DE_SIEMPRE: readonly AccionOrden[] = ordenAcciones(ORDEN_ACCIONES_HOY);

export function esOrdenDeSiempre(orden: readonly AccionOrden[]): boolean {
  return orden.length === ORDEN_DE_SIEMPRE.length && orden.every((x, i) => x === ORDEN_DE_SIEMPRE[i]);
}

/** Prendido con su interruptor de siempre (el mismo de las tarjetas de abajo). */
export function iconoPrendido(a: Ajustes, accion: AccionOrden): boolean {
  if (accion === 'currency') return a.header_show_currency !== false;
  if (accion === 'favorites') return opcionesIconos(a).favoritos;
  if (accion === 'cart') return a.show_header_cart !== false;
  if (accion === 'auth') return a.show_header_auth !== false;
  return true;
}

/** Cambio del interruptor de cada ícono: las mismas claves que las tarjetas («Cuáles se ven»). */
export function cambioPrendido(a: Ajustes, accion: AccionOrden, si: boolean): Ajustes {
  if (accion === 'currency') return { header_show_currency: si };
  if (accion === 'favorites') return cambioIconos(a, { favoritos: si ? true : null });
  if (accion === 'cart') return { show_header_cart: si };
  if (accion === 'auth') return { show_header_auth: si };
  return {};
}

const REPETIDO: Partial<Record<AccionOrden, 'search' | 'cart' | 'account' | 'favorites'>> = {
  search: 'search',
  cart: 'cart',
  auth: 'account',
  favorites: 'favorites',
};

function estadoDe(a: Ajustes, accion: AccionOrden, dispositivo: DispositivoOrden, repetidos: ReadonlySet<string>): Omit<FilaOrden, 'accion'> {
  if (accion === 'search') {
    const forma = formaBuscadorCelular(dispositivo === 'celular' ? buscadorCelular(a) : buscadorComputador(a));
    if (forma === 'hidden') return { estado: 'oculto' };
    if (forma === 'bar') return { estado: 'barra' };
  } else if (!iconoPrendido(a, accion)) {
    return { estado: 'oculto' };
  }
  if (dispositivo === 'computador') return { estado: 'orden' };
  // Celular: lo mismo que pinta la tienda (HeaderActions con `isMobile`).
  if (accion === 'favorites') return { estado: 'fuera', motivo: 'favoritosCelular' };
  if (accion === 'currency' && opcionesMoneda(a).movil !== 'barra') return { estado: 'fuera', motivo: 'monedaMenu' };
  if (accion === 'search' && !iconoVisible(a, 'show_search')) return { estado: 'fuera', motivo: 'apagadoCelular' };
  if (accion === 'cart' && !iconoVisible(a, 'show_cart')) return { estado: 'fuera', motivo: 'apagadoCelular' };
  if (accion === 'auth' && !iconoVisible(a, 'show_account')) return { estado: 'fuera', motivo: 'apagadoCelular' };
  const r = REPETIDO[accion];
  if (r && repetidos.has(r)) return { estado: 'fuera', motivo: 'menuInferior' };
  return { estado: 'orden' };
}

/** Filas del bloque, en el orden guardado del dispositivo. */
export function filasOrden(a: Ajustes, dispositivo: DispositivoOrden): FilaOrden[] {
  // «No repetir arriba» del menú inferior (en una página normal, como la portada).
  const repetidos = dispositivo === 'celular' ? repetidosArriba(leerMenuInferior(a), '/') : new Set<string>();
  return ordenDe(a, dispositivo).map((accion) => ({ accion, ...estadoDe(a, accion, dispositivo, repetidos) }));
}

/**
 * Mueve `accion` al puesto `destino` (contado entre las que se ordenan). Los íconos que no se
 * ordenan (ocultos, fuera de la barra, el buscador como barra) se quedan en su puesto: así un
 * ícono apagado vuelve a su lugar al prenderlo.
 */
export function moverAccion(orden: readonly AccionOrden[], movibles: ReadonlySet<AccionOrden>, accion: AccionOrden, destino: number): AccionOrden[] {
  const lista = orden.filter((x) => movibles.has(x));
  const desde = lista.indexOf(accion);
  if (desde < 0) return [...orden];
  const hasta = Math.max(0, Math.min(lista.length - 1, destino));
  if (desde === hasta) return [...orden];
  lista.splice(desde, 1);
  lista.splice(hasta, 0, accion);
  let i = 0;
  return orden.map((x) => (movibles.has(x) ? lista[i++] : x));
}

/** Guarda el orden del dispositivo. El celular, en `header_iconos.ordenCelular`. */
export function cambioOrden(a: Ajustes, dispositivo: DispositivoOrden, orden: readonly AccionOrden[]): Ajustes {
  if (ordenDelConstructor(a)) return {};
  if (dispositivo === 'computador') return { actions_order: [...orden] };
  return cambioIconos(a, { ordenCelular: [...orden] });
}

/**
 * «Igual que en el computador». Encendido: se borra el orden propio. Apagado: el celular arranca
 * con el orden del computador y desde ahí se cambia.
 */
export function cambioCelularIgual(a: Ajustes, igual: boolean): Ajustes {
  if (ordenDelConstructor(a)) return {};
  return cambioIconos(a, { ordenCelular: igual ? null : ordenAcciones(a.actions_order) });
}

/**
 * «Restablecer orden». Computador: `actions_order` vuelve al de siempre (Favoritos, si está
 * prendido, antes del Carrito) y el celular vuelve a «Igual que en el computador» (Figma A5).
 * Celular: solo vuelve a «Igual que en el computador». Los interruptores no cambian.
 */
export function cambioRestablecer(a: Ajustes, dispositivo: DispositivoOrden): Ajustes {
  if (ordenDelConstructor(a)) return {};
  const celular = celularIgualQueComputador(a) ? {} : cambioIconos(a, { ordenCelular: null });
  if (dispositivo === 'computador') return { actions_order: [...ORDEN_ACCIONES_HOY], ...celular };
  return celular;
}

/** ¿Hay algo que restablecer en la pestaña? */
export function puedeRestablecer(a: Ajustes, dispositivo: DispositivoOrden): boolean {
  if (dispositivo === 'celular') return !celularIgualQueComputador(a);
  return !esOrdenDeSiempre(ordenAcciones(a.actions_order)) || !celularIgualQueComputador(a);
}
