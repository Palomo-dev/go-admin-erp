'use client';

/**
 * Tarjeta «Entrega» con el envío real (Figma «05 POS y ventas», sección 3236-223013; computador
 * 3236-223044, celular 3236-223322, nueve estados 3239-226714, lámina 3239-356273). Aprobada por
 * el dueño el 2026-11-25.
 *
 * Muestra el envío de Logística tal cual: la guía (`shipment_number`, DEL-WO-…; nunca el TRK
 * interno), el estado en palabras con la insignia de Logística, el domiciliario con la placa que
 * quedó congelada al asignar (o la transportadora con su guía y enlace), paquetes, peso, frágil y
 * lo que se cobra en la puerta. Las reglas viven en `entregaEnvio.ts` (puro); las acciones son las
 * de Logística: el diálogo «Imprimir guías» (el mismo rótulo que se imprime), la impresión
 * (`useImpresionLogistica`), la hoja de asignación v3 y el detalle del envío. Recoger en tienda: sin
 * guía, «Listo para recoger».
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  DollarSign,
  ExternalLink,
  Eye,
  Info,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Printer,
  Repeat,
  RotateCcw,
  Store,
  Truck,
  UserPlus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AvatarIniciales, FilaDato, clasesBoton } from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { EstadoEnvioBadge } from '@/components/logistica/EstadoEnvioBadge';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { todayInTz, toPlainDate } from '@/lib/utils/dateCore';
import { cn } from '@/utils/Utils';
import type { WebOrder } from '@/lib/services/webOrdersService';
import type { EnvioDePedido } from '@/lib/services/logistica/despachoService';
import { enlaceWhatsApp } from '@/lib/services/contraentregaPedidoService';
import { enlaceComoLlegar, enlaceLlamar } from '@/lib/logistica/misEnvios';
import { rutaEnvio } from '@/lib/logistica/rutas';
import { vehiculoDelEnvio } from '@/lib/logistica/vehiculoAsignacion';
import { limpiarIndicaciones } from '@/lib/logistica/indicacionesEntrega';
import {
  cobroDeEntrega,
  enlaceRastreoTransportadora,
  esTransportadora,
  estadoTarjetaEntrega,
  puedeCambiarDomiciliario,
  type EstadoTarjetaEntrega,
} from '@/lib/pos/pedidosWeb/entregaEnvio';
import { IconoCabecera } from './IconoCabecera';

export interface TarjetaEntregaEnvioProps {
  order: WebOrder;
  envio: EnvioDePedido | null;
  cargando?: boolean;
  /** No se pudo leer el envío: no se ofrece crear otro. */
  error?: boolean;
  /** Abre la hoja de asignación de Logística (v3). */
  onAsignar?: () => void;
  /** Crea el envío del pedido y abre la asignación (domicilio propio sin envío). */
  onCrearEnvio?: () => void;
  onVerGuia?: () => void;
  onImprimirGuia?: () => void;
  className?: string;
}

const CAJA = 'rounded-lg border px-3 py-2.5';

