'use client';

import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { esDomicilio, tipoEntregaEfectivo } from '@/lib/pos/pedidosWeb/tipoEntrega';
import { useParams } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import KitchenService from '@/lib/services/kitchenService';
import { webOrdersService } from '@/lib/services/webOrdersService';
import { imprimirComanda, textosImpresionDe } from '@/lib/pos/cocina/imprimirComanda';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DollarSign, Loader2, Repeat } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { useWebOrderDetail } from './hooks/useWebOrderDetail';
import { useTrazabilidadPedido } from './hooks/useTrazabilidadPedido';
import { useCambiosPedido } from './hooks/useCambiosPedido';
import { bloqueoPorEstado } from '@/lib/services/webOrderChanges/cotizarCambio';
import {
  OrderHeader,
  OrderLoadingState,
  OrderNotFoundState,
  OrderProductsCard,
  OrderNotesCard,
  OrderTimelineCard,
  OrderActionsCard,
  OrderCustomerCard,
  OrderDeliveryCard,
  OrderPaymentsCard,
  CambiarProductosDialog,
  OrderDocumentsCard,
  ConfirmOrderDialog,
  CancelOrderDialog,
  CobrarPedidoDialog,
} from './components';
import { AssignDeliveryDialog, cobroDelPedido } from '@/components/pos/pedidos-online';
import { ValoracionVisitaCard } from '@/components/pos/mesas/solicitudes/ValoracionVisitaCard';
import { usePermissionContext } from '@/hooks/usePermissionContext';
import { AvisoAnticipoPendiente, TarjetaContraentrega, pagoDelAnticipo } from '@/components/pos/pedidos-online/contraentrega/TarjetaContraentrega';
import { PanelAnticipoVencido, TarjetaAnticipoVencido } from '@/components/pos/pedidos-online/anticipoVencido/AnticipoVencidoDetalle';
import { anticipoPagadoVencido } from '@/lib/pos/pedidosWeb/anticipoVencido';
import { seCobraAlEntregar } from '@/lib/pos/pedidosWeb/contraentregaPedido';
import { claveRubro } from '@/lib/pos/pedidosWeb/rubroPedidos';
import { useRubroPedidos } from '@/components/pos/pedidos-online/rubroPedidosUi';
import { useIntentosPago } from '@/components/pos/pedidos-online/pagos/useIntentosPago';
import { BotonReenviarEnlace } from '@/components/pos/pedidos-online/pagos/TarjetaPagosIntentos';
import { estadoTarjetaPagos } from '@/lib/pos/pedidosWeb/intentosPago';
import { cn } from '@/utils/Utils';
import { FranjaRevisionFactura, TarjetaFacturaPedido } from '@/components/clientes/facturacion/TarjetaFacturaPedido';
import { TarjetaEntregaEnvio } from './components/TarjetaEntregaEnvio';
import { useEnvioDelPedido } from './hooks/useEnvioDelPedido';
import { DialogoImprimirGuias } from '@/components/logistica/envios/DialogosEnvios';
import { DialogoEntregar } from '@/components/logistica/envio/DialogosEnvio';
import { useImpresionLogistica } from '@/components/logistica/useImpresionLogistica';
import { avisarCliente } from '@/components/logistica/logisticaApi';
import { accionMarcarEntregado, bloqueoCobroSimple, envioActivo, envioSinSalir, montoCobrarYEntregar } from '@/lib/pos/pedidosWeb/entregaEnvio';

