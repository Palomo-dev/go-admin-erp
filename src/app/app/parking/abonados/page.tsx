'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, CreditCard, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import parkingService, { type ParkingPass, type ParkingPassType } from '@/lib/services/parkingService';
import {
  PassesHeader,
  PassesFilters,
  PassesStats,
  PassesTable,
  PassFormDialog,
  PassVehiclesDialog,
  type PassFiltersState,
} from '@/components/pms/parking/abonados';

const initialFilters: PassFiltersState = {
  search: '',
  status: 'all',
  expiringDays: 'all',
};

export default function AbonadosPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [passes, setPasses] = useState<ParkingPass[]>([]);
  const [passTypes, setPassTypes] = useState<ParkingPassType[]>([]);
  const [filters, setFilters] = useState<PassFiltersState>(initialFilters);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog states
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [showVehiclesDialog, setShowVehiclesDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [selectedPass, setSelectedPass] = useState<ParkingPass | null>(null);

  // Cargar datos
  const loadData = useCallback(async () => {
    const orgId = organization?.id;
    if (!orgId) return;

    setIsLoading(true);
    try {
      const [passesData, typesData] = await Promise.all([
        parkingService.getPasses(orgId),
        parkingService.getPassTypes(orgId),
      ]);

      setPasses(passesData);
      setPassTypes(typesData);
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
  }, [organization?.id, toast]);

  useEffect(() => {
    if (organization?.id) {
      loadData();
    }
  }, [organization?.id, loadData]);

  // Filtrar pases
  const filteredPasses = passes.filter((pass) => {
    // Filtro de búsqueda
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const customerName = pass.customer?.full_name?.toLowerCase() || '';
      const plates = pass.vehicles?.map(v => v.vehicle?.plate?.toLowerCase()).join(' ') || '';
      const planName = pass.plan_name?.toLowerCase() || '';
      
      if (!customerName.includes(searchLower) && 
          !plates.includes(searchLower) && 
          !planName.includes(searchLower)) {
        return false;
      }
    }

    // Filtro de estado
    if (filters.status !== 'all' && pass.status !== filters.status) {
      return false;
    }

    // Filtro de vencimiento próximo
    if (filters.expiringDays !== 'all') {
      const daysRemaining = Math.ceil(
        (new Date(pass.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      const maxDays = parseInt(filters.expiringDays);
      if (daysRemaining > maxDays || daysRemaining < 0) {
        return false;
      }
    }

    return true;
  });

  // Estadísticas
  const stats = {
    total: passes.length,
    active: passes.filter(p => p.status === 'active').length,
    expired: passes.filter(p => p.status === 'expired').length,
    suspended: passes.filter(p => p.status === 'suspended').length,
    expiringSoon: passes.filter(p => {
      const days = Math.ceil((new Date(p.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      return p.status === 'active' && days <= 7 && days > 0;
    }).length,
  };

  // Handlers
  const handleNewPass = () => {
    setSelectedPass(null);
    setShowFormDialog(true);
  };

  const handleEditPass = (pass: ParkingPass) => {
    setSelectedPass(pass);
    setShowFormDialog(true);
  };

  const handleDuplicatePass = (pass: ParkingPass) => {
    // Crear una copia del pase sin ID
    const duplicatedPass = {
      ...pass,
      id: undefined,
      status: 'active' as const,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + (pass.pass_type?.duration_days || 30) * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0],
    };
    setSelectedPass(duplicatedPass as ParkingPass);
    setShowFormDialog(true);
  };

  const handleManageVehicles = (pass: ParkingPass) => {
    setSelectedPass(pass);
    setShowVehiclesDialog(true);
  };

  const handleSuspendPass = (pass: ParkingPass) => {
    setSelectedPass(pass);
    setShowSuspendDialog(true);
  };

  const handleCancelPass = (pass: ParkingPass) => {
    setSelectedPass(pass);
    setShowCancelDialog(true);
  };

  const handleReactivatePass = async (pass: ParkingPass) => {
    try {
      await parkingService.reactivatePass(pass.id);
      toast({
        title: 'Pase reactivado',
        description: 'El pase se ha reactivado correctamente',
      });
      loadData();
    } catch (error) {
      console.error('Error reactivating pass:', error);
      toast({
        title: 'Error',
        description: 'No se pudo reactivar el pase',
        variant: 'destructive',
      });
    }
  };

  const handleRenewPass = (pass: ParkingPass) => {
    // Renovar = Crear nuevo pase con mismos datos pero nuevas fechas
    const renewedPass = {
      ...pass,
      id: undefined,
      status: 'active' as const,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + (pass.pass_type?.duration_days || 30) * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0],
    };
    setSelectedPass(renewedPass as ParkingPass);
    setShowFormDialog(true);
    toast({
      title: 'Renovación de pase',
      description: 'Complete los datos para renovar el pase',
    });
  };

  const confirmSuspend = async () => {
    if (!selectedPass) return;

    try {
      await parkingService.suspendPass(selectedPass.id);
      toast({
        title: 'Pase suspendido',
        description: 'El pase se ha suspendido correctamente',
      });
      loadData();
    } catch (error) {
      console.error('Error suspending pass:', error);
      toast({
        title: 'Error',
        description: 'No se pudo suspender el pase',
        variant: 'destructive',
      });
    } finally {
      setShowSuspendDialog(false);
      setSelectedPass(null);
    }
  };

  const confirmCancel = async () => {
    if (!selectedPass) return;

    try {
      await parkingService.cancelPass(selectedPass.id);
      toast({
        title: 'Pase cancelado',
        description: 'El pase se ha cancelado correctamente',
      });
      loadData();
    } catch (error) {
      console.error('Error cancelling pass:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cancelar el pase',
        variant: 'destructive',
      });
    } finally {
      setShowCancelDialog(false);
      setSelectedPass(null);
    }
  };

  // Loading state
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center h-96">
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
      <PassesHeader
        onNewPass={handleNewPass}
        onRefresh={loadData}
        isLoading={isLoading}
      />

      {/* Stats */}
      <PassesStats stats={stats} isLoading={isLoading} />

      {/* Filters */}
      <PassesFilters filters={filters} onFiltersChange={setFilters} />

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-gray-500 dark:text-gray-400">
            Cargando abonados...
          </span>
        </div>
      ) : filteredPasses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
            <CreditCard className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No hay abonados
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-sm">
            {filters.search || filters.status !== 'all'
              ? 'No se encontraron abonados con los filtros seleccionados'
              : 'No hay pases de abonados registrados'}
          </p>
          <Button onClick={handleNewPass} className="bg-blue-600 hover:bg-blue-700">
            Crear primer abonado
          </Button>
        </div>
      ) : (
        <PassesTable
          passes={filteredPasses}
          onEdit={handleEditPass}
          onDuplicate={handleDuplicatePass}
          onManageVehicles={handleManageVehicles}
          onSuspend={handleSuspendPass}
          onCancel={handleCancelPass}
          onReactivate={handleReactivatePass}
          onRenew={handleRenewPass}
        />
      )}

      {/* Form Dialog */}
      {organization?.id && (
        <PassFormDialog
          open={showFormDialog}
          onOpenChange={setShowFormDialog}
          organizationId={organization.id}
          pass={selectedPass}
          passTypes={passTypes}
          onSuccess={loadData}
        />
      )}

      {/* Vehicles Dialog */}
      {selectedPass && (
        <PassVehiclesDialog
          open={showVehiclesDialog}
          onOpenChange={setShowVehiclesDialog}
          pass={selectedPass}
          organizationId={organization?.id || 0}
          onSuccess={loadData}
        />
      )}

      {/* Suspend Confirmation Dialog */}
      <AlertDialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              ¿Suspender este pase?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              El pase será suspendido temporalmente. Podrás reactivarlo después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-600 dark:text-gray-300">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSuspend}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Suspender
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              ¿Cancelar este pase?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción cancelará permanentemente el pase. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-600 dark:text-gray-300">
              Volver
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Cancelar Pase
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
