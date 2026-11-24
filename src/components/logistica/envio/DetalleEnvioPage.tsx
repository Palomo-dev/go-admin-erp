'use client';

/**
 * Logística › Envíos › detalle (`/app/logistica/envios/[id]`). Figma «21 Logística» 2798:2849
 * (estados y acciones 2799:7510, prueba de entrega 2799:7669) y «22 Logística» 2802:8747 (línea
 * de tiempo con estados canónicos e insignia 2802:10982).
 *
 * Lee con `obtenerDetalleEnvio`; cada acción va por su RPC a través de
 * `deliveryIntegrationService` (asignar, cambiar estado, entregar, novedad). Los avisos al cliente
 * usan la ruta de siempre de Pedidos online. El código de entrega lo pide
 * `logistica_codigo_entrega`, que solo responde a administradores: si la base lo niega, la tarjeta
 * no lo muestra (FASE1-CIMIENTOS, «Código de entrega»).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Bell,
  Camera,
  CheckCircle2,
  Circle,
  CircleCheck,
  CircleX,
  Clock,
  FileText,
  KeyRound,
  Mail,
  MapPin,
  Navigation,
  Package,
  PackageCheck,
  PenLine,
  Phone,
  Printer,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Truck,
  UserCheck,
  UserPlus,
  Wallet,
} from 'lucide-react';
import {
  AvatarIniciales,
  EmptyState,
  FilaDato,
  ListaDatos,
  PageHeader,
  RowActionsMenu,
  StatusBadge,
  Tarjeta,
  clasesBoton,
  type AccionFila,
} from '@/components/kit';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { cn } from '@/utils/Utils';
import { deliveryIntegrationService, EnvioError } from '@/lib/services/deliveryIntegrationService';
import {
  leerCodigoEntrega,
  obtenerDetalleEnvio,
  reiniciarCodigoEntrega,
  type CodigoEntrega,
  type DetalleEnvio,
} from '@/lib/services/logistica/despachoService';
import { accionesDetalle, documentoOculto, lineaDeTiempo, pasoCobro, type PasoLinea } from '@/lib/logistica/detalleEnvio';
import { enlaceComoLlegar, enlaceLlamar } from '@/lib/logistica/misEnvios';
import { MAX_INTENTOS_CODIGO } from '@/lib/logistica/contraentrega';
import { RUTAS_LOGISTICA } from '@/lib/logistica/rutas';
import { avisarCliente } from '../logisticaApi';
import { leerAvisosPedido, reenviarAviso, type AvisoDePedido } from '@/components/pos/pedidos-online/avisos/avisosClienteApi';
import { EstadoEnvioBadge } from '../EstadoEnvioBadge';
import { HojaAsignarDomiciliario } from '../asignar/HojaAsignarDomiciliario';
import { useImpresionLogistica } from '../useImpresionLogistica';
import { useEvidenciasEnvio, type EvidenciasEnvio } from '../useEvidenciasEnvio';
import { DialogoDireccion, DialogoEntregar, DialogoNovedad } from './DialogosEnvio';

type Confirmacion = 'devolver' | 'cancelar' | null;

export function DetalleEnvioPage({ id }: { id: string }) {
  const t = useTranslations('logistica.envio');
  const moneda = useMonedaOrganizacion();
  const { formatTime, formatDateTime, formatPlain } = useFormatDate();
  const { imprimirGuias } = useImpresionLogistica();
  const organizationId = getOrganizationId();

  const [detalle, setDetalle] = useState<DetalleEnvio | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'no_existe' | 'error'>('cargando');
  const [codigo, setCodigo] = useState<CodigoEntrega | null>(null);
  const [avisos, setAvisos] = useState<AvisoDePedido[] | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [asignar, setAsignar] = useState(false);
  const [entregar, setEntregar] = useState(false);
  const [novedad, setNovedad] = useState(false);
  const [direccion, setDireccion] = useState(false);
  const [confirmar, setConfirmar] = useState<Confirmacion>(null);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    obtenerDetalleEnvio(supabase, organizationId, id)
      .then((d) => {
        if (cancelado) return;
        setDetalle(d);
        setEstado(d ? 'listo' : 'no_existe');
        if (d?.fila.codigoRequerido) leerCodigoEntrega(supabase, id).then((c) => !cancelado && setCodigo(c));
        else setCodigo(null);
        if (d?.fila.pedidoWebId)
          leerAvisosPedido(d.fila.pedidoWebId)
            .then((r) => !cancelado && setAvisos(r.avisos))
            .catch(() => !cancelado && setAvisos([]));
      })
      .catch(() => !cancelado && setEstado('error'));
    return () => {
      cancelado = true;
    };
  }, [organizationId, id, recarga]);

  const f = detalle?.fila;
  const e = detalle?.envio;
  const acciones = useMemo(() => (f ? accionesDetalle(f) : null), [f]);
  const pasos = useMemo(() => (detalle ? lineaDeTiempo(detalle.eventos, detalle.envio.status) : []), [detalle]);
  const fmt = moneda.formatear;
  // Fotos y firma: bucket privado, enlaces firmados por el servidor (se renuevan al recargar).
  const evidencias = useEvidenciasEnvio(estado === 'listo' ? id : null, true, recarga);

  const mensajeError = (err: unknown) => {
    const c = err instanceof EnvioError ? err.codigo : 'ERROR';
    return t.has(`errores.${c}`) ? t(`errores.${c}`) : t('errores.ERROR');
  };

  const cambiar = async (estadoNuevo: 'ready_for_pickup' | 'picked' | 'out_for_delivery' | 'returned' | 'cancelled', clave: string) => {
    if (!f || !e) return;
    setOcupado(clave);
    try {
      const r = await deliveryIntegrationService.changeStatus(f.id, estadoNuevo);
      toastSuccess(t(`ok.${clave}`));
      if (r.aviso) void avisarCliente({ source_type: e.source_type, source_id: e.source_id }, r.aviso);
      setConfirmar(null);
      recargar();
    } catch (err) {
      toastError(t('errorAccion'), mensajeError(err));
    } finally {
      setOcupado(null);
    }
  };

  const avisarAhora = async () => {
    if (!f || !e) return;
    setOcupado('avisar');
    const momento = f.status === 'delivered' ? 'entregado' : f.status === 'failed_attempt' ? 'novedad' : 'en_camino';
    const ok = await avisarCliente({ source_type: e.source_type, source_id: e.source_id }, momento);
    setOcupado(null);
    if (ok) toastSuccess(t('ok.avisar'));
    else toastError(t('errorAviso'));
    recargar();
  };

  const reiniciarCodigo = async () => {
    setOcupado('codigo');
    try {
      await reiniciarCodigoEntrega(supabase, id);
      toastSuccess(t('codigo.reiniciado'));
      recargar();
    } catch {
      toastError(t('codigo.errorReiniciar'));
    } finally {
      setOcupado(null);
    }
  };

  if (estado === 'no_existe' || estado === 'error') {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader variante="detail" titulo={t('titulo')} volverA={RUTAS_LOGISTICA.envios} migas={[{ etiqueta: t('migas.logistica'), href: RUTAS_LOGISTICA.porDespachar }, { etiqueta: t('migas.envios'), href: RUTAS_LOGISTICA.envios }]} />
        <EmptyState
          variante={estado === 'error' ? 'error' : undefined}
          icono={Package}
          titulo={estado === 'error' ? t('errorCarga') : t('noExiste')}
          onReintentar={estado === 'error' ? recargar : undefined}
          accion={{ etiqueta: t('volverBandeja'), href: RUTAS_LOGISTICA.porDespachar }}
        />
      </div>
    );
  }

  const menu: AccionFila[] =
    f && acciones
      ? [
          { id: 'avisar', etiqueta: t('acciones.avisar'), icono: Bell, onSelect: () => void avisarAhora(), oculta: !acciones.avisar },
          {
            id: 'llamar',
            etiqueta: t('acciones.llamar'),
            icono: Phone,
            onSelect: () => {
              const tel = enlaceLlamar(f.telefono);
              if (tel) window.location.href = tel;
            },
            oculta: !enlaceLlamar(f.telefono),
          },
          { id: 'asignar', etiqueta: f.domiciliarioId ? t('acciones.cambiarDomiciliario') : t('acciones.asignar'), icono: UserPlus, onSelect: () => setAsignar(true), oculta: !acciones.asignar, separadorAntes: true },
          { id: 'listo', etiqueta: t('acciones.listoParaSalir'), icono: PackageCheck, onSelect: () => void cambiar('ready_for_pickup', 'listo'), oculta: !acciones.listoParaSalir },
          { id: 'recogido', etiqueta: t('acciones.recogido'), icono: Package, onSelect: () => void cambiar('picked', 'recogido'), oculta: !acciones.recogido },
          { id: 'enCamino', etiqueta: t('acciones.enCamino'), icono: Truck, onSelect: () => void cambiar('out_for_delivery', 'enCamino'), oculta: !acciones.enCamino },
          { id: 'novedad', etiqueta: t('acciones.novedad'), icono: AlertTriangle, onSelect: () => setNovedad(true), oculta: !acciones.novedad },
          { id: 'guia', etiqueta: t('acciones.imprimirGuia'), icono: Printer, onSelect: () => void imprimirGuias([f], f.domiciliario ? { nombre: f.domiciliario } : null) },
          { id: 'devolver', etiqueta: t('acciones.devolver'), icono: RotateCcw, destructiva: true, separadorAntes: true, onSelect: () => setConfirmar('devolver'), oculta: !acciones.devolver },
          { id: 'cancelar', etiqueta: t('acciones.cancelar'), icono: Ban, destructiva: true, onSelect: () => setConfirmar('cancelar'), oculta: !acciones.cancelar },
        ]
      : [];

  const subtitulo = f
    ? [f.pedido ? t('subtitulo.pedido', { pedido: f.pedido }) : null, t(`canales.${f.canal}`), t('subtitulo.creado', { fecha: formatDateTime(f.creado) })].filter(Boolean).join(' · ')
    : undefined;

  const ultimoIntento = detalle?.intentos[detalle.intentos.length - 1] ?? null;
  const comoLlegar =
    f && e
      ? enlaceComoLlegar({ delivery_latitude: e.delivery_latitude, delivery_longitude: e.delivery_longitude, delivery_address: f.direccion, delivery_city: f.ciudad })
      : null;
  const cobro = pasoCobro(f?.codStatus);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        variante="detail"
        titulo={f?.numero ?? t('titulo')}
        subtitulo={subtitulo}
        cargando={estado === 'cargando'}
        volverA={RUTAS_LOGISTICA.envios}
        migas={[
          { etiqueta: t('migas.logistica'), href: RUTAS_LOGISTICA.porDespachar },
          { etiqueta: t('migas.envios'), href: RUTAS_LOGISTICA.envios },
          { etiqueta: f?.numero ?? '…' },
        ]}
        acciones={
          f && acciones ? (
            <>
              {acciones.reintentar && (
                <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => void cambiar('out_for_delivery', 'reintentar')} disabled={ocupado !== null}>
                  <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('acciones.reintentar')}
                </button>
              )}
              {acciones.novedad && !acciones.reintentar && (
                <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setNovedad(true)} disabled={ocupado !== null}>
                  <AlertTriangle aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('acciones.novedad')}
                </button>
              )}
              {acciones.entregar ? (
                <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => setEntregar(true)} disabled={ocupado !== null}>
                  <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('acciones.entregar')}
                </button>
              ) : acciones.asignar ? (
                <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => setAsignar(true)} disabled={ocupado !== null}>
                  <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('acciones.asignar')}
                </button>
              ) : null}
              <RowActionsMenu orientacion="horizontal" tamano="md" titulo={f.numero} acciones={menu} />
            </>
          ) : null
        }
        movil={f ? { accion: <RowActionsMenu orientacion="horizontal" tamano="md" titulo={f.numero} acciones={menu} /> } : undefined}
        debajo={
          f ? (
            <>
              <EstadoEnvioBadge estado={f.status} tamano="md" />
              {f.intentosFallidos > 0 && <StatusBadge estado="intento" tono="advertencia" apariencia="contorno" etiqueta={t('chips.intento', { n: f.intentosFallidos + (f.status === 'out_for_delivery' ? 1 : 0) })} />}
              {f.contraentrega > 0 && (
                <StatusBadge estado="cod" tono="advertencia" apariencia="contorno" etiqueta={t('chips.contraentrega', { monto: fmt(f.contraentrega), estado: t(`cobro.${cobro}`) })} />
              )}
              <StatusBadge estado={String(f.modo)} tono="marca" apariencia="contorno" etiqueta={t.has(`modos.${f.modo}`) ? t(`modos.${f.modo}`) : String(f.modo)} />
              {e && (e.branch as { name?: string } | null)?.name && <StatusBadge estado="sede" tono="neutro" etiqueta={String((e.branch as { name?: string }).name)} />}
            </>
          ) : undefined
        }
      />

      {f?.status === 'failed_attempt' && ultimoIntento?.reschedule_date && (
        <AvisoTonal tono="informacion" compacto titulo={t('reprogramado', { dia: formatPlain(ultimoIntento.reschedule_date) })} />
      )}

      {estado === 'cargando' || !detalle || !f ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]" aria-busy="true">
          <div className="h-96 animate-pulse rounded-xl bg-surface-muted" />
          <div className="h-64 animate-pulse rounded-xl bg-surface-muted" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
          <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
            <LineaDeTiempo pasos={pasos} formatTime={formatTime} formatDateTime={formatDateTime} />

            <Tarjeta
              titulo={t('destinatario.titulo')}
              icono={MapPin}
              accion={
                acciones && !['delivered', 'returned', 'cancelled'].includes(f.status) ? (
                  <button type="button" className="text-sm font-medium text-link hover:underline" onClick={() => setDireccion(true)}>
                    {t('destinatario.cambiar')}
                  </button>
                ) : undefined
              }
            >
              <ListaDatos>
                <FilaDato etiqueta={t('destinatario.recibe')} valor={f.cliente ?? '—'} />
                <FilaDato etiqueta={t('destinatario.telefono')} valor={f.telefono ?? '—'} href={enlaceLlamar(f.telefono) ?? undefined} tono={f.telefono ? 'enlace' : 'neutro'} />
                <FilaDato etiqueta={t('destinatario.direccion')} valor={f.direccion ?? '—'} />
                <FilaDato etiqueta={t('destinatario.barrio')} valor={f.barrio ?? '—'} />
                <FilaDato etiqueta={t('destinatario.ciudad')} valor={f.ciudad ?? '—'} />
                <FilaDato etiqueta={t('destinatario.indicaciones')} valor={f.instrucciones ?? '—'} />
              </ListaDatos>
              {comoLlegar && (
                <a href={comoLlegar} target="_blank" rel="noopener noreferrer" className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'mt-3')}>
                  <Navigation aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('destinatario.comoLlegar')}
                </a>
              )}
            </Tarjeta>

            <Tarjeta titulo={t('items.titulo', { n: detalle.items.length })} icono={Package}>
              {detalle.items.length === 0 ? (
                <p className="text-sm text-fg-muted">{t('items.sinItems')}</p>
              ) : (
                <ListaDatos>
                  {detalle.items.map((i) => (
                    <FilaDato key={i.id} etiqueta={`${i.qty} × ${i.description ?? i.sku ?? '—'}`} valor={i.total_value != null ? fmt(i.total_value) : undefined} />
                  ))}
                  {Number(e?.shipping_fee) > 0 && <FilaDato etiqueta={t('items.envio')} valor={fmt(Number(e?.shipping_fee))} separadorAntes />}
                  <FilaDato etiqueta={f.contraentrega > 0 ? t('items.totalCobrar') : t('items.total')} valor={fmt(f.contraentrega > 0 ? f.contraentrega : f.valor)} tono="fuerte" separadorAntes={!(Number(e?.shipping_fee) > 0)} />
                </ListaDatos>
              )}
            </Tarjeta>

            {detalle.intentos.length > 0 && (
              <Tarjeta titulo={t('intentos.titulo')} icono={AlertTriangle}>
                <div className="flex flex-col gap-3">
                  {detalle.intentos.map((a) => (
                    <div key={a.id} className={cn('rounded-lg border p-3', a.status === 'failed' ? 'border-line-warning bg-warning-subtle' : 'border-line')}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-fg">
                          {t('intentos.intento', { n: a.attempt_number, hora: formatDateTime(a.attempted_at) })}
                          {a.failure_reason_code && ` · ${t.has(`motivos.${a.failure_reason_code}`) ? t(`motivos.${a.failure_reason_code}`) : a.failure_reason_code}`}
                        </p>
                        {a.reschedule_date && <StatusBadge estado="reprogramado" tono="advertencia" apariencia="contorno" etiqueta={t('intentos.reprogramado', { dia: formatPlain(a.reschedule_date) })} />}
                      </div>
                      {(a.failure_reason_text || a.driver_notes) && <p className="mt-1 text-sm text-fg-secondary">«{a.failure_reason_text ?? a.driver_notes}»</p>}
                      {(a.photo_urls?.length ?? 0) > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {a.photo_urls!.map((u, i) => {
                            const enlace = evidencias.enlace(u);
                            return enlace ? (
                              <a key={u} href={enlace} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                                <Camera aria-hidden="true" className="size-4" strokeWidth={1.5} />
                                {t('intentos.foto', { n: i + 1 })}
                              </a>
                            ) : (
                              <span key={u} className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'pointer-events-none opacity-60')}>
                                <Camera aria-hidden="true" className="size-4" strokeWidth={1.5} />
                                {t('intentos.foto', { n: i + 1 })}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                  {acciones?.reintentar && (
                    <button type="button" className={cn(clasesBoton({ variante: 'tinte', tamano: 'sm' }), 'self-start')} onClick={() => void cambiar('out_for_delivery', 'reintentar')} disabled={ocupado !== null}>
                      <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('intentos.reintentarAhora')}
                    </button>
                  )}
                </div>
              </Tarjeta>
            )}

            <PruebaEntrega detalle={detalle} formatDateTime={formatDateTime} fmt={fmt} evidencias={evidencias} />

            {f.pedidoWebId && (
              <Tarjeta titulo={t('avisos.titulo')} icono={Bell}>
                {avisos === null ? (
                  <div className="h-16 animate-pulse rounded-lg bg-surface-muted" />
                ) : avisos.length === 0 ? (
                  <p className="text-sm text-fg-muted">{t('avisos.ninguno')}</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-line">
                    {avisos.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 py-2.5">
                        {a.channel === 'whatsapp' ? (
                          <Smartphone aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
                        ) : (
                          <Mail aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-fg">{t.has(`avisos.momentos.${a.moment}`) ? t(`avisos.momentos.${a.moment}`) : a.moment}</span>
                          <span className="block truncate text-xs text-fg-muted">{[t(`avisos.canales.${a.channel}`), formatTime(a.created_at)].join(' · ')}</span>
                        </span>
                        <StatusBadge estado={a.status} tono={a.status === 'failed' || a.status === 'no_data' ? 'peligro' : a.status === 'delivered' ? 'exito' : 'informacion'} etiqueta={t(`avisos.estados.${a.status}`)} />
                        {(a.status === 'failed' || a.status === 'no_data') && (
                          <button
                            type="button"
                            className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                            onClick={() =>
                              reenviarAviso(f.pedidoWebId as string, a.channel)
                                .then(() => toastSuccess(t('ok.avisar')))
                                .catch(() => toastError(t('errorAviso')))
                                .finally(recargar)
                            }
                          >
                            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
                            {t('avisos.reenviar')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
            <Tarjeta titulo={t('domiciliario.titulo')} icono={UserCheck}>
              {detalle.domiciliario ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <AvatarIniciales nombre={detalle.domiciliario.full_name ?? f.domiciliario ?? '?'} tamano="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">{detalle.domiciliario.full_name ?? f.domiciliario ?? '—'}</p>
                      <p className="truncate text-xs text-fg-muted">{detalle.domiciliario.is_external ? t('domiciliario.externo') : t('domiciliario.propio')}</p>
                    </div>
                  </div>
                  <ListaDatos>
                    <FilaDato etiqueta={t('domiciliario.telefono')} valor={detalle.domiciliario.phone ?? '—'} href={enlaceLlamar(detalle.domiciliario.phone) ?? undefined} tono={detalle.domiciliario.phone ? 'enlace' : 'neutro'} />
                    <FilaDato
                      etiqueta={t('domiciliario.vehiculo')}
                      valor={detalle.vehiculo ? `${detalle.vehiculo.plate}` : detalle.domiciliario.vehicle_type ? t(`vehiculos.${detalle.domiciliario.vehicle_type}`) : t('domiciliario.sinVehiculo')}
                    />
                    {f.asignado && <FilaDato etiqueta={t('domiciliario.asignado')} valor={formatDateTime(f.asignado)} />}
                  </ListaDatos>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-fg-muted">{t('domiciliario.ninguno')}</p>
                  {acciones?.asignar && (
                    <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setAsignar(true)}>
                      <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('acciones.asignar')}
                    </button>
                  )}
                </div>
              )}
            </Tarjeta>

            {f.contraentrega > 0 && (
              <Tarjeta titulo={t('contraentrega.titulo')} icono={Wallet}>
                <p className="text-2xl font-semibold tabular-nums text-fg">{fmt(f.contraentrega)}</p>
                <ListaDatos className="mt-3">
                  <FilaDato
                    etiqueta={t('contraentrega.cobrado')}
                    valor={e?.cod_collected_amount != null ? fmt(Number(e.cod_collected_amount)) : '—'}
                    descripcion={e?.cod_collected_method ? t(`entregar.medios.${e.cod_collected_method}`) : undefined}
                  />
                  <FilaDato
                    etiqueta={t('contraentrega.cuadre')}
                    valor={detalle.cuadre ? t(`contraentrega.lineas.${detalle.cuadre.status}`) : t('contraentrega.sinCuadre')}
                    href={detalle.cuadre ? `${RUTAS_LOGISTICA.cuadres}?cuadre=${encodeURIComponent(detalle.cuadre.settlement_id)}` : undefined}
                    tono={detalle.cuadre ? 'enlace' : 'neutro'}
                  />
                </ListaDatos>
                <ol className="mt-3 flex flex-wrap items-center gap-2" aria-label={t('contraentrega.camino')}>
                  {(['pendiente', 'cobrado', 'girado'] as const).map((p, i) => (
                    <li key={p} className="flex items-center gap-2">
                      {i > 0 && <ArrowRight aria-hidden="true" className="size-3.5 text-fg-muted" strokeWidth={1.5} />}
                      <StatusBadge estado={p} tono={p === cobro ? (p === 'pendiente' ? 'advertencia' : 'exito') : 'neutro'} apariencia={p === cobro ? 'solido' : 'suave'} etiqueta={t(`cobro.${p}`)} />
                    </li>
                  ))}
                </ol>
                {codigo && (
                  <div className="mt-4 rounded-lg border border-line bg-surface-muted p-3">
                    <p className="flex items-center gap-2 text-xs font-medium text-fg-secondary">
                      <KeyRound aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                      {t('codigo.titulo')}
                    </p>
                    <p className="mt-1 text-xl font-semibold tracking-[0.3em] tabular-nums text-fg">{codigo.codigo ?? '—'}</p>
                    <p className="mt-1 text-xs text-fg-muted">
                      {codigo.verificadoEn
                        ? t('codigo.verificado', { hora: formatDateTime(codigo.verificadoEn) })
                        : t('codigo.intentos', { n: codigo.intentosFallidos, max: MAX_INTENTOS_CODIGO })}
                    </p>
                    {!codigo.verificadoEn && codigo.intentosFallidos >= MAX_INTENTOS_CODIGO && (
                      <button type="button" className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'mt-2')} onClick={() => void reiniciarCodigo()} disabled={ocupado !== null}>
                        {t('codigo.reiniciar')}
                      </button>
                    )}
                    <p className="mt-2 text-xs text-fg-muted">{t('codigo.soloAdmin')}</p>
                  </div>
                )}
              </Tarjeta>
            )}

            <Tarjeta titulo={t('documentos.titulo')} icono={FileText}>
              <ListaDatos>
                {f.pedidoWebId && <FilaDato etiqueta={t('documentos.pedido')} valor={f.pedido ?? '—'} href={`/app/pos/pedidos-online/${encodeURIComponent(f.pedidoWebId)}`} tono="enlace" />}
                <FilaDato etiqueta={t('documentos.guia')} valor={e?.tracking_number ?? '—'} />
                {detalle.cuadre && (
                  <FilaDato etiqueta={t('documentos.cuadre')} valor={t(`contraentrega.lineas.${detalle.cuadre.status}`)} href={`${RUTAS_LOGISTICA.cuadres}?cuadre=${encodeURIComponent(detalle.cuadre.settlement_id)}`} tono="enlace" />
                )}
              </ListaDatos>
              <Link href={RUTAS_LOGISTICA.seguimiento} className="mt-3 inline-flex text-sm font-medium text-link hover:underline">
                {t('documentos.verSeguimiento')}
              </Link>
            </Tarjeta>
          </div>
        </div>
      )}

      {f && asignar && (
        <HojaAsignarDomiciliario
          abierto
          onAbiertoChange={(v) => !v && setAsignar(false)}
          organizationId={organizationId}
          envios={[f]}
          sede={e && (e.branch as { name?: string } | null)?.name ? String((e.branch as { name?: string }).name) : null}
          onImprimirGuias={(lista, dom) => void imprimirGuias(lista, dom)}
          onAsignado={recargar}
        />
      )}
      {f && (
        <>
          <DialogoEntregar
            abierto={entregar}
            onAbiertoChange={setEntregar}
            envio={f}
            onEntregado={(r) => {
              if (e) void avisarCliente({ source_type: e.source_type, source_id: e.source_id }, r.aviso);
              recargar();
            }}
          />
          <DialogoNovedad
            abierto={novedad}
            onAbiertoChange={setNovedad}
            shipmentId={f.id}
            onRegistrada={() => {
              // La RPC devuelve aviso «novedad»: la ruta aviso-estado lo envía con `{ momento: 'novedad' }`.
              if (e) void avisarCliente({ source_type: e.source_type, source_id: e.source_id }, 'novedad');
              recargar();
            }}
          />
          <DialogoDireccion abierto={direccion} onAbiertoChange={setDireccion} envio={f} onGuardada={recargar} />
          <ConfirmDialog
            abierto={confirmar !== null}
            onAbiertoChange={(v) => !v && ocupado === null && setConfirmar(null)}
            titulo={confirmar === 'devolver' ? t('devolver.titulo') : t('cancelar.titulo')}
            descripcion={confirmar === 'devolver' ? t('devolver.descripcion') : t('cancelar.descripcion')}
            textoConfirmar={confirmar === 'devolver' ? t('devolver.confirmar') : t('cancelar.confirmar')}
            textoCancelar={t('volver')}
            tono="peligro"
            icono={confirmar === 'devolver' ? RotateCcw : Ban}
            cargando={ocupado === 'devolver' || ocupado === 'cancelar'}
            onConfirmar={() => void cambiar(confirmar === 'devolver' ? 'returned' : 'cancelled', confirmar ?? 'cancelar')}
          />
        </>
      )}
    </div>
  );
}

// ── Línea de tiempo ─────────────────────────────────────────────────────────────

function LineaDeTiempo({
  pasos,
  formatTime,
  formatDateTime,
}: {
  pasos: readonly PasoLinea[];
  formatTime: (v: string) => string;
  formatDateTime: (v: string) => string;
}) {
  const t = useTranslations('logistica.envio');
  return (
    <Tarjeta titulo={t('linea.titulo')} icono={Clock}>
      {pasos.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('linea.vacia')}</p>
      ) : (
        <ol className="flex flex-col">
          {pasos.map((p, i) => {
            const Icono = p.estado === 'hecho' || p.estado === 'actual' ? CircleCheck : p.estado === 'fallo' ? CircleX : Circle;
            return (
              <li key={p.clave} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <Icono
                    aria-hidden="true"
                    className={cn(
                      'size-5 shrink-0',
                      p.estado === 'hecho' && 'text-success-text',
                      p.estado === 'actual' && 'text-brand',
                      p.estado === 'fallo' && 'text-danger-text',
                      p.estado === 'pendiente' && 'text-fg-muted',
                    )}
                    strokeWidth={1.75}
                  />
                  {i < pasos.length - 1 && <span aria-hidden="true" className="my-1 w-px flex-1 bg-line" />}
                </div>
                <div className={cn('min-w-0 flex-1 pb-4', p.estado === 'pendiente' && 'opacity-60')}>
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <EstadoEnvioBadge estado={p.canonico} etiqueta={p.intento ? t('linea.intento', { estado: t(`estados.${p.canonico}`), n: p.intento }) : undefined} />
                    <span className="text-xs text-fg-muted">{p.hora ? formatTime(p.hora) : t('linea.porVenir')}</span>
                  </p>
                  {(p.descripcion || p.motivo) && (
                    <p className="mt-1 text-xs text-fg-secondary" title={p.hora ? formatDateTime(p.hora) : undefined}>
                      {[p.motivo ? (t.has(`motivos.${p.motivo}`) ? t(`motivos.${p.motivo}`) : p.motivo) : null, p.descripcion].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Tarjeta>
  );
}

// ── Prueba de entrega (Figma 2799:7669) ─────────────────────────────────────────

function PruebaEntrega({
  detalle,
  formatDateTime,
  fmt,
  evidencias,
}: {
  detalle: DetalleEnvio;
  formatDateTime: (v: string) => string;
  fmt: (v: number) => string;
  evidencias: EvidenciasEnvio;
}) {
  const t = useTranslations('logistica.envio.prueba');
  const tE = useTranslations('logistica.envio');
  const p = detalle.prueba;
  const foto = p?.photo_urls?.[0] ?? null;
  // Enlaces firmados de corta duración (bucket privado): sin enlace, la tarjeta no es clicable.
  const enlaceFoto = evidencias.enlace(foto);
  const enlaceFirma = evidencias.enlace(p?.signature_url);
  const ubicacion = p?.latitude != null && p?.longitude != null ? `https://www.google.com/maps?q=${p.latitude},${p.longitude}` : null;
  const tiles: { id: string; icono: typeof Camera; titulo: string; detalle: string; href?: string | null }[] = [
    { id: 'foto', icono: Camera, titulo: t('foto'), detalle: p ? (foto ? t('fotoTomada') : t('sinFoto')) : t('pendiente'), href: enlaceFoto },
    {
      id: 'firma',
      icono: PenLine,
      titulo: p?.delivery_code_verified ? t('codigoValidado') : t('firmaOCodigo'),
      detalle: p ? (p.delivery_code_verified ? t('validadoCliente') : p.signature_url ? t('firmaTomada') : t('sinFirma')) : detalle.fila.codigoRequerido ? t('codigoCuatro') : t('pendiente'),
      href: enlaceFirma,
    },
    { id: 'quien', icono: UserCheck, titulo: t('quien'), detalle: p ? p.recipient_name : t('pendiente') },
    { id: 'ubicacion', icono: MapPin, titulo: t('ubicacion'), detalle: ubicacion ? t('verMapa') : p ? t('sinUbicacion') : t('alConfirmar'), href: ubicacion },
  ];
  return (
    <Tarjeta titulo={t('titulo')} icono={Camera}>
      {p && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
          <EstadoEnvioBadge estado="delivered" />
          {formatDateTime(p.delivered_at)}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((x) => {
          const contenido = (
            <>
              <x.icono aria-hidden="true" className="size-5 text-fg-muted" strokeWidth={1.5} />
              <span className="text-sm font-medium text-fg">{x.titulo}</span>
              <span className="text-xs text-fg-muted">{x.detalle}</span>
            </>
          );
          return x.href ? (
            <a key={x.id} href={x.href} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 rounded-lg border border-line bg-surface-muted p-3 text-center hover:bg-hover">
              {contenido}
            </a>
          ) : (
            <div key={x.id} className="flex flex-col items-center gap-1 rounded-lg border border-line bg-surface-muted p-3 text-center">
              {contenido}
            </div>
          );
        })}
      </div>
      {p ? (
        <ListaDatos className="mt-3">
          <FilaDato etiqueta={t('recibio')} valor={[p.recipient_name, p.recipient_relationship ? (tE.has(`entregar.relaciones.${p.recipient_relationship}`) ? tE(`entregar.relaciones.${p.recipient_relationship}`) : p.recipient_relationship) : null].filter(Boolean).join(' · ')} />
          {documentoOculto(p.recipient_doc_number) && <FilaDato etiqueta={t('documento')} valor={t('terminadoEn', { tipo: p.recipient_doc_type ?? '', fin: documentoOculto(p.recipient_doc_number) ?? '' })} />}
          {p.cod_collected_amount != null && (
            <FilaDato
              etiqueta={t('cobro')}
              valor={[p.cod_collected_method ? tE(`entregar.medios.${p.cod_collected_method}`) : null, fmt(Number(p.cod_collected_amount))].filter(Boolean).join(' ')}
            />
          )}
          {p.notes && <FilaDato etiqueta={t('notas')} valor={p.notes} />}
        </ListaDatos>
      ) : (
        <p className="mt-3 text-xs text-fg-muted">{t('ayuda')}</p>
      )}
    </Tarjeta>
  );
}