/** Ancla de la tarjeta «Pagos»: «Ver el anticipo» de la contraentrega lleva ahí. */
const ID_PAGOS_PEDIDO = 'pagos-del-pedido';
/** Ancla de «Pago contra entrega»: «Ver «Pago contra entrega»» de la tarjeta «Pagos» lleva ahí. */
const ID_CONTRAENTREGA = 'pago-contra-entrega';
const irA = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export default function WebOrderDetailPage() {
  const params = useParams();
  const orderId = params?.id as string;
  // Anticipo pagado con el pedido vencido (Figma 3181-202769 › 05–08): diálogos de la página.
  const [reactivarAbierto, setReactivarAbierto] = useState(false);
  const [devolverAbierto, setDevolverAbierto] = useState(false);
  const { timezone } = useOrgTimezone();

  const {
    order,
    loading,
    actionLoading,
    organizationId,
    confirmDialogOpen,
    setConfirmDialogOpen,
    cancelDialogOpen,
    setCancelDialogOpen,
    assignDeliveryOpen,
    setAssignDeliveryOpen,
    cancelReason,
    setCancelReason,
    prepTime,
    setPrepTime,
    transitTime,
    setTransitTime,
    markAsPaid,
    setMarkAsPaid,
    handleConfirmOrder,
    handleRejectOrder,
    handleStartPreparing,
    handleMarkReady,
    handleStartDelivery,
    handleMarkDelivered,
    handleCancelOrder,
    handleConvertToSale,
    handleCreateShipment,
    handleCobrar,
    handleMarcarPagadoPasarela,
    puedeMarcarPagado,
    cobroDialogo,
    abrirCobro,
    cerrarCobro,
    avisoStock,
    sinCajaAbierta,
    avisoTiempos,
    loadOrder,
  } = useWebOrderDetail(orderId);
  const t = useTranslations('pedidoWeb');
  const { checker, context: permisoCtx } = usePermissionContext();
  const puedeQuitarPromocion = checker.can('pos.promotions.remove') || permisoCtx?.roleId === 1 || permisoCtx?.roleId === 2;
  const tCocina = useTranslations('posCocina');
  // En una tienda la comanda es la «orden de alistamiento» (solo el texto).
  const rubro = useRubroPedidos();
  const { toast } = useToast();
  const trazabilidad = useTrazabilidadPedido(order);
  const cambios = useCambiosPedido(orderId, organizationId);
  const intentosPago = useIntentosPago(order);
  // Zona de la sede del pedido: la misma con que la tarjeta «Pagos» pinta las horas.
  const { timezone: zonaSede } = useFormatDate(order?.branch_id);
  const [cambioAbierto, setCambioAbierto] = useState(false);
  // Tarjeta «Entrega» con el envío real (Figma 3236-223013): el envío, «Ver guía» y la entrega de Logística.
  const envioPedido = useEnvioDelPedido(order, organizationId);
  const { imprimirGuias } = useImpresionLogistica();
  const tEntrega = useTranslations('pedidoWebEntrega');
  const [verGuiaAbierto, setVerGuiaAbierto] = useState(false);
  const [entregarAbierto, setEntregarAbierto] = useState(false);
  // «Cobrar y entregar» con envío activo: el mismo registro de entrega, cobrando en la caja.
  const [entregarConCobro, setEntregarConCobro] = useState(false);

  // Estado de carga
  if (loading) {
    return <OrderLoadingState />;
  }

  // Pedido no encontrado
  if (!order) {
    return <OrderNotFoundState />;
  }

  // Caja de la sede a la que entra el cobro (fn_caja_abierta_para, la regla de la RPC).
  // Sin E4 aplicada el cobro usa el respaldo sin caja: no se anuncia caja ni se bloquea.
  const cobro = cobroDelPedido(order);
  const anticipoVencido = anticipoPagadoVencido(order);
  const pagadoAnticipoEn = anticipoVencido ? pagoDelAnticipo(order, trazabilidad.pagos)?.fecha ?? null : null;
  // «Cambiar productos»: pagado, sin despachar, no de mesa, con permiso y sin líneas libres.
  const puedeCambiarProductos =
    cambios.puedeCambiar &&
    (bloqueoPorEstado(order) === null || cambios.abierto !== null) &&
    (order.items ?? []).every((i) => i.product_id);
  const sede = order.branch?.name ?? '';
  const cajaConocida = trazabilidad.cobroEnCaja && trazabilidad.cajaId !== null;
  const sinCaja = trazabilidad.cobroEnCaja && !trazabilidad.cargando && (trazabilidad.cajaId === null || sinCajaAbierta);
  const cajaEtiqueta = cajaConocida ? t('cobro.entraACaja', { caja: trazabilidad.cajaId ?? '', sede }) : null;
  const cajaDeLaSede = cajaConocida ? t('pagos.cajaAbierta', { caja: trazabilidad.cajaId ?? '', sede }) : null;
  // Pago rechazado (diseño 2026-11-24, captura 05): en el celular «Pagos» sube arriba de Productos
  // y «Reenviar enlace por WhatsApp» va en la barra fija de abajo.
  const estadoPagos = estadoTarjetaPagos(order, intentosPago.intentos);
  const pagoRechazado = estadoPagos === 'C' || estadoPagos === 'C2';

  // «Imprimir comanda»: la comanda del pedido, por el mismo camino que Comandas.
  const imprimir = async () => {
    if (!trazabilidad.comandaId || !organizationId) return;
    const c = await KitchenService.getTicket(organizationId, trazabilidad.comandaId);
    if (!c) {
      toast({ title: t(claveRubro('ficha.imprimirError', rubro)), variant: 'destructive' });
      return;
    }
    try {
      const r = await imprimirComanda(c, textosImpresionDe((k, v) => tCocina(k, v)));
      toast(r.enqueued > 0 ? { title: t(claveRubro('ficha.imprimirEnviado', rubro), { id: c.id }) } : { title: t(claveRubro('ficha.imprimirSinImpresora', rubro)), variant: 'destructive' });
    } catch {
      toast({ title: t(claveRubro('ficha.imprimirError', rubro)), variant: 'destructive' });
    }
  };
  // Envío del pedido (si lo hay) y qué hace «Marcar entregado» (decisión 4 del 2026-11-25): con
  // envío activo abre el registro de entrega de Logística, para que pedido y envío no diverjan.
  const envio = envioPedido.envio;
  const filaEnvio = envio?.fila ?? null;
  const activo = envioActivo(envio?.envio.status);
  const marcarEntregado = () => {
    const accion = accionMarcarEntregado(envio?.envio.status);
    if (accion === 'pedido') return void handleMarkDelivered();
    if (accion === 'logistica') {
      setEntregarConCobro(false);
      return setEntregarAbierto(true);
    }
    toast({ title: tEntrega('entregar.bloqueado'), description: tEntrega('entregar.bloqueadoNota'), variant: 'destructive' });
  };
  // «Cobrar y entregar» (decisión del dueño 2026-11-25): con envío activo abre el MISMO registro de
  // entrega de Logística y cobra en la caja en un solo paso; sin envío activo, el cobro de siempre.
  const cobrarYEntregar = () => {
    const accion = accionMarcarEntregado(envio?.envio.status);
    if (accion === 'pedido') return abrirCobro(true);
    if (accion === 'logistica') {
      setEntregarConCobro(true);
      return setEntregarAbierto(true);
    }
    toast({ title: tEntrega('entregar.bloqueado'), description: tEntrega('entregar.bloqueadoNota'), variant: 'destructive' });
  };
  // «Cobrar» sin entregar (migración 20261125195945, sin doble cobro): con la contraentrega del envío
  // viva la caja no cobra aparte —la base lo rechaza—. Se avisa y, si el paquete sigue en la oficina,
  // se ofrece «Cobrar y entregar», que entrega y cobra en un paso.
  const cobrarSinEntregar = () => {
    const bloqueo = bloqueoCobroSimple(envio?.envio ?? null);
    if (!bloqueo) return abrirCobro(false);
    const ofrecer =
      bloqueo === 'en_envio' &&
      accionMarcarEntregado(envio?.envio.status) === 'logistica' &&
      envioSinSalir(envio?.envio.status);
    toast({
      title: t('cobro.error'),
      description: t(bloqueo === 'en_cuadre' ? 'cobro.contraentregaEnCuadre' : 'cobro.contraentregaEnEnvio'),
      variant: 'destructive',
      action: ofrecer ? (
        <ToastAction altText={t('cobro.cobrarYEntregar')} onClick={cobrarYEntregar}>
          {t('cobro.cobrarYEntregar')}
        </ToastAction>
      ) : undefined,
    });
  };
  const envioParaGuia = filaEnvio
    ? [{ id: filaEnvio.id, numero: filaEnvio.numero, status: filaEnvio.status, pedido: filaEnvio.pedido, branchId: filaEnvio.branchId, sourceType: 'web_order', sourceId: order.id, pagado: filaEnvio.pagado, sede: order.branch?.name ?? null }]
    : [];
  const esComerAqui = tipoEntregaEfectivo(order) === 'dine_in';
  const tarjetaEntrega = (className?: string) => (
    <TarjetaEntregaEnvio
      className={className}
      order={order}
      envio={envio}
      cargando={envioPedido.cargando}
      error={envioPedido.error}
      onAsignar={() => setAssignDeliveryOpen(true)}
      onCrearEnvio={() => void handleCreateShipment().then(envioPedido.recargar)}
      onVerGuia={filaEnvio ? () => setVerGuiaAbierto(true) : undefined}
      onImprimirGuia={filaEnvio ? () => void imprimirGuias([filaEnvio]) : undefined}
    />
  );

  const reenviarAviso = async () => {
    await webOrdersService.avisarCambioEstado(order.id);
    toast({ title: t('ficha.avisoReenviado') });
  };

  const confirmarCobro = async (valor: { metodo: string | null; referencia: string | null }) => {
    const hecho = await handleCobrar(cobroDialogo.entregar, valor);
    if (!hecho) void trazabilidad.recargar();
  };

  // Tarjeta «Pagos»: la de la columna lateral y, con pago rechazado, la copia de arriba en el celular.
  const tarjetaPagos = (movil: boolean) => (
    <OrderPaymentsCard
      order={order}
      pagos={trazabilidad.pagos}
      porCobrarEnCaja={cobro.puedeCobrar}
      cajaEtiqueta={cajaDeLaSede}
      cambios={cambios.cambios}
      onVerCambio={() => setCambioAbierto(true)}
      onReembolsoHecho={
        cambios.puedeReembolsar
          ? async (id) => {
              const r = await cambios.reembolsoHecho(id);
              toast(r.ok ? { title: t('cambio.reembolsoMarcado') } : { title: r.error ?? t('cambio.error'), variant: 'destructive' });
              void cambios.recargar();
            }
          : undefined
      }
      intentosPago={intentosPago}
      movil={movil}
      onVerContraentrega={() => irA(ID_CONTRAENTREGA)}
    />
  );

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <OrderHeader
        order={order}
        porCobrarEnCaja={cobro.puedeCobrar}
        reservaActiva={trazabilidad.reservaActiva}
        onCobrarYEntregar={cobro.cobraYEntrega ? cobrarYEntregar : undefined}
        cobrarDeshabilitado={sinCaja}
        isLoading={actionLoading}
        avisoStock={avisoStock}
        cajaEtiqueta={cajaDeLaSede}
        onImprimirComanda={trazabilidad.comandaId ? () => void imprimir() : undefined}
        onMarcarEntregado={['ready', 'in_delivery'].includes(order.status) ? marcarEntregado : undefined}
        onReenviarAviso={() => void reenviarAviso()}
        onCancelar={['pending', 'confirmed'].includes(order.status) || (['preparing', 'ready'].includes(order.status) && order.payment_status !== 'paid') ? () => setCancelDialogOpen(true) : undefined}
      />
      {/* Factura electrónica con otro documento que la ficha (Figma 06 Clientes 3193-20582): «Revisar» baja a la tarjeta. */}
      <FranjaRevisionFactura order={order} />
      {/* Contraentrega con anticipo pendiente (Figma 3014:194407 › 06): vence y se cancela solo. */}
      <AvisoAnticipoPendiente order={order} timezone={timezone} />
      {/* Anticipo pagado con el pedido vencido (Figma 3181-202769 › 05): reactivar o devolver. */}
      {anticipoVencido && (
        <PanelAnticipoVencido
          order={order}
          timezone={timezone}
          pagadoEn={pagadoAnticipoEn}
          reactivarAbierto={reactivarAbierto}
          onReactivarAbierto={setReactivarAbierto}
          devolverAbierto={devolverAbierto}
          onDevolverAbierto={setDevolverAbierto}
          onConfirmar={() => setConfirmDialogOpen(true)}
          onHecho={(ok, mensaje) => {
            toast(ok ? { title: mensaje } : { title: mensaje, variant: 'destructive' });
            if (ok) void loadOrder();
          }}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {pagoRechazado && <div className="lg:hidden">{tarjetaPagos(true)}</div>}
          {/* Celular (Figma 3236-223322): con el envío en la calle, «Entrega» va primero. */}
          {activo && !esComerAqui && <div className="lg:hidden">{tarjetaEntrega()}</div>}
          <OrderProductsCard order={order} puedeQuitarPromocion={puedeQuitarPromocion} onCambio={() => void loadOrder()} />
          <OrderNotesCard
            order={order}
            comandaId={trazabilidad.comandaId}
            onGuardarNotaInterna={async (texto) => {
              const ok = await webOrdersService.actualizarNotaInterna(order.id, texto);
              toast(ok ? { title: t('ficha.notaGuardada') } : { title: t('ficha.notaError'), variant: 'destructive' });
              if (ok) void loadOrder();
              return ok;
            }}
          />
          <OrderTimelineCard order={order} timezone={timezone} envio={envio} />
          <OrderDocumentsCard
            order={order}
            factura={trazabilidad.factura}
            comandaId={trazabilidad.comandaId}
            cajaEtiqueta={cajaDeLaSede}
          />
        </div>

        {/* Columna lateral */}
        <div className="space-y-6">
          <OrderActionsCard
            order={order}
            onConfirm={() => setConfirmDialogOpen(true)}
            onReject={() => setCancelDialogOpen(true)}
            onStartPreparing={handleStartPreparing}
            onMarkReady={handleMarkReady}
            onStartDelivery={handleStartDelivery}
            onMarkDelivered={marcarEntregado}
            onCancel={() => setCancelDialogOpen(true)}
            onConvertToSale={handleConvertToSale}
            onCobrar={(entregar) => (entregar ? cobrarYEntregar() : cobrarSinEntregar())}
            onMarcarPagadoPasarela={puedeMarcarPagado ? () => void handleMarcarPagadoPasarela() : undefined}
            onPrint={trazabilidad.comandaId ? () => void imprimir() : undefined}
            sinCajaAbierta={sinCaja}
            cajaEtiqueta={cajaEtiqueta}
            isLoading={actionLoading}
          />
          {/* Envío activo: «Entrega» va justo bajo «Acciones» (Figma 3236-223044). */}
          {activo && !esComerAqui && tarjetaEntrega('hidden lg:block')}
          {puedeCambiarProductos && (
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true })}
              onClick={() => setCambioAbierto(true)}
            >
              <Repeat className="size-4" aria-hidden="true" />
              {cambios.abierto?.estado === 'pending_payment' ? t('cambio.verLink') : t('cambio.boton')}
            </button>
          )}
          {/* «Pago contra entrega» (Figma 3014:194407 › 05/06): solo en pedidos contraentrega. */}
          <div id={ID_CONTRAENTREGA} className="scroll-mt-20 empty:hidden">
            {anticipoVencido ? (
              <TarjetaAnticipoVencido
                order={order}
                timezone={timezone}
                pagadoEn={pagadoAnticipoEn}
                onReactivar={() => setReactivarAbierto(true)}
                onDevolver={() => setDevolverAbierto(true)}
              />
            ) : (
              <TarjetaContraentrega
                order={order}
                timezone={timezone}
                onCambio={() => void loadOrder()}
                pagos={trazabilidad.pagos}
                onVerAnticipo={() => irA(ID_PAGOS_PEDIDO)}
                onRegistrarCobro={cobro.puedeCobrar && !sinCaja ? cobrarSinEntregar : undefined}
              />
            )}
          </div>
          {/* «Pagos» arriba de Cliente y Entrega (Figma 2725:192149). Con pago rechazado, en el celular va arriba. */}
          <div id={ID_PAGOS_PEDIDO} className={cn('scroll-mt-20', pagoRechazado && 'hidden lg:block')}>
            {tarjetaPagos(false)}
          </div>
          <OrderCustomerCard order={order} />
          {/* «Factura electrónica» (Figma 06 Clientes 3193-20582): lo que pidió el comprador y la revisión. */}
          <TarjetaFacturaPedido order={order} onCambio={() => void loadOrder()} />
          {/* Carta QR: lo que la mesa valoró al terminar la visita. */}
          {order.table_session_id && <ValoracionVisitaCard tableSessionId={order.table_session_id} />}
          {/* «Comer aquí» conserva su tarjeta (mesa); a domicilio y recoger, la del envío real. */}
          {esComerAqui ? <OrderDeliveryCard order={order} /> : !activo && tarjetaEntrega()}
        </div>
      </div>

      {/* Móvil (Figma 1982:946211): «Cobrar y entregar» fijo abajo; con pago rechazado, «Reenviar
          enlace por WhatsApp» (captura 05). Si aplican los dos, van uno encima del otro. */}
      {(cobro.cobraYEntrega || pagoRechazado) && (
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-surface p-4 sm:hidden">
          {pagoRechazado && estadoPagos && (
            <BotonReenviarEnlace order={order} estado={estadoPagos} datos={intentosPago} timezone={zonaSede} tamano="lg" />
          )}
          {cobro.cobraYEntrega && (
            <button
              type="button"
              className={clasesBoton({ variante: 'primario', tamano: 'lg', anchoCompleto: true })}
              onClick={cobrarYEntregar}
              disabled={actionLoading || sinCaja}
            >
              {actionLoading ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <DollarSign className="size-5" aria-hidden="true" />}
              {t('cobro.cobrarYEntregar')}
            </button>
          )}
        </div>
      )}

      {/* Diálogos */}
      <ConfirmOrderDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        prepTime={prepTime}
        onPrepTimeChange={setPrepTime}
        transitTime={transitTime}
        onTransitTimeChange={setTransitTime}
        isDelivery={esDomicilio(order?.delivery_type)}
        onConfirm={handleConfirmOrder}
        markAsPaid={markAsPaid}
        // Contraentrega con anticipo: el resto se cobra al entregar, no al confirmar (sin casilla).
        onMarkAsPaidChange={seCobraAlEntregar(order) ? undefined : setMarkAsPaid}
        isLoading={actionLoading}
        yaPagado={order.payment_status === 'paid'}
        avisoTiempos={avisoTiempos}
      />

      <CobrarPedidoDialog
        order={order}
        abierto={cobroDialogo.abierto}
        onAbiertoChange={(abierto) => (abierto ? abrirCobro(cobroDialogo.entregar) : cerrarCobro())}
        entregar={cobroDialogo.entregar}
        cajaId={trazabilidad.cajaId}
        cobroEnCaja={trazabilidad.cobroEnCaja}
        cargando={actionLoading}
        onConfirmar={confirmarCobro}
      />

      <CancelOrderDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        orderStatus={order.status}
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onConfirm={order.status === 'pending' ? handleRejectOrder : handleCancelOrder}
        isLoading={actionLoading}
      />

      {organizationId && puedeCambiarProductos && (
        <CambiarProductosDialog
          order={order}
          organizationId={organizationId}
          abierto={cambioAbierto}
          onAbiertoChange={(v) => {
            setCambioAbierto(v);
            if (!v) void cambios.recargar();
          }}
          cambios={cambios}
          onAplicado={() => {
            void loadOrder();
            void trazabilidad.recargar();
          }}
        />
      )}

      {/* Diálogo de asignación de delivery */}
      {organizationId && (
        <AssignDeliveryDialog
          open={assignDeliveryOpen}
          onOpenChange={setAssignDeliveryOpen}
          webOrderId={order.id}
          organizationId={organizationId}
          onAssigned={() => {
            void loadOrder();
            envioPedido.recargar();
          }}
        />
      )}

      {/* «Ver guía» (Figma 3238-228068): el diálogo de Logística con el MISMO rótulo que se imprime. */}
      {filaEnvio && (
        <DialogoImprimirGuias
          abierto={verGuiaAbierto}
          onAbiertoChange={setVerGuiaAbierto}
          envios={envioParaGuia}
          onImprimir={async (opciones) => {
            await imprimirGuias([filaEnvio], null, opciones);
          }}
        />
      )}

      {/* «Marcar entregado» y «Cobrar y entregar» con envío activo: el registro de entrega de
          Logística (código, quién recibe, cobro); con cobro, entra a la caja en la misma transacción. */}
      {filaEnvio && activo && (
        <DialogoEntregar
          abierto={entregarAbierto}
          onAbiertoChange={setEntregarAbierto}
          envio={filaEnvio}
          cobroEnCaja={
            entregarConCobro
              ? { order, monto: montoCobrarYEntregar(order, envio?.envio ?? null), cajaEtiqueta: cajaDeLaSede }
              : null
          }
          onEntregado={(r) => {
            if (envio) void avisarCliente({ source_type: envio.envio.source_type, source_id: envio.envio.source_id }, r.aviso);
            void loadOrder();
            envioPedido.recargar();
            if (r.cobradoEnCaja) void trazabilidad.recargar();
          }}
        />
      )}
    </div>
  );
}
