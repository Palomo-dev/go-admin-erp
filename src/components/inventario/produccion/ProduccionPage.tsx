'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import {
  productionOrderService,
  type ProductionOrder,
  type ProductionOrderStatus,
} from '@/lib/services/productionOrderService';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { ProductionOrderDialog } from './ProductionOrderDialog';
import { ProductionOrderHeader } from './ProductionOrderHeader';
import { ProductionOrderStats } from './ProductionOrderStats';
import { ProductionOrderFilters } from './ProductionOrderFilters';
import { ProductionOrderTable } from './ProductionOrderTable';
import { ProductionOrderDetailDialog } from './ProductionOrderDetailDialog';

export function ProduccionPage() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showDialog, setShowDialog] = useState(false);
  const [viewOrder, setViewOrder] = useState<ProductionOrder | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => {
    if (organizationId) {
      cargarOrders();
    }
  }, [organizationId]);

  const cargarOrders = async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const data = await productionOrderService.getOrders(organizationId);
      setOrders(data);
    } catch (error) {
      console.error('Error cargando órdenes:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las órdenes de producción',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (order: ProductionOrder) => {
    try {
      setViewLoading(true);
      const fullOrder = await productionOrderService.getOrderById(order.id);
      setViewOrder(fullOrder);
    } catch (error) {
      console.error('Error cargando detalle:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el detalle',
        variant: 'destructive',
      });
    } finally {
      setViewLoading(false);
    }
  };

  const handleAction = async (
    order: ProductionOrder,
    action: 'confirm' | 'start' | 'complete' | 'cancel'
  ) => {
    try {
      setActionLoading(order.id);

      if (action === 'confirm') {
        await productionOrderService.confirmOrder(order.id);
        toast({ title: 'Orden confirmada' });
      } else if (action === 'start') {
        await productionOrderService.startOrder(order.id);
        toast({ title: 'Orden iniciada' });
      } else if (action === 'complete') {
        const qty = prompt('Cantidad producida:', String(order.qty_to_produce));
        if (qty === null) return;
        await productionOrderService.completeOrder(order.id, parseFloat(qty) || order.qty_to_produce);
        toast({ title: 'Orden completada' });
      } else if (action === 'cancel') {
        if (!confirm('¿Cancelar esta orden de producción?')) return;
        await productionOrderService.cancelOrder(order.id);
        toast({ title: 'Orden cancelada' });
      }

      cargarOrders();
      if (viewOrder?.id === order.id) {
        handleView({ ...order, status: 'completed' as ProductionOrderStatus });
      }
    } catch (error) {
      console.error('Error en acción:', error);
      toast({
        title: 'Error',
        description: 'No se pudo completar la acción',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (order: ProductionOrder) => {
    if (!confirm('¿Eliminar esta orden de producción?')) return;
    try {
      await productionOrderService.deleteOrder(order.id);
      toast({ title: 'Orden eliminada' });
      cargarOrders();
    } catch (error) {
      console.error('Error eliminando:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la orden',
        variant: 'destructive',
      });
    }
  };

  const ordersFiltradas = orders.filter((o) => {
    const matchesSearch =
      o.product?.name?.toLowerCase().includes(busqueda.toLowerCase()) ||
      o.recipe?.name?.toLowerCase().includes(busqueda.toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(ordersFiltradas.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const ordersPaginadas = useMemo(
    () => ordersFiltradas.slice(startIndex, startIndex + pageSize),
    [ordersFiltradas, startIndex, pageSize]
  );

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda, statusFilter]);

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <ProductionOrderHeader
        loading={loading}
        onRefresh={cargarOrders}
        onNewOrder={() => setShowDialog(true)}
      />

      <ProductionOrderStats orders={orders} />

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-4">
          <ProductionOrderFilters
            busqueda={busqueda}
            onBusquedaChange={setBusqueda}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
        </CardHeader>
        <CardContent>
          <ProductionOrderTable
            orders={ordersPaginadas}
            loading={loading}
            actionLoading={actionLoading}
            onView={handleView}
            onAction={handleAction}
            onDelete={handleDelete}
          />

          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={ordersFiltradas.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={handlePageSizeChange}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        </CardContent>
      </Card>

      <ProductionOrderDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        onSaved={cargarOrders}
      />

      <ProductionOrderDetailDialog
        order={viewOrder}
        open={!!viewOrder}
        onOpenChange={(open) => !open && setViewOrder(null)}
        loading={viewLoading}
      />
    </div>
  );
}