export function TarjetaEntregaEnvio({ order, envio, cargando, error, onAsignar, onCrearEnvio, onVerGuia, onImprimirGuia, className }: TarjetaEntregaEnvioProps) {
  const t = useTranslations('pedidoWebEntrega');
  const tMotivo = useTranslations('logistica.envio.motivos');
  const tVehiculo = useTranslations('logistica.envio.vehiculos');
  const { formatear } = useMonedaOrganizacion();
  const { timezone, formatTime, formatDateTime } = useFormatDate(order.branch_id);

  const recoger = order.delivery_type === 'pickup';
  const f = envio?.fila ?? null;
  const e = envio?.envio ?? null;
  const extra = envio?.extra ?? null;
  const estado: EstadoTarjetaEntrega = estadoTarjetaEntrega(e?.status, recoger);
  const tercero = esTransportadora({ modo: e?.fulfillment_mode, deliveryType: order.delivery_type });
  const transportadora = extra?.carrier?.name?.trim() || order.delivery_partner?.trim() || null;
  const cobro = cobroDeEntrega(order, e, recoger);
  const sede = order.branch?.name ?? (e?.branch && !Array.isArray(e.branch) ? e.branch.name : null) ?? null;
  const esHoy = (iso: string) => toPlainDate(new Date(iso), timezone) === todayInTz(timezone);
  const hora = (iso: string | null | undefined) => (iso ? (esHoy(iso) ? formatTime(iso) : formatDateTime(iso)) : null);

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toastSuccess(t('copiado'));
    } catch {
      toastError(t('noCopiado'));
    }
  };

  // ── Cabecera: «Entrega» + estado del envío en palabras (tonos de la insignia de Logística). ──
  const insignia =
    estado === 'sin_envio' ? (
      <Badge tono="neutro" apariencia="contorno" tamano="sm">{t('estados.sin_envio')}</Badge>
    ) : estado === 'recoger' ? (
      <Badge tono="informacion" apariencia="contorno" tamano="sm">{order.ready_at ? t('estados.recoger') : t('estados.recogerPreparando')}</Badge>
    ) : (
      <EstadoEnvioBadge estado={e?.status} etiqueta={estado === 'en_camino' && tercero && e?.status !== 'out_for_delivery' ? t('estados.en_camino_transportadora') : t(`estados.${estado}`)} />
    );

  const tipoEntrega = recoger ? t('tipo.recoger') : tercero ? transportadora ?? t('tipo.transportadora') : t('tipo.propio');
  const fee = Number(order.delivery_fee) || 0;
  const pagadoEnvio = order.payment_status === 'paid' || order.advance_status === 'paid';

  const direccion = order.delivery_address;
  const indicaciones = limpiarIndicaciones(f?.instrucciones ?? direccion?.instructions ?? null);
  const bloqueDireccion = !recoger && (f?.direccion || direccion?.address) && (
    <div className="flex gap-2 text-[13px]">
      <MapPin className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-fg">{f?.direccion ?? direccion?.address}</p>
        <p className="text-fg-secondary">{[f?.barrio ?? direccion?.neighborhood, f?.ciudad ?? direccion?.city].filter(Boolean).join(' · ')}</p>
        {indicaciones && <p className="text-warning-text">{t('indicacion', { texto: indicaciones })}</p>}
      </div>
    </div>
  );

  const cajaCobro =
    cobro.tipo === 'cobrar' ? (
      <div className={cn(CAJA, 'border-line-warning bg-warning-subtle')}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-warning-text">
            <DollarSign className="size-4" aria-hidden="true" />
            {t('cobro.cobrar')}
          </span>
          <span className="text-base font-bold tabular-nums text-warning-text">{formatear(cobro.monto)}</span>
        </div>
        <p className="mt-0.5 text-xs text-fg-secondary">
          {recoger
            ? t('cobro.enCaja')
            : cobro.anticipo > 0
              ? t('cobro.saldo', { total: formatear(cobro.total), anticipo: formatear(cobro.anticipo) })
              : t('cobro.contraentrega')}
        </p>
      </div>
    ) : cobro.tipo === 'cobrado' ? (
      <div className={cn(CAJA, 'border-line-success bg-success-subtle')}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-success-text">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {t('cobro.cobrado')}
          </span>
          <span className="text-base font-bold tabular-nums text-success-text">{formatear(cobro.monto)}</span>
        </div>
        <p className="mt-0.5 text-xs text-fg-secondary">{t('cobro.cobradoNota')}</p>
      </div>
    ) : (
      <div className={cn(CAJA, 'border-line-success bg-success-subtle')}>
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-success-text">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {t('cobro.pagado')}
        </p>
        <p className="mt-0.5 text-xs text-fg-secondary">{t('cobro.pagadoNota')}</p>
      </div>
    );

  const cuerpo = () => {
    if (cargando && !envio) {
      return <p className="py-6 text-center text-xs text-fg-muted" aria-live="polite">{t('cargando')}</p>;
    }

    // 04i · Recoger en tienda (sin guía).
    if (estado === 'recoger') {
      const direccionSede = (order.branch as { address?: string | null } | undefined)?.address ?? null;
      return (
        <>
          <div className={cn(CAJA, 'border-line-info bg-info-subtle')}>
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-info-text">
              <Store className="size-4" aria-hidden="true" />
              {order.ready_at ? t('recoger.listoDesde', { hora: hora(order.ready_at) ?? '' }) : t('recoger.preparando')}
            </p>
            <p className="mt-0.5 text-xs text-fg-secondary">{t('recoger.nota', { pedido: order.order_number })}</p>
          </div>
          {(sede || direccionSede) && (
            <div className="flex gap-2 text-[13px]">
              <MapPin className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              <p className="text-fg">{[sede, direccionSede].filter(Boolean).join(' · ')}</p>
            </div>
          )}
          {cajaCobro}
          <div>
            {order.ready_at ? (
              <FilaDato tamano="sm" etiqueta={t('filas.listo')} valor={hora(order.ready_at)} />
            ) : (
              order.estimated_ready_at && <FilaDato tamano="sm" etiqueta={t('filas.listoAprox')} valor={hora(order.estimated_ready_at)} />
            )}
          </div>
        </>
      );
    }

    // 04a · Sin envío todavía.
    if (estado === 'sin_envio' || !e || !f) {
      const crear = !error && order.delivery_type === 'delivery_own' && ['confirmed', 'preparing', 'ready'].includes(order.status) && onCrearEnvio;
      return (
        <>
          <div className={cn(CAJA, 'border-line-info bg-info-subtle')}>
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-info-text">
              <Info className="size-4" aria-hidden="true" />
              {error ? t('sinEnvio.error') : t('sinEnvio.titulo')}
            </p>
            {!error && <p className="mt-0.5 text-xs text-fg-secondary">{t('sinEnvio.nota')}</p>}
          </div>
          {bloqueDireccion}
          {cajaCobro}
          {crear && (
            <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md', anchoCompleto: true })} onClick={onCrearEnvio}>
              <Truck className="size-4" aria-hidden="true" />
              {t('acciones.crearYAsignar')}
            </button>
          )}
        </>
      );
    }

    const vehiculo = vehiculoDelEnvio(e.metadata, envio?.vehiculo);
    const placa = vehiculo?.tipo === 'vehiculo' ? vehiculo.placa : null;
    const tipoVehiculo = vehiculo?.tipo === 'vehiculo' ? vehiculo.tipoVehiculo : null;
    const nombreTipoVehiculo = tipoVehiculo && tVehiculo.has(tipoVehiculo) ? tVehiculo(tipoVehiculo) : null;
    const domiciliario = f.domiciliario ?? envio?.domiciliario?.full_name ?? null;
    const telDomiciliario = envio?.domiciliario?.phone ?? (e.driver && !Array.isArray(e.driver) ? e.driver.phone : null) ?? null;
    const llamar = enlaceLlamar(telDomiciliario);
    const whatsapp = enlaceWhatsApp(telDomiciliario, t('whatsapp', { pedido: order.order_number }));
    const cambiar = puedeCambiarDomiciliario({ status: e.status, modo: e.fulfillment_mode }) && !!onAsignar;
    const guiaTercero = tercero ? e.tracking_number?.trim() || null : null;
    const rastreo = tercero ? enlaceRastreoTransportadora(extra?.external_tracking_url, extra?.carrier?.tracking_url_template, guiaTercero) : null;
    const paquetes = Math.max(1, Number(extra?.package_count) || 1);
    const peso = Number(extra?.weight_kg) || 0;
    const ultimoIntento = envio?.intentos[envio.intentos.length - 1] ?? null;
    const motivo = (codigo: string | null | undefined) => (codigo && tMotivo.has(codigo) ? tMotivo(codigo) : null);
    const salio = extra?.dispatched_at ?? extra?.picked_at ?? null;
    const mapa = estado === 'en_camino' && !tercero ? enlaceComoLlegar({ delivery_latitude: e.delivery_latitude, delivery_longitude: e.delivery_longitude, delivery_address: f.direccion, delivery_city: f.ciudad }) : null;

    return (
      <>
        {/* Número de guía: el impreso en la caja (DEL-WO-…), nunca el TRK interno. */}
        <div className={cn(CAJA, 'border-line bg-subtle')}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] text-fg-secondary">{tercero ? t('guia.nuestra') : t('guia.titulo')}</p>
              <p className="break-all font-mono text-[13px] font-semibold text-fg">{f.numero}</p>
            </div>
            <button type="button" aria-label={t('guia.copiar')} title={t('guia.copiar')} onClick={() => void copiar(f.numero)} className="rounded-md p-1 text-fg-secondary hover:bg-hover hover:text-fg">
              <Copy className="size-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-0.5 text-[11px] text-fg-muted">{[t('guia.creada', { hora: hora(f.creado) ?? '' }), sede].filter(Boolean).join(' · ')}</p>
        </div>

        {/* 04h · Transportadora: su propia guía y el enlace para rastrear. */}
        {tercero && guiaTercero && (
          <div className={cn(CAJA, 'border-line')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-fg-secondary">{transportadora ? t('guia.deTransportadora', { nombre: transportadora }) : t('guia.deTransportadoraSinNombre')}</p>
                <p className="break-all font-mono text-[13px] font-semibold text-fg">{guiaTercero}</p>
              </div>
              <button type="button" aria-label={t('guia.copiar')} title={t('guia.copiar')} onClick={() => void copiar(guiaTercero)} className="rounded-md p-1 text-fg-secondary hover:bg-hover hover:text-fg">
                <Copy className="size-4" aria-hidden="true" />
              </button>
            </div>
            {rastreo && (
              <a href={rastreo} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                {transportadora ? t('guia.rastrearEn', { nombre: transportadora }) : t('guia.rastrear')}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            )}
          </div>
        )}

        {/* Estados con caja propia: entregado, novedad, devuelto. */}
        {estado === 'entregado' && (
          <div className={cn(CAJA, 'border-line-success bg-success-subtle')}>
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-success-text">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {t('entregado.titulo', { hora: hora(envio?.prueba?.delivered_at ?? extra?.delivered_at ?? order.delivered_at) ?? '' })}
            </p>
            {envio?.prueba && (
              <p className="mt-0.5 text-xs text-fg-secondary">
                {[
                  t('entregado.recibio', { nombre: envio.prueba.recipient_name }),
                  envio.prueba.delivery_code_verified ? t('entregado.codigo') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
        )}
        {estado === 'novedad' && (
          <div className={cn(CAJA, 'border-line-warning bg-warning-subtle')}>
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-warning-text">
              <AlertTriangle className="size-4" aria-hidden="true" />
              {t('novedad.titulo', { n: Math.max(1, Number(e.failed_attempts) || envio?.intentos.length || 1) })}
            </p>
            <p className="mt-0.5 text-xs text-fg-secondary">
              {[
                ultimoIntento ? hora(ultimoIntento.attempted_at) : null,
                motivo(ultimoIntento?.failure_reason_code ?? e.exception_reason),
                ultimoIntento?.driver_notes ? `«${ultimoIntento.driver_notes}»` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="mt-0.5 text-xs text-fg-secondary">{t('novedad.desdeLogistica')}</p>
          </div>
        )}
        {estado === 'devuelto' && (
          <div className={cn(CAJA, 'border-line-danger bg-danger-subtle')}>
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-danger-text">
              <RotateCcw className="size-4" aria-hidden="true" />
              {t('devuelto.titulo')}
            </p>
            {motivo(e.exception_reason) && <p className="mt-0.5 text-xs text-fg-secondary">{t('devuelto.motivo', { motivo: motivo(e.exception_reason) ?? '' })}</p>}
            <p className="mt-0.5 text-xs text-fg-secondary">{t('devuelto.nota')}</p>
          </div>
        )}

        {/* Domiciliario (nombre, llamar y WhatsApp solo aquí dentro) + placa congelada al asignar. */}
        {!tercero &&
          (domiciliario ? (
            <div className="flex items-center gap-3">
              <AvatarIniciales nombre={domiciliario} tamano="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-fg">{domiciliario}</p>
                <p className="truncate text-xs text-fg-secondary">{[t('domiciliario.rol'), telDomiciliario].filter(Boolean).join(' · ')}</p>
                {(placa || nombreTipoVehiculo) && <p className="truncate text-xs text-fg-secondary">{[nombreTipoVehiculo, placa ? t('domiciliario.placa', { placa }) : null].filter(Boolean).join(' · ')}</p>}
              </div>
              {llamar && (
                <a href={llamar} aria-label={t('domiciliario.llamar', { nombre: domiciliario })} title={t('domiciliario.llamar', { nombre: domiciliario })} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                  <Phone className="size-4" aria-hidden="true" />
                </a>
              )}
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={t('domiciliario.whatsapp', { nombre: domiciliario })} title={t('domiciliario.whatsapp', { nombre: domiciliario })} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                  <MessageCircle className="size-4" aria-hidden="true" />
                </a>
              )}
            </div>
          ) : (
            estado === 'por_despachar' && (
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-subtle text-fg-muted">
                  <UserPlus className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-fg-secondary">{t('domiciliario.rol')}</p>
                  <p className="text-[13px] text-fg-muted">{t('domiciliario.sinAsignar')}</p>
                </div>
                {cambiar && (
                  <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} onClick={onAsignar}>
                    <UserPlus className="size-4" aria-hidden="true" />
                    {t('acciones.asignar')}
                  </button>
                )}
              </div>
            )
          ))}

        {estado !== 'entregado' && estado !== 'devuelto' && bloqueDireccion}

        {/* Paquetes, peso y frágil (shipments.is_fragile). */}
        <div className="flex flex-wrap gap-1.5">
          <Badge tono="neutro" apariencia="contorno" tamano="sm">{t('chips.paquetes', { count: paquetes })}</Badge>
          {peso > 0 && <Badge tono="neutro" apariencia="contorno" tamano="sm">{t('chips.peso', { kg: peso })}</Badge>}
          {extra?.is_fragile && <Badge tono="advertencia" apariencia="suave" tamano="sm">{t('chips.fragil')}</Badge>}
        </div>

        {estado !== 'devuelto' && estado !== 'cancelado' && cajaCobro}

        <div>
          {estado === 'por_despachar' && order.estimated_ready_at && <FilaDato tamano="sm" etiqueta={t('filas.listoAprox')} valor={hora(order.estimated_ready_at)} />}
          {f.asignado && estado !== 'entregado' && <FilaDato tamano="sm" etiqueta={t('filas.asignado')} valor={hora(f.asignado)} />}
          {salio && <FilaDato tamano="sm" etiqueta={tercero ? t('filas.entregadoTransportadora') : t('filas.salio')} valor={hora(salio)} />}
          {estado === 'entregado' ? (
            <FilaDato tamano="sm" etiqueta={t('filas.entregado')} valor={hora(extra?.delivered_at ?? envio?.prueba?.delivered_at ?? order.delivered_at)} />
          ) : (
            ['por_despachar', 'asignado', 'en_camino'].includes(estado) &&
            order.estimated_delivery_at && <FilaDato tamano="sm" etiqueta={t('filas.entregaAprox')} valor={hora(order.estimated_delivery_at)} />
          )}
        </div>

        {/* Acciones de Logística: el mismo rótulo, la misma impresión, la misma asignación. */}
        <div className="grid grid-cols-2 gap-2">
          {onVerGuia && (
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm', anchoCompleto: true })} onClick={onVerGuia}>
              <Eye className="size-4" aria-hidden="true" />
              {t('acciones.verGuia')}
            </button>
          )}
          {onImprimirGuia && (
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm', anchoCompleto: true })} onClick={onImprimirGuia}>
              <Printer className="size-4" aria-hidden="true" />
              {t('acciones.imprimirGuia')}
            </button>
          )}
          <Link href={rutaEnvio(f.id)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', anchoCompleto: true })}>
            <ExternalLink className="size-4" aria-hidden="true" />
            {t('acciones.verEnvio')}
          </Link>
          {cambiar && domiciliario ? (
            <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm', anchoCompleto: true })} onClick={onAsignar}>
              <Repeat className="size-4" aria-hidden="true" />
              {t('acciones.cambiar')}
            </button>
          ) : mapa ? (
            <a href={mapa} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'fantasma', tamano: 'sm', anchoCompleto: true })}>
              <Navigation className="size-4" aria-hidden="true" />
              {t('acciones.verMapa')}
            </a>
          ) : null}
        </div>
      </>
    );
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <IconoCabecera icono={Truck} />
          <span className="flex-1">{t('titulo')}</span>
          {!(cargando && !envio) && insignia}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Badge tono="informacion" apariencia="contorno" tamano="sm">{tipoEntrega}</Badge>
          {fee > 0 ? (
            <span className="text-[13px] text-fg">{pagadoEnvio ? t('envioPagado', { monto: formatear(fee) }) : t('envio', { monto: formatear(fee) })}</span>
          ) : (
            estado === 'recoger' && <span className="text-[13px] text-fg-secondary">{t('sinGuia')}</span>
          )}
        </div>
        {cuerpo()}
      </CardContent>
    </Card>
  );
}
