'use client';

/**
 * Panel «Conteo en vivo» del constructor de segmentos (Figma CRM 1384:825677;
 * «conteo no disponible» 1388:1979): coincidencias sobre la base, desglose por
 * canal (con `fn_can_contact`, la misma puerta del envío) y una muestra.
 * Cuando el servidor no puede contar a tiempo lo dice y deja guardar.
 */

import { useTranslations } from 'next-intl';
import { Loader2, RefreshCw } from 'lucide-react';
import { Tarjeta } from '@/components/kit/Tarjeta';
import { FilaDato, ListaDatos } from '@/components/kit/FilaDato';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { ConteoEnVivo } from './useConteoSegmento';
import { porcentajeDeBase } from './conteoSegmentoLogica';

export function ConteoEnVivoSegmento({ estado, conteo, reintentar }: ConteoEnVivo) {
  const t = useTranslations('crm.segmentos.constructor.conteo');
  const entero = useFormatoEntero();
  const { formatTime } = useFormatDate();
  const d = conteo?.desglose ?? null;
  const aprox = (n: number) => (d?.estimado ? `≈ ${entero(n)}` : entero(n));
  const viejo = estado !== 'listo' && conteo !== null;

  return (
    <Tarjeta titulo={t('titulo')} accion={estado === 'contando' ? <Loader2 aria-label={t('contando')} className="size-4 animate-spin text-fg-secondary" /> : conteo ? <span className="text-xs text-fg-secondary">{t('actualizado', { hora: formatTime(conteo.calculado_en) })}</span> : undefined}>
      <div className="space-y-4" aria-live="polite" aria-busy={estado === 'contando'}>
        {(estado === 'tardio' || estado === 'noDisponible' || estado === 'error') && (
          <AvisoTonal
            tono={estado === 'error' ? 'peligro' : 'advertencia'}
            compacto
            titulo={t(`estados.${estado}.titulo`)}
            descripcion={t(`estados.${estado}.descripcion`)}
            accion={estado === 'noDisponible' ? undefined : { etiqueta: t('reintentar'), onClick: reintentar }}
          />
        )}
        {estado === 'invalido' && <AvisoTonal tono="advertencia" compacto titulo={t('estados.invalido.titulo')} descripcion={t('estados.invalido.descripcion')} />}
        {estado === 'sinPermiso' && <AvisoTonal tono="advertencia" compacto titulo={t('estados.sinPermiso.titulo')} descripcion={t('estados.sinPermiso.descripcion')} />}

        {conteo ? (
          <div className={viejo ? 'opacity-60' : undefined}>
            <p className="text-xs font-medium uppercase tracking-wide text-fg-secondary">{t('coinciden')}</p>
            <p className="text-2xl font-semibold tabular-nums text-fg">{t('clientes', { n: conteo.coinciden, valor: entero(conteo.coinciden) })}</p>
            <p className="text-[13px] text-fg-secondary">{t('deBase', { base: entero(conteo.base), pct: porcentajeDeBase(conteo.coinciden, conteo.base) })}</p>

            <h4 className="mt-4 text-sm font-semibold text-fg">{t('desglose.titulo')}</h4>
            {d ? (
              <>
                <ListaDatos etiqueta={t('desglose.titulo')}>
                  <FilaDato etiqueta={t('desglose.telefono')} valor={aprox(d.telefono)} />
                  <FilaDato etiqueta={t('desglose.noLlamar')} valor={aprox(d.no_llamar)} tono={d.no_llamar > 0 ? 'advertencia' : undefined} />
                  <FilaDato etiqueta={t('desglose.correo')} valor={aprox(d.correo)} />
                  <FilaDato etiqueta={t('desglose.whatsapp')} valor={aprox(d.whatsapp)} />
                </ListaDatos>
                {d.estimado && <p className="mt-1 text-xs text-fg-muted">{t('desglose.estimado', { n: entero(d.sobre) })}</p>}
              </>
            ) : (
              <p className="text-[13px] text-fg-secondary">{t('desglose.sinDato')}</p>
            )}

            <h4 className="mt-4 text-sm font-semibold text-fg">{t('muestra')}</h4>
            {conteo.muestra.length === 0 ? (
              <p className="text-[13px] text-fg-secondary">{t('sinMuestra')}</p>
            ) : (
              <ul className="mt-1 space-y-1 text-[13px] text-fg">
                {conteo.muestra.map((m) => (
                  <li key={m.id} className="truncate">
                    {[m.empresa, m.nombre].filter(Boolean).join(' · ') || t('sinNombre')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : estado === 'contando' ? (
          <div className="space-y-2" aria-hidden="true">
            <div className="h-8 w-40 animate-pulse rounded bg-subtle" />
            <div className="h-4 w-56 animate-pulse rounded bg-subtle" />
            <div className="h-24 animate-pulse rounded bg-subtle" />
          </div>
        ) : null}

        {estado === 'listo' && (
          <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={reintentar}>
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('reintentar')}
          </button>
        )}
      </div>
    </Tarjeta>
  );
}
