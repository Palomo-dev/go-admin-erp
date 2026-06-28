'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  RefreshCw, 
  Bell, 
  BellOff,
  Volume2,
  VolumeX,
  Loader2,
  LayoutGrid,
  List,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Store,
  Bike,
  Truck,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ShoppingBag,
  MapPin,
  Phone,
  CalendarClock,
  Coins,
  Download,
  Printer,
  Package,
  X
} from 'lucide-react';
import { WebOrderCard } from '@/components/pos/pedidos-online/WebOrderCard';
import { WebOrderFilters } from '@/components/pos/pedidos-online/WebOrderFilters';
import { WebOrderStats } from '@/components/pos/pedidos-online/WebOrderStats';
import { PaymentStatusBadge } from '@/components/pos/pedidos-online/PaymentStatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  webOrdersService, 
  type WebOrder, 
  type WebOrderStatus,
  type DeliveryType,
  type PaymentStatus,
  type OrderSource
} from '@/lib/services/webOrdersService';
import { webOrderConfirmationService } from '@/lib/services/webOrderConfirmationService';

interface LocalFilters {
  status?: WebOrderStatus[];
  delivery_type?: DeliveryType;
  source?: OrderSource;
  payment_status?: PaymentStatus[];
  search?: string;
  is_scheduled?: boolean;
  date_from?: string;
  date_to?: string;
}

type DatePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'custom';

const ITEMS_PER_PAGE = 20;

