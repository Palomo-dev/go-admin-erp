'use client';

/**
 * «Mis envíos» — la ruta del domiciliario en el celular (Figma 2801:3939, 390 px).
 *
 * Resumen de la ruta, pestañas Pendientes / Entregados / Novedades y una tarjeta por parada con
 * llamar y cómo llegar. Tocar la tarjeta abre la parada; «Terminar jornada y cuadrar» lleva al
 * fin de jornada. Solo lee: lo que cambia estado o dinero se hace en la parada, con las RPC.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bike, PackageCheck, RefreshCw, Route } from 'lucide-react';
import { ChipsOpcion, EmptyState, PageHeader, Skeleton, StatusBadge, clasesBoton } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useBranch } from '@/lib/context/BranchContext';
import { agruparMisEnvios, resumenRuta, type PestanaMisEnvios } from '@/lib/logistica/misEnvios';
import { nombreDomiciliario } from '@/lib/logistica/domiciliarios';
import type { EnvioApp } from '@/lib/services/logistica/misEnviosService';
import { useMiRuta } from './useMiRuta';
import { BarraInferior, BotonesRapidos, ChipCobro, ChipPromesa, InsigniaEstadoApp, enlacesDe } from './piezas';
import { RUTA_FIN_JORNADA, rutaParada } from './rutas';

export function MisEnviosPantalla() {
  const t = useTranslations('logistica.misEnvios');
  const router = useRouter();
  const locale = useLocaleIntl();
  const moneda = useMonedaOrganizacion();
  const { branches } = useBranch();
  const { driver, envios, estado, recargar, hoy, zonaDe } = useMiRuta();
  const [pestana, setPestana] = useState<PestanaMisEnvios>('pendientes');
  const [ahora, setAhora] = useState(() => new Date());

  // La promesa («+18 min») se mueve sola cada minuto.
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const grupos = useMemo(() => agruparMisEnvios(envios, hoy, zonaDe), [envios, hoy, zonaDe]);
  const resumen = useMemo(() => resumenRuta(grupos, envios), [grupos, envios]);
  const lista = grupos[pestana];

  const nombre = driver ? nombreDomiciliario(driver) : '';
  const sede = driver ? branches.find((b) => b.id === (driver as { branch_id?: number | null }).branch_id)?.name : null;
  const fecha = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${hoy}T12:00:00Z`),
  );
  const subtitulo = [t('hoy', { fecha }), sede, nombre].filter(Boolean).join(' · ');

  if (estado === 'sin_domiciliario') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
        <PageHeader titulo={t('titulo')} icono={Route} />
        <EmptyState variante="forbidden" compacto icono={Bike} titulo={t('sinDomiciliario.titulo')} descripcion={t('sinDomiciliario.descripcion')} />
      </div>
    );
  }
  if (estado === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
        <PageHeader titulo={t('titulo')} icono={Route} />
        <EmptyState variante="error" compacto titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={recargar} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={Route}
        cargando={estado === 'cargando'}
        acciones={
          <button type="button" onClick={recargar} className={clasesBoton({ variante: 'secundario' })} aria-label={t('recargar')}>
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
        }
        movil={{
          subtitulo,
          accion: (
            <button
              type="button"
              onClick={recargar}
              aria-label={t('recargar')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <RefreshCw aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          ),
        }}
      />

      {estado === 'cargando' ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <section aria-label={t('ruta.etiqueta')} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-medium text-fg">
                {resumen.estado === 'vacia' ? t('ruta.vacia') : resumen.estado === 'terminada' ? t('ruta.terminada') : t('ruta.parada', { n: resumen.parada, total: resumen.totalParadas })}
              </h2>
              {resumen.estado !== 'vacia' && (
                <StatusBadge
                  estado={resumen.estado}
                  etiqueta={t(`ruta.estados.${resumen.estado}`)}
                  tono={resumen.estado === 'en_ruta' ? 'informacion' : resumen.estado === 'terminada' ? 'exito' : 'neutro'}
                  apariencia="contorno"
                />
              )}
            </div>
            <dl className="grid grid-cols-4 gap-2">
              <Cifra etiqueta={t('ruta.porEntregar')} valor={String(resumen.porEntregar)} />
              <Cifra etiqueta={t('ruta.entregados')} valor={String(resumen.entregados)} clase="text-success-text" />
              <Cifra etiqueta={t('ruta.aCobrar')} valor={moneda.formatear(resumen.aCobrar)} clase={resumen.aCobrar > 0 ? 'text-warning-text' : undefined} />
              <Cifra etiqueta={t('ruta.enMano')} valor={moneda.formatear(resumen.enMano)} />
            </dl>
          </section>

          <ChipsOpcion<PestanaMisEnvios>
            etiqueta={t('pestanas.etiqueta')}
            valor={pestana}
            onValorChange={setPestana}
            opciones={(['pendientes', 'entregados', 'novedades'] as const).map((p) => ({ valor: p, etiqueta: t(`pestanas.${p}`, { n: grupos[p].length }) }))}
          />

          {lista.length === 0 ? (
            <EmptyState variante="empty" compacto icono={PackageCheck} titulo={t(`vacio.${pestana}.titulo`)} descripcion={t(`vacio.${pestana}.descripcion`)} />
          ) : (
            <ol className="flex flex-col gap-3">
              {lista.map((e, i) => (
                <TarjetaParada
                  key={e.id}
                  envio={e}
                  numero={pestana === 'pendientes' ? i + 1 : null}
                  zona={zonaDe(e)}
                  ahora={ahora}
                  onAbrir={() => router.push(rutaParada(e.id))}
                />
              ))}
            </ol>
          )}

          <BarraInferior>
            <Link href={RUTA_FIN_JORNADA} className={clasesBoton({ variante: 'secundario', tamano: 'lg', anchoCompleto: true })}>
              {t('terminarJornada')}
            </Link>
          </BarraInferior>
        </>
      )}
      <span className="sr-only" aria-live="polite">
        {estado === 'listo' ? t('ruta.anuncio', { n: resumen.porEntregar }) : ''}
      </span>
    </div>
  );
}

function Cifra({ etiqueta, valor, clase }: { etiqueta: string; valor: string; clase?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="truncate text-xs text-fg-secondary">{etiqueta}</dt>
      <dd className={`truncate text-[15px] font-semibold text-fg ${clase ?? ''}`}>{valor}</dd>
    </div>
  );
}

function TarjetaParada({ envio, numero, zona, ahora, onAbrir }: { envio: EnvioApp; numero: number | null; zona: string; ahora: Date; onAbrir: () => void }) {
  const t = useTranslations('logistica.misEnvios');
  const nombre = envio.delivery_contact_name || envio.customer?.full_name || t('cliente');
  const enlaces = enlacesDe(envio);
  const destacada = envio.status === 'out_for_delivery';
  const intento = (envio.failed_attempts ?? 0) > 0 && envio.status !== 'delivered' ? (envio.failed_attempts ?? 0) + 1 : null;

  return (
    <li>
      <div
        role="link"
        tabIndex={0}
        onClick={onAbrir}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onAbrir();
          }
        }}
        aria-label={t('tarjeta.abrir', { numero: envio.shipment_number, nombre })}
        className={`flex cursor-pointer flex-col gap-2 rounded-xl border bg-surface p-4 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          destacada ? 'border-line-brand shadow-sm' : 'border-line'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            {numero != null && (
              <span
                aria-hidden="true"
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${destacada ? 'bg-brand-action text-fg-on-brand' : 'bg-subtle text-fg-secondary'}`}
              >
                {numero}
              </span>
            )}
            <span className="truncate text-[15px] font-medium text-fg">{envio.shipment_number}</span>
          </span>
          <InsigniaEstadoApp estado={String(envio.status)} />
        </div>
        <p className="text-lg font-semibold leading-snug text-fg">{envio.delivery_address || t('sinDireccion')}</p>
        <p className="text-sm text-fg-secondary">{[envio.delivery_city, nombre].filter(Boolean).join(' · ')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ChipPromesa envio={envio} zona={zona} ahora={ahora} />
          {intento && (
            <span className="inline-flex items-center rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning-text">{t('tarjeta.intento', { n: intento })}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <ChipCobro envio={envio} />
          <BotonesRapidos enlaces={enlaces} nombre={nombre} />
        </div>
      </div>
    </li>
  );
}
