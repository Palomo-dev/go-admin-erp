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
import { 
  RefreshCw, 
  Bell, 
  BellOff,
  Volume2,
  VolumeX,
  Loader2
} from 'lucide-react';
import { WebOrderCard } from '@/components/pos/pedidos-online/WebOrderCard';
import { WebOrderFilters } from '@/components/pos/pedidos-online/WebOrderFilters';
import { WebOrderStats } from '@/components/pos/pedidos-online/WebOrderStats';
import { 
  webOrdersService, 
  type WebOrder, 
  type WebOrderStatus,
  type DeliveryType,
  type PaymentStatus,
  type OrderSource
} from '@/lib/services/webOrdersService';

interface LocalFilters {
  status?: WebOrderStatus[];
  delivery_type?: DeliveryType;
  source?: OrderSource;
  payment_status?: PaymentStatus;
  search?: string;
}

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
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<LocalFilters>({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

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
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [actionLoading, setActionLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const [ordersData, statsData] = await Promise.all([
        webOrdersService.getOrders(filters),
        webOrdersService.getOrderStats()
      ]);
      setOrders(ordersData);
      setStats(statsData);
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
  }, [filters, toast]);

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
      await webOrdersService.confirmOrder(confirmDialog.orderId, estimatedMinutes);
      toast({
        title: 'Pedido confirmado',
        description: `Tiempo estimado: ${estimatedMinutes} minutos`,
      });
      setConfirmDialog({ open: false, orderId: null });
      loadOrders();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo confirmar el pedido',
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

  const getStatusLabel = (status: WebOrderStatus): string => {
    const labels: Record<WebOrderStatus, string> = {
      pending: 'pendiente',
      confirmed: 'confirmado',
      preparing: 'en preparación',
      ready: 'listo',
      in_delivery: 'en camino',
      delivered: 'entregado',
      cancelled: 'cancelado',
      rejected: 'rechazado',
    };
    return labels[status];
  };

  const handleViewDetails = (orderId: string) => {
    router.push(`/app/pos/pedidos-online/${orderId}`);
  };

  // Agrupar pedidos por estado para vista tipo Kanban
  const pendingOrders = orders.filter(o => o.status === 'pending');
  const confirmedOrders = orders.filter(o => o.status === 'confirmed');
  const preparingOrders = orders.filter(o => o.status === 'preparing');
  const readyOrders = orders.filter(o => ['ready', 'in_delivery'].includes(o.status));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pedidos Online</h1>
          <p className="text-muted-foreground">
            Gestiona los pedidos recibidos desde el sitio web
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Silenciar notificaciones' : 'Activar sonido'}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? 'Desactivar auto-refresh' : 'Activar auto-refresh'}
          >
            {autoRefresh ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadOrders()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Estadísticas */}
      <WebOrderStats stats={stats} isLoading={loading} />

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <WebOrderFilters 
            activeFilters={filters}
            onFilterChange={setFilters}
          />
        </CardContent>
      </Card>

      {/* Vista Kanban de pedidos */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">No hay pedidos que mostrar</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Columna: Pendientes */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <div className="w-3 h-3 bg-yellow-500 rounded-full" />
              <span className="font-medium">Pendientes ({pendingOrders.length})</span>
            </div>
            {pendingOrders.map(order => (
              <WebOrderCard
                key={order.id}
                order={order}
                onConfirm={(id) => setConfirmDialog({ open: true, orderId: id })}
                onReject={(id) => setRejectDialog({ open: true, orderId: id })}
                onViewDetails={handleViewDetails}
              />
            ))}
            {pendingOrders.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                Sin pedidos pendientes
              </p>
            )}
          </div>

          {/* Columna: Confirmados */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <div className="w-3 h-3 bg-blue-500 rounded-full" />
              <span className="font-medium">Confirmados ({confirmedOrders.length})</span>
            </div>
            {confirmedOrders.map(order => (
              <WebOrderCard
                key={order.id}
                order={order}
                onUpdateStatus={handleUpdateStatus}
                onViewDetails={handleViewDetails}
              />
            ))}
            {confirmedOrders.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                Sin pedidos confirmados
              </p>
            )}
          </div>

          {/* Columna: En preparación */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <div className="w-3 h-3 bg-orange-500 rounded-full" />
              <span className="font-medium">Preparando ({preparingOrders.length})</span>
            </div>
            {preparingOrders.map(order => (
              <WebOrderCard
                key={order.id}
                order={order}
                onUpdateStatus={handleUpdateStatus}
                onViewDetails={handleViewDetails}
              />
            ))}
            {preparingOrders.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                Nada en preparación
              </p>
            )}
          </div>

          {/* Columna: Listos / En camino */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <span className="font-medium">Listos / En camino ({readyOrders.length})</span>
            </div>
            {readyOrders.map(order => (
              <WebOrderCard
                key={order.id}
                order={order}
                onUpdateStatus={handleUpdateStatus}
                onViewDetails={handleViewDetails}
              />
            ))}
            {readyOrders.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                Sin pedidos listos
              </p>
            )}
          </div>
        </div>
      )}

      {/* Dialog: Confirmar pedido */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ open, orderId: open ? confirmDialog.orderId : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar pedido</DialogTitle>
            <DialogDescription>
              Indica el tiempo estimado de preparación
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="estimated-time">Tiempo estimado (minutos)</Label>
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
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setConfirmDialog({ open: false, orderId: null })}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmOrder} disabled={actionLoading}>
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Rechazar pedido */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog({ open, orderId: open ? rejectDialog.orderId : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar pedido</DialogTitle>
            <DialogDescription>
              Indica el motivo del rechazo. El cliente será notificado.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reject-reason">Motivo del rechazo</Label>
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
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleRejectOrder} 
              disabled={actionLoading || !rejectReason.trim()}
            >
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Rechazar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
