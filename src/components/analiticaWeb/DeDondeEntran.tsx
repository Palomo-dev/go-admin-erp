'use client';

/**
 * «De dónde entran» (Figma 464:237485 / 465:241025).
 *
 * Fila 1: coropleta del mundo («Visitantes por país») + tabla «Por país».
 * Fila 2, con un país elegido: si es Colombia, coropleta por departamento
 * (`website_visits.region`) + ciudades; si es otro país, solo sus ciudades.
 * Clic en un departamento filtra la lista de ciudades (no hay coordenadas de
 * ciudad, así que las ciudades siguen como lista).
 *
 * Los mapas se cargan con `next/dynamic` (d3-geo + TopoJSON fuera del bundle
 * del inicio). La tabla es la alternativa accesible y está siempre visible.
 * Estado «sin ubicación» cuando ninguna visita del periodo trae país.
 *
 * La conversión y la venta media POR PAÍS no se muestran: los pedidos web no
 * guardan la sesión de la visita, así que no hay forma honesta de cruzarlos.
 */
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, MapPin, X } from 'lucide-react';
import type { DatosAnalitica } from '@/lib/analiticaWeb/analiticaWeb';
import { sinUbicacion } from '@/lib/analiticaWeb/analiticaWeb';
import { agregarPorPais, agregarPorRegion, filtrarCiudadesPorRegion, nombreRegion } from '@/lib/analiticaWeb/mapa';
import type { FormaDibujada } from './mapas/proyeccion';

function EsqueletoMapa() {
  return <div className="aspect-[2/1] w-full animate-pulse rounded-md bg-subtle" aria-hidden="true" />;
}

const MapaVisitas = dynamic(() => import('./mapas/MapaVisitas').then((m) => m.MapaVisitas), { ssr: false, loading: EsqueletoMapa });

function nombrePais(codigo: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(codigo) ?? codigo;
  } catch {
    return codigo;
  }
}

function Tarjeta({ titulo, detalle, accion, children }: { titulo: string; detalle?: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
        {detalle && <p className="text-xs text-fg-secondary">{detalle}</p>}
        {accion}
      </div>
      {children}
    </section>
  );
}

const claseBoton =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm text-fg hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

interface Props {
  datos: DatosAnalitica;
  cargandoPais: boolean;
  onElegirPais: (pais: string | null) => void;
}

