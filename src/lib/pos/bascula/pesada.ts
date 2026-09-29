/**
 * De la lectura de la báscula a la pesada que se agrega al carrito
 * (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.6 y §2.9). Puro.
 *
 * - Convierte el peso de la trama a la unidad del producto (una báscula en lb
 *   puede vender un producto en kg).
 * - Tara: se resta en el POS (bruto − tara), salvo que la báscula ya mande el
 *   neto (`NT`): entonces no se resta dos veces.
 * - Fuera de rango: neto negativo («Pon en cero sin nada encima») o más que la
 *   capacidad («Sobrecarga (máx. 15 kg)»).
 * - «Agregar» solo con lectura estable, neto > 0, ≥ mínimo, ≤ capacidad y, si
 *   el producto exige tara, con tara.
 */

import type { Pesaje } from '@/lib/pos/peso/pesada';
import { minimoDeVenta } from '@/lib/pos/peso/pesada';
import { codigoUnidad, decimalesCantidad, redondearCantidadProducto, type ProductoModoVenta } from '@/lib/pos/peso/modoVenta';
import type { EstadoLector, ErrorLector } from './lector';
import type { ConfigBascula } from './tipos';

const A_KG: Record<string, number> = { KG: 1, G: 0.001, GR: 0.001, LB: 0.45359237, OZ: 0.028349523125 };

/** Convierte entre unidades de peso; null si alguna no es de peso. */
export function convertirPeso(valor: number, de: string | null | undefined, a: string | null | undefined): number | null {
  const d = (de ?? '').trim().toUpperCase();
  const h = (a ?? '').trim().toUpperCase();
  if (d === h) return valor;
  const fd = A_KG[d];
  const fh = A_KG[h];
  if (!fd || !fh) return null;
  return (valor * fd) / fh;
}

export type EstadoVistaLectura = 'conectando' | 'estable' | 'inestable' | 'fuera_de_rango' | 'error';

export type MotivoNoAgregar = 'inestable' | 'sin_peso' | 'bajo_minimo' | 'fuera_de_rango' | 'sin_tara' | 'error';

export interface VistaLectura {
  estado: EstadoVistaLectura;
  fueraDeRango: 'bajo_cero' | 'sobrecarga' | null;
  error: ErrorLector | 'unidad' | null;
  /** En la unidad del producto, redondeados a sus decimales. */
  bruto: number | null;
  tara: number | null;
  neto: number | null;
  puedeAgregar: boolean;
  motivo: MotivoNoAgregar | null;
}

export interface EntradaVista {
  lector: Pick<EstadoLector, 'fase' | 'error' | 'lectura' | 'peso' | 'unidad' | 'estable'>;
  /** Unidad del producto ('KG' o 'LB'). */
  unidadProducto: string;
  decimales: number;
  /** Tara del POS en la unidad del producto (0 si no hay). */
  tara: number;
  /** Capacidad de la báscula en SU unidad (`pos_scales.capacity_max`). */
  capacidad: number | null;
  unidadBascula: string;
  minimo: number | null;
  /** El producto exige tara (`tare_required` con `default_tare_qty`). */
  exigeTara: boolean;
}

