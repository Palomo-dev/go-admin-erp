'use client';

/**
 * Detalle de una parada (Figma 2801:4241 y «02/03a/03b», 3231-16576): estado y promesa, cliente
 * con llamar / WhatsApp / cómo llegar, lo que se cobra, lo que lleva y los pasos. El botón grande
 * del pie es el siguiente paso, con el vocabulario del computador (decisión 2026-11-25):
 * «Recogí el paquete» (picked) → «Iniciar ruta» (out_for_delivery, avisa al cliente y le manda su
 * código) → «Entregar» (pantalla Entregar) · «No se pudo entregar» (hoja de novedad sobre la
 * parada; la página `/no-entregado` sigue como enlace directo).
 *
 * Sin señal se pausan los pasos, Entregar y la novedad; llamar y cómo llegar siguen.
 *
 * Los cambios de estado son la RPC `logistica_cambiar_estado` (deliveryIntegrationService); la
 * base valida la transición y devuelve el aviso que se le pasa al servidor.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Banknote, Camera, CheckCircle2, Circle, CircleCheck, Clock, MapPin, Navigation, PackageCheck, XCircle } from 'lucide-react';
import { AvisoTonal, EmptyState, PageHeader, Skeleton, clasesBoton } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { deliveryIntegrationService, EnvioError } from '@/lib/services/deliveryIntegrationService';
import {
  enlaceWaze,
  estadoDelPaso,
  estadoPromesa,
  porCobrar,
  puedeReportarNovedad,
  siguientePaso,
} from '@/lib/logistica/misEnvios';
import { avisarCliente } from '../logisticaApi';
import { useParada } from './useMiRuta';
import { useEnLinea } from './useEnLinea';
import { ubicacionActual } from './ubicacion';
import { HojaNovedad } from './HojaNovedad';
import { AvisoPausaSinConexion, BarraInferior, Bloque, BotonesContacto, ChipPromesa, InsigniaEstadoApp, enlacesDe } from './piezas';
import { RUTA_MIS_ENVIOS, rutaEntregar } from './rutas';

/** Se movió a `./ubicacion`; se re-exporta para quien lo importaba de aquí. */
export { ubicacionActual } from './ubicacion';