export function DeDondeEntran({ datos, cargandoPais, onElegirPais }: Props) {
  const t = useTranslations('analiticaWeb.geo');
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);
  const valoresPais = useMemo(() => agregarPorPais(datos.paises), [datos.paises]);
  const nombreForma = useMemo(() => (f: FormaDibujada) => (f.codigo ? nombrePais(f.codigo, locale) : f.nombre), [locale]);

  if (sinUbicacion(datos)) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-line-strong bg-subtle p-4" data-testid="sin-ubicacion">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <MapPin className="h-4 w-4 text-brand" aria-hidden="true" />
          {t('sinUbicacionTitulo')}
        </p>
        <p className="text-sm text-fg-secondary">{t('sinUbicacionTexto', { n: datos.visitasSinUbicacionTotal ?? 0 })}</p>
        <p className="text-xs text-fg-secondary">{t('privacidad')}</p>
      </div>
    );
  }

  const max = Math.max(1, ...datos.paises.map((p) => p.visitantes));
  const totalVisitantes = datos.paises.reduce((n, p) => n + p.visitantes, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta titulo={t('mapaMundoTitulo')} detalle={t('resumenPaises', { n: datos.paises.length, v: nf.format(totalVisitantes) })}>
          <MapaVisitas
            tipo="mundo"
            valores={valoresPais}
            nombreDe={nombreForma}
            seleccionado={datos.pais}
            onElegir={onElegirPais}
            etiqueta={t('mapa.mundoAria')}
            testId="mapa-mundo"
          />
        </Tarjeta>

        <Tarjeta titulo={t('porPaisTitulo')}>
          <table className="w-full text-sm">
            <caption className="sr-only">{t('porPaisTitulo')}</caption>
            <thead>
              <tr className="text-left text-xs text-fg-secondary">
                <th scope="col" className="py-1.5 font-medium">{t('pais')}</th>
                <th scope="col" className="py-1.5 text-right font-medium">{t('visitantes')}</th>
                <th scope="col" className="py-1.5 text-right font-medium">{t('sesiones')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {datos.paises.map((p) => {
                const elegido = datos.pais === p.pais;
                return (
                  <tr key={p.pais} className={elegido ? 'bg-brand-tint' : undefined}>
                    <td className="py-2 pr-2">
                      <button
                        type="button"
                        onClick={() => onElegirPais(p.pais)}
                        aria-current={elegido ? 'true' : undefined}
                        className="text-left text-fg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        aria-label={t('verCiudades', { pais: nombrePais(p.pais, locale) })}
                      >
                        {nombrePais(p.pais, locale)}
                      </button>
                      <span className="mt-1 block h-1 rounded-full bg-brand/70" style={{ width: `${Math.max(4, (p.visitantes / max) * 100)}%` }} aria-hidden="true" />
                    </td>
                    <td className="py-2 text-right tabular-nums text-fg">{nf.format(p.visitantes)}</td>
                    <td className="py-2 text-right tabular-nums text-fg-secondary">{nf.format(p.sesiones)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Tarjeta>
      </div>

      {datos.pais && <DetallePais key={datos.pais} datos={datos} pais={datos.pais} cargandoPais={cargandoPais} onVolver={() => onElegirPais(null)} />}

      <p className="text-xs text-fg-secondary">{t('privacidad')}</p>
      <p className="text-xs text-fg-secondary">{t('sinCruceConPedidos')}</p>
    </div>
  );
}

function DetallePais({ datos, pais, cargandoPais, onVolver }: { datos: DatosAnalitica; pais: string; cargandoPais: boolean; onVolver: () => void }) {
  const t = useTranslations('analiticaWeb.geo');
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);
  const [region, setRegion] = useState<string | null>(null);
  const esColombia = pais === 'CO';
  const nombre = nombrePais(pais, locale);
  const { valores: valoresRegion } = useMemo(() => agregarPorRegion(datos.ciudades, pais), [datos.ciudades, pais]);
  const ciudades = filtrarCiudadesPorRegion(datos.ciudades, pais, region);
  const maxC = Math.max(1, ...ciudades.map((c) => c.visitantes));
  const otras = region ? 0 : Math.max(0, datos.ciudadesTotal - datos.ciudades.length);
  const nombreRegionElegida = region ? nombreRegion(pais, region) : null;

  const volver = (
    <button type="button" onClick={onVolver} className={claseBoton}>
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      {t('volver')}
    </button>
  );

  return (
    <div className={`grid grid-cols-1 gap-4 ${esColombia ? 'lg:grid-cols-2' : ''}`} aria-busy={cargandoPais}>
      {esColombia && (
        <Tarjeta titulo={t('porDepartamento', { pais: nombre })} accion={volver}>
          <MapaVisitas
            tipo="colombia"
            valores={valoresRegion}
            seleccionado={region}
            onElegir={(c) => setRegion((previo) => (previo === c ? null : c))}
            etiqueta={t('mapa.colombiaAria', { pais: nombre })}
            testId="mapa-colombia"
          />
          {datos.ciudadesTotal > datos.ciudades.length && (
            <p className="text-xs text-fg-secondary">{t('notaDepartamentos', { n: datos.ciudades.length })}</p>
          )}
        </Tarjeta>
      )}

      <Tarjeta titulo={t('porCiudad', { pais: nombre })} accion={esColombia ? undefined : volver}>
        {nombreRegionElegida && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary" aria-live="polite">
            <span className="font-medium text-fg">{t('filtroRegion', { region: nombreRegionElegida })}</span>
            <button type="button" onClick={() => setRegion(null)} className="inline-flex items-center gap-1 rounded text-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <X className="h-3 w-3" aria-hidden="true" />
              {t('quitarFiltro')}
            </button>
          </p>
        )}
        {ciudades.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('sinCiudades')}</p>
        ) : (
          <table className="w-full text-sm" data-testid="tabla-ciudades">
            <caption className="sr-only">{t('porCiudad', { pais: nombre })}</caption>
            <thead>
              <tr className="text-left text-xs text-fg-secondary">
                <th scope="col" className="py-1.5 font-medium">{t('ciudad')}</th>
                <th scope="col" className="py-1.5 text-right font-medium">{t('visitantes')}</th>
                <th scope="col" className="py-1.5 text-right font-medium">{t('sesiones')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ciudades.map((c) => (
                <tr key={`${c.ciudad}-${c.region ?? ''}`}>
                  <td className="py-2 pr-2">
                    <span className="text-fg">{c.ciudad}</span>
                    {c.region && <span className="ml-1 text-xs text-fg-secondary">{esColombia ? nombreRegion(pais, c.region) : c.region}</span>}
                    <span className="mt-1 block h-1 rounded-full bg-brand/70" style={{ width: `${Math.max(4, (c.visitantes / maxC) * 100)}%` }} aria-hidden="true" />
                  </td>
                  <td className="py-2 text-right tabular-nums text-fg">{nf.format(c.visitantes)}</td>
                  <td className="py-2 text-right tabular-nums text-fg-secondary">{nf.format(c.sesiones)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {otras > 0 && <p className="text-xs text-fg-secondary">{t('otrasCiudades', { n: otras })}</p>}
      </Tarjeta>
    </div>
  );
}
