'use client';

/**
 * `MapaRuta` cargado solo en el navegador (Leaflet usa `window`) y fuera del paquete inicial de la
 * app del domiciliario: el mapa llega cuando se abre, no con la lista.
 */
import dynamic from 'next/dynamic';
import type { MapaRutaProps } from './MapaRuta';

const MapaRuta = dynamic(() => import('./MapaRuta'), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="size-full min-h-40 animate-pulse bg-subtle" />,
});

export function MapaRutaDinamico(props: MapaRutaProps) {
  return <MapaRuta {...props} />;
}
