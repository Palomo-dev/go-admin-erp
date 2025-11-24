'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
  MaintenanceHeader,
  MaintenanceStats,
  MaintenanceFilters,
  MaintenanceList,
  OrderDialog,
} from '@/components/pms/mantenimiento';
import MaintenanceService, {
  type MaintenanceOrder,
  type MaintenanceStats as Stats,
} from '@/lib/services/maintenanceService';
import SpacesService, { type Space } from '@/lib/services/spacesService';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2 } from 'lucide-react';

export default function MaintenancePage() {
  const { toast } = useToast();
  const { organization } = useOrganization();

  // Estado de datos
  const [orders, setOrders] = useState<MaintenanceOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<MaintenanceOrder[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    reported: 0,
    assigned: 0,
    in_progress: 0,
    on_hold: 0,
    completed: 0,
    cancelled: 0,
  });
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; email: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Estado de UI
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [editingOrder, setEditingOrder] = useState<MaintenanceOrder | null>(null);

  // Cargar datos iniciales
  useEffect(() => {
    if (organization?.id) {
      loadData();
    }
  }, [organization?.id]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      const branchId = organization?.branch_id;

      const [ordersData, statsData, spacesData, usersData] = await Promise.all([
        MaintenanceService.getOrders({ branch_id: branchId }),
        MaintenanceService.getStats(branchId),
        SpacesService.getSpaces({ branchId: organization!.branch_id }),
        MaintenanceService.getAvailableUsers(organization!.id),
      ]);

      setOrders(ordersData);
      setFilteredOrders(ordersData);
      setStats(statsData);
      setSpaces(spacesData);
      setUsers(usersData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las órdenes de mantenimiento.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar órdenes
  useEffect(() => {
    let filtered = orders;

    // Filtrar por estado
    if (selectedStatus !== 'all') {
      filtered = filtered.filter((order) => order.status === selectedStatus);
    }

    // Filtrar por prioridad
    if (selectedPriority !== 'all') {
      filtered = filtered.filter((order) => order.priority === selectedPriority);
    }

    // Filtrar por búsqueda
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.description.toLowerCase().includes(searchLower) ||
          order.spaces?.label?.toLowerCase().includes(searchLower)
      );
    }

    setFilteredOrders(filtered);
  }, [orders, selectedStatus, selectedPriority, searchTerm]);

  // Handlers
  const handleNewOrder = () => {
    setEditingOrder(null);
    setShowOrderDialog(true);
  };

  const handleEditOrder = (order: MaintenanceOrder) => {
    setEditingOrder(order);
    setShowOrderDialog(true);
  };

  const handleSaveOrder = async (data: {
    branch_id: number;
    space_id?: string;
    description: string;
    priority: 'low' | 'med' | 'high';
    cost_estimate?: number;
    assigned_to?: string;
    status?: 'reported' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
    issue_type?: string;
    materials?: string;
  }) => {
    try {
      if (editingOrder) {
        // Actualizar orden existente
        await MaintenanceService.updateOrder(editingOrder.id, data);
        toast({
          title: 'Orden actualizada',
          description: 'La orden se actualizó correctamente.',
        });
      } else {
        // Crear nueva orden
        await MaintenanceService.createOrder(data);
        toast({
          title: 'Orden creada',
          description: 'La orden se creó correctamente.',
        });
      }

      await loadData();
    } catch (error) {
      console.error('Error guardando orden:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la orden.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleStatusChange = async (orderId: string, status: string) => {
    try {
      await MaintenanceService.updateOrderStatus(
        orderId,
        status as 'reported' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled'
      );

      toast({
        title: 'Estado actualizado',
        description: 'El estado de la orden se actualizó correctamente.',
      });

      await loadData();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta orden?')) {
      return;
    }

    try {
      await MaintenanceService.deleteOrder(orderId);

      toast({
        title: 'Orden eliminada',
        description: 'La orden se eliminó correctamente.',
      });

      await loadData();
    } catch (error) {
      console.error('Error eliminando orden:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la orden.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando órdenes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <MaintenanceHeader onNewOrder={handleNewOrder} />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats */}
        <MaintenanceStats stats={stats} />

        {/* Filters */}
        <MaintenanceFilters
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          selectedPriority={selectedPriority}
          onPriorityChange={setSelectedPriority}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />

        {/* Orders List */}
        <MaintenanceList
          orders={filteredOrders}
          onStatusChange={handleStatusChange}
          onEdit={handleEditOrder}
          onDelete={handleDeleteOrder}
        />
      </div>

      {/* Order Dialog */}
      <OrderDialog
        open={showOrderDialog}
        onOpenChange={setShowOrderDialog}
        order={editingOrder}
        spaces={spaces}
        users={users}
        branchId={organization?.branch_id || 0}
        onSave={handleSaveOrder}
      />
    </div>
  );
}