export default function PedidosOnlinePage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [orders, setOrders] = useState<WebOrder[]>([]);
  const [stats, setStats] = useState({
    total_orders: 0,
    pending_orders: 0,
    completed_orders: 0,
    cancelled_orders: 0,
    total_revenue: 0,
    avg_order_value: 0,
  });
  const [previousStats, setPreviousStats] = useState({
    total_orders: 0,
    pending_orders: 0,
    completed_orders: 0,
    cancelled_orders: 0,
    total_revenue: 0,
    avg_order_value: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<LocalFilters>({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('list');
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Dialogs
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; orderId: string | null }>({ 
    open: false, 
    orderId: null 
  });
  const [rejectReason, setRejectReason] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; orderId: string | null }>({
    open: false,
    orderId: null
  });
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [actionLoading, setActionLoading] = useState(false);

  // Calcular rango de fecha según preset
  const getDateRange = useCallback((): { from?: string; to?: string } => {
    const now = new Date();
    const startOfDay = (d: Date) => { const c = new Date(d); c.setHours(0,0,0,0); return c.toISOString(); };
    const endOfDay = (d: Date) => { const c = new Date(d); c.setHours(23,59,59,999); return c.toISOString(); };
    switch (datePreset) {
      case 'today':
        return { from: startOfDay(now), to: endOfDay(now) };
      case 'yesterday': {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        return { from: startOfDay(y), to: endOfDay(y) };
      }
      case 'last7': {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        return { from: startOfDay(d), to: endOfDay(now) };
      }
      case 'last30': {
        const d = new Date(now); d.setDate(d.getDate() - 30);
        return { from: startOfDay(d), to: endOfDay(now) };
      }
      case 'custom':
        return {
          from: customDateFrom ? new Date(customDateFrom + 'T00:00:00').toISOString() : undefined,
          to: customDateTo ? new Date(customDateTo + 'T23:59:59').toISOString() : undefined,
        };
      default:
        return {};
    }
  }, [datePreset, customDateFrom, customDateTo]);

  // Rango del período ANTERIOR equivalente "a la misma hora" para comparar
  const getComparisonRange = useCallback((): { from?: string; to?: string } => {
    const now = new Date();
    const startOfDay = (d: Date) => { const c = new Date(d); c.setHours(0,0,0,0); return c; };
    const endOfDay = (d: Date) => { const c = new Date(d); c.setHours(23,59,59,999); return c; };
    // Desplaza una fecha N días hacia atrás conservando la hora
    const shiftDays = (d: Date, days: number) => { const c = new Date(d); c.setDate(c.getDate() - days); return c; };
    switch (datePreset) {
      case 'today': {
        // Ayer desde las 00:00 hasta la misma hora actual
        const prevStart = startOfDay(shiftDays(now, 1));
        const prevTo = shiftDays(now, 1);
        return { from: prevStart.toISOString(), to: prevTo.toISOString() };
      }
      case 'yesterday': {
        // Antier completo (ayer ya es un día cerrado)
        const db = shiftDays(now, 2);
        return { from: startOfDay(db).toISOString(), to: endOfDay(db).toISOString() };
      }
      case 'last7': {
        // Los 7 días anteriores al rango actual, hasta el mismo instante
        const prevTo = shiftDays(now, 7);
        const prevFrom = startOfDay(shiftDays(now, 14));
        return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
      }
      case 'last30': {
        const prevTo = shiftDays(now, 30);
        const prevFrom = startOfDay(shiftDays(now, 60));
        return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
      }
      case 'custom': {
        if (!customDateFrom || !customDateTo) return {};
        const from = new Date(customDateFrom + 'T00:00:00');
        const to = new Date(customDateTo + 'T23:59:59');
        const duration = to.getTime() - from.getTime();
        const prevTo = new Date(from.getTime() - 1);
        const prevFrom = new Date(from.getTime() - duration - 1);
        return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
      }
      default:
        return {};
    }
  }, [datePreset, customDateFrom, customDateTo]);

  const loadOrders = useCallback(async () => {
    try {
      const dateRange = getDateRange();
      const comparisonRange = getComparisonRange();
      const mergedFilters = { ...filters, date_from: dateRange.from, date_to: dateRange.to };
      const [ordersData, statsData, prevStatsData] = await Promise.all([
        webOrdersService.getOrders(mergedFilters),
        webOrdersService.getOrderStats(dateRange.from, dateRange.to),
        webOrdersService.getOrderStats(comparisonRange.from, comparisonRange.to)
      ]);
      setOrders(ordersData);
      setStats(statsData);
      setPreviousStats(prevStatsData);
      setCurrentPage(1);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los pedidos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [filters, getDateRange, getComparisonRange, toast]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Auto-refresh cada 30 segundos
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      loadOrders();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, loadOrders]);

  // Suscripción a cambios en tiempo real
  useEffect(() => {
    const subscription = webOrdersService.subscribeToOrders((payload) => {
      if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
        // Nuevo pedido - reproducir sonido
        if (soundEnabled) {
          playNotificationSound();
        }
        toast({
          title: '🔔 Nuevo pedido',
          description: `Pedido ${payload.new.order_number} recibido`,
        });
      }
      // Recargar pedidos
      loadOrders();
    });

    return () => {
      webOrdersService.unsubscribeFromOrders();
    };
  }, [soundEnabled, loadOrders, toast]);

  const playNotificationSound = () => {
    try {
      const audio = new Audio('/sounds/notification.mp3');
      audio.play().catch(() => {});
    } catch (error) {
      console.log('Could not play notification sound');
    }
  };

  const handleConfirmOrder = async () => {
    if (!confirmDialog.orderId) return;
    
    setActionLoading(true);
    try {
      // Obtener pedido completo con items para el servicio de confirmación
      const order = await webOrdersService.getOrderById(confirmDialog.orderId);
      if (!order) throw new Error('Pedido no encontrado');

      const result = await webOrderConfirmationService.confirmOrder(order, estimatedMinutes, markAsPaid);
      const parts = ['Venta creada', 'Comanda enviada a cocina', `${estimatedMinutes} min`];
      if (markAsPaid) parts.push('Marcado como pagado');
      if (result.couponRedemptionId) parts.push('Cupón redimido');
      toast({
        title: 'Pedido confirmado',
        description: parts.join(' · '),
      });
      setConfirmDialog({ open: false, orderId: null });
      setMarkAsPaid(false);
      loadOrders();
    } catch (error: any) {
      console.error('Error confirmando pedido:', error);
      toast({
        title: 'Error al confirmar pedido',
        description: error?.message || 'No se pudo confirmar el pedido',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectOrder = async () => {
    if (!rejectDialog.orderId || !rejectReason.trim()) return;
    
    setActionLoading(true);
    try {
      await webOrdersService.rejectOrder(rejectDialog.orderId, rejectReason);
      toast({
        title: 'Pedido rechazado',
        description: 'El cliente será notificado',
      });
      setRejectDialog({ open: false, orderId: null });
      setRejectReason('');
      loadOrders();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo rechazar el pedido',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, status: WebOrderStatus) => {
    try {
      await webOrdersService.updateOrderStatus(orderId, status);
      toast({
        title: 'Estado actualizado',
        description: `Pedido marcado como ${getStatusLabel(status)}`,
      });
      loadOrders();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    }
  };

  const toggleSelectOrder = (orderId: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageOrders = orders.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const allSelected = pageOrders.length > 0 && pageOrders.every(o => selectedOrders.has(o.id));
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (allSelected) {
        pageOrders.forEach(o => next.delete(o.id));
      } else {
        pageOrders.forEach(o => next.add(o.id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedOrders(new Set());

  const getSelectedOrders = () => orders.filter(o => selectedOrders.has(o.id));

  const handleBulkStatusChange = async (status: WebOrderStatus) => {
    const selected = getSelectedOrders();
    if (selected.length === 0) return;
    setBulkActionLoading(true);
    try {
      await Promise.all(selected.map(o => webOrdersService.updateOrderStatus(o.id, status)));
      toast({
        title: 'Acción masiva completada',
        description: `${selected.length} pedido(s) marcado(s) como ${getStatusLabel(status)}`,
      });
      clearSelection();
      loadOrders();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron actualizar todos los pedidos',
        variant: 'destructive',
      });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkMarkPaid = async () => {
    const selected = getSelectedOrders();
    if (selected.length === 0) return;
    setBulkActionLoading(true);
    try {
      await Promise.all(selected.map(o => webOrdersService.updatePaymentStatus(o.id, 'paid')));
      toast({
        title: 'Acción masiva completada',
        description: `${selected.length} pedido(s) marcado(s) como pagado(s)`,
      });
      clearSelection();
      loadOrders();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron actualizar todos los pagos',
        variant: 'destructive',
      });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkPrint = () => {
    const selected = getSelectedOrders();
    if (selected.length === 0) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const html = selected.map(order => `
      <div style="page-break-after: always; padding: 20px; font-family: sans-serif;">
        <h2 style="margin:0 0 8px;">${order.order_number}</h2>
        <p style="margin:0 0 4px;color:#555;">${new Date(order.created_at).toLocaleString('es-CO')}</p>
        <hr style="margin:8px 0;"/>
        <p style="margin:0 0 4px;"><strong>Cliente:</strong> ${order.customer_name || order.customer?.full_name || 'N/A'}</p>
        <p style="margin:0 0 4px;"><strong>Teléfono:</strong> ${order.customer_phone || order.customer?.phone || 'N/A'}</p>
        <p style="margin:0 0 4px;"><strong>Entrega:</strong> ${order.delivery_type === 'pickup' ? 'Retiro en tienda' : order.delivery_type === 'delivery_own' ? 'Delivery propio' : 'Delivery tercero'}</p>
        ${order.delivery_type !== 'pickup' && order.delivery_address?.address ? `<p style="margin:0 0 4px;"><strong>Dirección:</strong> ${order.delivery_address.address}</p>` : ''}
        ${order.delivery_address?.city ? `<p style="margin:0 0 4px;"><strong>Ciudad:</strong> ${order.delivery_address.city}</p>` : ''}
        <hr style="margin:8px 0;"/>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid #ddd;text-align:left;">
              <th style="padding:4px 0;">Producto</th>
              <th style="padding:4px 8px;text-align:center;">Cant.</th>
              <th style="padding:4px 8px;text-align:right;">Precio</th>
              <th style="padding:4px 0;text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${(order.items || []).map(item => `
              <tr style="border-bottom:1px solid #eee;">
                <td style="padding:4px 0;">${item.product_name}</td>
                <td style="padding:4px 8px;text-align:center;">${item.quantity}</td>
                <td style="padding:4px 8px;text-align:right;">$${Number(item.unit_price || 0).toLocaleString()}</td>
                <td style="padding:4px 0;text-align:right;">$${Number(item.total || 0).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="text-align:right;margin-top:8px;">
          <strong style="font-size:18px;">Total: $${order.total.toLocaleString()}</strong>
        </div>
        ${order.customer_notes ? `<div style="margin-top:8px;padding:8px;background:#fffbea;border-radius:4px;"><strong>Notas:</strong> ${order.customer_notes}</div>` : ''}
        <p style="margin-top:12px;color:#999;font-size:12px;">Método de pago: ${getPaymentLabel(order.payment_method)} · ${order.payment_status}</p>
      </div>
    `).join('');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Pedidos - Imprimir</title></head><body>${html}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
    toast({
      title: 'Preparando impresión',
      description: `${selected.length} pedido(s) listos para imprimir`,
    });
  };

  const handleBulkExport = () => {
    const selected = getSelectedOrders();
    if (selected.length === 0) return;
    const headers = ['Pedido', 'Cliente', 'Email', 'Telefono', 'Estado', 'Entrega', 'Total', 'Metodo Pago', 'Fecha'];
    const rows = selected.map(o => [
      o.order_number,
      o.customer_name || o.customer?.full_name || '',
      o.customer_email || o.customer?.email || '',
      o.customer_phone || o.customer?.phone || '',
      getStatusLabel(o.status),
      o.delivery_type === 'pickup' ? 'Retiro' : o.delivery_type === 'delivery_own' ? 'Propio' : 'Tercero',
      o.total.toString(),
      getPaymentLabel(o.payment_method),
      new Date(o.created_at).toLocaleString('es-CO'),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedidos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'Exportación completada',
      description: `${selected.length} pedido(s) exportado(s) a CSV`,
    });
  };

  const getStatusLabel = (status: WebOrderStatus): string => {
    const labels: Record<WebOrderStatus, string> = {
      pending: 'Pendiente',
      confirmed: 'Confirmado',
      preparing: 'Preparando',
      ready: 'Listo',
      in_delivery: 'En camino',
      delivered: 'Entregado',
      cancelled: 'Cancelado',
      rejected: 'Rechazado',
    };
    return labels[status];
  };

  const getStatusColor = (status: WebOrderStatus): string => {
    const colors: Record<WebOrderStatus, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      preparing: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      ready: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      in_delivery: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
      cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      rejected: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    };
    return colors[status];
  };

  const getPaymentLabel = (method?: string): string => {
    if (!method) return '—';
    const labels: Record<string, string> = {
      cash: 'Efectivo',
      transfer: 'Transferencia',
      wompi: 'Wompi',
      wompi_co: 'Wompi',
      nequi: 'Nequi',
      daviplata: 'Daviplata',
      pse: 'PSE',
      card: 'Tarjeta',
      mp_checkout: 'MercadoPago',
      stripe_payments: 'Stripe',
      payu_co: 'PayU',
      paypal_checkout: 'PayPal',
    };
    return labels[method] || method;
  };

  const getPaymentDetailLabel = (detail?: string): string | null => {
    if (!detail) return null;
    const labels: Record<string, string> = {
      bancolombia_transfer: 'Bancolombia',
      card: 'Tarjeta',
      nequi: 'Nequi',
      pse: 'PSE',
      bancolombia_collect: 'Bancolombia Collect',
      daviplata: 'Daviplata',
    };
    return labels[detail] || detail;
  };

  const handleViewDetails = (orderId: string) => {
    router.push(`/app/pos/pedidos-online/${orderId}`);
  };

  // Agrupar pedidos por estado para vista tipo Kanban
  const KANBAN_PAGE_SIZE = 10;
  const [kanbanPages, setKanbanPages] = useState<Record<string, number>>({ pending: 1, confirmed: 1, preparing: 1, ready: 1 });

  const pendingOrders = orders.filter(o => o.status === 'pending');
  const confirmedOrders = orders.filter(o => o.status === 'confirmed');
  const preparingOrders = orders.filter(o => o.status === 'preparing');
  const readyOrders = orders.filter(o => ['ready', 'in_delivery'].includes(o.status));

  const paginateKanban = (items: WebOrder[], key: string) => items.slice(0, (kanbanPages[key] || 1) * KANBAN_PAGE_SIZE);
  const hasMoreKanban = (items: WebOrder[], key: string) => items.length > (kanbanPages[key] || 1) * KANBAN_PAGE_SIZE;
  const showMoreKanban = (key: string) => setKanbanPages(prev => ({ ...prev, [key]: (prev[key] || 1) + 1 }));

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <a href="/app/pos">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </a>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <ShoppingBag className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
              </div>
              Pedidos Online
            </h1>
            <p className="text-gray-500 dark:text-gray-400">POS / Pedidos Online</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center border dark:border-gray-700 rounded-md overflow-hidden">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className="rounded-none"
              title="Vista Kanban"
            >
              <LayoutGrid className="h-4 w-4 dark:text-gray-300" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-none"
              title="Vista Lista"
            >
              <List className="h-4 w-4 dark:text-gray-300" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Silenciar notificaciones' : 'Activar sonido'}
            className="dark:border-gray-600"
          >
            {soundEnabled ? <Volume2 className="h-4 w-4 dark:text-gray-300" /> : <VolumeX className="h-4 w-4 dark:text-gray-300" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? 'Desactivar auto-refresh' : 'Activar auto-refresh'}
            className="dark:border-gray-600"
          >
            {autoRefresh ? <Bell className="h-4 w-4 dark:text-gray-300" /> : <BellOff className="h-4 w-4 dark:text-gray-300" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadOrders()}
            disabled={loading}
            className="dark:border-gray-600"
          >
            <RefreshCw className={`h-4 w-4 mr-1 dark:text-gray-300 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline dark:text-gray-300">Actualizar</span>
          </Button>
        </div>
      </div>

      {/* Estadísticas */}
      <WebOrderStats stats={stats} previousStats={previousStats} isLoading={loading} datePreset={datePreset} />

      {/* Filtro de fechas */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
            <span className="text-sm font-medium mr-1 dark:text-gray-100">Período:</span>
            {([
              { value: 'today', label: 'Hoy' },
              { value: 'yesterday', label: 'Ayer' },
              { value: 'last7', label: 'Últimos 7 días' },
              { value: 'last30', label: 'Últimos 30 días' },
              { value: 'custom', label: 'Personalizado' },
            ] as { value: DatePreset; label: string }[]).map((opt) => (
              <Button
                key={opt.value}
                variant={datePreset === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDatePreset(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 ml-2">
                <Input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="h-8 w-36 text-xs"
                />
                <span className="text-sm text-muted-foreground dark:text-gray-400">a</span>
                <Input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="h-8 w-36 text-xs"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-4">
          <WebOrderFilters 
            activeFilters={filters}
            onFilterChange={setFilters}
          />
        </CardContent>
      </Card>

      {/* Vista de pedidos */}
      {loading ? (
        viewMode === 'list' ? (
          /* ─── Skeleton Vista Lista ─── */
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="border-b dark:border-gray-700 bg-muted/50 dark:bg-gray-800/50">
                      {['', 'Pedido', 'Cliente', 'Estado', 'Entrega', 'Items', 'Pago', 'Total', 'Tiempo', 'Acciones'].map((h, idx) => (
                        <th key={idx} className="text-left p-3 font-medium dark:text-gray-100">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b dark:border-gray-700">
                        <td className="p-3"><Skeleton className="h-4 w-4" /></td>
                        <td className="p-3"><Skeleton className="h-4 w-28" /></td>
                        <td className="p-3"><div className="space-y-1"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-20" /></div></td>
                        <td className="p-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                        <td className="p-3"><div className="space-y-1"><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-20" /></div></td>
                        <td className="p-3"><div className="space-y-1"><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-24" /></div></td>
                        <td className="p-3"><div className="space-y-1"><Skeleton className="h-4 w-16 rounded-full" /><Skeleton className="h-3 w-20" /></div></td>
                        <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                        <td className="p-3"><div className="space-y-1"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-12" /></div></td>
                        <td className="p-3"><div className="flex justify-center gap-1"><Skeleton className="h-7 w-20" /><Skeleton className="h-7 w-7" /></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* ─── Skeleton Vista Kanban ─── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {['Pendientes', 'Confirmados', 'Preparando', 'Listos'].map((col) => (
              <div key={col} className="space-y-3 sm:space-y-4">
                <div className="flex items-center gap-2 p-2 bg-muted/50 dark:bg-gray-800/50 rounded-lg">
                  <Skeleton className="w-3 h-3 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex justify-between">
                        <Skeleton className="h-5 w-28" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </div>
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-8 w-full rounded-lg" />
                      <div className="space-y-1">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-3/4" />
                      </div>
                      <div className="flex justify-between border-t dark:border-gray-700 pt-3">
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-5 w-20" />
                      </div>
                      <div className="flex gap-2">
                        <Skeleton className="h-8 flex-1" />
                        <Skeleton className="h-8 w-8" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))}
          </div>
        )
      ) : orders.length === 0 ? (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-8 sm:p-12 text-center">
            <p className="text-muted-foreground dark:text-gray-300">No hay pedidos que mostrar</p>
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        /* ─── Vista Lista ─── */
        <div className="space-y-3">
          {/* Barra de acciones masivas */}
          {selectedOrders.size > 0 && (
            <div className="flex items-center justify-between gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium dark:text-blue-200">{selectedOrders.size} seleccionado(s)</span>
                <Button variant="ghost" size="sm" className="h-7 px-2 dark:text-gray-300" onClick={clearSelection}>
                  <X className="h-3 w-3 mr-1" />
                  Limpiar
                </Button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs dark:text-white"
                  disabled={bulkActionLoading}
                  onClick={() => handleBulkStatusChange('confirmed')}
                >
                  <CheckCircle className="h-3 w-3 mr-1 dark:text-white" />
                  Confirmar
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs dark:text-white"
                  disabled={bulkActionLoading}
                  onClick={() => handleBulkStatusChange('preparing')}
                >
                  <Clock className="h-3 w-3 mr-1 dark:text-white" />
                  En proceso
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs dark:text-white"
                  disabled={bulkActionLoading}
                  onClick={() => handleBulkStatusChange('ready')}
                >
                  <Package className="h-3 w-3 mr-1 dark:text-white" />
                  Listos
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs dark:text-white"
                  disabled={bulkActionLoading}
                  onClick={() => handleBulkStatusChange('delivered')}
                >
                  <CheckCircle className="h-3 w-3 mr-1 dark:text-white" />
                  Entregados
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs dark:text-white"
                  disabled={bulkActionLoading}
                  onClick={handleBulkMarkPaid}
                >
                  <Coins className="h-3 w-3 mr-1 dark:text-white" />
                  Marcar pagados
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs dark:border-gray-600 dark:text-gray-200"
                  onClick={handleBulkPrint}
                >
                  <Printer className="h-3 w-3 mr-1 dark:text-gray-300" />
                  Imprimir
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs dark:border-gray-600 dark:text-gray-200"
                  onClick={handleBulkExport}
                >
                  <Download className="h-3 w-3 mr-1 dark:text-gray-300" />
                  Exportar CSV
                </Button>
              </div>
            </div>
          )}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b dark:border-gray-700 bg-muted/50 dark:bg-gray-800/50">
                    <th className="text-left p-3 w-10">
                      <Checkbox
                        checked={(() => {
                          const pageOrders = orders.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
                          return pageOrders.length > 0 && pageOrders.every(o => selectedOrders.has(o.id));
                        })()}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="text-left p-3 font-medium dark:text-gray-100">Pedido</th>
                    <th className="text-left p-3 font-medium dark:text-gray-100">Cliente</th>
                    <th className="text-left p-3 font-medium dark:text-gray-100">Estado</th>
                    <th className="text-left p-3 font-medium dark:text-gray-100">Entrega</th>
                    <th className="text-left p-3 font-medium dark:text-gray-100">Items</th>
                    <th className="text-left p-3 font-medium dark:text-gray-100">Pago</th>
                    <th className="text-right p-3 font-medium dark:text-gray-100">Total</th>
                    <th className="text-left p-3 font-medium dark:text-gray-100">Tiempo</th>
                    <th className="text-center p-3 font-medium dark:text-gray-100">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map(order => {
                    const minutesSince = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
                    const timeSince = minutesSince < 60 ? `${minutesSince} min` : `${Math.floor(minutesSince / 60)}h ${minutesSince % 60}min`;
                    return (
                    <tr key={order.id} className={`border-b dark:border-gray-700 hover:bg-muted/30 dark:hover:bg-gray-800/50 transition-colors ${selectedOrders.has(order.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                      <td className="p-3">
                        <Checkbox
                          checked={selectedOrders.has(order.id)}
                          onCheckedChange={() => toggleSelectOrder(order.id)}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium dark:text-gray-100">{order.order_number}</span>
                            {order.is_scheduled && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                                <CalendarClock className="h-3 w-3" />
                                Programado
                              </span>
                            )}
                            {order.tip_amount > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                                <Coins className="h-3 w-3" />
                                Propina
                              </span>
                            )}
                          </div>
                          {order.customer_notes && (
                            <span className="text-xs text-yellow-700 dark:text-yellow-300 line-clamp-1 max-w-[180px]" title={order.customer_notes}>
                              📝 {order.customer_notes}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="dark:text-gray-300">{order.customer_name || order.customer?.full_name || '—'}</span>
                          {(order.customer_phone || order.customer?.phone) && (
                            <span className="text-xs text-muted-foreground dark:text-gray-400 flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {order.customer_phone || order.customer?.phone}
                            </span>
                          )}
                          {(order.customer_email || order.customer?.email) && (
                            <span className="text-xs text-muted-foreground dark:text-gray-400 truncate max-w-[150px]" title={order.customer_email || order.customer?.email}>
                              {order.customer_email || order.customer?.email}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1 text-xs dark:text-gray-300">
                            {order.delivery_type === 'pickup' && <Store className="h-3 w-3 dark:text-gray-400" />}
                            {order.delivery_type === 'delivery_own' && <Bike className="h-3 w-3 dark:text-gray-400" />}
                            {order.delivery_type === 'delivery_third_party' && <Truck className="h-3 w-3 dark:text-gray-400" />}
                            {order.delivery_type === 'pickup' ? 'Retiro' : order.delivery_type === 'delivery_own' ? 'Propio' : 'Tercero'}
                          </span>
                          {order.delivery_type !== 'pickup' && order.delivery_address?.address && (
                            <span className="text-xs text-muted-foreground dark:text-gray-400 flex items-center gap-1 max-w-[120px] truncate" title={order.delivery_address.address}>
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{order.delivery_address.address}</span>
                            </span>
                          )}
                          {order.delivery_type !== 'pickup' && order.delivery_address?.city && (
                            <span className="text-xs text-muted-foreground dark:text-gray-400">
                              {order.delivery_address.city}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium dark:text-gray-200">{order.items?.length || 0} producto(s)</span>
                          <div className="text-xs text-muted-foreground dark:text-gray-400 space-y-0.5 max-w-[160px]">
                            {order.items?.slice(0, 2).map((item, idx) => (
                              <div key={idx} className="flex justify-between gap-1">
                                <span className="truncate">{item.quantity}x {item.product_name}</span>
                              </div>
                            ))}
                            {(order.items?.length || 0) > 2 && (
                              <span className="text-xs">+{order.items!.length - 2} más...</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <PaymentStatusBadge status={order.payment_status} />
                          <span className="text-xs text-muted-foreground dark:text-gray-400">
                            {getPaymentLabel(order.payment_method)}
                            {order.payment_method_detail && ` · ${getPaymentDetailLabel(order.payment_method_detail)}`}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-right font-semibold dark:text-gray-100">${order.total.toLocaleString()}</td>
                      <td className="p-3 text-xs text-muted-foreground dark:text-gray-400">
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 dark:text-gray-400" />
                            {new Date(order.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="font-medium text-muted-foreground dark:text-gray-400">
                            {timeSince}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          {order.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-xs dark:text-white"
                                onClick={() => setConfirmDialog({ open: true, orderId: order.id })}
                              >
                                <CheckCircle className="h-3 w-3 mr-1 dark:text-white" />
                                Confirmar
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 w-7 p-0"
                                onClick={() => setRejectDialog({ open: true, orderId: order.id })}
                              >
                                <XCircle className="h-3 w-3 dark:text-white" />
                              </Button>
                            </>
                          )}
                          {order.status === 'confirmed' && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs dark:text-white"
                              onClick={() => handleUpdateStatus(order.id, 'preparing')}
                            >
                              <Clock className="h-3 w-3 mr-1 dark:text-white" />
                              Preparar
                            </Button>
                          )}
                          {order.status === 'preparing' && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs dark:text-white"
                              onClick={() => handleUpdateStatus(order.id, 'ready')}
                            >
                              Listo
                            </Button>
                          )}
                          {order.status === 'ready' && order.delivery_type === 'pickup' && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs dark:text-white"
                              onClick={() => handleUpdateStatus(order.id, 'delivered')}
                            >
                              Entregado
                            </Button>
                          )}
                          {order.status === 'ready' && order.delivery_type !== 'pickup' && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs dark:text-white"
                              onClick={() => handleUpdateStatus(order.id, 'in_delivery')}
                            >
                              Enviar
                            </Button>
                          )}
                          {order.status === 'in_delivery' && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs dark:text-white"
                              onClick={() => handleUpdateStatus(order.id, 'delivered')}
                            >
                              Entregado
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0 dark:border-gray-600"
                            onClick={() => handleViewDetails(order.id)}
                          >
                            <Eye className="h-3 w-3 dark:text-gray-300" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Paginación lista */}
            {orders.length > ITEMS_PER_PAGE && (
              <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-t dark:border-gray-700">
                <span className="text-sm text-muted-foreground dark:text-gray-300">
                  {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, orders.length)} de {orders.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                    className="dark:border-gray-600"
                  >
                    <ChevronLeft className="h-4 w-4 dark:text-gray-300" />
                  </Button>
                  <span className="text-sm px-2 dark:text-gray-300">
                    {currentPage} / {Math.ceil(orders.length / ITEMS_PER_PAGE)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= Math.ceil(orders.length / ITEMS_PER_PAGE)}
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="dark:border-gray-600"
                  >
                    <ChevronRight className="h-4 w-4 dark:text-gray-300" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      ) : (
        /* ─── Vista Kanban ─── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Columna: Pendientes */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <div className="w-3 h-3 bg-yellow-500 rounded-full" />
              <span className="font-medium text-sm sm:text-base dark:text-gray-100">Pendientes ({pendingOrders.length})</span>
            </div>
            {paginateKanban(pendingOrders, 'pending').map(order => (
              <WebOrderCard
                key={order.id}
                order={order}
                onConfirm={(id) => setConfirmDialog({ open: true, orderId: id })}
                onReject={(id) => setRejectDialog({ open: true, orderId: id })}
                onViewDetails={handleViewDetails}
              />
            ))}
            {hasMoreKanban(pendingOrders, 'pending') && (
              <Button variant="ghost" size="sm" className="w-full dark:text-gray-300" onClick={() => showMoreKanban('pending')}>
                Ver más ({pendingOrders.length - (kanbanPages.pending || 1) * KANBAN_PAGE_SIZE} restantes)
              </Button>
            )}
            {pendingOrders.length === 0 && (
              <p className="text-center text-sm text-muted-foreground dark:text-gray-400 py-4">
                Sin pedidos pendientes
              </p>
            )}
          </div>

          {/* Columna: Confirmados */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <div className="w-3 h-3 bg-blue-500 rounded-full" />
              <span className="font-medium text-sm sm:text-base dark:text-gray-100">Confirmados ({confirmedOrders.length})</span>
            </div>
            {paginateKanban(confirmedOrders, 'confirmed').map(order => (
              <WebOrderCard
                key={order.id}
                order={order}
                onUpdateStatus={handleUpdateStatus}
                onViewDetails={handleViewDetails}
              />
            ))}
            {hasMoreKanban(confirmedOrders, 'confirmed') && (
              <Button variant="ghost" size="sm" className="w-full dark:text-gray-300" onClick={() => showMoreKanban('confirmed')}>
                Ver más ({confirmedOrders.length - (kanbanPages.confirmed || 1) * KANBAN_PAGE_SIZE} restantes)
              </Button>
            )}
            {confirmedOrders.length === 0 && (
              <p className="text-center text-sm text-muted-foreground dark:text-gray-400 py-4">
                Sin pedidos confirmados
              </p>
            )}
          </div>

          {/* Columna: En preparación */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <div className="w-3 h-3 bg-orange-500 rounded-full" />
              <span className="font-medium text-sm sm:text-base dark:text-gray-100">Preparando ({preparingOrders.length})</span>
            </div>
            {paginateKanban(preparingOrders, 'preparing').map(order => (
              <WebOrderCard
                key={order.id}
                order={order}
                onUpdateStatus={handleUpdateStatus}
                onViewDetails={handleViewDetails}
              />
            ))}
            {hasMoreKanban(preparingOrders, 'preparing') && (
              <Button variant="ghost" size="sm" className="w-full dark:text-gray-300" onClick={() => showMoreKanban('preparing')}>
                Ver más ({preparingOrders.length - (kanbanPages.preparing || 1) * KANBAN_PAGE_SIZE} restantes)
              </Button>
            )}
            {preparingOrders.length === 0 && (
              <p className="text-center text-sm text-muted-foreground dark:text-gray-400 py-4">
                Nada en preparación
              </p>
            )}
          </div>

          {/* Columna: Listos / En camino */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <span className="font-medium text-sm sm:text-base dark:text-gray-100">Listos / En camino ({readyOrders.length})</span>
            </div>
            {paginateKanban(readyOrders, 'ready').map(order => (
              <WebOrderCard
                key={order.id}
                order={order}
                onUpdateStatus={handleUpdateStatus}
                onViewDetails={handleViewDetails}
              />
            ))}
            {hasMoreKanban(readyOrders, 'ready') && (
              <Button variant="ghost" size="sm" className="w-full dark:text-gray-300" onClick={() => showMoreKanban('ready')}>
                Ver más ({readyOrders.length - (kanbanPages.ready || 1) * KANBAN_PAGE_SIZE} restantes)
              </Button>
            )}
            {readyOrders.length === 0 && (
              <p className="text-center text-sm text-muted-foreground dark:text-gray-400 py-4">
                Sin pedidos listos
              </p>
            )}
          </div>
        </div>
      )}

      {/* Dialog: Confirmar pedido */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ open, orderId: open ? confirmDialog.orderId : null })}>
        <DialogContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Confirmar pedido</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Indica el tiempo estimado de preparación
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="estimated-time" className="dark:text-gray-200">Tiempo estimado (minutos)</Label>
              <Input
                id="estimated-time"
                type="number"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                min={5}
                max={120}
                className="mt-2"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="mark-as-paid"
                checked={markAsPaid}
                onCheckedChange={(checked) => setMarkAsPaid(checked === true)}
              />
              <Label htmlFor="mark-as-paid" className="text-sm font-medium cursor-pointer dark:text-gray-200">
                Marcar como pagado
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDialog({ open: false, orderId: null });
                setMarkAsPaid(false);
              }}
              className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmOrder} disabled={actionLoading} className="dark:text-white">
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin dark:text-white" />}
              Confirmar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Rechazar pedido */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog({ open, orderId: open ? rejectDialog.orderId : null })}>
        <DialogContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Rechazar pedido</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Indica el motivo del rechazo. El cliente será notificado.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reject-reason" className="dark:text-gray-200">Motivo del rechazo</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ej: Producto agotado, fuera de horario de entrega..."
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
              className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleRejectOrder} 
              disabled={actionLoading || !rejectReason.trim()}
              className="dark:text-white"
            >
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin dark:text-white" />}
              Rechazar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
