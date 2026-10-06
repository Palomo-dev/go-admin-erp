'use client';

/**
 * «De dónde entran» (Figma 464:237485 / 465:241025).
 *
 * Fila 1: coropleta del mundo («Visitantes por país») + tabla «Por país».
 * Fila 2, con un país elegido: si es Colombia, coropleta por departamento
 * (`website_visits.region`: clave `regiones` de la RPC, o agregado desde las
 * ciudades si la base aún no la trae) + ciudades; si es otro país, solo sus
 * ciudades.
 * Clic en un departamento filtra la lista de ciudades (no hay coordenadas de
 * ciudad, así que las ciudades siguen como lista). Con la clave
 * `ciudades_region` de la RPC, el filtro incluye las primeras ciudades del
 * departamento aunque no estén en el top del país; sin ella, filtra solo
 * `ciudades`. La tabla pagina de a 20 (`PaginationCompact` del kit): la RPC
 * trae hasta 500 ciudades.
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
import type { LucideIcon } from 'lucide-react';
import { PaginationCompact, SegmentedControl, Tarjeta as TarjetaKit, calcularRango, clasesBoton, useEsEscritorio } from '@/components/kit';
import { useTextosSeoAnalitica } from '@/components/sitio-web/seoanalitica/textos';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '@/components/sitio-web/ui/iconosSitio';
import { ICONO_GEO_ANALITICA } from './iconosAnalitica';
import type { DatosAnalitica } from '@/lib/analiticaWeb/analiticaWeb';
import { sinUbicacion } from '@/lib/analiticaWeb/analiticaWeb';
import { CIUDADES_POR_PAGINA, agregarPorPais, ciudadesParaTabla, nombreRegion, valoresRegionMapa } from '@/lib/analiticaWeb/mapa';
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

/** Tarjeta del kit (rounded-xl, borde de token) con el detalle a la derecha del título. */
function Tarjeta({ titulo, icono, detalle, accion, children }: { titulo: string; icono: LucideIcon; detalle?: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <TarjetaKit
      titulo={titulo}
      icono={icono}
      className="min-w-0"
      accion={
        detalle || accion ? (
          <>
            {detalle && <p className="text-xs text-fg-muted">{detalle}</p>}
            {accion}
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">{children}</div>
    </TarjetaKit>
  );
}

const claseBoton = clasesBoton({ variante: 'secundario', tamano: 'sm' });

interface Props {
  datos: DatosAnalitica;
  cargandoPais: boolean;
  onElegirPais: (pais: string | null) => void;
}

export function DeDondeEntran({ datos, cargandoPais, onElegirPais }: Props) {
  const t = useTranslations('analiticaWeb.geo');
  const ts = useTextosSeoAnalitica();
  const escritorio = useEsEscritorio();
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);
  const valoresPais = useMemo(() => agregarPorPais(datos.paises), [datos.paises]);
  const nombreForma = useMemo(() => (f: FormaDibujada) => (f.codigo ? nombrePais(f.codigo, locale) : f.nombre), [locale]);

  if (sinUbicacion(datos)) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line-strong bg-subtle p-4" data-testid="sin-ubicacion">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <ICONO_GEO_ANALITICA.sinUbicacion className={`${CLASE_TAMANO_ICONO.base} shrink-0 text-fg-secondary`} strokeWidth={TRAZO_ICONO} aria-hidden="true" />
          {t('sinUbicacionTitulo')}
        </p>
        <p className="text-sm text-fg-secondary">{t('sinUbicacionTexto', { n: datos.visitasSinUbicacionTotal ?? 0 })}</p>
        <p className="text-xs text-fg-secondary">{t('privacidad')}</p>
      </div>
    );
  }

  const max = Math.max(1, ...datos.paises.map((p) => p.visitantes));
  const totalVisitantes = datos.paises.reduce((n, p) => n + p.visitantes, 0);

  if (!escritorio) {
    // Móvil (Figma B/09-02): Mundo / Colombia, el mapa y la lista de países.
    const vista = datos.pais === 'CO' ? 'colombia' : 'mundo';
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <SegmentedControl<'mundo' | 'colombia'>
          opciones={[
            { valor: 'mundo', etiqueta: ts('analitica.geo.mundo') },
            { valor: 'colombia', etiqueta: ts('analitica.geo.colombia') },
          ]}
          valor={vista}
          onValorChange={(v) => onElegirPais(v === 'colombia' ? 'CO' : null)}
          etiqueta={t('titulo')}
          tamano="sm"
        />
        {vista === 'mundo' ? (
          <>
            <MapaVisitas tipo="mundo" valores={valoresPais} nombreDe={nombreForma} seleccionado={datos.pais} onElegir={onElegirPais} etiqueta={t('mapa.mundoAria')} testId="mapa-mundo" />
            <ul className="flex flex-col divide-y divide-line">
              {datos.paises.map((p) => (
                <li key={p.pais}>
                  <button
                    type="button"
                    onClick={() => onElegirPais(p.pais)}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-fg">{nombrePais(p.pais, locale)}</span>
                      <span className="truncate text-xs text-fg-secondary">{ts('analitica.geo.filaPais', { sesiones: nf.format(p.sesiones) })}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-fg">{nf.format(p.visitantes)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {datos.paises.some((p) => p.pais === 'CO') && (
              <button type="button" onClick={() => onElegirPais('CO')} className={clasesBoton({ variante: 'secundario', tamano: 'md' }) + ' w-full'}>
                {ts('analitica.geo.verColombia')}
              </button>
            )}
          </>
        ) : (
          <DetallePais key="CO" datos={datos} pais="CO" cargandoPais={cargandoPais} onVolver={() => onElegirPais(null)} />
        )}
        <p className="text-xs text-fg-muted">{t('privacidad')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta titulo={t('mapaMundoTitulo')} icono={ICONO_GEO_ANALITICA.mundo} detalle={t('resumenPaises', { n: datos.paises.length, v: nf.format(totalVisitantes) })}>
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

        <Tarjeta titulo={t('porPaisTitulo')} icono={ICONO_GEO_ANALITICA.pais}>
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

      <p className="text-xs text-fg-muted">{t('sinCruceConPedidos')}</p>
    </div>
  );
}

function DetallePais({ datos, pais, cargandoPais, onVolver }: { datos: DatosAnalitica; pais: string; cargandoPais: boolean; onVolver: () => void }) {
  const t = useTranslations('analiticaWeb.geo');
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);
  const [region, setRegionEstado] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const setRegion = (siguiente: string | null | ((previo: string | null) => string | null)) => {
    setRegionEstado(siguiente);
    setPagina(1);
  };
  const esColombia = pais === 'CO';
  const nombre = nombrePais(pais, locale);
  // `regiones` de la RPC si viene; si no, agregado desde las 50 ciudades (cota inferior).
  const { valores: valoresRegion, parcial: regionesParciales } = useMemo(
    () => valoresRegionMapa(datos, pais),
    [datos, pais],
  );
  const { ciudades, otras } = useMemo(() => ciudadesParaTabla(datos, pais, region), [datos, pais, region]);
  const maxC = ciudades.reduce((m, c) => Math.max(m, c.visitantes), 1);
  const rango = calcularRango(pagina, CIUDADES_POR_PAGINA, ciudades.length);
  const visibles = ciudades.slice(rango.desde - 1, rango.hasta);
  const nombreRegionElegida = region ? nombreRegion(pais, region) : null;

  const volver = (
    <button type="button" onClick={onVolver} className={claseBoton}>
      <ICONO_GEO_ANALITICA.volver className={`${CLASE_TAMANO_ICONO.base} shrink-0`} strokeWidth={TRAZO_ICONO} aria-hidden="true" />
      {t('volver')}
    </button>
  );

  return (
    <div className={`grid grid-cols-1 gap-4 ${esColombia ? 'lg:grid-cols-2' : ''}`} aria-busy={cargandoPais}>
      {esColombia && (
        <Tarjeta titulo={t('porDepartamento', { pais: nombre })} icono={ICONO_GEO_ANALITICA.region} accion={volver}>
          <MapaVisitas
            tipo="colombia"
            valores={valoresRegion}
            seleccionado={region}
            onElegir={(c) => setRegion((previo) => (previo === c ? null : c))}
            etiqueta={t('mapa.colombiaAria', { pais: nombre })}
            testId="mapa-colombia"
          />
          {regionesParciales && (
            <p className="text-xs text-fg-secondary">{t('notaDepartamentos', { n: datos.ciudades.length })}</p>
          )}
        </Tarjeta>
      )}

      <Tarjeta titulo={t('porCiudad', { pais: nombre })} icono={ICONO_GEO_ANALITICA.ciudad} accion={esColombia ? undefined : volver}>
        {nombreRegionElegida && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary" aria-live="polite">
            <span className="font-medium text-fg">{t('filtroRegion', { region: nombreRegionElegida })}</span>
            <button type="button" onClick={() => setRegion(null)} className="inline-flex items-center gap-1 rounded text-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <ICONO_GEO_ANALITICA.quitarFiltro className={`${CLASE_TAMANO_ICONO.meta} shrink-0`} strokeWidth={TRAZO_ICONO} aria-hidden="true" />
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
              {visibles.map((c) => (
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
        {ciudades.length > CIUDADES_POR_PAGINA && (
          <PaginationCompact pagina={rango.pagina} tamano={CIUDADES_POR_PAGINA} total={ciudades.length} onPaginaChange={setPagina} />
        )}
        {otras > 0 && <p className="text-xs text-fg-secondary">{t('otrasCiudades', { n: otras })}</p>}
      </Tarjeta>
    </div>
  );
}
