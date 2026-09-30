'use client';

/**
 * «De dónde entran» (Figma 464:237485 / 465:241025): países del periodo y, al
 * elegir uno, sus ciudades. Estado «sin ubicación» cuando ninguna visita del
 * periodo trae país (las anteriores a la geolocalización no se recuperan).
 *
 * Decisión al pasar a código: el mapa del diseño (topojson del mundo y de
 * Colombia) se sustituye por la tabla con barra de intensidad: no hay datos
 * geográficos en el repo y la tabla dice lo mismo, accesible y en móvil. La
 * conversión y la venta media POR PAÍS no se muestran: los pedidos web no
 * guardan la sesión de la visita, así que no hay forma honesta de cruzarlos.
 */
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, MapPin } from 'lucide-react';
import type { DatosAnalitica } from '@/lib/analiticaWeb/analiticaWeb';
import { sinUbicacion } from '@/lib/analiticaWeb/analiticaWeb';

function nombrePais(codigo: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(codigo) ?? codigo;
  } catch {
    return codigo;
  }
}

interface Props {
  datos: DatosAnalitica;
  cargandoPais: boolean;
  onElegirPais: (pais: string | null) => void;
}

export function DeDondeEntran({ datos, cargandoPais, onElegirPais }: Props) {
  const t = useTranslations('analiticaWeb.geo');
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);

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

  if (datos.pais) {
    const nombre = nombrePais(datos.pais, locale);
    const maxC = Math.max(1, ...datos.ciudades.map((c) => c.visitantes));
    const otras = Math.max(0, datos.ciudadesTotal - datos.ciudades.length);
    return (
      <div className="flex flex-col gap-3" aria-busy={cargandoPais}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('porCiudad', { pais: nombre })}</h3>
          <button
            type="button"
            onClick={() => onElegirPais(null)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm text-fg hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t('volver')}
          </button>
        </div>
        {datos.ciudades.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('sinCiudades')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-secondary">
                <th scope="col" className="py-1.5 font-medium">{t('ciudad')}</th>
                <th scope="col" className="py-1.5 text-right font-medium">{t('visitantes')}</th>
                <th scope="col" className="py-1.5 text-right font-medium">{t('sesiones')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {datos.ciudades.map((c) => (
                <tr key={`${c.ciudad}-${c.region ?? ''}`}>
                  <td className="py-2 pr-2">
                    <span className="text-fg">{c.ciudad}</span>
                    {c.region && <span className="ml-1 text-xs text-fg-secondary">{c.region}</span>}
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-fg-secondary">
        {t('resumenPaises', { n: datos.paises.length, v: nf.format(totalVisitantes) })}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-fg-secondary">
            <th scope="col" className="py-1.5 font-medium">{t('pais')}</th>
            <th scope="col" className="py-1.5 text-right font-medium">{t('visitantes')}</th>
            <th scope="col" className="py-1.5 text-right font-medium">{t('sesiones')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {datos.paises.map((p) => (
            <tr key={p.pais}>
              <td className="py-2 pr-2">
                <button
                  type="button"
                  onClick={() => onElegirPais(p.pais)}
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
          ))}
        </tbody>
      </table>
      <p className="text-xs text-fg-secondary">{t('privacidad')}</p>
      <p className="text-xs text-fg-secondary">{t('sinCruceConPedidos')}</p>
    </div>
  );
}
