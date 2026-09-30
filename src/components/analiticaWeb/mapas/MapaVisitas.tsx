'use client';

/**
 * Carga la geometría (import diferido), la proyecta y pinta la coropleta.
 * `DeDondeEntran` importa este archivo con `next/dynamic`: d3-geo,
 * topojson-client y los TopoJSON quedan fuera del bundle del inicio.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cargarColombia, cargarMundo } from './geometrias';
import { LIENZO_COLOMBIA, LIENZO_MUNDO, dibujarColombia, dibujarMundo, type FormaDibujada, type Recuadro } from './proyeccion';
import { MapaCoropletico, type MapaCoropleticoProps } from './MapaCoropletico';

type Tipo = 'mundo' | 'colombia';

interface Dibujo {
  formas: FormaDibujada[];
  recuadro: Recuadro | null;
}

const cache = new Map<Tipo, Dibujo>();

async function dibujo(tipo: Tipo): Promise<Dibujo> {
  const previo = cache.get(tipo);
  if (previo) return previo;
  const nuevo: Dibujo = tipo === 'mundo' ? { formas: dibujarMundo(await cargarMundo()), recuadro: null } : dibujarColombia(await cargarColombia());
  cache.set(tipo, nuevo);
  return nuevo;
}

export type MapaVisitasProps = Omit<MapaCoropleticoProps, 'formas' | 'ancho' | 'alto' | 'recuadro'> & { tipo: Tipo };

export function MapaVisitas({ tipo, ...resto }: MapaVisitasProps) {
  const t = useTranslations('analiticaWeb.geo.mapa');
  const [estado, setEstado] = useState<Dibujo | 'cargando' | 'error'>(() => cache.get(tipo) ?? 'cargando');

  useEffect(() => {
    let vivo = true;
    const listo = cache.get(tipo);
    if (listo) {
      setEstado(listo);
      return;
    }
    setEstado('cargando');
    dibujo(tipo).then(
      (d) => vivo && setEstado(d),
      () => vivo && setEstado('error'),
    );
    return () => {
      vivo = false;
    };
  }, [tipo]);

  const lienzo = tipo === 'mundo' ? LIENZO_MUNDO : LIENZO_COLOMBIA;

  if (estado === 'error') {
    return <p className="rounded-md border border-dashed border-line-strong bg-subtle p-3 text-xs text-fg-secondary">{t('error')}</p>;
  }
  if (estado === 'cargando') {
    return (
      <div role="status" className="w-full animate-pulse rounded-md bg-subtle" style={{ aspectRatio: `${lienzo.ancho} / ${lienzo.alto}` }}>
        <span className="sr-only">{t('cargando')}</span>
      </div>
    );
  }
  return <MapaCoropletico {...resto} formas={estado.formas} recuadro={estado.recuadro} ancho={lienzo.ancho} alto={lienzo.alto} />;
}
