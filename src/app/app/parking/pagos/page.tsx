'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useOrganization, getCurrentBranchIdWithFallback } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Wallet, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import parkingPaymentService, {
  type ParkingPayment,
  type PaymentStats,
  type OrganizationPaymentMethod,
} from '@/lib/services/parkingPaymentService';
import {
  PagosHeader,
  PagosFilters,
  PagosStats,
  PagosTable,
  PaymentFormDialog,
  ReversePaymentDialog,
  type PaymentFiltersState,
} from '@/components/parking/pagos';

const initialFilters: PaymentFiltersState = {
  search: '',
  source: 'all',
  method: 'all',
  status: 'all',
  startDate: '',
  endDate: '',
};

const initialStats: PaymentStats = {
  total_payments: 0,
  total_amount: 0,
  sessions_paid: 0,
  passes_paid: 0,
  pending_amount: 0,
  reversed_amount: 0,
};

export default function PagosPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();
  const branchId = getCurrentBranchIdWithFallback();

  const [payments, setPayments] = useState<ParkingPayment[]>([]);
  const [stats, setStats] = useState<PaymentStats>(initialStats);
  const [filters, setFilters] = useState<PaymentFiltersState>(initialFilters);
  const [paymentMethods, setPaymentMethods] = useState<OrganizationPaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog states
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [showReverseDialog, setShowReverseDialog] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<ParkingPayment | null>(null);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const filterParams = {
        search: filters.search || undefined,
        source: filters.source === 'all' ? undefined : (filters.source as 'parking_session' | 'parking_pass'),
        status: filters.status === 'all' ? undefined : (filters.status as 'pending' | 'completed' | 'reversed'),
        method: filters.method === 'all' ? undefined : filters.method,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
      };

      const [paymentsData, statsData, methodsData] = await Promise.all([
        parkingPaymentService.getPayments(organization.id, filterParams),
        parkingPaymentService.getPaymentStats(organization.id, filters.startDate, filters.endDate),
        parkingPaymentService.getPaymentMethods(organization.id),
      ]);

      setPayments(paymentsData);
      setStats(statsData);
      setPaymentMethods(methodsData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, filters, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleNewPayment = () => {
    setShowFormDialog(true);
  };

  const handleViewDetails = (payment: ParkingPayment) => {
    toast({
      title: 'Detalle del pago',
      description: `Pago de ${payment.amount} - ${payment.method}`,
    });
  };

  const handleReverse = (payment: ParkingPayment) => {
    setSelectedPayment(payment);
    setShowReverseDialog(true);
  };

  const handleExport = () => {
    if (payments.length === 0) {
      toast({
        title: 'Sin datos',
        description: 'No hay pagos para exportar',
        variant: 'destructive',
      });
      return;
    }

    const headers = ['Fecha', 'Origen', 'Detalle', 'Método', 'Referencia', 'Monto', 'Estado'];
    const rows = payments.map((p) => [
      new Date(p.created_at).toLocaleString('es-CO'),
      p.source === 'parking_session' ? 'Sesión' : 'Abonado',
      p.session?.vehicle_plate || p.pass?.plan_name || '-',
      p.method,
      p.reference || '-',
      p.amount,
      p.status,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pagos_parking_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Exportación completada',
      description: 'El archivo CSV se ha descargado',
    });
  };

  // Loading state
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // No organization
  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Sin organización
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Debes pertenecer a una organización para acceder a esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <PagosHeader
        onNewPayment={handleNewPayment}
        onRefresh={loadData}
        onExport={handleExport}
        isLoading={isLoading}
      />

      {/* Stats */}
      <PagosStats stats={stats} isLoading={isLoading} />

      {/* Filters */}
      <PagosFilters
        filters={filters}
        onFiltersChange={setFilters}
        paymentMethods={paymentMethods}
      />

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-gray-500 dark:text-gray-400">Cargando pagos...</span>
        </div>
      ) : payments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
            <Wallet className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No hay pagos
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-sm">
            {filters.search ||
            filters.source !== 'all' ||
            filters.method !== 'all' ||
            filters.status !== 'all'
              ? 'No se encontraron pagos con los filtros seleccionados'
              : 'No hay pagos registrados en el sistema'}
          </p>
          <Button onClick={handleNewPayment} className="bg-blue-600 hover:bg-blue-700">
            Registrar primer pago
          </Button>
        </div>
      ) : (
        <PagosTable
          payments={payments}
          onViewDetails={handleViewDetails}
          onReverse={handleReverse}
        />
      )}

      {/* Form Dialog */}
      {organization?.id && (
        <PaymentFormDialog
          open={showFormDialog}
          onOpenChange={setShowFormDialog}
          organizationId={organization.id}
          branchId={branchId}
          paymentMethods={paymentMethods}
          onSuccess={loadData}
        />
      )}

      {/* Reverse Dialog */}
      <ReversePaymentDialog
        open={showReverseDialog}
        onOpenChange={setShowReverseDialog}
        payment={selectedPayment}
        onSuccess={loadData}
      />
    </div>
  );
}
