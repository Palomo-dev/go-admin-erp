'use client';

/**
 * «Ver la ruta de» — el supervisor de despacho en Mis envíos (Figma «21 Logística» c 3216-110925;
 * celular «20» y «21»). Sin salir de la página: elige un domiciliario (selector y chips con su
 * avance), ve su ruta con las mismas piezas que el domiciliario (cifras, tabla o tarjetas, mapa,
 * vehículo y dinero) y por parada puede:
 * - Reasignar: la MISMA hoja «Asignar domiciliario» de Por despachar (RPC de asignación, revisión
 *   de documentos de la Fase 1b, excepción con PIN del supervisor con sus 5 intentos y bitácora).
 *   Solo en los estados que la base deja reasignar; si el paquete ya salió, primero la novedad.
 * - Registrar una novedad: la misma hoja del domiciliario (`logistica_registrar_novedad`).
 * No entrega ni cobra (decisión del dueño, 2026-11-25): el código lo tiene el domiciliario.
 *
 * Lee por `GET /api/logistica/mis-envios/ruta` (permiso `logistica.manage` en el servidor).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowLeftRight, Eye, MapPin, MessageCircle, Package, Phone, RefreshCw, Route } from 'lucide-react';
import { AvatarIniciales, AvisoTonal, ChipsOpcion, EmptyState, PageHeader, Skeleton, clasesBoton, useEsEscritorio } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useBranch } from '@/lib/context/BranchContext';
import { telefonoWhatsApp } from '@/lib/services/clientesListadoService';
import {
  agruparMisEnvios,
  enlaceLlamar,
  enlaceWhatsApp,
  numeroParada,
  pinesRuta,
  puedeReportarNovedad,
  resumenRuta,
  type PestanaMisEnvios,
} from '@/lib/logistica/misEnvios';
import { filaDespachoDeParada, puedeReasignar, type OpcionRutaDe } from '@/lib/logistica/supervisorRuta';
import { RUTAS_LOGISTICA, rutaEnvio } from '@/lib/logistica/rutas';
import type { EnvioApp } from '@/lib/services/logistica/misEnviosService';
import { cn } from '@/utils/Utils';
import { HojaAsignarDomiciliario } from '../asignar/HojaAsignarDomiciliario';
import { LogisticaApiError, leerOpcionesRutaDe, leerRutaDe, type DomiciliarioRutaDe } from '../logisticaApi';
import { useDiaRuta, useUltimoCuadre } from './useMiRuta';
import { useEnLinea } from './useEnLinea';
import { useMiVehiculo } from './useMiVehiculo';
import { TarjetaParada } from './TarjetaParada';
import { HojaNovedad } from './HojaNovedad';
import { InsigniaVigencia } from './PiezasVehiculo';
import { VistaRutaEscritorio } from './VistaRutaEscritorio';
import { MapaRutaDinamico } from './MapaRutaDinamico';
import { AvisoPausaSinConexion, FranjaSinConexion } from './piezas';
import { RUTA_MIS_ENVIOS } from './rutas';

export interface SupervisorRutaProps {
  /** El domiciliario de la URL (`?domiciliario=`); vacío = el primero de la lista. */
  domiciliarioId: string | null;
  onElegir: (id: string) => void;
}

