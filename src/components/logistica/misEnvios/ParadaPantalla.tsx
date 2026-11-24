'use client';

/**
 * Detalle de una parada (Figma 2801:4241): estado y promesa, cliente con llamar / WhatsApp / cómo
 * llegar, lo que se cobra, lo que lleva y los pasos. El botón grande del pie es el siguiente paso:
 * «Recogí el pedido» (picked) → «Voy en camino» (out_for_delivery, avisa al cliente) →
 * «Entregado» (pantalla Entregar) · «No se pudo entregar» (pantalla de novedad).
 *
 * Los cambios de estado son la RPC `logistica_cambiar_estado` (deliveryIntegrationService); la
 * base valida la transición y devuelve el aviso que se le pasa al servidor.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Banknote, CheckCircle2, Circle, CircleCheck, Clock, MapPin, XCircle } from 'lucide-react';
import { EmptyState, PageHeader, Skeleton, clasesBoton } from '@/components/kit';
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
import { BarraInferior, Bloque, BotonesContacto, ChipPromesa, InsigniaEstadoApp, enlacesDe } from './piezas';
import { RUTA_MIS_ENVIOS, rutaEntregar, rutaNoEntregado } from './rutas';

/** Ubicación del celular para el evento (opcional: sin permiso o sin señal, no se manda). */
export function ubicacionActual(espera = 5000): Promise<{ latitude: number; longitude: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((ok) => {
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => ok(null),
      { enableHighAccuracy: true, timeout: espera, maximumAge: 60_000 },
    );
  });
}

export function ParadaPantalla({ shipmentId }: { shipmentId: string }) {
  const t = useTranslations('logistica.misEnvios');
  const router = useRouter();
  const locale = useLocaleIntl();
  const moneda = useMonedaOrganizacion();
  const { resolveFor } = useOrgTimezone();
  const { envio, estado, recargar } = useParada(shipmentId);
  const [ocupado, setOcupado] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (estado === 'cargando') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-3" aria-busy="true">
        <PageHeader titulo={t('parada.cargando')} variante="form" volverA={RUTA_MIS_ENVIOS} cargando />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }
  if (!envio) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
        <PageHeader titulo={t('titulo')} variante="form" volverA={RUTA_MIS_ENVIOS} />
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
    if (!destino) return;
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

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-3">
      <PageHeader
        titulo={t('parada.titulo', { numero: envio.shipment_number })}
        subtitulo={`${origen} · ${nombre}`}
        variante="form"
        volverA={RUTA_MIS_ENVIOS}
      />

      <Bloque>
        <div className="flex items-center justify-between gap-2">
          <InsigniaEstadoApp estado={String(envio.status)} />
          <ChipPromesa envio={envio} zona={zona} ahora={ahora} />
        </div>
        {promesa?.tipo === 'tarde' && <p className="text-sm text-fg-secondary">{t('parada.tarde')}</p>}
        {envio.status === 'failed_attempt' && envio.exception_reason && (
          <p className="text-sm text-warning-text">{t('parada.novedadAnterior', { motivo: t(`novedad.motivos.${envio.exception_reason}.titulo`) })}</p>
        )}
      </Bloque>

      <Bloque>
        <h2 className="text-xl font-semibold text-fg">{nombre}</h2>
        <p className="text-[15px] text-fg">{[envio.delivery_address, envio.delivery_city].filter(Boolean).join(' · ') || t('sinDireccion')}</p>
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
          </ul>
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

      {(paso || puedeReportarNovedad(String(envio.status))) && (
        <BarraInferior>
          {paso === 'entregar' ? (
            <Link href={rutaEntregar(envio.id)} className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}>
              <CircleCheck aria-hidden="true" className="size-5" strokeWidth={1.5} />
              {t('pasos.boton.entregar')}
            </Link>
          ) : paso ? (
            <button type="button" onClick={avanzar} disabled={ocupado} aria-busy={ocupado} className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}>
              <CircleCheck aria-hidden="true" className="size-5" strokeWidth={1.5} />
              {ocupado ? t('guardando') : t(`pasos.boton.${paso}`)}
            </button>
          ) : null}
          {puedeReportarNovedad(String(envio.status)) && (
            <Link href={rutaNoEntregado(envio.id)} className={clasesBoton({ variante: 'secundario', tamano: 'lg', anchoCompleto: true })}>
              <XCircle aria-hidden="true" className="size-5" strokeWidth={1.5} />
              {t('pasos.boton.noEntregado')}
            </Link>
          )}
        </BarraInferior>
      )}
    </div>
  );
}
