'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toastSuccess, toastError } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { purchaseOrderService, type PurchaseOrder, type PurchaseOrderStats } from '@/lib/services/purchaseOrderService';
import { describeSkippedItems } from '@/lib/services/stockMovementService';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import {
  OrdenesCompraHeader,
  OrdenesCompraStats,
  OrdenesCompraFilters,
  OrdenesCompraTable
} from '@/components/inventario/ordenes-compra';
import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';

export default function OrdenesCompraPage() {
  const router = useRouter();

  // Estados
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [stats, setStats] = useState<PurchaseOrderStats>({
    total: 0, draft: 0, sent: 0, partial: 0, received: 0, cancelled: 0, totalAmount: 0
  });
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');

  // Dialog de eliminación
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);

  // Cargar datos
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const organizationId = getOrganizationId();

      const [ordersResult, statsResult, suppliersData, branchesData] = await Promise.all([
        purchaseOrderService.getPurchaseOrders(organizationId, {
          status: statusFilter !== 'all' ? statusFilter : undefined,
          supplierId: supplierFilter !== 'all' ? parseInt(supplierFilter) : undefined,
          branchId: branchFilter !== 'all' ? parseInt(branchFilter) : undefined
        }),
        purchaseOrderService.getStats(organizationId),
        purchaseOrderService.getSuppliers(organizationId),
        purchaseOrderService.getBranches(organizationId)
      ]);

      if (ordersResult.error) throw ordersResult.error;

      setOrders(ordersResult.data);
      setStats(statsResult);
      setSuppliers(suppliersData);
      setBranches(branchesData);
    } catch (error: any) {
      console.error('Error cargando datos:', error);
      toastError('Error', error?.message || 'No se pudieron cargar las órdenes de compra');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, supplierFilter, branchFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtrar por búsqueda local
  const filteredOrders = orders.filter((order) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      order.suppliers?.name?.toLowerCase().includes(searchLower) ||
      order.notes?.toLowerCase().includes(searchLower) ||
      `OC-${order.id}`.toLowerCase().includes(searchLower)
    );
  });

  // Handlers
  const handleDuplicate = async (orderUuid: string) => {
    try {
      const organizationId = getOrganizationId();
      const { data, error } = await purchaseOrderService.duplicatePurchaseOrder(orderUuid, organizationId);

      if (error) throw error;

      toastSuccess('Orden duplicada', 'La orden de compra ha sido duplicada correctamente');

      if (data) {
        router.push(`/app/inventario/ordenes-compra/${data.uuid}/editar`);
      }
    } catch (error: any) {
      toastError('Error', error?.message || 'No se pudo duplicar la orden');
    }
  };

  const handleDelete = (orderUuid: string) => {
    setOrderToDelete(orderUuid);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!orderToDelete) return;

    try {
      const organizationId = getOrganizationId();
      const { success, error } = await purchaseOrderService.deletePurchaseOrder(orderToDelete, organizationId);

      if (error) throw error;

      toastSuccess('Orden eliminada', 'La orden de compra ha sido eliminada correctamente');

      setOrders(orders.filter(o => o.uuid !== orderToDelete));
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
    } catch (error: any) {
      toastError('Error', error?.message || 'No se pudo eliminar la orden');
    }
  };

  const handleStatusChange = async (orderUuid: string, newStatus: 'sent' | 'received' | 'cancelled') => {
    try {
      const organizationId = getOrganizationId();

      // Recibir no es un simple cambio de estado: tiene que entrar la mercancia al
      // inventario. Antes esto llamaba a updateStatus y la orden quedaba en
      // 'received' sin un solo movimiento de stock asociado.
      if (newStatus === 'received') {
        const { error, stock } = await purchaseOrderService.receiveAllPending(orderUuid, organizationId);

        if (error) throw error;

        toastSuccess('Orden recibida', 'Se recibio el pendiente y se sumo al stock de la sucursal');

        if (stock?.skippedItems.length) {
          toastError(
            `${stock.skippedItems.length} item(s) no afectaron el inventario`,
            describeSkippedItems(stock.skippedItems)
          );
        }

        if (stock?.errors.length) {
          toastError('Errores al sumar stock', stock.errors.join('; '));
        }

        loadData();
        return;
      }

      const { error } = await purchaseOrderService.updateStatus(orderUuid, organizationId, newStatus);

      if (error) throw error;

      const statusLabels: Record<string, string> = {
        sent: 'enviada',
        cancelled: 'cancelada'
      };

      toastSuccess('Estado actualizado', `La orden ha sido ${statusLabels[newStatus]}`);

      loadData();
    } catch (error: any) {
      toastError('Error', error?.message || 'No se pudo actualizar el estado');
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <DetailSkeleton />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <OrdenesCompraHeader />

      <OrdenesCompraStats stats={stats} />

      <OrdenesCompraFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        supplierFilter={supplierFilter}
        onSupplierChange={setSupplierFilter}
        branchFilter={branchFilter}
        onBranchChange={setBranchFilter}
        suppliers={suppliers}
        branches={branches}
      />

      <OrdenesCompraTable
        orders={filteredOrders}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onStatusChange={handleStatusChange}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">¿Eliminar orden de compra?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer. La orden de compra será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-700">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
