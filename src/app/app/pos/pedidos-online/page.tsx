'use client';

/**
 * Pedidos online — listado (Figma 447:195914, estados 448:202716 cargando,
 * 448:203467 sin resultados y 448:204070 error). Cabecera con «Confirmar
 * pendientes», seis KPI del periodo, buscador con filtros en chips, tabla con
 * la promesa de cada pedido («A tiempo») y paginación. La vista «Tablero»
 * conserva las columnas por estado.
 *
 * El periodo se calcula en la zona de la organización (nunca la del navegador)
 * y confirmar —uno o varios— pasa siempre por `webOrderConfirmationService`,
 * que crea la venta, la comanda y el cobro: no se cambia el estado a mano.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Bell,
  BellOff,
  CheckCircle,
  Clock,
  Coins,
  Download,
  Loader2,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Settings,
  ShoppingBag,
  TriangleAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BranchBadgeActiva,
  BulkActionBar,
  CampoFecha,
  FilterChips,
  FilterPanel,
  FormField,
  KpiStrip,
  ListToolbar,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  SegmentedControl,
  StatCard,
  type AccionFila,
  type AccionMasiva,
  type ChipFiltro,
  type EstadoTabla,
} from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { WebOrderCard } from '@/components/pos/pedidos-online/WebOrderCard';
import { WebCommerceObservability } from '@/components/pos/pedidos-online/WebCommerceObservability';
import { TablaPedidosOnline, metodoDePago } from '@/components/pos/pedidos-online/listado/TablaPedidosOnline';
import {
  webOrdersService,
  type WebOrder,
  type WebOrderStatus,
  type DeliveryType,
  type PaymentStatus,
  type OrderSource,
} from '@/lib/services/webOrdersService';
import { claveAvisoCobro, webOrderConfirmationService, type ErrorCobroEnCaja } from '@/lib/services/webOrderConfirmationService';
import { esDomicilio, mesaDelPedido, tipoEntregaEfectivo } from '@/lib/pos/pedidosWeb/tipoEntrega';
import { PERIODOS_LISTADO, rangosDelPeriodo, variacionPct, type PeriodoListado } from '@/lib/pos/pedidosWeb/listadoPedidos';
import { type EstimatedTime, type TimeUnit, timeToMs, formatEstimatedTime } from './[id]/components';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { todayInTz } from '@/lib/utils/dateCore';

interface FiltrosListado {
  status?: WebOrderStatus;
  delivery_type?: DeliveryType;
  source?: OrderSource;
  payment_status?: PaymentStatus;
}

const ESTADOS_FILTRO: readonly WebOrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered', 'cancelled'];
const ENTREGAS_FILTRO: readonly DeliveryType[] = ['delivery_own', 'delivery_third_party', 'pickup', 'dine_in'];
const ORIGENES_FILTRO: readonly OrderSource[] = ['website', 'mobile_app', 'whatsapp', 'phone'];
const PAGOS_FILTRO: readonly PaymentStatus[] = ['pending', 'paid', 'partial', 'refunded', 'failed'];

interface Estadisticas {
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  total_revenue: number;
  avg_order_value: number;
  unconfirmed_orders: number;
  on_time_pct: number | null;
}

/** Escapa texto del cliente antes de escribirlo en la ventana de impresión. */
function esc(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function PedidosOnlinePage() {
  const moneda = useMonedaOrganizacion();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('pedidosOnlineListado');
  const tPedido = useTranslations('pedidoWeb');
  const { getToday } = useFormatDate();
  const { timezone } = useOrgTimezone();
  const { organization } = useOrganization();
  const { branchFilter } = useBranch();
  const orgTypeId = organization?.type_id ?? 3; // por defecto, comercio

  // Tiempos por defecto según el tipo de organización:
  // restaurante (1) 30 min + 30 min; comercio (3) 1 día de empacado + 5 de entrega.
  const isRetail = orgTypeId === 3;

  const [orders, setOrders] = useState<WebOrder[]>([]);
  const [stats, setStats] = useState<Estadisticas | null>(null);
  const [previousStats, setPreviousStats] = useState<Estadisticas | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosListado>({});
  const [busqueda, setBusqueda] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('list');
  const [periodo, setPeriodo] = useState<PeriodoListado>('today');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [tamanoPagina, setTamanoPagina] = useState(20);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());

  // Diálogos. Confirmar admite varios pedidos («Confirmar pendientes»).
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; orderId: string | null }>({ open: false, orderId: null });
  const [rejectReason, setRejectReason] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; orderIds: string[] }>({ open: false, orderIds: [] });
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [prepTime, setPrepTime] = useState<EstimatedTime>(isRetail ? { value: 1, unit: 'days' } : { value: 30, unit: 'minutes' });
  const [transitTime, setTransitTime] = useState<EstimatedTime>(isRetail ? { value: 5, unit: 'days' } : { value: 30, unit: 'minutes' });
  const [actionLoading, setActionLoading] = useState(false);

  // El tipo de organización llega después del primer render: los tiempos por
  // defecto se ajustan cuando se conoce (antes quedaban siempre los de comercio).
  useEffect(() => {
    setPrepTime(isRetail ? { value: 1, unit: 'days' } : { value: 30, unit: 'minutes' });
    setTransitTime(isRetail ? { value: 5, unit: 'days' } : { value: 30, unit: 'minutes' });
  }, [isRetail]);

  // La columna «A tiempo» cuenta minutos: se refresca sola cada 30 s.
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const rangos = useCallback(
    () => rangosDelPeriodo(periodo, timezone, todayInTz(timezone), new Date(), { desde: customDateFrom, hasta: customDateTo }),
    [periodo, timezone, customDateFrom, customDateTo],
  );

  const loadOrders = useCallback(async () => {
    try {
      const { actual, anterior } = rangos();
      const consulta = {
        status: filtros.status ? [filtros.status] : undefined,
        delivery_type: filtros.delivery_type,
        source: filtros.source,
        payment_status: filtros.payment_status ? [filtros.payment_status] : undefined,
        search: busqueda.trim() || undefined,
        date_from: actual.from,
        date_to: actual.to,
        branch_id: branchFilter ?? undefined,
      };
      const [ordersData, statsData, prevStatsData] = await Promise.all([
        webOrdersService.getOrders(consulta),
        webOrdersService.getOrderStats(actual.from, actual.to, branchFilter ?? undefined),
        anterior ? webOrdersService.getOrderStats(anterior.from, anterior.to, branchFilter ?? undefined) : Promise.resolve(null),
      ]);
      setOrders(ordersData);
      setStats(statsData);
      setPreviousStats(prevStatsData);
      setErrorCarga(false);
      setAhora(new Date());
    } catch (error) {
      console.error('Error cargando pedidos online:', error);
      setErrorCarga(true);
    } finally {
      setLoading(false);
    }
  }, [filtros, busqueda, rangos, branchFilter]);

  useEffect(() => {
    setLoading(true);
    void loadOrders();
  }, [loadOrders]);

  // Volver a la primera página cuando cambia lo que se pide.
  useEffect(() => {
    setCurrentPage(1);
  }, [filtros, busqueda, periodo, customDateFrom, customDateTo, branchFilter]);

  // Actualización automática cada 30 s.
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => void loadOrders(), 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadOrders]);

  // Tiempo real, con debounce de 800 ms para agrupar ráfagas de cambios.
  useEffect(() => {
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        void loadOrders();
      }, 800);
    };

    webOrdersService.subscribeToOrders((payload) => {
      if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
        if (soundEnabled) playNotificationSound();
        toast({ title: t('nuevoPedido'), description: t('nuevoPedidoDetalle', { numero: payload.new.order_number }) });
      }
      scheduleReload();
    }, branchFilter);

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      webOrdersService.unsubscribeFromOrders();
    };
  }, [soundEnabled, loadOrders, toast, branchFilter, t]);

  const playNotificationSound = () => {
    try {
      const audio = new Audio('/sounds/notification.mp3');
      audio.play().catch(() => {});
    } catch {
      /* sin audio en este navegador */
    }
  };

  // ── Confirmar (uno o varios) ────────────────────────────────────────────
  const confirmarUno = async (orderId: string): Promise<{ ok: boolean; numero: string }> => {
    const order = await webOrdersService.getOrderById(orderId);
    if (!order) throw new Error(tPedido('orderNotFoundState.pedidoNoEncontrado'));
    const result = await webOrderConfirmationService.confirmOrder(order, {
      prepMs: timeToMs(prepTime),
      transitMs: esDomicilio(order.delivery_type) ? timeToMs(transitTime) : 0,
      markAsPaid,
    });
    if (!result.yaConfirmado) void webOrdersService.avisarCambioEstado(order.id, 'confirmed');
    if (confirmDialog.orderIds.length === 1) {
      if (result.yaConfirmado) {
        toast({ title: tPedido('confirmacion.yaConfirmado'), description: tPedido('confirmacion.yaConfirmadoDetalle') });
        return { ok: true, numero: order.order_number };
      }
      const listo = tPedido('confirmacion.listo', { tiempo: formatEstimatedTime(prepTime, tPedido) });
      const parts = result.tableSessionId
        ? [tPedido('confirmacion.enLaMesa'), listo]
        : [tPedido('confirmacion.ventaCreada'), tPedido('confirmacion.comandaEnviada'), listo];
      if (esDomicilio(order.delivery_type) && transitTime.value > 0) parts.push(tPedido('confirmacion.entrega', { tiempo: formatEstimatedTime(transitTime, tPedido) }));
      if (result.cobro) parts.push(tPedido('cobro.hecho'));
      else if (markAsPaid && !result.cobroPendiente) parts.push(tPedido('confirmacion.marcadoPagado'));
      if (result.couponRedemptionId) parts.push(tPedido('confirmacion.cuponRedimido'));
      toast({
        title: result.completadoAhora ? tPedido('confirmacion.completada') : tPedido('confirmacion.confirmado'),
        description: parts.join(' · '),
      });
    }
    if (result.cobroPendiente) {
      toast({
        title: tPedido('cobro.pendienteTrasConfirmar'),
        description: `${order.order_number} · ${tPedido(`cobro.${claveAvisoCobro(result.cobroPendiente)}`)}`,
        variant: 'destructive',
      });
    }
    if ((result.stockErrors ?? []).length > 0) {
      toast({
        title: tPedido('confirmacion.stockFallido', { n: result.stockErrors!.length }),
        description: result.stockErrors!.slice(0, 3).join(' · '),
        variant: 'destructive',
      });
    }
    return { ok: true, numero: order.order_number };
  };

  const handleConfirmOrder = async () => {
    const ids = confirmDialog.orderIds;
    if (ids.length === 0) return;
    setActionLoading(true);
    const fallidos: string[] = [];
    let hechos = 0;
    // En serie: cada confirmación crea venta, comanda y movimientos de stock.
    for (const id of ids) {
      try {
        await confirmarUno(id);
        hechos++;
      } catch (error: unknown) {
        console.error('Error confirmando pedido:', error);
        const numero = orders.find((o) => o.id === id)?.order_number ?? id.slice(0, 8);
        fallidos.push(numero);
        if (ids.length === 1) {
          toast({
            title: tPedido('confirmacion.error'),
            description: (error as { message?: string } | null)?.message || t('confirmarLote.errorUno'),
            variant: 'destructive',
          });
        }
      }
    }
    if (ids.length > 1) {
      if (hechos > 0) toast({ title: t('confirmarLote.resultado', { ok: hechos }) });
      if (fallidos.length > 0) toast({ title: t('confirmarLote.fallidos', { n: fallidos.length, pedidos: fallidos.join(', ') }), variant: 'destructive' });
    }
    setActionLoading(false);
    setConfirmDialog({ open: false, orderIds: [] });
    setMarkAsPaid(false);
    setSelectedOrders(new Set());
    void loadOrders();
  };

  const handleRejectOrder = async () => {
    if (!rejectDialog.orderId || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await webOrdersService.rejectOrder(rejectDialog.orderId, rejectReason);
      toast({ title: t('rechazo.hecho'), description: t('rechazo.hechoDetalle') });
      setRejectDialog({ open: false, orderId: null });
      setRejectReason('');
      void loadOrders();
    } catch {
      toast({ title: t('rechazo.error'), variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, status: WebOrderStatus) => {
    try {
      await webOrdersService.updateOrderStatus(orderId, status);
      toast({ title: t('estadoActualizado', { estado: t(`estados.${status}`) }) });
      void loadOrders();
    } catch {
      toast({ title: t('estadoError'), variant: 'destructive' });
    }
  };

  const getSelectedOrders = () => orders.filter((o) => selectedOrders.has(o.id));

  const handleBulkStatusChange = async (status: WebOrderStatus) => {
    const selected = getSelectedOrders();
    if (selected.length === 0) return;
    setBulkActionLoading(true);
    try {
      await Promise.all(selected.map((o) => webOrdersService.updateOrderStatus(o.id, status)));
      toast({ title: t('masivo.hecho', { n: selected.length, estado: t(`estados.${status}`) }) });
      setSelectedOrders(new Set());
      void loadOrders();
    } catch {
      toast({ title: t('estadoError'), variant: 'destructive' });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkMarkPaid = async () => {
    const selected = getSelectedOrders();
    if (selected.length === 0) return;
    setBulkActionLoading(true);
    try {
      // Cada pedido se cobra en la caja de su sede (fn_cobrar_pedido_web_en_caja).
      const r = await webOrderConfirmationService.cobrarVariosEnCaja(selected, (id) => webOrdersService.getOrderById(id));
      const hechos = r.cobrados.length + r.respaldo.length;
      if (hechos > 0) toast({ title: tPedido('cobro.lote.titulo'), description: tPedido('cobro.lote.cobrados', { n: hechos }) });
      for (const [codigo, numeros] of Object.entries(r.pendientes)) {
        if (!numeros || numeros.length === 0) continue;
        toast({
          title: tPedido(`cobro.${claveAvisoCobro(codigo as ErrorCobroEnCaja)}`),
          description: tPedido('cobro.lote.pendientes', { n: numeros.length, pedidos: numeros.join(', ') }),
          variant: 'destructive',
        });
      }
      setSelectedOrders(new Set());
      void loadOrders();
    } catch {
      toast({ title: tPedido('cobro.error'), description: tPedido('cobro.lote.error'), variant: 'destructive' });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const fechaHora = (iso: string) => formatDateTimeInTz(iso, timezone, { locale: 'es-CO', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const etiquetaEntrega = (o: WebOrder): string => {
    const tipo = tipoEntregaEfectivo(o);
    if (tipo === 'dine_in') {
      const mesa = mesaDelPedido(o);
      return mesa ? tPedido('comerAquiMesa', { mesa }) : tPedido('comerAqui');
    }
    return t(`entregas.${tipo}`);
  };

  const imprimirPedidos = (lista: readonly WebOrder[]) => {
    if (lista.length === 0) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const html = lista
      .map(
        (order) => `
      <div style="page-break-after: always; padding: 20px; font-family: sans-serif;">
        <h2 style="margin:0 0 8px;">${esc(order.order_number)}</h2>
        <p style="margin:0 0 4px;color:#555;">${esc(fechaHora(order.created_at))}</p>
        <hr style="margin:8px 0;"/>
        <p style="margin:0 0 4px;"><strong>${esc(t('columnas.cliente'))}:</strong> ${esc(order.customer_name || order.customer?.full_name || '—')}</p>
        <p style="margin:0 0 4px;"><strong>${esc(t('impresion.telefono'))}:</strong> ${esc(order.customer_phone || order.customer?.phone || '—')}</p>
        <p style="margin:0 0 4px;"><strong>${esc(t('columnas.entrega'))}:</strong> ${esc(etiquetaEntrega(order))}</p>
        ${esDomicilio(order.delivery_type) && order.delivery_address?.address ? `<p style="margin:0 0 4px;"><strong>${esc(t('impresion.direccion'))}:</strong> ${esc(order.delivery_address.address)}${order.delivery_address.city ? `, ${esc(order.delivery_address.city)}` : ''}</p>` : ''}
        <hr style="margin:8px 0;"/>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid #ddd;text-align:left;">
              <th style="padding:4px 0;">${esc(t('impresion.producto'))}</th>
              <th style="padding:4px 8px;text-align:center;">${esc(t('impresion.cantidad'))}</th>
              <th style="padding:4px 8px;text-align:right;">${esc(t('impresion.precio'))}</th>
              <th style="padding:4px 0;text-align:right;">${esc(t('columnas.total'))}</th>
            </tr>
          </thead>
          <tbody>
            ${(order.items || [])
              .map(
                (item) => `
              <tr style="border-bottom:1px solid #eee;">
                <td style="padding:4px 0;">${esc(item.product_name)}</td>
                <td style="padding:4px 8px;text-align:center;">${esc(item.quantity)}</td>
                <td style="padding:4px 8px;text-align:right;">${esc(moneda.formatear(Number(item.unit_price || 0)))}</td>
                <td style="padding:4px 0;text-align:right;">${esc(moneda.formatear(Number(item.total || 0)))}</td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
        <div style="text-align:right;margin-top:8px;">
          <strong style="font-size:18px;">${esc(t('columnas.total'))}: ${esc(moneda.formatear(order.total))}</strong>
        </div>
        ${order.customer_notes ? `<div style="margin-top:8px;padding:8px;background:#fffbea;border-radius:4px;"><strong>${esc(t('impresion.notas'))}:</strong> ${esc(order.customer_notes)}</div>` : ''}
        <p style="margin-top:12px;color:#999;font-size:12px;">${esc(metodoDePago(order))} · ${esc(t(`pagos.${order.payment_status}`))}</p>
      </div>`,
      )
      .join('');
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(t('titulo'))}</title></head><body>${html}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  const exportarCsv = (lista: readonly WebOrder[]) => {
    if (lista.length === 0) return;
    // La moneda va en el encabezado: el número queda crudo para la hoja de cálculo.
    const headers = [
      t('columnas.pedido'),
      t('columnas.cliente'),
      t('impresion.correo'),
      t('impresion.telefono'),
      t('columnas.estado'),
      t('columnas.entrega'),
      `${t('columnas.total')} (${moneda.code})`,
      t('columnas.pago'),
      t('impresion.fecha'),
    ];
    const rows = lista.map((o) => [
      o.order_number,
      o.customer_name || o.customer?.full_name || '',
      o.customer_email || o.customer?.email || '',
      o.customer_phone || o.customer?.phone || '',
      t(`estados.${o.status}`),
      etiquetaEntrega(o),
      o.total.toString(),
      metodoDePago(o),
      fechaHora(o.created_at),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedidos_${getToday()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: t('exportado', { n: lista.length }) });
  };

  const handleViewDetails = (orderId: string) => router.push(`/app/pos/pedidos-online/${orderId}`);

  // ── Datos derivados ─────────────────────────────────────────────────────
  const pendientesIds = useMemo(() => orders.filter((o) => o.status === 'pending').map((o) => o.id), [orders]);
  const sinConfirmar = stats?.unconfirmed_orders ?? 0;
  const pagina = orders.slice((currentPage - 1) * tamanoPagina, currentPage * tamanoPagina);
  const hayFiltros = Object.values(filtros).some(Boolean) || busqueda.trim() !== '';

  const estadoTabla: EstadoTabla = loading && orders.length === 0
    ? 'cargando'
    : errorCarga && orders.length === 0
      ? 'error'
      : orders.length === 0
        ? hayFiltros
          ? 'sinResultados'
          : 'vacio'
        : 'listo';

  const nombrePeriodo = t(`periodos.${periodo}`);
  const comparacion = t(`comparacion.${periodo}`);
  const detalleVariacion = (actual: number, anterior: number | null | undefined) => {
    const v = variacionPct(actual, anterior);
    if (v === null) return { detalle: undefined, tendencia: undefined };
    return { detalle: t('kpis.vs', { pct: Math.abs(v), comparacion }), tendencia: v >= 0 ? ('sube' as const) : ('baja' as const) };
  };
  const vPedidos = detalleVariacion(stats?.total_orders ?? 0, previousStats?.total_orders);
  const vEntregados = detalleVariacion(stats?.completed_orders ?? 0, previousStats?.completed_orders);
  const vCancelados = detalleVariacion(stats?.cancelled_orders ?? 0, previousStats?.cancelled_orders);

  const chips: ChipFiltro[] = [
    { clave: 'periodo', etiqueta: t('chips.periodo', { valor: nombrePeriodo }) },
    filtros.status ? { clave: 'status', etiqueta: t('chips.estado', { valor: t(`estadosFiltro.${filtros.status}`) }) } : null,
    filtros.delivery_type ? { clave: 'delivery_type', etiqueta: t('chips.entrega', { valor: t(`entregas.${filtros.delivery_type}`) }) } : null,
    filtros.source ? { clave: 'source', etiqueta: t('chips.origen', { valor: t(`origenes.${filtros.source}`) }) } : null,
    filtros.payment_status ? { clave: 'payment_status', etiqueta: t('chips.pago', { valor: t(`pagos.${filtros.payment_status}`) }) } : null,
  ].filter((c): c is ChipFiltro => c !== null && (c.clave !== 'periodo' || periodo !== 'all'));

  const quitarChip = (clave: string) => {
    if (clave === 'periodo') setPeriodo('all');
    else setFiltros((f) => ({ ...f, [clave]: undefined }));
  };
  const limpiarFiltros = () => {
    setFiltros({});
    setBusqueda('');
    setPeriodo('today');
  };

  const filtrarPendientes = () => setFiltros((f) => ({ ...f, status: f.status === 'pending' ? undefined : 'pending' }));

  const accionesCabecera: AccionFila[] = [
    {
      id: 'sonido',
      etiqueta: soundEnabled ? t('acciones.sonidoOn') : t('acciones.sonidoOff'),
      icono: soundEnabled ? VolumeX : Volume2,
      onSelect: () => setSoundEnabled((v) => !v),
    },
    {
      id: 'auto',
      etiqueta: autoRefresh ? t('acciones.autoOn') : t('acciones.autoOff'),
      icono: autoRefresh ? BellOff : Bell,
      onSelect: () => setAutoRefresh((v) => !v),
    },
    {
      id: 'avisos',
      etiqueta: t('acciones.avisosCliente'),
      icono: Settings,
      separadorAntes: true,
      onSelect: () => router.push('/app/configuracion/pos/avisos-cliente'),
    },
  ];

  const sustantivo = {
    singular: t('sustantivo.singular'),
    plural: t('sustantivo.plural'),
    genero: t('sustantivo.genero') === 'femenino' ? ('femenino' as const) : ('masculino' as const),
  };

  const seleccion = getSelectedOrders();
  const accionesMasivas: AccionMasiva[] = [
    {
      id: 'confirmar',
      etiqueta: t('masivo.confirmar'),
      icono: CheckCircle,
      deshabilitada: !seleccion.some((o) => o.status === 'pending'),
      motivo: t('masivo.soloPendientes'),
      onClick: () => setConfirmDialog({ open: true, orderIds: seleccion.filter((o) => o.status === 'pending').map((o) => o.id) }),
    },
    { id: 'cobrar', etiqueta: t('masivo.cobrar'), icono: Coins, cargando: bulkActionLoading, onClick: () => void handleBulkMarkPaid() },
    { id: 'imprimir', etiqueta: t('masivo.imprimir'), icono: Printer, onClick: () => imprimirPedidos(seleccion) },
  ];
  const accionesMasivasSecundarias: AccionFila[] = [
    { id: 'preparar', etiqueta: t('masivo.preparar'), icono: Clock, onSelect: () => void handleBulkStatusChange('preparing') },
    { id: 'listos', etiqueta: t('masivo.listos'), icono: Package, onSelect: () => void handleBulkStatusChange('ready') },
    { id: 'entregados', etiqueta: t('masivo.entregados'), icono: CheckCircle, onSelect: () => void handleBulkStatusChange('delivered') },
    { id: 'exportar', etiqueta: t('masivo.exportar'), icono: Download, separadorAntes: true, onSelect: () => exportarCsv(seleccion) },
  ];

  const kpiCargando = !stats && !errorCarga;
  const subtitulo = stats
    ? t('subtitulo', { total: stats.total_orders, pendientes: sinConfirmar })
    : errorCarga
      ? undefined
      : t('cargando');

  // Tablero por estado (vista «Tablero»).
  const KANBAN_PAGE_SIZE = 10;
  const [kanbanPages, setKanbanPages] = useState<Record<string, number>>({ pending: 1, confirmed: 1, preparing: 1, ready: 1 });
  const columnasTablero: { clave: string; titulo: string; pedidos: WebOrder[]; punto: string }[] = [
    { clave: 'pending', titulo: t('estadosFiltro.pending'), pedidos: orders.filter((o) => o.status === 'pending'), punto: 'bg-warning' },
    { clave: 'confirmed', titulo: t('estadosFiltro.confirmed'), pedidos: orders.filter((o) => o.status === 'confirmed'), punto: 'bg-info' },
    { clave: 'preparing', titulo: t('estadosFiltro.preparing'), pedidos: orders.filter((o) => o.status === 'preparing'), punto: 'bg-warning' },
    { clave: 'ready', titulo: t('tableroListos'), pedidos: orders.filter((o) => ['ready', 'in_delivery'].includes(o.status)), punto: 'bg-success' },
  ];

  const campoSelect = (
    etiqueta: string,
    valor: string | undefined,
    opciones: readonly string[],
    rotulo: (v: string) => string,
    onCambio: (v: string | undefined) => void,
  ) => (
    <FormField etiqueta={etiqueta}>
      {(c) => (
        <Select value={valor ?? 'todos'} onValueChange={(v) => onCambio(v === 'todos' ? undefined : v)}>
          <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">{t('filtros.todos')}</SelectItem>
            {opciones.map((o) => (
              <SelectItem key={o} value={o}>
                {rotulo(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas px-4 pb-24 pt-4 sm:px-6 lg:gap-5 lg:pt-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={ShoppingBag}
        cargando={loading}
        migas={[{ etiqueta: 'POS', href: '/app/pos' }, { etiqueta: t('titulo') }]}
        acciones={
          <>
            <button
              type="button"
              onClick={() => void loadOrders()}
              disabled={loading}
              aria-label={t('acciones.actualizar')}
              title={t('acciones.actualizar')}
              className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'w-10 px-0' })}
            >
              <RefreshCw aria-hidden="true" className={loading ? 'size-4 animate-spin' : 'size-4'} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => exportarCsv(orders)}
              disabled={orders.length === 0}
              className={clasesBoton({ variante: 'secundario', tamano: 'md' })}
            >
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('acciones.exportar')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDialog({ open: true, orderIds: pendientesIds })}
              disabled={pendientesIds.length === 0}
              className={clasesBoton({ variante: 'primario', tamano: 'md' })}
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('acciones.confirmarPendientes', { n: pendientesIds.length })}
            </button>
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('titulo')} acciones={accionesCabecera} />
          </>
        }
        movil={{
          subtitulo: stats ? t('subtituloMovil', { total: stats.total_orders, pendientes: sinConfirmar }) : undefined,
        }}
        debajo={
          <div className="flex w-full items-center justify-between gap-3">
            <BranchBadgeActiva tamano="sm" />
            <SegmentedControl
              etiqueta={t('vista.etiqueta')}
              tamano="sm"
              valor={viewMode}
              onValorChange={setViewMode}
              tonoActivo="marca"
              opciones={[
                { valor: 'list', etiqueta: t('vista.lista') },
                { valor: 'kanban', etiqueta: t('vista.tablero') },
              ]}
            />
          </div>
        }
      />

      <KpiStrip etiqueta={t('kpis.etiqueta')} columnas={6} className="hidden sm:grid">
        <StatCard
          tamano="sm"
          etiqueta={periodo === 'today' ? t('kpis.pedidosHoy') : t('kpis.pedidos')}
          cargando={kpiCargando}
          valor={stats ? stats.total_orders.toLocaleString('es-CO') : '—'}
          detalle={vPedidos.detalle}
          tendencia={vPedidos.tendencia}
        />
        <StatCard
          tamano="sm"
          etiqueta={t('kpis.pendientes')}
          cargando={kpiCargando}
          valor={stats ? sinConfirmar.toLocaleString('es-CO') : '—'}
          tono={sinConfirmar > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={sinConfirmar > 0 ? TriangleAlert : undefined}
          detalle={sinConfirmar > 0 ? t('kpis.filtrarPendientes') : t('kpis.sinPendientes')}
          resaltada={filtros.status === 'pending'}
          onClick={sinConfirmar > 0 ? filtrarPendientes : undefined}
        />
        <StatCard
          tamano="sm"
          etiqueta={t('kpis.entregados')}
          cargando={kpiCargando}
          valor={stats ? stats.completed_orders.toLocaleString('es-CO') : '—'}
          tono={vEntregados.tendencia === 'baja' ? 'peligro' : 'exito'}
          detalle={vEntregados.detalle}
          tendencia={vEntregados.tendencia}
        />
        <StatCard
          tamano="sm"
          etiqueta={t('kpis.cancelados')}
          cargando={kpiCargando}
          valor={stats ? stats.cancelled_orders.toLocaleString('es-CO') : '—'}
          tono={vCancelados.tendencia === 'sube' ? 'peligro' : vCancelados.tendencia === 'baja' ? 'exito' : 'neutro'}
          detalle={vCancelados.detalle}
          tendencia={vCancelados.tendencia}
        />
        <StatCard
          tamano="sm"
          etiqueta={t('kpis.aTiempo')}
          cargando={kpiCargando}
          valor={stats?.on_time_pct != null ? `${stats.on_time_pct} %` : '—'}
          tono={stats?.on_time_pct == null ? 'neutro' : stats.on_time_pct >= 80 ? 'exito' : 'advertencia'}
          tendencia={stats?.on_time_pct != null && stats.on_time_pct >= 80 ? 'sube' : undefined}
          detalle={stats?.on_time_pct != null ? t('kpis.contraPrometido') : t('kpis.sinMedir')}
        />
        <StatCard
          tamano="sm"
          etiqueta={t('kpis.ingresos')}
          cargando={kpiCargando}
          valor={stats ? moneda.formatear(stats.total_revenue) : '—'}
          detalle={stats ? t('kpis.ticket', { valor: moneda.formatear(Math.round(stats.avg_order_value)) }) : undefined}
        />
      </KpiStrip>

      <ListToolbar
        busqueda={
          <SearchInput
            value={busqueda}
            onChange={setBusqueda}
            cargando={loading && orders.length > 0}
            placeholder={t('buscar.placeholder')}
            etiqueta={t('buscar.etiqueta')}
          />
        }
        filtros={
          <FilterPanel
            conteo={chips.length}
            onLimpiar={limpiarFiltros}
            titulo={t('filtros.titulo')}
            textoVerResultados={t('filtros.verN', { count: orders.length })}
          >
            <FormField etiqueta={t('filtros.periodo')}>
              {(c) => (
                <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoListado)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIODOS_LISTADO.map((p) => (
                      <SelectItem key={p} value={p}>
                        {t(`periodos.${p}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            {periodo === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <CampoFecha aria-label={t('filtros.desde')} tamano="sm" valor={customDateFrom} onValorChange={setCustomDateFrom} />
                <CampoFecha aria-label={t('filtros.hasta')} tamano="sm" valor={customDateTo} onValorChange={setCustomDateTo} />
              </div>
            )}
            {campoSelect(t('filtros.estado'), filtros.status, ESTADOS_FILTRO, (v) => t(`estadosFiltro.${v}`), (v) => setFiltros((f) => ({ ...f, status: v as WebOrderStatus | undefined })))}
            {campoSelect(t('filtros.entrega'), filtros.delivery_type, ENTREGAS_FILTRO, (v) => t(`entregas.${v}`), (v) => setFiltros((f) => ({ ...f, delivery_type: v as DeliveryType | undefined })))}
            {campoSelect(t('filtros.origen'), filtros.source, ORIGENES_FILTRO, (v) => t(`origenes.${v}`), (v) => setFiltros((f) => ({ ...f, source: v as OrderSource | undefined })))}
            {campoSelect(t('filtros.pago'), filtros.payment_status, PAGOS_FILTRO, (v) => t(`pagos.${v}`), (v) => setFiltros((f) => ({ ...f, payment_status: v as PaymentStatus | undefined })))}
          </FilterPanel>
        }
        chips={chips.length > 0 ? <FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={limpiarFiltros} /> : undefined}
      />

      {viewMode === 'list' ? (
        <TablaPedidosOnline
          pedidos={pagina}
          estado={estadoTabla}
          timezone={timezone}
          ahora={ahora}
          seleccion={selectedOrders}
          onSeleccionChange={setSelectedOrders}
          onAbrir={(o) => handleViewDetails(o.id)}
          onConfirmar={(o) => setConfirmDialog({ open: true, orderIds: [o.id] })}
          onRechazar={(o) => setRejectDialog({ open: true, orderId: o.id })}
          onCambiarEstado={(o, e) => void handleUpdateStatus(o.id, e)}
          onImprimir={(o) => imprimirPedidos([o])}
          onReintentar={() => {
            setLoading(true);
            void loadOrders();
          }}
          onLimpiarFiltros={limpiarFiltros}
          termino={busqueda.trim() || undefined}
          pie={
            orders.length > 0 ? (
              <Pagination
                pagina={currentPage}
                tamano={tamanoPagina}
                total={orders.length}
                onPaginaChange={setCurrentPage}
                onTamanoChange={(n) => {
                  setTamanoPagina(n);
                  setCurrentPage(1);
                }}
                sustantivo={sustantivo}
              />
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {columnasTablero.map((col) => {
            const visibles = col.pedidos.slice(0, (kanbanPages[col.clave] || 1) * KANBAN_PAGE_SIZE);
            const restantes = col.pedidos.length - visibles.length;
            return (
              <div key={col.clave} className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                  <span aria-hidden="true" className={`size-2.5 rounded-full ${col.punto}`} />
                  <span className="text-sm font-medium text-fg">{col.titulo}</span>
                  <span className="ml-auto text-xs tabular-nums text-fg-secondary">{col.pedidos.length}</span>
                </div>
                {visibles.map((order) => (
                  <WebOrderCard
                    key={order.id}
                    order={order}
                    onConfirm={(id) => setConfirmDialog({ open: true, orderIds: [id] })}
                    onReject={(id) => setRejectDialog({ open: true, orderId: id })}
                    onUpdateStatus={handleUpdateStatus}
                    onViewDetails={handleViewDetails}
                  />
                ))}
                {restantes > 0 && (
                  <button
                    type="button"
                    className={clasesBoton({ variante: 'fantasma', tamano: 'sm', anchoCompleto: true })}
                    onClick={() => setKanbanPages((p) => ({ ...p, [col.clave]: (p[col.clave] || 1) + 1 }))}
                  >
                    {t('tableroVerMas', { n: restantes })}
                  </button>
                )}
                {col.pedidos.length === 0 && <p className="py-4 text-center text-sm text-fg-secondary">{t('tableroVacio')}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Observabilidad de la tienda (stock reservado, reservas huérfanas y
          pedidos por expirar), plegada. No está en el Figma del listado: vive
          aquí porque es donde se atienden los pedidos (ver el inicio, 445:137185). */}
      <WebCommerceObservability organizationId={organization?.id} withinMinutes={30} />

      {selectedOrders.size > 0 && viewMode === 'list' && (
        <BulkActionBar
          seleccionados={selectedOrders.size}
          total={orders.length}
          onSeleccionarTodos={() => setSelectedOrders(new Set(orders.map((o) => o.id)))}
          sustantivo={sustantivo}
          acciones={accionesMasivas}
          accionesSecundarias={accionesMasivasSecundarias}
          onLimpiar={() => setSelectedOrders(new Set())}
        />
      )}

      {/* Diálogo: confirmar uno o varios pedidos */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (actionLoading) return;
          setConfirmDialog({ open, orderIds: open ? confirmDialog.orderIds : [] });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.orderIds.length > 1 ? t('confirmarLote.titulo', { n: confirmDialog.orderIds.length }) : t('confirmar.titulo')}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.orderIds.length > 1 ? t('confirmarLote.descripcion') : t('confirmar.descripcion')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="prep-time-list">{t('confirmar.preparacion')}</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  id="prep-time-list"
                  type="number"
                  value={prepTime.value}
                  onChange={(e) => setPrepTime({ ...prepTime, value: Number(e.target.value) })}
                  min={1}
                  className="flex-1"
                />
                <Select value={prepTime.unit} onValueChange={(unit: TimeUnit) => setPrepTime({ ...prepTime, unit })}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">{t('confirmar.minutos')}</SelectItem>
                    <SelectItem value="hours">{t('confirmar.horas')}</SelectItem>
                    <SelectItem value="days">{t('confirmar.dias')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="transit-time-list">{t('confirmar.traslado')}</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  id="transit-time-list"
                  type="number"
                  value={transitTime.value}
                  onChange={(e) => setTransitTime({ ...transitTime, value: Number(e.target.value) })}
                  min={0}
                  className="flex-1"
                />
                <Select value={transitTime.unit} onValueChange={(unit: TimeUnit) => setTransitTime({ ...transitTime, unit })}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">{t('confirmar.minutos')}</SelectItem>
                    <SelectItem value="hours">{t('confirmar.horas')}</SelectItem>
                    <SelectItem value="days">{t('confirmar.dias')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="mt-2 text-sm text-fg-secondary">{t('confirmar.trasladoAyuda')}</p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="mark-as-paid" checked={markAsPaid} onCheckedChange={(checked) => setMarkAsPaid(checked === true)} />
              <Label htmlFor="mark-as-paid" className="cursor-pointer text-sm font-medium">
                {t('confirmar.marcarPagado')}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={actionLoading}
              onClick={() => {
                setConfirmDialog({ open: false, orderIds: [] });
                setMarkAsPaid(false);
              }}
            >
              {t('confirmar.volver')}
            </Button>
            <Button onClick={() => void handleConfirmOrder()} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmDialog.orderIds.length > 1 ? t('confirmarLote.accion', { n: confirmDialog.orderIds.length }) : t('confirmar.accion')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: rechazar pedido */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog({ open, orderId: open ? rejectDialog.orderId : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rechazo.titulo')}</DialogTitle>
            <DialogDescription>{t('rechazo.descripcion')}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="reject-reason">{t('rechazo.motivo')}</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('rechazo.placeholder')}
              className="mt-2"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialog({ open: false, orderId: null });
                setRejectReason('');
              }}
            >
              {t('confirmar.volver')}
            </Button>
            <Button variant="destructive" onClick={() => void handleRejectOrder()} disabled={actionLoading || !rejectReason.trim()}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('rechazo.accion')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