export function SupervisorRuta({ domiciliarioId, onElegir }: SupervisorRutaProps) {
  const t = useTranslations('logistica.misEnvios');
  const ts = useTranslations('logistica.misEnvios.supervisor');
  const tv = useTranslations('logisticaVehiculo');
  const router = useRouter();
  const locale = useLocaleIntl();
  const moneda = useMonedaOrganizacion();
  const escritorio = useEsEscritorio();
  const enLinea = useEnLinea();
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const { branches } = useBranch();
  const { hoy, timezone, zonaDe } = useDiaRuta();

  const [opciones, setOpciones] = useState<OpcionRutaDe[] | null>(null);
  const [errorOpciones, setErrorOpciones] = useState<'permiso' | 'error' | null>(null);
  const [ruta, setRuta] = useState<{ domiciliario: DomiciliarioRutaDe; envios: EnvioApp[] } | null>(null);
  const [estadoRuta, setEstadoRuta] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [version, setVersion] = useState(0);
  const [pestana, setPestana] = useState<PestanaMisEnvios>('pendientes');
  const [novedad, setNovedad] = useState<EnvioApp | null>(null);
  const [reasignar, setReasignar] = useState<EnvioApp | null>(null);
  const [verMapa, setVerMapa] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelado = false;
    leerOpcionesRutaDe()
      .then((r) => !cancelado && setOpciones(r.opciones))
      .catch((err) => !cancelado && setErrorOpciones(err instanceof LogisticaApiError && err.status === 403 ? 'permiso' : 'error'));
    return () => {
      cancelado = true;
    };
  }, [version]);

  const elegido = domiciliarioId ?? opciones?.[0]?.id ?? null;

  useEffect(() => {
    if (!elegido) return;
    let cancelado = false;
    setEstadoRuta((e) => (e === 'listo' && ruta?.domiciliario.id === elegido ? e : 'cargando'));
    leerRutaDe(elegido)
      .then((r) => {
        if (cancelado) return;
        setRuta({ domiciliario: r.domiciliario, envios: r.envios });
        setEstadoRuta('listo');
      })
      .catch(() => !cancelado && setEstadoRuta('error'));
    return () => {
      cancelado = true;
    };
    // `ruta` solo decide si se muestra «cargando»; no debe volver a leer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegido, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const envios = useMemo(() => (ruta && ruta.domiciliario.id === elegido ? ruta.envios : []), [ruta, elegido]);
  const domiciliario = ruta && ruta.domiciliario.id === elegido ? ruta.domiciliario : null;
  const opcion = opciones?.find((o) => o.id === elegido) ?? null;
  const nombre = opcion?.nombre ?? domiciliario?.full_name ?? '';
  const grupos = useMemo(() => agruparMisEnvios(envios, hoy, zonaDe), [envios, hoy, zonaDe]);
  const resumen = useMemo(() => resumenRuta(grupos, envios), [grupos, envios]);
  const vehiculo = useMiVehiculo({ orgId, driver: domiciliario, envios, hoy, zonaDe });
  const ultimoCuadre = useUltimoCuadre(orgId, elegido, hoy, timezone, escritorio);
  const sede = domiciliario ? branches.find((b) => b.id === domiciliario.branch_id) : null;
  const fecha = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${hoy}T12:00:00Z`));
  const subtitulo = nombre ? [ts('viendo', { nombre }), t('hoy', { fecha }), sede?.name].filter(Boolean).join(' · ') : ts('subtitulo');
  const cargando = !opciones || (!!elegido && estadoRuta === 'cargando');

  const llamar = enlaceLlamar(opcion?.telefono);
  const whatsapp = enlaceWhatsApp(telefonoWhatsApp(opcion?.telefono ?? null));

  const acciones = (e: EnvioApp) => {
    const reasignable = puedeReasignar(e);
    // Entregado (o cerrado): nada que reasignar ni novedad; en el computador, ver el envío.
    if (!reasignable && !puedeReportarNovedad(String(e.status))) {
      return escritorio ? (
        <Link href={rutaEnvio(e.id)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
          <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {e.status === 'delivered' ? t('escritorio.acciones.verEntrega') : ts('verEnvio')}
        </Link>
      ) : null;
    }
    return (
      <>
        <button
          type="button"
          disabled={!reasignable || !enLinea}
          title={!reasignable ? ts('noReasignable') : undefined}
          onClick={() => setReasignar(e)}
          className={clasesBoton({ variante: 'secundario', tamano: escritorio ? 'sm' : 'md', anchoCompleto: !escritorio })}
        >
          <ArrowLeftRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {ts('reasignar')}
        </button>
        {puedeReportarNovedad(String(e.status)) && (
          <button
            type="button"
            disabled={!enLinea}
            onClick={() => setNovedad(e)}
            className={clasesBoton({ variante: 'secundario', tamano: escritorio ? 'sm' : 'md', anchoCompleto: !escritorio })}
          >
            <AlertTriangle aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('escritorio.acciones.novedad')}
          </button>
        )}
      </>
    );
  };

  const hojas = (
    <>
      <HojaNovedad
        envio={novedad}
        orgId={orgId}
        onCerrar={() => setNovedad(null)}
        onHecho={() => {
          setNovedad(null);
          recargar();
        }}
      />
      {orgId && reasignar && (
        <HojaAsignarDomiciliario
          abierto={!!reasignar}
          onAbiertoChange={(v) => !v && setReasignar(null)}
          organizationId={orgId}
          envios={[filaDespachoDeParada(reasignar, nombre || null)]}
          sede={sede?.name ?? null}
          onAsignado={() => {
            setReasignar(null);
            recargar();
          }}
        />
      )}
    </>
  );

  if (errorOpciones) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-4 pb-28 sm:pt-6">
        <PageHeader titulo={t('titulo')} icono={Route} />
        <EmptyState
          variante={errorOpciones === 'permiso' ? 'forbidden' : 'error'}
          compacto
          titulo={errorOpciones === 'permiso' ? ts('sinPermiso.titulo') : t('error.titulo')}
          descripcion={errorOpciones === 'permiso' ? ts('sinPermiso.descripcion') : t('error.descripcion')}
          onReintentar={errorOpciones === 'error' ? recargar : undefined}
          accion={errorOpciones === 'permiso' ? { etiqueta: t('volver'), onClick: () => router.push(RUTA_MIS_ENVIOS) } : undefined}
        />
      </div>
    );
  }
  if (opciones && opciones.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-4 pb-28 sm:pt-6">
        <PageHeader titulo={t('titulo')} icono={Route} />
        <EmptyState
          variante="empty"
          compacto
          titulo={ts('sinDomiciliarios.titulo')}
          descripcion={ts('sinDomiciliarios.descripcion')}
          accion={{ etiqueta: ts('irDomiciliarios'), onClick: () => router.push(RUTAS_LOGISTICA.domiciliarios) }}
        />
      </div>
    );
  }

  const chips = (
    <div role="radiogroup" aria-label={ts('verRutaDe')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
      {(opciones ?? []).map((o) => {
        const activo = o.id === elegido;
        const detalle = [
          o.paradas > 0 ? ts('chip.avance', { n: Math.min(o.entregados + 1, o.paradas), total: o.paradas }) : ts('chip.sinEnvios'),
          ts(`chip.estados.${o.estado}`),
        ].join(' · ');
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onElegir(o.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full border px-2 py-1.5 pr-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              activo ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
            )}
          >
            <AvatarIniciales nombre={o.nombre} tamano="sm" />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-fg">{o.corto}</span>
              <span className="text-xs text-fg-secondary">{detalle}</span>
              {o.documento && (
                <span className={cn('text-xs', o.documento.estado === 'vencido' ? 'text-danger-text' : 'text-warning-text')}>
                  {o.documento.estado === 'vencido'
                    ? ts('chip.vencido', { documento: t(`vehiculo.documentos.${o.documento.clave}`) })
                    : ts('chip.porVencer', { documento: t(`vehiculo.documentos.${o.documento.clave}`), n: o.documento.dias ?? 0 })}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );

  const nota = <p className="text-sm text-fg-secondary">{ts('nota')}</p>;

  if (escritorio) {
    return (
      <>
        <VistaRutaEscritorio
          envios={envios}
          cargando={cargando}
          hoy={hoy}
          zonaDe={zonaDe}
          subtitulo={subtitulo}
          acciones={
            <>
              <button type="button" onClick={recargar} className={clasesBoton({ variante: 'secundario' })} aria-label={t('recargar')}>
                <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
              <Link href={RUTAS_LOGISTICA.porDespachar} className={clasesBoton({ variante: 'primario' })}>
                <Package aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {ts('irPorDespachar')}
              </Link>
            </>
          }
          encima={
            <section aria-label={ts('verRutaDe')} className="flex flex-col gap-3 rounded-xl border border-line bg-subtle p-4">
              {!enLinea && <FranjaSinConexion actualizadoEn={null} zona={timezone} />}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-fg-secondary">{ts('verRutaDe')}</span>
                  <Select value={elegido ?? ''} onValueChange={onElegir}>
                    <SelectTrigger aria-label={ts('verRutaDe')} className="h-10 w-80 border-line-strong bg-surface">
                      <SelectValue placeholder={ts('elige')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(opciones ?? []).map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {[o.nombre, o.placa ? `${tv.has(`tiposCorto.${o.tipo}`) ? tv(`tiposCorto.${o.tipo}`) : ''} ${o.placa}`.trim() : null, ts('chip.envios', { n: o.paradas })]
                            .filter(Boolean)
                            .join(' · ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  {llamar && (
                    <a href={llamar} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                      <Phone aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {ts('llamarA', { nombre: opcion?.corto ?? '' })}
                    </a>
                  )}
                  {whatsapp && (
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                      <MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('contacto.whatsapp')}
                    </a>
                  )}
                </div>
              </div>
              {chips}
              {nota}
            </section>
          }
          accionesFila={acciones}
          onAbrir={(e) => router.push(rutaEnvio(e.id))}
          vehiculo={vehiculo}
          textos={{
            vehiculo: ts('vehiculoDe', { nombre: opcion?.corto ?? nombre }),
            dinero: ts('dineroDe', { nombre: opcion?.corto ?? nombre }),
            notaDinero: ts('notaDinero', { nombre: opcion?.corto ?? nombre }),
            notaTabla: ts('notaTabla'),
          }}
          enlaceVehiculo={{ href: RUTAS_LOGISTICA.domiciliarios, texto: ts('verFicha', { nombre: opcion?.corto ?? nombre }) }}
          ultimoCuadre={ultimoCuadre}
          origen={sede?.latitude != null && sede?.longitude != null ? { lat: Number(sede.latitude), lng: Number(sede.longitude), nombre: sede.name } : null}
        />
        {hojas}
      </>
    );
  }

  const lista = grupos[pestana];
  const pines = pinesRuta(grupos);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-4 pb-28 sm:pt-6">
      <PageHeader titulo={t('titulo')} subtitulo={subtitulo} icono={Route} cargando={cargando} movil={{ subtitulo }} />
      {!enLinea && <FranjaSinConexion actualizadoEn={null} zona={timezone} />}
      <h2 className="text-sm font-medium text-fg-secondary">{ts('verRutaDe')}</h2>
      {opciones ? chips : <Skeleton className="h-14 w-full rounded-full" />}
      <AvisoTonal tono="informacion" compacto titulo={ts('notaCelular', { nombre: nombre || ts('elDomiciliario') })} />

      {cargando ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      ) : estadoRuta === 'error' ? (
        <EmptyState variante="error" compacto titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={recargar} />
      ) : (
        <>
          <section aria-label={t('ruta.etiqueta')} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-medium text-fg">
                {[
                  resumen.estado === 'vacia' ? t('ruta.vacia') : t('escritorio.paradaDe', { n: resumen.parada, total: resumen.totalParadas }),
                  vehiculo.vehiculo?.plate ? t('escritorio.vehiculoCorto', { placa: vehiculo.vehiculo.plate }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </h2>
              {vehiculo.peor && (vehiculo.peor.estado === 'vencido' || vehiculo.peor.estado === 'por_vencer') && <InsigniaVigencia vigencia={vehiculo.peor} />}
            </div>
            <dl className="grid grid-cols-4 gap-2">
              {[
                { etiqueta: t('ruta.porEntregar'), valor: String(resumen.porEntregar), clase: '' },
                { etiqueta: t('ruta.entregados'), valor: String(resumen.entregados), clase: 'text-success-text' },
                { etiqueta: t('ruta.aCobrar'), valor: moneda.formatear(resumen.aCobrar), clase: resumen.aCobrar > 0 ? 'text-warning-text' : '' },
                { etiqueta: t('ruta.enMano'), valor: moneda.formatear(resumen.enMano), clase: '' },
              ].map((c) => (
                <div key={c.etiqueta} className="flex min-w-0 flex-col gap-0.5">
                  <dt className="truncate text-xs text-fg-secondary">{c.etiqueta}</dt>
                  <dd className={cn('truncate text-[15px] font-semibold text-fg', c.clase)}>{c.valor}</dd>
                </div>
              ))}
            </dl>
            {pines.length > 0 && (
              <button type="button" onClick={() => setVerMapa((v) => !v)} aria-expanded={verMapa} className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
                <MapPin aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {verMapa ? ts('ocultarMapa') : ts('verMapa')}
              </button>
            )}
            {verMapa && pines.length > 0 && (
              <MapaRutaDinamico pines={pines} etiqueta={t('mapa.etiqueta')} className="h-64 w-full overflow-hidden rounded-lg border border-line" />
            )}
          </section>

          <ChipsOpcion<PestanaMisEnvios>
            etiqueta={t('pestanas.etiqueta')}
            valor={pestana}
            onValorChange={setPestana}
            opciones={(['pendientes', 'entregados', 'novedades'] as const).map((p) => ({ valor: p, etiqueta: t(`pestanas.${p}`, { n: grupos[p].length }) }))}
          />

          {lista.length === 0 ? (
            <EmptyState variante="empty" compacto titulo={t(`vacio.${pestana}.titulo`)} />
          ) : (
            <ol className="flex flex-col gap-3">
              {lista.map((e, i) => (
                <TarjetaParada
                  key={e.id}
                  envio={e}
                  numero={pestana === 'pendientes' ? numeroParada(i, resumen.entregados) : null}
                  zona={zonaDe(e)}
                  ahora={ahora}
                  acciones={acciones(e) ?? undefined}
                />
              ))}
            </ol>
          )}
          {!enLinea && <AvisoPausaSinConexion />}
        </>
      )}
      {hojas}
    </div>
  );
}
