/**
 * Cifras de presentación de «Ventas del periodo» a partir de la respuesta de
 * `GET /api/inicio/ventas`: las comparten la tarjeta y su detalle.
 */
import { formatMoneda } from '@/lib/utils/moneda';
import { monedaUnica } from '@/lib/dashboard/ventasInicio';
import { variacion } from '@/lib/dashboard/resumenModulos';
import { compararSeries, etiquetaPunto, leerGranularidad, leerSerie, rangoSerie, serieConDatos } from '@/lib/dashboard/serieInicio';
import type { VentasPeriodo } from '@/lib/dashboard/inicio.server';

export type DatosVentas = VentasPeriodo & { unaSucursal: boolean };

/** Canales con nombre propio en `home.ventasPeriodo.canales` (los demás, «Otro canal»). */
export const CANALES_CONOCIDOS: readonly string[] = ['pos', 'web', 'factura', 'mesa'];

export function vistaVentas(d: DatosVentas, locale: string, zona: string) {
  const moneda = monedaUnica(d.monedas, d.moneda_base);
  const neto = Number(d.actual?.neto) || 0;
  const netoAnterior = Number(d.anterior?.neto) || 0;
  const g = leerGranularidad(d.actual?.granularidad);
  const serieActual = leerSerie(d.actual?.serie);
  const serieAnterior = leerSerie(d.anterior?.serie);
  const puntos = compararSeries(serieActual, serieAnterior);
  return {
    moneda,
    neto,
    netoAnterior,
    importe: (v: number) => (moneda ? formatMoneda(v, moneda, { decimals: 0 }) : ''),
    delta: moneda ? variacion(neto, netoAnterior) : null,
    granularidad: g,
    puntos,
    // Con varias monedas la serie mezcla importes: no se dibuja.
    hayGrafica: !!moneda && (serieConDatos(serieActual) || serieConDatos(serieAnterior)),
    rango: rangoSerie(serieActual, g, locale, zona),
    etiqueta: (b: string) => etiquetaPunto(b, g, locale, zona),
  };
}