export function vistaLectura(e: EntradaVista): VistaLectura {
  const base: VistaLectura = {
    estado: 'conectando',
    fueraDeRango: null,
    error: null,
    bruto: null,
    tara: null,
    neto: null,
    puedeAgregar: false,
    motivo: 'sin_peso',
  };
  const { lector } = e;
  if (lector.fase === 'error') return { ...base, estado: 'error', error: lector.error ?? 'io', motivo: 'error' };
  if (lector.fase !== 'leyendo' || !lector.lectura) return base;

  const lectura = lector.lectura;
  if (lectura.estado === 'error') return { ...base, estado: 'error', error: 'io', motivo: 'error' };
  if (lectura.estado === 'sobrecarga') {
    return { ...base, estado: 'fuera_de_rango', fueraDeRango: 'sobrecarga', motivo: 'fuera_de_rango' };
  }
  if (lector.peso === null) {
    return { ...base, estado: lectura.estado === 'bajo_cero' ? 'fuera_de_rango' : 'inestable', fueraDeRango: lectura.estado === 'bajo_cero' ? 'bajo_cero' : null, motivo: lectura.estado === 'bajo_cero' ? 'fuera_de_rango' : 'inestable' };
  }

  const pesoProducto = convertirPeso(lector.peso, lector.unidad, e.unidadProducto);
  if (pesoProducto === null) return { ...base, estado: 'error', error: 'unidad', motivo: 'error' };

  const dec = e.decimales;
  const tara = lectura.netoDeBascula ? 0 : Math.max(0, e.tara || 0);
  const bruto = redondearCantidadProducto(pesoProducto, dec);
  const neto = redondearCantidadProducto(pesoProducto - tara, dec);
  const conValores = { ...base, bruto: lectura.netoDeBascula ? null : bruto, tara: tara > 0 ? redondearCantidadProducto(tara, dec) : null, neto };

  // Capacidad: se compara el peso de la trama en la unidad de la báscula.
  const pesoEnBascula = convertirPeso(lector.peso, lector.unidad, e.unidadBascula) ?? lector.peso;
  if (e.capacidad !== null && e.capacidad > 0 && pesoEnBascula > e.capacidad + 1e-9) {
    return { ...conValores, estado: 'fuera_de_rango', fueraDeRango: 'sobrecarga', motivo: 'fuera_de_rango' };
  }
  if (lectura.estado === 'bajo_cero' || neto < 0) {
    return { ...conValores, estado: 'fuera_de_rango', fueraDeRango: 'bajo_cero', motivo: 'fuera_de_rango' };
  }
  if (!lector.estable) return { ...conValores, estado: 'inestable', motivo: 'inestable' };

  let motivo: MotivoNoAgregar | null = null;
  if (neto <= 0) motivo = 'sin_peso';
  else if (e.exigeTara && tara <= 0) motivo = 'sin_tara';
  else if (e.minimo !== null && neto < e.minimo) motivo = 'bajo_minimo';
  return { ...conValores, estado: 'estable', puedeAgregar: motivo === null, motivo };
}

/** El registro de una pesada de báscula para `notes.pesaje` (lo valida `fn_pos_validar_pesaje`). */
export function pesajeBascula(params: {
  basculaId: string;
  vista: Pick<VistaLectura, 'bruto' | 'tara' | 'neto'>;
  unidadProducto: string;
  ahora?: Date;
}): Pesaje {
  const { vista } = params;
  const neto = vista.neto ?? 0;
  const pesaje: Pesaje = {
    origen: 'bascula',
    neto,
    unidad: params.unidadProducto || 'KG',
    estable: true,
    bascula_id: params.basculaId,
    leido_en: (params.ahora ?? new Date()).toISOString(),
  };
  if (vista.bruto !== null) pesaje.bruto = vista.bruto;
  pesaje.tara = vista.tara ?? 0;
  return pesaje;
}

/** Lector aún sin estado (el puerto no abrió todavía). */
export const LECTOR_SIN_ESTADO: EntradaVista['lector'] = { fase: 'conectando', error: null, lectura: null, peso: null, unidad: 'KG', estable: false };

/** La entrada de `vistaLectura` para un producto con la báscula del equipo y una tara. */
export function entradaParaProducto(params: {
  lector: EntradaVista['lector'] | null;
  producto: ProductoModoVenta | null;
  config: Pick<ConfigBascula, 'capacidad' | 'unidad'> | null;
  tara: number;
}): EntradaVista {
  const { producto, config } = params;
  const tp = Number(producto?.default_tare_qty);
  return {
    lector: params.lector ?? { ...LECTOR_SIN_ESTADO, unidad: config?.unidad ?? 'KG' },
    unidadProducto: codigoUnidad(producto?.unit_code) || 'KG',
    decimales: decimalesCantidad(producto),
    tara: params.tara,
    capacidad: config?.capacidad ?? null,
    unidadBascula: config?.unidad ?? 'KG',
    minimo: producto ? minimoDeVenta(producto) : null,
    exigeTara: !!producto?.tare_required && Number.isFinite(tp) && tp > 0,
  };
}