export function ParadaPantalla({ shipmentId }: { shipmentId: string }) {
  const t = useTranslations('logistica.misEnvios');
  const router = useRouter();
  const locale = useLocaleIntl();
  const moneda = useMonedaOrganizacion();
  const { resolveFor } = useOrgTimezone();
  const { orgId, envio, estado, recargar } = useParada(shipmentId);
  const enLinea = useEnLinea();
  const [ocupado, setOcupado] = useState(false);
  const [novedad, setNovedad] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (estado === 'cargando') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-3" aria-busy="true">
        <PageHeader titulo={t('parada.cargando')} variante="form" migas={[{ etiqueta: t('titulo'), href: RUTA_MIS_ENVIOS }]} volverA={RUTA_MIS_ENVIOS} cargando />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }
  if (!envio) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
        <PageHeader titulo={t('titulo')} variante="form" migas={[{ etiqueta: t('titulo'), href: RUTA_MIS_ENVIOS }]} volverA={RUTA_MIS_ENVIOS} />
        <EmptyState
          variante={estado === 'error' ? 'error' : 'empty'}
          compacto
          titulo={estado === 'error' ? t('error.titulo') : t('parada.noEncontrada.titulo')}
          descripcion={estado === 'error' ? t('error.descripcion') : t('parada.noEncontrada.descripcion')}
          onReintentar={estado === 'error' ? recargar : undefined}
          accion={estado === 'error' ? undefined : { etiqueta: t('volver'), onClick: () => router.push(RUTA_MIS_ENVIOS) }}
        />
      </div>
    );
  }

  const migas = [{ etiqueta: t('titulo'), href: RUTA_MIS_ENVIOS }];
  const zona = resolveFor(envio.branch_id ?? null).timezone;
  const hora = (v: string | null | undefined) => (v ? new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: zona }).format(new Date(v)) : null);
  const nombre = envio.delivery_contact_name || envio.customer?.full_name || t('cliente');
  const origen = envio.source_type === 'web_order' ? t('origen.tienda') : envio.source_type === 'sale' ? t('origen.pos') : t('origen.otro');
  const paso = siguientePaso(String(envio.status));
  const cobro = porCobrar(envio);
  const promesa = estadoPromesa(envio.promesa, ahora);
  const waze = enlaceWaze(envio);
  const enlaces = enlacesDe(envio, t('contacto.mensajeWhatsApp', { numero: envio.shipment_number }));

  const avanzar = async () => {
    const destino = estadoDelPaso(paso);
    if (!destino || !enLinea) return;
    setOcupado(true);
    try {
      const ubicacion = await ubicacionActual(3000);
      const r = await deliveryIntegrationService.changeStatus(envio.id, destino, ubicacion ?? {});
      void avisarCliente(envio, r.aviso);
      toastSuccess(t(`pasos.hecho.${destino}`));
      recargar();
    } catch (err) {
      const codigo = err instanceof EnvioError ? err.codigo : 'ERROR';
      toastError(t('errores.titulo'), t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.ERROR'));
      recargar();
    } finally {
      setOcupado(false);
    }
  };

  const pasos: Array<{ clave: 'recogido' | 'en_camino' | 'entregado'; hecho: boolean; hora: string | null }> = [
    { clave: 'recogido', hecho: !!envio.picked_at, hora: hora(envio.picked_at) },
    { clave: 'en_camino', hecho: !!envio.dispatched_at, hora: hora(envio.dispatched_at) },
    { clave: 'entregado', hecho: !!envio.delivered_at, hora: hora(envio.delivered_at) },
  ];
  const actual = pasos.findIndex((p) => !p.hecho);
  const totalItems = (envio.shipment_items ?? []).reduce((s, it) => s + Math.round(Number(it.total_value ?? 0) * 100), 0);
  const totalPedido = totalItems > 0 ? (totalItems + Math.round(Number(envio.shipping_fee ?? 0) * 100)) / 100 : null;
  const reporta = puedeReportarNovedad(String(envio.status));
  /** Lo que se le dice al domiciliario sobre el aviso al cliente (solo los pedidos de la tienda se avisan). */
  const textoAviso =
    envio.source_type !== 'web_order'
      ? null
      : paso === 'en_camino' || paso === 'reintentar'
      ? envio.delivery_code_required
        ? t('parada.avisoIniciar')
        : t('parada.avisoIniciarSinCodigo')
      : envio.status === 'out_for_delivery'
        ? envio.delivery_code_required
          ? t('parada.avisoEnCamino')
          : t('parada.avisoEnCaminoSinCodigo')
        : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-3">
      <PageHeader
        titulo={t('parada.titulo', { numero: envio.shipment_number })}
        subtitulo={`${origen} · ${nombre}`}
        variante="form"
        migas={migas}
        volverA={RUTA_MIS_ENVIOS}
      />

      {!enLinea && <AvisoPausaSinConexion />}

      <Bloque>
        <div className="flex items-center justify-between gap-2">
          <InsigniaEstadoApp estado={String(envio.status)} />
          <ChipPromesa envio={envio} zona={zona} ahora={ahora} />
        </div>
        {promesa?.tipo === 'tarde' && <p className="text-sm text-fg-secondary">{t('parada.tarde')}</p>}
        {textoAviso && <p className="text-sm text-fg-secondary">{textoAviso}</p>}
        {envio.status === 'failed_attempt' && envio.exception_reason && (
          <p className="text-sm text-warning-text">{t('parada.novedadAnterior', { motivo: t(`novedad.motivos.${envio.exception_reason}.titulo`) })}</p>
        )}
      </Bloque>

      <Bloque>
        <h2 className="text-xl font-semibold text-fg">{nombre}</h2>
        <p className="text-[15px] text-fg">{envio.delivery_address || t('sinDireccion')}</p>
        {(envio.delivery_city || envio.barrio) && <p className="text-sm text-fg-secondary">{[envio.delivery_city, envio.barrio].filter(Boolean).join(' · ')}</p>}
        {envio.delivery_instructions && <p className="text-sm text-fg-secondary">{t('parada.indicaciones', { texto: envio.delivery_instructions })}</p>}
        <BotonesContacto enlaces={enlaces} />
      </Bloque>

      {(enlaces.comoLlegar || waze) && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-subtle px-4 py-8 text-center">
          <MapPin aria-hidden="true" className="size-6 text-fg-muted" strokeWidth={1.5} />
          <div className="flex flex-wrap justify-center gap-2">
            {enlaces.comoLlegar && (
              <a href={enlaces.comoLlegar} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario' })}>
                {t('contacto.googleMaps')}
              </a>
            )}
            {waze && (
              <a href={waze} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario' })}>
                {t('contacto.waze')}
              </a>
            )}
          </div>
        </div>
      )}

      {cobro > 0 && (
        <section className="flex flex-col gap-1 rounded-xl border border-line-warning bg-warning-subtle p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <Banknote aria-hidden="true" className="size-5" strokeWidth={1.5} />
            {t('parada.cobra', { monto: moneda.formatear(cobro) })}
          </h2>
          <p className="text-sm text-fg-secondary">{t('parada.medios')}</p>
          {envio.delivery_code_required && <p className="text-sm text-fg-secondary">{t('parada.pideCodigo')}</p>}
        </section>
      )}

      {(envio.shipment_items?.length ?? 0) > 0 && (
        <Bloque titulo={t('parada.llevas', { n: envio.shipment_items?.length ?? 0 })}>
          <ul className="flex flex-col gap-2 text-sm">
            {envio.shipment_items?.map((it) => (
              <li key={it.id} className="flex justify-between gap-3">
                <span className="text-fg-secondary">
                  {Number(it.qty ?? 1)} × {it.description}
                </span>
                {it.total_value != null && <span className="shrink-0 text-fg">{moneda.formatear(Number(it.total_value))}</span>}
              </li>
            ))}
            {Number(envio.shipping_fee) > 0 && (
              <li className="flex justify-between gap-3">
                <span className="text-fg-secondary">{t('parada.envio')}</span>
                <span className="shrink-0 text-fg">{moneda.formatear(Number(envio.shipping_fee))}</span>
              </li>
            )}
            {totalPedido != null && (
              <li className="flex justify-between gap-3 border-t border-line pt-2">
                <span className="text-fg-secondary">{t('parada.totalPedido')}</span>
                <span className="shrink-0 text-base font-semibold text-fg">{moneda.formatear(totalPedido)}</span>
              </li>
            )}
          </ul>
        </Bloque>
      )}

      {envio.status === 'out_for_delivery' && (
        <Bloque
          titulo={
            <span className="flex items-center gap-2">
              <Camera aria-hidden="true" className="size-5" strokeWidth={1.5} />
              {t('parada.prueba.titulo')}
            </span>
          }
        >
          <p className="text-sm text-fg-secondary">{envio.delivery_code_required ? t('parada.prueba.conCodigo') : t('parada.prueba.sinCodigo')}</p>
        </Bloque>
      )}

      <Bloque titulo={t('parada.pasos')}>
        <ol className="flex flex-col gap-3">
          {pasos.map((p, i) => (
            <li key={p.clave} className="flex items-center gap-3 text-sm">
              {p.hecho ? (
                <CheckCircle2 aria-hidden="true" className="size-6 text-success" strokeWidth={1.5} />
              ) : i === actual ? (
                <Clock aria-hidden="true" className="size-6 text-brand" strokeWidth={1.5} />
              ) : (
                <Circle aria-hidden="true" className="size-6 text-fg-muted" strokeWidth={1.5} />
              )}
              <span className={i === actual ? 'font-medium text-brand' : 'text-fg'}>{t(`pasos.${p.clave}`)}</span>
              <span className="text-fg-muted">{p.hora ?? '—'}</span>
              <span className="sr-only">{p.hecho ? t('pasos.hechoSr') : i === actual ? t('pasos.actualSr') : t('pasos.pendienteSr')}</span>
            </li>
          ))}
        </ol>
      </Bloque>

      {paso === 'en_camino' && <AvisoTonal tono="informacion" compacto titulo={t('parada.despuesDeIniciar')} />}

      {(paso || reporta) && (
        <BarraInferior>
          {paso === 'entregar' ? (
            enLinea ? (
              <Link href={rutaEntregar(envio.id)} className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}>
                <CircleCheck aria-hidden="true" className="size-5" strokeWidth={1.5} />
                {t('pasos.boton.entregar')}
              </Link>
            ) : (
              <button type="button" disabled className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}>
                <CircleCheck aria-hidden="true" className="size-5" strokeWidth={1.5} />
                {t('pasos.boton.entregar')}
              </button>
            )
          ) : paso ? (
            <button type="button" onClick={avanzar} disabled={ocupado || !enLinea} aria-busy={ocupado} className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}>
              {paso === 'recoger' ? (
                <PackageCheck aria-hidden="true" className="size-5" strokeWidth={1.5} />
              ) : (
                <Navigation aria-hidden="true" className="size-5" strokeWidth={1.5} />
              )}
              {ocupado ? t('guardando') : t(`pasos.boton.${paso}`)}
            </button>
          ) : null}
          {reporta && (
            <button
              type="button"
              onClick={() => setNovedad(true)}
              disabled={!enLinea}
              className={clasesBoton({ variante: 'secundario', tamano: 'lg', anchoCompleto: true })}
            >
              <XCircle aria-hidden="true" className="size-5" strokeWidth={1.5} />
              {t('pasos.boton.noEntregado')}
            </button>
          )}
        </BarraInferior>
      )}

      <HojaNovedad
        envio={novedad ? envio : null}
        orgId={orgId}
        onCerrar={() => setNovedad(false)}
        onHecho={() => {
          setNovedad(false);
          router.push(RUTA_MIS_ENVIOS);
        }}
      />
    </div>
  );
}
