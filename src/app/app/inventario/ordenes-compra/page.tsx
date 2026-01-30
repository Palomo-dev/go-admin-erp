'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { purchaseOrderService, type PurchaseOrder, type PurchaseOrderStats } from '@/lib/services/purchaseOrderService';
import { Loader2 } from 'lucide-react';
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

export default function OrdenesCompraPage() {
  const router = useRouter();
  const { toast } = useToast();

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
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'No se pudieron cargar las órdenes de compra'
      });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, supplierFilter, branchFilter, toast]);

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

      toast({
        title: 'Orden duplicada',
        description: 'La orden de compra ha sido duplicada correctamente'
      });

      if (data) {
        router.push(`/app/inventario/ordenes-compra/${data.uuid}/editar`);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'No se pudo duplicar la orden'
      });
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

      toast({
        title: 'Orden eliminada',
        description: 'La orden de compra ha sido eliminada correctamente'
      });

      setOrders(orders.filter(o => o.uuid !== orderToDelete));
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'No se pudo eliminar la orden'
      });
    }
  };

  const handleStatusChange = async (orderUuid: string, newStatus: 'sent' | 'partial' | 'received' | 'cancelled') => {
    try {
      const organizationId = getOrganizationId();
      const { success, error } = await purchaseOrderService.updateStatus(orderUuid, organizationId, newStatus);

      if (error) throw error;

      const statusLabels: Record<string, string> = {
        sent: 'enviada',
        partial: 'marcada como parcial',
        received: 'marcada como recibida',
        cancelled: 'cancelada'
      };

      toast({
        title: 'Estado actualizado',
        description: `La orden ha sido ${statusLabels[newStatus]}`
      });

      loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'No se pudo actualizar el estado'
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Cargando órdenes de compra...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
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
