'use client';

/**
 * «Mis envíos» — la ruta del domiciliario (Figma 2801:3939 y «01 Mi ruta del día», 3231-16576).
 *
 * Resumen de la ruta, pestañas Pendientes / Entregados / Novedades y una tarjeta por parada con
 * llamar y cómo llegar (`TarjetaParada`, la misma pieza del mapa y de «Entrega confirmada").
 * Tocar la tarjeta abre la parada; «Terminar jornada y cuadrar» lleva al fin de jornada. Solo lee:
 * lo que cambia estado o dinero se hace en la parada, con las RPC.
 *
 * Sin señal: franja con la hora de la última carga y aviso de que entregar, cobrar y registrar
 * novedades queda en pausa (decisión 2026-11-25). Sin perfil de domiciliario: `SinPerfil` (b1/b2).
 *
 * Desde 1024 px se arma ancha (`VistaRutaEscritorio`: cifras, tabla, mapa, vehículo y dinero) con
 * los mismos datos; en el celular, «Ver mapa de la ruta» y «Mi vehículo hoy» llevan a sus páginas.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CircleCheck, Eye, MapPin, Navigation, PackageCheck, RefreshCw, Route, Wallet } from 'lucide-react';
import { ChipsOpcion, EmptyState, PageHeader, Skeleton, StatusBadge, clasesBoton, useEsEscritorio } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useBranch } from '@/lib/context/BranchContext';
import {
  agruparMisEnvios,
  estadoDelPaso,
  numeroParada,
  puedeReportarNovedad,
  resumenRuta,
  siguientePaso,
  type PestanaMisEnvios,
} from '@/lib/logistica/misEnvios';
import { nombreDomiciliario } from '@/lib/logistica/domiciliarios';
import type { EnvioApp } from '@/lib/services/logistica/misEnviosService';
import { useMiRuta, useUltimoCuadre } from './useMiRuta';
import { useEnLinea } from './useEnLinea';
import { useAvanzarParada } from './useAvanzarParada';
import { useMiVehiculo } from './useMiVehiculo';
import { TarjetaParada } from './TarjetaParada';
import { SinPerfil } from './SinPerfil';
import { HojaNovedad } from './HojaNovedad';
import { FilaVehiculoHoy } from './PiezasVehiculo';
import { VistaRutaEscritorio } from './VistaRutaEscritorio';
import { AvisoPausaSinConexion, BarraInferior, FranjaSinConexion } from './piezas';
import { RUTA_FIN_JORNADA, RUTA_MAPA_RUTA, RUTA_MI_VEHICULO, rutaEntregar, rutaParada } from './rutas';

export function MisEnviosPantalla() {
  const t = useTranslations('logistica.misEnvios');
  const router = useRouter();
  const locale = useLocaleIntl();
  const moneda = useMonedaOrganizacion();
  const { branches, branchFilter } = useBranch();
  const { orgId, driver, envios, estado, recargar, hoy, timezone, zonaDe, actualizadoEn } = useMiRuta();
  const enLinea = useEnLinea();
  const escritorio = useEsEscritorio();
  const vehiculo = useMiVehiculo({ orgId, driver, envios, hoy, zonaDe });
  const ultimoCuadre = useUltimoCuadre(orgId, driver?.id ?? null, hoy, timezone, escritorio);
  const { avanzar, ocupadoId } = useAvanzarParada();
  const [novedad, setNovedad] = useState<EnvioApp | null>(null);
  const [pestana, setPestana] = useState<PestanaMisEnvios>('pendientes');
  const [ahora, setAhora] = useState(() => new Date());

  // La promesa («+18 min») se mueve sola cada minuto.
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Al volver la señal (de sin conexión a con conexión), la ruta se vuelve a leer.
  const conexionAnterior = useRef(enLinea);
  useEffect(() => {
    if (enLinea && !conexionAnterior.current) recargar();
    conexionAnterior.current = enLinea;
  }, [enLinea, recargar]);

  const grupos = useMemo(() => agruparMisEnvios(envios, hoy, zonaDe), [envios, hoy, zonaDe]);
  const resumen = useMemo(() => resumenRuta(grupos, envios), [grupos, envios]);
  const lista = grupos[pestana];

  const nombre = driver ? nombreDomiciliario(driver) : '';
  const sede = driver ? branches.find((b) => b.id === (driver as { branch_id?: number | null }).branch_id)?.name : null;
  const fecha = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${hoy}T12:00:00Z`),
  );
  const horaCarga = actualizadoEn ? new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(actualizadoEn) : null;
  const subtitulo = [t('hoy', { fecha }), !enLinea && horaCarga ? t('actualizado', { hora: horaCarga }) : sede, enLinea ? nombre : null]
    .filter(Boolean)
    .join(' · ');

  if (estado === 'sin_domiciliario') {
    const sedeCabecera = branchFilter != null ? branches.find((b) => b.id === branchFilter)?.name ?? null : null;
    return <SinPerfil sede={sedeCabecera} onRegistrado={() => window.location.reload()} />;
  }
  if (escritorio && estado !== 'error') {
    const placa = vehiculo.vehiculo?.plate;
    const tipoPlaca = placa ? t('escritorio.vehiculoCorto', { placa }) : null;
    const accionesFila = (e: EnvioApp) => {
      const paso = siguientePaso(String(e.status));
      const deOtroDia = e.status === 'failed_attempt' && !!e.expected_delivery_date && e.expected_delivery_date > hoy;
      const novedadBoton = puedeReportarNovedad(String(e.status)) && !deOtroDia && (
        <button type="button" disabled={!enLinea} onClick={() => setNovedad(e)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
          <AlertTriangle aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('escritorio.acciones.novedad')}
        </button>
      );
      if (e.status === 'delivered' || deOtroDia || !paso) {
        return (
          <button type="button" onClick={() => router.push(rutaParada(e.id))} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {e.status === 'delivered' ? t('escritorio.acciones.verEntrega') : t('escritorio.acciones.verNovedad')}
          </button>
        );
      }
      if (paso === 'entregar') {
        return (
          <>
            {enLinea ? (
              <Link href={rutaEntregar(e.id)} className={clasesBoton({ tamano: 'sm' })}>
                <CircleCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('pasos.boton.entregar')}
              </Link>
            ) : (
              <button type="button" disabled className={clasesBoton({ tamano: 'sm' })}>
                {t('pasos.boton.entregar')}
              </button>
            )}
            {novedadBoton}
          </>
        );
      }
      const destino = estadoDelPaso(paso);
      return (
        <>
          <button
            type="button"
            disabled={!enLinea || ocupadoId !== null}
            aria-busy={ocupadoId === e.id}
            onClick={async () => {
              if (destino && (await avanzar(e, destino))) recargar();
            }}
            className={clasesBoton({ variante: paso === 'recoger' ? 'secundario' : 'primario', tamano: 'sm' })}
          >
            {paso === 'recoger' ? <PackageCheck aria-hidden="true" className="size-4" strokeWidth={1.5} /> : <Navigation aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {ocupadoId === e.id ? t('guardando') : t(`pasos.boton.${paso}`)}
          </button>
          {novedadBoton}
        </>
      );
    };
    const sedeRuta = driver ? branches.find((b) => b.id === (driver as { branch_id?: number | null }).branch_id) : null;
    return (
      <>
        <VistaRutaEscritorio
          envios={envios}
          cargando={estado === 'cargando'}
          hoy={hoy}
          zonaDe={zonaDe}
          subtitulo={[t('hoy', { fecha }), sede, nombre, tipoPlaca].filter(Boolean).join(' · ')}
          acciones={
            <>
              <button type="button" onClick={recargar} className={clasesBoton({ variante: 'secundario' })} aria-label={t('recargar')}>
                <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
              {enLinea ? (
                <Link href={RUTA_FIN_JORNADA} className={clasesBoton({ variante: 'primario' })}>
                  <Wallet aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('terminarJornada')}
                </Link>
              ) : (
                <button type="button" disabled className={clasesBoton({ variante: 'primario' })}>
                  {t('terminarJornada')}
                </button>
              )}
            </>
          }
          encima={!enLinea ? <FranjaSinConexion actualizadoEn={actualizadoEn} zona={timezone} /> : undefined}
          accionesFila={accionesFila}
          onAbrir={(e) => router.push(rutaParada(e.id))}
          vehiculo={vehiculo}
          textos={{
            vehiculo: t('escritorio.miVehiculo'),
            dinero: t('escritorio.dineroDeHoy'),
            notaDinero: t('escritorio.notaDinero'),
            notaTabla: t('escritorio.notaTabla'),
          }}
          enlaceVehiculo={{ href: RUTA_MI_VEHICULO, texto: t('escritorio.verVehiculo') }}
          ultimoCuadre={ultimoCuadre}
          origen={sedeRuta?.latitude != null && sedeRuta?.longitude != null ? { lat: Number(sedeRuta.latitude), lng: Number(sedeRuta.longitude), nombre: sedeRuta.name } : null}
        />
        <HojaNovedad
          envio={novedad}
          orgId={orgId}
          onCerrar={() => setNovedad(null)}
          onHecho={() => {
            setNovedad(null);
            recargar();
          }}
        />
      </>
    );
  }

  if (estado === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
        <PageHeader titulo={t('titulo')} icono={Route} />
        {!enLinea && <FranjaSinConexion actualizadoEn={actualizadoEn} zona={timezone} />}
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

      {!enLinea && <FranjaSinConexion actualizadoEn={actualizadoEn} zona={timezone} />}

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
              {!enLinea ? (
                <StatusBadge estado="sin_senal" etiqueta={t('sinConexion.insignia')} tono="neutro" />
              ) : (
                resumen.estado !== 'vacia' && (
                  <StatusBadge
                    estado={resumen.estado}
                    etiqueta={t(`ruta.estados.${resumen.estado}`)}
                    tono={resumen.estado === 'en_ruta' ? 'informacion' : resumen.estado === 'terminada' ? 'exito' : 'neutro'}
                    apariencia="contorno"
                  />
                )
              )}
            </div>
            <dl className="grid grid-cols-4 gap-2">
              <Cifra etiqueta={t('ruta.porEntregar')} valor={String(resumen.porEntregar)} />
              <Cifra etiqueta={t('ruta.entregados')} valor={String(resumen.entregados)} clase="text-success-text" />
              <Cifra etiqueta={t('ruta.aCobrar')} valor={moneda.formatear(resumen.aCobrar)} clase={resumen.aCobrar > 0 ? 'text-warning-text' : undefined} />
              <Cifra etiqueta={t('ruta.enMano')} valor={moneda.formatear(resumen.enMano)} />
            </dl>
            {resumen.totalParadas > 0 && (
              <Link href={RUTA_MAPA_RUTA} className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
                <MapPin aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('mapa.ver')}
              </Link>
            )}
          </section>

          <FilaVehiculoHoy v={vehiculo} href={RUTA_MI_VEHICULO} />

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
                  numero={pestana === 'pendientes' ? numeroParada(i, resumen.entregados) : null}
                  zona={zonaDe(e)}
                  ahora={ahora}
                  onAbrir={() => router.push(rutaParada(e.id))}
                />
              ))}
            </ol>
          )}

          {!enLinea && <AvisoPausaSinConexion />}

          <BarraInferior>
            {enLinea ? (
              <Link href={RUTA_FIN_JORNADA} className={clasesBoton({ variante: 'secundario', tamano: 'lg', anchoCompleto: true })}>
                {t('terminarJornada')}
              </Link>
            ) : (
              <button type="button" disabled className={clasesBoton({ variante: 'secundario', tamano: 'lg', anchoCompleto: true })}>
                {t('terminarJornada')}
              </button>
            )}
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
